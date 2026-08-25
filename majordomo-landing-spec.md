# MAJORDOMO — The Landing Page Spec
### Direction + copy + build plan for the beta waitlist page · v1 · July 2026
*(Companion to `majordomo-playbook.md` §6.4 and `majordomo-build-plan.md`. This doc
is the single source of truth for the landing page: what it says, how it looks,
and how it gets built. Written to be handed to Claude Code milestone by milestone.)*

---

## §0 · The one-page summary

**What this is:** one page, one job — turn a stranger with a hostile schedule
into a beta waitlist signup in under a minute.

**The three locked decisions (July 28, 2026):**
1. **Voice = fusion.** The *message* is discipline/mission ("made for the
   disciplined", "every mission needs a majordomo"); the *register* is
   the Majordomo's — dry, composed, understated. Headlines speak to the mission;
   microcopy is where the butler lives.
2. **Hero = code-built demo.** No video production. The "chaotic week snapping
   into ordered noir" moment is built in HTML/CSS/JS on the page itself, from
   the app's own tokens and materials. It stays crisp at any size and *is* a
   taste of the real UI.
3. **Home = its own project.** A separate tiny repo + Vercel project,
   indexable, ready to bind to the real domain. The app deployment stays a
   private, noindexed estate.

**The one metric:** visitor → signup. Waitlist pages average 10–20%; 20–30% is
good. Everything on the page either serves that number or gets cut.

**The governing principle (stolen from Linear's waitlist era):** *craft is the
proof.* For a product whose pitch is calm competence, a beautiful, restrained
page isn't decoration — it's the argument. The page is the first screenshot of
the product anyone sees. It must feel like the Manor before they ever open it.

---

## §1 · The mission of the page

**Audience:** the rotating striver (playbook §6.1) — 20–40, shift-based work,
trains seriously, studying or side-hustling, phone-first. They arrive from a
build-in-public clip or a Reddit comment, on a phone, probably tired.

**The 3-second test.** Before any scrolling, the visitor must be able to answer:
*what is it* (a calendar), *who is it for* (people whose schedule fights back),
*what do I do* (leave an email). If the hero can't carry those three, nothing
below it matters.

**The emotional arc, in order:**
1. **Recognized** — "someone finally built for *my* week." The headline names
   their pain before naming the product.
2. **Shown, not told** — the demo does the arguing. A 19:00–08:00 watch landing
   *whole* is worth three paragraphs to a guard or a nurse.
3. **Invited** — not marketed at. "Request an invitation," not "SIGN UP NOW."
   The scarcity is real (a beta of 50–150), so it never needs to be faked.

**Deliberate non-goals for v1:** no nav bar, no pricing page, no blog, no
feature grid, no multi-page anything, no cookie-consent theater (no cookies
needed), no chat widget. One page, one field, one button. Research is blunt
about this: navigation and extra fields are the two classic conversion killers.

---

## §2 · The mentality — the fusion doctrine

This is the section that governs every sentence and pixel. The user's stated
direction: discipline/mission-focused ("made for the disciplined", "for those
who go far", "keep your eyes on the mission", "every pilot needs its
navigator") — delivered through the butler.

### 2.1 The split, precisely

| Layer | Register | Owns |
|---|---|---|
| **The mission** (what is said) | Discipline. Hostile schedules. Going far. Respect for people who show up at 03:00. | Headlines, section titles, the founder note |
| **The Majordomo** (how it's said) | Dry, composed, understatement, quiet service. Never impressed, never surprised. | Microcopy: button states, form feedback, FAQ answers, the demo's briefing chip, the footer sign-off |

The headline earns attention with the visitor's own life; the butler earns
affection in the small print. A visitor should be able to *feel* the persona
without one headline being "in character." The page is the butler: it
anticipates questions (FAQ), asks for exactly one thing, and never raises its
voice.

### 2.2 The register rules (Appendix B, applied to marketing)

- Understatement over exclamation. **Zero exclamation marks on the page.** Zero emoji.
- "Sir" appears **only in the Majordomo's own utterances** — form feedback, the
  demo's briefing chip, the footer sign-off. Never in a headline, never in body
  copy that speaks *about* the product. (The page addresses a stranger; the
  butler addresses his principal. The moment they sign up, they've been taken
  on — which is why the success state is the first "sir" most visitors earn.)
- Numbers are specific or absent. "19:00–08:00", "50–150 testers" — never
  "10x your productivity."
- Nothing begs, nothing guilts, nothing counts down. Real scarcity (a capped
  beta) stated once, plainly.

### 2.3 The anti-register (what this page must never sound like)

Written down because every landing-page template on earth pulls toward it:

- **Hustle-bro:** "Crush your goals. Dominate your week." — No. Discipline
  culture at its best is quiet; the Majordomo is its butler, not its hype man.
- **AI-hype swarm:** Motion's actual hero is "Get an unfair advantage by using
  AI to double productivity" followed by nine "AI ___" nouns. We are the
  counter-position: one thing, done with manners.
- **SaaS-generic:** "Supercharge your workflow with seamless integrations." Any
  sentence that could appear on any product's page appears on ours never.
- **Desperate:** popups, exit intents, fake countdowns, "only 3 spots left!",
  bouncing arrows. The butler does not chase guests down the drive.

### 2.4 Why this works commercially (the research, one paragraph)

High-converting waitlist pages share five traits: a specific benefit-first
headline, an email-only form, one CTA, social proof near the form, and fast
mobile-first load. Notion's waitlist page — a logo, one sentence, one field —
converted over 50% from Product Hunt traffic. Arc collected ~350K emails with a
manifesto and a silent demo video. Superhuman *added* friction (a survey) and
made the wait feel like qualification. The pattern: **specificity + restraint +
a visible point of view convert; feature swarms don't.** Our voice doctrine
isn't just brand — it is the high-converting shape.

---

## §3 · The sentences

Full copy draft, in page order. Wording here is v1-final unless a line is
marked *(alt)*. All of it obeys §2. When built, these strings live in the
landing repo's own `voice.ts` — same discipline as the app.

### 3.1 Hero

**Wordmark:** MAJORDOMO — *(Big Shoulders, all caps, tracked wide; the "M"
monogram once a logo exists)*

**Headline (the pick — revised July 28 after review):**
> **Every mission needs a MAJORDOMO.**

*Treatment: the sentence sets in ink; MAJORDOMO alone sets in brass — Big
Shoulders, all caps, the only brass text on the page besides the CTA. The
headline is the wordmark moment (the top-left mark shrinks or vanishes on the
hero). The line teaches the name, the role, and the promise in one breath: a
majordomo is the one who runs the house, and the visitor's week is the house.
Because the headline no longer names the category, the subheadline's first
words must — it opens with "The calendar."*

**Subheadline:**
> The calendar for schedules that fight back — nights, doubles, rotations,
> exams. Made for the disciplined.

**Email field placeholder:** `you@example.com`
**Button:** `REQUEST AN INVITATION`
**Under-form line (small, dim):** Beta this autumn. 150 places. No spam — a
briefing when your invitation is ready.

**Hero alternates (kept for A/B once traffic exists, not before):**
- *(alt A — other blanks for the formula, same treatment)*
  **Every long night needs a MAJORDOMO.** *(noir, speaks straight to night
  shifts — strongest if the first push targets r/nightshift)* ·
  **Every brutal week needs a MAJORDOMO.** *(problem-first)* ·
  **Every empire needs a MAJORDOMO.** *(the playbook original — grandest,
  least specific)*
- *(alt B — two-beat)* kicker, small and dim: "Every pilot needs a navigator."
  → headline: **Every week needs a MAJORDOMO.** *(the stated tagline verbatim
  as the setup line)*
- *(alt C)* **Made for the disciplined.** as the headline itself, the formula
  line demoted to the sub.
- *(alt D)* **The calendar that survives your schedule.** *(the v1 pick,
  demoted July 28 — didn't move enough as the lead; retained as the meta
  title and an ad line)*

**Form states — the butler's first appearance:**

| State | Copy |
|---|---|
| Submitting | `One moment.` |
| Success | `Very good. Your place is held, sir.` |
| Invalid email | `That address won't reach you, sir.` |
| Duplicate | `Already on the list, sir. Patience.` |
| Network/server error | `The line is down. Try once more, sir.` |

*(These five strings are the whole persona in miniature. They will be
screenshotted and shared. Spend taste here.)*

### 3.2 The demo section (directly under the hero — see §6 for the storyboard)

**Caption line under the demo, one sentence:**
> A 13-hour night watch lands as one shift. Sleep pencils itself in. Training
> moves to where recovery says it should. That's the whole idea.

### 3.3 The three Wings (three panels, label + one sentence + one screenshot each)

> **THE WATCH** — Shifts that cross midnight land whole, and sleep after a
> night is pencilled in before you think to ask.
>
> **THE GROUNDS** — Training that knows what the schedule did to you: strain,
> recovery, and when it's wise to push.
>
> **THE STUDY** — Exam dates hold the line; study blocks find the cracks in
> the week.

**Section title above the trio:** `THE WINGS` with kicker: *One estate. Choose
what it runs.*

### 3.4 The what-if strip

**Title:** `ASK "WHAT IF" BEFORE YOU COMMIT`
**Body:**
> Drag the week into a different shape. Read the difference — hours gained,
> sleep lost, training kept. Apply it, or discard it as if nothing happened.
> No calendar on your phone can do this.

### 3.5 The briefing section

**Title:** `A BRIEFING BEFORE EVERY SHIFT`
**Body:**
> Most apps notify you at 07:00. If your watch starts at 19:00, that's the
> middle of your night. Majordomo reads the schedule and times the briefing to
> it — the smallest feature on this page, and the one that proves the point.

**The phone-notification mock (in the Majordomo's voice):**
> **Majordomo** · 16:30
> On tonight, 19:00–08:00. Legs are recovered; the gym fits at 15:00. I'd
> leave Thursday alone, sir.

### 3.6 The founder note (short manifesto — the Arc lesson)

> Every calendar I tried assumed my week looked like everyone else's. It
> doesn't — training, study and rest have to fit around hours I don't choose.
> So I'm building the one that runs my week instead. If your schedule fights
> back, this is for you.
>
> — Ido, building Majordomo in public · *(links: X · TikTok)*

*(The note deliberately does NOT name the founder's occupation. It stakes the
claim on the schedule, not on the job — the hostile-week thesis carries the
page on its own, and a bio line is not worth publishing an employer for.)*

### 3.7 FAQ (five questions, butler answers — each two sentences maximum)

> **When is the beta?** This autumn — 150 places, invited in order with a
> weight toward rotating schedules. The waitlist is the only door.
> *(Internal target is 50–150 per playbook §6.3; outward copy commits to the
> cap so the number is one number everywhere.)*
>
> **What will it cost?** The beta costs nothing. At launch: a free tier that
> stays genuinely useful, and a paid tier priced like a serious tool, not a
> subscription trap.
>
> **What platforms?** Any modern browser, installable on your phone like a
> native app. App stores follow when demand justifies them.
>
> **What about my data?** Yours. Local-first, exportable any time, no ads,
> nothing sold. An estate does not gossip.
>
> **Why "Majordomo"?** The chief steward of a great house — the one who runs
> the estate so its owner can attend to the mission. That is the entire
> product, in one word.

### 3.8 Footer

Repeat email field + button (same strings), then the sign-off, small and dim:

> The estate is being prepared. We'll hold your place, sir.

Below that: `© 2026 Majordomo · Privacy · Contact` — privacy is one honest
paragraph on a `/privacy` route (emails stored for the waitlist, deleted on
request, nothing else collected).

### 3.9 Meta copy (what search and link previews see)

- **`<title>`:** Majordomo — the calendar that survives your schedule
- **Meta description:** A calendar-first life OS for rotating shifts, serious
  training, and study — run by a dry, deadpan butler. Request a beta
  invitation.
- **OG image:** 1200×630, near-black `#0c1017`, the formula headline with
  MAJORDOMO in brass, one brass accent rule. No screenshot cram — it must read
  at thumbnail size in a dark Discord embed. *(The `<title>` keeps the
  descriptive line — meta titles do SEO duty, not poetry duty.)*

### 3.10 Language

English v1 (global reach; the build-in-public channels are English). Hebrew is
a voice-pack drop later, same as the app — the landing repo's `voice.ts`
structure must not block it. The אדוני register question is deferred until then.

---

## §4 · The palette

The landing page must be recognizably the same object as the app — same
near-black, same materials, same type. Three options, all derived from the
app's real tokens (`src/core/ui/index.css`), with one recommended.

### Option A — "Midnight & Brass" ★ recommended

Midnight base; the Ledger's ember gold is promoted to the *marketing* accent —
CTA, key highlight lines, the OG rule. Gold on near-black is the classic
premium/luxury signal (every palette guide agrees), it's the butler's brass,
and it leaves the app's steel-blue to do what it does on the page: color the
*product* shown inside the demo. Marketing surface and product surface stay
distinguishable forever.

| Role | Token | Hex |
|---|---|---|
| Page background | `--color-bg` | `#0c1017` |
| Panels / cards | `--color-panel` / `-2` | `#111826` / `#1a2232` |
| Recessed demo well | `--color-trough` | `#0b1017` |
| Hairlines | `--color-line` | `#1e2739` |
| Text | `--color-ink` | `#e6ebf2` |
| Dim text | `--color-ink-dim` | `#8b97a8` |
| **CTA + highlights (brass)** | `--color-ember` | `#d4ae6a` |
| Product/UI accents (inside demo only) | `--color-accent` + wing tokens | `#7da7d0` · `#68b984` · `#d4ae6a` · `#a78bda` |

CTA button: brass fill, `#0c1017` text, the app's glow-shadow recipe at low
opacity. Contrast: brass on bg ≈ 9:1, ink on bg ≈ 14:1 — AA everywhere, AAA
for body text.

### Option B — "Midnight True"

Exactly the app's Midnight, steel-blue `#7da7d0` CTA with `--shadow-glow-accent`.
Maximum product-truth — the page *is* the app. Risk: steel-blue is a calm color
doing an action-color's job; the one hot element on the page runs cool, and the
demo's watch-blue events compete with the button.

### Option C — "Terminal Ops"

True black `#000000` + mint `#3fe0a8` (the Terminal preset). Hits the
discipline/military register hardest. Risks: reads dev-tool rather than
estate; and the app boots into Midnight, so the first real screen contradicts
the page that sold it.

### Rules that hold under any option

- **Two chrome colors maximum** (base + one accent). The wing accents appear
  *only inside product imagery* as data — that's where the color variety lives,
  and it's on-doctrine: color = meaning, never decoration.
- Glow is a **state** (the live thing, the hovered CTA), never ambience.
- Film-grain/texture at whisper opacity only if it survives Lighthouse.
- AA contrast minimum everywhere, checked, not eyeballed.

### Typography (no new decisions — the app's pairing is the brand)

- **Big Shoulders** (`@fontsource/big-shoulders`) — wordmark, headlines,
  section titles, all-caps tracked kickers, every numeral. Tabular numerals on
  anything that counts.
- **Source Sans 3** — body, form, FAQ.
- Hero headline: clamp(2.5rem → 5rem), tight leading, `--color-ink`; the
  headline is typography-as-branding — no gradient text, no outline tricks.

---

## §5 · The page, section by section

Single column, max-width ~1100px, generous dark space. Mobile-first; every
section must be designed at 390px before 1440px. Order:

| # | Section | Contents | Height discipline |
|---|---|---|---|
| 1 | **Hero** | Wordmark (small, top-left) · headline · sub · email+CTA · under-form line | Everything above the fold on a 390×844 phone — including the button |
| 2 | **The demo** | The animated week (§6) in a `.trough` recess + §3.2 caption | The first thing revealed by the first scroll; autoplay, silent |
| 3 | **The Wings** | Three panels (§3.3), each with one real screenshot in `.booked` material | Stack on mobile |
| 4 | **What-if** | §3.4 copy + a 3–4s ghost-drag micro-animation (a block drags, diff panel ticks, APPLY) | One strip |
| 5 | **The briefing** | §3.5 copy + the phone-notification mock | The mock is HTML, not an image — crisp and translatable |
| 6 | **Founder note** | §3.6, plain text on bg, no panel — a letter, not a card | Short |
| 7 | **FAQ** | §3.7, native `<details>` styled to house material | No JS accordion library |
| 8 | **Footer** | Repeat form · sign-off · legal links | The second CTA; many convert at the bottom |

**Social proof policy (pre-launch honesty):** at zero signups, show none —
restraint reads better than "join 12 others." Once the count is honestly
respectable (≥100), one dim line near the hero form: `217 places requested.`
Live from the database, never inflated, never a fake ticker. The founder note
carries credibility until then — "built by one of you" *is* the social proof.

**Screenshot policy:** real app screens only, current design revamp, `?demo`
fixtures, shot at 2× via the headless-Chrome recipe in CLAUDE.md. Never mock
features that don't exist — the beta testers land in the real app weeks later
and remember the page.

---

## §6 · The hero demo — storyboard + engineering spec

The centerpiece. A ~10-second loop of the week coming to order, built from DOM
+ CSS transforms, no canvas, no video, no library.

### 6.1 Storyboard

| t | Beat | Detail |
|---|---|---|
| 0.0–1.5s | **Chaos** | A faint seamed week grid (hour rules, day columns). Five commitment blocks float misaligned and overlapping, small idle jitter: a 19:00–08:00 night watch spanning wrong, a 06:00 training block colliding with it, a study block half off-grid, an exam chip, an unplaced sleep block |
| 1.5–4.0s | **The snap** | Blocks spring into place one by one (staggered ~350ms, springy 200ms ease): the watch splits across midnight with dotted continues-edges (the app's real rendering), sleep hatches pencil in after it, training relocates to 15:00, study fills a gap |
| 4.0–5.5s | **The voice** | A briefing chip types on above the grid: `Watch at 19:00. Briefing at 16:30, sir.` |
| 5.5–8.5s | **Hold** | The ordered week rests; the current-time line breathes; one block glows `.booked-glow` as "live" |
| 8.5–10s | **Reset** | Blocks drift back toward scatter, opacity dips → loop |

### 6.2 Engineering rules

- **Materials are the app's, verbatim:** copy the `.booked` family (base, dim,
  hatch, cut-before/after, glow) and the token block from `index.css` into the
  landing repo. The demo must be indistinguishable from a real Manor
  screenshot at any paused frame.
- **Transforms and opacity only** — no layout properties animate, ever. Target
  60fps on a mid-tier Android; test with 6× CPU throttle.
- Orchestration: one small JS timeline toggling data-attributes per beat (or
  pure CSS `animation-delay` choreography if it stays readable). No GSAP, no
  Lottie — house style is hand-rolled.
- **`prefers-reduced-motion`: the final ordered frame, static.** The frozen
  state must be the *good* state (the app's own entrance-animation doctrine).
- Mobile variant: one day column (the night-watch day), same beats — the split
  across midnight is *more* visible in a single column, and it's the money shot.
- The demo is `aria-hidden` decoration; the §3.2 caption carries the meaning
  for screen readers.

---

## §7 · Build: stack, waitlist, and plumbing

### 7.1 The repo

`majordomo-landing` — separate repo, own Vercel project. Same muscle memory as
the app: **Vite + React + TypeScript + Tailwind v4**, but static, one route
(+`/privacy`), no router, no state library. Structure:

```
src/
  tokens.css     the Midnight block + .booked family, copied from the app
  voice.ts       every user-facing string on the page (same rule as the app)
  demo/          the hero animation
  App.tsx        the page, top to bottom
```

Deploy: push-to-main → Vercel, interim URL `majordomo-landing.vercel.app`
(or any slug) until the domain exists. **Indexable** — this vercel.json wants
the *opposite* headers of the app's: no `noindex`, plus a real
`og:image`/`twitter:card` set.

### 7.2 The domain prerequisite (playbook §2.3, now load-bearing)

Before the first public post of the URL: run the name checks (app stores,
trademark quick-search), buy the domain, and point it at this project — a
waitlist link that changes URLs mid-campaign leaks every share that came
before it. This is the "Monday list" item that now blocks marketing, so it
lands in L0 of §8.

### 7.3 The waitlist backend — Supabase, the project that already exists

Table in the existing `majordomo` Supabase project:

```sql
create extension if not exists citext;
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  source text,                   -- the ?src= UTM, stamped client-side
  created_at timestamptz not null default now()
);
-- RLS: anon may INSERT only. No select, no update, no delete.
```

- Unique violation on `email` → the butler's `Already on the list, sir.`
- A hidden honeypot field drops bots client-side; RLS keeps the table
  write-only to the world.
- **The pausing gotcha now bites in public:** a paused free-tier project =
  a dead signup form with no error the visitor understands. The
  keep-awake workflow already pings daily — add the waitlist table to that
  ping's query so the *landing* path is what's kept warm. If traffic ever
  matters for real, the $25 Supabase tier or a queue-through-Vercel-function
  is the upgrade path; not needed for v1.
- No confirmation email in v1 (nothing to say yet). L3 adds Resend +
  a plain-text welcome in the Majordomo's register.

### 7.4 Analytics + measurement

- **Vercel Web Analytics** (zero-config, no cookie banner needed) for
  visits/referrers; the Supabase table is the conversion count.
- **UTM convention from day one:** every posted link carries `?src=` —
  `x-buildpublic`, `tt-clip`, `rd-nightshift`, `ig-reel`… stamped into the
  `source` column. This is how "which channel fills the beta" gets answered
  with a `group by` instead of a feeling.
- Weekly ritual, five minutes: visitors, signups, rate by source. Change one
  thing at a time; two weeks between copy experiments.

---

## §8 · Milestones

Same contract as the build plan: each milestone ships something verifiable,
`npm run build` green, gates honest.

| # | Milestone | Contents | Gate |
|---|---|---|---|
| **L0** | **A page that can take a name** | Repo + tokens + fonts · hero copy (§3.1) + working form → Supabase insert with all five states · meta/OG basics · deployed · domain decision executed (§7.2) | A signup lands in the table **from a phone**, duplicate + invalid paths speak correctly; Lighthouse ≥90 all four |
| **L1** | **The demo** | §6 storyboard, desktop + single-column mobile variant, reduced-motion frame | 60fps at 6× CPU throttle; LCP still <2.5s; paused frame passes for a real screenshot |
| **L2** | **The full page** | Wings panels with real screenshots · what-if strip + micro-animation · briefing mock · founder note · FAQ · footer form · OG image · `/privacy` | AA contrast audit passes; keyboard-only run works; 390px flawless; Lighthouse ≥95 |
| **L3** | **Post-signup & growth** *(gated on real traffic)* | Welcome email via Resend (butler register) · honest signup counter at ≥100 · referral skip-the-line mechanics if the beta cap creates real queue pressure · Hebrew voice pack | Each item ships only when its precondition is true — none are launch blockers |

**L0 ships in an evening. Nothing waits on the demo** — the playbook's "even a
one-liner + email field" instinct was right; L0 *is* that, in the right clothes.

---

## §9 · What this page refuses (the taste contract, for future-us)

Written now, while sober, because every growth blog will suggest them:

- No popups, exit-intents, or scroll-hijacking. No countdown timers, ever.
- No fake numbers: no invented signup counts, no "as seen in" without the seen.
- No dark-pattern copy ("No thanks, I hate being organized").
- No feature-swarm rewrites — if a section stops fitting in one sentence, the
  section is wrong, not the sentence count.
- No light mode. Dark-first is a brand statement (playbook §3.5); the landing
  is its loudest venue.
- No A/B testing before there is traffic to test on. Taste first, data when
  data exists.

---

## Appendix A — Copy bank (spares, same doctrine)

**Headlines not chosen but kept:**
- Run your life like an estate.
- Built for the week nobody designed calendars for.
- For those who go far. *(too vague alone; usable as an ad kicker over a visual)*
- Keep your eyes on the mission. The house is handled. *(strong ad-pair line)*
- Every pilot needs a navigator. *(stated direction — best as a video caption)*
- Made by busy people, for busy people. *(stated direction — the founder-note
  thesis in six words; strong as a Reddit post title)*
- Shift apps track your shifts. Calendar apps ignore them. Majordomo runs your
  whole life around them. *(the playbook positioning sentence — the "how it
  works" ad copy)*

**Bio lines (X/TikTok):**
- The calendar that survives your schedule. Beta this autumn.
- A butler for people whose schedule fights back.

**Ad/clip captions:**
- 13 hours. One block. Your calendar shouldn't flinch.
- Your briefing arrives when *you* wake up. Novel concept.
- Drag Tuesday into Friday. See the damage. Decide.

## Appendix B — Sources that shaped this spec

Conversion structure and benchmarks: LaunchList's waitlist teardown and
Waitlister's optimization guide (email-only forms, CTA wording, social-proof
placement, 10–20% average / 20–30% good, the 90-day decay of stale waitlists).
Examples: Flowjam's pre-launch teardowns (Robinhood's position counter, Arc's
manifesto, Superhuman's qualification friction, Linear's craft-as-proof,
Notion's one-sentence page). 2026 trend read: SaaSFrame (story-driven heroes,
purposeful micro-animation, real UI over abstraction). Palette signals:
LandingPageFlow's dark-palette guide (gold-on-black = premium, 2–3 colors,
contrast discipline). Competitive tone check: usemotion.com's live hero, fetched
July 2026 — the swarm we counter-position against.
