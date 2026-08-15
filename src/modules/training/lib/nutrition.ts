import { isRun, isSport, type MuscleId, type Workout } from '../types'
import { addDays, localDayKey } from '../../../core/dates'
import type { NutritionGoal } from '../../../core/voice/types'
import { SPORT_MAP } from '../data/sports'
import { SETS_PER_HOUR } from './volume'

/*
 * Training-aware nutrition engine. The full model, its equations and the
 * evidence behind every coefficient live in `majordomo-nutrition-spec.md`;
 * this header states only what a reader of the code needs in front of them.
 *
 * THREE CURRENCIES, deliberately not one:
 *
 *  - ENERGY (kcal) — `workoutKcal`, priced per session in the way that session
 *    is actually measured: a run by its distance, a sport by its metabolic
 *    cost, a lift by its hard sets. This drives calories.
 *  - LOAD (weighted set-equivalents) — `workoutWeightedSets`, the app's own
 *    unit of how much work a session was. This drives the chronic carbohydrate
 *    floor, where a run genuinely is worth "about this many sets" of glycogen
 *    demand even though it has no sets.
 *  - PROTEIN (g/kg) — a ladder, not a flex: the base rate, raised while
 *    cutting, nudged on days that were trained.
 *
 * The shape of the day: rest maintenance (Mifflin–St Jeor × activity factor,
 * no training baked in) + the sessions actually logged + the goal's
 * adjustment. Protein comes off the ladder, carbohydrate off a chronic floor
 * plus an acute per-session bump, and fat takes the remainder above a
 * hormonal floor — trimming carbohydrate when the remainder would fall short.
 *
 * Everything here is recomputed from raw workouts, never persisted, so the
 * coefficients tune freely. They are engineering estimates over an app that
 * logs sessions rather than food: recalibrate `Profile` against real weekly
 * weight trend, which is the only measurement that settles the argument.
 */

export interface Profile {
  weightKg: number
  heightCm: number
  age: number
  sex: 'male' | 'female'
  /** which way the food is pointed — see the goal adjustment in dailyTargets */
  goal: NutritionGoal
  /** g protein per kg bodyweight per day, before the cut/training-day ladder */
  proteinPerKg: number
  /** rest-day TDEE multiplier over BMR (no lifting) */
  restActivityFactor: number
  /** kcal added on each TRAINING day while bulking (small lean-bulk surplus) */
  surplusKcal: number
  /** kcal removed EVERY day while cutting — training days still eat more,
   *  because the session's own energy is added before this comes off */
  deficitKcal: number
  mealsPerDay: number
  /** base carbohydrate floor in g/kg (flexes with weekly load) */
  carbFloorGkg: number
  /** kcal per weighted hard set of lifting (session-average incl. rest/EPOC) */
  kcalPerSet: number
  /** grams carbohydrate added per weighted hard set */
  carbPerSet: number
  /** minimum fat in g/kg for hormonal health */
  fatFloorGkg: number
  /** seconds per km of an easy conversational run — anchors the run sheet's
      zones and its effort prefill (lib/pace.ts), and prices a run that
      recorded a duration but no distance */
  easyPaceSec: number
}

export const DEFAULT_PROFILE: Profile = {
  weightKg: 82,
  heightCm: 182,
  age: 30,
  sex: 'male',
  goal: 'bulk',
  proteinPerKg: 1.9,
  restActivityFactor: 1.4,
  surplusKcal: 250,
  deficitKcal: 400,
  mealsPerDay: 5,
  carbFloorGkg: 3.0,
  // ~20 kcal per weighted hard set: a 60-minute hypertrophy session nets
  // roughly 200–300 kcal including its rest periods and EPOC, over the 11–14
  // weighted sets such a session scores here
  kcalPerSet: 20,
  carbPerSet: 8,
  fatFloorGkg: 0.6,
  easyPaceSec: 360,
}

// Session energy scales with muscle size: large compound movers cost more than
// small isolation work (see the spec's w_muscle table).
const ENERGY_WEIGHT: Record<MuscleId, number> = {
  quads: 1.3,
  hamstrings: 1.3,
  glutes: 1.3,
  lats: 1.2,
  'lower-back': 1.1,
  traps: 1.0,
  chest: 1.0,
  'front-delts': 0.8,
  'side-delts': 0.8,
  'rear-delts': 0.8,
  abs: 0.7,
  obliques: 0.7,
  biceps: 0.7,
  triceps: 0.7,
  forearms: 0.7,
  calves: 0.7,
}

