import { isLift, type MuscleId, type Workout } from '../types'
import { ALL_MUSCLE_IDS } from '../data/muscles'
import { addDays, startOfLocalDay, startOfWeek, type WeekStart } from '../../../core/dates'
import { rampColor, type HeatRamp } from './strainColor'

/*
 * Training-volume model, classified against RP-style MEV/MAV/MRV landmarks so
 * the map can flag under-stimulation vs overreaching. The app logs sessions
 * (two sliders + rep style), NOT sets — so this ESTIMATES "effective hard
 * sets": a focused session ≈ BASE_SETS hard sets, halved for a secondary
 * muscle, and scaled by effort (a token session counts less than a
 * near-failure one). It's an approximation in the app's own units, not a real
 * set count — the landmarks below are tunable.
 *
 * The halving of secondary work is the literature's "fractional" counting
 * method, which the 2025 dose-response meta-regression found to be the
 * quantification that best predicts adaptation. It is not a rounding
 * convenience; don't flatten it to 1.
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

const zeroMap = (): VolumeMap =>
  Object.fromEntries(ALL_MUSCLE_IDS.map((m) => [m, 0])) as VolumeMap

/** runs and sport sessions load muscles but they are not hard sets — the
 *  MEV/MAV/MRV landmarks are hypertrophy-set landmarks, so counting them
 *  would read as overreaching that never happened */
function sumSets(workouts: Workout[], inWindow: (t: Date) => boolean): VolumeMap {
  const v = zeroMap()
  for (const w of workouts) {
    if (!isLift(w)) continue
    if (!inWindow(new Date(w.performedAt))) continue
    for (const m of ALL_MUSCLE_IDS) v[m] += sessionSets(w, m)
  }
  return v
}

/** how many local days the map looks back over — today plus the six before it */
export const TRAILING_DAYS = 7

/**
 * Estimated effective hard sets per muscle over the TRAILING seven local days.
 *
 * Deliberately NOT the calendar week. Week-to-date sets measured against
 * full-week landmarks means every Monday morning the whole body reads "under"
 * — indistinguishable from a week that really was neglected, and the same
 * Monday-morning wall slackingGroups had to prorate its way out of. A trailing
 * window has no reset to be caught early in: it always answers the question
 * the map is actually asked, "is each muscle fed right now", the same
 * continuous way strain does.
 */
export function trailingVolume(workouts: Workout[], now: Date): VolumeMap {
  const from = addDays(startOfLocalDay(now), -(TRAILING_DAYS - 1))
  return sumSets(workouts, (t) => t >= from)
}

/**
 * Each muscle's own usual week: mean sets over the four COMPLETED calendar
 * weeks before this one (the muscle-grain twin of slackingGroups' baseline).
 * Four full weeks against a seven-day trailing window is like for like — both
 * are a week's worth of sets.
 */
