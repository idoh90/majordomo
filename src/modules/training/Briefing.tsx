import { useMemo } from 'react'
import { dayNameLabel } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
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
import { trainNext } from './lib/trainNext'
import { useWorkoutStore } from './store'

/**
 * Strain is recomputed here rather than passed in, but keyed to the hour like
 * everywhere else that samples the model — a minute tick must not re-run
 * sixteen recovery envelopes. Exported as a hook because the Manor's brief
 * writes the same facts into prose.
 */
export function useGroundsBriefingFacts(given?: StrainMap): GroundsBriefingFacts {
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

  // the top of the train-next list — recovered AND behind its trailing week —
  // computed off the same strain map and the same volume model every other
  // surface reads, so the aside can never recommend what the map contradicts
  const nextUp = useMemo(
    () => trainNext(workouts, strains, new Date(nowH), weekStart)[0] ?? null,
    [workouts, strains, nowH, weekStart],
  )

  return {
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
    dietGoal: macros.goal,
    burnKcal: macros.exerciseKcal,
    sinceLastH: lastAt === null ? null : Math.max(0, (now - lastAt) / 3_600_000),
    // named only when the map has something to rank — with nothing logged every
    // group reads 0 and "chest is your freshest" would be a coin toss
    coldest: hottest && strains[hottest] > 0 ? muscleLabel(coldest) : null,
    trainNext: nextUp ? { group: nextUp.label, sets: nextUp.sets, target: nextUp.target } : null,
    nextBlock: ahead[0]
      ? { title: ahead[0].title, dayLabel: dayNameLabel(ahead[0].start, nowDate) }
      : null,
    blocksAhead: ahead.length,
  }
}

/** The Grounds' briefing panel, on its own wing. */
export function GroundsBriefing({
  strains,
  className = '',
}: { strains?: StrainMap; className?: string } = {}) {
  const facts = useGroundsBriefingFacts(strains)
  const p = voice.grounds.briefingPanel

  return (
    <BriefingPanel
      className={className}
      accent="var(--color-w-grounds)"
      scope={voice.modules.training.name}
      chips={p.chips(facts)}
      headline={p.headline(facts)}
      detail={p.detail(facts)}
      aside={p.aside(facts)}
    />
  )
}
