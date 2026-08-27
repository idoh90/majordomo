import { addDays, atHour, startOfWeek, type WeekStart } from '../../core/dates'
import { hoursOf, overlaps, rangeFree } from '../../core/events/lib'
import type { CalendarEvent } from '../../core/events/types'
import { isNightRecord, isPencilledNight } from '../../core/sleep/lib'
import { voice } from '../../core/voice'

// atHour / rangeFree moved to core when the Study became their second
// consumer (extract-on-contact); re-exported so existing imports hold.
export { atHour, rangeFree }

/** minutes in a day — the wrap point for a shift that runs past midnight */
export const DAY_MIN = 1440

/**
 * The local instant `min` minutes after midnight of `day`. `min` may exceed
 * DAY_MIN, which is how a shift ending on the following calendar date is
 * expressed (the minutes form of the old endHour-32 convention).
 *
 * Integer minutes on purpose — do NOT route this through atHour(min / 60).
 * atHour derives its minutes as (h - floor(h)) * 60, and 17:50 comes back as
 * (17.8333… - 17) * 60 = 49.99999…, which the Date constructor truncates to
 * 49. The half-hour grid atHour was written for is float-exact; arbitrary
 * user-typed minutes are not.
 */
export function atMinutes(day: Date, min: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min)
}

/** 'HH:MM' of a minutes-since-midnight value, wrapped past midnight */
export function hhmmOfMin(min: number): string {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * The recovery block a cross-midnight shift earns: an hour to get home, then
 * six hours down. Anchored to the shift's own end rather than a fixed morning,
 * so a watch ending at 05:00 sleeps 06:00–12:00 and the old 19:00 → 08:00
 * shape still pencils exactly 09:00–15:00.
 */
export const SLEEP_GAP_MIN = 60
export const SLEEP_LEN_MIN = 360

export function recoveryWindow(shiftEnd: Date): { start: Date; end: Date } {
  const start = new Date(shiftEnd.getTime() + SLEEP_GAP_MIN * 60_000)
  return { start, end: new Date(start.getTime() + SLEEP_LEN_MIN * 60_000) }
}

export function shiftsOf(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.kind === 'shift' && !e.allDay)
}

/**
 * Would a watch over [start,end) lie on one already posted?
 *
 * This replaced a one-shift-per-day guard, which was two wrongs at once: it
 * refused a legitimate double (lunch and dinner are one day and two watches)
 * while allowing a real collision, since yesterday's night watch runs into
 * today and was never that day's shift. Ends are exclusive, so back-to-back
 * watches touching at 17:00 are not an overlap.
 */
export function shiftOverlaps(events: CalendarEvent[], start: Date, end: Date): boolean {
  return shiftsOf(events).some((e) => overlaps(new Date(e.start), new Date(e.end), start, end))
}

/** does [start,end) lie over sleep the estate pencilled in? */
export function sleepOverlaps(events: CalendarEvent[], start: Date, end: Date): boolean {
  return events.some(
    (e) =>
      e.kind === 'sleep' && !e.allDay && overlaps(new Date(e.start), new Date(e.end), start, end),
  )
}

/** minutes since local midnight; `endMin > DAY_MIN` ends on the next date */
export interface WatchShape {
  startMin: number
  endMin: number
}

/** a draft the caller commits, or a refusal it reports */
export type WatchPostPlan =
  | { ok: false; message: string }
  | {
      ok: true
      /** the watch, and the recovery sleep when a cross-midnight shape earned
       *  one — in the order they should be written */
      events: Omit<CalendarEvent, 'id' | 'updatedAt'>[]
      /** a recovery block came with it */
      pencilled: boolean
      /** it lies over sleep the estate had already pencilled in */
      overSleep: boolean
      /** what the butler says about the outcome */
      message: string
    }

/**
 * What posting `shape` on `day` would do — decided here, written by the caller.
 *
 * Two surfaces post watches now (the Watch's roster and the first-time setup),
 * and the two rules that make a posted watch correct are easy to lose in the
 * copy: a watch may not lie on another, and one that runs through the night
 * earns its recovery sleep whenever the morning after is free. Both live here
 * so a second caller cannot quietly ship a third set of rules.
 *
 * Deliberately pure: it reads `events` and returns drafts, so a caller may
 * plan without writing (and the refusal costs nothing).
 */
export function planWatchPost(
  events: CalendarEvent[],
  day: Date,
  shape: WatchShape,
  title: string,
): WatchPostPlan {
  const start = atMinutes(day, shape.startMin)
  const end = atMinutes(day, shape.endMin)
  if (shiftOverlaps(events, start, end)) return { ok: false, message: voice.watch.overlap }

  // pencilled sleep is a suggestion, not a booking — a watch may lie over it,
  // and the estate says so rather than quietly trimming what it drew
  const overSleep = sleepOverlaps(events, start, end)
  const planned: Omit<CalendarEvent, 'id' | 'updatedAt'>[] = [
    {
      source: 'watch',
      kind: 'shift',
      title,
      start: start.toISOString(),
      end: end.toISOString(),
    },
  ]

  // sleep after a watch that ran through the night is first-class: pencil the
  // recovery block when free. Derived from the SHAPE, so a 21:00 → 05:00 gets
  // the same courtesy the old 19:00 → 08:00 preset used to get by name.
  let pencilled = false
  if (shape.endMin > DAY_MIN) {
    const rest = recoveryWindow(end)
    if (rangeFree(events, rest.start, rest.end)) {
      planned.push({
        source: 'watch',
        kind: 'sleep',
        title: voice.watch.sleepTitle,
        start: rest.start.toISOString(),
        end: rest.end.toISOString(),
      })
      pencilled = true
    }
  }

  return {
    ok: true,
    events: planned,
    pencilled,
    overSleep,
    message: pencilled
      ? voice.watch.postedWithSleep
      : overSleep
        ? voice.watch.postedOverSleep
        : voice.watch.posted,
  }
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
  /**
   * Sleep this week that is still only a SUGGESTION — hours the estate drew
   * after a night watch and nobody has confirmed. Split from `sleptH` because
   * a plan and a record are not the same claim, and adding them into one
   * figure is how a fortnight of pencil marks used to read as a fortnight of
   * rest. (core/sleep/lib.ts owns the predicate both use.)
   */
  pencilledH: number
  /** …and sleep this week that was actually written down */
  sleptH: number
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
  const weekSleep = events.filter((e) => e.kind === 'sleep' && !e.allDay && inWeek(e))
  const pencilledH = weekSleep
    .filter(isPencilledNight)
    .reduce((t, e) => t + hoursOf(e), 0)
  const sleptH = weekSleep.filter(isNightRecord).reduce((t, e) => t + hoursOf(e), 0)

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
    sleptH,
    ownH: Math.max(0, 168 - onDutyH - pencilledH - sleptH),
    turnaroundH,
  }
}

export function countdownLabel(next: CalendarEvent, now: number): string {
  const dh = (new Date(next.start).getTime() - now) / 3_600_000
  const h = Math.floor(dh)
  const m = Math.round((dh - h) * 60)
  return `in ${h} h ${String(m).padStart(2, '0')} m`
}
