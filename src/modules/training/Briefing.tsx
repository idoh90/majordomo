import { useMemo } from 'react'
import { dayNameLabel } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { BriefingRow } from '../../core/ui/BriefingLedger'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { GroundsBriefingFacts } from '../../core/voice/types'
import { ALL_MUSCLE_IDS, muscleLabel } from './data/muscles'
import { isWorkoutMirror } from './lib/blocks'
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
  variant = 'panel',
}: { strains?: StrainMap; className?: string; variant?: 'panel' | 'row' } = {}) {
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
        !isWorkoutMirror(e) &&
        new Date(e.end).getTime() > now &&
        !claimed.has(e.id),
    )
    .sort((a, b) => a.start.localeCompare(b.start))

  // the freshest group, and how long the body has been left alone. Both are
  // read off the same strain map the heat colours use, so the sentence and the
  // body map can't disagree about which muscle is coldest.
  const coldest = ALL_MUSCLE_IDS.reduce((best, m) => (strains[m] < strains[best] ? m : best))
  const lastAt = workouts.reduce<number | null>((latest, w) => {
    const t = new Date(w.performedAt).getTime()
    return latest === null || t > latest ? t : latest
  }, null)

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
    carbs: macros.carbs,
    fat: macros.fat,
    meals: profile.mealsPerDay,
    isTrainingDay: macros.isTrainingDay,
    sinceLastH: lastAt === null ? null : Math.max(0, (now - lastAt) / 3_600_000),
    // named only when the map has something to rank — with nothing logged every
    // group reads 0 and "chest is your freshest" would be a coin toss
    coldest: hottest && strains[hottest] > 0 ? muscleLabel(coldest) : null,
    nextBlock: ahead[0]
      ? { title: ahead[0].title, dayLabel: dayNameLabel(ahead[0].start, nowDate) }
      : null,
    blocksAhead: ahead.length,
  }

  const p = voice.grounds.briefingPanel
  const said = {
    scope: voice.modules.training.name,
    chips: p.chips(facts),
    headline: p.headline(facts),
    detail: p.detail(facts),
    aside: p.aside(facts),
  }

  return variant === 'row' ? (
    <BriefingRow id="grounds" accent="var(--color-w-grounds)" {...said} />
  ) : (
    <BriefingPanel className={className} accent="var(--color-w-grounds)" {...said} />
  )
}
