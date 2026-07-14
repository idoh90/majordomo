# MAJORDOMO — The Playbook
### Full direction document: from personal Batman app to public company · v1 · July 2026
*(Working title "Majordomo" used throughout — see §2 for the naming decision. Companion doc: `alfred-master-build-plan.md` for the stage-by-stage build.)*

---

## §0 · The one-page summary

**What this is:** a calendar-first life-operating-system with a personality. A dry, deadpan butler runs your schedule the way a majordomo runs an estate.

**The strategy in one line:** *Ship the personal Batman version for you; commercialize the noir butler for everyone whose schedule fights back; earn the broad "chase the impossible" market through retention, not ambition.*

**The three load-bearing decisions:**
1. **The core is the calendar.** The dynamic, drag-and-drop, what-if calendar (the Manor) IS the product. Everything else — shifts, training, money, study — is a plug-in extension (a Wing). Nobody buys a bundle of dashboards; they buy one thing that finally makes their week make sense.
2. **The beachhead is hostile schedules.** Rotating shifts, 13-hour days, night rotations — security, nurses, EMS, soldiers, factory, pilots. Every calendar app on earth assumes a 9-to-5. You live the problem. Founder-market fit is the one advantage money can't buy.
3. **The brand is the butler.** The voice, the noir, the "sir" — that's the moat on the marketing side. Features get copied in a quarter; a beloved personality doesn't.

**The money math (honest version):** ~$60/year price point → **~5,500 paying subscribers ≈ $330K ARR ≈ a ~$1M acquisition** at typical 3× consumer-subscription multiples. ~17,000 subscribers = a $1M/year revenue business. Neither is a lottery ticket; both are 2–4 years of compounding retention and distribution.

---

## §1 · Thesis: why this can win

**The graveyard warning.** "Manage your whole life in one app" is where products go to die — Notion life-OS templates, Sunsama, Akiflow, a hundred dead dashboards. The generalist market is crowded, retention is brutal, and "everything" positioning means nobody knows what you are. We do NOT launch as a life OS. We *become* one.

**The gap that's actually open.** Motion, Reclaim, Fantastical, Google Calendar — all structurally assume: fixed working hours, meetings as the atomic unit, weekends off. A rotating shift worker's reality — 07:00–20:00 today, 19:00–08:00 tomorrow, sleep displaced, training squeezed into the cracks, study on off-days — breaks every one of those assumptions. The existing "shift apps" (Supershift, Shift Work Calendar, NurseGrid) prove demand exists — NurseGrid alone reached millions of nurses and got acquired — but they are utilitarian, dated, and track *only* the shift, not the life around it.

**The positioning sentence:** *Shift apps track your shifts. Calendar apps ignore them. Majordomo runs your whole life around them.*

**Why you specifically:** you work the 13-hour rotations, train seriously, study toward engineering, and build with Claude Code — you are the ICP building for the ICP, with a build-cost structure (solo + AI tooling) that makes small-niche economics viable in a way they weren't in 2020.

**The broadening path (in order, earned not assumed):** shift workers → anyone with irregular/overloaded schedules (freelancers, students working jobs, medical residents, founders) → the general "discipline culture" market your original instinct pointed at. The brand speaks to the big market from day one; the product wins the small one first.

---

## §2 · Identity: the reskin (do this FIRST)

### 2.1 Why first
Every screenshot, beta invite, and TikTok clip from here on is marketing material. Marketing material with DC's trademarks in it is unusable and legally radioactive the moment money or public promotion enters. Reskinning now — while the theme-token system makes it a config change — costs days. Reskinning after a beta costs a re-launch. *(Not legal advice; for the trademark filing itself, spend the few hundred dollars on an IP lawyer when revenue starts.)*

### 2.2 The insight that makes this painless
What people will love about this app was never DC's property. **Butlers are public domain. Noir is public domain. Rain, dry wit, and "sir" are public domain.** DC owns four proper nouns. We lose the nouns and keep the soul. (Delicious footnote: "batman" is, literally, a real historical military term for an officer's personal attendant. The *concept* was always universal.)

### 2.3 The estate metaphor — full renaming map
The organizing idea: **your life is an estate; the app is the majordomo who runs it.** Coherent, ownable, infinitely extensible.

