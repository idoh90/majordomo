import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type {
  CatalogueExercise,
  MuscleId,
  PplType,
  RepStyle,
  SportId,
  Workout,
} from '../../types'
import { PPL_MAP, RUN_MAP } from '../../data/muscles'
import { SPORT_DOOR_OPEN, SPORT_MAP } from '../../data/sports'
import { makeId, useWorkoutStore } from '../../store'
import { linkedEventIds, rankTrainingEventMatches } from '../../lib/fulfillment'
import { useEventsStore } from '../../../../core/events/store'
import { relativeDayLabel, timeLabel } from '../../../../core/dates'
import { track } from '../../../../core/telemetry'
import { voice } from '../../../../core/voice'
import { Sheet } from '../../../../core/ui/Sheet'
import { ConfirmDialog } from '../../../../core/ui/ConfirmDialog'
import type { BlockLink } from './BlockLinkNote'
import { EffortStep } from './EffortStep'
import { ExercisesStep } from './ExercisesStep'
import { MethodStep } from './MethodStep'
import { MuscleStep } from './MuscleStep'
import { PplStep } from './PplStep'
import { SportStep } from './SportStep'
import { DEFAULT_PACE, EMPTY_RUN_FIELDS, RunStep, runFieldSeconds, type RunFields } from './RunStep'
import { secondsToMinutes } from '../../lib/runs'
import { gymEffort, gymEffortPrefill } from '../../lib/gymEffort'
import {
  deriveSelection,
  EMPTY_SET,
  toLoggedExercises,
  totalSets,
  type DraftExercise,
  type DraftSet,
} from '../../lib/exercises'
import { recastLoss, type LogMethod, type RecastLoss } from '../../lib/recast'
import { clampPace, EFFORT_LIVE, runEffort } from '../../lib/pace'
import { strainToColor } from '../../lib/strainColor'
import { SKINS } from '../../../../core/ui/skins'
import { useShellStore } from '../../../../core/store/shell'

export type Selection = Partial<Record<MuscleId, 'primary' | 'secondary'>>

type Step = 'method' | 'ppl' | 'muscles' | 'run' | 'sport' | 'exercises' | 'effort'
/** 'exercises' is a DRAFT method only — it saves as 'custom' with an exercise
 *  list attached, so nothing that classifies a session has to learn a shape.
 *  The union lives in lib/recast, which is the other thing that reasons about
 *  which method carries what. */
type Method = LogMethod

/** log-fulfills-block aim: follow the ranked match, claim a named block, or
 *  claim none. Any change of time re-ranks, so the override dies with it. */
type LinkChoice = { kind: 'auto' } | { kind: 'none' } | { kind: 'event'; id: string }

interface Draft {
  step: Step
  method: Method | null
  ppl: PplType | null
  sportKind: SportId | null
  selection: Selection
  /** run fields kept as strings — empty means "not recorded" */
  run: RunFields
  /** the named exercises this session holds, in the order they were added —
   *  only ever filled by the exercise flow. Its sets are strings while typed,
   *  the same "empty means not recorded" rule the fields below follow. */
  exercises: DraftExercise[]
  /** lift session size, same string convention — empty means "not recorded" */
  setsTotal: string
  durationMin: string
  effort: number
  strainFeel: number
  repStyle: RepStyle
  performedAt: string
  /** true once the user picked a date/time — otherwise new workouts stamp save time */
  whenTouched: boolean
  link: LinkChoice
}

type Action =
  | { type: 'method'; method: Method }
  | { type: 'ppl'; ppl: PplType }
  | { type: 'sport'; kind: SportId }
  | { type: 'cycle'; muscle: MuscleId }
  | { type: 'continue' }
  | { type: 'back' }
  | { type: 'exercise-add'; exercise: CatalogueExercise }
  | { type: 'exercise-edited'; exercise: CatalogueExercise }
  | { type: 'exercise-remove'; index: number }
  | { type: 'set-add'; exercise: number }
  | { type: 'set-remove'; exercise: number; set: number }
  | { type: 'set-edit'; exercise: number; set: number; patch: Partial<DraftSet> }
  | { type: 'run'; patch: Partial<RunFields> }
  | { type: 'session'; patch: Partial<Pick<Draft, 'setsTotal' | 'durationMin'>> }
  | { type: 'effort'; value: number }
  | { type: 'strainFeel'; value: number }
  | { type: 'repStyle'; value: RepStyle }
  | { type: 'performedAt'; value: string }
  | { type: 'link'; value: LinkChoice }
  | { type: 'reset'; draft: Draft }

