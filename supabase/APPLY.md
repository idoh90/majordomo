# The registry, by hand

Nothing in this repository runs a migration. There is no Supabase CLI wired up,
no CI step, no `db push` — every file in `migrations/` is applied by opening the
Supabase SQL editor and pasting it in. That is a deliberate cost: this is a
single-user estate whose whole promise is that the device works alone, and a
deploy pipeline that can rewrite the schema is a machine that can break it
while nobody is watching.

The price is that a paste can be partial, and a partial paste is the single
worst failure mode this project has. It does not error. The tables land, a
grant does not, and the endpoint serves happily for a week while a door that
looks locked is standing open. That is what `verify.sql` is for.

**Project:** `majordomo`, ref `xigbgvuakguqmfulfaqe`
**Editor:** Supabase dashboard → SQL Editor → new query

---

## Before anything: is the project awake?

A free Supabase project pauses after ~7 days idle, and **a paused project's API
hostname stops resolving at all** — `DNS name does not exist`, which is
indistinguishable from a deleted project and has already been misdiagnosed as
one at the cost of an evening. If sign-in says the server cannot be found, open
the dashboard first. The data is intact; resuming takes about two minutes.

`.github/workflows/keep-supabase-awake.yml` runs one real query a day to stop it
happening. It needs the `SUPABASE_ANON_KEY` repository secret and fails loudly
rather than silently if that is unset.

---

## The order, and what each file needs

Every file is idempotent — safe to re-run — and each assumes the ones above it
have run. Paste **the whole file**, never a fragment of one.

| | file | what it builds | needs |
|---|---|---|---|
| 1 | `0001_records.sql` | the estate's own table, its RLS, its push RPC, the two-clock stamp trigger | — |
| 2 | `0002_user_id_default.sql` | `records.user_id` defaults to the caller | 0001 |
| 3 | `0003_bell.sql` | the Bell's usage tables and daily ceiling | — |
| 4 | `0004_shares.sql` | crews: the second namespace, its RLS, `create_share` / `join_share` / `push_share_records` | 0001 (reuses `stamp_record`) |
| 5 | `0005_bell_reserve.sql` | the Bell's reserve-before-spend meter | 0003 |
| 6 | `0006_crew_roles.sql` | the crew's door policy, waiting room and ranks | 0004 |
| 7 | `0007_standing.sql` | **a rank that survives leaving and rejoining** | 0006 |
| 8 | `0008_code_privacy.sql` | **the code is the keeper's — and can be rotated** | 0007 |
| 9 | `0009_one_door.sql` | **the push RPC becomes the only way into `share_records`** | 0008 |

Then, always: paste `verify.sql` and read the rows. Failures sort to the top.
Every row is one thing that must be true; the note on each says what breaks if
it isn't.

### Forward only. Never re-paste an earlier file after a later one.

Every file here is safe to paste **again**, and that is the retry to reach for
when a paste might have been partial — pasting `0006` twice is a no-op, and it
restates the crew's whole security model, so "if in doubt, paste 0006 again" is
sound advice.

Pasting an **earlier** file after a later one is a different act and is not
supported. 0006 deliberately replaces things 0004 built: `is_share_member`
gains its active-member check, the blanket `for all` policy on `share_records`
is dropped in favour of read-vs-write, and `join_share` grows a return column.
Re-pasting 0004 on a database where 0006 has run puts the **loosened** versions
back — a guest becomes a writer again — and then aborts partway with
`cannot change return type of existing function`. Postgres shouting on the last
of those three is luck, not a safety net.

So: if the schema needs rebuilding, go `0001 → 0007` in order, in one sitting.
If one file needs re-applying, re-apply it **and everything after it**.

---

## Proving it before it goes anywhere near the hosted project

```
npm run check:registry
```

Stands up a throwaway Postgres, applies every migration in order against a
Supabase-shaped fixture (`tests/prelude.sql` — the `auth` schema, a steerable
`auth.uid()`, the three PostgREST roles), re-pastes the newest one to prove a
retry is a no-op, then runs `verify.sql` and `tests/crew.sql` over the result.
Nothing is left running and it holds no credentials for the real project.

