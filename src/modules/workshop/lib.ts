import { addDays, localDayKey, startOfLocalDay, startOfWeek, type WeekStart } from '../../core/dates'
import { hoursOf } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'
import type { Milestone, SessionMeta, Venture } from './types'

/* ------------------------------------------------------------- sourceRef
 * The wing's grammar on the shared calendar: bench-session events carry
 * `proj:<ventureId>`; milestone-day markers `ms:<milestoneId>` (registered in
 * core/sync/projection.ts — markers are projections, never carried). Manor
 * quick-adds carry none until filed.
 */
export const projRef = (ventureId: string) => `proj:${ventureId}`
export const msRef = (milestoneId: string) => `ms:${milestoneId}`

export function ventureOfEvent(e: CalendarEvent): string | null {
  return e.sourceRef?.startsWith('proj:') ? e.sourceRef.slice(5) : null
}

/** timed bench sessions (markers excluded) */
export function sessionsOf(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.kind === 'workshop' && !e.allDay)
}

/* ------------------------------------------------------------- local days */

/** parse a local day key (YYYY-MM-DD) as local midnight — never `new Date(key)` (UTC shift) */
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** whole local days from today to `key` (negative = past) */
export function daysUntil(key: string, now: number): number {
  const ms = dayKeyToDate(key).getTime() - startOfLocalDay(new Date(now)).getTime()
  return Math.round(ms / 86_400_000)
}

/* ------------------------------------------------------------- fulfillment */

export function metaOf(sessions: Record<string, SessionMeta>, e: CalendarEvent): SessionMeta {
  return sessions[e.id] ?? { fulfillment: 'planned' }
}

/** hours that actually happened: done = full span, partial = doneH, else 0 */
export function fulfilledHours(e: CalendarEvent, meta: SessionMeta): number {
  if (meta.fulfillment === 'done') return hoursOf(e)
  if (meta.fulfillment === 'partial') return meta.doneH ?? 0
  return 0
}

/* ------------------------------------------------------------- weekly stats */

export interface VentureWeek {
  fulfilledH: number
  /** everything not skipped — planned or done */
  bookedH: number
}

export interface WorkshopStats {
  perVenture: Record<string, VentureWeek>
  totalFulfilled: number
  totalBooked: number
  weekStart: Date
  /** exclusive */
  weekEnd: Date
}

/**
 * Fulfilled vs booked bench hours per venture for the calendar week containing
 * `now`. Computed on read, never persisted — the `studyStats` mold. Unfiled
 * sessions (no `proj:` ref) count toward no venture and no total; filing them
 * from the awaiting queue is the way in.
 */
export function workshopStats(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  ventures: Venture[],
  now: number,
  weekStart?: WeekStart,
): WorkshopStats {
  const w0 = startOfWeek(new Date(now), weekStart)
  const w1 = addDays(w0, 7)
  const perVenture: Record<string, VentureWeek> = {}
  for (const v of ventures) perVenture[v.id] = { fulfilledH: 0, bookedH: 0 }
  for (const e of sessionsOf(events)) {
    const start = new Date(e.start)
    if (start < w0 || start >= w1) continue
    const ventureId = ventureOfEvent(e)
    if (!ventureId) continue
    const bucket = perVenture[ventureId]
    if (!bucket) continue // deleted ventures keep their history silently
    const meta = metaOf(sessions, e)
    bucket.fulfilledH += fulfilledHours(e, meta)
    if (meta.fulfillment !== 'skipped') bucket.bookedH += hoursOf(e)
  }
  let totalFulfilled = 0
  let totalBooked = 0
  for (const v of ventures) {
    if (v.archived) continue
    totalFulfilled += perVenture[v.id].fulfilledH
    totalBooked += perVenture[v.id].bookedH
  }
  return { perVenture, totalFulfilled, totalBooked, weekStart: w0, weekEnd: w1 }
}

/**
 * Fulfilled bench hours inside an arbitrary window — the lookback the weekly
 * stats can't answer. Composed from the same primitives, so the two can never
 * disagree about what a session was worth.
 */
export function fulfilledHoursBetween(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  start: Date,
  end: Date,
  ventureId?: string,
): number {
  const s = start.getTime()
  const e = end.getTime()
  return sessionsOf(events)
    .filter((ev) => {
      if (ventureId && ventureOfEvent(ev) !== ventureId) return false
      const t = new Date(ev.start).getTime()
      return t >= s && t < e
    })
    .reduce((t, ev) => t + fulfilledHours(ev, metaOf(sessions, ev)), 0)
}

/** the odometer — every fulfilled hour the venture has ever received */
export function lifetimeHours(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  ventureId: string,
): number {
  return sessionsOf(events)
    .filter((e) => ventureOfEvent(e) === ventureId)
    .reduce((t, e) => t + fulfilledHours(e, metaOf(sessions, e)), 0)
}

