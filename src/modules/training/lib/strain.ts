import type { MuscleId, RepStyle, Workout } from '../types'
import { ALL_MUSCLE_IDS } from '../data/muscles'
import { hoursBetween } from '../../../core/dates'

// Tunable model constants — strain is always computed from raw workouts,
// never persisted, so these can change without a data migration.
export const VISUAL_FLOOR = 0.3
export const SECONDARY_WEIGHT = 0.5 // fractional-set convention for synergists (meta-analyses)
export const MAX_STRAIN = 10
export const CUTOFF_H = 156 // ~6.5 days — DOMS resolves by 5–7 days, so drop older contributions
const TAPER_H = 40 // smoothly fade the envelope to 0 over the final hours (no abrupt pop)

// Felt-strain is demoted to a ±15% corrector on top of effort: subjective
// soreness is a weak *growth* proxy (DOMS ≠ hypertrophy), but it still informs
// a *strain* display, so it isn't dropped entirely.
const FEEL_MIN = 0.85
const FEEL_SPAN = 0.3

/*
 * Two-phase recovery model, grounded in the training-science literature:
 *
 *  1. ACUTE neuromuscular fatigue — highest immediately after training
 *     (CNS/pump/peripheral fatigue), fades within ~1–2 days. Heavy low-rep
 *     work is acute-dominant: a big immediate hit that recovers relatively
 *     fast (fast-twitch fibers recover well). [failure-recovery studies:
 *     CMJ back to baseline ~6 h non-failure vs ~48 h to failure]
 *
 *  2. DELAYED onset muscle soreness (DOMS) — ~0 right after training, rises to
 *     a peak around 24–48 h, then resolves by ~5–7 days. Light high-rep /
 *     metabolic work is DOMS-dominant: a smaller immediate hit but sorer the
 *     next day. [DOMS onset 6–12 h, peak 24–72 h (commonly ~48 h)]
 *
 * So a muscle can read HOTTER tomorrow than tonight — especially after
 * high-rep or near-failure work. Effort is the primary stimulus driver (proxy
 * for proximity-to-failure, which recruits the high-threshold motor units per
 * Henneman's size principle); felt-strain is a small corrector. Per-muscle
 * recovery clocks follow MPS/fatigue time-course data (MacDougall 1995 ~36 h
 * baseline in trained men; large compound patterns 48–72 h+, small daily-use
 * muscles 24–30 h). Total contribution = load × muscleFactor-timed(acute + delayed).
 */

// Acute phase: stretched-exponential decay from 1.0 at t=0. Shape kept near 1.1–1.3
// (a sharper k=1.6 decays too abruptly late).
const ACUTE_TAU_H = 10
const ACUTE_SHAPE = 1.25

// Delayed (DOMS) phase: product-of-exponentials bump, 0 at t=0, single peak
// ~24–30 h (before muscle-factor scaling) to match the DOMS time course.
const DOMS_RISE_H = 22
const DOMS_FALL_H = 44

/**
 * Per-style split of the stimulus into acute vs delayed amplitude (as a
 * fraction of load). Heavy = acute-dominant, light = DOMS-dominant, and the
 * immediate (t=0) reading equals load × acute so the map still lights up on
 * save. `nearFailureDoms` adds to the delayed amplitude when the session was
 * taken close to failure (training to failure prolongs and deepens recovery).
 */
export const REP_STYLES: Record<
  RepStyle,
  { title: string; caption: string; acute: number; doms: number }
> = {
  light: { title: 'High Reps', caption: 'lighter weight', acute: 0.6, doms: 0.9 },
  mixed: { title: 'Mixed', caption: 'bit of both', acute: 0.85, doms: 0.66 },
  heavy: { title: 'Heavy', caption: 'lower reps', acute: 1.05, doms: 0.48 },
}

/**
 * Per-muscle recovery time-scale multiplier — the whole recovery timeline is
 * stretched (large muscles) or compressed (small ones). Ordering and relative
 * spacing come from the fatigue/MPS time-constant table (τ ≈ 24 h forearms →
 * ~60 h quads): large fast-twitch compound movers (quads, hams, lats, glutes)
 * recover slowest; small, daily-use muscles (forearms, calves, rear delts)
 * fastest. Spread is compressed vs the raw ~2.5× τ ratio so the heat-map doesn't
 * read "always on fire" for legs — strain magnitude ≠ MPS duration.
 */
const MUSCLE_RECOVERY: Record<MuscleId, number> = {
  quads: 1.42, // τ≈60 h — large, fast-twitch, high CNS cost
  hamstrings: 1.38, // τ≈56 h
  lats: 1.34, // τ≈52 h
  glutes: 1.3, // τ≈50 h
  'lower-back': 1.18, // erectors, large but endurance-biased
  chest: 1.08, // τ≈38 h
  traps: 1.0, // baseline (τ≈34 h)
  'front-delts': 0.98,
  abs: 0.92,
  obliques: 0.92,
  'side-delts': 0.88, // τ≈28 h
  biceps: 0.88, // τ≈28 h
  triceps: 0.88, // τ≈28 h
  'rear-delts': 0.84, // τ≈26 h
  calves: 0.84, // τ≈26 h — daily use
  forearms: 0.8, // τ≈24 h — daily use, recovers fastest
}

