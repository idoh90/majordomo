import type { MuscleGroup, MuscleId, Workout } from '../types'
import { ALL_MUSCLE_IDS, MUSCLES, PICKER_GROUPS } from '../data/muscles'
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
    const b = byKey.get(weekKey(new Date(w.performedAt), weekStart))
    if (b) b.count++
  }
  return buckets
}

/** Total undecayed training volume per muscle over the last `days` days. */
export function topMuscles(
  workouts: Workout[],
  now: Date,
  days = 30,
  top = 5,
): { muscle: MuscleId; volume: number }[] {
  const cutoffMs = addDays(now, -days).getTime()
  const totals = new Map<MuscleId, number>()
  for (const w of workouts) {
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

export function thisWeekCount(workouts: Workout[], now: Date, weekStart?: WeekStart): number {
  const wk = weekKey(now, weekStart)
  let n = 0
  for (const w of workouts) if (weekKey(new Date(w.performedAt), weekStart) === wk) n++
  return n
}

const GROUP_OF = Object.fromEntries(
  ALL_MUSCLE_IDS.map((m) => [m, MUSCLES[m].group]),
) as Record<MuscleId, MuscleGroup>

function groupVolume(workouts: Workout[], predicate: (w: Workout) => boolean): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>()
  for (const w of workouts) {
    if (!predicate(w)) continue
    for (const m of ALL_MUSCLE_IDS) {
      const load = muscleLoad(w, m)
      if (load > 0) totals.set(GROUP_OF[m], (totals.get(GROUP_OF[m]) ?? 0) + load)
    }
  }
  return totals
}

export interface SlackingGroup {
  group: MuscleGroup
  thisWeek: number
  baseline: number
}

/**
 * Muscle groups you normally train but have under-trained this calendar week.
 * Baseline = average weekly volume over the 4 completed weeks before this one;
 * a group is "slacking" if this week is below 50% of that baseline. Ranked by
 * the largest shortfall relative to baseline.
 */
export function slackingGroups(workouts: Workout[], now: Date, weekStart?: WeekStart): SlackingGroup[] {
  const thisWk = weekKey(now, weekStart)
  const currentStart = startOfWeek(now, weekStart)
  const priorStart = addDays(currentStart, -28)

  const thisWeekVol = groupVolume(workouts, (w) => weekKey(new Date(w.performedAt), weekStart) === thisWk)
  const priorVol = groupVolume(workouts, (w) => {
    const t = new Date(w.performedAt)
    return t >= priorStart && t < currentStart
  })

  const out: SlackingGroup[] = []
  for (const { group } of PICKER_GROUPS) {
    const baseline = (priorVol.get(group) ?? 0) / 4
    if (baseline < 2) continue // ignore groups you rarely train — avoids nagging
    const thisWeek = thisWeekVol.get(group) ?? 0
    if (thisWeek < baseline * 0.5) out.push({ group, thisWeek, baseline })
  }
  return out.sort((a, b) => a.thisWeek / a.baseline - b.thisWeek / b.baseline)
}

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
