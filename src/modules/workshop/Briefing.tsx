import { dayNameLabel } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { BriefingRow } from '../../core/ui/BriefingLedger'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { WorkshopBriefingFacts } from '../../core/voice/types'
import {
  awaitingReport,
  daysSinceTouched,
  daysUntil,
  milestoneProgress,
  nextMilestone,
  taskProgress,
  ventureOfEvent,
  workshopStats,
} from './lib'
import { useWorkshopStore } from './store'

/**
 * The Workshop's briefing. The headline leads with the live bench when the
 * clock is running (nothing on the estate outranks a clock that is currently
 * counting), then the nearest milestone, then the weekly standing.
 */
export function WorkshopBriefing({
  className = '',
  variant = 'panel',
}: { className?: string; variant?: 'panel' | 'row' } = {}) {
  const events = useEventsStore((s) => s.events)
  const ventures = useWorkshopStore((s) => s.ventures)
  const sessions = useWorkshopStore((s) => s.sessions)
  const milestones = useWorkshopStore((s) => s.milestones)
  const cards = useWorkshopStore((s) => s.cards)
  const bench = useWorkshopStore((s) => s.bench)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const active = ventures.filter((v) => !v.archived)
  const stats = workshopStats(events, sessions, ventures, now, weekStart)

  const liveIds = new Set(active.map((v) => v.id))
  const next = nextMilestone(milestones.filter((m) => liveIds.has(m.ventureId)))
  const nameOf = (id: string) => ventures.find((v) => v.id === id)?.name ?? '—'

  // the longest-quiet BUILDING venture — sparks and shipped work owe no hours
  let quiet: WorkshopBriefingFacts['quiet'] = null
  for (const v of active) {
    if (v.status !== 'building') continue
    const d = daysSinceTouched(events, sessions, v.id, now)
    if (d !== null && d >= 7 && (!quiet || d > quiet.days)) quiet = { venture: v.name, days: d }
  }

  const upcoming = events
    .filter((e) => e.kind === 'workshop' && !e.allDay && new Date(e.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  const facts: WorkshopBriefingFacts = {
    fulfilledH: stats.totalFulfilled,
    bookedH: stats.totalBooked,
    goalH: active.filter((v) => v.status !== 'shipped').reduce((t, v) => t + v.goalH, 0),
    milestone: next
      ? {
          venture: nameOf(next.ventureId),
          title: next.title,
          days: daysUntil(next.on, now),
          towardH: milestoneProgress(next, events, sessions),
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

  const p = voice.workshop.briefingPanel
  const said = {
    scope: voice.modules.workshop.name,
    chips: p.chips(facts),
    headline: p.headline(facts),
    detail: p.detail(facts),
    aside: p.aside(facts),
  }

  return variant === 'row' ? (
    <BriefingRow id="workshop" accent="var(--color-w-workshop)" {...said} />
  ) : (
    <BriefingPanel className={className} accent="var(--color-w-workshop)" {...said} />
  )
}
