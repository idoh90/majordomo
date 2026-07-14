import type { Workout } from '../../types'
import { weeklyCounts } from '../../lib/insights'
import { useShellStore } from '../../../../core/store/shell'

interface WeeklyChartProps {
  workouts: Workout[]
  now: number
}

/** Workouts per week, last 8 weeks — plain HTML/CSS bars. */
export function WeeklyChart({ workouts, now }: WeeklyChartProps) {
  const weekStart = useShellStore((s) => s.weekStart)
  const buckets = weeklyCounts(workouts, new Date(now), 8, weekStart)
  const max = Math.max(1, ...buckets.map((b) => b.count))

  return (
    <div className="panel p-4">
      <h3 className="card-title">Workouts / Week</h3>
      <div className="mt-3 flex items-end justify-between gap-1.5" style={{ height: 96 }}>
        {buckets.map((b) => (
          <div
            key={b.key}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            title={`Week of ${b.label}: ${b.count} workout${b.count === 1 ? '' : 's'}`}
          >
            <span
              className={`text-[10px] tabular-nums leading-none ${
                b.isCurrent ? 'font-semibold text-ink' : 'text-ink-faint'
              }`}
            >
              {b.count > 0 ? b.count : ''}
            </span>
            <div
              className={`w-full max-w-6 rounded-t-md ${b.isCurrent ? 'bg-accent' : 'bg-accent/35'}`}
              style={{ height: b.count === 0 ? 2 : `${(b.count / max) * 72}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-1.5 border-t border-line pt-1.5">
        {buckets.map((b) => (
          <span
            key={b.key}
            className={`flex-1 text-center text-[9px] leading-none ${
              b.isCurrent ? 'font-semibold text-ink-dim' : 'text-ink-faint'
            }`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}
