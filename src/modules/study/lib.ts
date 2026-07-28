import { addDays, localDayKey, startOfLocalDay, startOfWeek, type WeekStart } from '../../core/dates'
import { hoursOf } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'
import type { Exam, Homework, SessionMeta, Subject } from './types'

/* ------------------------------------------------------------- sourceRef
 * The wing's grammar on the shared calendar: session events carry
 * `subj:<subjectId>`; homework-due markers `hw:<homeworkId>`; exam-day
 * markers `exam:<examId>`. Manor quick-adds carry none until filed.
 */
export const subjRef = (subjectId: string) => `subj:${subjectId}`
export const hwRef = (homeworkId: string) => `hw:${homeworkId}`
export const examRef = (examId: string) => `exam:${examId}`

export function subjectOfEvent(e: CalendarEvent): string | null {
  return e.sourceRef?.startsWith('subj:') ? e.sourceRef.slice(5) : null
}

/** timed study sessions (markers excluded) */
export function sessionsOf(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.kind === 'study' && !e.allDay)
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

export interface SubjectWeek {
  fulfilledH: number
  /** everything not skipped, planned or done */
  bookedH: number
}

export interface StudyStats {
  perSubject: Record<string, SubjectWeek>
  totalFulfilled: number
  totalBooked: number
  weekStart: Date
  /** exclusive */
  weekEnd: Date
}

/**
 * Fulfilled vs booked hours per subject for the calendar week containing
 * `now`. Computed on read, never persisted — the `watchStats` mold. Unfiled
 * sessions (no `subj:` ref) count toward no subject and no total; filing
 * them from the awaiting queue is the way in.
 */
export function studyStats(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  subjects: Subject[],
  now: number,
  weekStart?: WeekStart,
): StudyStats {
  const w0 = startOfWeek(new Date(now), weekStart)
  const w1 = addDays(w0, 7)
  const perSubject: Record<string, SubjectWeek> = {}
  for (const s of subjects) perSubject[s.id] = { fulfilledH: 0, bookedH: 0 }
  for (const e of sessionsOf(events)) {
    const start = new Date(e.start)
    if (start < w0 || start >= w1) continue
    const subjectId = subjectOfEvent(e)
    if (!subjectId) continue
    const bucket = perSubject[subjectId]
    if (!bucket) continue // archived-and-deleted subjects keep their history silently
    const meta = metaOf(sessions, e)
    bucket.fulfilledH += fulfilledHours(e, meta)
    if (meta.fulfillment !== 'skipped') bucket.bookedH += hoursOf(e)
  }
  let totalFulfilled = 0
  let totalBooked = 0
  for (const s of subjects) {
    if (s.archived) continue
    totalFulfilled += perSubject[s.id].fulfilledH
    totalBooked += perSubject[s.id].bookedH
  }
  return { perSubject, totalFulfilled, totalBooked, weekStart: w0, weekEnd: w1 }
}

/** past sessions still marked planned — the AWAITING REPORT queue (any week) */
/**
 * Fulfilled hours for a subject (or every subject) inside an arbitrary window.
 *
 * studyStats answers the same question but only ever for the week containing
 * `now`, which is right for the rings and useless for anything that wants to
 * look back. Composed from the same primitives it uses, so the two can never
 * disagree about what a session was worth.
 */
export function fulfilledHoursBetween(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  start: Date,
  end: Date,
  subjectId?: string,
): number {
  const s = start.getTime()
  const e = end.getTime()
  return sessionsOf(events)
    .filter((ev) => {
      if (subjectId && subjectOfEvent(ev) !== subjectId) return false
      const t = new Date(ev.start).getTime()
      return t >= s && t < e
    })
    .reduce((t, ev) => t + fulfilledHours(ev, metaOf(sessions, ev)), 0)
}

