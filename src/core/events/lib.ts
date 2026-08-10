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

/**
 * Does this event hold its hour against anything else being booked there?
 *
 * All-day markers never have. Neither does a block drawn from a logged
 * record — a session the Grounds mirrors onto the week is HISTORY, not a
 * booking, and letting it hold an hour has the estate arguing with the past:
 * train at six, stand watch at seven, and the watch could no longer be
 * retimed because the workout you had already finished sat under it.
 *
 * The ref prefix is duplicated here rather than imported for the same reason
 * core/sync/projection.ts duplicates it — core may not read modules.
 */
export function occupies(e: CalendarEvent): boolean {
  return !e.allDay && !(e.sourceRef?.startsWith('workout:') ?? false)
}

/** is [start,end) free of every timed event that holds its hour? */
export function rangeFree(events: CalendarEvent[], start: Date, end: Date): boolean {
  return !events.some(
    (e) => occupies(e) && overlaps(new Date(e.start), new Date(e.end), start, end),
  )
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

/**
 * Which week a boundary-crossing event belongs to. The estate has always had
 * two answers and they disagree by design:
 *
 *   'intersect'     — the week owns any event overlapping it, counted whole.
 *                     What eventsInRange + hoursByKind do, so it is what the
 *                     Manor's week line and the what-if diff already say.
 *   'startAnchored' — the week that the event BEGINS in owns all of it.
 *                     What watchStats does, so it is what the duty ring says.
 *
 * A Sunday-night watch running into Monday therefore counts in both weeks
 * under 'intersect' and once under 'startAnchored'. Neither is wrong; a
 * surface just has to pick the one its own wing already prints, or the House
 * rail will quietly contradict the screen it is sitting next to.
 */
export type WeekAttribution = 'intersect' | 'startAnchored'

/**
 * Hours of the given kinds per week, oldest first, ending with the week that
 * contains `anchor`. Weeks before the estate had any events read 0 — which is
 * honest but indistinguishable from a week off, so sparklines should say what
 * their window is rather than implying a trend from the run-up.
 */
export function weeklyHoursSeries(
  events: CalendarEvent[],
  kinds: EventKind[],
  weeks: number,
  anchor: Date,
  weekStart?: WeekStart,
  mode: WeekAttribution = 'intersect',
): number[] {
  const current = startOfWeek(anchor, weekStart)
  const wanted = new Set(kinds)
  return Array.from({ length: weeks }, (_, i) => {
    const w0 = addDays(current, -7 * (weeks - 1 - i))
    const w1 = addDays(w0, 7)
    const inWeek =
      mode === 'intersect'
        ? eventsInRange(events, w0, w1)
        : events.filter((e) => {
            const s = new Date(e.start)
            return s >= w0 && s < w1
          })
    let total = 0
    for (const e of inWeek) if (!e.allDay && wanted.has(e.kind)) total += hoursOf(e)
    return total
  })
}

/** Count of events of the given kinds in each of `weeks` weeks, oldest first. */
export function weeklyCountSeries(
  events: CalendarEvent[],
  kinds: EventKind[],
  weeks: number,
  anchor: Date,
  weekStart?: WeekStart,
  mode: WeekAttribution = 'startAnchored',
): number[] {
  const current = startOfWeek(anchor, weekStart)
  const wanted = new Set(kinds)
  return Array.from({ length: weeks }, (_, i) => {
    const w0 = addDays(current, -7 * (weeks - 1 - i))
    const w1 = addDays(w0, 7)
    const inWeek =
      mode === 'intersect'
        ? eventsInRange(events, w0, w1)
        : events.filter((e) => {
            const s = new Date(e.start)
            return s >= w0 && s < w1
          })
    return inWeek.filter((e) => !e.allDay && wanted.has(e.kind)).length
  })
}

/** total timed hours per kind (the what-if diff panel's currency) */
export function hoursByKind(events: CalendarEvent[]): Record<EventKind, number> {
  const totals: Record<EventKind, number> = {
    shift: 0,
    sleep: 0,
    training: 0,
    study: 0,
    workshop: 0,
    marker: 0,
  }
  for (const e of events) if (!e.allDay) totals[e.kind] += hoursOf(e)
  return totals
}