`tests/crew.sql` is the one that matters: two accounts, every rank, every
refusal — a hand writing, an applicant reading nothing, a guest silently
filtered out of an UPDATE, the keeper unable to rename anyone or demote
themselves, and disbanding still cascading through the keeper's own guarded row.
Its own hard-won lesson is written at the top of the file: **an RLS-filtered
UPDATE is not an error.** It matches no visible rows and reports success, so "it
did not raise" proves nothing about a write policy. Every denial is attempted as
the role and then checked as the superuser, against the state itself.

It needs Postgres binaries on the machine (`brew install postgresql@16`, or
`apt-get install postgresql`); `PG_BIN=/path/to/bin` points at them if they are
not on PATH. Without them the harness says so and exits rather than pretending.

This is worth the two minutes. Its first run found `join_share` raising
`column reference "share_id" is ambiguous` on every single call — which is to
say nobody could join any crew at all — in a migration that read perfectly, and
had simply never been executed.

## What 0009 changes, in one paragraph

`push_share_records` stamps `author_id` from `auth.uid()`, and the client's fold
trusts that stamp to decide whose work a ledger entry records — it is the whole
reason a crewmate cannot sign somebody else's name to an afternoon. It was only
ever worth anything if the RPC was the ONLY door, and it was not: the function
ran as the caller, and Supabase's default privileges hand `authenticated` every
column of every new table, which 0004 never revoked. A hand could insert rows
with any `author_id` they liked, re-stamp existing ones, and hard-DELETE records
— which is the quiet one, because a deletion with no tombstone leaves nothing
for a cursor-based pull to carry, so the record vanishes for the pusher and
lives forever on every other device. 0009 revokes the table writes and makes the
RPC `security definer` with an explicit `is_share_writer` check, since under
DEFINER the row policies are no longer what refuses a guest. The policies stay
anyway. Two smaller things ride along: `gen_share_code` draws from
`gen_random_uuid()` rather than `random()` — a join code is the sole write
credential for an open crew, and `random()` is not a cryptographic generator —
and `join_share` / `create_share` now trim and cap the roster label at 40
characters and refuse an empty one, matching `rename_member`, because a label is
written into every crewmate's localStorage and nothing bounded it.

## What 0008 changes, in one paragraph

The join code had two faults and they are the same fault twice. EVERY MEMBER
COULD READ IT — `member reads share` grants the whole row, and the row carries
the code — so a guest, the rank that exists to change nothing, could copy the
invite link and hand it to a stranger, whom `join_share` then seats as a HAND.
A read-only member could mint writers. And A LEAKED CODE WAS PERMANENT: 0006
revoked the table UPDATE on `shares` so that nobody could rewrite a code, which
included the keeper, so the only answer to a code in the wrong group chat was to
disband the crew and rebuild it. Both are fixed the way this schema always fixes
a rule about one column: `code` leaves the SELECT grant entirely and comes back
only through `share_code()`, which answers the keeper and nobody else, while
`rotate_share_code()` draws a new one with the table grant still shut. Rotation
evicts NOBODY — standing lives on the roster and is never re-derived from the
code — so the crew wakes up exactly as it was and only the links already in the
world stop working. The third function is fallout: the client used to change a
display name by re-knocking with the held code, which only worked because every
member held one, so `rename_member()` gives that its own narrow door — one
column of the caller's own row, chosen by `auth.uid()` rather than by an
argument, exactly like `leave_share`.

## What 0007 changes, in one paragraph

