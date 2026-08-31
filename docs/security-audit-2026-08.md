# Majordomo — pre-launch security audit

Source review of `idoh90/majordomo` at `2d8b460`, 31 Aug 2026.
Method: seven web-research passes (157 checkable vulnerability patterns for this
stack, from RFCs, GitHub Security Advisories, CVEs and 2024–2026 incident
writeups) followed by fourteen code-review passes against them, each finding
verified against the source before it was kept.

Severity is real-world launch risk for a consumer app, not CVSS.
**Critical** = other users' accounts or data, no exotic preconditions ·
**High** = the same with preconditions, or money, or regulatory exposure ·
**Medium** = an unlikely chain, or only the attacker's own data ·
**Low** = hardening.

Counts: 1 critical · 3 high · 12 medium · 8 low · 6 refuted on verification.

---

## The short version

**One finding should stop the Google Calendar launch.** The OAuth callback decides
whose account a Google refresh token belongs to by reading it out of the `state`
parameter, and nothing checks that the browser completing the walk is that person.
An attacker sends a genuine Google consent link; the victim approves with their own
account; the victim's calendar lands in the attacker's estate. The victim sees nothing.

**Two more should be fixed before the shared-venture feature has real users.**
Crew members can write the shared table directly, bypassing the function that stamps
authorship. And pressing *Kick* removes a member's row but not their invite code.

**The client-side code is genuinely well defended.** No XSS route, a proper URL
scheme allow-list, key-allow-listed backup import, zero production dependency
advisories. The exposure is concentrated in the server seam, in Postgres, and in the
operational process around hand-pasted migrations.

---

## Findings

| ID | Sev | Area | Finding |
|---|---|---|---|
| GCAL-01 | Critical | OAuth | Anyone can capture a stranger's Google Calendar into their own account |
| SHARE-01 | High | Shares | Crew members write the shared table directly and can forge authorship |
| SHARE-02 | High | Shares | Kicking a crew member removes nothing — the code still works |
| OPS-01 | High | Process | Nothing can prove which migrations are actually applied |
| OAUTH-02 | Medium | OAuth | No PKCE on the Google flow, though the app's own sign-in uses it |
| OAUTH-03 | Medium | OAuth | A signed state is reusable for ten minutes and never consumed |
| LOG-01 | Medium | Logging | OAuth codes and states written to the function log on any timeout |
| GCAL-04 | Medium | OAuth | The attached Google account is never recorded |
| SHARE-03 | Medium | Shares | Invite codes come from a non-cryptographic RNG |
| BELL-01 | Medium | The Bell | Hanging up early hands the slot back; the ceiling is evadable |
| BELL-02 | Medium | The Bell | No per-IP, burst or fleet-wide cap anywhere |
| NODE-01 | Medium | Bridge | A hung-up socket can wedge an invocation until the 60 s ceiling |
| NODE-02 | Medium | Bridge | Caller disconnects never reach the handler |
| GCAL-02 | Medium | Calendar | A stranger's meeting invite is an unbounded write into the estate |
| RLS-01 | Medium | Postgres | `push_records` is the one function left callable by `anon` |
| CSP-01 | Medium | Headers | The CSP trusts every Supabase project on the internet |
| NODE-03 | Low | Bridge | The 1 MB body guard never runs on Vercel |
| NODE-04 | Low | Bridge | Request URL built from unvalidated forwarded headers |
| PWA-01 | Low | SW | Opaque responses are cacheable for the FX feed |
| PWA-02 | Low | SW | The legal-page denylist misses several spellings |
| CSP-02 | Low | Headers | No HSTS, Permissions-Policy or COOP |
| SESSION-01 | Low | Auth | Signing out leaves the estate readable on the device |
| BELL-03 | Low | The Bell | Callers supply the whole conversation, forged butler turns included |
| DEPS-01 | Low | Supply chain | Four high advisories in build-time packages |

