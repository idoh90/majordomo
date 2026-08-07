# Majordomo — Waitlist Launch Plan

*Prepared 6 August 2026. Companion to `majordomo-landing-spec.md` and the landing repo README. Everything below is grounded in the actual state of both repos as of today, plus channel research verified this week — stale claims from old marketing guides have been filtered out.*

---

## 0. TL;DR

The landing page is **finished but has never been served to anyone** — the campaign is blocked on ~90 minutes of dashboard work, not on code. The app is live and daily-driven but its biggest launch risk is the one piece of outside feedback you have: *"complicated as hell for a new user."*

The plan, in one paragraph: close the five Phase-0 gates this week (SQL, Vercel, domain, watchdog proof, smoke test) → warm up a Reddit account while you wait → roll maker-subreddits and beta directories over weeks 1–4, one at a time, never the same text twice → run the slow, honest play in r/Nightshift (the single best-fit community on the internet for this product, and one bad first impression closes it) → put a small budget behind Reddit Ads and two or three night-shift nurse micro-creators, the only paid channels that reach your actual users cheaply → **hold Product Hunt and Hacker News for beta day** — both are wrong for a waitlist and each is a one-time card. Target: **400–500 signups by beta open** to reliably fill 150 seats.

Three findings from this week's research that change the standard playbook:

1. **Product Hunt discontinued "Coming Soon" teaser pages (~Aug 2025).** There is no PH pre-launch play anymore. Launching a waitlist-only page there burns your one high-novelty launch. Save PH for autumn.
2. **Show HN explicitly bans waitlists** — the rules page says verbatim: don't post landing pages, sign-up pages, or anything users can't try. A regular HN submission of a waitlist dies or gets flagged. Save HN for when something is tryable without an email wall (your `?demo` fixtures are the future unlock here).
3. **BetaList is no longer free** (all submissions paid, refund if rejected) **and requires your own domain** — no `vercel.app` subdomains. Which forces the domain decision (§3.2) before, not after, the campaign.

---

## 1. Where things stand — the audit

### 1.1 The landing page (`majordomo-landing` repo)

| Area | State | Verified |
|---|---|---|
| Code | Complete. Build passes, all 4 audit gates green, Lighthouse 98/100/99/100, prerendered, works with JS off | README, run of 5 Aug |
| Deployment | **Never deployed. No Vercel project exists.** `majordomo-landing.vercel.app` returns 404 | Live check, 6 Aug |
| Supabase table | Migration 0001 run and probed; **0002/0003/0004 never run** — the public can still forge `created_at` (queue-jumping) and one request can insert unlimited rows into a database shared with the app | README, 5 Aug |
| Test rows | 3 junk rows sit at positions 1–3 of the queue (`probe@`, `landing-check@`, `forged@`) | README |
| Keep-awake workflow | Works when dispatched by hand; **zero green scheduled runs** (all 3 scheduled runs predate the secret; prediction: post-1-Aug runs should be green — unproven) | README |
| Waitlist canary | Works by hand; **zero scheduled runs ever**; workflow `state` never checked | README |
| Domain | None. `majordomo.app/.com` taken; **`majordomo.co`, `.so`, `.works`, `.house` were free as of 29 July** | README |
| Social handles | None exist (X, TikTok, IG) — founder-note links deliberately removed | README |
| Attribution | `?src=` convention built, `source` column live, `group by` queries ready | README |
| Honesty guards | Counter hidden below 100, no fake urgency, no dark patterns — written down while sober | README |

**Verdict: the page is the strongest asset you have.** Fast, accessible, distinctive, and honest — reviewers on maker subreddits notice all four. Nothing in it needs work before publishing. Everything blocking launch is dashboard work listed in §3.

### 1.2 The app (`majordomo` repo, live at majordomo-cyan.vercel.app)

