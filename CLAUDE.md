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
becomes home behind a tab nav (MANOR / WATCH / GROUNDS / LEDGER); consoles become
Wings; three commercial presets (Midnight / Terminal / Aurora) join and the seven
Batman-era skins move behind a local `VITE_FOUNDER_SKIN` flag (`.env.local`, never
committed, tree-shaken from builds). Two standing rules from the pivot onward:

1. **All NEW user-facing strings go through `src/core/voice/`** — no inline copy.
   Register per playbook Appendix B: dry, composed, one sentence-final "sir",
   never begs, never guilts, no emoji.
2. **The Grounds keeps every existing Training Grounds feature.** The design's
   Grounds screen is directional; where it omits an old feature, the old feature wins.

Sections below describe the app as it exists today; each milestone updates only
the lines it invalidates.

## Commands

- `npm run dev` — Vite dev server on port 5173 (also via `.claude/launch.json`)
- `npm run build` — typecheck (`tsc --noEmit`) + production build
- `npm run lint` — ESLint, **import-boundary rules only** (no style rules)
- No test runner; verification is done in the browser.

## Stack

Vite 7 + React 19 + TypeScript, Tailwind CSS v4 (tokens in `src/core/ui/index.css`
`@theme` block — no tailwind.config), Zustand + persist. Charts are hand-rolled
HTML/CSS — no chart library. No router — the shell is a `useState<'menu' | consoleId>`.

## Architecture: shell + consoles

```
src/
  app/            the shell: App.tsx (header, briefing row, menu grid, view state),
                  consoles.ts (the console registry), SettingsMenu.tsx (gear menu)
  core/           shared kernel — knows NOTHING about consoles or the app shell
    module.ts     the ConsoleModule contract
    dates.ts      local-time day/week/streak helpers
    useNow.ts     ticking-now hook (minute interval + visibilitychange)
    ids.ts        makeId()   ·  storage.ts  storageAvailable()
    store/shell.ts  app-wide store: { skin, ambient, weekStart } @ `batman-shell` v2
    ui/           index.css (skin bundles) + skins.ts (SKINS flags) +
                  Sheet / ConfirmDialog / SegmentedControl (shared primitives)
  modules/
    watch/        'THE WATCH' — shifts: post day/night watches (writes core/events;
                  night watches pencil a recovery-sleep block), duty ring, countdown
    training/     the whole workout tracker (see below)
    capital/      'WAYNE FUND' — net worth + budget console (see below)
```

Everything under `core/` beyond the contract got there by the **extract-on-contact**
rule: `Sheet`/`ConfirmDialog`/`SegmentedControl`, `makeId`, `storageAvailable`, and
`useNow` all lived in training until Wayne Fund became the second consumer.

### The ConsoleModule contract (`src/core/module.ts`)

```ts
export type ConsoleModule = {
  id: string
  name: string
  status: 'online' | 'offline'
  Tile: React.FC        // live stat on the menu tile
  Screen: React.FC      // the console itself
  Briefing?: React.FC   // its lines in the daily briefing
}
```

Components are prop-less: a console reads its own stores inside its wrappers
(see `modules/training/index.tsx`). The shell renders every console's `Briefing`
on **all** views (menu and open console), the menu grid from `app/consoles.ts`
(offline tiles greyed/disabled), and the active console's `Screen` behind a back
button. The header's Log Workout button renders **only while Training is open**
and reaches the add sheet via a one-shot mailbox (`modules/training/uiStore.ts`
`requestAddSheet`) — never lift console state into the shell for this.

### Import boundaries (enforced by `eslint.config.js`, `npm run lint`)

- `src/core/**` may NOT import from `src/modules/**` or `src/app/**`
- console modules may NOT import each other (training ↛ capital, capital ↛ training)
- modules MAY import from `src/core/**`; `src/app/**` may import anything

