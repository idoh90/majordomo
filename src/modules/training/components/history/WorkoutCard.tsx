import { useState } from 'react'
import { isRun, type Workout } from '../../types'
import { MUSCLES, PPL_LABELS } from '../../data/muscles'
import { timeLabel } from '../../../../core/dates'
import { useWorkoutStore } from '../../store'
import { ConfirmDialog } from '../../../../core/ui/ConfirmDialog'

/** "8 km", "45 min", "8 km · 45 min", or '' when neither was recorded */
function runLabel(w: Workout): string {
  const parts: string[] = []
  if (w.run?.distanceKm) parts.push(`${w.run.distanceKm} km`)
  if (w.run?.durationMin) parts.push(`${w.run.durationMin} min`)
  return parts.join(' · ')
}

interface WorkoutCardProps {
  workout: Workout
  onEdit: (w: Workout) => void
  onOpen: (w: Workout) => void
}

export function WorkoutCard({ workout, onEdit, onOpen }: WorkoutCardProps) {
  const deleteWorkout = useWorkoutStore((s) => s.deleteWorkout)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const chips = [
    ...workout.primary.map((m) => ({ label: MUSCLES[m].label, primary: true })),
    ...workout.secondary.map((m) => ({ label: MUSCLES[m].label, primary: false })),
  ]
  const visible = chips.slice(0, 4)
  const overflow = chips.length - visible.length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(workout)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(workout)
        }
      }}
      className="card relative flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:border-accent/40"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {workout.ppl && (
            <span className="rounded-md border border-accent/60 px-1.5 py-px font-display text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              {PPL_LABELS[workout.ppl]}
            </span>
          )}
          {isRun(workout) && (
            <span className="rounded-md border border-accent/60 px-1.5 py-px font-display text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              Run{runLabel(workout) && ` · ${runLabel(workout)}`}
            </span>
          )}
          {!isRun(workout) && workout.repStyle && workout.repStyle !== 'mixed' && (
            <span className="rounded-md border border-line px-1.5 py-px font-display text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">
              {workout.repStyle === 'heavy' ? 'Heavy' : 'High rep'}
            </span>
          )}
          <span className="text-xs text-ink-faint">{timeLabel(workout.performedAt)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {visible.map((c, i) => (
            <span
              key={i}
              className={
                c.primary
                  ? 'chip bg-panel-3 px-2 py-0.5 text-xs font-medium text-ink'
                  : 'chip border border-line px-2 py-0.5 text-xs text-ink-dim'
              }
            >
              {c.label}
            </span>
          ))}
          {overflow > 0 && <span className="px-1 text-xs text-ink-faint">+{overflow}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex flex-col gap-1.5">
          <Meter letter="E" value={workout.effort} barClass="bg-accent" />
          <Meter letter="S" value={workout.strainFeel} barClass="bg-ember" />
        </div>
        <button
          type="button"
          aria-label="Workout actions"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="-mr-1 rounded-lg p-2 text-ink-faint transition-colors hover:bg-panel-3 hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="fixed inset-0 z-30" onPointerDown={() => setMenuOpen(false)} />
          <div className="menu-panel absolute right-2 top-12 z-40 w-36 animate-[step-in_140ms_ease-out] overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onEdit(workout)
              }}
              className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-panel-2"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setConfirming(true)
              }}
              className="block w-full px-3.5 py-2.5 text-left text-sm text-danger hover:bg-panel-2"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={confirming}
          title="Delete workout?"
          message="This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            deleteWorkout(workout.id)
          }}
        />
      </div>
    </div>
  )
}

function Meter({
  letter,
  value,
  barClass,
}: {
  letter: string
  value: number
  barClass: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 font-display text-[10px] font-bold text-ink-faint">{letter}</span>
      <div className="chip h-1.5 w-12 overflow-hidden bg-panel-3">
        <div className={`chip h-full ${barClass}`} style={{ width: `${value * 10}%` }} />
      </div>
      <span className="w-4 text-right text-xs tabular-nums text-ink-dim">{value}</span>
    </div>
  )
}
