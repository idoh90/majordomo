import type { CalendarEvent } from '../events/types'

/**
 * Which calendar events are PROJECTIONS rather than records.
 *
 * Homework due-days, exam days and paydays are drawn onto the Manor as allDay
 * markers by their own wing, from a record that lives elsewhere. The Study says
 * it outright: "The records here are the truth; markers are a projection."
 * A logged workout's training block is the same bargain in a timed shape — the
 * workout is the record, the block on the week is drawn from it.
 *
 * They must never be carried, for a reason that costs data rather than tidiness.
 * Both wings run a heal pass that DELETES any marker whose record it cannot
 * find. Carry the markers and this happens: device A adds homework, which emits
 * rows in two wings; device B receives the marker a moment before the homework,
 * runs its heal pass on the next visit to the Manor, finds a marker with no
 * record behind it, and deletes it — and that deletion travels back and removes
 * the marker from device A, under the user's eyes.
 *
 * Excluding them dissolves the race entirely: each device redraws its own
 * markers from the homework and exams it has, whenever it has them.
 *
 * Matching by ref PREFIX rather than by `source` or by `kind` is deliberate —
 * it keys on the thing that actually makes an event a projection, that a record
 * elsewhere owns it. A marker the user typed themselves, or a training block
 * booked by hand on the Manor, carries no such ref and is real data.
 *
 * The prefixes are duplicated here rather than imported, because core/ may not
 * reach into modules/. Same bargain core/backup.ts already makes with the
 * storage key names, and the same one that keeps this file honest: it is the
 * ONE place both the reader (the registry) and the writer (deleteEvent) agree.
 */
const PROJECTION_PREFIXES = ['hw:', 'exam:', 'payday:', 'workout:'] as const

export function isProjection(e: CalendarEvent): boolean {
  if (!e.sourceRef) return false
  const ref = e.sourceRef
  return PROJECTION_PREFIXES.some((p) => ref.startsWith(p))
}
