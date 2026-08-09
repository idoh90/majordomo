import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import type { MuscleId } from '../../modules/training/types'
import type { Selection } from '../../modules/training/components/add/AddWorkoutSheet'
import { MuscleStep } from '../../modules/training/components/add/MuscleStep'
import { RunStep, type RunFields } from '../../modules/training/components/add/RunStep'
import { useWorkoutStore } from '../../modules/training/store'

/**
 * The Grounds stop's last two beats, which SHOW the entry instead of
 * describing it: the real run step and the real muscle picker, mounted
 * straight out of the training wing so the tour cannot drift from the screen
 * the user will actually meet.
 *
 * Three rules keep it a demonstration rather than a back door:
 *
 *  1. **The draft is local, and so is the easy pace.** Distance, pace, picks
 *     and the run step's own EASY ± all live in this component's state and die
 *     with the beat — there is no save path here, and the Grounds' own sheet
 *     (the only thing that writes a workout) is untouched. The easy pace is
 *     seeded from the profile so the zones read true, and never written back:
 *     being shown a room is not consent to have a preference changed.
 *  2. **The step's own Continue is the NEXT button.** One control, not two, and
 *     it is the same control the real sheet carries — so the beat teaches the
 *     button as well as the screen. Backdrop and Esc advance the same way,
 *     which also keeps the emptied picker (Continue disables with no primary
 *     marked) from becoming a dead end.
 *  3. **It says so.** A one-line footnote, the same honesty the walk's SAMPLE
 *     tag owes elsewhere.
 *
 */

export type GroundsDemoKind = 'run' | 'muscles'

/** 8 km at 5:15/km — quicker than the 6:00 default easy pace, so the band
 *  opens on a lit zone rather than a resting one */
const SEED_RUN: RunFields = { distanceKm: '8', paceSec: 315, heldSec: 0 }

/** a push day, entirely inside PPL_MAP.push — so the twin's shape chip reads
 *  PUSH and the figure opens already glowing */
const SEED_MUSCLES: Selection = {
  chest: 'primary',
  triceps: 'primary',
  'front-delts': 'secondary',
  'side-delts': 'secondary',
}

/** the same cycle the add sheet's reducer runs: primary → secondary → clear */
const cycle = (v: Selection[MuscleId]) =>
  v === undefined ? 'primary' : v === 'primary' ? 'secondary' : undefined

interface GroundsDemoProps {
  kind: GroundsDemoKind
  /** the stop's beat position, for the shared dots */
  beat: number
  beats: number
  accent: string
  onNext: () => void
  onSkip: () => void
}

export function GroundsDemo({ kind, beat, beats, accent, onNext, onSkip }: GroundsDemoProps) {
  const [run, setRun] = useState<RunFields>(SEED_RUN)
  const [selection, setSelection] = useState<Selection>(SEED_MUSCLES)
  // read once, at mount: the zones open on the user's own easy pace, and the
  // ± moves this copy rather than the profile
  const [easySec, setEasySec] = useState(() => useWorkoutStore.getState().profile.easyPaceSec)

  const demo = voice.onboarding.walk.grounds.demo
  const copy = kind === 'run' ? demo.run : demo.muscles

  // the run step's Continue sits near the bottom of a scrolled sheet; landing
  // on the picker halfway down it would hide the heading that explains it
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 })
  }, [kind])

  return (
    <Sheet open onClose={onNext}>
      <div ref={root}>
        {/* the tour's own chrome sits ABOVE the step: the muscle picker is tall
            enough that a footer would be a scroll away on a phone */}
        <div className="mb-3 flex items-center gap-3">
          <BeatDots beat={beat} beats={beats} accent={accent} />
          <button
            type="button"
            onClick={onSkip}
            className="ml-auto min-h-11 text-[12.5px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {voice.onboarding.walk.skipRest}
          </button>
        </div>

        <h2 className="font-display text-xl font-bold tracking-wide">{copy.title}</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-dim">{copy.line}</p>
        <p className="mt-1 text-[11.5px] italic text-ink-faint">{demo.note}</p>

        <div key={kind} className="mt-4 animate-[step-in_220ms_ease-out] pb-2">
          {kind === 'run' ? (
            <RunStep
              fields={run}
              onChange={(patch) => setRun((f) => ({ ...f, ...patch }))}
              onContinue={onNext}
              easy={{ sec: easySec, onChange: setEasySec }}
            />
          ) : (
            <MuscleStep
              selection={selection}
              holdEffort={false}
              onCycle={(m) => setSelection((s) => ({ ...s, [m]: cycle(s[m]) }))}
              onContinue={onNext}
            />
          )}
        </div>
      </div>
    </Sheet>
  )
}

/** the stop's own progress, apart from the tour's — shared so the card and the
 *  demonstration sheet cannot drift apart */
export function BeatDots({
  beat,
  beats,
  accent,
}: {
  beat: number
  beats: number
  accent: string
}) {
  return (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: beats }, (_, i) => (
        <span
          key={i}
          className="h-1 w-4 rounded-full transition-colors"
          style={{ background: i <= beat ? accent : 'var(--color-panel-2)' }}
        />
      ))}
    </span>
  )
}