A rank nobody can escape is the whole point of having one, and 0006 left two
ways out. Leaving a crew was a DELETE of your own roster row, and `join_share`
seats anyone it does not already know as a `hand` — so a guest demoted by the
keeper could press LEAVE, type the code back in (every member can read it), and
return an active writer; and a removed member could walk straight back into an
open crew. A roster row is therefore never deleted now. It changes STANDING:
`pending` · `active` · `left` · `removed`. Leaving goes through a new
`leave_share()` function rather than plain DML, because a member has to change
exactly one column of their own row and RLS has no column granularity — a policy
wide enough to let them step away would be wide enough to let them write their
own rank. Removing someone, and turning an applicant away, both become
`status = 'removed'`, which the keeper's existing UPDATE policy already allows.
The DELETE policy on `share_members` is dropped entirely; disbanding still
clears the roster through the FK cascade, which does not consult RLS, and the
harness proves that on every run rather than taking it on trust.

## What 0006 changes, in one paragraph

`shares` gains `visibility` (`open` — the code admits, as before — or `vetted`
— the code applies and the keeper admits). `share_members` gains `role`
(`keeper` / `hand` / `guest`) and `status` (`pending` / `active`).
`is_share_member()` now means an **active** member, so an applicant waiting at
the door reads nothing at all; a new `is_share_writer()` means an active keeper
or hand, and that is what the `share_records` write policies check. The single
`for all` policy 0004 wrote is **dropped** — it has to be, because it cannot
express "read is membership, write is rank", and while it stands a guest is a
guest in name only. `join_share` grows a second return column and so has to be
dropped and recreated rather than replaced. Two grants are load-bearing and
easy to lose in a partial paste: `update (visibility) on shares` and
`update (role, status) on share_members`, each preceded by a `revoke update` of
the table-level grant — RLS has no column granularity, so without them the
keeper's UPDATE policy is also a licence to rename people.

---

## After it lands: the two-account pass

The client side of all this has been exercised against seeded local data in a
real browser, but **nothing has made a round trip to the live registry.** These
five need two signed-in accounts and about ten minutes.

1. **Open a crew.** Account A: Workshop → THE CREWS → OPEN TO A CREW on a
   venture. A code appears. COPY LINK.
2. **Open door.** Account B: paste the link (or type the code into THE CREWS).
   B should be on the roster immediately, as a **hand**, with the venture on
   their shelf and the board writable.
3. **Vetted door.** Account A: switch the door to BY APPROVAL. Account B leaves,
   then joins again — B should be told the application is with the keeper and
   should see **nothing** of the venture. A should see B at the door. ADMIT.
   B's device notices on its next cycle (see the caveat below).
4. **Ranks.** Account A: demote B to **guest**. B's board should lose its hang
   button, its twine and its ticks, and say so in a line. Then have B try to
   change something anyway — the registry must refuse it even if the client is
   persuaded not to.
5. **Turn away.** Account A: with the door vetted, have B apply and then TURN
   AWAY. B should get a "not taken up" line they can dismiss, not a silent
   disappearance.
6. **The code is the keeper's.** Account B (any rank below keeper) should see a
   line where the code used to be, and no COPY buttons. If B's device was on an
   older build it will have a code cached in localStorage — it should disappear
   on the next sync cycle, not linger.
7. **Rotation.** Account A: COPY LINK, then NEW CODE. The old link, opened in a
   signed-out browser, must be refused; the new one must work; and B, who was
   already on the crew, must still be on it and still able to write.

### One caveat worth knowing before it looks like a bug

**An applicant is not notified in real time.** Realtime is scoped by the same
RLS as everything else, so someone with no standing on a crew cannot subscribe
to it. B learns they were admitted on their next sync cycle — which fires on
tab focus, on coming back online, and on any local edit. In practice: switch
away from the tab and back. It is not instant and it is not broken.

---

## What is NOT needed

- **No new environment variables.** 0006 adds none. The Bell's three server
  secrets (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BELL_ENABLED`) are
  untouched, and so is the `VITE_*` pair the client build already needs.
- **No change to the anon key.** It is public by design and RLS is the guard.
- **No Auth settings change.** No new origin, no new redirect URL.
- **No data migration.** The one `update` in 0006 is the keeper backfill, and it
  only states what existing rows already were.
