import { useMemo, useState } from 'react'
import type { CatalogueExercise, RepStyle, Workout } from '../../types'
import { GROUP_LABELS, MUSCLES, PICKER_GROUPS } from '../../data/muscles'
import { useCatalogue } from '../../data/catalogue'
import { makeId, useWorkoutStore } from '../../store'
import { voice } from '../../../../core/voice'
import { ConfirmDialog } from '../../../../core/ui/ConfirmDialog'
import { gymEffortPrefill } from '../../lib/gymEffort'
import {
  deriveSelection,
  formatSets,
  isOwnExercise,
  lastLoggedSets,
  OWN_EXERCISE_PREFIX,
  repStylePrefill,
  searchFold,
  searchTerms,
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
  /** an exercise of the user's own, corrected from the picker — the draft is
   *  carrying a COPY of its old name and muscles and has to be told */
  onEdited: (e: CatalogueExercise) => void
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
  onEdited,
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
        onEdited={onEdited}
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
          className="-mr-2.5 -mt-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
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
            // This row is logged one-handed, between sets, out of breath. Every
            // control on it clears the 44px touch minimum: the number boxes take
            // a tap anywhere on the pill (see SetInput) and the × has a target
            // the size of a thumb rather than of its 14px glyph.
            <div key={i} className="grid grid-cols-[1.25rem_1fr_1fr_2.75rem] items-center gap-1.5">
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
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
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
        className="mt-2 min-h-11 w-full rounded-lg border border-line py-2 text-xs text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
      >
        + {voice.grounds.exercises.addSet}
      </button>
    </div>
  )
}

/**
 * A set row's number box: the Field primitive's refuse-never-clamp rule at the
 * size a row can carry — Field's own is built to be a step's whole question.
 *
 * A LABEL, not a span, and the input fills its height: the pill's padding is
 * what makes it read as tappable, so the padding has to take the tap. As a span
 * it did not — only a ~20px strip of glyph height did, which on a phone is a
 * thumb landing on nothing and no keyboard, in the single most-used interaction
 * in this wing. The unit is `aria-hidden`: the input already carries the same
 * word as its accessible name, so a label wrapping it would otherwise read
 * "kg kg".
 */
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
    <label className="flex min-h-11 items-stretch gap-1 rounded-lg border border-line bg-panel-2 px-2 focus-within:border-accent/60">
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
        className="stat-num w-full min-w-0 flex-1 bg-transparent text-right text-sm text-ink outline-none placeholder:text-ink-faint"
      />
      <span aria-hidden className="shrink-0 self-center text-[10px] text-ink-faint">
        {label}
      </span>
    </label>
  )
}

