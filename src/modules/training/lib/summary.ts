import { isRun, type MuscleId, type Workout } from '../types'
import { ALL_MUSCLE_IDS, MUSCLES, PPL_LABELS } from '../data/muscles'
import type { StrainMap } from './strain'
import { repStyleOf } from './strain'
import { REP_STYLES } from './strain'
import { dailyTargets, proteinGrams, proteinPerMeal, weeklyProtein, type Profile } from './nutrition'
import { relativeDayLabel, type WeekStart } from '../../../core/dates'
import { thisWeekCount, thisWeekRuns } from './insights'

export interface DailySummary {
  workoutsLine: string
  strainLine: string
  proteinLine: string
  fuelLine: string
}

const BIG_MUSCLES: MuscleId[] = ['quads', 'hamstrings', 'glutes', 'lats', 'chest', 'lower-back']

function describeLastWorkout(workouts: Workout[], now: number): string {
  const last = workouts[0] // store keeps newest first
  if (!last) return ''
  const when = relativeDayLabel(last.performedAt, new Date(now))
  const whenLabel =
    when === 'Today' || when === 'Yesterday' ? when.toLowerCase() : `on ${when}`
  if (isRun(last)) {
    const km = last.run?.distanceKm
    return ` — last out was a ${km ? `${km} km ` : ''}run ${whenLabel}`
  }
  const kind = last.ppl ? PPL_LABELS[last.ppl] : 'custom'
  const style = repStyleOf(last)
  const styleWord = style === 'mixed' ? '' : `${REP_STYLES[style].title.toLowerCase()} `
  return ` — last was a ${styleWord}${kind} session ${whenLabel}`
}

function describeStrain(strains: StrainMap): string {
  const ranked = [...ALL_MUSCLE_IDS].sort((a, b) => strains[b] - strains[a])
  const max = strains[ranked[0]]
  if (max < 1.5) return 'Everything is recovered and ready to train.'

  const hotCount = ALL_MUSCLE_IDS.filter((m) => strains[m] >= 6).length
  const word = hotCount >= 4 ? 'high' : hotCount >= 1 ? 'moderate' : 'light'

  const hottest = ranked.filter((m) => strains[m] >= 4).slice(0, 2).map((m) => MUSCLES[m].label)
  const fresh = BIG_MUSCLES.filter((m) => strains[m] < 1.5)
    .slice(0, 2)
    .map((m) => MUSCLES[m].label)

  const parts = [`Overall strain is ${word}`]
  if (hottest.length) parts.push(`${hottest.join(' and ')} ${hottest.length > 1 ? 'are' : 'is'} still firing`)
  if (fresh.length) parts.push(`${fresh.join(' and ')} ${fresh.length > 1 ? 'are' : 'is'} fresh`)
  return parts.join(' — ').replace(/ — ([^—]*)$/, ', $1') + '.'
}

export function buildDailySummary(
  workouts: Workout[],
  strains: StrainMap,
  now: number,
  profile: Profile,
  weekStart?: WeekStart,
): DailySummary {
  const weekCount = thisWeekCount(workouts, new Date(now), weekStart)
  const protein = proteinGrams(profile)
  const perMeal = proteinPerMeal(profile)
  const week = weeklyProtein(profile)
  const macros = dailyTargets(profile, workouts, new Date(now))

  const runCount = thisWeekRuns(workouts, new Date(now), weekStart)
  const runsPart = runCount ? ` (plus ${runCount} run${runCount === 1 ? '' : 's'})` : ''

  const workoutsLine =
    workouts.length === 0
      ? 'No workouts logged yet — add your first to start tracking strain and fuel.'
      : `${weekCount} workout${weekCount === 1 ? '' : 's'} logged this week${runsPart}${describeLastWorkout(workouts, now)}.`

  const strainLine = workouts.length === 0 ? '' : describeStrain(strains)

  const proteinLine = `Protein holds steady at ${protein} g/day (${perMeal} g across ${profile.mealsPerDay} meals) — that's ${protein} g today and about ${week.toLocaleString()} g over the week.`

  const fuelLine = macros.isTrainingDay
    ? `Today is a training day, so fuel it: aim ~${macros.calories.toLocaleString()} kcal with ~${macros.carbs} g carbs and ~${macros.fat} g fat.`
    : `Today is a rest day: ~${macros.calories.toLocaleString()} kcal, ~${macros.carbs} g carbs, ~${macros.fat} g fat.`

  return { workoutsLine, strainLine, proteinLine, fuelLine }
}
