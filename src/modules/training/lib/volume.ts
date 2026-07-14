import { isRun, type MuscleId, type Workout } from '../types'
import { ALL_MUSCLE_IDS } from '../data/muscles'
import { weekKey, type WeekStart } from '../../../core/dates'

/*
 * Weekly training-volume model (per calendar week), classified against
 * RP-style MEV/MAV/MRV landmarks so the map can flag under-stimulation vs
 * overreaching. The app logs sessions (two sliders + rep style), NOT sets — so
 * this ESTIMATES "effective hard sets": a focused session ≈ BASE_SETS hard
 * sets, halved for a secondary muscle, and scaled by effort (a token session
 * counts less than a near-failure one). It's an approximation in the app's own
 * units, not a real set count — the landmarks below are tunable.
 */

const BASE_SETS = 5
const SECONDARY = 0.5
const effortScale = (effort: number) => 0.4 + 0.08 * effort // 0.4 (effort 0) → 1.2 (effort 10)

export function sessionSets(w: Workout, m: MuscleId): number {
  const role = w.primary.includes(m) ? 1 : w.secondary.includes(m) ? SECONDARY : 0
  if (role === 0) return 0
  return BASE_SETS * role * effortScale(w.effort)
}

export type VolumeMap = Record<MuscleId, number>

/** Estimated effective hard sets per muscle for the current calendar week. */
export function weeklyVolume(workouts: Workout[], now: Date, weekStart?: WeekStart): VolumeMap {
  const wk = weekKey(now, weekStart)
  const v = Object.fromEntries(ALL_MUSCLE_IDS.map((m) => [m, 0])) as VolumeMap
  for (const w of workouts) {
    // runs load the legs but they are not hard sets — the MEV/MAV/MRV landmarks
    // below are hypertrophy-set landmarks, so counting a run against them would
    // read as overreaching that never happened
    if (isRun(w)) continue
    if (weekKey(new Date(w.performedAt), weekStart) !== wk) continue
    for (const m of ALL_MUSCLE_IDS) v[m] += sessionSets(w, m)
  }
  return v
}

export interface Landmark {
  /** minimum effective volume — below this the muscle is under-stimulated */
  mev: number
  /** top of the maximum-adaptive range — above this you're pushing */
  mavHi: number
  /** maximum recoverable volume — at/above this you're overreaching */
  mrv: number
}

/** Per-muscle weekly-set landmarks (RP-style, rounded into bands; tunable). */
export const LANDMARKS: Record<MuscleId, Landmark> = {
  chest: { mev: 8, mavHi: 18, mrv: 22 },
  lats: { mev: 10, mavHi: 20, mrv: 25 },
  'lower-back': { mev: 4, mavHi: 12, mrv: 16 },
  traps: { mev: 4, mavHi: 18, mrv: 24 },
  'front-delts': { mev: 4, mavHi: 10, mrv: 12 },
  'side-delts': { mev: 8, mavHi: 22, mrv: 26 },
  'rear-delts': { mev: 6, mavHi: 16, mrv: 20 },
  biceps: { mev: 8, mavHi: 18, mrv: 24 },
  triceps: { mev: 6, mavHi: 14, mrv: 18 },
  forearms: { mev: 4, mavHi: 12, mrv: 16 },
  abs: { mev: 0, mavHi: 16, mrv: 22 },
  obliques: { mev: 0, mavHi: 12, mrv: 18 },
  quads: { mev: 8, mavHi: 18, mrv: 20 },
  hamstrings: { mev: 6, mavHi: 16, mrv: 20 },
  glutes: { mev: 4, mavHi: 12, mrv: 16 },
  calves: { mev: 8, mavHi: 16, mrv: 20 },
}

export type VolumeStatus = 'none' | 'under' | 'optimal' | 'pushing' | 'over'

export function volumeStatus(m: MuscleId, sets: number): VolumeStatus {
  if (sets < 0.5) return 'none'
  const l = LANDMARKS[m]
  if (sets < l.mev) return 'under'
  if (sets <= l.mavHi) return 'optimal'
  if (sets < l.mrv) return 'pushing'
  return 'over'
}

export const VOLUME_COLORS: Record<VolumeStatus, string> = {
  none: '#20242c', // graphite — untrained this week
  under: '#2f6079', // steel blue — below MEV
  optimal: '#43a35b', // green — in the adaptive range
  pushing: '#f5b301', // amber — upper MAV → MRV
  over: '#f53b1e', // red — at/over MRV
}

export const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  none: 'not trained yet',
  under: 'under target',
  optimal: 'optimal',
  pushing: 'pushing',
  over: 'overreaching',
}

/** Muscles at or beyond MRV this week (drives the deload hint). */
export function overreachingMuscles(vol: VolumeMap): MuscleId[] {
  return ALL_MUSCLE_IDS.filter((m) => volumeStatus(m, vol[m]) === 'over')
}