---

### GCAL-01 — Cross-account Google Calendar capture  · **Critical**
`api/google.ts:256–290`

```ts
const state = readState(url.searchParams.get('state') ?? '')
if (!state) return bounce(CANONICAL, 'error')
...
await table().upsert(
  { user_id: state.u, google_email: ..., refresh_token: grant.refresh_token },
  { onConflict: 'user_id' },
)
```

The HMAC is well built — domain-separated, `timingSafeEqual`, length-checked, expiry
and origin validated. That is not the problem. The signature proves who *started*
the walk, and in this attack the attacker started it.

1. Attacker signs up (free, self-serve) and signs in.
2. POSTs `{action:'begin'}`, receives a consent URL with a `state` signed for *their* id.
3. Sends the link to the victim. It is a real `accounts.google.com` URL showing the
   real Majordomo consent screen.
4. Victim approves with their own Google account.
5. Google redirects to `/api/google?code=<victim's>&state=<attacker's>`; the server
   stores the victim's refresh token under `user_id = attacker`.
6. Attacker reads the victim's calendars. `calendar.events.readonly` covers all of them.

GCAL-04 means no email is ever recorded, so neither party can see whose calendar is
attached to what. OAUTH-03 means one minted link harvests everyone who clicks it
within ten minutes.

**Preconditions.** `GCAL_ENABLED` armed. While the consent screen is in Testing mode
only added test users can be victims — a limit that disappears exactly when the
feature ships.

**Fix.** Do not complete the link at the callback. Park the grant against a one-time
nonce, redirect to `/?gcal=pending&n=<nonce>`, and have the signed-in app POST to
claim it, taking `user_id` from the verified bearer token. Add PKCE as the second
defence; delete the nonce on first use.

---

### SHARE-01 — Crew members can forge authorship  · **High**
`supabase/migrations/0004_shares.sql:135`

The migration asserts: *"`author_id` is stamped from auth.uid() so a client cannot
sign a partner's name to its own edits."* That holds only through
`push_share_records`. The table's own policy is:

```sql
create policy "members carry records" on share_records
  for all using (is_share_member(share_id))
       with check (is_share_member(share_id));
```

Supabase grants `authenticated` full DML on public tables by default, and — unlike
`gcal_accounts` and `bell_month_totals`, which both get an explicit `revoke all` —
this table never gets one. Any member can skip the RPC with a plain PostgREST call,
set `author_id` to any crew member, and bypass the LWW guard. `for all` also covers
hard `DELETE` of every record in the share.

**Fix.**
```sql
revoke all on share_records from anon, authenticated;
grant select on share_records to authenticated;
drop policy if exists "members carry records" on share_records;
create policy "members read records" on share_records
  for select using (is_share_member(share_id));
```
`push_share_records` is `security invoker`, so it needs `security definer` with an
internal membership check once the grant is gone — or keep the grant and add
`with check (author_id = auth.uid())`, the smaller change, which still leaves
direct deletes open.

---

### SHARE-02 — Kicking removes nothing  · **High**
`src/core/sync/shareTransport.ts:206`

```ts
export async function kickMember(shareId: string, userId: string): Promise<void> {
  const { error } = await sb.from('share_members').delete()
    .eq('share_id', shareId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}
```

The membership row goes; the invite code does not change. `join_share`'s
`on conflict do update` re-adds the same person silently. There is no code rotation
anywhere in the codebase. The Workshop's ShareSheet presents this as removal, with a
confirmation dialog — a user who removes someone after a falling-out has been told
something untrue by their own app.

**Fix.** Rotate the code on kick, in the same transaction, through a definer function
only the owner may call. Disband already works correctly (it deletes the share row and
cascades), so the shape exists.

---

### OPS-01 — Nothing proves which migrations are applied  · **High**

Every migration is applied by pasting into the Supabase SQL editor. The code in the
repo is correct — I read all six files and the RLS they define is sound. What nobody
can verify from here is that production matches. The failure modes are silent:

