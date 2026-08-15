import { useState } from 'react'
import { isRun, isSport, type Workout } from '../../types'
import { dailyTargets, weekOutlook, workoutKcal } from '../../lib/nutrition'
import { formatKm } from '../../lib/runs'
import { sportLabel } from '../../data/sports'
import { useWorkoutStore } from '../../store'
import { localDayKey } from '../../../../core/dates'
import { Hinted } from '../../../../core/ui/Hint'
import { voice } from '../../../../core/voice'
import { ProfileSheet } from '../ProfileSheet'

interface NutritionCardProps {
  workouts: Workout[]
  now: number
}

// the meat-diet notes live in the voice pack now (see majordomo-nutrition-spec.md
// for what the engine behind this card actually computes); they still rotate
// deterministically by day so the card is stable across a session
// per-skin macro colors, declared in index.css skin bundles
const MACRO_COLORS = {
  protein: 'var(--macro-protein)',
  carbs: 'var(--macro-carbs)',
  fat: 'var(--macro-fat)',
}

/** how a logged session names itself on the fuel card — the run's distance is
 *  worth printing, since it is the figure its calories were priced from */
function sessionLabel(w: Workout): string {
  if (isRun(w)) {
    const base = voice.grounds.loggedBlockTitle({ ppl: null, run: true, sport: null })
    return w.run?.distanceKm ? `${base} ${formatKm(w.run.distanceKm)} km` : base
  }
  if (isSport(w)) return sportLabel(w)
  return voice.grounds.loggedBlockTitle({ ppl: w.ppl ?? null, run: false, sport: null })
}

/** at most this many sessions are itemised before the card stops listing */
const MAX_SESSION_LINES = 3

export function NutritionCard({ workouts, now }: NutritionCardProps) {
  const profile = useWorkoutStore((s) => s.profile)
  // ?sheet=profile — dev screenshot aid, the same lazy-initializer pattern the
  // settings screen uses for ?sheet=skin
  const [profileOpen, setProfileOpen] = useState(
    () =>
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('sheet') === 'profile',
  )
  const nowDate = new Date(now)
  const t = dailyTargets(profile, workouts, nowDate)
  // today's protein over today's meals — the ladder moves this, so a flat
  // figure would disagree with the number printed directly above it
  const perMeal = Math.round(t.protein / Math.max(1, profile.mealsPerDay))
  const week = weekOutlook(profile, workouts, nowDate)

  const todayKey = localDayKey(nowDate)
  const todays = workouts.filter((w) => localDayKey(w.performedAt) === todayKey)

  const pKcal = t.protein * 4
  const cKcal = t.carbs * 4
  const fKcal = t.fat * 9
  const totalKcal = Math.max(1, pKcal + cKcal + fKcal)

  const dayOfYear = Math.floor(
    (nowDate.getTime() - new Date(nowDate.getFullYear(), 0, 0).getTime()) / 86_400_000,
  )
  const tips = voice.grounds.fuelTips
  const tip = tips[dayOfYear % tips.length]

  return (
    <div className="panel p-4">
      <Hinted tip={voice.hints.grounds.fuel}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="card-title">{voice.grounds.fuelTitle}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="stat-num text-3xl leading-none text-ink">
              {t.calories.toLocaleString()}
            </span>
            <span className="text-sm text-ink-faint">kcal</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap justify-end gap-1.5">
            <span className="chip border border-line px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-ink-dim">
              {voice.grounds.fuelGoalChip[t.goal]}
            </span>
            <span
              className={`chip border px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
                t.isTrainingDay
                  ? 'border-accent/60 text-accent'
                  : 'border-line text-ink-faint'
              }`}
            >
              {t.isTrainingDay ? voice.grounds.fuelTrainingDay : voice.grounds.fuelRestDay}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="chip border border-line px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint transition-colors hover:border-accent/50 hover:text-accent"
          >
            {voice.grounds.fuelProfileButton}
          </button>
        </div>
      </div>
      </Hinted>

      {/* stacked macro bar (share of calories) */}
      <div className="chip mt-3 flex h-2 overflow-hidden bg-panel-2">
        <div style={{ width: `${(pKcal / totalKcal) * 100}%`, background: MACRO_COLORS.protein }} />
        <div style={{ width: `${(cKcal / totalKcal) * 100}%`, background: MACRO_COLORS.carbs }} />
        <div style={{ width: `${(fKcal / totalKcal) * 100}%`, background: MACRO_COLORS.fat }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Macro label="Protein" grams={t.protein} color={MACRO_COLORS.protein} />
        <Macro label="Carbs" grams={t.carbs} color={MACRO_COLORS.carbs} />
        <Macro label="Fat" grams={t.fat} color={MACRO_COLORS.fat} />
      </div>

      {/* what the day's own training put on the plate — the whole reason these
          figures differ from yesterday's */}
      {t.exerciseKcal > 0 && (
        <div className="mt-3 border-t border-line pt-2.5">
          <div className="text-xs text-ink-dim">
            {voice.grounds.fuelBurn({ kcal: t.exerciseKcal })}
          </div>
          <ul className="mt-1 space-y-0.5">
            {todays.slice(0, MAX_SESSION_LINES).map((w) => (
              <li key={w.id} className="text-xs text-ink-faint">
                {voice.grounds.fuelSession({
                  label: sessionLabel(w),
                  kcal: Math.round(workoutKcal(w, profile)),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-line pt-2.5 text-xs text-ink-dim">
        {voice.grounds.fuelPerMeal({ grams: perMeal, meals: profile.mealsPerDay })}
      </div>
      <div className="mt-0.5 text-xs text-ink-faint">
        {voice.grounds.fuelWeek({ avgKcal: week.avgCalories, days: week.trainingDays })}
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{tip}</p>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </span>
      </div>
      <div className="stat-num mt-0.5 text-lg text-ink">
        {grams}
        <span className="ml-0.5 text-xs font-medium text-ink-faint">g</span>
      </div>
    </div>
  )
}
