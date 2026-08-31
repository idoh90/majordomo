import type { LoggedExercise, LoggedSet, MuscleId, RepStyle, Workout } from '../types'
import type { Selection } from '../components/add/AddWorkoutSheet'

/**
 * The exercise flow's pure half: draft shapes, the derivations that turn a
 * draft into a record, and the read of history that puts last session's
 * numbers beside this one's.
 *
 * Set numbers are held as STRINGS while being typed, the same convention the
 * sheet's other session-size fields use — an empty box means "not recorded",
 * which is a different thing from zero, and coercing on every keystroke would
 * fight the person mid-number.
 */

export interface DraftSet {
  weightKg: string
  reps: string
}

export interface DraftExercise {
  exerciseId: string
  name: string
  primary: MuscleId[]
  secondary: MuscleId[]
  sets: DraftSet[]
}

export const EMPTY_SET: DraftSet = { weightKg: '', reps: '' }

/** the id prefix that marks an exercise as the user's own. It cannot collide
 *  with a catalogue id (those are upstream slugs), and it is what tells a row
 *  the user wrote from one that shipped with the app. */
export const OWN_EXERCISE_PREFIX = 'cx-'

export const isOwnExercise = (id: string): boolean => id.startsWith(OWN_EXERCISE_PREFIX)

/**
 * The fold a catalogue search matches through: lower case, and every run of
 * anything that is not a letter or a digit becomes one space.
 *
 * A plain substring match made a hyphen a wall — 'chin up' found nothing while
 * 'Chin-Up' sat in the catalogue — and the only thing the picker then offered
 * was to write the typo in as your own exercise. Folding the punctuation out of
 * both sides means the way a person types a lift and the way the catalogue
 * spells it no longer have to agree.
 */
export const searchFold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** the words a query is asking for; every one of them has to appear somewhere
 *  in a row's fold, so word ORDER never decides whether a lift is findable */
export const searchTerms = (query: string): string[] =>
  searchFold(query).split(' ').filter(Boolean)

/**
 * The muscles a session's exercises add up to, in the sheet's own Selection
 * shape so every surface downstream (the effort step's chips, the header's
 * heat, save's primary/secondary arrays) keeps working untouched.
 *
 * A muscle taking the brunt anywhere takes the brunt for the session: three
 * assisting mentions do not out-vote one exercise that trains it directly.
 */
export function deriveSelection(exercises: DraftExercise[]): Selection {
  const selection: Selection = {}
  for (const e of exercises) for (const m of e.secondary) selection[m] = 'secondary'
  for (const e of exercises) for (const m of e.primary) selection[m] = 'primary'
  return selection
}

/** a typed number, or undefined for anything that isn't one — the sheet's
 *  `num` rule, kept identical so the two paths cannot disagree */
function num(s: string): number | undefined {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

/** reps are whole; 8.5 reps is a typo, not a measurement */
function count(s: string): number | undefined {
  const n = num(s)
  if (n === undefined) return undefined
  const r = Math.round(n)
  return r > 0 ? r : undefined
}

export function toLoggedExercises(exercises: DraftExercise[]): LoggedExercise[] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    primary: e.primary,
    secondary: e.secondary,
    // a set with neither number is still a set that happened — the count is
    // the part volume reads, and someone who logged four sets without typing
    // weights has told the truth about the work
    sets: e.sets.map((s) => {
      const set: LoggedSet = {}
      const w = num(s.weightKg)
      const r = count(s.reps)
      if (w !== undefined) set.weightKg = w
      if (r !== undefined) set.reps = r
      return set
    }),
  }))
}

export const totalSets = (exercises: { sets: unknown[] }[]): number =>
  exercises.reduce((n, e) => n + e.sets.length, 0)

/**
 * The rep character the logged reps imply, for the effort step to open on.
 * Only recorded reps vote — a session logged as bare set counts says nothing
 * about how heavy it was, and guessing 'mixed' from silence would overwrite a
 * stored style on an edit. null means "leave whatever is there".
 */
export function repStylePrefill(exercises: DraftExercise[]): RepStyle | null {
  const reps: number[] = []
  for (const e of exercises) for (const s of e.sets) {
    const r = count(s.reps)
    if (r !== undefined) reps.push(r)
  }
  if (reps.length === 0) return null
  const mean = reps.reduce((a, b) => a + b, 0) / reps.length
  if (mean <= 6) return 'heavy'
  if (mean >= 12) return 'light'
  return 'mixed'
}

/**
 * What this exercise looked like the last time it was logged — the numbers
 * that stand beside the empty boxes while the next session is typed.
 *
 * `workouts` arrives newest-first from the store, so the first hit wins.
 * `excludeId` drops the session being edited: a workout must never quote
 * itself back as its own history.
 */
export function lastLoggedSets(
  workouts: Workout[],
  exerciseId: string,
  excludeId?: string,
): LoggedSet[] | null {
  for (const w of workouts) {
    if (w.id === excludeId || !w.exercises) continue
    const hit = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (hit && hit.sets.length > 0) return hit.sets
  }
  return null
}

/** one set as a person reads it: '60×8', or half of it, or nothing */
export function formatSet(s: LoggedSet): string {
  if (s.weightKg !== undefined && s.reps !== undefined) return `${s.weightKg}×${s.reps}`
  if (s.weightKg !== undefined) return `${s.weightKg}kg`
  if (s.reps !== undefined) return `×${s.reps}`
  return '—'
}

export const formatSets = (sets: LoggedSet[]): string => sets.map(formatSet).join(' · ')
