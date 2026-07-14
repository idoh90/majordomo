# Design brief — the Batcomputer console-select dashboard

> A prompt for a designer/frontend agent. Redesign the app's landing view — the
> menu where you pick which console to enter — into the moment the Batcomputer
> boots and asks *which system do you want*. Right now it's a plain 2-column grid
> of `.card` tiles. Make it feel like sitting down at the cave's main terminal.

## Context you must respect

- **App**: "The Batman Project" — a personal tracker built as **one shell + pluggable
  consoles**. The shell (`src/app/App.tsx`) renders a header, the daily briefing row,
  and — on the menu view — a grid of console tiles. Today there are two consoles
  (**Training Grounds**, **Wayne Fund**); more are coming (e.g. an "Academy"), so the
  layout must scale gracefully from 2 to ~6 tiles and degrade to 1.
- **This is the console-select screen only** — the briefing row above it and the
  per-console screens stay as they are. You're redesigning the tile grid + the framing
  around it (an optional masthead / status strip is in scope).
- **Seven skins, one layout.** Everything themes at runtime via CSS variables. You get
  these for free and must use them — never hard-code colors: `text-ink`, `text-ink-dim`,
  `text-ink-faint`, `text-accent`, `text-danger`, `bg-bg`, `bg-panel`, `bg-panel-2/3`,
  `border-line`, and the material classes `.panel`, `.card`, `.card-title`, `.chip`,
  `.stat-num`, `.btn-cta`. The skins range from near-black "Gotham Gold" to a bone-paper
  light "Ironworks-Paper" and a serif "Noir Ledger" — your design must look intentional
  in **all** of them (verify at minimum Gotham, Noir, Ghost, and Ironworks-Paper).
- **No new dependencies. No chart/animation libraries.** Visuals are hand-rolled inline
  SVG + CSS (this is the house style — the body map and net-worth chart are inline SVG).
  Tailwind v4 utilities for layout; skin component classes for material.
- **Entrance animations must start from a visible state** (a frozen animation must never
  leave content hidden — see the comment in `core/ui/index.css`). Keep motion tasteful
  and ~fast; this screen is a launcher, not a cutscene.

## The metadata you have to work with

Each console exports a `ConsoleModule` (`src/core/module.ts`). The dashboard tile can use:

| field | use |
|---|---|
| `name` | e.g. "WAYNE FUND" — the tile title |
| `tagline` | one line, e.g. "Net worth · markets · ledger" |
| `Icon` | a monogram glyph (inline SVG, inherits `currentColor`) |
| `status` | `'online' \| 'offline'` — offline tiles are powered-down & unclickable |
| `Tile` | a live stat component (e.g. "3 / 4 sessions this week", "₪7.4K / ₪12K") |

If the design needs more per-console signal (an accent hue, a secondary metric, a
sparkline), **propose the field** and add it to `ConsoleModule` + populate it in each
module's `index.tsx` — don't fake it with hard-coded per-id switches in the shell.

## The vibe — "systems online"

Sitting down at the Batcomputer. A dark operations console waking up, each subsystem
reporting in. Reach for:

- **A masthead / command line.** A thin header above the grid — something like
  `BATCOMPUTER · SELECT CONSOLE` with a live clock/stardate, an "N SYSTEMS ONLINE"
  readout, maybe a faint typing/scanline treatment. Terminal, not chrome.
- **Tiles as *modules*, not buttons.** Each tile reads like a rack unit: the `Icon`
  monogram, `name`, `tagline`, a **status LED** (online = a live accent dot, ideally
  with a soft pulse; offline = a dim, dead dot + "STANDBY"), and the live `Tile` stat
  given room to breathe as the hero number. Hover = the unit "energizes" (accent edge,
  faint glow, the stat brightening). Offline = visibly powered down (desaturated,
  cross-hatch or dim scrim, cursor not-allowed).
- **Structure & depth.** A subtle background grid / blueprint rule, hairline dividers,
  corner ticks or bracket accents on the active tile — the cave's engineering aesthetic.
  Consider a faint radial glow behind the grid so it reads as backlit glass.
- **Boot-in.** Tiles stagger in (translate/opacity, honoring the visible-start rule) as
  if each subsystem reports online in sequence. Milliseconds, not seconds.

Skin-specific reflexes: on **Noir Ledger** lean into the paper-ledger dossier feel (rules,
section numbers, serif) rather than sci-fi glow; on the **light** skins drop glow for crisp
ink-on-paper and let structure carry it; on **Tac-Ops** push the terminal/status-strip
angle hardest; **Ghost** stays whisper-minimal. One layout, dialed per skin via the tokens.

## Constraints & non-goals

- Keep it **fast and legible first** — the point is choosing a console in one glance. Don't
  bury the live stat under decoration. Accessibility: real `<button>`s, `aria-disabled`
  for offline, focus-visible rings, sensible contrast in every skin.
- Fully responsive: a clean single column on mobile, multi-column on desktop, no
  horizontal scroll. Icons/taglines must not overflow.
- Don't touch the console `Screen`s, the briefing components, or the stores.

## Deliverables

1. The redesigned console-select view in `src/app/App.tsx` (extract sub-components as
   needed; a `ConsoleTile` and optional `DashboardMasthead` are natural).
2. Any new `ConsoleModule` metadata fields (in `core/module.ts`) you introduce, populated
   for both existing consoles.
3. Screenshots proving it in **Gotham, Noir, Ghost, and Ironworks-Paper** (headless Chrome
   per the workflow in `CLAUDE.md`), at desktop and mobile widths.

## Acceptance

`npm run build` + `npm run lint` clean; opens on the menu with both tiles reading their
live stats; offline tiles inert; looks deliberate and "Batcomputer" in all four verified
skins; no layout breakage from 1 to 6 tiles.
