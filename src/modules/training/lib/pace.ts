/**
 * The run sheet's pace model ("Run Entry Explorations" 1c): pace lives on a
 * fixed band of seconds-per-km, carved into training zones anchored to the
 * user's own easy pace. Everything here is pure — the sheet renders it, the
 * effort prefill reads it, nothing is persisted but the easy anchor
 * (`Profile.easyPaceSec`).
 */

/**
 * The band: 2:00/km to 9:00/km. The fast end is short-interval territory —
 * 2:00/km is past 800 m world-record pace, so nothing a person can actually
 * run falls off the left edge.
 */
export const PACE_MIN = 120
export const PACE_MAX = 540
export const PACE_SPAN = PACE_MAX - PACE_MIN

export const clampPace = (p: number): number => Math.min(PACE_MAX, Math.max(PACE_MIN, p))

/** where a pace sits on the band, 0–100 */
export const pacePct = (p: number): number =>
  Math.min(100, Math.max(0, ((p - PACE_MIN) / PACE_SPAN) * 100))

/**
 * The easy anchor's stepper bounds. The floor is 3:00/km — faster than any
 * human's *easy* pace, and far enough above the band's own floor that the
 * fastest zone edge (easy ÷ 1.33) still lands inside the band, so all five
 * zones stay drawable however fast the runner is.
 */
export const EASY_PACE_MIN = 180
export const EASY_PACE_MAX = PACE_MAX
export const EASY_PACE_STEP = 5

export type RunZoneId = 'max' | 'threshold' | 'steady' | 'easy' | 'recovery'

export interface RunZone {
  id: RunZoneId
  /** easy÷pace at the zone's fast edge — the slowest zone has no edge */
  ratio: number | null
  /** representative strain, colored through the skin's heat ramp */
  strain: number
}

/** fastest first — the band renders these left to right */
export const RUN_ZONES: RunZone[] = [
  { id: 'max', ratio: 1.33, strain: 9.4 },
  { id: 'threshold', ratio: 1.2, strain: 7.6 },
  { id: 'steady', ratio: 1.08, strain: 6.0 },
  { id: 'easy', ratio: 0.95, strain: 4.2 },
  { id: 'recovery', ratio: null, strain: 2.2 },
]

export function runZone(easySec: number, paceSec: number): RunZone {
  const r = easySec / paceSec
  return RUN_ZONES.find((z) => z.ratio !== null && r >= z.ratio) ?? RUN_ZONES[RUN_ZONES.length - 1]
}

/** the paces where zones hand over, fastest first (may run past the band) */
export const zoneEdges = (easySec: number): number[] =>
  RUN_ZONES.filter((z) => z.ratio !== null).map((z) => easySec / z.ratio!)

/** below this effort the sheet rests in accent colours and prefills nothing */
export const EFFORT_LIVE = 0.35

/**
 * The effort a run of this shape earns, 0–10: intensity relative to the easy
 * pace, cubed (hard minutes cost disproportionately), times duration^0.6
 * (long runs wear, but sub-linearly). 45 easy minutes ≈ effort 4.
 */
export function runEffort(easySec: number, km: number, paceSec: number): number {
  if (!(km > 0) || !(paceSec > 0)) return 0
  const intensity = Math.min(1.6, Math.max(0.5, easySec / paceSec))
  const durMin = (km * paceSec) / 60
  return Math.min(10, 4 * Math.pow(intensity, 3) * Math.pow(durMin / 45, 0.6))
}
