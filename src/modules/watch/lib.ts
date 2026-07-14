import { addDays, localDayKey, startOfWeek, type WeekStart } from '../../core/dates'
import { hoursOf, overlaps } from '../../core/events/lib'
import type { CalendarEvent } from '../../core/events/types'

/** the two shift shapes of the beachhead schedule; rotations are backlog */
export const SHIFT_PRESETS = {
  day: { startHour: 7, endHour: 20 },
  night: { startHour: 19, endHour: 32 }, // 19:00 → 08:00 the next day
} as const
export type ShiftKey = keyof typeof SHIFT_PRESETS

/** local wall-clock instant `hour` hours after midnight of `day` (may be >24) */
export function atHour(day: Date, hour: number): Date {
  const h = Math.floor(hour)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, (hour - h) * 60)
}

export function shiftsOf(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.kind === 'shift' && !e.allDay)
}

export function hasShiftOnDay(events: CalendarEvent[], day: Date): boolean {
  const key = localDayKey(day)
  return shiftsOf(events).some((e) => localDayKey(e.start) === key)
}

/** is [start,end) free of every timed event? */
export function rangeFree(events: CalendarEvent[], start: Date, end: Date): boolean {
  return !events.some(
    (e) => !e.allDay && overlaps(new Date(e.start), new Date(e.end), start, end),
  )
}

export interface WatchStats {
  /** hours already stood this calendar week */
  doneH: number
  /** total hours on the books this calendar week */
  expectedH: number
  /** the next shift anywhere ahead of now */
  next: CalendarEvent | null
  /** this calendar week's shifts, by start */
  weekShifts: CalendarEvent[]
}

export function watchStats(
  events: CalendarEvent[],
  now: number,
  weekStart?: WeekStart,
): WatchStats {
  const shifts = shiftsOf(events).sort((a, b) => a.start.localeCompare(b.start))
  const w0 = startOfWeek(new Date(now), weekStart)
  const w1 = addDays(w0, 7)
  const weekShifts = shifts.filter((e) => {
    const s = new Date(e.start)
    return s >= w0 && s < w1
  })
  const doneH = weekShifts
    .filter((e) => new Date(e.end).getTime() <= now)
    .reduce((t, e) => t + hoursOf(e), 0)
  const expectedH = weekShifts.reduce((t, e) => t + hoursOf(e), 0)
  const next = shifts.find((e) => new Date(e.start).getTime() > now) ?? null
  return { doneH, expectedH, next, weekShifts }
}

export function countdownLabel(next: CalendarEvent, now: number): string {
  const dh = (new Date(next.start).getTime() - now) / 3_600_000
  const h = Math.floor(dh)
  const m = Math.round((dh - h) * 60)
  return `in ${h} h ${String(m).padStart(2, '0')} m`
}