/** the muscles a PPL day resolves to — copied onto the record at save, so
 *  tuning PPL_MAP later never rewrites history. Shared with the step's effort
 *  prefill: the day and the effort it suggests must read the same spread. */
function pplSelection(ppl: PplType): Selection {
  const selection: Selection = {}
  for (const m of PPL_MAP[ppl].primary) selection[m] = 'primary'
  for (const m of PPL_MAP[ppl].secondary) selection[m] = 'secondary'
  return selection
}

/** a run's muscles are resolved at save time, like PPL — tuning RUN_MAP later
 *  never rewrites history */
function runSelection(): Selection {
  const selection: Selection = {}
  for (const m of RUN_MAP.primary) selection[m] = 'primary'
  for (const m of RUN_MAP.secondary) selection[m] = 'secondary'
  return selection
}

/** the exercise list and the muscles it implies always move together — the
 *  selection is what every surface downstream already reads (the effort step's
 *  chips, the header's heat, save's two arrays), so the exercise flow keeps it
 *  current instead of teaching them all a second source */
const withExercises = (d: Draft, exercises: DraftExercise[]): Draft => ({
  ...d,
  exercises,
  selection: deriveSelection(exercises),
})

/** editing one exercise's sets leaves the muscles alone — only adding or
 *  removing an exercise can change what the session trained */
const withSets = (d: Draft, index: number, sets: DraftSet[]): Draft => ({
  ...d,
  exercises: d.exercises.map((e, i) => (i === index ? { ...e, sets } : e)),
})

