import { useMemo, useState } from 'react'
import type { CatalogueExercise, RepStyle, Workout } from '../../types'
import { GROUP_LABELS, MUSCLES, PICKER_GROUPS } from '../../data/muscles'
import { useCatalogue } from '../../data/catalogue'
import { makeId, useWorkoutStore } from '../../store'
import { voice } from '../../../../core/voice'
import { gymEffortPrefill } from '../../lib/gymEffort'
import {
  deriveSelection,
  formatSets,
  lastLoggedSets,
  repStylePrefill,
  totalSets,
  type DraftExercise,
  type DraftSet,
} from '../../lib/exercises'
import type { LoggedSet, MuscleGroup, MuscleId } from '../../types'
import { MuscleGroupIcon } from '../icons'

interface ExercisesStepProps {
  exercises: DraftExercise[]
  /** the log the ghosts read — the session being edited is excluded by id, so
   *  a workout never quotes itself back as its own history */
  workouts: Workout[]
  editingId?: string
  /** an untouched edit prefills nothing — the muscle step's held-effort rule */
  holdEffort: boolean
  onAdd: (e: CatalogueExercise) => void
  onRemove: (index: number) => void
  onSetAdd: (exercise: number) => void
  onSetRemove: (exercise: number, set: number) => void
  onSetEdit: (exercise: number, set: number, patch: Partial<DraftSet>) => void
  /** fires with what the picks earned — either half null leaves it alone */
  onContinue: (effortPrefill: number | null, repStyle: RepStyle | null) => void
}

/**
 * The named-lift flow: the session as a list of exercises with their sets, and
 * a picker over the catalogue.
 *
 * The two are MODES of one step rather than a list with a panel under it —
 * inside a scrolling sheet a search box beneath twelve exercises is a search
 * box nobody reaches, and an overlay gets clipped (the SportStep rule). Both
 * stay in flow and the sheet simply grows.
 */