- If 0001's `create policy "own rows"` never ran, every estate is world-readable
  through the public anon key, and nothing looks wrong until the second user signs up.
- If 0003's `enable row level security` did not land — it sits 68 lines below the
  table it protects — the metered party can edit their own meter.
- If 0005's grants did not land, the Bell refuses every ring. That one fails safe,
  which is the exception rather than the rule.

**Fix.** Process, not code. Run Supabase's Security Advisor and fix what it reports.
Write one verification query asserting the expected policies, grants and RLS flags,
and run it after every paste and on a schedule — the keep-awake workflow already runs
a daily query and is the natural home.

---

### OAUTH-02 — No PKCE on the Google flow  · **Medium**
`api/google.ts:372–386`

The authorization URL sets `response_type`, `scope`, `access_type`, `prompt`,
`include_granted_scopes` and `state` — no `code_challenge`. RFC 9700 §4.5.3.2
recommends PKCE for confidential clients precisely because it survives a broken state
check. The app's own Supabase sign-in already sets `flowType: 'pkce'`
(`src/core/auth/client.ts`), so the knowledge was in the building.

PKCE alone would not stop GCAL-01 — the attacker initiates and holds the verifier.
It is the second layer, not the fix.

### OAUTH-03 — State is a reusable bearer credential  · **Medium**
`api/google.ts:108, 150–169`

`readState` checks MAC, expiry and origin, but never records that a state was used and
there is no nonce table. Within ten minutes the same state completes as many callbacks
as it is handed — removing the natural rate limit a single-use state would impose on
GCAL-01. The nonce table that fixes GCAL-01 fixes this too.

### LOG-01 — OAuth material in function logs  · **Medium**
`api/_node.ts:226, 236`

```ts
console.error(`[api] ${req.method} ${req.url} produced no response in ${deadlineMs}ms`)
console.error(`[api] ${req.method} ${req.url} threw:`, ...)
```

For `/api/google` the URL *is* `?code=…&state=…`. A slow token exchange or registry
write (8 s and 6 s budgets against a 20 s deadline) puts a live authorization code and
a still-reusable state into Vercel's log store — which has weaker access controls than
the `gcal_accounts` table this design otherwise protects carefully.

**Fix.** Log `new URL(req.url).pathname`, never the query string.

### GCAL-04 — The attached Google account is never recorded  · **Medium**
`api/google.ts:81–84, 222–234, 279`

`google_email: emailFromIdToken(grant.id_token)` — but `SCOPES` requests only
`calendar.app.created` and `calendar.events.readonly`. Without `openid`/`email` Google
returns no `id_token`, so `emailFromIdToken` takes its early return and every row's
`google_email` is null. The one surface that would name the connected account shows a
dash. This is the cheapest detection control for every account-binding problem above.

**Fix.** Add `openid email` to `SCOPES`, or call `tokeninfo` once after the exchange,
and show the address in the app.

### SHARE-03 — Non-cryptographic invite codes  · **Medium**
`supabase/migrations/0004_shares.sql`

```sql
a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
for i in 1..8 loop
  c := c || substr(a, 1 + floor(random() * 31)::int, 1);
end loop;
```

31⁸ ≈ 8.5×10¹¹ (~39.6 bits) — respectable against blind guessing, but with no rate
limit on `join_share` the entropy is doing all the work. The sharper issue is
`random()`: a seeded PRNG, not `gen_random_bytes`, and an attacker can mint codes to
observe it.

**Fix.** `c := c || substr(a, 1 + (get_byte(gen_random_bytes(1), 0) % 31), 1);`
plus a failure-rate limit on `join_share`.

### BELL-01 — Early hang-up returns the slot  · **Medium**
`api/bell.ts:520–540`