function reducer(d: Draft, a: Action): Draft {
  switch (a.type) {
    case 'method':
      if (a.method === 'ppl') return { ...d, method: 'ppl', step: 'ppl' }
      if (a.method === 'exercises')
        return {
          ...d,
          method: 'exercises',
          step: 'exercises',
          // arriving from ANOTHER door, the muscles that door installed are not
          // this session's — the list is (withExercises' rule), so re-derive.
          // Re-entering the same door changes nothing, which is what keeps a
          // stored selection round-tripping verbatim on an untouched edit.
          selection: d.method === 'exercises' ? d.selection : deriveSelection(d.exercises),
        }
      if (a.method === 'run')
        return { ...d, method: 'run', selection: runSelection(), repStyle: 'light', step: 'run' }
      // the two ways into the sport step, both sealed while the door is shut,
      // so no build can reach a step it has no picker for (the other is 'back')
      if (a.method === 'sport') return SPORT_DOOR_OPEN ? { ...d, method: 'sport', step: 'sport' } : d
      return { ...d, method: 'custom', step: 'muscles' }
    case 'ppl':
      return { ...d, ppl: a.ppl, selection: pplSelection(a.ppl), step: 'effort' }
    case 'sport': {
      // resolved at save time like PPL and runs — tuning SPORT_MAP later never
      // rewrites history; the rep character is the sport's, not the user's
      const map = SPORT_MAP[a.kind]
      const selection: Selection = {}
      for (const m of map.primary) selection[m] = 'primary'
      for (const m of map.secondary) selection[m] = 'secondary'
      return { ...d, sportKind: a.kind, selection, repStyle: map.repStyle }
    }
    case 'cycle': {
      const current = d.selection[a.muscle]
      const next =
        current === undefined ? 'primary' : current === 'primary' ? 'secondary' : undefined
      return { ...d, selection: { ...d.selection, [a.muscle]: next } }
    }
    case 'exercise-add':
      return withExercises(d, [
        ...d.exercises,
        {
          exerciseId: a.exercise.id,
          // name and muscles are COPIED, not referenced: the PPL rule, so a
          // later catalogue re-vendor cannot rewrite what a session recorded
          name: a.exercise.name,
          primary: a.exercise.primary,
          secondary: a.exercise.secondary,
          sets: [EMPTY_SET],
        },
      ])
    case 'exercise-edited': {
      // A correction made from the picker while this session already holds the
      // exercise. The draft carries a COPY (the PPL rule — a re-vendored
      // catalogue must never rewrite a record), so it has to be told, or the
      // card would keep the typo the picker has just stopped showing. Only the
      // OPEN draft is touched: sessions already saved keep their own copies.
      const hit = d.exercises.some((e) => e.exerciseId === a.exercise.id)
      if (!hit) return d
      return withExercises(
        d,
        d.exercises.map((e) =>
          e.exerciseId === a.exercise.id
            ? {
                ...e,
                name: a.exercise.name,
                primary: a.exercise.primary,
                secondary: a.exercise.secondary,
              }
            : e,
        ),
      )
    }
    case 'exercise-remove':
      return withExercises(
        d,
        d.exercises.filter((_, i) => i !== a.index),
      )
    case 'set-add': {
      const sets = d.exercises[a.exercise]?.sets ?? []
      // a new set repeats the last one — the same weight for the same reps is
      // what the next set usually is, and it is one tap to change
      return withSets(d, a.exercise, [...sets, sets[sets.length - 1] ?? EMPTY_SET])
    }
    case 'set-remove':
      return withSets(
        d,
        a.exercise,
        (d.exercises[a.exercise]?.sets ?? []).filter((_, i) => i !== a.set),
      )
    case 'set-edit':
      return withSets(
        d,
        a.exercise,
        (d.exercises[a.exercise]?.sets ?? []).map((s, i) =>
          i === a.set ? { ...s, ...a.patch } : s,
        ),
      )
    case 'continue':
      return { ...d, step: 'effort' }
    case 'back':
      if (d.step === 'effort') {
        // editing an existing sport session while the door is shut: the picker
        // it would step back to does not exist in this build, and stepping to
        // 'method' instead would offer to silently re-cast the record as a run.
        // Nothing behind it, so nothing happens — the header hides the control
        // to match (see `canBack`).
        if (d.method === 'sport' && !SPORT_DOOR_OPEN) return d
        return {
          ...d,
          step:
            d.method === 'ppl'
              ? 'ppl'
              : d.method === 'run'
                ? 'run'
                : d.method === 'sport'
                  ? 'sport'
                  : d.method === 'exercises'
                    ? 'exercises'
                    : 'muscles',
        }
      }
      if (
        d.step === 'ppl' ||
        d.step === 'muscles' ||
        d.step === 'run' ||
        d.step === 'sport' ||
        d.step === 'exercises'
      )
        return { ...d, step: 'method' }
      return d
    case 'run':
      return { ...d, run: { ...d.run, ...a.patch } }
    case 'session':
      return { ...d, ...a.patch }
    case 'effort':
      return { ...d, effort: a.value }
    case 'strainFeel':
      return { ...d, strainFeel: a.value }
    case 'repStyle':
      return { ...d, repStyle: a.value }
    case 'performedAt':
      // a new time re-ranks the candidates — an aim taken at the old one is void
      return { ...d, performedAt: a.value, whenTouched: true, link: { kind: 'auto' } }
    case 'link':
      return { ...d, link: a.value }
    case 'reset':
      return a.draft
  }
}

const freshDraft = (): Draft => ({
  step: 'method',
  method: null,
  ppl: null,
  sportKind: null,
  selection: {},
  exercises: [],
  run: EMPTY_RUN_FIELDS,
  setsTotal: '',
  durationMin: '',
  effort: 7,
  strainFeel: 6,
  repStyle: 'mixed',
  performedAt: new Date().toISOString(),
  whenTouched: false,
  link: { kind: 'auto' },
})

