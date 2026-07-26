import { isRun, type MuscleGroup, type MuscleId, type Workout } from '../types'
import { ALL_MUSCLE_IDS, MUSCLES, PICKER_GROUPS } from '../data/muscles'
import {
  addDays,
  localDayKey,
  startOfLocalDay,
  startOfWeek,
  weekKey,
  type WeekStart,
} from '../../../core/dates'
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
    if (isRun(w)) continue // runs are conditioning, not sessions against the goal
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
    // runs are conditioning, not training volume — the same line the weekly
    // count and the RP landmarks already draw. One long run otherwise puts
    // calves and quads on top of a chart that means "what you trained".
    if (isRun(w)) continue
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

/** Sessions this calendar week, against the weekly goal — runs never count. */
export function thisWeekCount(workouts: Workout[], now: Date, weekStart?: WeekStart): number {
  const wk = weekKey(now, weekStart)
  let n = 0
  for (const w of workouts) {
    if (isRun(w)) continue
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

const DAY_MS = 86_400_000
/** a week must be this far along before under-training means anything */
const SLACKING_MIN_DAY = 3
/** loads are summed floats, so a group EXACTLY on pace lands a few ulps under
 *  the bar — it must not be called slacking over dust */
const SLACKING_EPSILON = 1e-9

/**
 * Muscle groups you normally train but have under-trained this calendar week.
 * Baseline = average weekly volume over the 4 completed weeks before this one;
 * a group is "slacking" if this week sits below 50% of that baseline PRORATED
 * BY WEEK PROGRESS — half the usual volume is only owed once the week is out.
 * Against a flat 50% every trained group flunked on day one (0 < half of
 * anything), which turned a mid-week nudge into a Monday-morning wall; the
 * butler does not guilt. Nothing is emitted before day 3 at all. Ranked by
 * the largest shortfall relative to baseline.
 */
export function slackingGroups(workouts: Workout[], now: Date, weekStart?: WeekStart): SlackingGroup[] {
  const thisWk = weekKey(now, weekStart)
  const currentStart = startOfWeek(now, weekStart)
  const priorStart = addDays(currentStart, -28)

  // day 1 = the week-start day itself, so a full week reads 7/7 = the flat 50%.
  // Rounded, not floored: a DST week puts 23h or 25h between two local
  // midnights and would otherwise lose (or gain) a day.
  const dayOfWeek =
    1 + Math.round((startOfLocalDay(now).getTime() - currentStart.getTime()) / DAY_MS)
  if (dayOfWeek < SLACKING_MIN_DAY) return []
  const progress = Math.min(1, dayOfWeek / 7)

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
    const bar = baseline * 0.5 * progress * (1 - SLACKING_EPSILON)
    if (thisWeek < bar) out.push({ group, thisWeek, baseline })
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
