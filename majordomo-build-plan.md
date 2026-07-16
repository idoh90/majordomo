# MAJORDOMO — The Build Plan
### Milestone-by-milestone engineering plan for the pivot · v2 · July 2026
*(Companion to `majordomo-playbook.md`. Reconstructs and supersedes the lost
`alfred-master-build-plan.md`: the original's stages 0–7 are folded into the
milestones below, re-grounded in the actual codebase and in the shipped design
project — claude.ai/design "Majordomo: Calendar OS", files `Majordomo Manor.dc.html`
(the implementation target), `Majordomo Tokens.dc.html` (token contract), and
`Week View Directions.dc.html` (chosen: direction 1a, Duty-Cycle Columns).)*

---

## §0 · What we're building

The app becomes **Majordomo**: the Manor (a shift-literate calendar) is home;
consoles become Wings behind a tab nav — THE MANOR / THE WATCH / THE GROUNDS /
THE LEDGER. Three commercial presets (Midnight · Terminal · Aurora), a butler
voice module, and the Batman identity surviving only behind a local founder flag
that never ships.

**Standing constraints** (from the playbook + user decisions):
- The Grounds keeps **every** existing Training Grounds feature; the design's
  Grounds sketch is directional only — where it omits an old feature, the old
  feature wins.
- Responsive from day one — the week grid ships with its mobile duty-cycle variant.
- Real user data lives in three localStorage blobs with no backend; every
  migration must be lossless and preceded by the backup ritual (§V).
- `npm run build` + `npm run lint` green at every commit. No test runner —
  verification is in the browser (see §V).

## §1 · Locked design decisions

1. **Tokens** — the design's values map onto the *existing* token names
   (`--color-bg/panel/panel-2/panel-3/line/ink/ink-dim/ink-faint/accent/danger`…)
   so the whole component fleet restyles for free. New tokens added:
   `--color-positive`, wing accents `--color-w-watch/-grounds/-ledger/-study`,
   accent-glow, plus per-preset font vars. Design token contract (from
   `Majordomo Tokens.dc.html`): bg / surface / surface-2 / border / text-primary /
   text-secondary / accent / accent-glow / positive / negative / w-*.
2. **No skin-id renames.** The 7 legacy skins keep their ids and move behind the
   founder flag: their CSS lives in `core/ui/founder-skins.css`, dynamically
   imported only when `FOUNDER` (`core/founder.ts`, reads
   `import.meta.env.VITE_FOUNDER_SKIN === '1'` from `.env.local`, gitignored) —
   tree-shaken from commercial builds. `DEFAULT_SKIN = 'midnight'`; a non-founder
   boot with a persisted founder-only skin normalizes to `midnight` (blob
   otherwise untouched).
3. **Fonts** — `@fontsource/big-shoulders` (display: wordmark, view titles, hero
   numerals) + `@fontsource/source-sans-3` (body). Tabular numerals on every stat.
   Motion doctrine: interactive 150–250ms, springy drag,
   `prefers-reduced-motion` always respected. (Ambient loops were built in M1
   and later removed — idle animation cost on old machines; no background
   motion ships.)
4. **The week grid** — each column spans `[seam, seam+24h)` with
   `SEAM_HOUR = 0` (`core/events/lib.ts`): ordinary calendar days, which read
   fastest. A 19:00→08:00 night watch splits across its two columns with
   dotted "continues" edges — the data is never day-bucketed, only its
   rendering. The month view uses "→ until 08:00" continuation chips for any
   timed cross-midnight event. Honors the `weekStart` setting. Mobile = one
   column per screen, day chips, snap scrolling. *(The original direction-1a
   duty-cycle seam — 16:00, so a night watch renders as ONE block — shipped,
   was lived with at 12:00, and was reverted to 0 in `f138a3c`; it remains one
   constant away, and the auto "quietest hour" seam stays backlog.)*
5. **Event schema** (`src/core/events/`) —
   `CalendarEvent { id, source, sourceRef?, kind, title, start, end, allDay?, notes?, updatedAt }`
   with ISO-instant `start`/`end` (exclusive end; cross-midnight is natural data,
   never day-bucketed). Store `majordomo-events` v1. Components touch events only
   through store actions/selectors — that action surface is the future Supabase
   seam (no adapter built until a backend actually exists).
6. **Wings as data** — wing colors are tokens; `rest` (sleep) renders hatched and
   is a first-class event; `study` exists as an event kind + color only (the
   Study wing itself is backlog).
7. **What-if** — draft fork in the events store (cloned list + changed-id set),
   committed originals as dashed ghosts, "THE DIFFERENCE" panel (hours by wing,
   before → after), fixed APPLY/Discard bar. Sandbox state is never persisted.
8. **Drag** — hand-rolled pointer events: 5px lift threshold, 0.5h snap,
   occupancy check (no overlaps), invalid = red ghost + "occupied, sir",
   cross-day drop or strain conflict → confirm dialog, otherwise move + toast
   with single-slot UNDO.
9. **Strain × calendar** — the real strain engine (`modules/training/lib/strain.ts`)
   powers the Manor's recovery strips, popover "Strain on the legs until THU 08:00"
   lines, and `strainWarn` ("you would train already worn, sir") from logged
   workouts + scheduled Grounds events. The design's toy `recovOf` is a spec, not
   an implementation.