function draftFromWorkout(w: Workout): Draft {
  const selection: Selection = {}
  for (const m of w.primary) selection[m] = 'primary'
  for (const m of w.secondary) selection[m] = 'secondary'
  // a stored clock re-enters as a HELD number: the slider seeds from the pace
  // it implies, but the clock itself is quoted verbatim until pace or distance
  // is touched — opening and saving never requantizes it
  const storedSec = w.run?.durationMin != null ? Math.round(w.run.durationMin * 60) : 0
  const storedKm = w.run?.distanceKm
  return {
    step: 'effort',
    // a stored session re-enters the flow it was logged through, so Back leads
    // to the step that made it rather than to a picker it never used
    method: w.exercises?.length ? 'exercises' : w.method,
    ppl: w.ppl ?? null,
    sportKind: w.sport?.kind ?? null,
    selection,
    // the STORED muscles win on open, not the ones the exercises imply: an
    // edit that touches nothing must round-trip verbatim, and the derivation
    // only re-runs when an exercise is actually added or removed
    exercises: (w.exercises ?? []).map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      primary: e.primary,
      secondary: e.secondary,
      sets: e.sets.map((s) => ({
        weightKg: s.weightKg != null ? String(s.weightKg) : '',
        reps: s.reps != null ? String(s.reps) : '',
      })),
    })),
    run: {
      distanceKm: storedKm != null ? String(storedKm) : '',
      paceSec:
        storedSec > 0 && storedKm ? clampPace(Math.round(storedSec / storedKm)) : DEFAULT_PACE,
      heldSec: storedSec,
    },
    setsTotal: w.setsTotal != null ? String(w.setsTotal) : '',
    durationMin: w.durationMin != null ? String(w.durationMin) : '',
    effort: w.effort,
    strainFeel: w.strainFeel,
    repStyle: w.repStyle ?? 'mixed',
    performedAt: w.performedAt,
    whenTouched: true,
    link: { kind: 'auto' }, // auto = whatever it already claims, until re-aimed
  }
}

/** the clock a run's fields state, in the minutes the store holds */
const runDurationMin = (f: RunFields): number | undefined => {
  const sec = runFieldSeconds(f)
  return sec > 0 ? secondsToMinutes(sec) : undefined
}

/** every field the user can change — the step they stand on is not one, and
 *  neither is HOW a run's clock was typed: a time and a pace are two ways of
 *  stating one number, so dirty compares the number, not the boxes. */
const fingerprint = (d: Draft) =>
  JSON.stringify({
    ...d,
    step: undefined,
    run: { distanceKm: d.run.distanceKm, seconds: runFieldSeconds(d.run) },
  })

const TITLES: Record<Step, string> = {
  method: 'Log Workout',
  ppl: 'What kind of day?',
  muscles: 'What did you hit?',
  run: 'How far?',
  sport: voice.grounds.sport.stepTitle,
  exercises: voice.grounds.exercises.stepTitle,
  effort: 'How did it go?',
}

/** the method step's title depends on whose session it is: 'Log Workout' over
 *  an existing record reads as a blank slate, which is exactly how a recast
 *  came to feel like starting a new one */
const stepTitle = (step: Step, editing: boolean): string =>
  step === 'method' && editing ? voice.grounds.recast.stepTitle : TITLES[step]

const STEP_INDEX: Record<Step, number> = {
  method: 0,
  ppl: 1,
  muscles: 1,
  run: 1,
  sport: 1,
  exercises: 1,
  effort: 2,
}

interface AddWorkoutSheetProps {
  open: boolean
  editing: Workout | null
  onClose: () => void
  /** dev screenshot aid — open the When calendar immediately */
  devWhenOpen?: boolean
  /** dev screenshot aid — start the blank flow on the sport picker, the
      muscle picker or the exercise list */
  devStartStep?: 'sport' | 'muscles' | 'exercises'
}

