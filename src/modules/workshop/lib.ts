import { addDays, localDayKey, startOfLocalDay, startOfWeek, type WeekStart } from '../../core/dates'
import { hoursOf } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'
import type { BoardCard, Milestone, SessionMeta, ShareMember, Venture, WorkEntry } from './types'

/* ------------------------------------------------------------- sourceRef
 * The wing's grammar on the shared calendar: bench-session events carry
 * `proj:<ventureId>`; milestone-day markers `ms:<milestoneId>` (registered in
 * core/sync/projection.ts — markers are projections, never carried). Manor
 * quick-adds carry none until filed.
 */
export const projRef = (ventureId: string) => `proj:${ventureId}`
export const msRef = (milestoneId: string) => `ms:${milestoneId}`
export const dueRef = (cardId: string) => `due:${cardId}`

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

/* ------------------------------------------------------------- the ledger
 * A crew venture's hours are read from the shared WORK LEDGER, never from
 * events — a partner's sessions are not on this device, and my own are, so an
 * events read would count exactly one member and call it the total. My own
 * entries are written into the ledger by the same actions that fulfill the
 * session, so for a solo crew the two readings agree to the minute. A private
 * venture never consults the ledger at all: the legacy events path is
 * byte-identical when `shareId` is unset.
 */

/** sum of ledger hours for one venture inside [s, e) — omit either bound */
export function entryHoursBetween(
  entries: Record<string, WorkEntry>,
  ventureId: string,
  s?: number,
  e?: number,
): number {
  let t = 0
  for (const en of Object.values(entries)) {
    if (en.ventureId !== ventureId) continue
    const at = new Date(en.at).getTime()
    if (s !== undefined && at < s) continue
    if (e !== undefined && at >= e) continue
    t += en.h
  }
  return t
}

/**
 * The ledger heal — UPSERT-ONLY, and that is doctrine, not laziness. My
 * fulfilled sessions and my ledger entries are written by the same actions,
 * but drift has doors: a session resized on the Manor after fulfillment, a
 * fulfillment made while signed out, a rehearsal applied. This recomputes my
 * own entries from my own events and returns what differs; it NEVER deletes
 * and never zeroes an entry whose event is missing — a store that failed to
 * hydrate is indistinguishable from one the user emptied, and hours erased
 * for the whole crew are the extinction intent.ts exists to prevent. Removal
 * comes only from declared intent. When in doubt, the hours stand.
 */
