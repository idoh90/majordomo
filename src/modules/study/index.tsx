import type { ConsoleModule } from '../../core/module'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { voice } from '../../core/voice'
import { daysUntil, nextExam, studyStats } from './lib'
import { useStudyStore } from './store'
import { StudyScreen } from './StudyScreen'

/** Tile stat: countdown to the next examination, else hours read this week. */
function Tile() {
  const events = useEventsStore((s) => s.events)
  const subjects = useStudyStore((s) => s.subjects)
  const sessions = useStudyStore((s) => s.sessions)
  const exams = useStudyStore((s) => s.exams)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const next = nextExam(exams, now)
  if (next) {
    return (
      <>
        <span className="stat-num text-2xl leading-tight text-ink">
          {voice.study.countdown(daysUntil(next.on, now))}
        </span>
        <span className="block text-[11px] leading-tight text-ink-faint">
          {voice.study.tileUntilExam}
        </span>
      </>
    )
  }
  const stats = studyStats(events, sessions, subjects, now, weekStart)
  return (
    <>
      <span className="stat-num text-2xl leading-tight text-ink">
        {stats.totalFulfilled.toFixed(1)} h
      </span>
      <span className="block text-[11px] leading-tight text-ink-faint">
        {voice.study.tileWeekRead}
      </span>
    </>
  )
}

function Icon() {
  // an open book
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 6.5C10.5 5 8.2 4.5 5.5 4.5c-.8 0-1.5.1-2 .2V18c.5-.1 1.2-.2 2-.2 2.7 0 5 .5 6.5 2 1.5-1.5 3.8-2 6.5-2 .8 0 1.5.1 2 .2V4.7c-.5-.1-1.2-.2-2-.2-2.7 0-5 .5-6.5 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 6.5v13" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export const studyConsole: ConsoleModule = {
  id: 'study',
  name: voice.modules.study.name,
  status: 'online',
  tagline: voice.modules.study.tagline,
  Icon,
  Tile,
  Screen: StudyScreen,
}