/**
 * A muscle's recovery clock, with the estate's own pull on it.
 *
 * `scale` is THE NIGHT's recovery effect (core/sleep) — 1 when sleep has
 * nothing to say, above 1 when the last week ran short. It multiplies the
 * whole timeline rather than the magnitude, which is the honest shape of the
 * claim: sleeping badly does not make a session hit harder, it makes the same
 * session take longer to leave you.
 *
 * Every public entry point below takes it and defaults it to 1. The default is
 * for the pure-math probes (window.__engine, the recovery scan's inner loop) —
 * a SURFACE that leaves it out is a surface reading a different body from the
 * one next to it, which is the bug this file has had to be commented against
 * before. Read it from useRecoveryScale() and pass it.
 */
export function muscleClock(m: MuscleId, scale = 1): number {
  return MUSCLE_RECOVERY[m] * scale
}

export const repStyleOf = (w: Pick<Workout, 'repStyle'>): RepStyle => w.repStyle ?? 'mixed'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/**
 * Raw stimulus magnitude of a workout, ~0–11 (before any recovery decay).
 * Effort dominates (proximity-to-failure / motor-unit recruitment); felt-strain
 * only nudges it ±15%.
 */
export function workoutLoad(w: Pick<Workout, 'effort' | 'strainFeel'>): number {
  return w.effort * (FEEL_MIN + FEEL_SPAN * (w.strainFeel / 10))
}

/**
 * Proximity to failure, 0–1, from effort alone (felt-strain is soreness, not
 * effort). Ramps in past effort 5 and steepens toward failure — deep fatigue /
 * high-threshold recruitment happens in the last reps before failure.
 */
function nearFailure(w: Pick<Workout, 'effort'>): number {
  return clamp01((w.effort / 10 - 0.5) / 0.5)
}

const acutePhase = (tHours: number, tau: number) =>
  Math.exp(-Math.pow(Math.max(0, tHours) / tau, ACUTE_SHAPE))

// Normalize the DOMS bump so its own peak equals 1.
function domsPeakValue(rise: number, fall: number): number {
  const x = rise / (rise + fall) // = e^{-tPeak/rise} at the maximum
  return (1 - x) * Math.pow(x, rise / fall)
}
const domsPhase = (tHours: number, rise: number, fall: number) => {
  if (tHours <= 0) return 0
  const raw = (1 - Math.exp(-tHours / rise)) * Math.exp(-tHours / fall)
  return raw / domsPeakValue(rise, fall)
}

/**
 * Combined recovery envelope of one workout at `tHours` after it, per unit
 * load, for a given rep style and muscle. Acute + delayed, both time-scaled by
 * the muscle's recovery factor.
 */
export function recoveryEnvelope(
  tHours: number,
  style: RepStyle,
  muscleFactor: number,
  nf = 0,
): number {
  const end = CUTOFF_H * muscleFactor
  if (tHours >= end) return 0
  const s = REP_STYLES[style]
  const acute = s.acute * acutePhase(tHours, ACUTE_TAU_H * muscleFactor)
  const domsAmp = s.doms * (1 + 0.25 * nf)
  const delayed =
    domsAmp *
    domsPhase(tHours, DOMS_RISE_H * muscleFactor, DOMS_FALL_H * muscleFactor * (1 + 0.15 * nf))
  let env = acute + delayed
  // smoothstep taper over the final TAPER_H so residual soreness eases to 0
  const taperStart = end - TAPER_H * muscleFactor
  if (tHours > taperStart) {
    const x = (tHours - taperStart) / (TAPER_H * muscleFactor) // 0→1
    env *= 1 - x * x * (3 - 2 * x)
  }
  return env
}

export function muscleLoad(w: Workout, m: MuscleId): number {
  if (w.primary.includes(m)) return workoutLoad(w)
  if (w.secondary.includes(m)) return workoutLoad(w) * SECONDARY_WEIGHT
  return 0
}

/** Strain this single workout currently contributes to muscle `m`. */
export function workoutContribution(
  w: Workout,
  m: MuscleId,
  nowMs: number,
  scale = 1,
): number {
  const load = muscleLoad(w, m)
  if (load === 0) return 0
  const dt = hoursBetween(w.performedAt, nowMs)
  if (dt < -1) return 0 // future-dated
  return load * recoveryEnvelope(Math.max(0, dt), repStyleOf(w), muscleClock(m, scale), nearFailure(w))
}

