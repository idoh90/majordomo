import { useEffect, useMemo, useReducer } from 'react'
import type { MuscleId, PplType, RepStyle, Workout } from '../../types'
import { PPL_MAP, RUN_MAP } from '../../data/muscles'
import { makeId, useWorkoutStore } from '../../store'
import { linkedEventIds, rankTrainingEventMatches } from '../../lib/fulfillment'
import { useEventsStore } from '../../../../core/events/store'
import { relativeDayLabel, timeLabel } from '../../../../core/dates'
import { voice } from '../../../../core/voice'
import { Sheet } from '../../../../core/ui/Sheet'
import type { BlockLink } from './BlockLinkNote'
import { EffortStep } from './EffortStep'
import { MethodStep } from './MethodStep'
import { MuscleStep } from './MuscleStep'
import { PplStep } from './PplStep'
import { RunStep } from './RunStep'

export type Selection = Partial<Record<MuscleId, 'primary' | 'secondary'>>

type Step = 'method' | 'ppl' | 'muscles' | 'run' | 'effort'
type Method = 'ppl' | 'custom' | 'run'

/** log-fulfills-block aim: follow the ranked match, claim a named block, or
 *  claim none. Any change of time re-ranks, so the override dies with it. */
type LinkChoice = { kind: 'auto' } | { kind: 'none' } | { kind: 'event'; id: string }

interface Draft {
  step: Step
  method: Method | null
  ppl: PplType | null
  selection: Selection
  /** run fields kept as strings — empty means "not recorded" */
  distanceKm: string
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
  | { type: 'cycle'; muscle: MuscleId }
  | { type: 'continue' }
  | { type: 'back' }
  | { type: 'distanceKm'; value: string }
  | { type: 'durationMin'; value: string }
  | { type: 'effort'; value: number }
  | { type: 'strainFeel'; value: number }
  | { type: 'repStyle'; value: RepStyle }
  | { type: 'performedAt'; value: string }
  | { type: 'link'; value: LinkChoice }
  | { type: 'reset'; draft: Draft }

/** a run's muscles are resolved at save time, like PPL — tuning RUN_MAP later
 *  never rewrites history */
function runSelection(): Selection {
  const selection: Selection = {}
  for (const m of RUN_MAP.primary) selection[m] = 'primary'
  for (const m of RUN_MAP.secondary) selection[m] = 'secondary'
  return selection
}

function reducer(d: Draft, a: Action): Draft {
  switch (a.type) {
    case 'method':
      if (a.method === 'ppl') return { ...d, method: 'ppl', step: 'ppl' }
      if (a.method === 'run')
        return { ...d, method: 'run', selection: runSelection(), repStyle: 'light', step: 'run' }
      return { ...d, method: 'custom', step: 'muscles' }
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
      if (d.step === 'effort')
        return { ...d, step: d.method === 'ppl' ? 'ppl' : d.method === 'run' ? 'run' : 'muscles' }
      if (d.step === 'ppl' || d.step === 'muscles' || d.step === 'run')
        return { ...d, step: 'method' }
      return d
    case 'distanceKm':
      return { ...d, distanceKm: a.value }
    case 'durationMin':
      return { ...d, durationMin: a.value }
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
  selection: {},
  distanceKm: '',
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
  return {
    step: 'effort',
    method: w.method,
    ppl: w.ppl ?? null,
    selection,
    distanceKm: w.run?.distanceKm != null ? String(w.run.distanceKm) : '',
    durationMin: w.run?.durationMin != null ? String(w.run.durationMin) : '',
    effort: w.effort,
    strainFeel: w.strainFeel,
    repStyle: w.repStyle ?? 'mixed',
    performedAt: w.performedAt,
    whenTouched: true,
    link: { kind: 'auto' }, // auto = whatever it already claims, until re-aimed
  }
}

const TITLES: Record<Step, string> = {
  method: 'Log Workout',
  ppl: 'What kind of day?',
  muscles: 'What did you hit?',
  run: 'How far?',
  effort: 'How did it go?',
}

const STEP_INDEX: Record<Step, number> = { method: 0, ppl: 1, muscles: 1, run: 1, effort: 2 }

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
  // COMMITTED events only — a what-if rehearsal must never be linked against
  const events = useEventsStore((s) => s.events)
  const [draft, dispatch] = useReducer(reducer, undefined, freshDraft)

  useEffect(() => {
    if (open) dispatch({ type: 'reset', draft: editing ? draftFromWorkout(editing) : freshDraft() })
  }, [open, editing])

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
    const num = (s: string) => {
      const n = Number(s)
      return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
    }
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
    const base = {
      performedAt,
      method: draft.method ?? 'custom',
      ppl: draft.method === 'ppl' ? (draft.ppl ?? undefined) : undefined,
      run:
        draft.method === 'run'
          ? { distanceKm: num(draft.distanceKm), durationMin: num(draft.durationMin) }
          : undefined,
      primary,
      secondary,
      effort: draft.effort,
      strainFeel: draft.strainFeel,
      repStyle: draft.repStyle,
      eventId,
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
        {draft.step === 'run' && (
          <RunStep
            distanceKm={draft.distanceKm}
            durationMin={draft.durationMin}
            onDistance={(value) => dispatch({ type: 'distanceKm', value })}
            onDuration={(value) => dispatch({ type: 'durationMin', value })}
            onContinue={() => dispatch({ type: 'continue' })}
          />
        )}
        {draft.step === 'effort' && (
          <EffortStep
            isRun={draft.method === 'run'}
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
            blockLink={blockLink}
            whenInitiallyOpen={devWhenOpen}
          />
        )}
      </div>
    </Sheet>
  )
}
