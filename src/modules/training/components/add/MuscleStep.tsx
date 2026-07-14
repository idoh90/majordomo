import type { MuscleId } from '../../types'
import { GROUP_LABELS, MUSCLES, PICKER_GROUPS } from '../../data/muscles'
import type { Selection } from './AddWorkoutSheet'

interface MuscleStepProps {
  selection: Selection
  onCycle: (m: MuscleId) => void
  onContinue: () => void
}

export function MuscleStep({ selection, onCycle, onContinue }: MuscleStepProps) {
  const hasPrimary = Object.values(selection).some((v) => v === 'primary')

  return (
    <div>
      <p className="mb-3 text-xs text-ink-faint">
        Tap once = <span className="text-accent">primary</span> · tap twice ={' '}
        <span className="text-accent/80">secondary</span> · third tap clears
      </p>
      <div className="flex flex-col gap-4">
        {PICKER_GROUPS.map((g) => (
          <div key={g.group}>
            <h4 className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">
              {GROUP_LABELS[g.group]}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {g.muscles.map((m) => {
                const state = selection[m]
                const cls =
                  state === 'primary'
                    ? 'border-accent bg-accent font-semibold text-bg'
                    : state === 'secondary'
                      ? 'border-accent/70 bg-accent/10 text-accent'
                      : 'border-line bg-panel-2 text-ink-dim hover:text-ink'
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={state !== undefined}
                    onClick={() => onCycle(m)}
                    className={`chip min-h-10 border px-3.5 py-1.5 text-sm transition-colors ${cls}`}
                  >
                    {MUSCLES[m].label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!hasPrimary}
        onClick={onContinue}
        className="btn-cta mt-5 w-full py-3 text-base disabled:opacity-30"
      >
        Continue
      </button>
      {!hasPrimary && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          Pick at least one primary muscle
        </p>
      )}
    </div>
  )
}
