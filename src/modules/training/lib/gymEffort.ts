/**
 * The muscle step's pick model ("Run Entry Explorations" 3a): what a set of
 * muscle picks says about the session before a slider is ever touched. Pure —
 * the body-map twin renders it, the effort prefill reads it, nothing is
 * persisted. The run step's `lib/pace.ts` is the sibling: same EFFORT_LIVE
 * threshold, same prefill contract.
 */

import type { MuscleId, PplType, RepStyle, Workout } from '../types'
import { PPL_MAP } from '../data/muscles'
import { computeStrains, type StrainMap } from './strain'
import { EFFORT_LIVE } from './pace'

/** structurally the add sheet's Selection — kept local so lib never imports a component */
export type MuscleSelection = Partial<Record<MuscleId, 'primary' | 'secondary'>>

export function selectionCounts(sel: MuscleSelection): { p: number; s: number } {
  const v = Object.values(sel)
  return {
    p: v.filter((x) => x === 'primary').length,
    s: v.filter((x) => x === 'secondary').length,
  }
}

/**
 * The effort a pick of this shape suggests, 0–10: primaries sublinear
 * (^0.75 — a fourth muscle group adds less than the first), secondaries a
 * light flat tax. One primary lands ~2, a full PPL-day spread ~5–6.
 */
export function gymEffort(sel: MuscleSelection): number {
  const { p, s } = selectionCounts(sel)
  return Math.min(10, 2.3 * Math.pow(p, 0.75) + 0.7 * s)
}

/** the effort the prefill would hand the next step, or null while nothing
 *  primary is marked */
export function gymEffortPrefill(sel: MuscleSelection): number | null {
  if (selectionCounts(sel).p === 0) return null
  const eff = gymEffort(sel)
  return eff > EFFORT_LIVE ? Math.round(Math.max(1, eff)) : null
}

/** the session being drafted, in the only terms the strain engine reads */
export interface DraftSession {
  performedAt: string
  effort: number
  strainFeel: number
  repStyle: RepStyle
}

/**
 * The body as this session would leave it: every muscle's CURRENT strain from
 * the log, plus what the picks would add on top. Unpicked muscles are
 * untouched, so the figure reads as the whole body's state and not as a
 * drawing of the chips.
 *
 * `workouts` must already exclude the session being edited — otherwise its
 * stored copy and its draft both land on the same muscles and the preview
 * doubles them.
 */
export function projectedStrains(
  workouts: Workout[],
  sel: MuscleSelection,
  draft: DraftSession,
  nowMs: number,
): StrainMap {
  const ids = Object.keys(sel) as MuscleId[]
  const primary = ids.filter((m) => sel[m] === 'primary')
  const secondary = ids.filter((m) => sel[m] === 'secondary')
  if (primary.length === 0 && secondary.length === 0) return computeStrains(workouts, nowMs)
  // a draft is priced exactly like a saved session — same engine, same
  // constants, so the preview can never disagree with the map it previews
  const pending: Workout = {
    id: '__draft__',
    createdAt: draft.performedAt,
    performedAt: draft.performedAt,
    method: 'custom',
    primary,
    secondary,
    effort: draft.effort,
    strainFeel: draft.strainFeel,
    repStyle: draft.repStyle,
  }
  return computeStrains([...workouts, pending], nowMs)
}

/** each PPL day's full spread (primary + secondary) — the shape test is a
 *  subset check against these, so tuning PPL_MAP tunes the chip for free */
const PPL_SETS = (Object.keys(PPL_MAP) as PplType[]).map(
  (t) => [t, new Set<MuscleId>([...PPL_MAP[t].primary, ...PPL_MAP[t].secondary])] as const,
)

/**
 * What the picks add up to: a recognizable PPL day (every pick inside that
 * day's spread), a free mix, or nothing yet.
 */
export function selectionShape(sel: MuscleSelection): PplType | 'custom' | null {
  const ids = (Object.keys(sel) as MuscleId[]).filter((m) => sel[m] !== undefined)
  if (ids.length === 0) return null
  for (const [t, set] of PPL_SETS) if (ids.every((m) => set.has(m))) return t
  return 'custom'
}