// A focused session ≈ this many hard sets; scaled by effort. Used only when
// neither a set count nor a duration was logged.
const SESSION_SETS_BASE = 14

/** net cost of level running, per kg per km — very nearly independent of
 *  speed, which is why distance alone prices a run honestly */
const RUN_KCAL_PER_KG_KM = 0.95
// Runs are priced in time on feet for the LOAD currency (see the header).
const RUN_SETS_PER_H = 30
const RUN_DEFAULT_MIN = 30
/** the easy pace a nonsense profile falls back to, matching DEFAULT_PROFILE */
const FALLBACK_EASY_PACE = 360

/** a sport logs no duration, so its energy is priced as one MET-hour */
const SPORT_DEFAULT_H = 1
/** an unrecognised sport (only reachable via a hand-edited import) is priced
 *  as a middling one rather than as nothing */
const SPORT_FALLBACK_MET = 8

/*
 * Per-workout energy ceilings. These are TYPO GUARDS, not price controls: a
 * mistyped 700-minute session must not invent four thousand kcal. The old
 * engine capped the whole DAY at 450 kcal, which is a different thing
 * entirely — it flattened two-a-days into one session and priced a half
 * marathon like an ordinary hour in the gym. A measured session is allowed to
 * be large, because it was measured.
 */
const CAP_LIFT_MEASURED = 900
const CAP_LIFT_ESTIMATED = 500

/** share of a conditioning session's energy that comes out of glycogen and
 *  wants replacing as carbohydrate */
const GLYCOGEN_FRACTION = 0.6

/** cutting raises protein to protect lean mass under a deficit (Helms 2014) */
const CUT_PROTEIN_GKG = 0.5
/** a trained day sits at the top of the evidence range rather than the middle */
const TRAINING_DAY_PROTEIN_GKG = 0.1

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const setEffortScale = (effort: number) => 0.4 + 0.08 * effort // 0.4 → 1.2

/** everything either energy function needs — narrow so the add sheet can price
 *  a draft that is not yet a Workout (the sessionBudget precedent) */
export type SessionShape = Pick<
  Workout,
  'method' | 'run' | 'sport' | 'primary' | 'secondary' | 'effort' | 'setsTotal' | 'durationMin'
>

export function bmr(p: Profile): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
}

export function restMaintenance(p: Profile): number {
  return bmr(p) * p.restActivityFactor
}

/** the day's protein rate: base, raised while cutting, nudged when trained */
export function proteinPerKgFor(p: Profile, isTrainingDay: boolean): number {
  return (
    p.proteinPerKg +
    (p.goal === 'cut' ? CUT_PROTEIN_GKG : 0) +
    (isTrainingDay ? TRAINING_DAY_PROTEIN_GKG : 0)
  )
}

/** the base rate in grams — the rung the ladder starts from */
export function proteinGrams(p: Profile): number {
  return Math.round(p.proteinPerKg * p.weightKg)
}

/** the runner's easy pace as km/h, defended against a hand-edited profile */
const easyKmH = (p: Profile) =>
  3600 / (p.easyPaceSec > 0 ? p.easyPaceSec : FALLBACK_EASY_PACE)

/**
 * How far a run went when it recorded a duration but no distance. The add
 * sheet earns a run's effort from its pace and length (lib/pace.ts
 * `runEffort` = 4·i³·(min/45)^0.6, i = easy÷pace); this inverts that same
 * model, so a run priced from effort agrees with the sheet that set it.
 */
function runKmFromEffort(p: Profile, minutes: number, effort: number): number {
  const shape = Math.pow(minutes / 45, 0.6)
  const intensity = shape > 0 ? clamp(Math.cbrt(effort / (4 * shape)), 0.6, 1.5) : 1
  return easyKmH(p) * intensity * (minutes / 60)
}