export function ExercisesStep({
  exercises,
  workouts,
  editingId,
  holdEffort,
  onAdd,
  onRemove,
  onSetAdd,
  onSetRemove,
  onSetEdit,
  onContinue,
}: ExercisesStepProps) {
  const [picking, setPicking] = useState(exercises.length === 0)

  if (picking) {
    return (
      <Picker
        chosen={exercises}
        onPick={(e) => {
          onAdd(e)
          setPicking(false)
        }}
        onCancel={exercises.length > 0 ? () => setPicking(false) : null}
      />
    )
  }

  const sets = totalSets(exercises)

  return (
    <div>
      {exercises.length === 0 ? (
        <p className="card px-3.5 py-4 text-sm text-ink-faint">{voice.grounds.exercises.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {exercises.map((e, i) => (
            <ExerciseCard
              key={`${e.exerciseId}-${i}`}
              exercise={e}
              previous={lastLoggedSets(workouts, e.exerciseId, editingId)}
              onRemove={() => onRemove(i)}
              onSetAdd={() => onSetAdd(i)}
              onSetRemove={(s) => onSetRemove(i, s)}
              onSetEdit={(s, patch) => onSetEdit(i, s, patch)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="btn-soft mt-3 w-full py-3 text-sm"
      >
        + {voice.grounds.exercises.addExercise}
      </button>

      <button
        type="button"
        disabled={exercises.length === 0}
        onClick={() =>
          onContinue(
            holdEffort ? null : gymEffortPrefill(deriveSelection(exercises)),
            holdEffort ? null : repStylePrefill(exercises),
          )
        }
        className="btn-cta mt-5 w-full py-3 text-base disabled:opacity-30"
      >
        Continue
      </button>
      {exercises.length > 0 && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          {voice.grounds.exercises.setCount(sets)}
        </p>
      )}
    </div>
  )
}

function ExerciseCard({
  exercise,
  previous,
  onRemove,
  onSetAdd,
  onSetRemove,
  onSetEdit,
}: {
  exercise: DraftExercise
  previous: LoggedSet[] | null
  onRemove: () => void
  onSetAdd: () => void
  onSetRemove: (set: number) => void
  onSetEdit: (set: number, patch: Partial<DraftSet>) => void
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold tracking-wide text-ink">
            {exercise.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-faint">
            {exercise.primary.map((m) => MUSCLES[m].label).join(' · ')}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Remove ${exercise.name}`}
          onClick={onRemove}
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Cross />
        </button>
      </div>

      {previous && (
        <p className="mt-1.5 text-xs text-ink-faint">
          {voice.grounds.exercises.lastTime({ sets: formatSets(previous) })}
        </p>
      )}

      <div className="mt-2.5 flex flex-col gap-1.5">
        {exercise.sets.map((s, i) => {
          // the ghost for a row past the previous session's count is its last
          // set — someone adding a fifth set is not starting from nothing
          const ghost = previous ? (previous[i] ?? previous[previous.length - 1]) : undefined
          return (
            <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1.75rem] items-center gap-1.5">
              <span className="stat-num text-center text-xs text-ink-faint">{i + 1}</span>
              <SetInput
                label={voice.grounds.exercises.weightLabel}
                value={s.weightKg}
                placeholder={ghost?.weightKg !== undefined ? String(ghost.weightKg) : '—'}
                step="2.5"
                max={500}
                onChange={(weightKg) => onSetEdit(i, { weightKg })}
              />
              <SetInput
                label={voice.grounds.exercises.repsLabel}
                value={s.reps}
                placeholder={ghost?.reps !== undefined ? String(ghost.reps) : '—'}
                step="1"
                max={100}
                onChange={(reps) => onSetEdit(i, { reps })}
              />
              <button
                type="button"
                aria-label={`Remove set ${i + 1}`}
                onClick={() => onSetRemove(i)}
                className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <Cross />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onSetAdd}
        className="mt-2 w-full rounded-lg border border-line py-2 text-xs text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        + {voice.grounds.exercises.addSet}
      </button>
    </div>
  )
}

/** A set row's number box: the Field primitive's refuse-never-clamp rule at the
 *  size a row can carry — Field's own is built to be a step's whole question. */
function SetInput({
  label,
  value,
  placeholder,
  step,
  max,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  step: string
  max: number
  onChange: (v: string) => void
}) {
  return (
    <span className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1.5 focus-within:border-accent/60">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        min="0"
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value
          if (next !== '' && Number(next) < 0) return
          if (next !== '' && Number(next) > max) return
          onChange(next)
        }}
        className="stat-num w-full min-w-0 bg-transparent text-right text-sm text-ink outline-none placeholder:text-ink-faint"
      />
      <span className="shrink-0 text-[10px] text-ink-faint">{label}</span>
    </span>
  )
}

function Picker({
  chosen,
  onPick,
  onCancel,
}: {
  chosen: DraftExercise[]
  onPick: (e: CatalogueExercise) => void
  onCancel: (() => void) | null
}) {
  const catalogue = useCatalogue()
  const custom = useWorkoutStore((s) => s.customExercises)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<MuscleGroup | null>(null)
  const [creating, setCreating] = useState(false)

  // yours first: a short list you wrote yourself should not be buried under a
  // catalogue of 700 that did not have what you wanted
  const all = useMemo(() => [...custom, ...(catalogue ?? [])], [custom, catalogue])

  const results = useMemo(() => {
    if (!catalogue) return []
    const q = query.trim().toLowerCase()
    return all.filter((e) => {
      // the group asks what an exercise is FOR, so only its primaries answer
      if (group && !e.primary.some((m) => MUSCLES[m].group === group)) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q) || (e.equipment ?? '').includes(q)
    })
  }, [all, catalogue, query, group])

  if (creating) {
    return (
      <CreateExercise
        initialName={query.trim()}
        onCancel={() => setCreating(false)}
        onCreate={(e) => {
          onPick(e)
          setCreating(false)
        }}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="card flex flex-1 items-center gap-2 px-3.5 py-2.5 focus-within:border-accent/60">
          <Magnifier />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={voice.grounds.exercises.searchPlaceholder}
            className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </label>
        {onCancel && (
          <button
            type="button"
            aria-label="Back"
            onClick={onCancel}
            className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <Cross />
          </button>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <GroupChip
          label={voice.grounds.exercises.filterAll}
          on={group === null}
          onClick={() => setGroup(null)}
        />
        {PICKER_GROUPS.map((g) => (
          <GroupChip
            key={g.group}
            label={GROUP_LABELS[g.group]}
            icon={<MuscleGroupIcon group={g.group} />}
            on={group === g.group}
            onClick={() => setGroup(group === g.group ? null : g.group)}
          />
        ))}
      </div>

      {catalogue === null ? (
        <p className="mt-3 px-1 text-sm text-ink-faint">{voice.grounds.exercises.loading}</p>
      ) : results.length === 0 ? (
        <p className="mt-3 px-1 text-sm text-ink-faint">
          {voice.grounds.exercises.noResults({ query: query.trim() })}
        </p>
      ) : (
        <div
          role="listbox"
          aria-label={voice.grounds.exercises.searchPlaceholder}
          // rows run ~41px, so 16.25rem cuts the seventh in half on purpose — a
          // list ending flush on a full row reads as the whole catalogue
          className="menu-panel mt-2.5 max-h-[16.25rem] animate-[step-in_140ms_ease-out] overflow-y-auto"
        >
          {results.map((e) => {
            const already = chosen.some((c) => c.exerciseId === e.id)
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={already}
                onClick={() => onPick(e)}
                className="flex w-full items-baseline gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-panel-2"
              >
                <span className={`min-w-0 flex-1 text-sm ${already ? 'text-accent' : 'text-ink'}`}>
                  {e.name}
                </span>
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {e.equipment ?? voice.grounds.exercises.yoursTag}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {query.trim() !== '' && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-soft mt-2.5 w-full py-2.5 text-sm"
        >
          {voice.grounds.exercises.create({ name: query.trim() })}
        </button>
      )}
    </div>
  )
}

/**
 * Writing an exercise the catalogue does not have. The muscle grid is the
 * muscle step's own interaction — tap once for the brunt, twice for assisting —
 * because anyone who has logged a workout here has already learned it once.
 */
function CreateExercise({
  initialName,
  onCancel,
  onCreate,
}: {
  initialName: string
  onCancel: () => void
  onCreate: (e: CatalogueExercise) => void
}) {
  const addCustomExercise = useWorkoutStore((s) => s.addCustomExercise)
  const [name, setName] = useState(initialName)
  const [marks, setMarks] = useState<Partial<Record<MuscleId, 'primary' | 'secondary'>>>({})

  const primary = (Object.keys(marks) as MuscleId[]).filter((m) => marks[m] === 'primary')
  const secondary = (Object.keys(marks) as MuscleId[]).filter((m) => marks[m] === 'secondary')
  const ready = name.trim() !== '' && primary.length > 0

  const save = () => {
    if (!ready) return
    // 'cx-' cannot collide with a catalogue id (those are upstream slugs), and
    // it is what marks a row as the user's own wherever one is listed
    const made: CatalogueExercise = { id: `cx-${makeId()}`, name: name.trim(), primary, secondary }
    addCustomExercise(made)
    onCreate(made)
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">
          {voice.grounds.exercises.createTitle}
        </h3>
        <button
          type="button"
          aria-label="Back"
          onClick={onCancel}
          className="ml-auto rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Cross />
        </button>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-dim">
          {voice.grounds.exercises.createNameLabel}
        </span>
        <span className="card flex items-center px-3.5 py-3 focus-within:border-accent/60">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={voice.grounds.exercises.createNamePlaceholder}
            className="w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
          />
        </span>
      </label>

      <p className="mb-1.5 mt-4 text-sm font-medium text-ink-dim">
        {voice.grounds.exercises.createMusclesLabel}
      </p>
      <p className="mb-3 text-xs text-ink-faint">{voice.grounds.exercises.createMusclesHint}</p>
      <div className="flex flex-col gap-4">
        {PICKER_GROUPS.map((g) => (
          <div key={g.group}>
            <h4 className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">
              <MuscleGroupIcon group={g.group} />
              {GROUP_LABELS[g.group]}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {g.muscles.map((m) => {
                const state = marks[m]
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={state !== undefined}
                    onClick={() =>
                      setMarks((prev) => ({
                        ...prev,
                        [m]:
                          prev[m] === undefined
                            ? 'primary'
                            : prev[m] === 'primary'
                              ? 'secondary'
                              : undefined,
                      }))
                    }
                    className={`chip min-h-10 border px-3.5 py-1.5 text-sm transition-colors ${
                      state === 'primary'
                        ? 'border-transparent bg-accent font-semibold text-bg'
                        : state === 'secondary'
                          ? 'border-accent/50 bg-accent/15 text-accent'
                          : 'border-line bg-panel-2 text-ink-dim hover:text-ink'
                    }`}
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
        disabled={!ready}
        onClick={save}
        className="btn-cta mt-5 w-full py-3 text-base disabled:opacity-30"
      >
        {voice.grounds.exercises.createSave}
      </button>
      {!ready && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          {name.trim() === ''
            ? voice.grounds.exercises.createNeedsName
            : voice.grounds.exercises.createNeedsPrimary}
        </p>
      )}
    </div>
  )
}

function GroupChip({
  label,
  icon,
  on,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`chip flex items-center gap-1.5 border px-3 py-1 text-xs transition-colors ${
        on
          ? 'border-transparent bg-accent font-semibold text-bg'
          : 'border-line bg-panel-2 text-ink-dim hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Magnifier() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden
      className="shrink-0 text-ink-faint"
    >
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