```ts
if (tokIn === 0 && tokOut === 0) {
  await db.rpc('bell_release', { p_user: user.id, p_day: today })
  return
}
```

The intent is right — a ring that never reached `message_start` should not cost a
slot. But the condition is reachable on purpose: SSE headers return before the first
upstream event, so a caller can accept headers, wait 100 ms and disconnect;
`sendBody`'s `res.on('close')` cancels the reader, `cancel()` runs `settle()`,
`tokIn` is still zero, the slot comes back.

*Calibrated down from the sweep's "high".* The attacker gets no completion — any reply
means `tokIn > 0`. This is unbounded *attempts*, i.e. denial of wallet, not theft of
service.

**Fix.** Release only when the upstream itself failed; distinguish "never sent" from
"sent, caller left".

### BELL-02 — No per-IP, burst or fleet cap  · **Medium**
`api/bell.ts:312, 431`

The only ceiling is per-user-per-UTC-day. Accounts are free and self-registered, so N
accounts buy N allowances. Reachable without any account: every unauthenticated POST
drives one outbound call to the Supabase Auth server before it can be rejected, with
no rate limit ahead of it — a lever pointed at a free-tier project the Bell depends on.
Nothing reads `bell_month_totals`, so fleet spend is unmonitored.

**Fix.** Per-IP token bucket ahead of `verifyUser`; a global daily ceiling that trips
the kill switch; an alert on `bell_month_totals`; email confirmation on signup.

### NODE-01 — A hung-up socket wedges the invocation  · **Medium**
`api/_node.ts:183`

```ts
if (!res.write(Buffer.from(value))) {
  await new Promise<void>((resolve) => res.once('drain', resolve))
}
```

A destroyed socket never emits `drain`. `res.on('close')` cancels the reader but
nothing resolves this promise, and the deadline has already been raced away. The loop
waits until the 60 s `maxDuration` ceiling — the exact failure class the file exists
to prevent, one layer up.

**Fix.** Race drain against `close` and `error`.

### NODE-02 — Disconnects never reach the handler  · **Medium**
`api/_node.ts:211–215`

`new Request(...)` is built with no `signal`, and nothing wires `res.on('close')` to
one. For the whole pre-response window a departed caller is invisible; the Bell keeps
its reservation and rings the upstream for a reply nobody will read.

**Fix.** `const ac = new AbortController(); res.on('close', () => ac.abort())`, pass
`ac.signal` into the Request, and have `bell.ts` compose `request.signal` with its own
deadline the way it already does at line 159.

### GCAL-02 — A stranger's invite writes into the estate  · **Medium**
`src/app/gcal/mapping.ts:103–110`

Google adds unsolicited invitations to the primary calendar by default, so anyone who
knows a victim's email can place text and a time block into their estate — which then
rides estate sync to every device.

The mapping is otherwise tight: only `summary` is taken, dates are validated and
inverted ranges rejected, and description/location/organizer/attendees are ignored.
React escapes the text, so this is not XSS. What is missing is a length cap. The
forward risk is larger: once the Bell gains its context pack this text reaches a model
prompt — textbook indirect prompt injection.

**Fix.** `.slice(0, 200)` on the title, a cap on mirrored events per pull, and fenced
untrusted text in the prompt when the context pack ships.

### RLS-01 — `push_records` is callable by `anon`  · **Medium**
`supabase/migrations/0001_records.sql:80`

PostgREST publishes every function it can see and the default grant is `PUBLIC`. Every
other RPC here is revoked and re-granted explicitly; `push_records` is the one that was
missed. Not a data path today — `security invoker`, `auth.uid()` null for `anon`, the
`with check` refuses and `user_id` is `NOT NULL` — but it is an unauthenticated entry
point into the estate's write function, one RLS slip from mattering.

Related: no function in 0001/0004/0005 pins `search_path`, and the two definer helpers
pin `= public` rather than `= ''` with schema-qualified bodies. Supabase's Security
Advisor reports this at error level on eight functions.