/**
 * Net kcal of one session — energy spent ABOVE resting, which is what the day
 * needs feeding back. Each modality is priced the way it was measured:
 *
 *  - a run by its distance (~0.95 kcal/kg/km, near enough speed-independent);
 *    from its duration by inverting the sheet's own effort model when only the
 *    clock was recorded; and from a default half hour at easy pace when
 *    neither side was.
 *  - a sport by its metabolic cost — one MET-hour scaled by the effort given,
 *    less the resting hour it replaces.
 *  - a lift by its weighted hard sets, capped per session as a typo guard.
 */
export function workoutKcal(w: SessionShape, p: Profile): number {
  if (isRun(w)) {
    const logged = w.run?.durationMin
    const km =
      w.run?.distanceKm != null && w.run.distanceKm > 0
        ? w.run.distanceKm
        : logged != null && logged > 0
          ? runKmFromEffort(p, logged, w.effort)
          : easyKmH(p) * (RUN_DEFAULT_MIN / 60)
    return RUN_KCAL_PER_KG_KM * p.weightKg * km
  }

  if (isSport(w)) {
    const kind = w.sport?.kind
    const met = (kind && SPORT_MAP[kind]?.met) || SPORT_FALLBACK_MET
    // effort moves the session around its own MET, ±25% at the extremes
    const effortAdj = 0.75 + 0.05 * w.effort
    return Math.max(0, (met * effortAdj - 1) * p.weightKg * SPORT_DEFAULT_H)
  }

  const measured = w.setsTotal != null || w.durationMin != null
  const cap = measured ? CAP_LIFT_MEASURED : CAP_LIFT_ESTIMATED
  return Math.min(cap, workoutWeightedSets(w) * p.kcalPerSet)
}

/**
 * Estimated weighted hard sets for one logged session — the app's LOAD unit,
 * and the one the chronic carbohydrate floor reads. A run has no sets, so its
 * load is converted from time on feet; distance stands in for duration at
 * 6 min/km when only distance was logged, and a run with neither still carries
 * the default half hour.
 */
export function workoutWeightedSets(w: SessionShape): number {
  if (isRun(w)) {
    const minutes =
      w.run?.durationMin ?? (w.run?.distanceKm != null ? w.run.distanceKm * 6 : RUN_DEFAULT_MIN)
    return RUN_SETS_PER_H * (minutes / 60) * setEffortScale(w.effort)
  }
  // energy is driven by the primary movers; a session with no primary muscle
  // (only reachable via hand-edited imports) contributes no session load.
  if (w.primary.length === 0) return 0
  // a logged set count is a measurement and stands as-is; estimates (from
  // duration, else the flat base) still scale with effort
  const total =
    w.setsTotal ??
    (w.durationMin != null ? (w.durationMin / 60) * SETS_PER_HOUR : SESSION_SETS_BASE) *
      setEffortScale(w.effort)
  const avg = w.primary.reduce((s, m) => s + ENERGY_WEIGHT[m], 0) / w.primary.length
  return total * avg
}

/** the sessions logged on a given local day */
function workoutsOn(workouts: Workout[], day: Date): Workout[] {
  const key = localDayKey(day)
  return workouts.filter((w) => localDayKey(w.performedAt) === key)
}

/** Weighted hard sets across all sessions on a given local day. */
export function dayWeightedSets(workouts: Workout[], day: Date): number {
  let sum = 0
  for (const w of workoutsOn(workouts, day)) sum += workoutWeightedSets(w)
  return sum
}

/** Rolling 7-day average weighted sets per day (chronic load). */
export function avg7WeightedSets(workouts: Workout[], now: Date): number {
  let total = 0
  for (let i = 0; i < 7; i++) total += dayWeightedSets(workouts, addDays(now, -i))
  return total / 7
}

/** Net kcal of everything logged on a given local day. */
export function dayExerciseKcal(workouts: Workout[], day: Date, p: Profile): number {
  let sum = 0
  for (const w of workoutsOn(workouts, day)) sum += workoutKcal(w, p)
  return sum
}

export interface MacroTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
  /** net kcal of the day's logged sessions (0 on rest days) */
  exerciseKcal: number
  /** weighted hard sets driving today's flex */
  weightedSets: number
  isTrainingDay: boolean
  /** the rung of the protein ladder this day landed on */
  proteinPerKgEffective: number
  goal: NutritionGoal
}

