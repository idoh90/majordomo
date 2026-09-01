import { useMemo } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { useEventsStore } from '../../core/events/store'
import { useSleepStore } from '../../core/sleep/store'
import { useShellStore } from '../../core/store/shell'
import { offReason } from '../../core/sync/gate'
import { useSyncStore } from '../../core/sync/store'
import { useNow } from '../../core/useNow'
import { useWorkoutStore } from '../../modules/training/store'
import { useCapitalStore } from '../../modules/capital/store'
import { useStudyStore } from '../../modules/study/store'
import { useWorkshopStore } from '../../modules/workshop/store'
import { useButlerStore } from '../butler/store'
import { useGcalStore } from '../gcal/store'
import { computeBriefing } from './headsUps'

/**
 * Gathers every wing's slice for the butler's briefing. Now-relative on
 * purpose — paging the calendar must not change what the butler knows.
 * Recomputes on the minute tick, so lines expire on their own.
 *
 * It gathers more than the Manor's strip prints, because THE VALET reads the
 * same result: the strip takes the first two of its own eight, the bubble
 * takes the loudest of everything. One computation, two surfaces — the
 * alternative is two engines that eventually disagree in front of the reader.
 */
export function useHeadsUps(): ReturnType<typeof computeBriefing> {
  const now = useNow()
  const weekStart = useShellStore((s) => s.weekStart)
  const wingsOff = useShellStore((s) => s.wingsOff)
  const events = useEventsStore((s) => s.events) // committed, never the sandbox
  const workouts = useWorkoutStore((s) => s.workouts)
  const weeklyGoal = useWorkoutStore((s) => s.weeklyGoal)

  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const apiKey = useCapitalStore((s) => s.apiKey)
  const pricesError = useCapitalStore((s) => s.pricesError)
  const paydayDay = useCapitalStore((s) => s.paydayDay)

  const subjects = useStudyStore((s) => s.subjects)
  const exams = useStudyStore((s) => s.exams)
  const sessions = useStudyStore((s) => s.sessions)
  const homework = useStudyStore((s) => s.homework)

  const ventures = useWorkshopStore((s) => s.ventures)
  const milestones = useWorkshopStore((s) => s.milestones)
  const cards = useWorkshopStore((s) => s.cards)
  const workshopSessions = useWorkshopStore((s) => s.sessions)
  const workEntries = useWorkshopStore((s) => s.workEntries)
  const bench = useWorkshopStore((s) => s.bench)

  const needsReconnect = useGcalStore((s) => s.needsReconnect)
  const connected = useGcalStore((s) => s.connected)
  const syncChoicePending = useSyncStore((s) => s.pendingChoice !== null)
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const morningPrompt = useSleepStore((s) => s.morningPrompt)
  const introduced = useButlerStore((s) => s.introduced)

  return useMemo(
    () =>
      computeBriefing({
        now,
        weekStart,
        events,
        workouts,
        weeklyGoal,
        snapshots,
        paydayDay,
        subjects,
        exams,
        sessions,
        homework,
        milestones,
        cards,
        ventures,
        workshopSessions,
        workEntries,
        bench,
        accounts,
        holdings,
        prices,
        fx,
        hasPricesKey: apiKey !== '',
        pricesError,
        gcal: {
          needsReconnect,
          connected: connected !== null,
          // the registry's own gate: a shut door (?demo, unconfigured, no
          // storage) means there is nothing to offer connecting to
          available: offReason() === null,
        },
        syncChoicePending,
        signedIn,
        morningPrompt,
        wingsOff,
        introduced,
      }),
    [
      now,
      weekStart,
      events,
      workouts,
      weeklyGoal,
      snapshots,
      paydayDay,
      subjects,
      exams,
      sessions,
      homework,
      milestones,
      cards,
      ventures,
      workshopSessions,
      workEntries,
      bench,
      accounts,
      holdings,
      prices,
      fx,
      apiKey,
      pricesError,
      needsReconnect,
      connected,
      syncChoicePending,
      signedIn,
      morningPrompt,
      wingsOff,
      introduced,
    ],
  )
}