/** past sessions still marked planned — the AWAITING REPORT queue (any week) */
export function awaitingReport(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  now: number,
): CalendarEvent[] {
  return sessionsOf(events)
    .filter((e) => new Date(e.end).getTime() <= now && metaOf(sessions, e).fulfillment === 'planned')
    .sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * Whole days since the venture's last fulfilled hour ended — the shelf card's
 * "quiet nine days" line. Null when nothing was ever fulfilled.
 */
export function daysSinceTouched(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  ventureId: string,
  now: number,
): number | null {
  let last: string | null = null
  for (const e of sessionsOf(events)) {
    if (ventureOfEvent(e) !== ventureId) continue
    if (fulfilledHours(e, metaOf(sessions, e)) <= 0) continue
    if (!last || e.end > last) last = e.end
  }
  if (!last) return null
  const ms = startOfLocalDay(new Date(now)).getTime() - startOfLocalDay(new Date(last)).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

/* ------------------------------------------------------------- milestones */

/** fulfilled hours for the milestone's venture since its countFrom (any week) */
export function milestoneProgress(
  ms: Milestone,
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
): number {
  return sessionsOf(events)
    .filter((e) => ventureOfEvent(e) === ms.ventureId && e.start >= ms.countFrom)
    .reduce((t, e) => t + fulfilledHours(e, metaOf(sessions, e)), 0)
}

/** undone milestones, soonest day first — overdue ones lead the queue */
export function pendingMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].filter((m) => !m.done).sort((a, b) => a.on.localeCompare(b.on))
}

/** the nearest undone milestone (optionally one venture's), else null */
export function nextMilestone(milestones: Milestone[], ventureId?: string): Milestone | null {
  return (
    pendingMilestones(milestones).find((m) => !ventureId || m.ventureId === ventureId) ?? null
  )
}

/* ------------------------------------------------------------- markers
 * Milestone days materialize as allDay 'marker' events so the Manor stays
 * generic. The records here are the truth; markers are a projection.
 * `syncMarker` is the single writer; `reconcileMarkers` is the heal pass
 * (chip deleted Manor-side, overdue trailing, day drift).
 */

/** the local day a milestone's chip should sit on — overdue trails to today */
export function effectiveMsDay(ms: Milestone, now: number): string | null {
  if (ms.done) return null
  const today = localDayKey(new Date(now))
  return ms.on < today ? today : ms.on
}

function findMarker(list: CalendarEvent[], ref: string): CalendarEvent | undefined {
  return list.find((e) => e.kind === 'marker' && e.source === 'workshop' && e.sourceRef === ref)
}

/** create/move/remove one workshop marker so it matches `dayKey` (null = none) */
export function syncMarker(ref: string, dayKey: string | null, title: string): void {
  const store = useEventsStore.getState()
  const list = store.sandbox ? store.sandbox.events : store.events
  const existing = findMarker(list, ref)
  if (!dayKey) {
    if (existing) store.deleteEvent(existing.id)
    return
  }
  const iso = dayKeyToDate(dayKey).toISOString()
  if (!existing) {
    store.addEvent({ source: 'workshop', sourceRef: ref, kind: 'marker', title, start: iso, end: iso, allDay: true })
  } else if (existing.start !== iso || existing.title !== title) {
    store.updateEvent(existing.id, { start: iso, end: iso, title })
  }
}

/**
 * Make every workshop marker match its record (and drop orphans whose record
 * is gone). Runs on wing mount and from the Manor-mounted Briefing — never
 * while a what-if sandbox is open, so a rehearsal is not contaminated by upkeep.
 */
export function reconcileMarkers(milestones: Milestone[], now: number): void {
  const store = useEventsStore.getState()
  if (store.sandbox) return
  for (const m of milestones) {
    syncMarker(msRef(m.id), effectiveMsDay(m, now), voice.workshop.markerMs(m.title))
  }
  const live = new Set(milestones.map((m) => msRef(m.id)))
  for (const e of store.events) {
    if (e.kind === 'marker' && e.source === 'workshop' && e.sourceRef && !live.has(e.sourceRef)) {
      store.deleteEvent(e.id)
    }
  }
}

/* ------------------------------------------------------------- the board */

/** the pegboard's fixed column count — column i is page i of the mobile pager */
export const BOARD_COLS = 4

/** cards of one venture, grouped into columns, each column top-to-bottom */
export function boardColumns<T extends { col: number; row: number }>(cards: T[]): T[][] {
  const cols: T[][] = Array.from({ length: BOARD_COLS }, () => [])
  for (const c of cards) {
    const col = Math.max(0, Math.min(BOARD_COLS - 1, c.col))
    cols[col].push(c)
  }
  for (const col of cols) col.sort((a, b) => a.row - b.row)
  return cols
}

/** first free (col,row) slot, filling columns left to right, rows downward */
export function firstFreeSlot(cards: { col: number; row: number }[]): { col: number; row: number } {
  const taken = new Set(cards.map((c) => `${c.col}:${c.row}`))
  for (let row = 0; ; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      if (!taken.has(`${col}:${row}`)) return { col, row }
    }
  }
}