export function awaitingReport(
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
  now: number,
): CalendarEvent[] {
  return sessionsOf(events)
    .filter((e) => new Date(e.end).getTime() <= now && metaOf(sessions, e).fulfillment === 'planned')
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** fulfilled hours for the exam's subject since its countFrom (any week) */
export function examProgress(
  exam: Exam,
  events: CalendarEvent[],
  sessions: Record<string, SessionMeta>,
): number {
  return sessionsOf(events)
    .filter((e) => subjectOfEvent(e) === exam.subjectId && e.start >= exam.countFrom)
    .reduce((t, e) => t + fulfilledHours(e, metaOf(sessions, e)), 0)
}

/**
 * Hours BOOKED for an exam's subject in the run-up to it — the single answer
 * to "is anything on the books before this exam, sir?".
 *
 * The window is explicit and shared: **[now, end of the exam's local day)**.
 * Scheduled span, not fulfilled hours — these sessions have not happened yet,
 * so there is nothing to fulfil.
 *
 * This exists because two code paths used to answer that question differently
 * and contradicted each other on one screen: the Manor's heads-up asked "does
 * any FUTURE session exist?" while the Study briefing reported examProgress —
 * fulfilled hours since countFrom, i.e. work already DONE — but phrased it as
 * "on the books". With past sessions done and nothing booked ahead, the estate
 * said "nothing on the books" and "two hours on the books" at the same time.
 *
 * Both callers now use this. `examProgress` is a different and still-correct
 * question ("how much have I actually done") and remains the Study screen's.
 */
export function bookedHoursBeforeExam(
  exam: Exam,
  events: CalendarEvent[],
  now: number,
): number {
  const endOfExamDay = dayKeyToDate(exam.on).getTime() + 86_400_000
  return sessionsOf(events)
    .filter((e) => {
      if (subjectOfEvent(e) !== exam.subjectId) return false
      const start = new Date(e.start).getTime()
      return start >= now && start < endOfExamDay
    })
    .reduce((t, e) => t + hoursOf(e), 0)
}

/** the nearest exam on/after today, else null */
export function nextExam(exams: Exam[], now: number): Exam | null {
  const today = localDayKey(new Date(now))
  return (
    [...exams].filter((x) => x.on >= today).sort((a, b) => a.on.localeCompare(b.on))[0] ?? null
  )
}

/* ------------------------------------------------------------- markers
 * Homework due days and exam days materialize as allDay 'marker' events so
 * the Manor stays generic. The records here are the truth; markers are a
 * projection. `syncMarker` is the single writer; `reconcileMarkers` is the
 * heal pass (chip deleted Manor-side, overdue trailing, day drift).
 */

/** the local day a homework's chip should sit on — overdue trails to today */
export function effectiveHwDay(hw: Homework, now: number): string | null {
  if (hw.done || !hw.due) return null
  const today = localDayKey(new Date(now))
  return hw.due < today ? today : hw.due
}

function findMarker(list: CalendarEvent[], ref: string): CalendarEvent | undefined {
  return list.find((e) => e.kind === 'marker' && e.source === 'study' && e.sourceRef === ref)
}

/** create/move/remove one study marker so it matches `dayKey` (null = none) */
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
    store.addEvent({ source: 'study', sourceRef: ref, kind: 'marker', title, start: iso, end: iso, allDay: true })
  } else if (existing.start !== iso || existing.title !== title) {
    store.updateEvent(existing.id, { start: iso, end: iso, title })
  }
}

/**
 * Make every study marker match its record (and drop orphans whose record is
 * gone). Runs on wing mount and from the Manor-mounted Briefing — never while
 * a what-if sandbox is open, so a rehearsal is not contaminated by upkeep.
 */
export function reconcileMarkers(homework: Homework[], exams: Exam[], now: number): void {
  const store = useEventsStore.getState()
  if (store.sandbox) return
  for (const hw of homework) syncMarker(hwRef(hw.id), effectiveHwDay(hw, now), voice.study.markerHw(hw.title))
  for (const x of exams) syncMarker(examRef(x.id), x.on, voice.study.markerExam(x.title))
  const live = new Set([...homework.map((h) => hwRef(h.id)), ...exams.map((x) => examRef(x.id))])
  for (const e of store.events) {
    if (e.kind === 'marker' && e.source === 'study' && e.sourceRef && !live.has(e.sourceRef)) {
      store.deleteEvent(e.id)
    }
  }
}
