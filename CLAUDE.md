# The Batman Project — the Batcomputer

Personal tracker (single user, no backend), dark Batman-inspired theme, built as
**one shell with pluggable consoles**: the app opens on a daily briefing + a menu of
console tiles; each console is a self-contained module. Today there are two:
**Training Grounds** (the workout tracker — body map, strain engine, nutrition) and
**Wayne Fund** (net-worth / budget tracker — Phase 1, offline/manual; live prices later).

## Direction (July 2026): the Majordomo pivot

The app is being rebuilt as **Majordomo** — a commercial, calendar-first "life OS"
with a butler persona. Strategy in `majordomo-playbook.md`; engineering milestones
in `majordomo-build-plan.md` (M0–M8); target UI in the Claude Design project
"Majordomo: Calendar OS" (`Majordomo Manor.dc.html` + `Majordomo Tokens.dc.html`).
What changes as milestones land: the Manor (a duty-cycle-seamed week calendar)
becomes home behind a tab nav (MANOR / WATCH / GROUNDS / STUDY / WORKSHOP / LEDGER); consoles
become Wings; three commercial presets (Midnight / Terminal / Aurora) join and the
seven Batman-era skins move behind a local `VITE_FOUNDER_SKIN` flag (`.env.local`,
never committed, tree-shaken from builds). Two standing rules from the pivot onward:

1. **All NEW user-facing strings go through `src/core/voice/`** — no inline copy.
   Register per playbook Appendix B: dry, composed, one sentence-final "sir",
   never begs, never guilts, no emoji.
2. **The Grounds keeps every existing Training Grounds feature.** The design's
   Grounds screen is directional; where it omits an old feature, the old feature wins.

Sections below describe the app as it exists today; each milestone updates only
the lines it invalidates.

## How to report back (standing rule)

When a task is finished, explain it **the way you'd brief the person who asked
for it** — not the way you'd brief another engineer. This is the default for
every wrap-up and every answer, unless the owner explicitly asks for the
technical version.

