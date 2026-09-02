import { dayNameLabel } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { WorkshopBriefingFacts } from '../../core/voice/types'
import {
  awaitingReport,
  daysUntil,
  milestoneProgress,
  nextMilestone,
  quietVenture,
  taskProgress,
  ventureOfEvent,
  workshopStats,
} from './lib'
import { useWorkshopStore } from './store'

/**
 * The Workshop's facts. The headline leads with the live bench when the clock
 * is running (nothing on the estate outranks a clock that is currently
 * counting), then the nearest milestone, then the weekly standing. A hook
 * because the Manor's brief writes the same facts into prose.
 */
export function useWorkshopBriefingFacts(): WorkshopBriefingFacts {
  const events = useEventsStore((s) => s.events)
  const ventures = useWorkshopStore((s) => s.ventures)
  const sessions = useWorkshopStore((s) => s.sessions)
  const milestones = useWorkshopStore((s) => s.milestones)
  const cards = useWorkshopStore((s) => s.cards)
  const bench = useWorkshopStore((s) => s.bench)
  const workEntries = useWorkshopStore((s) => s.workEntries)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const active = ventures.filter((v) => !v.archived)
  const stats = workshopStats(events, sessions, ventures, now, weekStart, workEntries)

  const liveIds = new Set(active.map((v) => v.id))
  const next = nextMilestone(milestones.filter((m) => liveIds.has(m.ventureId)))
  const nameOf = (id: string) => ventures.find((v) => v.id === id)?.name ?? '—'

  // the longest-quiet BUILDING venture — sparks and shipped work owe no hours
  const quietest = quietVenture(events, sessions, active, now, workEntries)
  const quiet: WorkshopBriefingFacts['quiet'] = quietest
    ? { venture: quietest.venture.name, days: quietest.days }
    : null

  const upcoming = events
    .filter((e) => e.kind === 'workshop' && !e.allDay && new Date(e.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  return {
    fulfilledH: stats.totalFulfilled,
    bookedH: stats.totalBooked,
    goalH: active.filter((v) => v.status !== 'shipped').reduce((t, v) => t + v.goalH, 0),
    milestone: next
      ? {
          venture: nameOf(next.ventureId),
          title: next.title,
          days: daysUntil(next.on, now),
          towardH: milestoneProgress(next, events, sessions, ventures, workEntries),
        }
      : null,
    awaiting: awaitingReport(events, sessions, now).length,
    ventureCount: active.length,
    tasks: (() => {
      let done = 0
      let total = 0
      for (const v of active) {
        const p = taskProgress(cards, v.id)
        done += p.done
        total += p.total
      }
      return total > 0 ? { done, total } : null
    })(),
    benchLive: bench ? { venture: nameOf(bench.ventureId) } : null,
    quiet,
    nextSession: upcoming
      ? {
          venture: nameOf(ventureOfEvent(upcoming) ?? '') === '—'
            ? upcoming.title
            : nameOf(ventureOfEvent(upcoming) ?? ''),
          dayLabel: dayNameLabel(upcoming.start, new Date(now)),
        }
      : null,
  }
}

/** The Workshop's briefing panel, on its own wing. */
export function WorkshopBriefing({ className = '' }: { className?: string } = {}) {
  const facts = useWorkshopBriefingFacts()
  const p = voice.workshop.briefingPanel

  return (
    <BriefingPanel
      className={className}
      accent="var(--color-w-workshop)"
      scope={voice.modules.workshop.name}
      chips={p.chips(facts)}
      headline={p.headline(facts)}
      detail={p.detail(facts)}
      aside={p.aside(facts)}
    />
  )
}