export function AddWorkoutSheet({
  open,
  editing,
  onClose,
  devWhenOpen,
  devStartStep,
}: AddWorkoutSheetProps) {
  const addWorkout = useWorkoutStore((s) => s.addWorkout)
  const updateWorkout = useWorkoutStore((s) => s.updateWorkout)
  const workouts = useWorkoutStore((s) => s.workouts)
  const easyPace = useWorkoutStore((s) => s.profile.easyPaceSec)
  const heatRamp = SKINS[useShellStore((s) => s.skin)].heatRamp
  // COMMITTED events only — a what-if rehearsal must never be linked against
  const events = useEventsStore((s) => s.events)
  const [draft, dispatch] = useReducer(reducer, undefined, freshDraft)
  /** the draft as the sheet opened — what "dirty" is measured against */
  const opened = useRef<Draft>(draft)
  /** a method change held at the door because it would cost the session
   *  something no other method carries — see lib/recast */
  const [recast, setRecast] = useState<{ method: Method; loss: RecastLoss } | null>(null)

  useEffect(() => {
    if (!open) return
    const fresh = editing ? draftFromWorkout(editing) : freshDraft()
    opened.current = fresh
    setRecast(null) // a stale guard must never greet the next opening
    dispatch({ type: 'reset', draft: fresh })
    if (devStartStep && !editing)
      dispatch({
        type: 'method',
        method:
          devStartStep === 'sport' ? 'sport' : devStartStep === 'exercises' ? 'exercises' : 'custom',
      })
  }, [open, editing, devStartStep])

  /** anything the user has chosen — step position alone doesn't count, since
   *  reaching a step always means a choice was made to get there. Sheet owns
   *  the confirm itself (the Ledger's close guard); this only feeds it. */
  const dirty = fingerprint(draft) !== fingerprint(opened.current)

  /** the scheduled block this session would fulfil, and every block it could
   *  (log-fulfills-block). Editing without touching the time keeps the
   *  existing link — including no link — until the picker says otherwise. */
  const { options, matchedEvent } = useMemo(() => {
    const linked = linkedEventIds(workouts)
    if (editing?.eventId) linked.delete(editing.eventId) // its own block stays claimable
    const ranked = rankTrainingEventMatches(events, draft.performedAt, linked)
    const untouchedEdit = editing !== null && draft.performedAt === editing.performedAt
    const held =
      untouchedEdit && editing.eventId
        ? (events.find((e) => e.id === editing.eventId) ?? null)
        : null
    // a held block that has drifted out of match range still belongs in the list
    const options = held && !ranked.some((e) => e.id === held.id) ? [held, ...ranked] : ranked
    const auto = untouchedEdit ? held : (ranked[0] ?? null)
    const link = draft.link
    const matchedEvent =
      link.kind === 'none'
        ? null
        : link.kind === 'event'
          ? (options.find((e) => e.id === link.id) ?? auto)
          : auto
    return { options, matchedEvent }
  }, [events, workouts, draft.performedAt, draft.link, editing])

  const now = new Date()
  // no match and no deliberate opt-out (which keeps the picker reachable) = no note
  const showLink = matchedEvent !== null || (draft.link.kind === 'none' && options.length > 1)
  const blockLink: BlockLink | null = showLink
    ? {
        line: matchedEvent
          ? voice.grounds.fulfils({
              day: relativeDayLabel(matchedEvent.start, now),
              time: timeLabel(matchedEvent.start),
            })
          : voice.grounds.fulfilsNothing,
        options: options.map((e) => ({
          id: e.id,
          title: e.title,
          when: `${relativeDayLabel(e.start, now)} · ${timeLabel(e.start)}`,
        })),
        selectedId: matchedEvent?.id ?? null,
        onSelect: (id) =>
          dispatch({ type: 'link', value: id ? { kind: 'event', id } : { kind: 'none' } }),
      }
    : null

  /** the one thing that stands between a draft and the store: a run that
   *  states neither a distance nor a clock. It would save as a session that
   *  knows neither how far nor how long — em-dashes on the RUNS card, and half
   *  an hour on the Manor from the block fallback, none of it claimed. */
  const saveBlocked =
    draft.method === 'run' && runFieldSeconds(draft.run) === 0
      ? voice.grounds.runNeedsDetail
      : null

  const save = () => {
    if (saveBlocked !== null) return
    const primary: MuscleId[] = []
    const secondary: MuscleId[] = []
    for (const [m, kind] of Object.entries(draft.selection) as [
      MuscleId,
      'primary' | 'secondary' | undefined,
    ][]) {
      if (kind === 'primary') primary.push(m)
      else if (kind === 'secondary') secondary.push(m)
    }
    const num = (s: string) => {
      const n = Number(s)
      return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
    }
    /** session-size entries are whole numbers; a rounded-to-zero entry is
     *  "not recorded", never a stored 0 */
    const count = (s: string) => {
      const n = num(s)
      if (n === undefined) return undefined
      const r = Math.round(n)
      return r > 0 ? r : undefined
    }
    const isConditioning = draft.method === 'run' || draft.method === 'sport'
    // a workout cannot have happened in the future — the picker's rule for days
    // and times, enforced once more at the save instant, where a sheet left open
    // has drifted past its own stamp. A moment that still stands is kept
    // VERBATIM, so an edit's "time untouched" test survives the round trip.
    const nowMs = Date.now()
    const performedAt =
      draft.whenTouched && new Date(draft.performedAt).getTime() <= nowMs
        ? draft.performedAt
        : new Date(nowMs).toISOString()
    // re-resolve at save-instant: an untouched new workout stamps NOW, and a
    // rematch that finds nothing must clear a stale link (eventId: undefined).
    // A block picked by hand outranks the rematch while it stays in range.
    const eventId = (() => {
      const link = draft.link
      if (link.kind === 'none') return undefined
      if (editing && performedAt === editing.performedAt) {
        return link.kind === 'event' ? link.id : editing.eventId
      }
      const linked = linkedEventIds(workouts)
      if (editing?.eventId) linked.delete(editing.eventId)
      const ranked = rankTrainingEventMatches(events, performedAt, linked)
      if (link.kind === 'event' && ranked.some((e) => e.id === link.id)) return link.id
      return ranked[0]?.id
    })()
    // the exercise flow saves as a custom session carrying its list — listed in
    // `base` even when empty so re-casting an edit through another method
    // CLEARS a stale list rather than leaving it behind the shallow merge
    const viaExercises = draft.method === 'exercises'
    const exercises = viaExercises ? toLoggedExercises(draft.exercises) : undefined
    const method: Workout['method'] =
      draft.method === null || draft.method === 'exercises' ? 'custom' : draft.method
    const base = {
      performedAt,
      method,
      exercises,
      ppl: draft.method === 'ppl' ? (draft.ppl ?? undefined) : undefined,
      run:
        draft.method === 'run'
          ? { distanceKm: num(draft.run.distanceKm), durationMin: runDurationMin(draft.run) }
          : undefined,
      sport:
        draft.method === 'sport' && draft.sportKind ? { kind: draft.sportKind } : undefined,
      primary,
      secondary,
      effort: draft.effort,
      strainFeel: draft.strainFeel,
      // lifts only — a run's clock lives in run.durationMin, and conditioning
      // has no working sets to count. A session logged exercise by exercise
      // COUNTS its sets instead of being asked for them.
      setsTotal: viaExercises
        ? (totalSets(exercises ?? []) || undefined)
        : isConditioning
          ? undefined
          : count(draft.setsTotal),
      durationMin: isConditioning ? undefined : count(draft.durationMin),
      repStyle: draft.repStyle,
      eventId,
    }
    if (editing) updateWorkout(editing.id, base)
    else {
      addWorkout({ ...base, id: makeId(), createdAt: new Date().toISOString() })
      // new sessions only — an edit is bookkeeping, not another workout
      track('workout_logged', {
        kind: draft.method === 'run' ? 'run' : draft.method === 'sport' ? 'sport' : 'lift',
      })
    }
    onClose()
  }

  // 1c/3a: while the run or muscle step is up, the header's live dot warms
  // with the pace or the picks
  const runKmN = Number(draft.run.distanceKm)
  const runEff = runEffort(
    easyPace,
    Number.isFinite(runKmN) && runKmN > 0 ? runKmN : 0,
    draft.run.paceSec,
  )
  const stepEff =
    draft.step === 'run' ? runEff : draft.step === 'muscles' ? gymEffort(draft.selection) : 0
  const dotHeat =
    stepEff > EFFORT_LIVE ? strainToColor(Math.max(stepEff, 1.2), heatRamp) : null

  /** the picks exactly as the sheet opened — an edit whose picks were never
   *  touched keeps its recorded effort (the run step's held-clock rule) */
  const selKey = (s: Selection) =>
    JSON.stringify(Object.entries(s).filter(([, v]) => v !== undefined).sort())
  const muscleUntouched =
    editing !== null && selKey(draft.selection) === selKey(opened.current.selection)

  /** the twin draws the whole body, so it needs the log this session lands on
   *  — minus the session being edited, whose stored copy would otherwise be
   *  counted alongside the draft that replaces it */
  const priorWorkouts = useMemo(
    () => (editing ? workouts.filter((w) => w.id !== editing.id) : workouts),
    [workouts, editing],
  )
  /** one instant for the whole visit: a clock that ticks per render would
   *  recompute every muscle's decay on every keystroke */
  const nowMs = useMemo(() => Date.now(), [open])
  const twinDraft = useMemo(
    () => ({
      performedAt: draft.performedAt,
      effort: draft.effort,
      strainFeel: draft.strainFeel,
      repStyle: draft.repStyle,
    }),
    [draft.performedAt, draft.effort, draft.strainFeel, draft.repStyle],
  )

  /** a Back control is only drawn where there is a step behind — the method
   *  step is the first, and a sport session's picker is shut in this build,
   *  so the arrow must not promise a move the reducer will refuse */
  const canBack =
    draft.step !== 'method' && !(draft.step === 'effort' && draft.method === 'sport' && !SPORT_DOOR_OPEN)

  /** Save writes every method's fields, so taking a different door drops
   *  whatever only the old one carried — on an edit that is a deletion from
   *  the record, with no undo behind it. A change that costs nothing goes
   *  straight through; one that costs something says so first. */
  const chooseMethod = (method: Method) => {
    const loss = recastLoss(draft, method)
    if (loss) setRecast({ method, loss })
    else dispatch({ type: 'method', method })
  }

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <div className="mb-4 flex items-center gap-2">
        {canBack && (
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
        <h2 className="font-display text-xl font-bold tracking-wide">
          {stepTitle(draft.step, editing !== null)}
        </h2>
        <div className="ml-auto flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === STEP_INDEX[draft.step] ? 'w-5 bg-accent' : 'w-1.5 bg-panel-3'
              }`}
              style={
                i === STEP_INDEX[draft.step] && dotHeat ? { background: dotHeat } : undefined
              }
            />
          ))}
        </div>
      </div>

      <div key={draft.step} className="animate-[step-in_220ms_ease-out] pb-2">
        {draft.step === 'method' && (
          <MethodStep current={editing ? draft.method : null} onChoose={chooseMethod} />
        )}
        {draft.step === 'ppl' && (
          <PplStep
            value={draft.ppl}
            onChoose={(ppl) => {
              // The same session must earn the same effort whichever door it
              // came through: a PPL day is a set of muscle picks like any
              // other, so it is priced by the same function the muscle and
              // exercise steps use. Left to the draft's own default, PUSH
              // arrived at 7 while its four muscles picked by hand arrived at
              // 4 — and effort is the dominant term in the strain model and
              // feeds the calorie target, so the button pressed on the first
              // screen was quietly deciding both.
              // An edit re-tapping the day it was recorded as holds its
              // recorded effort — the muscle step's held-effort rule, keyed on
              // the day rather than on the picks it resolves to.
              const hold = editing !== null && ppl === opened.current.ppl
              const prefill = hold ? null : gymEffortPrefill(pplSelection(ppl))
              if (prefill !== null) dispatch({ type: 'effort', value: prefill })
              dispatch({ type: 'ppl', ppl })
            }}
          />
        )}
        {draft.step === 'muscles' && (
          <MuscleStep
            selection={draft.selection}
            holdEffort={muscleUntouched}
            workouts={priorWorkouts}
            draft={twinDraft}
            nowMs={nowMs}
            onCycle={(muscle) => dispatch({ type: 'cycle', muscle })}
            onContinue={(effortPrefill) => {
              if (effortPrefill !== null) dispatch({ type: 'effort', value: effortPrefill })
              dispatch({ type: 'continue' })
            }}
          />
        )}
        {draft.step === 'exercises' && (
          <ExercisesStep
            exercises={draft.exercises}
            workouts={workouts}
            editingId={editing?.id}
            holdEffort={muscleUntouched}
            onAdd={(exercise) => dispatch({ type: 'exercise-add', exercise })}
            onEdited={(exercise) => dispatch({ type: 'exercise-edited', exercise })}
            onRemove={(index) => dispatch({ type: 'exercise-remove', index })}
            onSetAdd={(exercise) => dispatch({ type: 'set-add', exercise })}
            onSetRemove={(exercise, set) => dispatch({ type: 'set-remove', exercise, set })}
            onSetEdit={(exercise, set, patch) =>
              dispatch({ type: 'set-edit', exercise, set, patch })
            }
            onContinue={(effortPrefill, repStyle) => {
              if (effortPrefill !== null) dispatch({ type: 'effort', value: effortPrefill })
              if (repStyle !== null) dispatch({ type: 'repStyle', value: repStyle })
              dispatch({ type: 'continue' })
            }}
          />
        )}
        {draft.step === 'sport' && (
          <SportStep
            value={draft.sportKind}
            onChoose={(kind) => dispatch({ type: 'sport', kind })}
            onContinue={() => dispatch({ type: 'continue' })}
          />
        )}
        {draft.step === 'run' && (
          <RunStep
            fields={draft.run}
            onChange={(patch) => dispatch({ type: 'run', patch })}
            onContinue={(effortPrefill) => {
              if (effortPrefill !== null) dispatch({ type: 'effort', value: effortPrefill })
              dispatch({ type: 'continue' })
            }}
          />
        )}
        {draft.step === 'effort' && (
          <EffortStep
            isRun={draft.method === 'run'}
            isSport={draft.method === 'sport'}
            selection={draft.selection}
            effort={draft.effort}
            strainFeel={draft.strainFeel}
            repStyle={draft.repStyle}
            setsTotal={draft.setsTotal}
            durationMin={draft.durationMin}
            countedSets={
              draft.method === 'exercises'
                ? { sets: totalSets(draft.exercises), exercises: draft.exercises.length }
                : null
            }
            onEffort={(value) => dispatch({ type: 'effort', value })}
            onStrainFeel={(value) => dispatch({ type: 'strainFeel', value })}
            onRepStyle={(value) => dispatch({ type: 'repStyle', value })}
            onSession={(patch) => dispatch({ type: 'session', patch })}
            editing={editing !== null}
            performedAt={draft.performedAt}
            onPerformedAt={(value) => dispatch({ type: 'performedAt', value })}
            workouts={workouts}
            onSave={save}
            saveBlocked={saveBlocked}
            blockLink={blockLink}
            whenInitiallyOpen={devWhenOpen}
          />
        )}
      </div>

      <ConfirmDialog
        open={recast !== null}
        title={voice.grounds.recast.confirmTitle}
        message={recast ? voice.grounds.recast.confirmBody(recast.loss) : undefined}
        confirmLabel={voice.grounds.recast.confirmLabel}
        onConfirm={() => {
          if (recast) dispatch({ type: 'method', method: recast.method })
          setRecast(null)
        }}
        onCancel={() => setRecast(null)}
      />
    </Sheet>
  )
}
