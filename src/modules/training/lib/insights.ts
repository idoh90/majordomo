import { isLift, isRun, isSport, type MuscleId, type Workout } from '../types'
import { ALL_MUSCLE_IDS } from '../data/muscles'
import { addDays, localDayKey, startOfWeek, weekKey, type WeekStart } from '../../../core/dates'
import { muscleLoad } from './strain'

export interface WeekBucket {
  key: string
  label: string
  count: number
  isCurrent: boolean
}

/** Workouts per week for the last `weeks` weeks, oldest first (honors week-start). */
export function weeklyCounts(
  workouts: Workout[],
  now: Date,
  weeks = 8,
  weekStart?: WeekStart,
): WeekBucket[] {
  const currentStart = startOfWeek(now, weekStart)
  const buckets: WeekBucket[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(currentStart, -7 * i)
    buckets.push({
      key: localDayKey(start),
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
      isCurrent: i === 0,
    })
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  for (const w of workouts) {
    if (!isLift(w)) continue // runs and sports are conditioning, not sessions against the goal
    const b = byKey.get(weekKey(new Date(w.performedAt), weekStart))
    if (b) b.count++
  }
  return buckets
}

/** Total undecayed LIFTING volume per muscle over the last `days` days — runs
 *  excluded, so the chart reads as what was trained, not what was covered. */
export function topMuscles(
  workouts: Workout[],
  now: Date,
  days = 30,
  top = 5,
): { muscle: MuscleId; volume: number }[] {
  const cutoffMs = addDays(now, -days).getTime()
  const totals = new Map<MuscleId, number>()
  for (const w of workouts) {
    // runs and sports are conditioning, not training volume — the same line
    // the weekly count and the RP landmarks already draw. One long run (or an
    // MMA week) otherwise tops a chart that means "what you trained".
    if (!isLift(w)) continue
    const t = new Date(w.performedAt).getTime()
    if (t < cutoffMs) continue
    for (const m of ALL_MUSCLE_IDS) {
      const load = muscleLoad(w, m)
      if (load > 0) totals.set(m, (totals.get(m) ?? 0) + load)
    }
  }
  return [...totals.entries()]
    .map(([muscle, volume]) => ({ muscle, volume }))
    .sort((a, b) => b.volume - a.volume || a.muscle.localeCompare(b.muscle))
    .slice(0, top)
}

/** Sessions this calendar week, against the weekly goal — conditioning never counts. */
export function thisWeekCount(workouts: Workout[], now: Date, weekStart?: WeekStart): number {
  const wk = weekKey(now, weekStart)
  let n = 0
  for (const w of workouts) {
    if (!isLift(w)) continue
    if (weekKey(new Date(w.performedAt), weekStart) === wk) n++
  }
  return n
}

/** Runs this calendar week (shown alongside the goal, not inside it). */
export function thisWeekRuns(workouts: Workout[], now: Date, weekStart?: WeekStart): number {
  const wk = weekKey(now, weekStart)
  let n = 0
  for (const w of workouts) {
    if (!isRun(w)) continue
    if (weekKey(new Date(w.performedAt), weekStart) === wk) n++
  }
  return n
}

/** Sport sessions this calendar week (the same standing as runs). */
export function thisWeekSports(workouts: Workout[], now: Date, weekStart?: WeekStart): number {
  const wk = weekKey(now, weekStart)
  let n = 0
  for (const w of workouts) {
    if (!isSport(w)) continue
    if (weekKey(new Date(w.performedAt), weekStart) === wk) n++
  }
  return n
}

// "Slacking groups" used to live here: current-calendar-week muscleLoad
// (runs and sports included) against a 4-week baseline, prorated by week
// progress, mute before day 3. It measured a different unit over a different
// window than the body map's volume mode, so the card and the map could
// disagree. lib/trainNext.ts `groupWeeks` replaced it — same trailing window,
// same estimated-set units as the map, and a trailing window has no
// Monday-morning wall to prorate around.

/**
 * Consecutive local days with at least one workout, counting back from today.
 * If today has no workout yet, the streak survives and counts from yesterday.
 */
export function streakDays(workouts: Workout[], now: Date): number {
  const days = new Set(workouts.map((w) => localDayKey(w.performedAt)))
  let cursor = new Date(now)
  if (!days.has(localDayKey(cursor))) cursor = addDays(cursor, -1)
  let streak = 0
  while (days.has(localDayKey(cursor))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}
