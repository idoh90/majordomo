import { addDays, atHour, localDayKey, startOfWeek, type WeekStart } from '../../core/dates'
import { hoursOf, rangeFree } from '../../core/events/lib'
import type { CalendarEvent } from '../../core/events/types'

// atHour / rangeFree moved to core when the Study became their second
// consumer (extract-on-contact); re-exported so existing imports hold.
export { atHour, rangeFree }

/** the two shift shapes of the beachhead schedule; rotations are backlog */
export const SHIFT_PRESETS = {
  day: { startHour: 7, endHour: 20 },
  night: { startHour: 19, endHour: 32 }, // 19:00 → 08:00 the next day
} as const
export type ShiftKey = keyof typeof SHIFT_PRESETS

export function shiftsOf(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.kind === 'shift' && !e.allDay)
}

export function hasShiftOnDay(events: CalendarEvent[], day: Date): boolean {
  const key = localDayKey(day)
  return shiftsOf(events).some((e) => localDayKey(e.start) === key)
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
  /**
   * Shifts beyond this calendar week, by start. The screen used to know only
   * about the current week, so posting next week's watches left it reading
   * "No watch posted, sir." — a screenful of denial immediately after the act.
   */
  ahead: CalendarEvent[]
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
  const ahead = shifts.filter((e) => new Date(e.start) >= w1)
  return { doneH, expectedH, next, weekShifts, ahead }
}

/**
 * A watch that ends on a later calendar date than it began — the 19:00 → 08:00
 * shape, whatever hours it was actually posted with. Derived rather than read
 * off the title, so a hand-edited watch is still classified honestly.
 */
export function isNightShift(e: CalendarEvent): boolean {
  const s = new Date(e.start)
  const en = new Date(e.end)
  return s.getDate() !== en.getDate() || s.getMonth() !== en.getMonth()
}

export interface CycleStats {
  nights: number
  days: number
  /** hours on duty this week */
  onDutyH: number
  /** recovery sleep the estate pencilled in this week */
  pencilledH: number
  /** what is left of the week's 168 once duty and sleep are taken out */
  ownH: number
  /** shortest gap between the end of one watch and the start of the next */
  turnaroundH: number | null
}

/**
 * The shape of the week's duty, which the app has always had the data for and
 * never stated. Hours are start-anchored — the same convention watchStats and
 * therefore the duty ring use — so a Sunday-night watch is counted once, in
 * the week it begins, and the two surfaces cannot disagree.
 */
export function cycleStats(
  events: CalendarEvent[],
  now: number,
  weekStart?: WeekStart,
): CycleStats {
  const w0 = startOfWeek(new Date(now), weekStart)
  const w1 = addDays(w0, 7)
  const inWeek = (e: CalendarEvent) => {
    const s = new Date(e.start)
    return s >= w0 && s < w1
  }

  const shifts = shiftsOf(events).sort((a, b) => a.start.localeCompare(b.start))
  const weekShifts = shifts.filter(inWeek)
  const nights = weekShifts.filter(isNightShift).length
  const onDutyH = weekShifts.reduce((t, e) => t + hoursOf(e), 0)
  const pencilledH = events
    .filter((e) => e.kind === 'sleep' && !e.allDay && inWeek(e))
    .reduce((t, e) => t + hoursOf(e), 0)

  // the turnaround is a property of a PAIR, so it looks one watch further back
  // than the week does — a Monday watch's rest began last Sunday
  let turnaroundH: number | null = null
  for (let i = 1; i < shifts.length; i++) {
    if (!inWeek(shifts[i])) continue
    const gap =
      (new Date(shifts[i].start).getTime() - new Date(shifts[i - 1].end).getTime()) / 3_600_000
    if (gap >= 0 && (turnaroundH === null || gap < turnaroundH)) turnaroundH = gap
  }

  return {
    nights,
    days: weekShifts.length - nights,
    onDutyH,
    pencilledH,
    ownH: Math.max(0, 168 - onDutyH - pencilledH),
    turnaroundH,
  }
}

export function countdownLabel(next: CalendarEvent, now: number): string {
  const dh = (new Date(next.start).getTime() - now) / 3_600_000
  const h = Math.floor(dh)
  const m = Math.round((dh - h) * 60)
  return `in ${h} h ${String(m).padStart(2, '0')} m`
}