| Current (personal) | Commercial | Notes |
|---|---|---|
| Alfred (app) | **Majordomo** (working title) | The chief steward of a great house — the word means exactly what the app does |
| The Batcomputer (calendar hub) | **The Manor** | The whole estate at a glance; the core product |
| Consoles | **Wings** | Wings of the manor — modular, extensible |
| The Night Shift | **The Watch** | "Standing watch" — perfect double meaning for guards/nurses/soldiers |
| Training Grounds | **The Grounds** | |
| Wayne Fund | **The Ledger** | Demoted to optional Wing (see §3.4) |
| The Academy | **The Study** | |
| Alfred's voice | **The Majordomo** | "Sir" stays. The dry register stays. Hebrew "אדוני" stays |
| Gotham preset | **Midnight** (rain) | Terminal and Aurora presets keep their names — generic words |
| Batman skin | **Founder skin** | Lives behind a local config flag on your machine only. Never ships. The personal app you wanted still exists, untouched |

**Name shortlist & decision process.** Majordomo (recommended: meaning-perfect, memorable, no major consumer-app collision known to me — the old "Majordomo" mailing-list software is long dead, but verify), alternates: **Adjutant** (military aide — reads perfectly to the discipline audience), **Chamberlain**, **Winston**, **Valet**. Before committing: (1) search the app stores, (2) USPTO/EUIPO/Israeli trademark quick search, (3) secure `.com` or `.app` + matching social handles the same day you decide. Note: "Alfred" itself was doubly unusable — DC character *and* an established Mac productivity app.

### 2.4 Amendment to the build plan (Stage 1)
Since Stage 1 (theme foundation) hasn't been executed yet, fold the reskin in at zero extra cost:
- Presets ship as **Midnight / Terminal / Aurora**. Batman-flavored tokens live behind a `founderSkin` local flag.
- **All user-facing strings move into a single `voice.ts` module from day one.** This is new and important: it makes the voice swappable, translatable (Hebrew launch market!), and — later — turns "persona packs" (§3.5) into a content drop instead of a refactor.
- CLAUDE.md rule 2 updates from "Alfred's voice" to "the Majordomo's voice"; everything else in the build plan stands as written.

---

## §3 · Product direction

### 3.1 The hierarchy (non-negotiable)
**The Manor (calendar) is the product. Wings are extensions.** Practical consequences:
- Onboarding lands you in the Manor with a populated week — never on a dashboard menu.
- The nav treats the Manor as home; Wings are one tap away, and installable/removable like apps on a phone. "Assemble your own command center" *is* the broad-market story — a nurse, a founder, and a student each build a different Majordomo.
- Every Wing must justify itself by putting something *on the calendar* or reading something *from it*. A Wing that doesn't touch time doesn't belong (this is the test that keeps the product from becoming the graveyard dashboard).

### 3.2 What makes the calendar worth the whole product (the intuition bar)
You said it: if the UI is beautiful and intuitive, you'd use it. The bar, concretely:
- **Drag is the primary verb.** Move a shift, stretch a workout, drop a study block. Every drag gives immediate visual + haptic feedback and is always undoable. (Already specced: stages 5–7.)
- **What-if is the wow.** Sandbox mode — "what does my month look like if I swap Tuesday and Friday?" — is the demo moment, the TikTok clip, and the feature no mainstream calendar has.
- **Three-tap rule:** any common action (add shift, log workout, check week) in ≤3 taps from cold open.
- **Shift-literate by design:** cross-midnight events render natively, weeks start Sunday (configurable per locale), "sleep after nights" is a first-class concept, not a hack.

### 3.3 Commercial feature additions (beyond the personal build)
1. **External calendar sync (Google first, then Apple/Outlook).** Non-negotiable for the mainstream: the Manor must *ingest* real life, not demand migration. Read-only first, write-back later. ⚠️ **Dependency alert:** Google's OAuth verification for calendar scopes takes weeks of review — start the application during beta, not at launch.
2. **The Daily Briefing — the retention engine.** A push notification in the Majordomo's voice, and here is the differentiator nobody else can copy without our data model: **briefing timing is shift-aware.** Day shift tomorrow → brief the evening before. Night shift at 19:00 → brief at ~16:30, not 07:00 while you're asleep. This one detail says "this app understands my life" louder than any feature list.
3. **Two-minute onboarding:** pick your shift patterns → tap them onto this week → connect Google Calendar (optional) → pick a preset → done, populated Manor. Activation or death happens here.
4. **Weekly Report Card:** a gorgeous, dark, shareable image — hours stood watch, sessions trained, the week's shape — subtly watermarked. Your zero-cost distribution loop.
5. **Accounts + cloud sync (Supabase recommended):** auth, Postgres, row-level security, generous free tier. The events-store module from Stage 3 was designed as the swap point — localStorage backend becomes a Supabase backend without touching the UI. This is the personal→commercial architectural bridge, and it's already built into the plan.
6. **The AI layer (premium):** natural-language commands ("move Thursday's watch to Friday", "find me three training slots this week") and AI-written briefings. Anthropic's API slots in naturally given the stack. In 2026 this is also what makes the company *fundable* and *acquirable* rather than "a nice calendar."
7. **Persona packs (later, after voice.ts):** the Majordomo, the Drill Sergeant, the Coach. Enormously shareable; possibly a paid add-on.