/**
 * Full macro targets for `day`, driven by that day's logged sessions (acute)
 * and the rolling 7-day load (chronic carb floor). Rounded for display.
 */
export function dailyTargets(
  p: Profile,
  workouts: Workout[],
  day: Date,
  chronicRef: Date = day,
): MacroTargets {
  const maintenance = restMaintenance(p)
  const today = workoutsOn(workouts, day)

  // one pass: each session's energy is wanted twice (calories, and the carb
  // bump conditioning work earns), so it is priced once and kept
  let exerciseKcal = 0
  let weightedSets = 0
  let sessionCarb = 0
  for (const w of today) {
    const kcal = workoutKcal(w, p)
    const sets = workoutWeightedSets(w)
    exerciseKcal += kcal
    weightedSets += sets
    // lifting earns carbohydrate by the set; conditioning earns it as the
    // glycogen share of the energy it actually spent
    sessionCarb += isRun(w) || isSport(w) ? (GLYCOGEN_FRACTION * kcal) / 4 : sets * p.carbPerSet
  }

  const s7 = avg7WeightedSets(workouts, chronicRef)
  const isTrainingDay = weightedSets > 0.01

  // chronic carb floor: 8 weighted sets/day ≈ base; deload lower, high-volume higher
  const carbFloor = p.carbFloorGkg + 0.5 * clamp((s7 - 8) / 8, -1, 2)
  const carbBase = carbFloor * p.weightKg

  // the goal's adjustment. A bulk's surplus lands on training days only; a
  // cut's deficit comes off EVERY day, and lands on top of the session's own
  // energy — so a trained day still eats more than a rest day, and the
  // calorie cycling falls out of the arithmetic instead of being a setting.
  const goalKcal =
    p.goal === 'bulk' ? (isTrainingDay ? p.surplusKcal : 0) : p.goal === 'cut' ? -p.deficitKcal : 0

  const proteinPerKgEffective = proteinPerKgFor(p, isTrainingDay)
  const protein = Math.round(proteinPerKgEffective * p.weightKg)
  const proteinKcal = protein * 4
  const fatFloor = p.fatFloorGkg * p.weightKg

  // A deficit deep enough to fall under the protein and fat the day will
  // print anyway is not a target, it is two numbers contradicting each other.
  // The floor keeps the headline consistent with the plate under it — and
  // keeps calories above zero, which the brief's prose gates on.
  const calories = Math.max(
    maintenance + exerciseKcal + goalKcal,
    proteinKcal + fatFloor * 9,
  )

  let carbs = carbBase + sessionCarb
  let fatKcal = calories - proteinKcal - carbs * 4
  let fat = fatKcal / 9

  // fat floor: if remainder drops fat below the hormonal floor, hold fat at the
  // floor and trim carbs to rebalance
  if (fat < fatFloor) {
    fat = fatFloor
    fatKcal = fat * 9
    carbs = Math.max(0, (calories - proteinKcal - fatKcal) / 4)
  }

  return {
    calories: Math.round(calories),
    protein,
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    exerciseKcal: Math.round(exerciseKcal),
    weightedSets,
    isTrainingDay,
    proteinPerKgEffective,
    goal: p.goal,
  }
}

export interface WeekOutlook {
  /** mean daily calories over the trailing seven days */
  avgCalories: number
  /** mean daily training energy over the same window */
  avgExerciseKcal: number
  /** how many of those seven days were trained */
  trainingDays: number
}

/**
 * What the last seven days actually asked for. Seven `dailyTargets` calls, so
 * it belongs to the card that shows it — never to the briefing, which
 * recomputes on every minute tick.
 */
export function weekOutlook(p: Profile, workouts: Workout[], now: Date): WeekOutlook {
  let calories = 0
  let exercise = 0
  let trainingDays = 0
  for (let i = 0; i < 7; i++) {
    const t = dailyTargets(p, workouts, addDays(now, -i))
    calories += t.calories
    exercise += t.exerciseKcal
    if (t.isTrainingDay) trainingDays++
  }
  return {
    avgCalories: Math.round(calories / 7),
    avgExerciseKcal: Math.round(exercise / 7),
    trainingDays,
  }
}