| Area | State |
|---|---|
| Live & reachable | Yes — verified today. PWA, five wings, months of real founder data |
| Beta promise on the page | "Beta this autumn. 150 places." — that's a printed commitment with a clock on it |
| First-run experience | **Does not exist.** The only outside feedback ever received: "complicated as hell" for a new user. 150 strangers × no onboarding = the beta's biggest churn risk |
| Known bugs | Three QA reports delivered (Ledger worst, Grounds healthiest, Manor drag-clamp P0); merged 6-phase fix plan exists |
| The Bell (assistant) | Committed but unbuilt; its guided first-run setup is one possible answer to the onboarding gap — still under your own debate |
| Sign-in | Supabase registry; iPhone sign-in previously failed and needed a fix session — worth a re-test before strangers hit it |

**Verdict: the app does not block the *waitlist* campaign — but it paces the *beta*.** Collecting emails can start the moment Phase 0 closes. What the campaign buys you is 6–10 weeks to close the onboarding gap before the first invitation goes out. Treat "first-run flow" as the app-side workstream that runs in parallel with everything below.

### 1.3 One small thing to check (2 minutes)

A fetch of the app's HTML today showed no `noindex` meta tag — the app's noindex presumably lives in `vercel.json` headers (`X-Robots-Tag`). Confirm with `curl -sI https://majordomo-cyan.vercel.app | grep -i robots`. If it's absent, the private estate can start leaking into Google exactly when the brand name starts being searched. Also: if `idoh90/majordomo` is still public from the July QA session, flip it back to private before the campaign points curious people at the brand.

---

## 2. Positioning — what goes on every post

Locked, from the spec and the page itself. Repeated here because every channel play below reuses these five sentences:

- **Headline formula:** "Every mission needs a **MAJORDOMO**." / sub: "The calendar for schedules that fight back — nights, doubles, rotations, exams. Made for the disciplined."
- **The one-liner for comment sections:** *Shift apps track your shifts. Calendar apps ignore them. Majordomo runs your whole life around them.*
- **The mechanism no competitor truthfully copies** (lead with this in maker/technical subs): a 19:00→08:00 shift is **one event**, never split at midnight; displaced sleep is pencilled in automatically; strain, study hours and money are all computed from that honest shape.
- **The founder story** (lead with this in audience subs): *I work rotating 13-hour shifts. Every calendar app broke at midnight, so I spent a year building one that doesn't.* This is true, verifiable, and the single most disarming sentence you own.
- **Audience guardrail** (binding, from PRODUCT.md): creative aims at discipline culture and skews masculine, but the product is never gated or labelled "for men." The largest shift-worker community online is nurses. The butler bows to everyone.

**Hard honesty constraints** (from PRODUCT.md — these protect you on Reddit, where fabrication is a death sentence): no testimonials, no user counts, no "people love it," no fake momentum. What you *can* say: built and daily-driven by the founder through real rotations for months; 150-place beta; invitations in order.

---

## 3. Phase 0 — the launch gate (~90 minutes, all dashboards, all yours)

Nothing gets posted anywhere until every box below is ticked. Order matters.

