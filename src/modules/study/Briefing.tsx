import { dayNameLabel, localDayKey } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { StudyBriefingFacts } from '../../core/voice/types'
import {
  awaitingReport,
  bookedHoursBeforeExam,
  daysUntil,
  examProgress,
  nextExam,
  studyStats,
  subjectOfEvent,
} from './lib'
import { useStudyStore } from './store'

/**
 * The Study's facts.
 *
 * The exam clause deliberately reports two different figures side by side:
 * hours already DONE toward the exam (examProgress) and hours still SCHEDULED
 * before it (bookedHoursBeforeExam). They are answers to different questions,
 * and the estate's worst contradiction to date came from printing one where
 * the other belonged — so both are named in words rather than collapsed into
 * a single "on the books". A hook because the Manor's brief writes the same
 * facts into prose.
 */
export function useStudyBriefingFacts(): StudyBriefingFacts {
  const events = useEventsStore((s) => s.events)
  const subjects = useStudyStore((s) => s.subjects)
  const sessions = useStudyStore((s) => s.sessions)
  const homework = useStudyStore((s) => s.homework)
  const exams = useStudyStore((s) => s.exams)
  const topics = useStudyStore((s) => s.topics)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const active = subjects.filter((s) => !s.archived)
  const stats = studyStats(events, sessions, subjects, now, weekStart)
  const next = nextExam(exams, now)
  const nowDate = new Date(now)

  const weekEndKey = localDayKey(stats.weekEnd)
  const dueCount = homework.filter((h) => !h.done && h.due && h.due < weekEndKey).length

  // scope the syllabus figure to the subject the headline is already talking
  // about. Averaged over every subject it sat next to the Dossier's own
  // per-subject bar reading a different number, which is exactly the kind of
  // disagreement the estate is not allowed to have.
  const scoped = next ? topics.filter((t) => t.subjectId === next.subjectId) : topics
  const covered = scoped.filter((t) => t.covered).length

  const upcoming = events
    .filter((e) => e.kind === 'study' && !e.allDay && new Date(e.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  return {
    fulfilledH: stats.totalFulfilled,
    bookedH: stats.totalBooked,
    goalH: active.reduce((t, s) => t + s.goalH, 0),
    exam: next
      ? {
          subject: subjects.find((s) => s.id === next.subjectId)?.name ?? '—',
          days: daysUntil(next.on, now),
          doneH: examProgress(next, events, sessions),
          aheadH: bookedHoursBeforeExam(next, events, now),
        }
      : null,
    awaiting: awaitingReport(events, sessions, now).length,
    dueCount,
    syllabusPct: scoped.length > 0 ? Math.round((covered / scoped.length) * 100) : null,
    syllabusSubject: next
      ? (subjects.find((s) => s.id === next.subjectId)?.name ?? null)
      : null,
    nextSession: upcoming
      ? {
          subject:
            subjects.find((s) => s.id === subjectOfEvent(upcoming))?.name ?? upcoming.title,
          dayLabel: dayNameLabel(upcoming.start, nowDate),
        }
      : null,
    subjectCount: active.length,
    // scoped exactly as syllabusPct is — a count taken over one set and a
    // percentage taken over another would be two answers to one question
    topicsLeft: scoped.length > 0 ? scoped.length - covered : null,
  }
}

/** The Study's briefing panel, on its own wing. */
export function StudyBriefing({ className = '' }: { className?: string } = {}) {
  const facts = useStudyBriefingFacts()
  const p = voice.study.briefingPanel

  return (
    <BriefingPanel
      className={className}
      accent="var(--color-w-study)"
      scope={voice.modules.study.name}
      chips={p.chips(facts)}
      headline={p.headline(facts)}
      detail={p.detail(facts)}
      aside={p.aside(facts)}
    />
  )
}