**core is extracted ON CONTACT: only move something into core when a SECOND console
actually needs it. Never design core up front.** (Rules are regex patterns on relative
specifiers — dynamic `import()` isn't checked; it's a guardrail, not security.)

### The three stores (one localStorage key each, fully independent)

- **`batman-workouts` v4** (`modules/training/store.ts`) — `{ workouts, weeklyGoal,
  profile, skin }`. The `skin` field is **legacy/frozen**: nothing reads or writes it
  anymore, but it stays in the interface/partialize/migrate so old blobs and exports
  round-trip unchanged. Do not bump the version for shell concerns.
- **`batman-shell` v2** (`core/store/shell.ts`) — `{ skin, ambient, weekStart }`. On
  true first boot it seeds from the legacy blob's `state.skin`; an existing
  `batman-shell` blob always wins (persist rehydrates synchronously). Skins pass
  through `normalizeSkin` on migrate/rehydrate/set — founder-only ids fall back to
  `midnight` unless `VITE_FOUNDER_SKIN=1` (their CSS ships only in the founder bundle).
- **`batman-capital` v1** (`modules/capital/store.ts`) — Wayne Fund's data: accounts,
  snapshots, holdings, budget/spends, blur flag, plus the Twelve Data `apiKey` and the
  `prices`/`fx` quote cache. Entirely separate from the others.
- **`majordomo-events` v1** (`core/events/store.ts`) — the shared calendar: every wing
  writes `CalendarEvent`s through the store's actions (that action surface is the
  future Supabase seam), the Manor reads them. ISO-instant start/end, exclusive end,
  never day-bucketed; the duty-cycle grid (`core/events/lib.ts`, seam 16:00) renders
  cross-midnight events whole and splits seam-crossers with dotted cut edges.

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
- **The budget** (`lib/budget.ts`) — a running **month-to-date spend** the user
  overwrites whenever they check their card app, vs a monthly target. `budgetPace()`
  linearly projects month-end spend and flags under/on/over.
- **Money math** — `lib/money.ts` (`formatILS` uses **en-US locale so ₪ is an LTR
  prefix** — he-IL scrambles word order inside the English UI), `ASSET_CLASSES`
  (labels + fixed categorical allocation colors). `<Amount>` blurs values (hover to
  reveal) when `blurAmounts` on.
- **Currency is ₪** throughout. Crypto type exists in the model but has no feed yet;
  **Polymarket** and richer budgeting are later phases.

## Training console (`src/modules/training/`)

Centerpiece: an SVG "muscle topography" body map, heat-colored by current strain,
computed from past workouts + recovery-time decay. Layout inside the module mirrors
the old flat app: `types.ts`, `store.ts`, `data/muscles.ts`, `lib/*`, `components/*`,
plus `TrainingScreen.tsx` (the console screen) and `index.tsx` (the ConsoleModule:
Tile = sessions this week vs goal; Briefing = `DailySummary`, which also owns the
DEV `window.__strains` assignment so it's live even on the menu).

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
- **Weekly volume mode** — `modules/training/lib/volume.ts` estimates "effective hard
  sets" per muscle for the current calendar week (the app logs sessions, not sets:
  BASE_SETS× role×effort-scale), classifies each against RP-style MEV/MAV/MRV
  `LANDMARKS`, and the body map has a **Strain | Volume** toggle. Volume mode colors
  under→optimal→pushing→over (blue/green/amber/red) and a deload hint shows when ≥2
  muscles pass MRV. `BodySvg` is mode-agnostic (takes `colorFor`/`glowFor` callbacks).
  It's an estimate in the app's own units, not real set counts — landmarks are tunable.
