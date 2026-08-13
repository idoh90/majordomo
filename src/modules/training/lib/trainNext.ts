import type { MuscleGroup, Workout } from '../types'
import { ALL_MUSCLE_IDS, GROUP_LABELS, MUSCLES } from '../data/muscles'
import type { WeekStart } from '../../../core/dates'
import type { StrainMap } from './strain'
import { BASELINE_MIN, LANDMARKS, muscleBaselines, trailingVolume } from './volume'

/*
 * WHAT TO TRAIN NEXT — the recommendation the strain and volume engines were
 * always circling. The trigger is the literature's, not a habit tracker's:
 * training a muscle again sooner only helps insofar as it adds weekly volume,
 * and strength is largely back 48–72 h after an ordinary session. So a group
 * is offered when it is RECOVERED (its worst muscle has cooled past
 * READY_STRAIN) and BEHIND its trailing week (sets short of a target it has
 * itself established). Neither condition alone is a recommendation: fresh but
 * fed is simply done, and behind but fried needs rest first.
 */

/**
 * A group is offerable once its worst muscle has cooled past this. Against
 * the engine's own curves: a default primary session crosses 3.5 at ~63 h for
 * chest (inside the 48–72 h strength-recovery window) and ~83 h for
 * slow-clock quads — right for a hard leg day. Below 3.5 the acute phase is
 * long gone and what remains is DOMS tail, which is not a contraindication.
 */
export const READY_STRAIN = 3.5

export interface GroupWeek {
  group: MuscleGroup
  /** display name for prose ("Chest") */
  label: string
  /** trailing-7-day estimated hard sets across the group's muscles (lifts only) */
  sets: number
  /** Σ per-muscle min(MEV, own 4-week baseline) — never pushes past the
   *  user's own habit, never calls a MEV-fed muscle behind */
  target: number
  /** true when the target rests on the user's own history rather than the
   *  cold-start MEV fallback. Red-flag surfaces (the behind chips) demand it;
   *  the gentler aside offer does not. */
  backed: boolean
  /** the group's worst muscle right now — one fried muscle caps the session */
  maxStrain: number
}

/**
 * Every group's trailing week against its own target, in the volume model's
 * units. Muscles below BASELINE_MIN contribute no target — a group the user
 * has chosen never to train is never nagged — EXCEPT on a cold start (no
 * muscle anywhere has a baseline), where targets fall back to MEV so a fresh
 * estate still gets a real answer.
 */
export function groupWeeks(
  workouts: Workout[],
  /** null skips the strain column — for callers that only ask about volume */
  strains: StrainMap | null,
  now: Date,
  weekStart?: WeekStart,
): GroupWeek[] {
  const vol = trailingVolume(workouts, now)
  const baselines = muscleBaselines(workouts, now, weekStart)
  const coldStart = ALL_MUSCLE_IDS.every((m) => baselines[m] < BASELINE_MIN)
  const rows = new Map<MuscleGroup, GroupWeek>()
  for (const m of ALL_MUSCLE_IDS) {
    const group = MUSCLES[m].group
    let row = rows.get(group)
    if (!row) {
      row = { group, label: GROUP_LABELS[group], sets: 0, target: 0, backed: false, maxStrain: 0 }
      rows.set(group, row)
    }
    row.sets += vol[m]
    if (strains) row.maxStrain = Math.max(row.maxStrain, strains[m])
    const habitual = !coldStart && baselines[m] >= BASELINE_MIN
    row.backed ||= habitual
    row.target += coldStart
      ? LANDMARKS[m].mev
      : habitual
        ? Math.min(LANDMARKS[m].mev, baselines[m])
        : 0
  }
  return [...rows.values()]
}

/** the deficit worth speaking about — under half a set is rounding noise */
const MIN_DEFICIT = 0.5

/**
 * The groups worth offering today: recovered AND meaningfully behind, worst
 * shortfall first. Empty when nothing qualifies — the caller falls back to
 * softer prose (the freshest-group line), never to an invented duty.
 */
export function trainNext(
  workouts: Workout[],
  strains: StrainMap,
  now: Date,
  weekStart?: WeekStart,
  limit = 3,
): GroupWeek[] {
  return groupWeeks(workouts, strains, now, weekStart)
    .filter((g) => g.maxStrain < READY_STRAIN && g.target - g.sets > MIN_DEFICIT)
    .sort((a, b) => a.sets / a.target - b.sets / b.target)
    .slice(0, limit)
}