1. **Run `supabase/RUN_ME_ONCE.sql`** in the SQL editor. Read the four-row verdict table it prints — that table *is* the verification. This closes queue-jumping, locks column privileges, adds `invited_at`, caps floods at 5,000 rows, and deletes the 3 test rows. Then read back `select count(*) from waitlist` as `0`. **Do this before any traffic exists** — it touches the live write path, and you want the verification probes running against an empty table.
2. **Buy the domain — `majordomo.co` (recommendation: yes, now, ~$30).** This reverses your 29-July "ship on vercel.app" decision, on new evidence: (a) big-subreddit automod filters commonly remove free-host domains — a `vercel.app` link can silently kill your best posts; (b) BetaList rejects submissions without an own domain; (c) the README's own warning — an origin change mid-campaign orphans every share made before it. $30 is the cheapest insurance in this plan. Re-check availability via RDAP first; the 29-July reading is a week old.
3. **Create the Vercel project.** Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` **before** the first deploy (the build refuses without them — by design). Attach the domain. Leave "system environment variables" on. Read the canonical URL out of the deployed HTML once, and correct `FALLBACK_ORIGIN` in `site.config.ts` to whatever Vercel actually gave. Toggle **Web Analytics** on — until then `/privacy` describes measurement that isn't happening.
4. **Wire `hello@majordomo.co`** via Cloudflare Email Routing → Gmail, send yourself a test, *then* set `CONTACT_EMAIL` in Vercel and redeploy. (README rule: an address that is merely intended is the same failure with better branding.)
5. **Prove the watchdogs.** Run the two `gh` commands from the README. You need **at least one green run with `event=schedule`** on each job before the campaign leans on them. Check the canary workflow's `state` while you're there (`disabled_manually` is the unchecked suspect). Remember the canary also reports whether 0002 is applied — the morning after step 1 it should flip to "0002 is applied," which is a free end-to-end confirmation.
6. **Smoke-test the live form** from your phone, on cellular, with a real address: expect `201` and the butler's line. Post the same address again: expect `409` "Already on the list, sir." Delete your row or leave it — position 1 is rightfully yours anyway.

**Do-not list, unchanged from the README:** no popups, no countdowns, no fake counts, no A/B tests before there is traffic. The page's restraint is a differentiator in every screenshot it appears in.

---

## 4. Channel strategy

The research split the world cleanly in two: **maker channels** (Product Hunt, HN, directories, r/SideProject…) reach indie-hacker generalists — good for feedback, backlinks and momentum, not your users. **Audience channels** (r/Nightshift, nurse creators, FB shift groups, Reddit Ads) reach actual shift workers — and ~70% of the audience subreddits ban promotion outright, so the honest paths are few and slow. The plan runs both tracks, weighted toward audience.

### Tier 1 — free, do first (weeks 1–4)

| Channel | Play | `?src=` | Risk |
|---|---|---|---|
| **r/SideProject** (~800k, promo welcome — verified) | The flagship post. "I work 13-hour rotations, so I built a calendar where a 19:00→08:00 shift is one event." Screenshots/GIF of the **real app** (`?demo` fixtures), story in the post, **waitlist link in first comment** — the sub's norms punish email-form-first posts. Reply to every comment | `rd-sideproject` | Low |
| **r/alphaandbetausers** (~41k) + **r/betatests** (~16k) | Purpose-built for exactly this: "Beta, Autumn 2026, 150 places, calendar for night-shift workers." A waitlist is native here. Different text in each | `rd-alphabeta`, `rd-betatests` | Low |
| **r/roastmystartup** (~31k) | "Roast my landing page." Free QA + engagement; take the beating in the butler's register — dry, composed. Goldmine for copy iteration | `rd-roast` | Low |
| **r/ProductivityApps** (~176k, official Self-Promotion flair) | Comparison angle: "Every calendar app breaks at midnight — here's what a shift-first calendar looks like." Use the flair | `rd-prodapps` | Low |
| **r/IMadeThis** (~37k) + **r/indiebiz** (~40k) | Craft angle (the week grid, the voice) / bootstrapped angle. Secondary, low-effort | `rd-imadethis`, `rd-indiebiz` | Low |
| **r/webdev — Showoff Saturday only** (~3.3M) | Technical post: offline-first PWA, synchronous localStorage boot, hand-rolled cross-midnight week grid, no chart libs. Waitlist mentioned once, low in the post. Saturday only | `rd-webdev` | Med |
| **Betabound** (free, Centercode-run, pre-launch only) | Literal beta-tester recruiting directory, consumer-heavy, health/fitness betas featured. Submit once the page is live; review takes a few business days | `bb-betabound` | Low |
| **Indie Hackers** (free tier, 5 posts) | Not a launch — a narrative: "Why calendar apps fail shift workers." Milestone posts as the waitlist grows | `ih-post` | Low |

### Tier 1b — the audience slow burn (starts week 0, pays off week 5+)

| Channel | Play | Risk |
|---|---|---|
| **r/Nightshift** (~89k, fastest-growing audience sub, culture = sleep-struggle advice) | **The most valuable community on this list, and the most burnable.** 4–6 weeks of genuine participation first — you are authentically one of them; answer sleep-and-scheduling questions as yourself. Then either modmail the mods asking permission for a feedback post, or a discussion post: "I got tired of calendar apps splitting my shift at midnight, so I'm building one that doesn't — what would yours need?" Link only on request or in your profile. Post during US overnight hours — that's when the sub is awake. `rd-nightshift` (the tag you already reserved) | Med |
| **r/securityguards** (~111k, rules light) | Same participation-first play, shorter runway — and it's literally your own job. Second audience beachhead | Med |
| **r/GetDisciplined** (~2.2M) | Comment-level only: answer "what app do you use to schedule your life" threads honestly, with disclosure, as one option among several | Med |
| **Facebook night-shift / nurse groups** | Don't cold-post. **Message 3–5 group admins**, offer reserved beta seats for their members as a perk; an admin-endorsed post beats any ad. `fb-<group>` | Low-Med |
| **EMTLife forum** (sleepy but pure-fit) | One honest founder thread in the EMS Lounge. 5–20 quality signups, one evening of effort | Low |

### Tier 2 — paid, small budget (weeks 4–6, gated on Tier 1 data)

| Channel | Numbers (verified where marked) | Play |
|---|---|---|
| **Reddit Ads** | $5/day floor, $25 lifetime minimum (verified); **subreddit-level targeting confirmed** — you can aim squarely at r/Nightshift, r/nursing, r/ems, communities that ban organic promo. ~$1.50 avg CPC | The best paid option in the whole landscape: it legally reaches the audiences whose subs you can't post in. $10–15/day, 3–4 weeks ≈ **$300–500**, two creatives (founder-story vs. product-shot), est. $2–6 per signup |
| **Nurse/night-shift micro-creators** (10k–50k followers) | IG post $150–500, TikTok $500–2,000 (verified ranges); nurse creators plentiful | DM ~10, offer **$150–300 + lifetime beta access** for one honest video; ask for Spark-Ad authorization in the deal. 2–3 deals ≈ **$400–900**. Highest-trust conversion per dollar |
| **BetaList** | All submissions now paid (price gated behind sign-in; auto-refund if rejected); needs own domain; queue weeks on cheap tier | Submit in week 1 so the feature lands mid-campaign. The one directory built exactly for "email-capture page, beta soon" |

### Tier 3 — compounding, optional (ongoing)

- **X build-in-public** (`x-buildpublic` — your reserved tag): alive but degraded in 2026; reaches other builders, not nurses. One weekly thread with screenshots — the butler UI is visually distinctive, which is your one algorithmic edge. 30 min/week, no daily grind. Cross-post to **Bluesky** (organized indie scene, friendlier replies) and **WIP.co**.
- **TikTok/IG founder account** (`tt-clip`, `ig-reel`): TikTok's US situation resolved (divestiture closed Jan 2026) — it's a stable channel again. #nightshift/#nursetok is huge. But new-account organic reach is a lottery, and a dead account is worse than none. **Only start it if you can sustain 3–5 posts/week for 90 days.** Formats: POV skits ("when it's 4am and your calendar thinks you're asleep"), butler-reacting-to-a-brutal-week screen recordings, rotation day-in-the-life. Winners become Spark Ads later. This is the one track where "no" is a fine answer.
- **Grab the handles now regardless** (@majordomoapp or similar on X/TikTok/IG, even sitting empty) — squatting protection costs nothing, and `rel="me"` links go back into `voice.ts` → `founder.links` once real.

### Deliberately held or avoided

| Channel | Why | When it unlocks |
|---|---|---|
| **Product Hunt** | Coming Soon is discontinued; a waitlist launch ranks poorly and burns first-launch novelty | Beta day, autumn — free, self-hunt, 2–4 weeks prep |
| **Show HN** | Rules ban sign-up pages outright | When something is tryable ungated. **Note: your `?demo` fixtures are 80% of a public demo instance** — a read-only demo estate at `demo.majordomo.co` would make Majordomo Show-HN-eligible, and HN posts rank in Google for years. Worth an evening, decide later |
| **r/productivity** (4.2M) | Verified rule: self-promo banned "even if asked for recommendations," DMs included | Never for promo; participate as yourself only |
| **r/nursing, r/ems, r/Residency, r/StudentNurse, big student subs, r/Fitness** | Promo banned or ban-on-sight culture; the nurse audience is reachable via r/Nightshift, ads, and creators instead | Never for promo |
| **r/InternetIsBeautiful** | "No apps or business tools," no signup-gated sites | Only ever for a free ungated toy (e.g. a shift-sleep planner widget) |
| **allnurses / Nurse.org paid placements** | Real reach (800k+ list) but $1k+ and overkill for 150 seats | Public launch, not beta. Request media kits now, cost nothing |

---

## 5. Reddit ground rules (2026 enforcement is real)

- **The account comes first.** 30+ days age and ~100+ comment karma is the observed automod floor in big subs. If your personal account is older and has history — use it; authenticity beats a fresh "founder" account. Warm-up ladder: week 0 comments only, genuine answers, zero links.
- **9:1** — nine genuine contributions per promotional item, measured across your whole history. Mods read profiles before approving promo posts in 2026.
- **Never the same text twice.** Reddit's anti-spam ML catches templated cross-posts within minutes and cascades removals. One sub at a time, rewritten each time, staggered over weeks — which is exactly what the calendar in §6 does.
- **Link placement:** story and screenshots in the post, waitlist link in the first comment. Full pitch lives permanently on your **user profile page** (outside all sub rules — people who like your comments click through).
- **Check yourself logged-out** weekly for shadowbans.
- **Timing:** weekday mornings US-East for maker subs; Saturday for r/webdev; US overnight for r/Nightshift.
- Four things the research couldn't verify from outside Reddit — check the live sidebars before posting: r/startups thread cadence, r/reactjs show-post policy, r/shiftwork's existence, every Bucket-B sub's current rules.

---

## 6. The calendar — six weeks

Sized for a founder on 13-hour rotations: **~5–7 focused hours/week**, front-loaded on off-days. TikTok excluded (separate decision).

**Week 0 (now):** Phase 0 gate (§3, ~90 min) · start Reddit warm-up (10 min/day, r/Nightshift + r/securityguards + two maker subs) · grab social handles · build the asset kit: 30-second demo GIF, 4–6 screenshots of a brutal week via `?demo`, founder paragraph in three registers (maker / night-shift peer / technical) · request allnurses + Nurse.org media kits · re-verify domain availability and buy.

**Week 1:** Betabound submission · BetaList submission (paid — queue time means it lands ~week 4) · r/roastmystartup ("roast my landing page") · first Indie Hackers post · X/Bluesky accounts go live with the first build thread.

**Week 2:** r/alphaandbetausers · r/betatests (rewritten) · iterate landing copy from roast feedback if warranted · keep daily r/Nightshift comments.

**Week 3:** **r/SideProject flagship post** — your best assets, weekday morning ET, clear your evening to answer comments · r/ProductivityApps with flair.

**Week 4:** r/webdev Showoff Saturday (technical angle) · r/IMadeThis + r/indiebiz · **first `group by source` review** · if signups < 50 total, diagnose (page conversion vs. traffic) before spending; if healthy, **start Reddit Ads at $10/day**, two creatives.

**Week 5:** Micro-creator outreach (10 DMs) · FB group admin outreach (3–5) · EMTLife thread · **r/Nightshift move** — only if you've been genuinely present for 4+ weeks; modmail first.

**Week 6:** Review by source · kill losers, double the winner · scale ads only if CPL < $4 · close creator deals · IH milestone post ("what 6 weeks of waitlist marketing actually did").

**Parallel app-side track (same six weeks):** first-run/onboarding design — whether that's a guided setup flow, the Bell's interview mode, or simply a pre-seeded demo estate for new accounts, decide and build it now; it must exist before invitation #1. Plus the Ledger P0s and the iPhone sign-in re-test.

---

## 7. Targets, measurement, kill rules

- **Goal:** 150 beta seats *filled with people who show up*. Free-beta waitlists convert to activation at roughly 30–50%, so the email target is **400–500 by beta open**.
- **Weekly ritual (15 min):** `queries.sql` `group by source` + Vercel Analytics · log signups per channel per week in a simple table. This is why every link carries `?src=` — channel decisions get made with a `group by`, not a feeling.
- **Page conversion sanity check:** visitors→signups below ~10% with warm Reddit traffic means a page problem (unlikely — it's good); above 25% means traffic quality is high, buy more of the same.
- **Kill rule:** any channel with two honest attempts and <10 signups is dead — stop.
- **Scale rule:** ads scale only under $4/signup; creators get a second video only if their first beat ads on cost-per-signup.
- **Milestones already wired:** counter goes public at 100 (automatic — it's coded that way); at 150 the page keeps collecting (overflow = launch-day audience); before any invitation send, **CSV backup first** (`queries.sql` §4 — there is no other backup), then batches recorded via `invited_at`.

## 8. Budget scenarios

| | $0 | ~$180 | ~$1,100 (recommended, staged) |
|---|---|---|---|
| Contents | Everything in Tiers 1/1b/3 | + domain (~$30), BetaList (~$150 est.) | + Reddit Ads $500, 2–3 creators $450 |
| Realistic outcome | 150–300 signups over 8–10 wks, maker-skewed | Same + directory drip + no automod link risk | 400–600 over 6–8 wks, audience-skewed |
| Verdict | Viable but slower, and vercel.app link risk on Reddit | The floor I'd actually recommend | Release funds in stages: ads only after week-4 data, creators only after ads prove CPL |

## 9. Risks worth naming

1. **App readiness, not marketing, is the critical path.** Every risk below costs signups; this one costs the beta. "Complicated as hell" + 150 strangers = a quiet first week and a dead Discord. The six weeks the waitlist needs are exactly the six weeks the onboarding needs — spend them in parallel.
2. **The autumn promise.** "Beta this autumn. 150 places." is printed on the page. Plan the beta date backward from the onboarding work, and if it slips to late autumn, that's still autumn — but decide the date, don't drift into it.
3. **r/Nightshift is one-shot.** Nothing in this plan is more valuable or more fragile. Participation first, permission second, promotion a distant third.
4. **The unproven watchdogs.** Until each shows a green `schedule` run, a paused Supabase project silently kills the signup form mid-campaign — the exact failure the README warns about. Phase 0 step 5 is not optional.
5. **Your time.** The calendar assumes 5–7 h/week. On a bad rotation week, drop Tier 3 first, then delay a maker-sub post — never skimp on comment-answering after a post is up. A post you don't attend is a post that dies.
6. **Fabrication pressure.** Six weeks in, engagement will be slower than the YouTube case studies promised, and the temptation will be borrowed social proof. The page refuses it; so does the plan. The counter unlocking at 100 real signups *is* the social-proof moment, and it's earned.

## 10. Decisions on your desk

| Decision | My recommendation | Reversible? |
|---|---|---|
| Buy `majordomo.co` now | **Yes** — automod filters, BetaList's rule, and the orphaned-shares cost all point one way | $30, fully |
| Budget tier | Start at ~$180 floor; release ads/creator funds on week-4 data | Yes, staged |
| TikTok founder account | Only with a realistic 3–5 posts/week for 90 days; otherwise skip guilt-free | Yes |
| Public demo instance (`?demo` → demo subdomain) | Not now; decide at week 4 — it unlocks Show HN and r/InternetIsBeautiful later | Yes |
| Reddit identity | Existing personal account if aged, in the "founder who lives this schedule" voice | Mostly |

---

*The `?src=` registry, consolidated: `rd-sideproject` · `rd-alphabeta` · `rd-betatests` · `rd-roast` · `rd-prodapps` · `rd-imadethis` · `rd-indiebiz` · `rd-webdev` · `rd-nightshift` · `rd-secguards` · `rd-ads-<creative>` · `bb-betabound` · `bl-betalist` · `ih-post` · `x-buildpublic` · `bs-bluesky` · `fb-<group>` · `em-emtlife` · `inf-<creator>` · `tt-clip` · `ig-reel`. One tag per posted link, no exceptions — future-you answers "which channel filled the beta" with a `group by`.*