- **Lead with what was broken and why it mattered**, in plain terms — what a
  person using the app would actually have experienced ("nudge a night shift
  and 13 hours silently became 2"), not what the code did wrong.
- **Then what changed**, described as behaviour: what you can now do that you
  couldn't. One short paragraph per thing, not a bullet swarm.
- **Name the judgment calls** — anything you decided that the owner might want
  to overrule, and why you went the way you did. Say plainly when something is
  left half-done and why.
- **End with what still needs him**: manual checks you couldn't do, decisions
  you're holding, anything you couldn't verify. Be specific about the limits of
  what was tested — never let a green run imply more coverage than it has.
- **No file paths, function names, commit hashes or jargon** in the body. A
  short table of what landed is fine. Keep the whole thing skimmable — context
  where it earns its place, no padding.

## Commands

- `npm run dev` — Vite dev server on port 5173 (also via `.claude/launch.json`)
- `npm run build` — **two** typechecks then the production build: `tsc --noEmit` over
  `src` and `tsc --noEmit -p tsconfig.api.json` over `api`. Two projects because
  `api/` is Node and the app is a browser — `@types/node` declares `fetch`/`Request`
  as globals and collides with the DOM lib, so the main tsconfig pins `"types": []`
  and the server's config pins `"types": ["node"]`. A function that only fails at
  deploy time is a function nobody typechecked. The build ends with the **brand
  gate** (`scripts/check-brand.mjs`): dist must carry no Batman-era strings beyond
  the three legacy wire keys. It skips itself loudly under `VITE_FOUNDER_SKIN=1`
  (a founder bundle is not a shippable bundle); Vercel never sets the flag, so
  every production build is gated.
- `npm run lint` — ESLint, **import-boundary rules only** (no style rules).
  Scoped to `src`; `api/` is outside it (nothing there may import the app anyway).
- `npm run vendor:exercises` — regenerates the exercise catalogue
  (`scripts/vendor-exercises.mjs` → `src/modules/training/data/exercises.ts`) from
  free-exercise-db, **pinned to a commit**, mapping its 17 muscle names onto the
  app's 16 plates. Hand-run and committed; deliberately NOT part of `npm run build`
  — a build that needs the network is a build that breaks on a plane. An unknown
  muscle name, an unknown equipment value, or an OVERRIDES key upstream no longer
  has are all **hard errors**: a corrections table that silently stops applying
  ships wrong muscles.
- `npm run bell:probe` — the **Bell probe** (`scripts/bell-probe.mjs`): rings
  `/api/bell` with a real session token, streams the reply to the terminal, and
  prints the token counts the model actually charged against the estimates in
  `majordomo-assistant-spec.md` Appendix C. Needs `BELL_TOKEN` (a live Supabase
  access token) and the function runtime up — `npx vercel dev`, **not** `npm run
  dev`, which serves the app but not `api/`. `BELL_BASE` overrides the origin.
- `npm run check:manor` — the **Manor harness** (`scripts/manor-harness.mjs`): drives
  a real headless Chromium through the running dev server and asserts the calendar's
  numeric contract — a 13 h watch survives a drag, the mobile hour rail agrees with
  its blocks, an unfittable template isn't offered, QUICK ADD books on the slot
  its panel showed. Needs `npm run dev` up; exits
  non-zero on failure. `CHROME_PATH` / `MANOR_BASE` override the browser and origin.
- `npm run check:night` — the **night harness** (`scripts/night-harness.mjs`): drives
  headless Chromium through the running dev server and asserts THE NIGHT's numeric
  contract — a night files under the morning it ENDED on, a missing night is a gap
  and never a zero, debt credits a long night at half, the recovery coupling is
  EXACTLY 1 below its four-night gate and capped either side of it, the morning
  offer stops once the morning is written, and confirming a pencilled block turns
  it into a record without inventing hours. Its N10–N15 and C5/C6 checks are the
  pencil's own contract — a week of blocks the estate drew is no nights on file,
  no average, no debt, no body clock, a recovery scale of exactly 1 and not one
  sentence in the brief — asserted through the pure model AND through the live
  store, because the figures were wrong for a fortnight while every predicate
  around them was right. P6–P8 walk the same pencil-to-record confirmation at
  390 px, because BOTH week trees are in the DOM at every width and a selector
  that does not filter for what is RENDERED passes against the desktop grid
  nobody can touch. **Run it against a commercial dev server** — under
  `VITE_FOUNDER_SKIN=1` the founder pack renames the Watch to "THE NIGHT
  SHIFT", which R3's door regex matches in the tab nav and fails for a reason
  that has nothing to do with sleep. Needs `npm run dev` up; exits non-zero
  on failure. `CHROME_PATH` / `NIGHT_BASE` / `NIGHT_TZ` override the browser, the
  origin and the clock (the offer's window is 04:00–22:00, so the default
  `Asia/Tokyo` is what puts "now" inside it). No DST coverage, and the native
  `<input type="time">` is driven by value rather than by the OS wheel.
- `npm run check:recast` — the **recast harness** (`scripts/recast-harness.mjs`): drives
  headless Chromium through the running dev server and asserts the Grounds'
  edit-a-session contract — backing out of an edit lands on a method picker that says
  it is standing over a record and marks the door that record came through, a method
  change that would drop the session's exercises, sets, run figures or typed session
  size names them before it does it, cancelling costs the record nothing, a costless
  change is never interrupted, and a confirmed recast still does what it always did.
  Needs `npm run dev` up; exits non-zero on failure. `CHROME_PATH` / `RECAST_BASE`
  override the browser and the origin. Desktop clicks only — nothing here proves a
  thumb can reach the confirm's buttons.
- `npm run check:ledger` — the **Ledger harness** (`scripts/ledger-harness.mjs`): drives
  headless Chromium through the running dev server and asserts the Ledger's SIGN
  contract — a debt subtracts however it was typed, liabilities read as a magnitude,
  an overdraft stays a real negative, history does not leap on a sign alone, no figure
  carries two minus glyphs, and the snapshot sheet refuses a minus on a debt row
  without writing anything. Needs `npm run dev` up; exits non-zero on failure.
  `CHROME_PATH` / `LEDGER_BASE` override the browser and origin. It scores the SIGN
  only — spend pace, live prices, FX and the portfolio board are not covered.
- No test runner **for the app at large**; verification is done in the browser. The
  Manor, THE NIGHT, the Grounds' recast and the Ledger's sign are the exceptions —
  their contracts are numeric, and "looks plausible" is
  exactly how a cross-midnight drag silently rewrote 13 h to 2 h, how three taps came
  to wipe three exercises and nine sets off a saved session, and how a mortgage typed
  the way a bank app shows it counted as an ASSET. Re-run the Manor harness after
  touching `WeekGrid.tsx` / `ManorScreen.tsx`, and the Ledger's after touching
  `lib/networth.ts` / `SnapshotSheet.tsx`. The Manor's B1/B2 checks read the
  **brief's own exam clause**, and the brief types itself out on a first visit —
  they press SKIP before every read, so a fresh context does not measure a
  half-written sentence. It does NOT cover the mobile 350 ms long-press drag
  (not drivable by synthetic events) or DST. Re-run `check:recast` after touching
  `AddWorkoutSheet.tsx` / `MethodStep.tsx` / `lib/recast.ts`.

## Ship: it is live

**https://majordomocal.com** — private repo `idoh90/majordomo` → Vercel
project `ido-s-projects8/majordomo` (**note: two different accounts** — GitHub is
idoh90, Vercel is idoh40; the Vercel account has idoh90's GitHub linked). Pushing
`main` auto-deploys to production; `vercel deploy --prod` still ships from disk.

- **The topology, since three hostnames reach the same deployment** (12 Aug 2026):
  `majordomocal.com` is the **apex and the canonical origin**, registered through
  Vercel; `www.majordomocal.com` is a **308 to the apex** at the edge, so the app
  never runs on the www origin and www must not appear anywhere in code, config, or
  the Supabase allowlist; **`majordomo-cyan.vercel.app` is still attached to
  Production on purpose** — old links and invite codes handed out on that origin
  keep resolving, so do not remove it. Supabase Auth's Site URL is the apex and its
  redirect list is `localhost:5173` + both live origins.
- **A new domain is TWO edits, not a search.** Absolute URLs live in exactly two
  places: the Open Graph block in `index.html` (canonical + `og:*`, absolute
  because crawlers cannot resolve a relative path) and `ALLOWED_ORIGINS` in
  `api/bell.ts`. Everything else is origin-relative — `base: './'`, the manifest's
  `start_url`/`scope`, the OAuth `redirectTo`, the Workshop's invite links — and
  must stay that way; an absolute `base` breaks `npx vercel dev` and
  `npm run preview`. The manifest carries an explicit `id: '/'` so an install from
  the vercel.app alias and one from the domain are the SAME installed app rather
  than two icons on one phone.
- **The link-preview card is `public/og.png`**, built from `scripts/og-card.html`
  by `node scripts/og-render.mjs` — deliberately not part of `npm run build`, which
  has no business needing a browser binary. Never point `og:image` at the app icon:
  a square mark letterboxes into a 1.91:1 card and reads as a broken share.

- **Offline is the point.** The estate lives in localStorage and the app boots
  from it **synchronously** — no async gate, no spinner, no session check between
  the user and their own records — so the shell being fetchable is the only thing
  between the app and a flight. Sign-in is a **door, never a wall**: opened from
  the header, never imposed. `vite-plugin-pwa` precaches everything
  (`autoUpdate`); quotes/FX are `NetworkFirst` with a cached fallback. **Test
  offline by killing the server and reloading** — not by trusting the config.
- **The registry (accounts) is a PAUSING free-tier Supabase project.** Project
  `majordomo`, ref `xigbgvuakguqmfulfaqe`; schema lives in `supabase/migrations/`
  (nothing runs it automatically — paste it into the SQL editor). **That ref is
  now written into two committed files besides the env vars** — the CSP's
  `connect-src` in `vercel.json` and `.github/workflows/keep-supabase-awake.yml`
  — so moving to a new project is three edits, not one. Miss the CSP and sign-in
  and realtime die at the browser with a console violation and no server-side
  tell, which is not where anyone looks first; the two-places rule for absolute
  URLs further down covers ORIGINS THIS APP SERVES, and this is not one of
  them. Supabase pauses
  a free project after ~7 days idle, and **a paused project's API hostname stops
  resolving entirely** — `DNS name does not exist`, which is indistinguishable
  from a deleted project and has already been misdiagnosed as one, at the cost of
  an evening. **If sign-in fails with "server cannot be found", open the Supabase
  dashboard before believing anything is gone**: the data is intact and the
  project resumes in ~2 minutes. `.github/workflows/keep-supabase-awake.yml` runs
  one real query a day to stop it happening (needs the `SUPABASE_ANON_KEY` repo
  secret; it fails loudly rather than silently if that is unset). The anon key is
  **public by design** — it ships in the bundle and RLS is the only guard.
  `service_role` now has exactly two legitimate homes — `api/bell.ts` and
  `api/google.ts`, server-side, read from Vercel env (see the Bell and Google
  bridge sections below). Anywhere else, and especially anywhere under `src/`,
  is still a bug.
- **`vercel.json` rationale** (the schema rejects `comment` keys, so it lives here):
  hashed `/assets/*` are content-addressed → `immutable`; **`sw.js` must never be
  cached** or the app can't learn it's stale; frame/sniff/referrer headers on
  everything; `functions` pins each function's ceiling (bell 60 s, google 30 s)
  so a hung invocation is killed on this project's terms rather than sitting on
  the platform's 300 s default — the in-file `export const maxDuration` says the
  same thing, deliberately twice. The pre-landing `X-Robots-Tag: noindex` is GONE — the site is a
  public product now, `index.html` says `index, follow`, and `public/robots.txt`
  + `public/sitemap.xml` (which lists `/`, `/privacy`, `/terms`) agree.
- **The CSP is there for the supply chain, not for injection.** There is no
  HTML-injection route in this codebase — no `dangerouslySetInnerHTML`, no
  `innerHTML`, no `eval` — so the policy is not defending against user content.
  It defends against the thing that cannot be audited from here: a build-time
  dependency that one day ships code to read `localStorage` (where the Supabase
  session lives, by deliberate design) and post it somewhere. `script-src 'self'`
  makes that post fail. Keep `connect-src` as the list of origins the app
  genuinely talks to — **this project's own Supabase host, named in full**, over
  both `https:` and `wss:` (realtime is a WebSocket), Twelve Data, Frankfurter,
  `eu.i.posthog.com` (the telemetry outbox; see TELEMETRY below), and
  `www.googleapis.com` (the Calendar bridge runs client-side; token traffic
  stays in `api/`) — and **add to it only when a real feature needs it**, since
  every entry is a place data could go. It used to read `https://*.supabase.co`,
  which is a hole the exact shape of the threat above: anyone can stand up a
  free Supabase project and use it as the exfiltration endpoint. The ref is a
  constant in the bundle already, so naming it costs nothing. **Pinning it does
  mean a fork or a second project needs this line edited** — accepted, for a
  single-tenant product. Two entries are still generic destinations an
  exfiltrator could sign up for (`eu.i.posthog.com`, `www.googleapis.com`);
  they buy real features, the wildcard bought nothing, and that is the whole of
  the difference. `style-src` carries
  `'unsafe-inline'` because React writes `style` attributes all over this app;
  that is a style hole, not a script hole. If the build ever gains an inline
  `<script>` (it has none today — checked in `dist/index.html`, where the PWA
  registration is an external `registerSW.js`), it will break loudly rather than
  silently, which is the correct direction.
- **`.vercelignore` only governs CLI uploads** — a Git build clones the whole repo.
  Harmless (only `dist/` is served), but never rely on it to hide anything.
- **`public/404.html` is the estate's own not-found page** — Vercel serves any
  `404.html` sitting at the output root for an unmatched path (with a real 404
  status), and Vite copies `public/` there verbatim, so it needs no `vercel.json`
  entry (there are no `rewrites`, so nothing swallows the path first). It is
  **self-contained for the reason `BootFailure.tsx` is**: no stylesheet, no font,
  no bundle, its own copy of the preset tokens. `base: './'` means the app's
  relative asset paths resolve against whatever depth was typed, so a linked
  stylesheet would be a second 404 on the 404 — and a page that speaks when a
  request found nothing must not depend on the thing that just failed. Its copy is
  duplicated from `src/core/voice/` under the same exception the Open Graph block
  claims above — static HTML is served before any JavaScript runs — so a voice
  change has to be carried across by hand.
- **The 404's one script is EXTERNAL, and the CSP is why.** `script-src 'self'`
  admits `/404.js` and would drop an inline block, taking the skin and the echoed
  path with it *while the page still looked fine* — the one case where the policy
  fails quietly rather than loudly. Absolute path, not relative: same reason as the
  stylesheet. It applies the persisted `majordomo-shell` skin before paint so the
  page arrives in the user's own palette (founder-only ids fall back to Midnight,
  like `normalizeSkin`), and echoes the requested path through `textContent`, never
  `innerHTML` — that string comes from the address bar. Both are enhancements: if
  the file never arrives the page still renders, in Midnight, with the path row
  hidden. **The service worker outranks all of it** — `navigateFallback:
  'index.html'` means an installed client typing a bad path gets the app shell, not
  this page, which is the better outcome offline (no dead end) and the reason the
  fallback stays. So the 404 answers network navigations — first visits, shared
  links, a cleared SW — which is exactly where Vercel's default black-and-white
  error page used to show.
- **Origins don't share storage — and this is now a real migration, not a note.**
  `localhost:5173`, `majordomo-cyan.vercel.app` and `majordomocal.com` are three
  separate estates, because localStorage is scoped per origin and **the deployed
  app changed origin on 12 Aug 2026**. Opening the new domain gives a first-run
  screen with the vercel.app estate still sitting untouched on the old one; that is
  correct behaviour. Bridge it by signing in on the new origin and letting
  `src/core/sync/` pull, then Export/Import for anything sync does not carry. The
  Twelve Data key is carried by neither and must be re-entered once, in Ledger
  settings. Moving between them is gear → **Export/Import an estate**
  (`core/backup.ts`) — the M0 backup ritual. The export **no longer carries the
  Twelve Data API key** (`SECRETS` in `core/backup.ts` blanks it, matching the
  exclusion cloud sync already makes): a file that gets mailed to yourself and
  dropped in a cloud folder must not quietly be a credential. Restoring onto a
  new device therefore needs the key re-entered once, in Ledger settings.

## The Bell — the server seam (`api/`)

The summonable butler: natural-language questions and commands over the estate.
Spec is `majordomo-assistant-spec.md` (stages B0–B6). **B0 is built** — `api/bell.ts`
verifies a session, checks a daily ceiling, streams a reply, records what it cost.
Everything else in that document (chat UI, context pack, read tools, write tools,
the sandbox bridge, the concierge, tiers and trials) is **not built**; do not
describe it as existing.

- **Every handler here is a WEB handler behind a Node bridge, and that is not a
  style choice.** Vercel's Node runtime accepts exactly two shapes: a default
  export called with Node's `(req, res)` pair, or NAMED per-method exports
  (`export function GET(request: Request)`) written against the web standard. A
  default export that takes a `Request` and returns a `Response` is neither — the
  runtime calls it with `(req, res)` regardless, discards what it hands back, and
  **nothing is ever written to the socket**. The caller waits with zero bytes
  until the platform kills the invocation. That is what took both endpoints down
  in Aug 2026: every request to `/api/bell` and `/api/google`, a `HEAD` that did
  no work included, hung for 300 s and answered 504, and no Google account could
  ever be connected. So both files keep their `Request → Response` bodies as
  private functions and default-export `nodeHandler(fn, { deadlineMs })` from
  **`api/_node.ts`** — underscore-prefixed, so Vercel bundles it and never routes
  it. The bridge is also where the DEADLINE lives: a handler that has not
  produced a response in 20 s gets a 504 written for it, because a hang is the
  one failure a caller cannot tell from a slow success. `scripts/bell-serve.mjs`
  now calls that same default export the way the platform does, so the local
  runtime exercises the conversion instead of re-implementing it.
- **The SOCKET is its third job, and it falls here because nothing else in
  `api/` can reach it.** All three duties below cost the household billed minutes
  or a live secret, not one of them is a correctness bug inside a handler, and
  each was found the hard way.
  · **The caller's departure.** A handler is handed a `Request` and hands back a
  `Response`; it cannot see that the tab closed. `nodeHandler` arms an
  `AbortController` on the socket's `close` and passes its signal into the
  `Request` — armed BEFORE the body is buffered, since that is the longest
  anybody waits here. Until it existed a caller who left was invisible for the
  whole pre-response window, the 6 s registry round trip included, and the house
  went on paying an upstream (and, in the Bell, a household slot) for a reply
  nobody would ever read. It is guarded on `writableEnded`, because a signal
  that cries abort over every healthy response is a signal nobody trusts on the
  one occasion it means it.
  **The bridge only ARMS it; where it is obeyed is each handler's own call, and
  neither obeys it everywhere.** `api/bell.ts` folds it into `verifyUser` and
  the model call, and deliberately WITHHOLDS it from the meter — an aborted
  claim is not a claim undone, and an aborted `bell_note_tokens` is words the
  household read and was never charged for. `api/google.ts` folds it into
  `verifyUser` and nowhere else: every other upstream there is either the OAuth
  code exchange or a write of a household's credential, and abandoning one of
  those halfway strands a live Google grant that nothing later comes back for.
  Do not thread it further "for consistency" — the two rope-line comments say
  why in their own words, and they were written after a review found this entry
  claiming both files were covered when only one was.
  · **Backpressure that can end.** `drain` is an event only a live connection
  ever sends, so a reader who hangs up with the buffer full used to park the
  invocation until the platform's ceiling: sixty billed seconds of silence. The
  wait races `drain` against `close` and `error`, returns early if the socket is
  already gone, and takes all three listeners off whichever wins — the Bell's
  stream meets backpressure hundreds of times in one reply, and a listener left
  behind on each announces itself as a MaxListeners warning long after the cause.
  · **What a log line may repeat, which is the PATH and nothing else.** Node
  hands over the target with its query attached, and on `/api/google` that query
  IS a live authorization code beside a `state` still inside the ten minutes it
  was signed for. The two `console.error` lines fire on exactly the two occasions
  that matter most — a handler past its deadline, a handler that threw — so a
  slow upstream on the consent walk wrote a usable code and a usable state into
  Vercel's log store, where they outlive the walk by months and are readable by
  anyone with dashboard access. Everything goes through `pathOf`. **Never log
  `req.url` in this directory**, and never widen a log line here to be helpful:
  no line has ever needed the query to be useful.
- **Every relative import in `api/` must carry a `.js` extension, and the bridge
  is why this matters at all.** Vercel does not bundle these files — it transpiles
  each one on its own and copies the root `package.json` (`"type": "module"`) in
  beside them, so the emitted `api/google.js` is loaded by Node's own ESM
  resolver, which does not guess extensions. `import … from './_node'` therefore
  ships a specifier that resolves to nothing: every function died at module load
  with `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_node'`, before a
  line of handler code ran, which the platform reports as a bare
  `FUNCTION_INVOCATION_FAILED` with no outgoing requests. That was Aug 2026's
  SECOND api outage, and it was introduced by the fix for the first — `_node.ts`
  was the first cross-file import this directory ever had. `_node.js` was in the
  bundle the whole time; only the spelling was wrong. **`tsconfig.api.json` is
  pinned to `moduleResolution: "nodenext"` so it stays wrong loudly**: the
  extensionless form is now TS2835 in `npm run build` instead of a green build
  and a dead deployment. Never relax that to `bundler` — nothing bundles this
  directory, and the mode has to describe the runtime the files actually get.
- **A `HEAD` is answered 204 first, before everything.** Before the kill switch,
  before auth, before any upstream. A health probe must never start a consent
  walk, ring the model, cost a household a slot, or become an oracle for whether
  a door is armed. Every wait inside either file is bounded well under 15 s
  (6 s registry, 8 s Google) so the whole walk finishes inside that deadline.
- **`api/` is the only place in this project that holds a secret**, and the only
  reason it exists. Server env, Vercel project settings, never in git, never in the
  bundle: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `BELL_ENABLED`.
  The Supabase URL and anon key are reused from the `VITE_*` pair the client build
  already needs, so arming the Bell adds two secrets and one switch. Tuning knobs,
  all optional: `BELL_MODEL`, `BELL_MAX_TOKENS`, `BELL_MAX_CHARS`, `BELL_MAX_TURNS`,
  `BELL_DAILY_FREE`, `BELL_DAILY_STAFF`.
- **Never prefix any of these with `VITE_`.** Vite inlines every `VITE_*` variable
  into the client bundle as a literal string — that is the whole point of the
  prefix, and it is why the anon key carries it. A `VITE_ANTHROPIC_API_KEY` would
  be published to anyone who opens devtools, and `check-brand`-style greps would
  not catch it. For local runs put the unprefixed names in `.env.local` (gitignored,
  and `.vercelignore`'d) and use `npx vercel dev`.
- **`BELL_ENABLED` defaults to OFF.** Deploying this file must not by itself open a
  door that spends money; arming is a separate deliberate act, and it is also the
  kill switch when something goes wrong.
- **`ALLOWED_ORIGINS` has to grow whenever a domain does.** The Bell turns away any
  request carrying an `Origin` header that is not `majordomocal.com`, the
  vercel.app alias, or `localhost:5173`. A caller with **no** `Origin` is admitted
  on purpose — `npm run bell:probe`, curl and anything server-side send none, and
  browsers send one on every POST, so nothing a browser can produce escapes it.
  Consequence worth knowing before it wastes an hour: **every Vercel preview deploy
  has its own hostname and is therefore refused.** That is the right default for a
  door that spends money, and it is the first thing to check when a preview will
  not ring.
- **Tools will execute on the CLIENT, not here.** The estate's source of truth is the
  device, and posting a watch pencils sleep, saving a workout resolves PPL and
  matches its block, a delete records tombstone intent — all of that lives in the
  store actions. The server stays what the backend has always been in this project:
  dumb, opaque, replaceable. Resist every temptation to put domain logic in `api/`.
- **The provider shape stops at the endpoint.** Callers see `text` / `done` / `error`
  SSE events and nothing that names a model vendor, so swapping providers is a change
  to one file. Never forward raw upstream events to the browser.
- **`verifyUser` is the whole auth seam.** It currently asks the Supabase auth server
  (`getUser`), which means the Bell dies while the project is paused. Verifying
  against the project's JWKS instead is the spec's plan (§8.4) and belongs with B6's
  fail-open/fail-closed rules — replace that function's body, nothing else.
- **A cheap prompt can cost more than a fat one.** The cost model in §6 assumes the
  system prompt is served from cache at a tenth of the input price, but a model will
  not cache a prefix under its own minimum and **says nothing when it declines** —
  ~4,096 tokens on Haiku 4.5, 512 on Opus 5. So trimming the prompt below the
  threshold silently loses the discount entirely. `bell_usage` records cached and
  uncached input in separate columns precisely so this is visible rather than assumed;
  the probe shouts about it when both are zero.
- **Reading the meter: input above zero with output at zero means the ring was cut
  short**, not that the butler said nothing. Output tokens arrive exactly once, in
  the last event before the reply ends, so a hang-up or an upstream drop records
  the whole input and none of the output. A ring that produced nothing at all is
  not recorded and does not spend an allowance.
- **`supabase/migrations/0003_bell.sql` has to be pasted into the SQL editor** like
  every other migration here, and **in full** — the tables can land while the
  increment function or its grant does not, and in that state the endpoint serves
  happily while the ceiling quietly stops counting. The reply carries whether it
  was metered so the probe can say so; the standing fix is B6's reserve-before-spend.
  Until the tables exist at all, every ring is refused — which is the correct
  direction for that error to run: a broken meter is not an unlimited allowance.

## The consent door & the legal pages (launch, Aug 2026)

The commercial launch's legal seam: `/terms` + `/privacy` (real prerendered pages),
one **consent door**, and the acceptance stamp that gates telemetry.

- **The door** (`src/app/ConsentDoor.tsx`) renders INSTEAD of the shell — `App()` in
  `App.tsx` is now a two-line gate over a private `Shell()` (a component split, not an
  early return, because Shell opens with hooks). It shows whenever the device's
  `termsAccepted` stamp in the shell store is below **`TERMS_VERSION`**
  (`core/store/shell.ts`). It is the app's ONE deliberate wall (the sign-in door
  stays a door); pressing AGREE & ENTER stamps `termsAccepted`/`termsAcceptedAt`.
  Per-device and never synced, like `onboarded` — sign-in is optional, so consent
  cannot hang on an account. In DEV the door only answers `?consent` (the Manor
  harness and every screenshot param drive bare URLs); in production it is
  unconditional, so existing estates meet it once as an interstitial.
- **A material change to /terms or /privacy = bump `TERMS_VERSION`** — that is the
  whole re-acceptance mechanism. Also update each document's "Last updated" line
  (`src/landing/voice.ts`).
- **The legal pages follow the /privacy pattern exactly**: root `terms.html` /
  `privacy.html` → rollup `input` in `vite.config.ts` → `entry-*.tsx` client entry →
  `TermsPage`/`PrivacyPage` over the shared `LegalPage` shell → copy in
  `src/landing/voice.ts` → prerendered by `scripts/prerender.mjs`. **Adding a landing
  route means touching four fail-loud lists**: the rollup `input`, the prerender
  route loop, `entry-server.tsx` (union + meta), and `audit.mjs` `ROUTES`/`PAGES` —
  plus `public/sitemap.xml` and the landing footer. The html must carry
  `__SITE_ORIGIN__` in its canonical or the build throws (the lone exception is
  `404.html`, below).
- **The SW answers for `/` AND NOTHING ELSE.** `navigateFallbackDenylist`
  (vite.config.ts) ends in `/^\/[^?]/` — any path that is not the root. Workbox
  tests these against `pathname + search`, which is exactly what lets that one rule
  keep the fallback for `/?demo` / `/?landing` (the root with a query, and the only
  reason `navigateFallback` still exists — a bare `/` is already answered by the
  precache route via workbox's `directoryIndex`) while releasing every real path to
  the network. `/api/`, `/privacy`, `/terms` and `/404` keep their own specific
  entries, redundant under that rule today, so that narrowing it cannot silently
  un-protect them. **The cost is stated and accepted**: a wrong address while
  OFFLINE now gets the browser's error page rather than `404.html`. The app itself
  still boots offline at `/` and at any `/?query` — verified with a live registered
  worker, both online and with the network killed. The rule this replaced fell back
  to the shell for everything, on the reasoning that "a stray deep link must never
  dead-end offline"; the app has no router and publishes no deep links, so there was
  no such link to strand — and the real cost was that the 404 page could never be
  seen by anyone who had the app installed.
- **`404.html` is the wrong address**, and it is served by CONVENTION, not by config:
  Vercel hands `dist/404.html` to any path a static deployment does not have, with a
  real 404 status. There is no rewrite and there must not be one — a rewrite answers
  200, which tells a crawler the typo is a page. Before it existed, an unknown path
  got the platform's own black NOT_FOUND card: the one screen a stranger could reach
  that did not look like the product. It is a full landing-tree page (`NotFoundPage`
  over `voice.notFound`, prerendered like the rest), and it deviates from the
  four-list recipe above in exactly three ways, all deliberate:
  · **no canonical** — an error page has no address of its own, it answers at every
  address that is wrong. It buys the exemption from the `__SITE_ORIGIN__` throw by
  declaring `noindex`, which is the one escape hatch `NOINDEX` in `vite.config.ts`
  allows; a document with NEITHER still fails the build.
  · **not in `sitemap.xml`, not in the footer** — that list is routes, and this is not one.
  · **in `audit.mjs`'s `PAGES` (contrast) but not `ROUTES` (Lighthouse)** — it is a
  page someone has to read, so AA still applies; but Lighthouse scores `noindex` as an
  SEO failure, so scoring it would fail the gate for doing the correct thing.
  It is also the ONE document carrying `<base href="/">`, and that is load-bearing:
  the build's `base: './'` resolves assets against the REQUESTED path, so without it
  the page would ask for `/a/b/assets/…` at `/a/b/c` and paint unstyled. Anything
  added to its head must stay below that tag.
  **Everyone sees it, residents included** — but only because the SW rule above was
  changed to let them. That is worth knowing before touching either: shipping this
  page WITHOUT that rule ships a page the owner can never see on his own machine,
  which is exactly how it shipped first and exactly how it was caught.
- **The legal copy carries honesty invariants** (stated in a comment block above it
  in `src/landing/voice.ts`): the public pages stay tracker-free (Vercel aggregate
  counts only); app analytics are named actions only; deletion is a mailbox
  (`majorcal@majordomocal.com` — `FALLBACK_CONTACT` in `site.config.ts`, duplicated in
  `scripts/prerender.mjs`, both overridden by a `CONTACT_EMAIL` Vercel env var)
  because no in-app deletion exists. Do not edit the documents into promising
  machinery the app does not have.

## Telemetry (`src/core/telemetry/`)

Anonymous usage counts to PostHog **EU** — hand-rolled (no SDK) so every byte that
leaves is auditable in one file against the Privacy Policy's promises.

- **Named actions only, never estate contents.** The event vocabulary is the closed
  union in `core/telemetry/events.ts` (~18 names: `app_open`, `wing_open`,
  `workout_logged`, …). No amounts, titles, notes, body stats, or record text may
  ride as properties. Adding an event = add to the union, then instrument a
  **SUBMIT HANDLER, never a store action** — heal passes, onboarding seeds, `?demo`
  fixtures and sync all drive store actions, and housekeeping must never count as
  usage. (This is why `refreshPrices`, the events-store actions, and
  `planWatchPost` are NOT instrumented.)
- **The predicate** (all must hold before anything is sent — or even written):
  production build · `VITE_POSTHOG_KEY` present (set in Vercel for **Production
  only**, so previews and DEV are silent; the key is public-by-design, same class
  as the anon key) · `termsAccepted >= TERMS_VERSION` · settings switch not off
  (`telemetryOff` in the shell store; settings → THE FINE PRINT) · no Global
  Privacy Control signal.
- **`majordomo-telemetry`** is a raw localStorage key ({deviceId, lastUserId,
  sessionId, outbox}) created **lazily on the first allowed capture** — never
  before consent, partly because `hasEstate()` matches any `majordomo*` key and a
  pre-consent write would walk a bounced stranger past the landing. Deliberately
  absent from `ESTATE_KEYS` (an export must not carry a device identity) and from
  sync. Events queue in an outbox (cap 200) and drain on boot/online/visibility —
  offline usage counts, later. `visibilitychange→hidden` drains via `sendBeacon`
  with an optimistic clear (a rarely lost event beats a duplicate).
- **Identity**: `distinct_id` = the random device id; a genuine sign-in (detected
  via the persisted `lastUserId`, because OAuth makes every real sign-in look like
  a boot restore) sends `$identify` to merge into the Supabase user id. Email never.
- Owner-side setup and the dashboard recipes live in `docs/telemetry-dashboards.md`.

## The Google Calendar bridge — two-way sync (`api/google.ts` + `src/app/gcal/`)

The Manor syncs both ways with Google Calendar; Apple devices see it by adding
the Google account to iPhone/Mac Calendar (no CalDAV, no ICS — deliberate).
**The server half is custody only**: `api/google.ts` (bell.ts conventions —
`GCAL_ENABLED` kill switch defaulting OFF, `ALLOWED_ORIGINS` grown by
`localhost:3000` for `vercel dev`, the same `verifyUser` seam) runs the OAuth
walk and holds `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; the refresh token
lives in `gcal_accounts` (`supabase/migrations/0006_gcal.sql` — RLS on, ZERO
policies, service_role the only door), and the browser only ever sees hour-long
access tokens, in memory — those, and the two one-walk secrets below, are the
whole of what this server ever hands out. The consent walk returns to
`?gcal=pending&n=…` (or `denied`/`error`) — never `?code=`, which Supabase's
`detectSessionInUrl` would eat — and its `state` is an HMAC over
`{origin, expiry, salt, walk hash}` keyed off the client secret. Scopes:
`calendar.app.created` + `calendar.events.readonly` — the app can never edit an
event the user made in their own calendar.

- **THE CONSENT WALK TAKES TWO SECRETS, and both halves are scar tissue.** The
  state used to carry the household's `user_id` and the callback filed the
  refresh token under it. A signature proves who STARTED a walk, and in the
  attack that is the attacker: sign up, ask for a consent URL, send that genuine
  `accounts.google.com` link to somebody else, and their calendar lands in your
  estate. So the callback files nothing. It PARKS the grant in `gcal_pending`
  (`0007_gcal_claim.sql`, same treatment as 0006 — RLS on, zero policies,
  service_role only), addressed by the sha256 of a **claim secret** minted right
  there with `randomBytes`, and hands the plaintext to the browser it redirects.
  That browser POSTs `{action:'claim'}` with its OWN bearer, and the grant is
  filed under the id that token verifies to. The claim is single-use and the
  DELETE returns the row in one statement, so two claims cannot both win.
  · **The CLAIM is single-use; the STATE is not** — say it that way round, because
  a comment here once said "single use" and meant the wrong noun. Nothing marks a
  state spent, so inside its ten minutes one `begin` still drives as many
  callbacks as there are people willing to approve. The binding below is what
  makes that worthless: every row a reused state parks carries the ORIGINATOR's
  walk hash, so the browser that actually approved holds nothing that matches and
  never claims. **The residual, written down rather than left to be
  rediscovered**: it pays only if the originator also gets that browser's `n`,
  which lives in its address bar (stripped before boot finishes) and in the
  platform's own request log — so GCAL-01 is now "needs an `n` leak" rather than
  "impossible". Closing it properly wants a used-state record that outlives the
  claim; judged more machinery than it earns while the binding stands.
  · Fixing only that opens the **mirror image**, which cost a review round to
  catch: an attacker finishes the walk with their own Google account and
  forwards the `?gcal=pending&n=…` link to a signed-in victim, whose app would
  claim it and point that household at the attacker's calendar. So a walk is
  also bound to the browser that began it. `connectGoogle()` mints a **walk
  secret** into its own storage (`majordomo-gcal-walk`) and sends only its sha256; that
  hash rides in the signed state onto the parked row, and the claim must present
  the raw secret. A browser handed a link it did not earn holds none and never
  claims at all. **Neither half works alone** — the session says whose
  connection this becomes, the walk secret says whether this browser may ask —
  and removing either one re-opens a live calendar-theft hole in one direction
  or the other. `n` rides in a query string and is therefore NOT confidential
  (history, the platform's request log); the claim is that it is no longer
  SUFFICIENT. PKCE rides along, its verifier derived from the state under a
  domain-separated HMAC rather than stored, so there is still nothing to migrate
  for it.
  · **A claim answers ONE refusal for five different causes** — malformed,
  unknown, already spent, expired, and presented by a browser that cannot prove
  it walked this walk all come home as `expired`, in the same words. That is the
  design and not laziness: anything finer is an oracle for whoever recovered an
  `n` from a request log, telling them whether the grant is still live and
  whether the only thing they are short of is the walk secret. The remedy is
  identical in every case besides — walk the consent screen again. A registry
  that could not be REACHED is the one refusal allowed its own code, because its
  remedy differs (try again) and it says nothing about the secret.
  · **A wrong walk secret BURNS the grant**, and that is a decision rather than
  an oversight waiting to be tidied. The row is already gone — the claim deletes
  and returns in one statement — and a browser presenting a secret it cannot
  match is a browser being walked through a handoff it did not start. The honest
  owner of the walk pays one more consent screen; the attacker's parked token is
  destroyed rather than left waiting for a second victim to click.
- **Everything with judgment runs on the CLIENT** (`src/app/gcal/service.ts`,
  triggered like estate sync: sign-in, visibility, online, a 5 s-debounced edit,
  SYNC NOW; never while a what-if sandbox is open). One cycle: pull Google's
  primary → read-only mirrors; ensure the app-created "Majordomo" calendar;
  write back Google-side edits to our own events; push the estate's bookings.
  Window: −7 d → +60 d (`mapping.ts`).
- **Identity is deterministic both ways** (`mapping.ts`): outbound Google ids
  are `'mj' + hex(localId)` (reversible — an id read back from Google names its
  local record); inbound mirrors get `id: 'g-<googleEventId>'`, `source:
  'google'`, `kind: 'abroad'`, `sourceRef: 'gcal:primary/<id>'`. Two devices
  ingesting the same event write ONE `records` row (the Watch-templates trick);
  mirrors are carried by estate sync on purpose — a device that never connected
  Google still sees them. Never add `gcal:` to `PROJECTION_PREFIXES`.
- **'abroad' events are read-only everywhere** — `isAbroad()` in
  `core/events/lib.ts` gates drag/resize/long-press (one lock in `EventBlock`),
  popover and mobile-sheet actions, with defensive returns in every mutation
  path. They DO hold their hour (`occupies()` counts them — a Google meeting
  must block QUICK ADD) and DO appear in month view. All-day imports are built
  from date components with the LOCAL Date ctor (`core/dates.ts`'s UTC-shift
  rule, arriving from the other direction).
- **Two doctrine exceptions, both documented in service.ts**: the pull's delete
  sweep is a windowed, source-scoped diff (legitimate only because Google is
  the mirror's authority and the fetch aborts unless every page arrived — and
  it judges a window one day narrower than the fetch so edge disagreements
  never flap); a Google-side deletion of OUR event does not delete the estate
  record — the next push re-creates it ("when in doubt, resurrect").
- **`majordomo-gcal` is device-local bookkeeping** (the push ledger, toggles,
  connection cache) — like `majordomo-sync`: never estate, never exported,
  never synced. The ledger only advances on confirmed writes, so it may
  under-claim (idempotent re-push) but never over-claim (a lost edit).
- **`majordomo-gcal-walk` is the only CREDENTIAL this app keeps in
  `sessionStorage`** — the other resident there is the onboarding walk's resume
  key (`majordomo-onboard`, `app/onboarding/store.ts`), which is there for the
  same reason: an OAuth redirect must not drop a half-finished run. `sessionStorage`
  is the lifetime this wants — one tab's business, dead when the tab is, and
  preserved across the navigation out to Google and back — and it is the first
  place the record is written. **It is written to `localStorage` as well**, and
  that is a concession to a platform rather than a relaxation: an INSTALLED app
  may hand a cross-origin navigation to the system browser or a custom tab, and
  a consent screen that happens outside the standalone context comes home to a
  `sessionStorage` that never held anything — which made Google unconnectable
  from an installed app, permanently and silently, while the screen blamed the
  reader for using another browser. What the second carrier costs is
  invisibility between two tabs of one profile; what it does NOT cost is the
  binding, which is the whole of the security — a browser handed a finished link
  it did not earn holds no record matching THAT walk's hash in either carrier.
  The `localStorage` copy is fenced by a `mintedAt` no wider than the server's
  own state TTL (10 min) instead of by the tab's lifetime, it is read and
  deleted in the same breath (`takeWalk()`), and it stays out of
  `core/backup.ts` for free: that export reads `localStorage` against an
  ALLOW-list, so a key nobody added can never ride into a file somebody mails
  themselves. The record also carries the **household that began the walk**, and
  a claim by a different signed-in account is refused rather than filed.
- **The claim step's quiet rules on the client** (`service.ts`), each one a bug
  already paid for. At most ONE claim in the air per tab: boot alone has two
  callers (the tail, and the auth subscription firing on loading → signedIn)
  with a third available from visibility, and since the secret is single-use at
  the server, the losers were told the grant does not exist and painted *granted
  but never completed* over a connection that had just succeeded — sending the
  reader back through consent to mint a second Google grant on top of a live
  one. **A non-retryable refusal asks the household before it says that**, for
  the same reason by another door: a claim whose reply is lost in transit was
  still spent at the server, and `status` answering *connected* outranks the
  claim's own verdict. A parked grant SURVIVES boot's first
  `loading → signedOut`, which is what a visitor who has simply not signed in
  yet looks like; only a genuine sign-out drops it — and because a session that
  arrives afterwards need not be the one that walked, the claim also refuses an
  account that does not match the walk's recorded owner. Every terminal outcome
  hands the tab back to the ordinary status-then-cycle, and the verdict it
  leaves on screen rides a MODULE variable (`standingLine`) rather than an
  argument: `initAuth()` resolves through a dynamic import, so the boot tail's
  own handback always returns at the door and the real one happens in the auth
  subscription a tick later. **Nothing sweeps the walk record on an ordinary
  boot** — a BACK out of the consent screen with the bfcache missing is a boot,
  and destroying a live walk there told its owner it had been begun in another
  browser while the grant they went on to authorise sat parked and unclaimable.
  It is swept when the return door says the walk is over, and otherwise ages out
  on its own `mintedAt`.
- **None of this walk can be driven by a harness, and that is stated rather
  than solved.** There is no live consent screen, no registry and no deployed
  function to drive from a dev machine, so the walk is verified by hand on a
  deployed origin — and `?demo` disarms the bridge outright (`core/sync/gate.ts`),
  which is also why the Manor and night harnesses never go near it. When a
  reconnect fails, the sentence on screen is deliberately the same for five
  causes: read the function log, which carries the path and never the query.
  **The one case still owed a hand check is the INSTALLED app on iOS and on an
  Android WebAPK**: where the consent navigation leaves the standalone context,
  the two-carrier walk record above is what is meant to carry the binding home.
  It has been reasoned through and never driven, and the failure it guards is
  silent and total rather than degraded — so walk it once on a real home-screen
  install of each before treating the bridge as proven there.
- **Arming is five manual acts, and two of them have an ORDER**, none in git:
  create the Google Cloud OAuth client (Web app; redirect URIs
  `https://majordomocal.com/api/google`, the vercel.app twin, and
  `http://localhost:3000/api/google` — NOT 5173, which never serves `api/`), set
  the three env vars in Vercel (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GCAL_ENABLED=1`), paste `0006_gcal.sql` in full, **paste `0007_gcal_claim.sql`
  in full BEFORE the app that expects it ships**, and add the scopes + a test
  user on the consent screen. The order is the whole of it: with 0007 missing,
  every callback fails at the park and no connection can be made at all — which
  is the safe direction, and is why it is this way round rather than the other.
  0007 is idempotent and repairs a half-applied earlier draft of itself. **While the consent
  screen sits in Testing mode, Google expires refresh tokens after 7 days** —
  weekly reconnects until verification lands, and the sensitive read scope's
  review takes weeks: start it early (playbook §3.3.1 said so first).

## Stack

Vite 7 + React 19 + TypeScript, Tailwind CSS v4 (tokens in `src/core/ui/index.css`
`@theme` block — no tailwind.config), Zustand + persist. Charts are hand-rolled
HTML/CSS — no chart library. No router — the shell is a `useState<'menu' | consoleId>`.

## Architecture: shell + consoles

```
src/
  app/            the shell: App.tsx (header, briefing row, menu grid, view state),
                  consoles.ts (the console registry), wings.ts (the household's
                  running order over it — what both navs read),
                  SettingsMenu.tsx (gear menu)
    manor/briefing/  THE BRIEFING (see below): facts.ts gathers every wing's
                  facts through the wings' own hooks, dials.ts builds the
                  instrument catalogue, geometry.ts plots it, prefs.ts is
                  THE PEN's persisted state
  core/           shared kernel — knows NOTHING about consoles or the app shell
    module.ts     the ConsoleModule contract
    dates.ts      local-time day/week/streak helpers
    useNow.ts     ticking-now hook (minute interval + visibilitychange)
    ids.ts        makeId()   ·  storage.ts  storageAvailable()
    sleep/        THE NIGHT (see below) — the only wing-shaped thing in core,
                  because it has two consumers from birth
    store/shell.ts  app-wide store: { skin, weekStart, wing prefs } @
                  `majordomo-shell` v4
    ui/           index.css (skin bundles) + skins.ts (SKINS flags) +
                  Sheet / ConfirmDialog / SegmentedControl (shared primitives)
  modules/
    watch/        'THE WATCH' — shifts: post a watch of any shape from the user's
                  own shift templates or a custom one (writes core/events; a
                  cross-midnight watch pencils a recovery-sleep block), duty ring,
                  countdown
    training/     the whole workout tracker (see below)
    study/        'THE STUDY' (founder: THE ACADEMY) — subjects w/ weekly-hour rings,
                  plan-then-fulfill sessions (kind 'study' events, sourceRef
                  'subj:<id>'), homework/exam allDay markers ('hw:'/'exam:'),
                  syllabus checklists; spec: majordomo-study-spec.md
    workshop/     'THE WORKSHOP' (founder: APPLIED SCIENCES) — ventures (side
                  projects) w/ weekly bench-hour rings + a lifetime odometer,
                  Study-pattern sessions (kind 'workshop', sourceRef 'proj:<id>'),
                  dated milestones as trailing allDay markers ('ms:'), the app's
                  only live timer (persisted `bench`, DOWN TOOLS writes a
                  born-done event, refused mid-sandbox, app-wide header chip),
                  task delivery deadlines as trailing allDay markers ('due:',
                  hour in the chip title), and a per-venture PEGBOARD: on
                  desktop a FREEFORM wall — cards (note/task/link) carry an
                  optional (fx,fy), the old column layout is only the default
                  for never-dragged cards, drag-to-place writes fx/fy, a
                  heading drop re-ranks `col` by x so the phone's page order
                  follows, orthogonal copper threads route off live positions,
                  child→heading ties draw as faint stitched lines, hover glows
                  the card and marches its lines (thread: away from hand;
                  tie: toward heading), eyelet-drag threads/cuts, the wall
                  draws its own EDGES (perforation + frame + corner brackets
                  on the board element, never the viewport; MIN_BOARD_* floor,
                  and the extent grows live under a drag). Pressing a HEADING
                  on either surface opens THE COLUMN sheet — its cards listed
                  in `row` order, each strikeable/reorderable/removable and a
                  door into that card (closing returns to the list); the phone
                  keeps the grouped column pager (col/row still maintained)
                  with two-tap threading, and a rail tap mid-pick is a no-op.
                  Design: 'Workshop Wing -
                  Pegboard.dc.html' in the Claude Design project (pre-freeform;
                  directional). The 6th tab folds the mobile bar's overflow
                  behind a WINGS tab (TabBar BAR_WINGS / INLINE_WINGS — four
                  wings ride the bar, three once a fold takes a slot, so
                  switching two off in settings retires the fold entirely).
    capital/      'WAYNE FUND' — net worth + budget console (see below)
```

Everything under `core/` beyond the contract got there by the **extract-on-contact**
rule: `Sheet`/`ConfirmDialog`/`SegmentedControl`, `makeId`, `storageAvailable`, and
`useNow` all lived in training until Wayne Fund became the second consumer.

**`Sheet`'s close contract**: the backdrop dismisses on **click, never
`pointerdown`** — a press that starts on the scrim and ends on the surface (a slip,
a drag out of an input) must not throw the sheet away, and `cursor-pointer` on the
scrim is load-bearing (iOS only delivers click on a non-interactive element that
looks clickable). A sheet holding unsaved work passes `dirty` and Sheet puts a
`ConfirmDialog` (copy: `voice.ui.discard`) between the backdrop/Esc and `onClose`;
Esc closes that confirm first, keeping the draft. `dirty` must mean *differs from
the store*, not *was touched* — SpendSheet is the reference implementation. Save
paths call `onClose` directly and never see the guard.

### The ConsoleModule contract (`src/core/module.ts`)

```ts
export type ConsoleModule = {
  id: string
  name: string
  status: 'online' | 'offline'
  Tile: React.FC        // live stat on the menu tile
  Screen: React.FC      // the console itself
  Upkeep?: React.FC     // effect-only housekeeping, mounted by the Manor
}
```

Components are prop-less: a console reads its own stores inside its wrappers
(see `modules/training/index.tsx`). **`Upkeep` renders nothing** — it is where a
wing's marker reconcile, session prune and crew work-ledger patch live, and the
Manor mounts every wing's so those run whether or not the wing is ever opened.
They used to ride inside each wing's briefing ROW; the rows are gone (see THE
BRIEFING below) and a heal pass must not live inside a component that might be
deleted. The wing screens still render their own `BriefingPanel` directly.
Navigation is the tab header (desktop) / `TabBar` (mobile) over **`useWings()`
in `app/wings.ts`**, not over `CONSOLES` directly: `app/consoles.ts` is the
house's order, `wings.ts` reconciles it against the household's own (settings →
THE WINGS: nudge up/down, switch off) and is the only thing either nav reads.
A saved id this build doesn't know is dropped and a registered wing no saved
order mentions is appended, so adding or removing a wing needs no migration.
Switching one off takes it off both navs ONLY — its store, its `Upkeep` and its
briefing facts carry on, and something that asks for it by name (the onboarding
walk, the bench chip) still opens it. The header's Log Workout button renders **only while the
Grounds is open** and reaches the add sheet via a one-shot mailbox
(`modules/training/uiStore.ts` `requestAddSheet`) — never lift console state
into the shell for this. (`ConsoleModule.Tile/Icon/status/tagline` currently
have no consumers — kept as scaffolding for wing-management later.)

### THE VALET — the butler bubble (`src/app/butler/`)

One line, once, then a quiet chip in the corner — the heads-ups engine carried
off the Manor to wherever the reader is standing.

- **It is a SECOND RENDERER, never a second engine.** `app/manor/headsUps.ts`
  computes every condition and returns `matters`; the Manor's strip prints the
  first two `strip: true` ones as prose, the bubble shows the single loudest of
  all of them. That file's own history is the reason (`the two used to compute
  this separately and contradict each other on screen`) — never re-derive a
  fact here that a wing already knows.
- **The cap gates PRINTING, not collecting.** `HEADS_UP_CAP` used to stop the
  engine mid-sweep, so conditions after the second hit never ran. Invisible
  while the strip was the only reader; wrong the moment something asked "what
  is the loudest thing in the house?".
- **`urgency` is the dials.ts scale** (examclock 8 at the top, ambient 1–3), so
  the bubble and the instrument board agree about what is loud.
- **`Go` is DATA, never a closure** — the engine names the room, the component
  posts to the mailboxes (`useNavStore`, the Manor's quick-add/night, the
  Workshop's board, `authUi`, `settingsUi`). Navigate-only, always: it opens the
  room that owns the deed and never performs it (THE PATTERN's precedent).
- **Silence is the default.** Nothing at all with no records, during the
  onboarding walk, or under `navigator.webdriver` — the harnesses drive `?demo`,
  whose fixtures guarantee matters, and a fixed corner element can swallow a
  click meant for the grid. The stated cost: **no automated coverage of this
  component**; verify it by hand with `?butler`. A what-if sandbox blocks a new
  announcement but not the chip.
- **A room offer is not a tutorial** (playbook: a screen needing explanation is
  a wrong screen). It needs an estate ≥ 7 days old, no other matter waiting, a
  wing not switched off — and happens exactly once in the life of the estate.
- `settingsUi.ts` is the second opener of the settings page, the way `authUi` is
  the second opener of the login door.

### THE BRIEFING (`src/app/manor/briefing/`)

Below the week grid: **one written brief**, **four instruments**, and a shelf of
the rest. It replaced the accordion of one row per wing. Design source is
"Manor - New Briefing.dc.html" in the Claude Design project.

- **The brief is one paragraph**, greeting → a clause per wing in that wing's
  own colour → sign-off. Each clause is an **area** the reader can switch off in
  **THE PEN**, so every clause must be a whole sentence that survives its
  neighbours being deleted — none may open with "and" or refer to the one
  before it. Copy lives in `voice.briefing.brief.line` / `.counsel`; the areas
  and their wing order live in `Pen.tsx` `AREA_GROUPS`. THE NIGHT owns a group
  there without being a wing: its two clauses (`sleep`, `rest`) used to hang off
  the Watch, which meant sleep was invisible to anyone who had never stood a
  shift.
- **Facts come from the wings, never re-derived.** `facts.ts` calls each wing's
  `use…BriefingFacts()` — the very hook that wing's own panel calls — so a
  sentence on the Manor and a panel on a wing cannot quote different numbers. A
  wing with nothing on file reads `null` and writes nothing.
- **It types once.** The first render of a session where the text differs from
  the hash in `majordomo-brief-hash` animates; every later change (an hour
  turning over, a strain figure rounding) swaps in silently. Retyping a
  paragraph under someone mid-read is not charm. Anything printed in the brief
  must therefore be **stable within an hour** — this is why the next shift is
  named by its clock time and not by a countdown.
- **The instruments are a memoised ELEMENT, not just memoised data.** The
  typewriter sets state once per character; without that memo every keystroke
  re-rendered four charts and a sixteen-plate body map, which was slow enough to
  make the Manor harness miss clicks.
- **Every dial draws real records.** A dial whose wing has nothing on file is
  never built, so it cannot reach the shelf or the board — an empty chart is a
  worse answer than no chart. `urgency` in `dials.ts` decides the house's own
  four and stops mattering the moment the reader places a chip.
- Charts are drawn with `preserveAspectRatio="none"`, so **anything circular
  must be an HTML element positioned in percent**, never an SVG `<circle>` —
  the Ledger's trend chart learned this first.

### THE NIGHT — sleep (`src/core/sleep/`)

Optional sleep tracking: two clock times a morning, the figures that fall out of
them, and one scalar those figures hand the strain engine. It is **not a wing** —
no tab, no screen, no ConsoleModule — it is a record type the Manor writes and
the Grounds reads.

- **It lives in `core/` and that is the extract-on-contact rule, not an
  exception to it.** Two consumers exist the day it ships: the Manor writes and
  reads nights, and the Grounds reads them through recovery. Modules may not
  import each other, so `modules/sleep/` could never have fed `lib/strain.ts`.
- **A night IS a calendar event** (`kind: 'sleep'`). There is no second table of
  hours — one would be free to disagree with the week on screen. The store keeps
  only what a block cannot carry: the optional rating and minutes awake, keyed by
  event id (the Study's session-meta split, exactly).
- **A record carries `sourceRef: 'slept:<wake day>'`; a pencil mark does not.**
  The estate has always drawn six hours in after a night watch
  (`modules/watch/lib.ts` `planWatchPost`) — that is a SUGGESTION, and counting it
  as sleep reports a week of rest nobody took. `isNightRecord` / `isPencilledNight`
  in `core/sleep/lib.ts` are the one pair of predicates that separate them, and
  everything reads them: the hatch on the week (`.booked-hatch`, whose comment
  already said "pencilled in on the estate's behalf" before this existed), the
  Watch's cycle card, the morning offer's wording, the ledger's every figure.
  Anything placed by hand is grandfathered as a record — dragging a block onto
  the week and calling it sleep has always been a person asserting they slept.
  **Never add `slept:` to `PROJECTION_PREFIXES`**: a night is a record and
  records are carried.
- **The ledger's default is RECORDS, and the default is the mechanism.** For a
  fortnight the predicates existed and the figures ignored them: `nightsIn` took
  every sleep block, so a shift worker who posted a roster and never touched the
  sleep feature collected an average, a debt and a body clock made entirely of the
  app's own six-hour guesses — and once four landed in a trailing week the
  Grounds slowed its recovery clock on the strength of them. So `nightsIn` now
  filters to `isNightRecord` unless a caller passes `{ includePencilled: true }`
  (`NightScope`), and `sleepStats` — the ledger's own question, "what did you
  sleep" — has no such parameter at all. `SleepStats.pencilled` is the ONE field
  that knows pencil marks exist, and it exists so a surface can explain an empty
  figure rather than fill one in. The two callers that must still see a pencil are
  the morning offer and the night sheet, and both reach it through `nightOf`,
  which returns the record if there is one and the pencil otherwise — which is
  also what stops a leftover suggestion beside a confirmed night from summing to
  a thirteen-hour night.
- **A night belongs to the morning it ENDED on.** That is the one convention that
  survives a night shift — 23:30 → 07:10 and 09:00 → 15:00 are both Tuesday's
  night — and it is why the sheet pages MORNINGS and derives the bedtime's date
  from the two clocks rather than asking (`night/write.ts` `nightWindow`), which
  makes a negative or 26-hour night unrepresentable. The Manor's own week line
  still splits a cross-midnight block across two columns; the two figures differ
  at week edges by design, the way `WeekAttribution`'s two modes do.
- **A night with no record is a GAP, never a zero.** Averages state what they
  averaged over, debt skips absent nights entirely, and the instruments draw
  nothing at all where a night is missing — which is what the `'band'` DialKind
  was added for (`briefing/dials.ts`, `geometry.ts`). A zero-height bar is a
  claim that somebody slept nothing.
- **The recovery coupling is the only place sleep moves another wing's numbers**,
  and it is deliberately small, capped and gated. `recoveryEffect` returns a
  scalar that multiplies the strain engine's per-muscle recovery clock
  (`lib/strain.ts` `muscleClock`) — above 1 the same session takes longer to
  leave you. It is **EXACTLY 1** when the settings switch is off or when fewer
  than four of the trailing seven nights are on file, so an estate that ignores
  this system is never quietly being modelled. Range 0.88–1.20. The input is two
  times typed on a phone, so every surface that shows it also prints the caveat
  (`SleepRecoveryNote` in the Grounds; `voice.night.recovery.caveat`).
- **Every caller of `computeStrains` passes that scalar** — read it from
  `useRecoveryScale()`. The default of 1 exists for the pure-math probes
  (`window.__engine`, the recovery scan's inner loop); a SURFACE that omits it is
  a surface reading a different body from the one beside it.
- **The body-clock instrument measures against a MEDIAN MIDPOINT, not the clock
  face.** Each night draws as a band relative to the middle of a usual night, so
  a daytime sleep and a night sleep are the same shape at different offsets and
  nothing has to wrap around midnight. Regularity decays exponentially
  (τ = 120 min) rather than linearly for the same reason: a straight line steep
  enough to separate an ordinary week bottoms out at three hours of spread, and
  a shift worker runs four or five as a matter of course.
- **Doors in**: the ☾ NIGHT button in the Manor's nav row (always there, never
  asks for anything), the morning offer above the week (`NightPrompt` — one
  morning only, 04:00–22:00, dismissible for the day, switchable off), a sleep
  block's own popover/mobile sheet, and QUICK ADD's Sleep template. The offer
  changes from a request to a confirmation when the estate has already pencilled
  the night in.
- **Never begs.** No streaks, no backlog of missed mornings, no congratulation
  for a long night. It states hours and moves on.

### Import boundaries (enforced by `eslint.config.js`, `npm run lint`)

- `src/core/**` may NOT import from `src/modules/**` or `src/app/**`
- console modules may NOT import each other (training ↛ capital, capital ↛ training)
- modules MAY import from `src/core/**`; `src/app/**` may import anything

**core is extracted ON CONTACT: only move something into core when a SECOND console
actually needs it. Never design core up front.** (Rules are regex patterns on relative
specifiers — dynamic `import()` isn't checked; it's a guardrail, not security.)

### The three stores (one localStorage key each, fully independent)

- **`majordomo-training` v5** (`modules/training/store.ts`) — `{ workouts, weeklyGoal,
  profile, customExercises, skin }`. Workouts may carry optional `setsTotal` /
  `durationMin` (the two session-size inputs on the effort step) and an optional
  `exercises` list (the named-lift flow) — all additive, so no migrate was needed
  and old blobs/exports round-trip. `customExercises` (exercises the user wrote
  themselves) landed the same way: a defaulted key an older blob simply lacks, so
  persist's shallow merge leaves the initializer standing. **Only a changed meaning
  needs a version bump.** The `skin` field is **legacy/frozen**: nothing reads or
  writes it anymore, but it stays in the interface/partialize/migrate so old blobs and
  exports round-trip unchanged. Do not bump the version for shell concerns.
- **`majordomo-shell` v3** (`core/store/shell.ts`) — `{ skin, weekStart }`. On
  true first boot it seeds from the legacy blob's `state.skin`; an existing
  shell blob always wins (persist rehydrates synchronously). Skins pass
  through `normalizeSkin` on migrate/rehydrate/set — founder-only ids fall back to
  `midnight` unless `VITE_FOUNDER_SKIN=1` (their CSS ships only in the founder bundle).
  v3 dropped the `ambient` background layer (idle animation cost on old machines);
  v4 added `onboarded`. It also carries `panelTips` and the wing preference
  (`wingOrder` / `wingsOff`, read through `app/wings.ts`) — all three defaulted
  keys added with **no version bump**, since an older blob simply lacks them and
  persist's shallow merge leaves the initializer standing. Only a changed
  meaning needs a migration. Deliberately NOT synced: which wings one screen
  shows is a fact about that device, exactly like the briefing's dial picks.
- **`batman-capital` v1** (`modules/capital/store.ts`) — Wayne Fund's data: accounts,
  snapshots, holdings, budget/spends, blur flag, plus the Twelve Data `apiKey` and the
  `prices`/`fx` quote cache. Entirely separate from the others.
- **`majordomo-events` v1** (`core/events/store.ts`) — the shared calendar: every wing
  writes `CalendarEvent`s through the store's actions (that action surface is the
  future Supabase seam), the Manor reads them. ISO-instant start/end, exclusive end,
  never day-bucketed; the week grid (`core/events/lib.ts`, **SEAM_HOUR = 0** —
  ordinary calendar days) splits cross-midnight events across their two columns
  with dotted "continues" edges (a duty-cycle seam stays one constant away).
- **`majordomo-study` v1** (`modules/study/store.ts`) — the Study's records: subjects,
  syllabus topics, homework, exams, plus per-session fulfillment metadata keyed by
  event id (sessions themselves are `majordomo-events` entries). Homework/exam actions
  write their Manor marker through the events store; `reconcileMarkers` heals drift
  (and trails overdue homework chips to today), never while a what-if sandbox is open.
- **`majordomo-workshop` v1** (`modules/workshop/store.ts`) — the Workshop's
  records: ventures, board cards + threads, milestones, per-session fulfillment
  metadata keyed by event id (sessions themselves are `majordomo-events`
  entries, exactly the Study's split), and the live `bench` timer — persisted
  so a reload cannot lose a running clock, but **never synced** (a stopwatch is
  one device's present, not a record). Milestone actions write their Manor
  marker through the events store; `reconcileMarkers` heals drift and trails
  overdue chips to today, never while a what-if sandbox is open.
- **`majordomo-watch` v1** (`modules/watch/store.ts`) — shift *shapes* only
  (`ShiftTemplate { name, startMin, endMin }`, minutes since local midnight,
  `endMin > 1440` = ends next day). The watches themselves are events. Four starters
  ARE the initial state (a rehydrated blob always wins, including an empty list);
  they carry **fixed ids and a constant `createdAt`** so two devices seeding
  independently produce identical records instead of eight shapes.

- **`majordomo-sleep` v1** (`core/sleep/store.ts`) — THE NIGHT: `notes` (the optional
  extras a night was given — a 1–5 rating, minutes awake — keyed by EVENT id, the
  Study's session-meta split), plus `targetH`, `coupling`, `morningPrompt`,
  `askedOn`. The nights themselves are `majordomo-events` entries; there is no
  second table of hours, deliberately. `targetH`/`coupling` SYNC (they change what
  every sleep figure means); `morningPrompt`/`askedOn` do not (whether one screen
  puts a line above the week at breakfast is a fact about that device).
- **`majordomo-briefing` v1** (`app/manor/briefing/prefs.ts`) — THE PEN: which
  clauses the brief covers, whether advice is written, and which four dials are
  on the board. Deliberately **never synced** — which dials one screen shows is
  a fact about that device, like the bench timer. `picks: null` means the house
  is still choosing, and it keeps choosing until a chip is placed.

- **`majordomo-butler` v1** (`app/butler/store.ts`) — THE VALET's ledger: the
  kill switch, `waved` (matterKey → day waved off), `announced` (matterKey → day
  last spoken) and `introduced` (rooms already offered, once ever). Both day
  books are **pruned on every write** — they only answer "was this today?", so
  yesterday's entries are litter. `announced` is PERSISTED and that is the whole
  of "announce once": a reload is not a new morning. Deliberately **never
  synced**, like `panelTips` and the briefing's dial picks.

**Storage keys** are `majordomo-shell` / `majordomo-training` / `majordomo-capital` /
`majordomo-events` / `majordomo-study` / `majordomo-workshop` / `majordomo-watch` /
`majordomo-sleep` / `majordomo-briefing` / `majordomo-butler`. The three pre-pivot `batman-*` blobs are adopted verbatim on first
boot (`adoptLegacyKey` in `core/storage.ts`) so each store's own zustand migrate chain
still applies; the old keys are left in place as insurance and never read again.

## Capital console — Wayne Fund (`src/modules/capital/`)

"How rich is the cave." Phase 1 = manual net worth + budget; **Phase 2 (done) adds
live-priced holdings** via Twelve Data. `index.tsx` is the ConsoleModule
(Tile = month-to-date spend vs budget; Briefing = "The Ledger" line — spend pace +
**live** net worth Δ; Screen = `CapitalScreen`).

- **Data model** (`types.ts`) — `Account { id, name, assetClass }`,
  `Snapshot { id, takenAt, balances: Record<accountId, number> }`, and `Holding
  { id, accountId, symbol, exchange?, currency, shares, costBasis }`. **The latest
  snapshot IS the current state** — no separate "current balance"; "Update balances"
  upserts one snapshot per local day. Net worth = Σ assets − Σ debts.
- **Live vs history split** — an account with ≥1 holding is **priced**: its *current*
  value = Σ live market value (holdings override the manual balance), while snapshots
  keep the value **stamped at capture time** so the trend chart stays truthful. So the
  Vault / allocation / accounts read live; the chart reads snapshots (+ an appended
  live "now" point when holdings exist). `lib/networth.ts` `liveNetWorth()` blends;
  `netWorthSeries()` stays snapshot-only.
  **Live is STRICT, like the snapshot stamp**: `accountLiveValue` only counts a live
  sum when EVERY holding of the account has a quote AND a ₪ rate — otherwise the
  account reads its latest snapshot balance, because a rate-1 cost-basis fallback let
  unconverted USD masquerade as ₪ in the Vault/accounts/allocation. `liveNetWorth`
  returns `degraded: string[]` (the blocking currencies) and the Vault owns up in one
  line; the accounts list flips `· live` to `· held`. The **portfolio board is the
  exception** — it keeps per-row market values and labels them in their own currency
  (`unconvertedCurrency`), which is honest because the row says which currency it is.
  **Strict must never mean unwritable, though**: a priced account with no live figure
  gets an ordinary field in Update balances, prefilled with its last saved balance and
  tagged `no quote` (`SnapshotSheet`). It was read-only there, so one holding plus a
  missing quote — no key, offline, a rate-limited tier, a ticker nobody prices — left an
  account with no balance box anywhere in the app, and a deposit into it could not be
  recorded at all. The stamp stays strict either way: live when there is a live figure,
  otherwise whatever the person typed, never cost basis and never a rate-1 conversion.
- **Prices** (`lib/prices.ts`, `lib/holdings.ts`) — Twelve Data `/quote` (batched by
  exchange) + `/exchange_rate` for FX. Prices are in each holding's **native currency**;
  net worth converts to ₪ via `fx` (currency→ILS). `refreshPrices()` (a store action)
  runs on console open + a manual button; quotes cache in the store so they show while
  refetching. Free tier 8/min·800/day → one quote call per exchange + one FX call per
  currency. Runs from the browser (Twelve Data sends CORS). **The API key is the user's
  own free read-only key, stored in `batman-capital` localStorage via the settings
  sheet — never in git; it grants no account access.**
- **Centerpiece** — "The Vault": dramatic total net worth + ▲/▼ (live vs last snapshot
  when priced), over a data-rich board (SVG trend chart, allocation bars, spend-pace
  card, accounts list, **portfolio board** with per-holding price / day-move / P/L).
  Charts are hand-rolled inline SVG using `text-accent` + `currentColor`, recoloring
  per skin for free (verified on Ironworks-Paper).
  The **▲/▼ row needs a basis** — `displayDelta()` in `lib/networth.ts` returns null
  (and the Vault/briefing then omit the row rather than print '▲ ₪0 vs last') when a
  lone snapshot has no prior point, or when a degraded live side is being compared
  with the very snapshot it fell back to. Both surfaces call that one function.
- **Trend chart conventions** (`NetWorthChart`) — axis dates are `Mar '26`, never
  `Mar 26` (a bare 2-digit year reads as a day). A range pill shows **only what its
  window holds**: fewer than two points renders the range's own empty state plus a
  *Show all*, never points from outside the window. The endpoint marker is an
  HTML span positioned in percent, NOT an SVG `<circle>` — the chart's
  `preserveAspectRatio="none"` would squash a circle into an ellipse, and at x=W half
  of it falls outside the viewBox (its overhang lands inside the panel's padding).
  Anything else pinned to a data coordinate needs the same treatment.
- **The budget** (`lib/budget.ts`) — a running **month-to-date spend** the user
  overwrites whenever they check their card app, vs a monthly target. `budgetPace()`
  linearly projects month-end spend and flags under/on/over.
- **Spending history** — the data is month-keyed (`spends` 'YYYY-MM' + dated
  `spendItems`), so the SpendSheet is a **month pager** (‹ July ›, opening on the
  current month, forward stopping at the present or the last month holding data).
  Card total + one-offs belong to the VIEWED month and save to ITS keys; **recurring
  is global** (not per-month data), as is the budget. The sheet keeps one draft per
  visited month and commits only the months whose values actually **differ from the
  store** — paging to look costs nothing, and an edit undone writes nothing.
  `monthlySpent()` semantics are untouched; the SpendCard's *History* button
  is just another door onto the same sheet. Each one-off row carries a **date**
  (`<input type=date>` clamped to the viewed month, keeping its time-of-day so
  same-day order holds) — the pager owns the month, the row owns the day.
- **A debt is a MAGNITUDE, and both halves of that are load-bearing.** A liability
  account's balance is what is OWED; `debt` subtracts at compute time. That was a
  convention nothing enforced: bank apps show a mortgage as a negative, so that is
  what people type, and `-bal` on a negative ADDED it — ₪50,000 in the bank beside a
  ₪400,000 mortgage shouted **₪450,000** instead of −₪350,000, in the Vault, the
  brief, the tile and permanently in the trend history, with a garbled `−-₪400K` on
  the accounts row as the only tell. Two changes, and both are needed. The snapshot
  sheet **refuses** a minus on a debt row (`voice.capital.debtNoMinus`, marker on the
  row, nothing written) — refused and never flipped, on the budget field's reasoning:
  clamping is the same silent rewrite. And `netWorthContribution` / `accountFigure`
  (`lib/networth.ts`) subtract the magnitude **whatever the sign**, so an estate that
  already holds one — stamped before the fix, imported, or synced from a device that
  never saw it — reads right without rewriting a stored record. An **asset's** minus
  is untouched: an overdraft is a real negative and must stay one. Anything totalling
  or printing `liveAccountValue`'s raw figure goes through those two helpers first —
  `Vault`'s `Figure` and the accounts row draw their own faint `−`, so they are handed
  a magnitude, never a signed number.
- **A typed row is never silently dropped.** Amounts are **signed**: a minus on a
  one-off row is a refund and subtracts through the month total, the card, the tile
  and the briefing (`SpendCard` clamps its bar at both ends — an unclamped negative
  width renders FULL). A row with a name but no usable amount **blocks Save** with a
  marker on the row (paging to the offending month first, since a marker you can't
  see is no help); only a wholly untouched blank row is dropped. The budget and card
  snapshot are forward-only totals, so a minus there is **refused, not clamped** —
  clamping to 0 is the same silent rewrite. Nothing in this sheet displays one number
  and stores another.
- **Money math** — `lib/money.ts` (`formatILS` uses **en-US locale so ₪ is an LTR
  prefix** — he-IL scrambles word order inside the English UI, and both formatters
  rewrite Intl's hyphen-minus to the **U+2212** every sign this app draws by hand
  already uses — a negative total is ordinary for anyone whose mortgage outweighs
  their savings and must not read as a stray character beside the `−₪400K` below it), `ASSET_CLASSES`
  (labels + fixed categorical allocation colors). `<Amount>` blurs values (hover to
  reveal) when `blurAmounts` on.
- **Currency is ₪** throughout. Crypto type exists in the model but has no feed yet;
  **Polymarket** and richer budgeting are later phases.

## Training console (`src/modules/training/`)

Centerpiece: an SVG "muscle topography" body map, heat-colored by current strain,
computed from past workouts + recovery-time decay. Layout inside the module mirrors
the old flat app: `types.ts`, `store.ts`, `data/muscles.ts`, `lib/*`, `components/*`,
plus `TrainingScreen.tsx` (the console screen), `Briefing.tsx` (`GroundsBriefing` +
the `useGroundsBriefingFacts` hook the Manor brief also reads) and `index.tsx` (the
ConsoleModule: Tile = sessions this week vs goal; `Upkeep` owns the DEV
`window.__strains` assignment so it's live even on the menu).

- **Skins** — seven visual directions from the Claude Design doc ("Design
  Directions.dc.html": Gotham Gold + its Daylight light variant, Tac-Ops Console,
  Noir Ledger, Ghost Protocol, Ironworks + its Paper light variant), switchable at
  runtime via gear menu → **App skin** (persisted `skin` in the shell store; applied
  as `html[data-skin=…]` by `applySkin` in `src/core/ui/skins.ts`).
  Nearly everything lives in CSS: each skin is a variable bundle in
  `src/core/ui/index.css` re-declaring the `@theme` tokens (colors, `--radius-*`,
  fonts) plus surface vars consumed by component classes (`.panel`, `.card`,
  `.card-title`, `.btn-cta`, `.btn-soft`, `.btn-log`, `.chip`, `.seg`,
  `.sheet-surface`, `.menu-panel`, `.stat-num`, `.slider-*`). Components use these
  classes for *material* and keep Tailwind utilities for layout; state utilities
  (`hover:*`, selected borders) still win because skin structural overrides sit in
  `@layer components`. TS-side flags (`SKINS`) cover what CSS can't: per-skin heat
  ramp (`strainColor.ts` `HEAT_STOPS`: `standard`, Noir's vermilion duotone, and the
  light skins' `daylight` pastel ramp), `glowScale` (light skins damp the body-map
  glow), Ghost's floor reflection, Tac-Ops' status strip, Noir's `fig. 1` caption,
  and the `<header>` variants in `app/App.tsx` (keyed on `SKINS[skin].header`, so the
  light variants share their dark twin's masthead). Light skins also re-declare
  `--backdrop` (sheet scrim) and set `color-scheme: light`; Daylight remaps
  `text-accent` to the deeper ink-gold and gives accent-filled `text-bg` elements
  ink text (see the unlayered rules under the skin bundles). Noir inverts
  sheets/dialogs to ivory paper by re-declaring the color vars inside
  `.sheet-surface`; Noir's `№ 0N` section numbers are a CSS counter on `.card-title`
  (menu tiles participate too — intended). `rounded-pill` (`--radius-pill`) is the
  "pill that squares off" radius — use it instead of `rounded-full` for anything that
  should go rectangular on the brutalist skins (keep `rounded-full` only for true
  circles/dots). Fonts are self-hosted `@fontsource` imports in `main.tsx` (Rajdhani,
  Chakra Petch, IBM Plex Mono, Instrument Serif, Saira, Anton).

- **Strain model** — biphasic recovery, all constants in
  `src/modules/training/lib/strain.ts`.
  Each workout's contribution = load × muscleFactor × (acute + delayed):
  - **acute** phase peaks immediately (neuromuscular/pump), fades in ~1–2 days;
  - **delayed** (DOMS) phase is ~0 at t=0, rises to a peak ~24–30h, resolves by ~6.5 days.
  Heavy/low-rep = acute-dominant (big immediate hit, fast recovery); light/high-rep
  = DOMS-dominant (smaller hit, sorer next day) — so a muscle can read hotter
  tomorrow than tonight. Per-`RepStyle` acute/doms amplitudes; **per-muscle recovery
  clock** `MUSCLE_RECOVERY` (~0.8 forearms/calves → ~1.4 quads/hams, from the
  fatigue/MPS τ table, ordering by size + fiber type + daily use); near-failure
  (from effort) deepens+lengthens DOMS; smoothstep taper to 0 near the cutoff.
  **`load = effort × (0.85 + 0.3·strainFeel/10)`** — effort dominates (proxy for
  proximity-to-failure / motor-unit recruitment, Henneman); felt-strain is only a
  ±15% corrector (DOMS ≠ hypertrophy). Secondary muscles ×0.5. Grounded in the
  hypertrophy/recovery literature (see [[workout-recovery-science]] memory). Strain
  is always recomputed from raw workouts — never persisted — so constants tune freely.
  **THE NIGHT multiplies the per-muscle clock** (`muscleClock(m, scale)`): an
  under-slept week stretches every muscle's timeline together, capped at ±20 % and
  neutral until four of seven nights are on file — see the THE NIGHT section.
- **Weekly volume mode** — `modules/training/lib/volume.ts` estimates "effective hard
  sets" per muscle over a **trailing 7 days** (deliberately not the calendar week —
  no Monday reset), classifies each against RP-style MEV/MAV/MRV `LANDMARKS`, and the
  body map has a **Strain | Volume** toggle. A session logged **exercise by
  exercise** skips the estimate entirely: every set was written down against the
  exercise that held it, so each muscle is credited DIRECTLY (per-exercise role,
  ×0.5 for assisting, × the same effort discount). Its per-muscle total legitimately
  exceeds the session's set count — that is the RP convention the landmarks are
  stated in, where a bench set is one chest set AND a fraction of a triceps set.
  **Anything summing `sessionSets` across all muscles to get a session's size is
  therefore wrong and must call `sessionBudget` instead** (the Manor's volume dial
  did, and was corrected). Otherwise sets come from a per-session **budget** split
  across the muscles trained, most-informed source first: the logged
  `setsTotal` (verbatim; discounted below effort 5) → `durationMin` × ~18 sets/h →
  a saturating muscle-count estimate — so a chest-only day credits chest ~2.6× what
  a five-muscle day does, instead of the old flat per-muscle constant. Plates paint
  by continuous band position (0 untrained → 1 MEV → 2 top of MAV → 3 MRV) and a
  deload hint shows when ≥2 muscles pass MRV. `BodySvg` is mode-agnostic (takes
  `colorFor`/`glowFor` callbacks). It's an estimate in the app's own units unless
  sets were logged — landmarks are tunable. **Lifts only**, the policy stated in
  volume.ts's header: sets-based surfaces count `isLift`; strain and energy count
  everything.
- Still not modeled (needs data the app doesn't log): per-exercise contribution
  vectors (finer synergist/stabilizer tiers than flat ×0.5), per-set diminishing returns.
  Detail sheet uses `workoutActivity` (% of peak) + `recoveryPhase` for wording.
- **Runs** — `method: 'run'` + optional `run { distanceKm, durationMin }`. Muscles are
  denormalized at save time from `RUN_MAP` (calves/quads primary; hams, glutes, trunk
  secondary) with `repStyle: 'light'`, so runs feed the **strain engine** like any
  session. They are NOT lifting sessions: `isRun()` excludes them from the weekly goal
  count, the workouts/week chart, and the RP set-volume landmarks. They DO cost energy —
  `workoutWeightedSets` prices a run from time on feet (`RUN_SETS_PER_H`), distance at
  6 min/km when only distance was logged.
- **Weekly goal** — persisted in the training store (`weeklyGoal`, 0 = no goal).
  Tracked against the current *calendar* week (start honors the shell's `weekStart`).
  "Behind its week" = groups whose trailing-7-day sets sit under half their target
  (Σ per-muscle min(MEV, own 4-week baseline)) via `groupWeeks` in
  `lib/trainNext.ts` — the same units and window as the body map, so the card and
  the map can't disagree. `trainNext` adds a strain gate on top
  (`READY_STRAIN = 3.5`): a group both **recovered and behind** becomes the
  briefing aside's "what to train next" recommendation.
- **Nutrition engine** — `modules/training/lib/nutrition.ts`, training-aware macros.
  Protein FLAT (~1.9 g/kg, split over meals — total intake matters, not timing);
  calories & carbs FLEX with training load. Mifflin–St Jeor BMR × rest-day activity
  factor = maintenance; training days add a surplus + per-session kcal (min-capped
  450); carbs = a chronic weekly-load floor (3–4 g/kg, from `avg7WeightedSets`) +
  per-session carb bump; fat = calorie remainder with a ~0.6 g/kg floor that trims
  carbs when hit. Session load is an ESTIMATE (`workoutWeightedSets`:
  SESSION_SETS_BASE×effort×muscle-size `ENERGY_WEIGHT`), except that a logged
  `setsTotal` stands verbatim and a logged `durationMin` prices the session by time.
  All coefficients live in `Profile` (persisted, editable via the gear-menu
  **Profile & nutrition** sheet) — recalibrate to weight trend. Grounded in the
  nutrition build-spec (see [[nutrition-lean-bulk-science]] memory). `profile` also
  drives the Grounds **briefing** (`Briefing.tsx`) and the `NutritionCard`.
- **Body map** — `modules/training/components/bodymap/paths.ts` is data-only (SVG
  path strings, viewBox 200×440). Paired muscles are authored as LEFT-half paths and
  mirrored via `transform="translate(200 0) scale(-1 1)"` for guaranteed symmetry.
  The silhouette is one half-path closed along the centerline, rendered twice.
- **Named exercises** — the fifth door on the add sheet's method step: pick
  exercises from a catalogue, log **kg × reps per set**, with last session's numbers
  standing as the row placeholders. It is a parallel path, not a replacement: PPL /
  PICK MUSCLES / RUN / SPORT are untouched. A session saved this way is still
  `method: 'custom'` (no new union member, so nothing that classifies a session had
  to learn a shape) carrying `exercises`; its muscles, `setsTotal` and rep-style
  prefill are all **derived** from the list, and the effort step's Working-sets field
  is replaced by what the log counts — a box that takes a number and then overwrites
  it is the Ledger's cardinal sin. Names and muscles are copied onto the workout at
  save, the PPL rule, so re-vendoring the catalogue never rewrites history.
  - The catalogue is **736 entries generated into `data/exercises.ts`** and reached
    only through a dynamic import (`data/catalogue.ts`), so its ~100 KB stays out of
    the entry chunk the boot curtain covers and is precached like any other script —
    the picker opens offline. It is code, not records: **never synced.** The user's
    OWN exercises are records (`customExercises`, id prefix `cx-`) and ride the
    grounds sync source as a new `'exercise'` kind.
- **PPL workouts resolve to concrete muscle lists at save time** (denormalized into
  each Workout) so tuning `PPL_MAP` in `modules/training/data/muscles.ts` never
  rewrites history.
- **Dates**: all day/week/streak bucketing uses local-time helpers in
  `src/core/dates.ts`. Never bucket with `toISOString().slice(0,10)` (UTC shift bug).
- **Entrance animations** start from a visible state on purpose (see comment in
  `core/ui/index.css`) — a frozen animation must never hide content.

## The front door — `?landing` (production, NOT a dev flag)

One document serves both the landing page and the app; `public/boot-gate.js` decides
before first paint which one a browser sees, and `src/main.tsx` loads the matching
chunk. **`?landing` is that decision, overridden by hand** — the front door's own
address. Settings → HELP & TIPS → *The front door* navigates to it
(`app/frontDoor.ts`), and the landing's CTA comes back the other way.

- **Three files must agree** on who is at the door: the boot gate (which shows or
  hides the prerendered markup), `main.tsx` (which picks the chunk), and the CTA
  (which is the way back in). The two questions themselves live in ONE place —
  `src/landing/arrival.ts` — and the boot gate restates them in ES5 because the CSP
  forbids an inline script. Change one, change the gate.
- **It navigates rather than swapping the root in place**, which is the reverse of
  `landing/enterApp.ts`. `bootApp()` is not re-entrant — it registers the service
  worker, opens the registry, starts sync and takes the root — so a round trip
  inside one document would run all of it twice. A fresh document costs a frame and
  the shell is precached, so this works offline.
- **`enterApp()` strips the param** before booting. Left standing, the next reload
  would walk the user straight back out of his own app — the same reasoning as the
  `?join` gate.
- **A resident's revisit is not counted.** `mountLanding({ revisit })` skips
  `startAnalytics()` when the browser already holds an estate: the landing's numbers
  are about strangers, and the owner sightseeing would quietly inflate them.
- **The CTA's copy changes for a resident, in an EFFECT and never during render.**
  The page is prerendered and hydrated; build-time markup cannot know whose browser
  it lands in, so deciding that copy on the first render mismatches hydration on
  every visit that has an estate.

## Dev-only URL params (guarded by `import.meta.env.DEV`)

The app opens on the **menu**. `?console=<id>` (e.g. `?console=capital`) opens any
console directly; the training aids `?sheet` / `?detail` / `?map` / `?debugmap` also
auto-enter Training so they land on the right screen.

- `?demo` — seeds fixtures into empty stores: 10 workouts, the Wayne Fund demo
  (8 accounts, 6 ~monthly snapshots ending today, budget + spend, 2 live-priced
  holdings with cached quotes so the board renders without a key), **and** the
  Manor's "brutal week" (4 night watches + sleep + training + study + payday,
  plus a quieter next week) — screenshot aid
- `?consent` — shows the consent door (DEV never shows it unprompted; accepting
  stamps the shell store, so clear `majordomo-shell` to see it again)
- `?gcal=` and `n=` are **NOT on this list and must never join it** — they are
  the Google walk's production return door, stripped by `initGcal()` before the
  rest of boot runs, and `n` is half of a live credential. A dev aid that forged
  one would be forging a claim. Nothing to simulate anyway: the demo interlock
  above disarms the bridge on any origin that has ever been `?demo`'d, so no
  screenshot or harness run reaches Google.
- `?manor=month` — opens the Manor in month view · `window.__events` — events store
- `?night` — opens THE NIGHT's sheet on this morning (screenshot aid)
- `?butler` — forces THE VALET's card open on the current top matter, and is the
  ONLY way to see it under automation (it stands down for `navigator.webdriver`)
  · `window.__butler` — its ledger store
- `?console=training|capital` — start the shell inside that console
- `?skin=midnight|terminal|aurora` — forces (and persists) a preset — handled by
  the **shell** store (founder machines also accept the seven legacy skin ids)
- `?sheet=add` / `?sheet=effort` / `?sheet=when` / `?sheet=sport` / `?sheet=muscles`
  / `?sheet=exercises` — opens the add sheet on load (effort = edit mode on newest
  workout; when = also expands the calendar; sport / muscles / exercises = the blank
  flow open on that picker)
- `?sheet=skin` — opens the App-skin picker sheet on load
- `?board` / `?board=<ventureId>` — opens the Workshop on a venture's pegboard
  (first venture when unnamed) — screenshot aid · `window.__workshop` — store handle
- `?detail` — opens the newest workout's detail sheet
- `?map=volume` — starts the body map in weekly-volume mode
- `?debugmap` — rainbow-colors every muscle plate to spot gaps/overlaps
- `window.__store` / `window.__strains` — training store handle + live strain map in dev
- `window.__capital` — the Wayne Fund store handle in dev · `window.__ledger` — the
  pure net-worth model (`netWorthOf`, `liveNetWorth`, `netWorthContribution`, … — the
  ledger harness scores the sign contract through it without a React round-trip)
- `window.__study` — the Study store handle in dev
- `window.__watch` — the Watch's shift-shape store handle in dev
- `window.__sleep` / `window.__night` — THE NIGHT's store handle and its pure model
  (`nightsIn`, `sleepStats`, `recoveryEffect`, … — the night harness scores
  attributions and debts through it without a React round-trip)
- `window.__engine` — the strain module (sample `recoveryEnvelope(t, style, muscleFactor, nf)`
  to plot recovery curves without React round-trips)
- `window.__volume` / `window.__trainNext` — the volume estimator and the
  train-next selector (probe `sessionBudget`/`sessionSets`/`trainNext` the same way)
- `window.__recast` — what a mid-edit method change would cost (`recastLoss`), the
  model behind the add sheet's guard
- `window.__nutrition` — the nutrition module (`dailyTargets`, `bmr`, … for macro checks)

## Environment quirk (this machine's Claude browser pane)

The in-app browser pane may freeze CSS animations and time out on screenshots while
JS execution keeps working. For reliable screenshots use headless Chrome instead —
note it clamps window width to ~500px, so emulate mobile with a doubled window and
`--force-device-scale-factor=2`:

```
chrome --headless=new --disable-gpu --hide-scrollbars --window-size=750,1624 \
  --force-device-scale-factor=2 --user-data-dir=<fresh-tmp> \
  --virtual-time-budget=6000 --screenshot=out.png "http://localhost:5173/?demo"
```
