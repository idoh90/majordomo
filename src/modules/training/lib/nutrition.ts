import { isRun, type MuscleId, type Workout } from '../types'
import { addDays, localDayKey } from '../../../core/dates'

/*
 * Training-aware nutrition engine. Protein is held FLAT (total daily intake is
 * what matters, not timing — Morton 2018; Schoenfeld & Aragon 2018); calories
 * and carbohydrate FLEX with training load. Grounded in the nutrition build-spec:
 *
 *  - BMR: Mifflin–St Jeor (most validated; Frankenfield 2005).
 *  - Rest-day maintenance = BMR × a low activity factor (NO lifting baked in);
 *    per-session energy is added explicitly on top.
 *  - Protein ~1.9 g/kg/day, split ~0.4 g/kg across ≥4 meals.
 *  - Small lean-bulk surplus (~+250 kcal) concentrated on training days.
 *  - Carbs = a chronic weekly-load floor (3–4 g/kg) + an acute per-session bump
 *    (~8 g carb / ~12 kcal per weighted hard set), capped so marathon sessions
 *    don't overfeed. Fat fills the remainder, with a ~0.6 g/kg floor.
 *
 * The flex coefficients are engineering estimates (the app logs sessions, not
 * sets/RIR), so everything here is tunable via the Profile and should be
 * recalibrated against real weekly weight trend.
 */

export interface Profile {
  weightKg: number
  heightCm: number
  age: number
  sex: 'male' | 'female'
  /** g protein per kg bodyweight per day (flat) */
  proteinPerKg: number
  /** rest-day TDEE multiplier over BMR (no lifting) */
  restActivityFactor: number
  /** kcal added on each training day (small lean-bulk surplus) */
  surplusKcal: number
  mealsPerDay: number
  /** base carbohydrate floor in g/kg (flexes with weekly load) */
  carbFloorGkg: number
  /** kcal added per weighted hard set (session-average incl. rest/EPOC) */
  kcalPerSet: number
  /** grams carbohydrate added per weighted hard set */
  carbPerSet: number
  /** minimum fat in g/kg for hormonal health */
  fatFloorGkg: number
}

export const DEFAULT_PROFILE: Profile = {
  weightKg: 82,
  heightCm: 182,
  age: 30,
  sex: 'male',
  proteinPerKg: 1.9,
  restActivityFactor: 1.4,
  surplusKcal: 250,
  mealsPerDay: 5,
  carbFloorGkg: 3.0,
  kcalPerSet: 12,
  carbPerSet: 8,
  fatFloorGkg: 0.6,
}

// Session energy scales with muscle size: large compound movers cost more than
// small isolation work (spec §4.4 w_muscle).
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

// A focused session ≈ this many hard sets; scaled by effort. The app logs one
// session per workout (no set count), so this estimates total session sets.
const SESSION_SETS_BASE = 14
const CAP_SESSION_KCAL = 450

// Runs are priced in time on feet, not sets (see workoutWeightedSets).
const RUN_SETS_PER_H = 30
const RUN_DEFAULT_MIN = 30

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const setEffortScale = (effort: number) => 0.4 + 0.08 * effort // 0.4 → 1.2

export function bmr(p: Profile): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
}

export function restMaintenance(p: Profile): number {
  return bmr(p) * p.restActivityFactor
}

export function proteinGrams(p: Profile): number {
  return Math.round(p.proteinPerKg * p.weightKg)
}

export function proteinPerMeal(p: Profile): number {
  return Math.round(proteinGrams(p) / Math.max(1, p.mealsPerDay))
}

export function weeklyProtein(p: Profile): number {
  return proteinGrams(p) * 7
}

/**
 * Estimated weighted hard sets for one logged session — the app's energy unit.
 * A run has no sets, so its cost is converted from time on feet: RUN_SETS_PER_H
 * × hours × effort scale (~30 kcal/min at hard effort, then capped like any
 * session). Distance stands in for duration at a 6 min/km default when only
 * distance was logged; a run with neither still costs the default half hour.
 */
export function workoutWeightedSets(w: Workout): number {
  if (isRun(w)) {
    const minutes =
      w.run?.durationMin ?? (w.run?.distanceKm != null ? w.run.distanceKm * 6 : RUN_DEFAULT_MIN)
    return RUN_SETS_PER_H * (minutes / 60) * setEffortScale(w.effort)
  }
  // energy is driven by the primary movers; a session with no primary muscle
  // (only reachable via hand-edited imports) contributes no session load.
  if (w.primary.length === 0) return 0
  const total = SESSION_SETS_BASE * setEffortScale(w.effort)
  const avg = w.primary.reduce((s, m) => s + ENERGY_WEIGHT[m], 0) / w.primary.length
  return total * avg
}

/** Weighted hard sets across all sessions on a given local day. */
export function dayWeightedSets(workouts: Workout[], day: Date): number {
  const key = localDayKey(day)
  let sum = 0
  for (const w of workouts) if (localDayKey(w.performedAt) === key) sum += workoutWeightedSets(w)
  return sum
}

/** Rolling 7-day average weighted sets per day (chronic load). */
export function avg7WeightedSets(workouts: Workout[], now: Date): number {
  let total = 0
  for (let i = 0; i < 7; i++) total += dayWeightedSets(workouts, addDays(now, -i))
  return total / 7
}

export interface MacroTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
  /** kcal attributed to the session on this day (0 on rest days) */
  sessionKcal: number
  /** weighted hard sets driving today's flex */
  weightedSets: number
  isTrainingDay: boolean
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
  const weightedSets = dayWeightedSets(workouts, day)
  const s7 = avg7WeightedSets(workouts, chronicRef)
  const isTrainingDay = weightedSets > 0.01

  const sessionKcal = Math.min(CAP_SESSION_KCAL, weightedSets * p.kcalPerSet)
  const sessionCarb = weightedSets * p.carbPerSet

  // chronic carb floor: 8 weighted sets/day ≈ base; deload lower, high-volume higher
  const carbFloor = p.carbFloorGkg + 0.5 * clamp((s7 - 8) / 8, -1, 2)
  const carbBase = carbFloor * p.weightKg

  const calories = maintenance + (isTrainingDay ? p.surplusKcal : 0) + sessionKcal
  const protein = proteinGrams(p)
  const proteinKcal = protein * 4

  let carbs = carbBase + sessionCarb
  let fatKcal = calories - proteinKcal - carbs * 4
  let fat = fatKcal / 9

  // fat floor: if remainder drops fat below the hormonal floor, hold fat at the
  // floor and trim carbs to rebalance
  const fatFloor = p.fatFloorGkg * p.weightKg
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
    sessionKcal: Math.round(sessionKcal),
    weightedSets,
    isTrainingDay,
  }
}
