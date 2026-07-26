import type { Workout } from '../../types'
import { muscleLabel } from '../../data/muscles'
import { topMuscles } from '../../lib/insights'
import { voice } from '../../../../core/voice'

interface TopMusclesChartProps {
  workouts: Workout[]
  now: number
}

/** Top 5 most-trained muscles by volume, last 30 days — horizontal bars. */
export function TopMusclesChart({ workouts, now }: TopMusclesChartProps) {
  const rows = topMuscles(workouts, new Date(now), 30, 5)
  const max = Math.max(1, ...rows.map((r) => r.volume))

  return (
    <div className="panel p-4">
      <h3 className="card-title">{voice.grounds.topMusclesTitle}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 pb-2 text-center text-xs text-ink-faint">
          {voice.grounds.topMusclesEmpty}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.muscle}
              className="flex items-center gap-2"
              title={`${muscleLabel(r.muscle)}: ${r.volume.toFixed(1)} volume`}
            >
              <span className="w-20 shrink-0 truncate text-xs text-ink-dim">
                {muscleLabel(r.muscle)}
              </span>
              <div className="chip h-2.5 flex-1 overflow-hidden bg-panel-2">
                <div
                  className="chip h-full bg-gradient-to-r from-accent-deep to-accent"
                  style={{ width: `${(r.volume / max) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-faint">
                {Math.round(r.volume)}
              </span>
            </div>
          ))}
          {/* say what the chart leaves out rather than letting it read as "all" */}
          <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">
            {voice.grounds.topMusclesNote}
          </p>
        </div>
      )}
    </div>
  )
}