export function workLedgerPatch(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  ventures: Venture[],
  entries: Record<string, WorkEntry>,
  userId: string | null,
): Record<string, WorkEntry> {
  if (!userId) return {}
  const shared = new Set(ventures.filter((v) => v.shareId).map((v) => v.id))
  if (shared.size === 0) return {}
  const patch: Record<string, WorkEntry> = {}
  for (const e of sessionsOf(events)) {
    const vid = ventureOfEvent(e)
    if (!vid || !shared.has(vid)) continue
    const h = fulfilledHours(e, metaOf(sessions, e))
    const existing = entries[e.id]
    // a partner's entry lives under THEIR event id — my events cannot collide
    // with it, and my hand must never rewrite it anyway
    if (existing && existing.by !== userId) continue
    if (!existing && h <= 0) continue
    if (existing && existing.h === h && existing.at === e.start && existing.ventureId === vid) {
      continue
    }
    patch[e.id] = { ventureId: vid, at: e.start, h, by: userId }
  }
  return patch
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
  entries?: Record<string, WorkEntry>,
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
  // a crew venture's fulfilled hours are the whole crew's, from the ledger —
  // which also carries my own, so this REPLACES the events reading rather than
  // adding to it. `bookedH` stays mine-only: a partner's plans are their own.
  if (entries) {
    for (const v of ventures) {
      if (v.shareId) {
        perVenture[v.id].fulfilledH = entryHoursBetween(entries, v.id, w0.getTime(), w1.getTime())
      }
    }
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
  ventures?: Venture[],
  entries?: Record<string, WorkEntry>,
): number {
  const s = start.getTime()
  const e = end.getTime()
  // crew ventures read the ledger; their events would count one member twice
  const shared = new Set(
    entries ? (ventures ?? []).filter((v) => v.shareId).map((v) => v.id) : [],
  )
  const fromEvents = sessionsOf(events)
    .filter((ev) => {
      if (ventureId && ventureOfEvent(ev) !== ventureId) return false
      const ref = ventureOfEvent(ev)
      if (ref && shared.has(ref)) return false
      const t = new Date(ev.start).getTime()
      return t >= s && t < e
    })
    .reduce((t, ev) => t + fulfilledHours(ev, metaOf(sessions, ev)), 0)
  if (!entries || shared.size === 0) return fromEvents
  let fromLedger = 0
  for (const id of shared) {
    if (ventureId && id !== ventureId) continue
    fromLedger += entryHoursBetween(entries, id, s, e)
  }
  return fromEvents + fromLedger
}

/** the odometer — every fulfilled hour the venture has ever received, from
 *  the whole crew when it has one */
export function lifetimeHours(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  venture: Venture,
  entries?: Record<string, WorkEntry>,
): number {
  if (venture.shareId && entries) return entryHoursBetween(entries, venture.id)
  return sessionsOf(events)
    .filter((e) => ventureOfEvent(e) === venture.id)
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
  venture: Venture,
  now: number,
  entries?: Record<string, WorkEntry>,
): number | null {
  let last: string | null = null
  if (venture.shareId && entries) {
    // the ledger records starts; a session's end is its start plus its hours
    for (const en of Object.values(entries)) {
      if (en.ventureId !== venture.id || en.h <= 0) continue
      const end = new Date(new Date(en.at).getTime() + en.h * 3_600_000).toISOString()
      if (!last || end > last) last = end
    }
  } else {
    for (const e of sessionsOf(events)) {
      if (ventureOfEvent(e) !== venture.id) continue
      if (fulfilledHours(e, metaOf(sessions, e)) <= 0) continue
      if (!last || e.end > last) last = e.end
    }
  }
  if (!last) return null
  const ms = startOfLocalDay(new Date(now)).getTime() - startOfLocalDay(new Date(last)).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

/* ------------------------------------------------------------- task progress
 * How far along a venture IS, as opposed to how many hours it has eaten.
 *
 * The two are deliberately different readings and both are shown. Hours are
 * effort spent and only ever climb; this is the fraction of the jobs on the
 * board that are struck through, and it can go DOWN when you hang new work —
 * which is honest about inventing, where finding the next three jobs is
 * progress even though the percentage falls.
 *
 * Only `task` cards count. Notes and links are reference, not work: counting
 * them would mean pinning a datasheet made the venture look less finished.
 */
/**
 * The longest-quiet BUILDING venture, or null — sparks and shipped work owe
 * no hours. Extracted from the Workshop's own briefing so anything else that
 * wants to say "this one has gone quiet" measures it the same way.
 */
export function quietVenture(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  ventures: Venture[],
  now: number,
  entries?: Record<string, WorkEntry>,
  minDays = 7,
): { venture: Venture; days: number } | null {
  let quiet: { venture: Venture; days: number } | null = null
  for (const v of ventures) {
    if (v.archived || v.status !== 'building') continue
    const d = daysSinceTouched(events, sessions, v, now, entries)
    if (d !== null && d >= minDays && (!quiet || d > quiet.days)) quiet = { venture: v, days: d }
  }
  return quiet
}

export interface TaskProgress {
  done: number
  total: number
  /** 0–100, rounded; 0 when the board holds no tasks at all */
  pct: number
}

export function taskProgress(cards: BoardCard[], ventureId: string): TaskProgress {
  let done = 0
  let total = 0
  for (const c of cards) {
    if (c.ventureId !== ventureId || c.type !== 'task') continue
    total++
    if (c.done) done++
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/* ------------------------------------------------------------- deadlines
 * A task can carry a delivery deadline — a full instant, because "Friday" and
 * "Friday, 18:00" are different promises. The record is the card; the Manor
 * chip is a projection off it, exactly as a milestone's is.
 */

/** the deadline a card actually has (tasks only, and never once struck) */
export function dueOf(card: BoardCard): Date | null {
  if (card.type !== 'task' || !card.dueAt) return null
  const d = new Date(card.dueAt)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface DueRead {
  at: Date
  /** whole local days from today to the deadline's day (negative = past) */
  days: number
  /** the moment itself has passed — an hour-grained reading, not a day one */
  overdue: boolean
}

/**
 * How a deadline reads right now. `days` buckets the DAY (so 23:00 today is
 * still "today"), while `overdue` asks the sharper question the hour was
 * chosen for — an 18:00 delivery is late at 18:01, not at midnight.
 */
export function dueRead(card: BoardCard, now: number): DueRead | null {
  const at = dueOf(card)
  if (!at) return null
  return { at, days: daysUntil(localDayKey(at), now), overdue: at.getTime() < now }
}

/** the local day a task's chip should sit on — overdue trails to today */
export function effectiveDueDay(card: BoardCard, now: number): string | null {
  const at = dueOf(card)
  if (!at || card.done) return null
  const today = localDayKey(new Date(now))
  const day = localDayKey(at)
  return day < today ? today : day
}

/** undone tasks carrying a deadline, soonest first — overdue ones lead */
export function pendingDeliveries(cards: BoardCard[], ventureId?: string): BoardCard[] {
  return cards
    .filter((c) => !c.done && dueOf(c) && (!ventureId || c.ventureId === ventureId))
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))
}

/* ------------------------------------------------------------- milestones */

/** fulfilled hours for the milestone's venture since its countFrom (any week) */
export function milestoneProgress(
  ms: Milestone,
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  ventures?: Venture[],
  entries?: Record<string, WorkEntry>,
): number {
  const venture = ventures?.find((v) => v.id === ms.ventureId)
  if (venture?.shareId && entries) {
    return entryHoursBetween(entries, ms.ventureId, new Date(ms.countFrom).getTime())
  }
  return sessionsOf(events)
    .filter((e) => ventureOfEvent(e) === ms.ventureId && e.start >= ms.countFrom)
    .reduce((t, e) => t + fulfilledHours(e, metaOf(sessions, e)), 0)
}

/* ------------------------------------------------------------- the crew */

export interface MemberContribution {
  userId: string
  label: string
  /** ledger hours this calendar week */
  weekH: number
  /** ledger hours ever */
  totalH: number
  /** struck tasks carrying this member's stamp */
  tasksDone: number
}

/**
 * Who has done what on a crew venture — hours from the ledger, tasks from the
 * `doneBy` stamps. Every roster member appears, zeros and all; hours or strikes
 * from someone no longer on the roster are shown under the cached label they
 * left behind (departed work is still work).
 */
export function memberContribution(
  ventureId: string,
  members: ShareMember[],
  entries: Record<string, WorkEntry>,
  cards: BoardCard[],
  now: number,
  weekStart?: WeekStart,
): MemberContribution[] {
  const w0 = startOfWeek(new Date(now), weekStart).getTime()
  const w1 = w0 + 7 * 86_400_000
  const byUser = new Map<string, MemberContribution>()
  const rowFor = (userId: string): MemberContribution => {
    let row = byUser.get(userId)
    if (!row) {
      row = { userId, label: userId.slice(0, 8), weekH: 0, totalH: 0, tasksDone: 0 }
      byUser.set(userId, row)
    }
    return row
  }
  for (const m of members) rowFor(m.userId).label = m.label
  for (const en of Object.values(entries)) {
    if (en.ventureId !== ventureId || en.h <= 0) continue
    const row = rowFor(en.by)
    row.totalH += en.h
    const at = new Date(en.at).getTime()
    if (at >= w0 && at < w1) row.weekH += en.h
  }
  for (const c of cards) {
    if (c.ventureId !== ventureId || c.type !== 'task' || !c.done || !c.doneBy) continue
    rowFor(c.doneBy).tasksDone += 1
  }
  return [...byUser.values()].sort(
    (a, b) => b.totalH - a.totalH || b.tasksDone - a.tasksDone || a.label.localeCompare(b.label),
  )
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
 * Milestone days and task deadlines materialize as allDay 'marker' events so
 * the Manor stays generic. The records here are the truth; markers are a
 * projection. `syncMarker` is the single writer; `reconcileMarkers` is the
 * heal pass (chip deleted Manor-side, overdue trailing, day drift).
 */

/** the local day a milestone's chip should sit on — overdue trails to today */
export function effectiveMsDay(ms: Milestone, now: number): string | null {
  if (ms.done) return null
  const today = localDayKey(new Date(now))
  return ms.on < today ? today : ms.on
}

/** a deadline chip says the hour, since the hour is what was promised */
export function dueMarkerTitle(card: BoardCard): string {
  const at = dueOf(card)!
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return voice.workshop.markerDue(card.title, hhmm)
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
export function reconcileMarkers(milestones: Milestone[], cards: BoardCard[], now: number): void {
  const store = useEventsStore.getState()
  if (store.sandbox) return
  for (const m of milestones) {
    syncMarker(msRef(m.id), effectiveMsDay(m, now), voice.workshop.markerMs(m.title))
  }
  const dated = cards.filter((c) => dueOf(c))
  for (const c of dated) {
    syncMarker(dueRef(c.id), effectiveDueDay(c, now), dueMarkerTitle(c))
  }
  // a card that LOST its deadline (or its task type) is not in `dated` at all,
  // so nothing above heals it — the orphan sweep below is what takes its chip
  // down. Struck jobs are already handled: syncMarker was just given a null day
  // for them, and a ref that is live-but-chipless is simply a no-op here.
  const live = new Set([...milestones.map((m) => msRef(m.id)), ...dated.map((c) => dueRef(c.id))])
  for (const e of store.events) {
    if (e.kind === 'marker' && e.source === 'workshop' && e.sourceRef && !live.has(e.sourceRef)) {
      store.deleteEvent(e.id)
    }
  }
}

/* ------------------------------------------------------------- the board
 * The wall is columns. A `title` card heads one and owns whatever names it as
 * parent; everything unassigned falls into a final loose column. Grouping is
 * DERIVED on read — `col`/`row` are ordering hints, never pixel slots — which
 * is what lets a card be dragged into another column and simply belong there,
 * with no slot to vacate and no gap left behind.
 */

export interface BoardGroup {
  /** the heading card, or null for the loose column at the end */
  title: BoardCard | null
  children: BoardCard[]
}

const byOrder = (a: BoardCard, b: BoardCard) =>
  a.row - b.row || a.createdAt.localeCompare(b.createdAt)

/**
 * One venture's wall, left to right. Title columns come first in `col` order,
 * then the loose column — which is present only when it holds something, or
 * when the wall has no headings at all (then it IS the wall).
 */
export function boardGroups(cards: BoardCard[]): BoardGroup[] {
  const titles = cards
    .filter((c) => c.type === 'title')
    .sort((a, b) => a.col - b.col || a.createdAt.localeCompare(b.createdAt))
  const titleIds = new Set(titles.map((t) => t.id))

  const groups: BoardGroup[] = titles.map((t) => ({ title: t, children: [] }))
  const byTitle = new Map(groups.map((g) => [g.title!.id, g]))
  const loose: BoardCard[] = []

  for (const c of cards) {
    if (c.type === 'title') continue
    // a parent that has been taken down leaves its children loose rather than
    // invisible — an orphan must never fall off the wall
    const g = c.parentId && titleIds.has(c.parentId) ? byTitle.get(c.parentId) : undefined
    if (g) g.children.push(c)
    else loose.push(c)
  }

  for (const g of groups) g.children.sort(byOrder)
  loose.sort(byOrder)

  if (loose.length > 0 || groups.length === 0) {
    groups.push({ title: null, children: loose })
  }
  return groups
}

/** the order value that puts a card at the end of its column */
export function nextRow(cards: BoardCard[], parentId: string | undefined): number {
  const siblings = cards.filter((c) =>
    c.type === 'title' ? false : (c.parentId ?? undefined) === parentId,
  )
  return siblings.reduce((m, c) => Math.max(m, c.row + 1), 0)
}

/** the order value that puts a new heading at the right-hand end of the wall */
export function nextCol(cards: BoardCard[]): number {
  return cards
    .filter((c) => c.type === 'title')
    .reduce((m, c) => Math.max(m, c.col + 1), 0)
}
