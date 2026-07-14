import type { Workout } from '../../types'
import { dailyTargets, proteinPerMeal, weeklyProtein } from '../../lib/nutrition'
import { useWorkoutStore } from '../../store'

interface NutritionCardProps {
  workouts: Workout[]
  now: number
}

// meat-diet nudges (spec Part 5) — rotate deterministically by day so it's stable
const TIPS = [
  'Mostly-meat diet: add a piece of fruit today for vitamin C + potassium.',
  'Add a starch (potato, rice, oats) on training days to hit your carbs.',
  'Greek yogurt or milk covers calcium the meat is missing.',
  'Liver once a week fills the folate & vitamin-A gaps — no veg required.',
  'Low on fiber? Oats or a fiber supplement closes the gap gently.',
  'Been a while? A periodic lipid panel (LDL/ApoB) is worth it on red meat.',
]

// per-skin macro colors, declared in index.css skin bundles
const MACRO_COLORS = {
  protein: 'var(--macro-protein)',
  carbs: 'var(--macro-carbs)',
  fat: 'var(--macro-fat)',
}

export function NutritionCard({ workouts, now }: NutritionCardProps) {
  const profile = useWorkoutStore((s) => s.profile)
  const nowDate = new Date(now)
  const t = dailyTargets(profile, workouts, nowDate)
  const perMeal = proteinPerMeal(profile)
  const weekProtein = weeklyProtein(profile)

  const pKcal = t.protein * 4
  const cKcal = t.carbs * 4
  const fKcal = t.fat * 9
  const totalKcal = Math.max(1, pKcal + cKcal + fKcal)

  const dayOfYear = Math.floor(
    (nowDate.getTime() - new Date(nowDate.getFullYear(), 0, 0).getTime()) / 86_400_000,
  )
  const tip = TIPS[dayOfYear % TIPS.length]

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="card-title">Fuel · Today</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="stat-num text-3xl leading-none text-ink">
              {t.calories.toLocaleString()}
            </span>
            <span className="text-sm text-ink-faint">kcal</span>
          </div>
        </div>
        <span
          className={`chip border px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] ${
            t.isTrainingDay
              ? 'border-accent/60 text-accent'
              : 'border-line text-ink-faint'
          }`}
        >
          {t.isTrainingDay ? 'Training day' : 'Rest day'}
        </span>
      </div>

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

      <div className="mt-3 border-t border-line pt-2.5 text-xs text-ink-dim">
        <span className="text-ink">{perMeal} g</span> protein × {profile.mealsPerDay} meals ·{' '}
        <span className="text-ink">{weekProtein.toLocaleString()} g</span> this week
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{tip}</p>
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
