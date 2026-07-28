import { useMemo } from 'react'
import { useEventsStore } from '../../core/events/store'
import { useShellStore } from '../../core/store/shell'
import { useNow } from '../../core/useNow'
import { useCapitalStore } from '../../modules/capital/store'
import { formatILS } from '../../modules/capital/lib/money'
import { useStudyStore } from '../../modules/study/store'
import { useWorkoutStore } from '../../modules/training/store'
import { computeHouse, type HouseModel } from './house'

/**
 * Gathers every wing's slice for the House rail.
 *
 * Keyed to the HOUR, not the minute. computeHouse walks eight weeks of events
 * for two wings, eight weeks of study sessions, six months of spend and the
 * whole workout history through the strain model — none of which can change
 * inside a minute, and all of which would otherwise re-run on every tick of
 * the clock in the header.
 */
export function useHouse(): HouseModel {
  const now = useNow()
  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const weekStart = useShellStore((s) => s.weekStart)
  const events = useEventsStore((s) => s.events) // committed, never the sandbox
  const workouts = useWorkoutStore((s) => s.workouts)
  const weeklyGoal = useWorkoutStore((s) => s.weeklyGoal)
  const subjects = useStudyStore((s) => s.subjects)
  const sessions = useStudyStore((s) => s.sessions)
  const exams = useStudyStore((s) => s.exams)
  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)

  return useMemo(
    () =>
      computeHouse({
        now,
        nowH,
        weekStart,
        events,
        workouts,
        weeklyGoal,
        subjects,
        sessions,
        exams,
        accounts,
        snapshots,
        holdings,
        prices,
        fx,
        spends,
        spendItems,
        recurring,
        monthlyBudget,
        formatMoney: (n) => formatILS(n),
      }),
    // `now` is deliberately absent from these deps: nowH is the gate, and
    // including the raw clock would defeat the whole point of rounding it.
    // The only thing `now` feeds is a handful of "is this ahead of me" tests
    // that cannot change meaningfully inside an hour.
    [
      nowH,
      weekStart,
      events,
      workouts,
      weeklyGoal,
      subjects,
      sessions,
      exams,
      accounts,
      snapshots,
      holdings,
      prices,
      fx,
      spends,
      spendItems,
      recurring,
      monthlyBudget,
    ],
  )
}
