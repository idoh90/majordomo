import { computeStrains } from '../../modules/training/lib/strain'
import { HOT_THRESHOLD } from '../../modules/training/lib/recovery'
import { MUSCLES } from '../../modules/training/data/muscles'
import type { MuscleId, Workout } from '../../modules/training/types'

/**
 * The Grounds' strain engine, read by the Manor.
 *
 * `computeStrains` scores any instant, not just now — the recovery envelope is
 * deterministic decay of what's already logged — so a day that hasn't happened
 * yet has a knowable strain. That is the whole point of putting it on the
 * calendar: Thursday can be shown as wrecked on Tuesday, before it is planned.
 */

/** at or past this a muscle is "hot" — the wing's own threshold, re-exported
 *  under the Manor's name so the two can never drift apart */
export const HOT = HOT_THRESHOLD
/** a full bar = this many muscles hot at once */
export const HOT_CAP = 6
/** samples across one 24 h duty cycle; the envelope is smooth, 4 h is plenty */
const SAMPLES = 6

export interface DayStrain {
  /** muscles at or past HOT at the day's worst moment, hottest first */
  hot: { id: MuscleId; label: string; strain: number }[]
  /** the window has not started yet — pure decay forecast */
  forecast: boolean
}

function hotAt(workouts: Workout[], atMs: number): DayStrain['hot'] {
  const strains = computeStrains(workouts, atMs)
  return (Object.keys(strains) as MuscleId[])
    .filter((m) => strains[m] >= HOT)
    .map((m) => ({ id: m, label: MUSCLES[m].label, strain: strains[m] }))
    .sort((a, b) => b.strain - a.strain)
}

/**
 * Per-day strain for a run of duty-cycle windows. Each day reports its WORST
 * moment — the sample with the most hot muscles, ties broken by the hottest one
 * — so a leg day logged at 19:00 still colors that column.
 */
export function dayStrains(
  workouts: Workout[],
  windows: { start: Date; end: Date }[],
  now: number,
): DayStrain[] {
  return windows.map((w) => {
    const span = w.end.getTime() - w.start.getTime()
    let best: DayStrain['hot'] = []
    let bestKey = -1
    for (let i = 0; i < SAMPLES; i++) {
      const hot = hotAt(workouts, w.start.getTime() + (span * i) / SAMPLES)
      const key = hot.length * 100 + (hot[0]?.strain ?? 0)
      if (key > bestKey) {
        bestKey = key
        best = hot
      }
    }
    return { hot: best, forecast: w.start.getTime() > now }
  })
}
