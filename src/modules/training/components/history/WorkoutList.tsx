import type { Workout } from '../../types'
import { localDayKey, relativeDayLabel } from '../../../../core/dates'
import { voice } from '../../../../core/voice'
import { WorkoutCard } from './WorkoutCard'

interface WorkoutListProps {
  workouts: Workout[]
  now: number
  onEdit: (w: Workout) => void
  onOpen: (w: Workout) => void
}

export function WorkoutList({ workouts, now, onEdit, onOpen }: WorkoutListProps) {
  if (workouts.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-panel/50 p-8 text-center">
        <p className="font-display text-lg font-semibold tracking-wide text-ink-dim">
          {voice.grounds.emptyLogTitle}
        </p>
        {/* the glowing + is the mobile tab bar's; desktop logs from the header
            button, so each viewport names the control it actually has */}
        <p className="mt-1 text-sm text-ink-faint">
          <span className="md:hidden">{voice.grounds.emptyLogMobile}</span>
          <span className="hidden md:inline">{voice.grounds.emptyLogDesktop}</span>
        </p>
      </section>
    )
  }

  // workouts arrive sorted newest-first; group consecutive same-local-day entries
  const groups: { key: string; label: string; items: Workout[] }[] = []
  for (const w of workouts) {
    const key = localDayKey(w.performedAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(w)
    else groups.push({ key, label: relativeDayLabel(w.performedAt, new Date(now)), items: [w] })
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="sr-only">Workout history</h2>
      {groups.map((g) => (
        <div key={g.key}>
          <h3 className="mb-2 px-1 font-display text-xs font-bold uppercase tracking-[0.2em] text-ink-faint">
            {g.label}
          </h3>
          <div className="flex flex-col gap-2">
            {g.items.map((w) => (
              <WorkoutCard key={w.id} workout={w} onEdit={onEdit} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