**Fix.**
```sql
revoke execute on function push_records(jsonb) from public, anon;
grant  execute on function push_records(jsonb) to authenticated;
alter function push_records(jsonb) set search_path = '';
```

### CSP-01 — The CSP trusts every Supabase project  · **Medium**
`vercel.json`

`connect-src 'self' https://*.supabase.co wss://*.supabase.co …`

The policy's stated purpose is right: defend against a build-time dependency that one
day reads `localStorage` — where the Supabase session lives by design — and posts it
somewhere. But a wildcard over `*.supabase.co` means any attacker can stand up a free
Supabase project as the exfiltration endpoint. The defence has a hole the shape of its
own threat model. The project ref is already a constant in the bundle, so nothing is
lost by naming it exactly.

---

### Low

- **NODE-03** `MAX_BODY_BYTES` is checked only in the stream-reading branch of
  `bodyOf`. On Vercel `@vercel/node` pre-parses the body into `req.body`, so the guard
  never runs. Bounded by the platform's own limit; the stated control does not exist.
- **NODE-04** `urlOf()` builds the URL from unvalidated `x-forwarded-host` /
  `-proto`. Nothing trusts it *today* — but that is a statement about current handlers,
  not an invariant, and this file fronts both secret-holding endpoints.
- **PWA-01** `cacheableResponse: { statuses: [0, 200] }` on the FX rule. Status 0 is an
  opaque response; a captive portal or interfering proxy gets one cached for 24 h and
  served whenever the network fails. Use `[200]`. (The deliberate *absence* of a Twelve
  Data rule is correct and worth keeping.)
- **PWA-02** `navigateFallbackDenylist: [/^\/api\//, /^\/privacy$/, /^\/terms$/]` misses
  `/privacy/`, `/privacy.html`, `/privacy?x=1` and a bare `/api` — given `cleanUrls`,
  all reachable. Use `[/^\/api(\/|$)/, /^\/(privacy|terms)(\.html)?\/?($|\?)/]`.
- **CSP-02** No `Strict-Transport-Security`, `Permissions-Policy`, COOP or CSP
  reporting. Vercel may add HSTS on custom domains; confirm with
  `curl -I https://majordomocal.com` before changing anything.
- **SESSION-01** Sign-out deliberately leaves the estate on the device. Coherent for an
  offline-first app, but it does not do what the word suggests on a borrowed device
  holding body weight, sleep and financial records. Disclose it and offer a separate
  "remove this estate from this device".
- **BELL-03** Callers supply the `assistant` turns too, so system-prompt instructions
  can be talked past. At B0 the payoff is a model proxy capped at five rings a day.
  Stops being Low the moment write tools land. `BELL_MAX_CHARS` also bounds UTF-16
  code units, not tokens (~4× understated).
- **DEPS-01** `npm audit` reports four high advisories (`postcss`, `nanoid`,
  `brace-expansion`, `fast-uri`) — all transitive dev dependencies.
  `npm audit --omit=dev` → **0 vulnerabilities**. No user-facing exposure; worth
  clearing so the signal stays readable.

---

## Refuted on verification

- **Future-dated timestamps cannot poison a shared record.** `stamp_record()` clamps
  with `least(new.client_updated_at, clock_timestamp())`, and 0004 attaches the same
  trigger to `share_records`.
- **Link cards cannot carry `javascript:` URLs.** `src/modules/workshop/url.ts` is an
  allow-list applied at render as well as save, and refuses to re-parse a string that
  already carried a rejected scheme. Correct construction.
- **A malicious backup cannot write arbitrary storage keys.** `parseEstate`
  allow-lists against `ALL_KEYS` and requires string values, so `__proto__` is refused
  by name. It *can* still set values within a permitted store (e.g. pre-stamping
  `termsAccepted`) — worth a schema check later, but not the primitive it looked like.