10. **voice.ts** — `core/voice/`: `types.ts` (VoicePack), `packs/majordomo.ts`
    (seeded with the design's finished butler copy), `packs/founder.ts` (Batman
    strings), selected at build time by FOUNDER (tree-shaken). Parameterized
    strings are pack *functions* — that's what makes Hebrew/persona packs a
    content drop later. **Rule: all new user-facing strings go through voice.**
11. **Shell** — `App.tsx` view state `'manor' | 'watch' | 'grounds' | 'ledger'`,
    default `'manor'`. ONE header (wordmark + date/time + tabs + preset dots)
    for all skins. The five Batman header variants, menu grid, briefing row and
    TacOpsStrip are deleted — the founder flag governs strings + skins, never
    layout. The Manor briefing strip absorbs the old DailySummary role; macros
    stay in the Grounds; the Ledger line folds into its screen. `?console=` maps
    to views for back-compat.
12. **Identity + storage keys** — full sweep (index.html, manifest, favicon →
    "M" monogram placeholder, package.json `majordomo`, launch.json
    `majordomo-dev`, probe `'__storage_probe__'`); export tag becomes
    `app:'majordomo-training'` with imports dual-accepting the old
    `'batman-workouts'` tag forever; localStorage keys rename
    `batman-shell/-workouts/-capital` → `majordomo-shell/-training/-capital` via
    `adoptLegacyKey(newKey, oldKey)` (verbatim blob copy, so each store's own
    migrate chain applies; old keys kept as insurance). `scripts/check-brand.mjs`
    greps a founder-flag-less `dist/` for `/batman|gotham|wayne/i` → must be empty.
13. **Settings gear stays** (restyled): skin picker shows the 3 presets (+ legacy
    skins only under FOUNDER; an active hidden skin is never stomped), profile
    & nutrition, week start, backup export/import, clear the workout log.

## §2 · Milestones

| # | Milestone | Contents | Gate |
|---|---|---|---|
| ✅ M0 | Foundation | git baseline · this doc · CLAUDE.md Direction section · backup ritual (in-app since `6acb553`) | docs committed |
| ✅ M1 | Theme foundation | fonts · new tokens + 3 preset bundles · SKINS entries + founder split · DEFAULT_SKIN midnight · shell v2 normalize · AmbientLayer *(later removed — idle cost)* · voice scaffold + wave-1 strings | old screens legible under midnight; screenshots ×3 presets |
| ✅ M2 | New shell + identity | tab header · view state · old shell furniture deleted · identity sweep · check-brand gate · key renames (`f83b742`, backup ritual `6acb553`) | check-brand clean; real data intact |
| ✅ M3 | Events + Manor read-only | core/events store+lib · seamed WeekGrid (desktop+mobile) · month view · empty state · popover · briefing strip · ?demo fixtures | night watch renders whole ✓ *(one block under the original seam; splits with dotted continues edges since SEAM_HOUR = 0)* |
| ✅ M4 | The Watch | POST A WATCH strip · ON DUTY ring · NEXT WATCH · week list · sleep pencilled after nights · eslint zone · nav mailbox | posting a watch lands it on the Manor ✓ |
| ✅ M5 | Interactions | quick-add popover · drag engine (desktop + mobile: 350ms long-press, day-chip drop targets, edge auto-scroll) · confirm/toast/undo | drag/quick-add exercised in browser ✓ |
| ✅ M6 | What-if | draft fork in events store · ghosts · diff panel · APPLY/Discard bar | discard leaves base blob byte-identical ✓ |
| M7 | The Grounds | full restyle, ALL old features kept · additive design cards · strain↔Manor bridge · log-fulfills-block | every pre-pivot training feature reachable |
| M8 | The Ledger | token-restyle QA · payday markers · tab polish | all capital sheets legible ×3 presets |

## §3 · LATER backlog (post-M8, order negotiable)

Auto quietest-hour seam · Watch rotation patterns (materialized instances,
future-only regeneration) · ~~the Study wing~~ **in build** (spec:
`majordomo-study-spec.md`, milestones S1–S3, jumped the queue ahead of M7/M8
after its design session) · onboarding flow · weekly report
card · Supabase swap behind the events action surface · PWA push briefings
(shift-aware timing) · Hebrew/persona voice packs · landing page + waitlist.

## §V · Verification ritual

- **Backup (USER, before any storage migration):** gear → Export backup file,
  plus DevTools:
  `copy(JSON.stringify(Object.fromEntries(Object.entries(localStorage)), null, 2))`
  → save outside the repo. This is the only backup capital has.
- **Every commit:** `npm run build` + `npm run lint`; reload with real data —
  workout count, net-worth figure, skin, weekStart unchanged.
- **Screenshots:** headless Chrome (the in-app browser pane freezes animations —
  see CLAUDE.md), dev server 5173, `?demo` fixtures, ×3 presets, desktop + mobile.
- **Key-rename commit:** both key generations visible in devtools; export→import
  round-trip in a scratch profile; an old `"app":"batman-workouts"` file imports.
- **Brand gate:** `node scripts/check-brand.mjs` after building without
  `.env.local` — zero matches in `dist/`.
