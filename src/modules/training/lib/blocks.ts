import { useEventsStore } from '../../../core/events/store'
import type { CalendarEvent } from '../../../core/events/types'
import { voice } from '../../../core/voice'
import { isRun, isSport, type Workout } from '../types'
import { sportLabel } from '../data/sports'

/**
 * logged-session blocks — the Grounds' projection onto the Manor.
 *
 * A workout is a RECORD; the Manor is a calendar. Until now the two only met
 * in one direction: a log could claim a block that was already booked
 * (`Workout.eventId`, see fulfillment.ts), but a session nobody had booked
 * left no trace on the week at all. This draws that trace.
 *
 * Riding the Study's marker pattern and the Ledger's payday one: the workout
 * is the truth, the block is a projection, `syncBlock` is the single writer
 * and `reconcileWorkoutBlocks` is the heal pass. `sourceRef: 'workout:<id>'`
 * is what makes it a projection — core/sync/projection.ts keeps it out of the
 * carried set, so each device redraws its own from the workouts it holds
 * rather than racing a heal pass against an in-flight record.
 *
 * A session that fulfils a booked block gets NO block of its own: the Manor
 * is already showing the one it answered.
 */

/** the ref that marks a training event as drawn from a log, not booked by hand */
export const workoutRef = (id: string) => `workout:${id}`

/** true for a training block the Grounds drew from a logged session */
export const isWorkoutMirror = (e: CalendarEvent): boolean =>
  e.source === 'grounds' && (e.sourceRef?.startsWith('workout:') ?? false)

const MIN_MS = 60_000
/** the app logs sessions, not clocks — a lift block reads a default hour */
const DEFAULT_SESSION_MIN = 60
/** the same 6 min/km the energy estimate uses when only distance was logged */
const MIN_PER_KM = 6
/** a run with neither distance nor duration still occupied half an hour */
const RUN_FALLBACK_MIN = 30

/** how long the block runs; runs read their own clock, lifts read the default */
export function sessionMinutes(w: Workout): number {
  if (!isRun(w)) return DEFAULT_SESSION_MIN
  if (w.run?.durationMin != null) return Math.max(1, Math.round(w.run.durationMin))
  if (w.run?.distanceKm != null) return Math.max(1, Math.round(w.run.distanceKm * MIN_PER_KM))
  return RUN_FALLBACK_MIN
}

/**
 * The block's span. `performedAt` is read as the START — it is what the sheet's
 * When picker asks for ("when did this happen"), and anchoring the other way
 * would put a session the user dated 5 PM on the calendar at 4.
 */
export function blockSpan(w: Workout): { start: string; end: string } {
  const start = new Date(w.performedAt)
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + sessionMinutes(w) * MIN_MS).toISOString(),
  }
}

export const blockTitle = (w: Workout): string =>
  voice.grounds.loggedBlockTitle({
    ppl: w.ppl ?? null,
    run: isRun(w),
    sport: isSport(w) ? sportLabel(w) : null,
  })

const findMirror = (list: CalendarEvent[], ref: string): CalendarEvent | undefined =>
  list.find((e) => e.kind === 'training' && isWorkoutMirror(e) && e.sourceRef === ref)

/**
 * Make every logged session's block match its workout, and drop orphans whose
 * workout is gone. Runs on wing mount and from the Manor-mounted Briefing —
 * never while a what-if sandbox is open, so a rehearsal is not contaminated
 * by upkeep.
 */
export function reconcileWorkoutBlocks(workouts: Workout[]): void {
  const store = useEventsStore.getState()
  if (store.sandbox) return

  const booked = new Set(store.events.map((e) => e.id))
  const live = new Set<string>()

  for (const w of workouts) {
    // a dangling eventId (the block was later deleted on the Manor) does NOT
    // count as claimed — the session would otherwise vanish from the week
    if (w.eventId && booked.has(w.eventId)) continue
    const ref = workoutRef(w.id)
    live.add(ref)
    const { start, end } = blockSpan(w)
    const title = blockTitle(w)
    const existing = findMirror(store.events, ref)
    if (!existing) {
      store.addEvent({ source: 'grounds', sourceRef: ref, kind: 'training', title, start, end })
    } else if (existing.start !== start || existing.end !== end || existing.title !== title) {
      store.updateEvent(existing.id, { start, end, title })
    }
  }

  // re-read: the loop above wrote, and the sweep must not judge a stale list
  for (const e of useEventsStore.getState().events) {
    if (isWorkoutMirror(e) && !live.has(e.sourceRef!)) store.deleteEvent(e.id)
  }
}
