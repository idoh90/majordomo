// All calendar bucketing (day keys, weeks, streaks) is done in LOCAL time.
// Never use toISOString().slice(0, 10) for bucketing — it shifts evening
// workouts to the next day for anyone east of UTC.

const pad2 = (n: number) => String(n).padStart(2, '0')

export function localDayKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * A day key back to a Date — the inverse of `localDayKey`, and STRICT.
 *
 * It lives here beside its inverse, and it returns null rather than an Invalid
 * Date, because a day key is not always something this app wrote. Milestones
 * carry one, and a milestone can arrive from a crew: the payload is opaque
 * jsonb chosen by whoever pushed it. The loose version — `key.split('-').map(Number)`
 * straight into `new Date(y, m-1, d)` — turned any non-date string into an
 * Invalid Date, and the first `.toISOString()` downstream threw. That throw
 * happened inside the marker heal pass, which the Manor mounts on every boot,
 * so one pushed record stopped the app opening at all, on every reload, with
 * the bad record sitting in localStorage.
 *
 * Rolled-over keys are refused too: `2026-02-31` is not a day, and JS would
 * silently hand back the 3rd of March.
 */
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export function dayKeyToDate(key: string): Date | null {
  const m = typeof key === 'string' ? DAY_KEY.exec(key) : null
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

/** whether a string is a day key this app can read back */
export function isDayKey(key: unknown): key is string {
  return typeof key === 'string' && dayKeyToDate(key) !== null
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** local wall-clock instant `hour` hours after midnight of `day` (may be >24) */
export function atHour(day: Date, hour: number): Date {
  const h = Math.floor(hour)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, (hour - h) * 60)
}

// App-wide week-start (0 = Sunday, 1 = Monday). The shell store owns the user's
// choice and syncs it here via setWeekStartDefault so the many week-bucketing
// callers don't each have to thread the value through.
export type WeekStart = 0 | 1
let weekStartDefault: WeekStart = 1
export function setWeekStartDefault(ws: WeekStart): void {
  weekStartDefault = ws
}

/** First day of the week containing d, honoring the app's week-start. */
export function startOfWeek(d: Date, weekStart: WeekStart = weekStartDefault): Date {
  const since = (d.getDay() - weekStart + 7) % 7
  return addDays(startOfLocalDay(d), -since)
}

export function weekKey(d: Date, weekStart: WeekStart = weekStartDefault): string {
  return localDayKey(startOfWeek(d, weekStart))
}

export function hoursBetween(fromIso: string, toMs: number): number {
  return (toMs - new Date(fromIso).getTime()) / 3_600_000
}

export function relativeDayLabel(iso: string, now: Date): string {
  const dayKey = localDayKey(iso)
  if (dayKey === localDayKey(now)) return 'Today'
  if (dayKey === localDayKey(addDays(now, -1))) return 'Yesterday'
  const d = new Date(iso)
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * A day named the way the briefing speaks about it — 'Today', 'Tomorrow',
 * then the weekday for the week ahead, then a date. Written to sit in front
 * of a possessive: "Friday's day watch", "Today's block". Forward-looking
 * only; use relativeDayLabel for anything that can be in the past.
 */
export function dayNameLabel(iso: string | Date, now: Date): string {
  const dayKey = localDayKey(iso)
  if (dayKey === localDayKey(now)) return 'Today'
  if (dayKey === localDayKey(addDays(now, 1))) return 'Tomorrow'
  const d = iso instanceof Date ? iso : new Date(iso)
  const days = Math.round(
    (startOfLocalDay(d).getTime() - startOfLocalDay(now).getTime()) / 86_400_000,
  )
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Value for an <input type="datetime-local"> in the user's local time. */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string {
  // new Date("YYYY-MM-DDTHH:mm") parses as local time
  return new Date(value).toISOString()
}
