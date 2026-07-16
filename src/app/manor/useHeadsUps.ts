import { useMemo } from 'react'
import { useEventsStore } from '../../core/events/store'
import { useShellStore } from '../../core/store/shell'
import { useNow } from '../../core/useNow'
import { useWorkoutStore } from '../../modules/training/store'
import { useCapitalStore } from '../../modules/capital/store'
import { useStudyStore } from '../../modules/study/store'
import { computeBriefing } from './headsUps'

/**
 * Gathers every wing's slice for the butler's briefing. Now-relative on
 * purpose — paging the calendar must not change what the butler knows.
 * Recomputes on the minute tick, so lines expire on their own.
 */
export function useHeadsUps(): ReturnType<typeof computeBriefing> {
  const now = useNow()
  const weekStart = useShellStore((s) => s.weekStart)
  const events = useEventsStore((s) => s.events) // committed, never the sandbox
  const workouts = useWorkoutStore((s) => s.workouts)
  const weeklyGoal = useWorkoutStore((s) => s.weeklyGoal)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const paydayDay = useCapitalStore((s) => s.paydayDay)
  const subjects = useStudyStore((s) => s.subjects)
  const exams = useStudyStore((s) => s.exams)
  const sessions = useStudyStore((s) => s.sessions)

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
      }),
    [now, weekStart, events, workouts, weeklyGoal, snapshots, paydayDay, subjects, exams, sessions],
  )
}