- Still not modeled (needs data the app doesn't log): per-exercise contribution
  vectors (finer synergist/stabilizer tiers than flat ×0.5), per-set diminishing returns.
  Detail sheet uses `workoutActivity` (% of peak) + `recoveryPhase` for wording.
- **Weekly goal** — persisted in the training store (`weeklyGoal`, 0 = no goal).
  Tracked against the current *calendar* week (Monday-start). "Slacking this week" =
  groups trained in the prior 4 weeks but under 50% of their weekly baseline now
  (`slackingGroups` in `insights.ts`).
- **Nutrition engine** — `modules/training/lib/nutrition.ts`, training-aware macros.
  Protein FLAT (~1.9 g/kg, split over meals — total intake matters, not timing);
  calories & carbs FLEX with training load. Mifflin–St Jeor BMR × rest-day activity
  factor = maintenance; training days add a surplus + per-session kcal (min-capped
  450); carbs = a chronic weekly-load floor (3–4 g/kg, from `avg7WeightedSets`) +
  per-session carb bump; fat = calorie remainder with a ~0.6 g/kg floor that trims
  carbs when hit. Session load is an ESTIMATE (`workoutWeightedSets`:
  SESSION_SETS_BASE×effort×muscle-size `ENERGY_WEIGHT`) since the app logs sessions,
  not sets. All coefficients live in `Profile` (persisted, editable via the gear-menu
  **Profile & nutrition** sheet) — recalibrate to weight trend. Grounded in the
  nutrition build-spec (see [[nutrition-lean-bulk-science]] memory). `profile` also
  drives the opening **briefing** (`DailySummary` + `lib/summary.ts`) and the
  `NutritionCard`.
- **Body map** — `modules/training/components/bodymap/paths.ts` is data-only (SVG
  path strings, viewBox 200×440). Paired muscles are authored as LEFT-half paths and
  mirrored via `transform="translate(200 0) scale(-1 1)"` for guaranteed symmetry.
  The silhouette is one half-path closed along the centerline, rendered twice.
- **PPL workouts resolve to concrete muscle lists at save time** (denormalized into
  each Workout) so tuning `PPL_MAP` in `modules/training/data/muscles.ts` never
  rewrites history.
- **Dates**: all day/week/streak bucketing uses local-time helpers in
  `src/core/dates.ts`. Never bucket with `toISOString().slice(0,10)` (UTC shift bug).
- **Entrance animations** start from a visible state on purpose (see comment in
  `core/ui/index.css`) — a frozen animation must never hide content.

## Dev-only URL params (guarded by `import.meta.env.DEV`)

The app opens on the **menu**. `?console=<id>` (e.g. `?console=capital`) opens any
console directly; the training aids `?sheet` / `?detail` / `?map` / `?debugmap` also
auto-enter Training so they land on the right screen.

- `?demo` — seeds fixtures into empty stores: 10 workouts, the Wayne Fund demo
  (8 accounts, 6 ~monthly snapshots ending today, budget + spend, 2 live-priced
  holdings with cached quotes so the board renders without a key), **and** the
  Manor's "brutal week" (4 night watches + sleep + training + study + payday,
  plus a quieter next week) — screenshot aid
- `?manor=month` — opens the Manor in month view · `window.__events` — events store
- `?console=training|capital` — start the shell inside that console
- `?skin=midnight|terminal|aurora` — forces (and persists) a preset — handled by
  the **shell** store (founder machines also accept the seven legacy skin ids)
- `?sheet=add` / `?sheet=effort` / `?sheet=when` — opens the add sheet on load
  (effort = edit mode on newest workout; when = also expands the calendar)
- `?sheet=skin` — opens the App-skin picker sheet on load
- `?detail` — opens the newest workout's detail sheet
- `?map=volume` — starts the body map in weekly-volume mode
- `?debugmap` — rainbow-colors every muscle plate to spot gaps/overlaps
- `window.__store` / `window.__strains` — training store handle + live strain map in dev
- `window.__capital` — the Wayne Fund store handle in dev
- `window.__engine` — the strain module (sample `recoveryEnvelope(t, style, muscleFactor, nf)`
  to plot recovery curves without React round-trips)
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