export function muscleBaselines(workouts: Workout[], now: Date, weekStart?: WeekStart): VolumeMap {
  const currentStart = startOfWeek(now, weekStart)
  const priorStart = addDays(currentStart, -28)
  const v = sumSets(workouts, (t) => t >= priorStart && t < currentStart)
  for (const m of ALL_MUSCLE_IDS) v[m] /= 4
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

/** below this a muscle counts as untrained rather than barely trained */
const SETS_FLOOR = 0.5

export function volumeStatus(m: MuscleId, sets: number): VolumeStatus {
  if (sets < SETS_FLOOR) return 'none'
  const l = LANDMARKS[m]
  if (sets < l.mev) return 'under'
  if (sets <= l.mavHi) return 'optimal'
  if (sets < l.mrv) return 'pushing'
  return 'over'
}

/*
 * BAND POSITION — where a muscle sits on its own scale, as one number.
 *
 *   0 = untrained · 1 = MEV · 2 = top of MAV · 3 = MRV · 3.5 = well past it
 *
 * Landmarks differ per muscle (four sets is a full week for the lower back and
 * a warm-up for the lats), so raw sets can't be coloured on a shared ramp.
 * Position normalises them, which is what lets ONE ramp paint sixteen muscles
 * and lets the colour move CONTINUOUSLY: the 2025 dose-response meta-regression
 * finds hypertrophy a smooth diminishing-returns curve, not a staircase, and
 * the landmarks themselves are coaching heuristics with wide individual
 * variance. Four flat colours drew cliffs the physiology doesn't have — 17.9
 * sets green, 18.1 amber — and hid every difference inside a band, so eight
 * sets and eighteen looked identical.
 */
export const BAND_MAX = 3.5

export function bandPosition(m: MuscleId, sets: number): number {
  if (sets < SETS_FLOOR) return 0
  const { mev, mavHi, mrv } = LANDMARKS[m]
  // abs and obliques have no minimum, so the first leg is degenerate for them:
  // any real work lands them at MEV, which is the honest reading
  if (sets < mev) return sets / mev
  if (sets < mavHi) return 1 + (sets - mev) / (mavHi - mev)
  if (sets < mrv) return 2 + (sets - mavHi) / (mrv - mavHi)
  // past MRV the scale stops being meaningful, so it saturates rather than
  // running off: 30% over the ceiling is as loud as the map gets
  return Math.min(BAND_MAX, 3 + (sets - mrv) / (mrv * 0.3) * 0.5)
}

/**
 * Volume ramps, sampled by band position — the volume twin of HEAT_STOPS, and
 * keyed by the same HeatRamp so a skin needs no second flag.
 *
 * Grammar: dim/cool = room to grow, the middle = fed, loud = at the ceiling.
 * The optimal band spans 1→2 and the colour keeps MOVING across it, so "just
 * enough" and "all it can use" don't look the same.
 *
 * LUMINANCE IS THE SECOND CHANNEL. The first draft of these ramps put green,
 * yellow-green, amber and red within 0.05 relative luminance of each other,
 * which meant the whole fed→overcooked half of the scale was one flat grey to
 * a red-green colourblind eye. Each ramp now climbs (or, on the light skins,
 * descends) in brightness as well as hue, so the reading survives without it.
 * The one place that isn't free: a saturated red can't be made brighter than
 * amber without turning salmon, so on the dark ramps the MRV stop dips before
 * the far end recovers. The glow (proportional past the top of MAV, below),
 * the legend's landmark notches, and the tapped readout are the redundant
 * channels that cover that gap — the same bargain the strain ramp makes.
 */
export const VOLUME_STOPS: Record<HeatRamp, [number, string][]> = {
  standard: [
    [0.0, '#20242c'], // untrained graphite
    [0.35, '#1e3a4a'], // faint steel — barely started
    [1.0, '#2c6470'], // teal — at MEV
    [1.5, '#2f8050'], // green — mid band
    [2.0, '#7a9c2e'], // yellow-green — top of MAV
    [2.5, '#e08a06'], // amber — pushing
    [3.0, '#f5551e'], // red — at MRV
    [3.5, '#ff8f4a'], // molten — past it, and the brightest thing on the figure
  ],
  // Noir owns no green, so the band cannot be signalled by the green/amber/red
  // convention the other skins inherit from every training app. It signals the
  // same thing with LIGHT instead, on the skin's own two-tone: soot when
  // starved, warm paper as it fills, rust and fire past the ceiling.
  //
  // A diverging ramp was tried first — calm paper at the target, both ways of
  // being wrong moving away from it — which is the textbook encoding for a
  // target-band metric and reads beautifully in colour. It was dropped because
  // it puts "fed" and "overcooked" at the SAME brightness, so with hue removed
  // the two opposite verdicts became one colour.
  noir: [
    [0.0, '#2a2320'], // soot — untrained
    [0.35, '#382e26'], // barely lifted
    [1.0, '#584a3c'], // warm ash — at MEV
    [1.5, '#6f5c46'], // paper — mid band
    [2.0, '#8a6a44'], // paper warming — top of MAV
    [2.5, '#b0552c'], // rust — pushing
    [3.0, '#d94a24'], // vermilion — at MRV
    [3.5, '#ff8f4a'], // burning
  ],
  // The light skins run the ramp the other way up: a pale silhouette makes the
  // DARKEST plate the loudest one, so untrained recedes into porcelain and the
  // ceiling lands as alarm ink. Monotonic the whole way down — the warm end
  // sits at the light skins' deep ink-gold register rather than a bright amber
  // that would read quieter than the band it is warning about.
  daylight: [
    [0.0, '#e3e2d8'], // untrained porcelain
    [0.35, '#c3d0d6'], // pale grey-blue
    [1.0, '#79aab4'], // pastel teal — at MEV
    [1.5, '#5aa062'], // green — mid band
    [2.0, '#7e8f2a'], // olive — top of MAV
    [2.5, '#a86a05'], // ink-gold — pushing
    [3.0, '#c62d12'], // red — at MRV
    [3.5, '#a81f08'], // oxblood — past it
  ],
}

export function volumeColor(m: MuscleId, sets: number, ramp: HeatRamp = 'standard'): string {
  return rampColor(VOLUME_STOPS[ramp], bandPosition(m, sets))
}

/** Only muscles past the adaptive band glow: 0 at the top of MAV, 0.85 at the
 *  far end — pushing smoulders, overreaching burns. (Strain's glow is
 *  proportional for the same reason: a binary halo can only say yes/no.) */
export function volumeGlow(m: MuscleId, sets: number): number {
  const pos = bandPosition(m, sets)
  if (pos <= 2) return 0
  return Math.min(0.85, ((pos - 2) / (BAND_MAX - 2)) * 0.85)
}

/** Muscles at or beyond MRV (drives the deload hint). */
export function overreachingMuscles(vol: VolumeMap): MuscleId[] {
  return ALL_MUSCLE_IDS.filter((m) => volumeStatus(m, vol[m]) === 'over')
}

export type VolumeTrend = 'above' | 'usual' | 'below'

/** a muscle must be trained this much in an average week before "your usual"
 *  means anything — the same guard slackingGroups uses to avoid nagging about
 *  something you barely do */
const BASELINE_MIN = 2

/** How this window compares with the muscle's own four-week average, or null
 *  when there isn't enough history for the comparison to mean anything. */
export function volumeTrend(sets: number, baseline: number): VolumeTrend | null {
  if (baseline < BASELINE_MIN) return null
  if (sets > baseline * (4 / 3)) return 'above'
  if (sets < baseline * 0.75) return 'below'
  return 'usual'
}
