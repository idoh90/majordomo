import type { Workout } from '../../types'
import { muscleLabel } from '../../data/muscles'
import { streakDays, topMuscles } from '../../lib/insights'

interface StatTilesProps {
  workouts: Workout[]
  now: number
}

export function StatTiles({ workouts, now }: StatTilesProps) {
  const nowDate = new Date(now)
  const streak = streakDays(workouts, nowDate)
  const top = topMuscles(workouts, nowDate, 30, 1)[0]

  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile label="Streak" value={String(streak)} unit={streak === 1 ? 'day' : 'days'} />
      <Tile label="Top · 30d" value={top ? muscleLabel(top.muscle) : '—'} small />
    </div>
  )
}

function Tile({
  label,
  value,
  unit,
  small,
}: {
  label: string
  value: string
  unit?: string
  small?: boolean
}) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="card-title text-[10px]">{label}</div>
      <div
        className={`stat-num mt-0.5 leading-tight text-ink ${
          small ? 'truncate text-lg' : 'text-2xl'
        }`}
      >
        {value}
      </div>
      {unit && <div className="text-[11px] leading-tight text-ink-faint">{unit}</div>}
    </div>
  )
}
