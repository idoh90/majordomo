import { useMemo } from 'react'
import { dayNameLabel } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { GroundsBriefingFacts } from '../../core/voice/types'
import { ALL_MUSCLE_IDS, muscleLabel } from './data/muscles'
import { linkedEventIds } from './lib/fulfillment'
import { thisWeekCount } from './lib/insights'
import { dailyTargets } from './lib/nutrition'
import { HOT_THRESHOLD } from './lib/recovery'
import { computeStrains, readiness, type StrainMap } from './lib/strain'
import { useWorkoutStore } from './store'

/**
 * The Grounds' briefing. Strain is recomputed here rather than passed in, but
 * keyed to the hour like everywhere else that samples the model — a minute
 * tick must not re-run sixteen recovery envelopes, and this strip renders on
 * the Manor as well as on its own wing.
 */
export function GroundsBriefing({
  strains: given,
  className = '',
}: { strains?: StrainMap; className?: string } = {}) {
  const workouts = useWorkoutStore((s) => s.workouts)
  const weeklyGoal = useWorkoutStore((s) => s.weeklyGoal)
  const profile = useWorkoutStore((s) => s.profile)
  const events = useEventsStore((s) => s.events)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const own = useMemo(() => computeStrains(workouts, nowH), [workouts, nowH])
  const strains = given ?? own

  const nowDate = new Date(now)
  const hotIds = ALL_MUSCLE_IDS.filter((m) => strains[m] >= HOT_THRESHOLD)
  const hottest = ALL_MUSCLE_IDS.reduce(
    (best, m) => (strains[m] > (best ? strains[best] : 0) ? m : best),
    null as (typeof ALL_MUSCLE_IDS)[number] | null,
  )
  const macros = dailyTargets(profile, workouts, nowDate)

  // the next training block still on the books, minus any a logged workout
  // has already claimed
  const claimed = linkedEventIds(workouts)
  const ahead = events
    .filter(
      (e) =>
        e.kind === 'training' &&
        !e.allDay &&
        new Date(e.end).getTime() > now &&
        !claimed.has(e.id),
    )
    .sort((a, b) => a.start.localeCompare(b.start))

  const facts: GroundsBriefingFacts = {
    done: thisWeekCount(workouts, nowDate, weekStart),
    goal: weeklyGoal,
    hot: hotIds.length,
    muscles: ALL_MUSCLE_IDS.length,
    top:
      hottest && strains[hottest] > 0
        ? { name: muscleLabel(hottest), strain: strains[hottest] }
        : null,
    readiness: readiness(strains),
    kcal: macros.calories,
    protein: macros.protein,
    meals: profile.mealsPerDay,
    isTrainingDay: macros.isTrainingDay,
    nextBlock: ahead[0]
      ? { title: ahead[0].title, dayLabel: dayNameLabel(ahead[0].start, nowDate) }
      : null,
    blocksAhead: ahead.length,
  }

  return (
    <BriefingPanel
      className={className}
      accent="var(--color-w-grounds)"
      scope={voice.modules.training.name}
      chips={voice.grounds.briefingPanel.chips(facts)}
      headline={voice.grounds.briefingPanel.headline(facts)}
      detail={voice.grounds.briefingPanel.detail(facts)}
    />
  )
}