/**
 * How "active" a workout is right now, 0–1, relative to the strongest point on
 * its own recovery curve — used for the detail sheet ("this workout is at 80 %
 * of its peak impact"). Independent of muscle; uses the primary recovery scale.
 */
export function workoutActivity(w: Workout, nowMs: number, scale = 1): number {
  const factor = w.primary.length ? muscleClock(w.primary[0], scale) : scale
  const style = repStyleOf(w)
  const nf = nearFailure(w)
  const dt = Math.max(0, hoursBetween(w.performedAt, nowMs))
  const nowEnv = recoveryEnvelope(dt, style, factor, nf)
  // peak of this workout's envelope (sample coarsely, envelope is smooth)
  let peak = 0
  for (let t = 0; t <= CUTOFF_H * factor; t += 2) {
    const e = recoveryEnvelope(t, style, factor, nf)
    if (e > peak) peak = e
  }
  return peak === 0 ? 0 : clamp01(nowEnv / peak)
}

/** Which recovery phase a workout is in right now (for detail-sheet wording). */
export function recoveryPhase(
  w: Workout,
  nowMs: number,
  scale = 1,
): 'fresh' | 'peaking' | 'easing' | 'recovered' {
  const factor = w.primary.length ? muscleClock(w.primary[0], scale) : scale
  const dt = Math.max(0, hoursBetween(w.performedAt, nowMs))
  if (dt >= CUTOFF_H * factor) return 'recovered'
  const style = repStyleOf(w)
  const nf = nearFailure(w)
  const here = recoveryEnvelope(dt, style, factor, nf)
  if (here < 0.12) return 'recovered'
  const ahead = recoveryEnvelope(dt + 6, style, factor, nf)
  if (dt < 6) return 'fresh'
  return ahead > here ? 'peaking' : 'easing'
}

export type StrainMap = Record<MuscleId, number>

/**
 * The whole body's strain at an instant. `scale` slows or quickens every
 * muscle's clock together — see muscleClock. Read it from
 * core/sleep's useRecoveryScale() at every surface.
 */
export function computeStrains(workouts: Workout[], nowMs: number, scale = 1): StrainMap {
  const strains = Object.fromEntries(ALL_MUSCLE_IDS.map((m) => [m, 0])) as StrainMap
  for (const w of workouts) {
    const dt = hoursBetween(w.performedAt, nowMs)
    if (dt < -1) continue
    const t = Math.max(0, dt)
    const style = repStyleOf(w)
    const nf = nearFailure(w)
    const load = workoutLoad(w)
    for (const m of w.primary) {
      const env = recoveryEnvelope(t, style, muscleClock(m, scale), nf)
      if (env > 0) strains[m] = Math.min(MAX_STRAIN, strains[m] + load * env)
    }
    for (const m of w.secondary) {
      const env = recoveryEnvelope(t, style, muscleClock(m, scale), nf)
      if (env > 0) strains[m] = Math.min(MAX_STRAIN, strains[m] + load * SECONDARY_WEIGHT * env)
    }
  }
  return strains
}

export type ReadinessBand = 'fresh' | 'ready' | 'worn' | 'spent'

export interface Readiness {
  /** 0–100, higher is fresher */
  score: number
  band: ReadinessBand
  /** the muscle currently costing the most readiness, if anything is warm */
  limiter: MuscleId | null
}

/**
 * One number for "how much training is in me today, sir".
 *
 * Dominated by the single hottest muscle rather than the average, because
 * that is what actually caps the next session — sixteen fresh muscles and one
 * fried one is not a fresh body. The whole-body term is kept as a smaller
 * weight so a broadly-worked week still reads lower than a single hard
 * isolation day. Endpoints are exact: nothing trained is 100, everything at
 * MAX_STRAIN is 0. The weights are a heuristic in the app's own units, not a
 * physiological measure — tune them the way the strain constants are tuned.
 */
export function readiness(strains: StrainMap): Readiness {
  let max = 0
  let limiter: MuscleId | null = null
  let sum = 0
  for (const m of ALL_MUSCLE_IDS) {
    const s = strains[m] ?? 0
    sum += s
    if (s > max) {
      max = s
      limiter = m
    }
  }
  const mean = sum / ALL_MUSCLE_IDS.length
  const load = Math.min(1, Math.max(0, (0.6 * max + 0.4 * mean) / MAX_STRAIN))
  const score = Math.round(100 * (1 - load))
  const band: ReadinessBand =
    score >= 75 ? 'fresh' : score >= 55 ? 'ready' : score >= 35 ? 'worn' : 'spent'
  return { score, band, limiter: max > 0 ? limiter : null }
}

/** Most recent workout that involved the muscle, or undefined. */
export function lastTrained(workouts: Workout[], m: MuscleId): Workout | undefined {
  let latest: Workout | undefined
  for (const w of workouts) {
    if (!w.primary.includes(m) && !w.secondary.includes(m)) continue
    if (!latest || w.performedAt > latest.performedAt) latest = w
  }
  return latest
}
