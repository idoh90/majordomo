import { useEffect, useReducer } from 'react'
import type { MuscleId, PplType, RepStyle, Workout } from '../../types'
import { PPL_MAP } from '../../data/muscles'
import { makeId, useWorkoutStore } from '../../store'
import { Sheet } from '../../../../core/ui/Sheet'
import { EffortStep } from './EffortStep'
import { MethodStep } from './MethodStep'
import { MuscleStep } from './MuscleStep'
import { PplStep } from './PplStep'

export type Selection = Partial<Record<MuscleId, 'primary' | 'secondary'>>

type Step = 'method' | 'ppl' | 'muscles' | 'effort'

interface Draft {
  step: Step
  method: 'ppl' | 'custom' | null
  ppl: PplType | null
  selection: Selection
  effort: number
  strainFeel: number
  repStyle: RepStyle
  performedAt: string
  /** true once the user picked a date/time — otherwise new workouts stamp save time */
  whenTouched: boolean
}

type Action =
  | { type: 'method'; method: 'ppl' | 'custom' }
  | { type: 'ppl'; ppl: PplType }
  | { type: 'cycle'; muscle: MuscleId }
  | { type: 'continue' }
  | { type: 'back' }
  | { type: 'effort'; value: number }
  | { type: 'strainFeel'; value: number }
  | { type: 'repStyle'; value: RepStyle }
  | { type: 'performedAt'; value: string }
  | { type: 'reset'; draft: Draft }

function reducer(d: Draft, a: Action): Draft {
  switch (a.type) {
    case 'method':
      return { ...d, method: a.method, step: a.method === 'ppl' ? 'ppl' : 'muscles' }
    case 'ppl': {
      const selection: Selection = {}
      for (const m of PPL_MAP[a.ppl].primary) selection[m] = 'primary'
      for (const m of PPL_MAP[a.ppl].secondary) selection[m] = 'secondary'
      return { ...d, ppl: a.ppl, selection, step: 'effort' }
    }
    case 'cycle': {
      const current = d.selection[a.muscle]
      const next =
        current === undefined ? 'primary' : current === 'primary' ? 'secondary' : undefined
      return { ...d, selection: { ...d.selection, [a.muscle]: next } }
    }
    case 'continue':
      return { ...d, step: 'effort' }
    case 'back':
      if (d.step === 'effort') return { ...d, step: d.method === 'ppl' ? 'ppl' : 'muscles' }
      if (d.step === 'ppl' || d.step === 'muscles') return { ...d, step: 'method' }
      return d
    case 'effort':
      return { ...d, effort: a.value }
    case 'strainFeel':
      return { ...d, strainFeel: a.value }
    case 'repStyle':
      return { ...d, repStyle: a.value }
    case 'performedAt':
      return { ...d, performedAt: a.value, whenTouched: true }
    case 'reset':
      return a.draft
  }
}

const freshDraft = (): Draft => ({
  step: 'method',
  method: null,
  ppl: null,
  selection: {},
  effort: 7,
  strainFeel: 6,
  repStyle: 'mixed',
  performedAt: new Date().toISOString(),
  whenTouched: false,
})

function draftFromWorkout(w: Workout): Draft {
  const selection: Selection = {}
  for (const m of w.primary) selection[m] = 'primary'
  for (const m of w.secondary) selection[m] = 'secondary'
  return {
    step: 'effort',
    method: w.method,
    ppl: w.ppl ?? null,
    selection,
    effort: w.effort,
    strainFeel: w.strainFeel,
    repStyle: w.repStyle ?? 'mixed',
    performedAt: w.performedAt,
    whenTouched: true,
  }
}

const TITLES: Record<Step, string> = {
  method: 'Log Workout',
  ppl: 'What kind of day?',
  muscles: 'What did you hit?',
  effort: 'How did it go?',
}

const STEP_INDEX: Record<Step, number> = { method: 0, ppl: 1, muscles: 1, effort: 2 }

interface AddWorkoutSheetProps {
  open: boolean
  editing: Workout | null
  onClose: () => void
  /** dev screenshot aid — open the When calendar immediately */
  devWhenOpen?: boolean
}

export function AddWorkoutSheet({ open, editing, onClose, devWhenOpen }: AddWorkoutSheetProps) {
  const addWorkout = useWorkoutStore((s) => s.addWorkout)
  const updateWorkout = useWorkoutStore((s) => s.updateWorkout)
  const workouts = useWorkoutStore((s) => s.workouts)
  const [draft, dispatch] = useReducer(reducer, undefined, freshDraft)

  useEffect(() => {
    if (open) dispatch({ type: 'reset', draft: editing ? draftFromWorkout(editing) : freshDraft() })
  }, [open, editing])

  const save = () => {
    const primary: MuscleId[] = []
    const secondary: MuscleId[] = []
    for (const [m, kind] of Object.entries(draft.selection) as [
      MuscleId,
      'primary' | 'secondary' | undefined,
    ][]) {
      if (kind === 'primary') primary.push(m)
      else if (kind === 'secondary') secondary.push(m)
    }
    const base = {
      performedAt: draft.whenTouched ? draft.performedAt : new Date().toISOString(),
      method: draft.method ?? 'custom',
      ppl: draft.method === 'ppl' ? (draft.ppl ?? undefined) : undefined,
      primary,
      secondary,
      effort: draft.effort,
      strainFeel: draft.strainFeel,
      repStyle: draft.repStyle,
    }
    if (editing) updateWorkout(editing.id, base)
    else addWorkout({ ...base, id: makeId(), createdAt: new Date().toISOString() })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center gap-2">
        {draft.step !== 'method' && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => dispatch({ type: 'back' })}
            className="-ml-2 rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M12.5 4.5 7 10l5.5 5.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <h2 className="font-display text-xl font-bold tracking-wide">{TITLES[draft.step]}</h2>
        <div className="ml-auto flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === STEP_INDEX[draft.step] ? 'w-5 bg-accent' : 'w-1.5 bg-panel-3'
              }`}
            />
          ))}
        </div>
      </div>

      <div key={draft.step} className="animate-[step-in_220ms_ease-out] pb-2">
        {draft.step === 'method' && (
          <MethodStep onChoose={(method) => dispatch({ type: 'method', method })} />
        )}
        {draft.step === 'ppl' && (
          <PplStep value={draft.ppl} onChoose={(ppl) => dispatch({ type: 'ppl', ppl })} />
        )}
        {draft.step === 'muscles' && (
          <MuscleStep
            selection={draft.selection}
            onCycle={(muscle) => dispatch({ type: 'cycle', muscle })}
            onContinue={() => dispatch({ type: 'continue' })}
          />
        )}
        {draft.step === 'effort' && (
          <EffortStep
            selection={draft.selection}
            effort={draft.effort}
            strainFeel={draft.strainFeel}
            repStyle={draft.repStyle}
            onEffort={(value) => dispatch({ type: 'effort', value })}
            onStrainFeel={(value) => dispatch({ type: 'strainFeel', value })}
            onRepStyle={(value) => dispatch({ type: 'repStyle', value })}
            editing={editing !== null}
            performedAt={draft.performedAt}
            onPerformedAt={(value) => dispatch({ type: 'performedAt', value })}
            workouts={workouts}
            onSave={save}
            whenInitiallyOpen={devWhenOpen}
          />
        )}
      </div>
    </Sheet>
  )
}
