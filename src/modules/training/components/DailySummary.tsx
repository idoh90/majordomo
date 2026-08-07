import type { Workout } from '../types'
import type { StrainMap } from '../lib/strain'
import { buildDailySummary } from '../lib/summary'
import { useWorkoutStore } from '../store'
import { useShellStore } from '../../../core/store/shell'
import { Hinted } from '../../../core/ui/Hint'
import { voice } from '../../../core/voice'

interface DailySummaryProps {
  workouts: Workout[]
  strains: StrainMap
  now: number
}

export function DailySummary({ workouts, strains, now }: DailySummaryProps) {
  const profile = useWorkoutStore((s) => s.profile)
  const weekStart = useShellStore((s) => s.weekStart)
  const s = buildDailySummary(workouts, strains, now, profile, weekStart)

  return (
    <section className="panel px-4 py-3.5 sm:px-5">
      <Hinted tip={voice.hints.grounds.summary} className="mb-1.5">
        <div className="mb-1.5">
          <h2 className="card-title">Today&apos;s briefing</h2>
        </div>
      </Hinted>
      <p className="text-sm leading-relaxed text-ink-dim">
        <span className="text-ink">{s.workoutsLine}</span> {s.strainLine}{' '}
        <span className="text-ink">{s.proteinLine}</span> {s.fuelLine}
      </p>
    </section>
  )
}
