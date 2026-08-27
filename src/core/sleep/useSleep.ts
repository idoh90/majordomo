import { useMemo } from 'react'
import { localDayKey, relativeDayLabel } from '../dates'
import { useEventsStore } from '../events/store'
import { useNow } from '../useNow'
import type { SleepBriefingFacts } from '../voice/types'
import { fmtHM, hhmmOfMinutes, recoveryEffect, sleepStats } from './lib'
import { useSleepStore } from './store'
import type { RecoveryEffect, SleepStats } from './types'

/**
 * The hooks every surface reads THE NIGHT through.
 *
 * All of them round `now` to the hour before deriving. Nothing about a night
 * changes minute to minute, the brief's own rule is that its figures must hold
 * still for an hour, and the Manor re-runs the strain engine off whatever this
 * returns — a fresh object every sixty seconds would rebuild sixteen muscle
 * plates and four charts for no new information.
 */

function useHour(): number {
  const now = useNow()
  return Math.floor(now / 3_600_000) * 3_600_000
}

export function useSleepStats(): SleepStats {
  const nowH = useHour()
  const events = useEventsStore((s) => s.events)
  const notes = useSleepStore((s) => s.notes)
  const targetH = useSleepStore((s) => s.targetH)
  return useMemo(() => sleepStats(events, notes, nowH, targetH), [events, notes, nowH, targetH])
}

export function useRecoveryEffect(): RecoveryEffect {
  const stats = useSleepStats()
  const coupling = useSleepStore((s) => s.coupling)
  return useMemo(() => recoveryEffect(stats, coupling), [stats, coupling])
}

/**
 * The one number the strain engine takes.
 *
 * Every caller of computeStrains passes this, and passing it is not optional
 * in the way a default parameter suggests: two surfaces reading the same body
 * through different clocks is exactly the class of bug this codebase keeps
 * writing comments about. It is 1 whenever sleep has nothing to say, so
 * threading it costs a correct estate nothing.
 */
export function useRecoveryScale(): number {
  return useRecoveryEffect().scale
}

/** THE NIGHT's report to the Manor's brief — null when nothing is on file */
export function useSleepBriefingFacts(): SleepBriefingFacts | null {
  const nowH = useHour()
  const stats = useSleepStats()
  const effect = useRecoveryEffect()

  return useMemo(() => {
    if (stats.covered === 0 && !stats.last) return null
    const last = stats.last
    return {
      last: last
        ? {
            hours: last.hours,
            bed: hhmmOfMinutes(last.bed.getHours() * 60 + last.bed.getMinutes()),
            wake: hhmmOfMinutes(last.wake.getHours() * 60 + last.wake.getMinutes()),
            dayLabel: relativeDayLabel(last.wake.toISOString(), new Date(nowH)),
            today: last.dayKey === localDayKey(new Date(nowH)),
          }
        : null,
      avg7H: stats.avg7H,
      covered7: stats.covered7,
      debtH: stats.debtH,
      regularity: stats.regularity,
      driftMin: stats.driftMin,
      targetH: stats.targetH,
      recovery: {
        applied: effect.applied,
        pct: effect.pct,
        covered: effect.covered,
        needed: effect.needed,
        couplingOn: effect.couplingOn,
      },
    }
  }, [stats, effect, nowH])
}

export { fmtHM }