### 3.4 What gets demoted or refused
- **The Ledger (finance): demoted** to an optional Wing, off the onboarding path. Manual finance tracking is the highest-friction, least-differentiated console; doing it *right* means bank integrations and regulation — a different company. It stays for power users (and for you).
- **Refused, permanently, unless data screams otherwise:** a habit tracker (commodity, dilutes focus), notes (never), a social feed (never), and chat-as-primary-interface (AI is a layer over the calendar, not a replacement for it).

### 3.5 Design language — "Midnight Noir" (the beautiful part)
- **Signature element (spend the boldness here):** the living calendar — ambient weather in the background, events that glow with their Wing's accent, the what-if ghost mode. One unforgettable thing; everything else disciplined and quiet.
- **Surfaces:** true near-black layered surfaces (not gray-on-gray), one accent per preset, glow used like seasoning — on the active thing only. Film-grain texture at whisper opacity so screens feel alive even when static.
- **Typography does the branding:** a characterful condensed display face for headers and the wordmark, a clean humanist UI face for body, and **tabular-numeral treatment for every stat** — hours, weights, shekels — so numbers feel engineered. (Exact pairing chosen in the reskin session; the rule is: the type should be identifiable with the logo covered.)
- **Motion doctrine:** ambient = slow (30–60s loops), interactive = fast (150–250ms), drag = springy and physical. Reduced-motion always respected. Nothing moves without a reason.
- **Copy is design.** Empty states, errors, and confirmations in the Majordomo's register are the product's smile: "Nothing on the books, sir. A rare quiet evening." Errors never grovel, never vague. Dark-first at launch (a brand statement); light mode lives in the backlog until users demand it.
- **Intuitive means:** no tutorial can be required. If a screen needs explaining, the screen is wrong.

---

## §4 · Retention engine (the actual business)
A subscription app is a retention machine with a UI. The loop:

1. **Morning/pre-shift:** shift-aware Daily Briefing → open → glance at the Manor (the habit).
2. **During the week:** quick edits, drag-and-drops, workout logs — each interaction deepens the data.
3. **Sunday evening (or configurable):** the Week in Review card → pride → share → new users.
4. **Monthly:** the Majordomo's month report — hours stood watch, training volume, study blocks — the "I can't lose this history" lock-in.

**Tone rule for streaks and nudges:** the anti-Duolingo. No guilt, no desperate mascot. A missed week earns dry acknowledgment ("The log resumes, sir."), never shame. Discipline-culture users respond to respect, not nagging — and it's on-brand.

---

## §5 · Roadmap (Now / Next / Later)
*Capacity honesty: this is a solo, nights-and-weekends project around 13-hour rotations, with the Mechina starting ~October. Now = committed. Next = planned. Later = directional. When something is added, something moves — no exceptions.*

### NOW (July–September 2026) — "Finish it, reskin it, live in it"
| Item | Detail | Status |
|---|---|---|
| Reskin + rename | §2: pick name, secure domain/handles, Midnight-noir presets, voice.ts, founder skin flag | **First** |
| Stages 0–4 of build plan | Recon, theme foundation, chart, event schema, the Watch | Per `alfred-master-build-plan.md` |
| Stages 5–7 | The Manor: read-only → drag-and-drop → what-if | The core product |
| Daily-drive it | Use it through ≥3 full shift rotations; fix what annoys you | The only "market research" that matters now |
| Landing page + waitlist | One page: hero video loop, one paragraph, email field | Cheap, do early |
| Build-in-public start | 2 posts/week (X + TikTok/Reels): UI clips, the rain, the what-if drag | Distribution starts before launch |

