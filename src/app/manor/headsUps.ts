import type { CalendarEvent } from '../../core/events/types'
import { eventsInRange, hoursByKind } from '../../core/events/lib'
import {
  addDays,
  localDayKey,
  relativeDayLabel,
  startOfLocalDay,
  startOfWeek,
  type WeekStart,
} from '../../core/dates'
import { voice } from '../../core/voice'
import { isRun, type Workout } from '../../modules/training/types'
import { unfulfilledTrainingEvents } from '../../modules/training/lib/fulfillment'
import type { Snapshot } from '../../modules/capital/types'
import type { Exam, SessionMeta, Subject } from '../../modules/study/types'
import { awaitingReport, bookedHoursBeforeExam, nextExam } from '../../modules/study/lib'

/**
 * The butler's briefing: a greeting plus contextual heads-up lines, computed
 * on read in the `studyStats` mold — nothing persisted, no dismissal state.
 * A line exists while its condition holds and dies with it. This module is
 * app-level on purpose: only `src/app/**` may read every wing's store.
 */

export type HeadsUpId =
  | 'unfiled-workout'
  | 'exam-unbooked'
  | 'next-week-watches'
  | 'week-plan'
  | 'snapshot-nudge'
  | 'night-tonight'
  | 'awaiting-report'
  | 'goal-behind'

export interface HeadsUp {
  id: HeadsUpId
  text: string
}

export interface HeadsUpInputs {
  now: number
  weekStart: WeekStart
  /** COMMITTED events — the butler does not brief on rehearsals */
  events: CalendarEvent[]
  workouts: Workout[]
  weeklyGoal: number
  snapshots: Snapshot[]
  paydayDay: number
  subjects: Subject[]
  exams: Exam[]
  sessions: Record<string, SessionMeta>
}

/** at most this many heads-up lines render; the greeting is free */
export const HEADS_UP_CAP = 2

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export function computeBriefing(i: HeadsUpInputs): { greeting: string | null; headsUps: HeadsUp[] } {
  const nowD = new Date(i.now)
  const found: HeadsUp[] = []
  const push = (id: HeadsUpId, text: string) => {
    if (found.length < HEADS_UP_CAP) found.push({ id, text })
  }

  /* ---- greeting: the 1st of the month wins over the week-start day ---- */
  const greeting =
    nowD.getDate() === 1
      ? voice.manor.headsUp.monthGreeting(nowD.toLocaleDateString('en-US', { month: 'long' }))
      : nowD.getDay() === i.weekStart
        ? voice.manor.headsUp.weekGreeting(nowD.toLocaleDateString('en-US', { weekday: 'long' }))
        : null

  /* ---- 1 · a training block passed with nothing logged against it ---- */
  const unfiled = unfulfilledTrainingEvents(i.events, i.workouts, i.now, 48)
  if (unfiled.length > 0) {
    push('unfiled-workout', voice.manor.headsUp.unfiledWorkout({ day: relativeDayLabel(unfiled[0].start, nowD) }))
  }

  /* ---- 2 · an exam inside a week, nothing booked for its subject ---- */
  const exam = nextExam(i.exams, i.now)
  if (exam) {
    const [y, m, d] = exam.on.split('-').map(Number)
    const examDay = new Date(y, m - 1, d)
    const days = Math.round((examDay.getTime() - startOfLocalDay(nowD).getTime()) / DAY_MS)
    if (days <= 7) {
      // same helper, same window as the Study wing's own briefing line — the
      // two used to compute this separately and contradict each other on screen
      const booked = bookedHoursBeforeExam(exam, i.events, i.now) > 0
      if (!booked) {
        const subject = i.subjects.find((s) => s.id === exam.subjectId)?.name ?? exam.title
        push('exam-unbooked', voice.manor.headsUp.examUnbooked({ subject, days }))
      }
    }
  }

  /* ---- 3 · Thu/Fri and next week carries no watches ---- */
  if (nowD.getDay() === 4 || nowD.getDay() === 5) {
    const nextWeekStart = addDays(startOfWeek(nowD, i.weekStart), 7)
    const nextWeek = eventsInRange(i.events, nextWeekStart, addDays(nextWeekStart, 7))
    if (!nextWeek.some((e) => e.kind === 'shift' && !e.allDay)) {
      push('next-week-watches', voice.manor.headsUp.nextWeekWatches)
    }
  }

  /* ---- 4 · the week-start day over a nearly-empty week ---- */
  if (nowD.getDay() === i.weekStart) {
    const weekStartD = startOfWeek(nowD, i.weekStart)
    const week = eventsInRange(i.events, weekStartD, addDays(weekStartD, 7))
    const t = hoursByKind(week)
    if (t.shift + t.training + t.study < 4) {
      push('week-plan', voice.manor.headsUp.weekPlan)
    }
  }

  /* ---- 5 · payday passed, no snapshot this month ---- */
  {
    const payday = i.paydayDay > 0 ? i.paydayDay : 1
    const dayOfMonth = nowD.getDate()
    const inWindow = dayOfMonth >= payday && dayOfMonth < payday + 7 // never-begs: a week, then rest
    const monthKey = localDayKey(nowD).slice(0, 7)
    const snapped = i.snapshots.some((s) => localDayKey(s.takenAt).slice(0, 7) === monthKey)
    if (inWindow && !snapped && i.snapshots.length > 0) {
      push('snapshot-nudge', voice.manor.headsUp.snapshotNudge)
    }
  }

  /* ---- 6 · a night watch starts this evening ---- */
  const todayKey = localDayKey(nowD)
  const nightAhead = i.events.some((e) => {
    if (e.kind !== 'shift' || e.allDay) return false
    const start = new Date(e.start)
    return localDayKey(e.start) === todayKey && start.getHours() >= 17 && start.getTime() > i.now
  })
  if (nightAhead) push('night-tonight', voice.manor.headsUp.nightTonight)

  /* ---- 7 · study sessions still awaiting their report ---- */
  const pending = awaitingReport(i.events, i.sessions, i.now)
  if (pending.length > 0) {
    const oldest = Math.min(...pending.map((e) => new Date(e.end).getTime()))
    if (i.now - oldest > 24 * HOUR_MS) {
      push('awaiting-report', voice.manor.headsUp.awaitingReport(pending.length))
    }
  }

  /* ---- 8 · weekly goal short with the week nearly out ---- */
  if (i.weeklyGoal > 0) {
    const weekStartD = startOfWeek(nowD, i.weekStart)
    const daysIn = Math.floor((startOfLocalDay(nowD).getTime() - weekStartD.getTime()) / DAY_MS)
    if (daysIn >= 5) {
      const weekEnd = addDays(weekStartD, 7).getTime()
      const done = i.workouts.filter((w) => {
        const t = new Date(w.performedAt).getTime()
        return !isRun(w) && t >= weekStartD.getTime() && t < weekEnd
      }).length
      if (done <= i.weeklyGoal - 2) {
        push('goal-behind', voice.manor.headsUp.goalBehind({ done, goal: i.weeklyGoal }))
      }
    }
  }

  return { greeting, headsUps: found }
}
