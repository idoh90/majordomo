-- ---------------------------------------------------------------------------
-- 0007 — the Google Calendar bridge's handoff, and the hole it closes.
--
-- Paste into the Supabase SQL editor BY HAND, like every migration here, and
-- IN FULL. Nothing runs this automatically. Requires 0006_gcal.sql first —
-- this table is the antechamber to that one.
--
-- WHY IT EXISTS.
--
-- 0006 shipped a consent walk whose callback took the household's identity out
-- of the signed `state` parameter. The signature was sound; the conclusion was
-- not. A state proves who STARTED the walk, and that is exactly who the
-- attacker is: sign up, ask the endpoint for a consent URL, and send that
-- genuine accounts.google.com link to somebody else. The victim sees Google's
-- own screen on Google's own domain, approves with their own account, and
-- their refresh token is filed in `gcal_accounts` under the SENDER's user id —
-- who can then read every calendar they have, for as long as Google honours
-- the grant. Nothing in that walk ever established the one identity that
-- mattered: the browser that FINISHED it.
--
-- So the callback no longer files anything. It parks the grant here and hands
-- the finishing browser a one-use secret; that browser spends the secret
-- against `/api/google` with its OWN bearer token, and only then does a row
-- appear in `gcal_accounts`, under the id that token verifies to. This table
-- is the whole of the gap between the two halves.
--
-- AND THE MIRROR IMAGE, WHICH IS WHY THERE IS A `walk_hash`.
--
-- The handoff alone moves identity from the state to the session, and that
-- answers WHOSE TOKEN this is. It leaves the other half of the same root cause
-- standing: nothing ties the walk to the browser that STARTED it. So the attack
-- simply runs backwards. The attacker approves at Google with their OWN
-- account, is redirected to `/?gcal=pending&n=…`, and does not follow it — they
-- send that finished link to a signed-in victim, whose app spends the secret
-- under ITS session. The attacker's calendar is now filed under the victim's
-- household: the victim's own bookings are pushed out to a stranger's calendar
-- on the next sync, and the stranger's events are mirrored into their Manor.
--
-- So a walk is bound to one tab. Before asking for a consent URL the client
-- mints a walk secret and keeps it in sessionStorage — one tab's business, dead
-- when the tab is — and sends only its sha256. That hash rides in the signed
-- state, lands in the column below, and the claim has to present the RAW secret
-- beside `n`. A browser handed a link it did not earn holds no walk secret and
-- never claims at all. Neither half of this works alone: the session decides
-- whose connection it becomes, the walk secret decides whether this browser was
-- entitled to ask.
--
-- WHAT A ROW IS.
--
-- A live Google refresh token, in the open, for at most ten minutes. Treat it
-- with `gcal_accounts`'s manners and then some: RLS on with ZERO policies, the
-- grants revoked underneath it, and `api/google.ts` holding the service_role
-- key as the only door. The app never sees this table; it never sees a refresh
-- token at all.
--
-- WHAT IS DELIBERATELY NOT A COLUMN: a user id. There is no household attached
-- to a parked grant, because attaching one is the bug — the whole point of the
-- exercise is that at the moment this row is written, nobody yet knows whose
-- connection it will become. The claim decides that, from a bearer token, and
-- the answer is never stored here for it to disagree with.
--
-- IF THE BRIDGE WAS EVER ARMED BEFORE THIS LANDED, rows in `gcal_accounts`
-- cannot be told apart: an honest connection and a captured one look identical
-- once written. On a household of one that is a shrug. On anything with public
-- sign-up, the cautious act is `delete from gcal_accounts;` and one reconnect
-- each — which costs a walk through the consent screen and nothing else, since
-- the app's own calendar mirrors rebuild from Google on the next sync.
--
-- Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists gcal_pending (
  -- sha256 of the claim secret, hex. NEVER the secret itself: a read of this
  -- table — a leaked backup, a mistaken grant, an evening in the SQL editor —
  -- must not yield anything that can be spent. The endpoint hashes what the
  -- browser presents and looks the row up by the result.
  claim_hash    text        primary key,
  -- the credential in question, waiting to be filed
  refresh_token text        not null,
  -- sha256 of the WALK secret, hex — the one the finishing browser minted into
  -- its own sessionStorage before the walk began, carried here off the signed
  -- state. NOT NULL, and that is load-bearing rather than tidy: a row that
  -- cannot prove which walk it belongs to is a row that must never have
  -- existed. It would be a live refresh token claimable by anyone holding the
  -- redirect's `n` — a request log, a browser history, a forwarded link — which
  -- is precisely the mirror-image attack above. A nullable column would let one
  -- forgotten insert re-open it silently, and nothing downstream would notice.
  walk_hash     text        not null,
  google_email  text,
  created_at    timestamptz not null default now(),
  -- the claim is refused past this, and the sweep below removes it. Set by the
  -- endpoint rather than defaulted here, so the window lives in one place with
  -- the rest of the walk's timings (CLAIM_TTL_MS in api/google.ts).
  expires_at    timestamptz not null
);

-- The idempotent belt for a HALF-APPLIED paste. `create table if not exists`
-- does nothing to a table that already stands, so an estate that ran an earlier
-- draft of this file would keep a `gcal_pending` with no walk binding and never
-- learn of it. The repair for a row written before the binding existed is to
-- DROP it, not to invent a hash it never had: a pending row is a ten-minute
-- credential and never history, and the cost of losing one is a reconnect.
alter table gcal_pending add column if not exists walk_hash text;
delete from gcal_pending where walk_hash is null;
alter table gcal_pending alter column walk_hash set not null;

-- The sweep's index. `api/google.ts` deletes everything past its expiry on
-- every callback — an abandoned walk's row is not litter, it is a live refresh
-- token nothing else has a reason to look at again — and that sweep is the
-- only query in this schema that does not go through the primary key.
create index if not exists gcal_pending_expiry_idx on gcal_pending (expires_at);

-- ---------------------------------------------------------------------------
-- Row-level security: nobody. 0006's reasoning, and it applies harder here —
-- that table holds a credential per household, this one holds a credential
-- that has not yet been assigned to a household at all. RLS on with no
-- policies refuses every anon and authenticated request; service_role bypasses
-- RLS by Postgres convention and is the single intended reader and writer. The
-- revoke is the belt over those braces — a credential table should refuse
-- twice.
-- ---------------------------------------------------------------------------

alter table gcal_pending enable row level security;

revoke all on gcal_pending from public;
revoke all on gcal_pending from anon;
revoke all on gcal_pending from authenticated;