### NEXT (≈ October 2026 – January 2027) — "Beta and truth"
| Item | Detail | Dependency/risk |
|---|---|---|
| Supabase backend + accounts | Swap events store; migrate your own data first | Architecture already prepared (Stage 3) |
| Onboarding flow + Daily Briefing (PWA push) | Activation machinery | iOS PWA push requires add-to-home-screen — acceptable for beta |
| Closed beta, 50–150 users | Recruit per §6.3; personal onboarding for first 20 | Mechina load — scope beta support honestly |
| Google Calendar read-sync | Start OAuth verification EARLY | ⚠️ external review, weeks of lead time |
| Weekly Report Card | The share loop | |
| Measure D7/D30 | The go/no-go data | |

### LATER (2027, gated on beta retention)
Payments (Stripe) + free/premium split → public launch → AI layer → Capacitor wrap + app stores → persona packs → the Study wing (conveniently: you'll be a student, dogfooding again) → Apple/Outlook sync → light mode → ads only after LTV is known → B2B exploration (§8.3).

---

## §6 · Go-to-market

### 6.1 Personas
- **Primary — "the rotating striver":** 20–40, shift-based work (security, nursing, EMS, military, industrial, aviation), trains seriously, studying or side-hustling, phone-first, already consumes discipline content. Pain: "my schedule wrecks every system I try."
- **Secondary:** overloaded students-with-jobs, medical residents, freelancers juggling clients, early founders.
- **A deliberate note on the "for men" instinct:** aim the *creative* at discipline culture — noir, iron, the grind — which skews male and matches your authentic voice. But do **not** gate or label the product "for men": the single largest, loudest, most app-buying shift-worker community on the internet is nurses, who skew female and made NurseGrid a real company. The butler bows to everyone, sir. Masculine-coded aesthetic, universal product — that's the commercially optimal (and correct) configuration.

### 6.2 Channel strategy (in order of ROI for a solo founder)
1. **Build-in-public short-form video.** This UI was born for it: rain on black, glowing charts, a 13-hour shift dragged across a week, the deadpan notification as the punchline. 2×/week minimum, English (global) with occasional Hebrew (home market).
2. **Community seeding (participate → then share):** r/nightshift, r/securityguards, r/nursing, r/Nurses, shift-work and fitness Discords, Israeli tech/fitness groups. Reddit punishes drive-by promotion — give value for weeks first, then "I built this because I live this" posts, which that audience rewards.
3. **Micro-influencers as affiliates, not ad buys:** fitness/discipline creators (5–50K followers) get lifetime accounts + **20–30% recurring affiliate commission**. Zero upfront cash, aligned incentives, authentic reach.
4. Waitlist → beta → launch-day push (Product Hunt is fine but is a spike, not a strategy).

### 6.3 Beta plan
Target 50–150 users. Entry survey (occupation, shift pattern, current tools). First 20 get a personal 15-minute onboarding call — the highest-density learning you will ever do. Weekly changelog in the Majordomo's voice (beta comms *are* brand rehearsal). **Activation definition:** ≥3 events created + briefing enabled within 48h. **Success bar:** ~35–40% D7 and ≥20% D30 among activated users → proceed to monetization. Materially below → iterate product, do not pour marketing on it.

### 6.4 Landing page structure
1. **Hero:** looping 8-second video — a chaotic week snapping into ordered noir — over the headline. Candidates: *"Every empire needs a majordomo."* / *"The calendar that survives your schedule."* / *"Run your life like an estate."* One email field, one button: "Request an invitation" (on-brand > "Sign up").
2. Three panels = three Wings (Watch / Grounds / Study), each one sentence + one screenshot.
3. The what-if demo clip ("Ask 'what if' before you commit").
4. One row of beta testimonials (post-beta).
5. FAQ (privacy, price, platforms) + footer waitlist repeat.

---

## §7 · Monetization

**Model: freemium subscription.**
- **Free — "The Manor":** full calendar, drag-and-drop, one Wing, one theme preset, local reminders. Genuinely useful forever — free users are your marketing.
- **Premium — "Full Staff" (~$6.99/mo or $59/yr):** all Wings, what-if mode, shift-aware AI briefings, calendar sync, all presets + customization, report cards, priority support. Price sits deliberately under Motion/Akiflow ($19–34/mo) and above throwaway utilities: "serious tool, sane price."
- **Founders' offer at launch:** lifetime for ~$129, capped (e.g., 500). Cash now + evangelists forever.
- **Publishing path:** web-first with Stripe (~97% of revenue kept), installable PWA → Capacitor wrap into App Store/Play once demand justifies the 15–30% platform tax — consumer discovery eventually requires store presence, but not on day one.

**Pricing-page copy draft:**
> **The Manor** — Free. Your calendar, your Watch, your rules. *"A gentleman's essentials, sir."*
> **Full Staff** — $59/year. Every Wing. The what-if engine. A briefing before every shift. The entire household at your service. *"The full staff, at your disposal."*

---

## §8 · Metrics, milestones, and the honest kill-criteria

### 8.1 The ladder
| Milestone | Meaning |
|---|---|
| 150 beta users, D30 ≥ 20% | Product truth achieved → charge money |
| $1K MRR | Real business signal; register the business (§9) |
| $5K MRR growing MoM | Fundable, if you even want to |
| ~$27K MRR (~5.5K subs) | ≈$330K ARR → ~$1M acquisition territory |
| ~$83K MRR | $1M/year revenue company |

### 8.2 Kill / pivot criteria (written now, while sober)
If after 3 serious product iterations D30 sits under ~10%, the wedge as-built isn't retaining. Cheap pivots, in order: (a) narrow harder — become *the* beautiful shift calendar, nothing else; (b) pick a single vertical (nursing) and go deep; (c) **go B2B** — see below. Sunk-cost is not a strategy; the codebase and audience survive any of these.

### 8.3 The B2B ace up the sleeve (new addition)
Consumer shift workers are the wedge, but *employers of shift workers* are where structural money lives — team scheduling (Deputy, When I Work, Connecteam) is a large proven market. A consumer app beloved by guards and nurses is a classic **bottom-up B2B story**: individuals bring it to work, then the security company or ward buys team features. You don't build this now. You *tell* this story to investors (§9), and you keep it as pivot (c). It roughly doubles the ceiling of the company narrative for free.

---

## §9 · Money, investors, legal, exit

**Bootstrap-first.** Consumer productivity rewards profitable patience, not blitzscaling. Raise only if you *want* to go faster, and only once you can show: D30 retention + a few thousand MRR growing monthly. Then the Israeli angel/pre-seed ecosystem is genuinely strong for a technical founder with live traction. **The pitch leads with:** AI-native personal assistant + a structurally underserved population (shift workers) + bottom-up B2B expansion — never "another productivity dashboard."

**Legal/ops (brief; I'm not a lawyer or accountant):** register Osek Patur when revenue starts (upgrade later), privacy policy + terms before beta (real user data), GDPR-basics if EU users join, trademark filing for the chosen name once revenue justifies it, and an accountant's hour on VAT for digital sales abroad.

**Likely acquirers, in realistic order:** app-portfolio operators like **Bending Spoons** (their entire model is buying loved apps — Evernote, Meetup); **calendar/productivity players** consolidating (Dropbox acquiring Reclaim.ai signaled calendars are being shopped); **fitness platforms** wanting scheduling; **healthcare-workforce players** (the NurseGrid → Trusted Health precedent is *your niche, acquired*); or a plain **Acquire.com** listing once MRR is stable — small profitable subscription apps trade constantly at 3–4× ARR.

---

## §10 · What I'd do this week (the entrepreneur's Monday list)
1. Pick the name (Majordomo unless a search kills it) → buy domain + handles same hour.
2. Run the Stage 0 prompt with the §2.4 amendments folded in (voice.ts, preset names, founderSkin flag).
3. Build Stage 1 with commercial presets from birth — the reskin costs ~zero this way.
4. Register the waitlist page (even a one-liner + email field).
5. Post the first build-in-public clip: the rain preset over the Wayne— over **the Ledger**, sir. Old habits.

---

## Appendix A — Positioning cheat-sheet
| Competitor | Their frame | Our counter |
|---|---|---|
| Motion / Reclaim / Akiflow | AI calendar for knowledge workers, $19–34/mo | Assumes 9-to-5; we're shift-literate at a third of the price |
| Sunsama | Mindful daily planning, $20/mo | Journaling ritual; we're an operator's console |
| Supershift / Shift Work Calendar | Shift tracking utility | Tracks the shift, ignores the life; dated UI |
| NurseGrid | Nurse scheduling community | Proof the niche pays and exits; single-vertical, no life-integration |
| Notion life-OS templates | DIY everything | We're opinionated, alive, and take 2 minutes not 2 weekends |

## Appendix B — Voice bible (v1)
Dry. Composed. Understatement over exclamation. "Sir" once per message, sentence-final. Never begs, never guilts, never uses an emoji. Competence is the affection. Errors state fact + remedy. Hebrew register: "אדוני", same restraint. The Majordomo is never impressed and never surprised — merely, occasionally, *quietly satisfied*.
