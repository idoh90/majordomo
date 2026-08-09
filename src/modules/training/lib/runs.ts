import { isRun, type Workout } from '../types'
import { addDays, startOfWeek, weekKey, type WeekStart } from '../../../core/dates'

/**
 * A run's clock is STORED in minutes (`RunDetail.durationMin`) and may carry a
 * fraction — 24:35 is 24.5833…. Every read rounds to the whole second FIRST and
 * only then splits, because rounding the remainder alone prints 24:60.
 */
export const runTotalSeconds = (w: Workout): number =>
  w.run?.durationMin != null ? Math.round(w.run.durationMin * 60) : 0

/** the inverse, for the save path: whole seconds → the stored minutes */
export const secondsToMinutes = (sec: number): number => Math.round(sec) / 60

/** "44:00" · "1:12:30" — a run's clock is never printed as "44.5 min" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(rest).padStart(2, '0')}`
}

/** 1 decimal, but never a dangling ".0" — 8 km, 12.4 km */
export const formatKm = (km: number): string => km.toFixed(1).replace(/\.0$/, '')

/** seconds per km, or 0 when either side of the sum is missing */
export function runPaceSeconds(w: Workout): number {
  const sec = runTotalSeconds(w)
  const km = w.run?.distanceKm ?? 0
  return sec > 0 && km > 0 ? sec / km : 0
}

/** "8 km", "44:00", "8 km · 44:00", or '' when neither was recorded */
export function runLabel(w: Workout): string {
  const parts: string[] = []
  if (w.run?.distanceKm) parts.push(`${formatKm(w.run.distanceKm)} km`)
  const sec = runTotalSeconds(w)
  if (sec > 0) parts.push(formatClock(sec))
  return parts.join(' · ')
}

/** every run, newest first — the store's order is not relied on */
export const allRuns = (workouts: Workout[]): Workout[] =>
  workouts
    .filter(isRun)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))

/** runs in a calendar week: `weeksAgo` 0 = this one, 1 = the week before */
export function runsInWeek(
  runs: Workout[],
  now: Date,
  weekStart?: WeekStart,
  weeksAgo = 0,
): Workout[] {
  const target = weekKey(addDays(startOfWeek(now, weekStart), -7 * weeksAgo), weekStart)
  return runs.filter((w) => weekKey(new Date(w.performedAt), weekStart) === target)
}

export interface RunStats {
  count: number
  km: number
  seconds: number
  /**
   * Weighted average seconds per km, or 0 when nothing can be averaged. Only
   * runs that recorded BOTH sides feed it — a distance with no clock beside a
   * clock with no distance would otherwise invent a pace neither one holds.
   */
  paceSeconds: number
}

export function runStats(runs: Workout[]): RunStats {
  let km = 0
  let seconds = 0
  let pacedKm = 0
  let pacedSec = 0
  for (const w of runs) {
    const d = w.run?.distanceKm ?? 0
    const s = runTotalSeconds(w)
    km += d
    seconds += s
    if (d > 0 && s > 0) {
      pacedKm += d
      pacedSec += s
    }
  }
  return {
    count: runs.length,
    km,
    seconds,
    paceSeconds: pacedKm > 0 ? pacedSec / pacedKm : 0,
  }
}
