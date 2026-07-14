import { addDays, startOfWeek, type WeekStart } from '../dates'
import type { CalendarEvent, EventKind } from './types'

/**
 * Where a Manor column starts: a column runs [SEAM_HOUR, SEAM_HOUR + 24h).
 * 0 = the ordinary calendar day (00:00 → 00:00), which is what people read
 * fastest. Events that run past the seam (a 19:00 → 08:00 night watch) split
 * across the two columns with dotted "continues" edges — the data itself is
 * never day-bucketed, only its rendering. A shift-aware seam (the duty-cycle
 * idea from Week View direction 1a) stays available by moving this constant.
 */
export const SEAM_HOUR = 0

/** wall-clock seam instant on a given calendar day (DST-safe: local ctor) */
export function seamStart(day: Date, seamHour: number = SEAM_HOUR): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), seamHour)
}

export interface ColumnWindow {
  /** the calendar day whose seam opens this column (the column's label) */
  day: Date
  start: Date
  /** exclusive — the next day's seam */
  end: Date
}

/**
 * The seven duty-cycle windows of the week containing `anchor`. Note the
 * documented trade-off of direction 1a: the week runs [day0 16:00, day7
 * 16:00), so the first morning of the week belongs to the previous week's
 * last column.
 */
export function weekColumns(
  anchor: Date,
  weekStart?: WeekStart,
  seamHour: number = SEAM_HOUR,
): ColumnWindow[] {
  const first = startOfWeek(anchor, weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(first, i)
    return { day, start: seamStart(day, seamHour), end: seamStart(addDays(day, 1), seamHour) }
  })
}

export interface ClippedEvent {
  event: CalendarEvent
  /** visible range inside the window */
  start: Date
  end: Date
  /** the event continues past the window edge (render a dotted cut edge) */
  continuesBefore: boolean
  continuesAfter: boolean
}

/** Clip a timed event to a window; null when it doesn't intersect. */
export function clipToWindow(e: CalendarEvent, winStart: Date, winEnd: Date): ClippedEvent | null {
  if (e.allDay) return null
  const s = new Date(e.start)
  const en = new Date(e.end)
  if (en <= winStart || s >= winEnd) return null
  return {
    event: e,
    start: s < winStart ? winStart : s,
    end: en > winEnd ? winEnd : en,
    continuesBefore: s < winStart,
    continuesAfter: en > winEnd,
  }
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Timed events intersecting [start, end) plus all-day markers anchored inside. */
export function eventsInRange(events: CalendarEvent[], start: Date, end: Date): CalendarEvent[] {
  return events.filter((e) => {
    const s = new Date(e.start)
    if (e.allDay) return s >= start && s < end
    return overlaps(s, new Date(e.end), start, end)
  })
}

export function hoursOf(e: CalendarEvent): number {
  return (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3_600_000
}

/** total timed hours per kind (the what-if diff panel's currency) */
export function hoursByKind(events: CalendarEvent[]): Record<EventKind, number> {
  const totals: Record<EventKind, number> = {
    shift: 0,
    sleep: 0,
    training: 0,
    study: 0,
    marker: 0,
  }
  for (const e of events) if (!e.allDay) totals[e.kind] += hoursOf(e)
  return totals
}
