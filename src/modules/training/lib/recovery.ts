import type { MuscleId, Workout } from '../types'
import { MUSCLES } from '../data/muscles'
import { computeStrains } from './strain'

/**
 * The recovery outlook: which muscles are hot right now, and when each one
 * settles. "Settles" = the first hour the strain envelope decays below the
 * hot bar — pure decay of what's already logged, so it's a statement, not a
 * guess. Same threshold the Manor's strain chips use (app/manor/strain.ts).
 */

export const HOT_THRESHOLD = 6
/** the envelope is fully resolved within ~6.5 days; scan a hair past it */
const SCAN_HOURS = 8 * 24
const HOUR_MS = 3_600_000

export interface RecoveryRow {
  id: MuscleId
  label: string
  /** strain now, 0–10 */
  strain: number
  /** first instant below the hot bar; null only if the scan ran out */
  settlesAt: number | null
}

export function recoveryOutlook(workouts: Workout[], now: number, limit = 3): RecoveryRow[] {
  const strains = computeStrains(workouts, now)
  const hot = (Object.keys(strains) as MuscleId[])
    .filter((m) => strains[m] >= HOT_THRESHOLD)
    .sort((a, b) => strains[b] - strains[a])
    .slice(0, limit)
  if (hot.length === 0) return []

  const settled = new Map<MuscleId, number>()
  const pending = new Set(hot)
  for (let h = 1; h <= SCAN_HOURS && pending.size > 0; h++) {
    const t = now + h * HOUR_MS
    const s = computeStrains(workouts, t)
    for (const m of [...pending]) {
      if (s[m] < HOT_THRESHOLD) {
        settled.set(m, t)
        pending.delete(m)
      }
    }
  }

  return hot.map((m) => ({
    id: m,
    label: MUSCLES[m].label,
    strain: strains[m],
    settlesAt: settled.get(m) ?? null,
  }))
}
