import type { CSSProperties } from 'react'
import type { MuscleId } from '../../types'
import { GROUP_LABELS, MUSCLES, PICKER_GROUPS } from '../../data/muscles'
import { useShellStore } from '../../../../core/store/shell'
import { SKINS } from '../../../../core/ui/skins'
import { EFFORT_LIVE } from '../../lib/pace'
import { gymEffort, gymEffortPrefill } from '../../lib/gymEffort'
import { strainToColor } from '../../lib/strainColor'
import { MuscleGroupIcon } from '../icons'
import { MuscleTwin } from './MuscleTwin'
import type { Selection } from './AddWorkoutSheet'

interface MuscleStepProps {
  selection: Selection
  /** an untouched edit holds the recorded effort — the twin reads idle and
   *  Continue prefills nothing until a chip actually changes (the run step's
   *  held-clock rule) */
  holdEffort: boolean
  onCycle: (m: MuscleId) => void
  /** fires with the effort the picks earned, or null when nothing was earned */
  onContinue: (effortPrefill: number | null) => void
}

/** Muscle picker, 3a: every chip you tap ignites that muscle on a mini you. */
export function MuscleStep({ selection, holdEffort, onCycle, onContinue }: MuscleStepProps) {
  const ramp = SKINS[useShellStore((s) => s.skin)].heatRamp
  const hasPrimary = Object.values(selection).some((v) => v === 'primary')
  const eff = gymEffort(selection)
  const live = eff > EFFORT_LIVE
  const heat = live ? strainToColor(Math.max(eff, 1.2), ramp) : 'var(--color-accent)'
  const prefill = holdEffort ? null : gymEffortPrefill(selection)

  return (
    <div
      style={
        {
          '--heat': heat,
          '--heat-soft': `color-mix(in srgb, ${heat} ${live ? 16 : 8}%, transparent)`,
          '--heat-line': live
            ? `color-mix(in srgb, ${heat} 50%, var(--color-line))`
            : 'var(--color-line)',
        } as CSSProperties
      }
    >
      <MuscleTwin selection={selection} eff={eff} prefill={prefill} />
      <p className="mb-3 mt-3 text-xs text-ink-faint">
        Tap once ={' '}
        <span className="transition-colors duration-300" style={{ color: 'var(--heat)' }}>
          primary
        </span>{' '}
        · tap twice ={' '}
        <span
          className="opacity-75 transition-colors duration-300"
          style={{ color: 'var(--heat)' }}
        >
          secondary
        </span>{' '}
        · third tap clears
      </p>
      <div className="flex flex-col gap-4">
        {PICKER_GROUPS.map((g) => (
          <div key={g.group}>
            <h4 className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">
              <MuscleGroupIcon group={g.group} />
              {GROUP_LABELS[g.group]}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {g.muscles.map((m) => {
                const state = selection[m]
                const cls =
                  state === 'primary'
                    ? 'border-transparent font-semibold text-bg'
                    : state === 'secondary'
                      ? 'border-transparent'
                      : 'border-line bg-panel-2 text-ink-dim hover:text-ink'
                const style: CSSProperties | undefined =
                  state === 'primary'
                    ? { background: 'var(--heat)', borderColor: 'var(--heat)' }
                    : state === 'secondary'
                      ? {
                          background: 'var(--heat-soft)',
                          borderColor: 'var(--heat-line)',
                          color: 'var(--heat)',
                        }
                      : undefined
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={state !== undefined}
                    onClick={() => onCycle(m)}
                    style={style}
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
        onClick={() => onContinue(prefill)}
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
