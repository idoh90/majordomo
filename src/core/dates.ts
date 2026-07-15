// All calendar bucketing (day keys, weeks, streaks) is done in LOCAL time.
// Never use toISOString().slice(0, 10) for bucketing — it shifts evening
// workouts to the next day for anyone east of UTC.

const pad2 = (n: number) => String(n).padStart(2, '0')

export function localDayKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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