function Picker({
  chosen,
  onPick,
  onEdited,
  onCancel,
}: {
  chosen: DraftExercise[]
  onPick: (e: CatalogueExercise) => void
  onEdited: (e: CatalogueExercise) => void
  onCancel: (() => void) | null
}) {
  const catalogue = useCatalogue()
  const custom = useWorkoutStore((s) => s.customExercises)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<MuscleGroup | null>(null)
  /** the form, open on a blank exercise (`editing: null`) or on one of the
   *  user's own; null while the list is up */
  const [form, setForm] = useState<{ editing: CatalogueExercise | null } | null>(null)

  // yours first: a short list you wrote yourself should not be buried under a
  // catalogue of 700 that did not have what you wanted
  const all = useMemo(() => [...custom, ...(catalogue ?? [])], [custom, catalogue])

  // folded once per catalogue change rather than once per keystroke — the
  // catalogue is 736 rows and this runs on every letter typed
  const folded = useMemo(
    () => all.map((e) => ({ e, hay: searchFold(`${e.name} ${e.equipment ?? ''}`) })),
    [all],
  )
  const terms = useMemo(() => searchTerms(query), [query])

  const results = useMemo(() => {
    if (!catalogue) return []
    return folded
      .filter(({ e, hay }) => {
        // the group asks what an exercise is FOR, so only its primaries answer
        if (group && !e.primary.some((m) => MUSCLES[m].group === group)) return false
        // every word has to land somewhere, in any order: 'chin up' finds
        // 'Chin-Up', 'tricep pushdown' finds every Triceps Pushdown, and
        // 'pushdown tricep' finds the same rows
        return terms.every((t) => hay.includes(t))
      })
      .map(({ e }) => e)
  }, [folded, catalogue, terms, group])

  if (form) {
    return (
      <ExerciseForm
        editing={form.editing}
        initialName={query.trim()}
        onCancel={() => setForm(null)}
        onCreate={(e) => {
          onPick(e)
          setForm(null)
        }}
        onEdited={(e) => {
          onEdited(e)
          setForm(null)
        }}
        onDeleted={() => setForm(null)}
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
          // a GROUP of buttons, not a listbox: a row of the user's own carries a
          // second control (the door back into it), and an option that holds an
          // interactive child is not an option any more
          role="group"
          aria-label={voice.grounds.exercises.searchPlaceholder}
          // rows run 44px, so 16.25rem cuts the sixth in half on purpose — a
          // list ending flush on a full row reads as the whole catalogue
          className="menu-panel mt-2.5 max-h-[16.25rem] animate-[step-in_140ms_ease-out] overflow-y-auto"
        >
          {results.map((e) => {
            const already = chosen.some((c) => c.exerciseId === e.id)
            const mine = isOwnExercise(e.id)
            return (
              <div key={e.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onPick(e)}
                  className="flex min-h-11 min-w-0 flex-1 items-baseline gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-panel-2"
                >
                  <span
                    className={`min-w-0 flex-1 text-sm ${already ? 'text-accent' : 'text-ink'}`}
                  >
                    {e.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {e.equipment ?? voice.grounds.exercises.yoursTag}
                  </span>
                </button>
                {mine && (
                  <button
                    type="button"
                    aria-label={voice.grounds.exercises.editAria({ name: e.name })}
                    onClick={() => setForm({ editing: e })}
                    className="flex w-11 shrink-0 items-center justify-center text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    <Pencil />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {query.trim() !== '' && (
        <button
          type="button"
          onClick={() => setForm({ editing: null })}
          className="btn-soft mt-2.5 min-h-11 w-full py-2.5 text-sm"
        >
          {voice.grounds.exercises.create({ name: query.trim() })}
        </button>
      )}
    </div>
  )
}

/**
 * Writing an exercise the catalogue does not have — and, reopened on one you
 * already wrote, correcting or removing it. The muscle grid is the muscle
 * step's own interaction — tap once for the brunt, twice for assisting —
 * because anyone who has logged a workout here has already learned it once.
 *
 * The edit half exists because the create half is a one-way door otherwise: an
 * exercise is written into the picker the moment ADD EXERCISE is pressed, it
 * survives the draft being discarded, and it then sits at the top of every
 * search above the real lift with no rename, no delete and nothing in settings.
 * One mistyped search should not be permanent.
 */
function ExerciseForm({
  editing,
  initialName,
  onCancel,
  onCreate,
  onEdited,
  onDeleted,
}: {
  /** the exercise of the user's own being corrected, or null while writing one */
  editing: CatalogueExercise | null
  initialName: string
  onCancel: () => void
  onCreate: (e: CatalogueExercise) => void
  onEdited: (e: CatalogueExercise) => void
  onDeleted: () => void
}) {
  const addCustomExercise = useWorkoutStore((s) => s.addCustomExercise)
  const updateCustomExercise = useWorkoutStore((s) => s.updateCustomExercise)
  const deleteCustomExercise = useWorkoutStore((s) => s.deleteCustomExercise)
  const [name, setName] = useState(editing?.name ?? initialName)
  const [marks, setMarks] = useState<Partial<Record<MuscleId, 'primary' | 'secondary'>>>(() => {
    // the muscle step's own ordering rule: a muscle taking the brunt anywhere
    // takes the brunt, so primaries are laid down last
    const seed: Partial<Record<MuscleId, 'primary' | 'secondary'>> = {}
    for (const m of editing?.secondary ?? []) seed[m] = 'secondary'
    for (const m of editing?.primary ?? []) seed[m] = 'primary'
    return seed
  })
  const [confirming, setConfirming] = useState(false)

  const primary = (Object.keys(marks) as MuscleId[]).filter((m) => marks[m] === 'primary')
  const secondary = (Object.keys(marks) as MuscleId[]).filter((m) => marks[m] === 'secondary')
  const ready = name.trim() !== '' && primary.length > 0

  const save = () => {
    if (!ready) return
    if (editing) {
      // the id never moves: workouts reference it, and so does the ghost that
      // puts last session's numbers beside this one's
      const next: CatalogueExercise = { ...editing, name: name.trim(), primary, secondary }
      updateCustomExercise(editing.id, { name: next.name, primary, secondary })
      onEdited(next)
      return
    }
    // the prefix is what marks a row as the user's own wherever one is listed —
    // and what puts the pencil on it in the picker
    const made: CatalogueExercise = {
      id: `${OWN_EXERCISE_PREFIX}${makeId()}`,
      name: name.trim(),
      primary,
      secondary,
    }
    addCustomExercise(made)
    onCreate(made)
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ink-dim">
          {editing ? voice.grounds.exercises.editTitle : voice.grounds.exercises.createTitle}
        </h3>
        <button
          type="button"
          aria-label="Back"
          onClick={onCancel}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
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

      <div className="mt-5 flex gap-2">
        {editing && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-soft px-4 py-3 text-sm text-danger"
          >
            {voice.grounds.exercises.editDelete}
          </button>
        )}
        <button
          type="button"
          disabled={!ready}
          onClick={save}
          className="btn-cta flex-1 py-3 text-base disabled:opacity-30"
        >
          {editing ? voice.grounds.exercises.editSave : voice.grounds.exercises.createSave}
        </button>
      </div>
      {!ready ? (
        <p className="mt-2 text-center text-xs text-ink-faint">
          {name.trim() === ''
            ? voice.grounds.exercises.createNeedsName
            : voice.grounds.exercises.createNeedsPrimary}
        </p>
      ) : (
        editing && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            {voice.grounds.exercises.editHistoryNote}
          </p>
        )
      )}

      {editing && (
        <ConfirmDialog
          open={confirming}
          title={voice.grounds.exercises.editDeleteTitle}
          message={voice.grounds.exercises.editDeleteBody({ name: editing.name })}
          confirmLabel={voice.grounds.exercises.editDeleteConfirm}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            deleteCustomExercise(editing.id)
            onDeleted()
          }}
        />
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

function Pencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.4 1.9l2.7 2.7-7 7L2 12.4l.8-3.1 6.6-7.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
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