- **Invite codes do not leak into telemetry.** `initJoinGate()` strips `?join=` before
  `initTelemetry()` runs; I checked the ordering in `src/app/boot.tsx`.
- **"Disconnect" probably does revoke orphaned Google tokens.** It calls
  `https://oauth2.googleapis.com/revoke` before deleting the row. Whether that clears
  tokens from *earlier* consents depends on how Google groups repeat consents into
  grants — genuinely ambiguous; worth one live test.
- **The estate's RLS is correct as written.** `for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id)` covers insert, update and delete. The half-paste
  risk is real but belongs to process — filed as OPS-01.

## Already solid

The Bell's meter (reserve-before-spend; RLS read-only with no write policy; all three
`bell_*` functions revoked from `anon`/`authenticated` and granted only to
`service_role`; fails toward refusing service rather than toward an unlimited
allowance). Google refresh-token custody (`gcal_accounts` RLS-on-zero-policies plus
explicit `revoke all`). No HTML-injection route anywhere in `src/`, `public/`,
`scripts/` or the HTML entries. The shares schema's recursion breakers, which read
`auth.uid()` internally rather than taking a user id as an argument. Zero production
dependency advisories. PKCE on the app's own sign-in.

## Launch risks that are not bugs

- **Deletion is a mailbox.** No in-app deletion; every GDPR Art. 17 request is manual,
  on a one-month clock, with no audit trail. Art. 15 and Art. 20 have the same shape.
- **Health and financial data, no age gate.** Body weight, sleep and balances. GDPR
  Art. 9 needs an explicit basis beyond ordinary consent. Decisions for a lawyer.
- **The tracker-free claim is defensible but soft.** The copy discloses Vercel Web
  Analytics honestly, and PostHog really is absent from the public pages. But Vercel
  derives a visitor hash from IP + UA, so "stores no personal data" is stronger than
  the mechanism supports, and `startAnalytics()` runs on `/terms` and `/privacy` with
  no consent gate.
- **A free-tier registry, no backups, no alerting.** The project pauses after seven
  idle days; the keep-awake workflow notes its own weakness (GitHub disables schedules
  in a repo quiet for 60 days). No registry backup, no monitoring, no
  breach-notification path — GDPR allows 72 hours.
- **Every secret in one Vercel project, no rotation plan.** Rotating
  `GOOGLE_CLIENT_SECRET` breaks every in-flight consent walk, because the same secret
  keys the state HMAC. Cheap to separate now, awkward during an incident. Also: preview
  deployments inherit env vars while sitting outside `ALLOWED_ORIGINS`.

## Coverage and limits

The automated sweep hit a platform session limit partway through. Five of fourteen
review passes completed (the Bell, the Node bridge, the OAuth endpoint, the estate's
RLS); nine did not, and every downstream verification, attack-chain and completeness
pass failed. All five completed passes were verified by hand against the source, and
the shares schema, service worker, CSP, supply chain, telemetry and legal copy, the
backup-import path and the Google client were covered manually. **Genuinely thinner
than it should be:** the sync engine's merge and conflict handling, the Study and
Ledger modules, and the landing page's demo mode.

**Not checkable from the repository:** which migrations are applied to the live
database, whether `BELL_ENABLED` / `GCAL_ENABLED` are armed, which env vars are in
which Vercel scope, whether the Google consent screen has left Testing mode, and what
headers the live origin returns. Several findings change severity on those answers.

**No live testing was performed.** Everything here is derived from reading source. The
two findings most deserving a live confirmation are GCAL-01 (safely testable between
two accounts you control) and the open question below.

**One open question.** Supabase's `postgres_changes` is documented not to apply RLS to
DELETE events. `share_members` and `share_records` are both in the realtime
publication, which would mean any signed-in account can watch crew membership changes
across every share in the project — identifiers only, no payloads. Unconfirmed against
the live project, so it is recorded as a question rather than a finding.
