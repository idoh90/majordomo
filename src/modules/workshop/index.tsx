import { useEffect } from 'react'
import type { ConsoleModule } from '../../core/module'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { voice } from '../../core/voice'
import { useAuthStore } from '../../core/auth/store'
import { daysUntil, nextMilestone, reconcileMarkers, workLedgerPatch, workshopStats } from './lib'
import { useWorkshopStore } from './store'
import { WorkshopScreen } from './WorkshopScreen'

/** Tile stat: countdown to the next milestone, else bench hours this week. */
function Tile() {
  const events = useEventsStore((s) => s.events)
  const ventures = useWorkshopStore((s) => s.ventures)
  const sessions = useWorkshopStore((s) => s.sessions)
  const milestones = useWorkshopStore((s) => s.milestones)
  const workEntries = useWorkshopStore((s) => s.workEntries)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const live = new Set(ventures.filter((v) => !v.archived).map((v) => v.id))
  const next = nextMilestone(milestones.filter((m) => live.has(m.ventureId)))
  if (next) {
    return (
      <>
        <span className="stat-num text-2xl leading-tight text-ink">
          {voice.workshop.countdown(daysUntil(next.on, now))}
        </span>
        <span className="block text-[11px] leading-tight text-ink-faint">
          {voice.workshop.tileNextMs}
        </span>
      </>
    )
  }
  const stats = workshopStats(events, sessions, ventures, now, weekStart, workEntries)
  return (
    <>
      <span className="stat-num text-2xl leading-tight text-ink">
        {stats.totalFulfilled.toFixed(1)} h
      </span>
      <span className="block text-[11px] leading-tight text-ink-faint">
        {voice.workshop.tileWeek}
      </span>
    </>
  )
}

/** The marker reconcile: it mounts wherever the Manor renders, so milestone
 *  and delivery chips heal and overdue ones trail to today even if the wing
 *  is never opened. */
function Upkeep() {
  useEffect(() => {
    const store = useEventsStore.getState()
    const ws = useWorkshopStore.getState()
    reconcileMarkers(ws.milestones, ws.cards, Date.now())
    if (!store.sandbox) {
      ws.pruneSessions(store.events.map((e) => e.id))
      const patch = workLedgerPatch(
        store.events,
        ws.sessions,
        ws.ventures,
        ws.workEntries,
        useAuthStore.getState().userId,
      )
      if (Object.keys(patch).length > 0) ws.upsertWorkEntries(patch)
    }
  }, [])

  return null
}

function Icon() {
  // a spanner over the bench
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.5 6.5a4 4 0 0 1 5-3.9l-2.7 2.7 2 2 2.7-2.7a4 4 0 0 1-4.9 5L8.4 17.8a2 2 0 1 1-2.8-2.8l8.9-8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const workshopConsole: ConsoleModule = {
  id: 'workshop',
  name: voice.modules.workshop.name,
  status: 'online',
  tagline: voice.modules.workshop.tagline,
  Icon,
  Tile,
  Screen: WorkshopScreen,
  Upkeep,
}
