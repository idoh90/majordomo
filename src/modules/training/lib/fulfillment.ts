import type { CalendarEvent } from '../../../core/events/types'
import type { Workout } from '../types'

/**
 * log-fulfills-block — the Grounds' side of the Manor contract (M7 slice).
 * A logged workout links to the scheduled `kind:'training'` block it fulfils
 * via `Workout.eventId`, following the Study's rule: fulfillment is
 * wing-owned state; the event itself is never annotated. Strain never reads
 * the link — it's bookkeeping for the ScheduledCard tag and the butler's
 * "passed unrecorded" heads-up.
 */

const HOUR_MS = 3_600_000

/** how far around a block a workout may land and still claim it */
const MATCH_BEFORE_START_MS = 2 * HOUR_MS
const MATCH_AFTER_END_MS = 24 * HOUR_MS

const isTimedTraining = (e: CalendarEvent) => e.kind === 'training' && !e.allDay

/**
 * The training block a workout fulfils: timed training events, not already
 * linked, with performedAt in [start − 2h, end + 24h]; nearest start wins.
 * Call with the COMMITTED events list — never a what-if sandbox's.
 */
export function matchTrainingEvent(
  events: CalendarEvent[],
  performedAt: string,
  linkedEventIds: Set<string>,
): CalendarEvent | null {
  const t = new Date(performedAt).getTime()
  let best: CalendarEvent | null = null
  let bestDist = Infinity
  for (const e of events) {
    if (!isTimedTraining(e) || linkedEventIds.has(e.id)) continue
    const start = new Date(e.start).getTime()
    const end = new Date(e.end).getTime()
    if (t < start - MATCH_BEFORE_START_MS || t > end + MATCH_AFTER_END_MS) continue
    const dist = Math.abs(t - start)
    if (dist < bestDist) {
      best = e
      bestDist = dist
    }
  }
  return best
}

/** every eventId currently claimed by a workout */
export function linkedEventIds(workouts: Workout[]): Set<string> {
  const ids = new Set<string>()
  for (const w of workouts) if (w.eventId) ids.add(w.eventId)
  return ids
}

/**
 * Past training blocks that nobody has filed: end ≤ now, ended within
 * `windowH`, no workout linked, AND no workout performed inside
 * [start − 1h, end + 3h] (heuristic cover for history that predates the
 * link field). Most recently ended first.
 */
export function unfulfilledTrainingEvents(
  events: CalendarEvent[],
  workouts: Workout[],
  now: number,
  windowH = 48,
): CalendarEvent[] {
  const linked = linkedEventIds(workouts)
  const cutoff = now - windowH * HOUR_MS
  return events
    .filter((e) => {
      if (!isTimedTraining(e)) return false
      const end = new Date(e.end).getTime()
      if (end > now || end < cutoff) return false
      if (linked.has(e.id)) return false
      const start = new Date(e.start).getTime()
      return !workouts.some((w) => {
        const t = new Date(w.performedAt).getTime()
        return t >= start - HOUR_MS && t <= end + 3 * HOUR_MS
      })
    })
    .sort((a, b) => b.end.localeCompare(a.end))
}
