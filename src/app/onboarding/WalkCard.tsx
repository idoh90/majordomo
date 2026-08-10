import { useEffect, useState } from 'react'
import { useEventsStore } from '../../core/events/store'
import { useNavStore } from '../../core/store/nav'
import { useShellStore } from '../../core/store/shell'
import { voice } from '../../core/voice'
import { useStudyStore } from '../../modules/study/store'
import { useWorkoutStore } from '../../modules/training/store'
import { useWorkshopStore } from '../../modules/workshop/store'
import { useWorkshopUi } from '../../modules/workshop/uiStore'
import { shiftsOf, watchStats } from '../../modules/watch/lib'
import { BeatDots, GroundsDemo, type GroundsDemoKind } from './GroundsDemo'
import { dressWing, sampleDressed, sweepSample } from './sample'
import { WALK_WING, useOnboarding, type OnboardStage } from './store'

/**
 * The walk — four stops, one per wing, three beats at each, and no coach-mark
 * machinery. The highlight is the tab bar's own active-wing accent: the card
 * sends the user to a wing and the chrome already says which one they are
 * standing in.
 *
 * Beat one says what the wing is FOR, beat two narrates what is on screen,
 * beat three closes with how it is best used — composed from what the user
 * just built wherever they built anything.
 *
 * The Grounds stop runs two beats longer, and those two are not narration at
 * all: they mount the wing's real run step and real muscle picker (see
 * GroundsDemo). Entry is the best thing in that wing and a sentence about it
 * is a waste of the stop. The demonstration replaces the card rather than
 * sitting over it — one surface at a time, and a bottom-anchored card would
 * land squarely on a bottom-anchored sheet.
 *
 * A wing the user left empty is DRESSED for its stop (see sample.ts): demo
 * records fill the room so beat two has something to point at, a SAMPLE tag
 * owns up to the costume, and the sweep takes it off the moment the tour moves
 * on. A wing the user furnished shows their own records and is never touched.
 */

/** each stop borrows its wing's accent, so the card and the lit tab agree */
const WING_ACCENT: Record<string, string> = {
  watch: 'var(--color-w-watch)',
  training: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
  workshop: 'var(--color-w-workshop)',
  capital: 'var(--color-w-ledger)',
}

/** every stop narrates in three beats */
const BEATS = 3

/** …and the Grounds adds two demonstrations after them, in this order */
const GROUNDS_DEMOS: GroundsDemoKind[] = ['run', 'muscles']

/**
 * The Workshop runs one beat long, and that beat is a change of room rather
 * than a change of sentence: the pegboard is the best thing in the wing and it
 * sits one tap behind the shelf, so the stop opens it and narrates from there.
 * It goes third, not last, so this stop still CLOSES on how the wing is best
 * used — the shape every other stop keeps.
 */
const BOARD_BEAT = 2

const beatsOf = (stage: OnboardStage) =>
  stage === 'walk-grounds'
    ? BEATS + GROUNDS_DEMOS.length
    : stage === 'walk-workshop'
      ? BEATS + 1
      : BEATS

export function WalkCard({ stage }: { stage: OnboardStage }) {
  const advance = useOnboarding((s) => s.advance)
  const finish = useOnboarding((s) => s.finish)
  const go = useOnboarding((s) => s.go)

  const events = useEventsStore((s) => s.events)
  const weekStart = useShellStore((s) => s.weekStart)
  const goal = useWorkoutStore((s) => s.weeklyGoal)
  const subjects = useStudyStore((s) => s.subjects)

  const closing = stage === 'close'
  const wing = WALK_WING[stage] ?? 'manor'

  // the stop IS the navigation: the wing opens, its tab lights, the card
  // speaks. Dressing rides the same effect — and the cleanup is the sweep, so
  // leaving a stop by ANY door (NEXT, skip-the-rest, a finish) strikes the set.
  useEffect(() => {
    useNavStore.getState().requestView(wing)
    if (!closing) dressWing(wing)
    return () => sweepSample()
  }, [wing, closing])

  // beats restart at each stop; a reload mid-stop restarts the stop — harmless
  const [beat, setBeat] = useState(0)
  useEffect(() => setBeat(0), [stage])

  // the Workshop's fourth beat opens a venture's pegboard through the wing's
  // own mailbox — the same door the bench chip uses, so the tour cannot drift
  // from the screen the user will actually meet. Whichever venture is first is
  // the one dressed a moment ago (or their own, if they opened one at setup).
  useEffect(() => {
    if (stage !== 'walk-workshop' || beat < BOARD_BEAT) return
    const ws = useWorkshopStore.getState()
    const live = ws.ventures.filter((v) => !v.archived)
    // the one with a board on it — a venture named at setup has none yet, and
    // opening THAT would narrate a pegboard over an empty wall
    const best =
      live.find((v) => ws.cards.some((c) => c.ventureId === v.id)) ?? live[0]
    if (best) useWorkshopUi.getState().requestBoard(best.id)
  }, [stage, beat])

  // subscribing to the stores above keeps this honest through dress and sweep
  const dressed = !closing && sampleDressed()
  const accent = WING_ACCENT[wing] ?? 'var(--color-accent)'
  const beats = closing ? 1 : beatsOf(stage)

  /** past the three narration beats, the Grounds stop is showing rather than
   *  telling — and there is no card line to compose */
  const demoKind =
    stage === 'walk-grounds' ? (GROUNDS_DEMOS[beat - BEATS] ?? null) : null

  let line = ''
  if (closing) {
    line = voice.onboarding.close.line
  } else if (!demoKind) {
    const stop = walkStop(stage, { events, weekStart, goal, subjects })
    // `board` is a middle beat where a stop has one, so every stop still ends
    // on `use` however many beats it runs
    const lines = [stop.meaning, stop.dashboard, ...(stop.board ? [stop.board] : []), stop.use]
    line = lines[beat] ?? stop.use
  }

  const lastBeat = closing || beat >= beats - 1

  const next = () => {
    if (closing) {
      finish()
      return
    }
    if (!lastBeat) {
      setBeat(beat + 1)
      return
    }
    advance()
  }

  // the demonstration IS the beat — it carries the dots and the way out itself
  if (demoKind) {
    return (
      <GroundsDemo
        kind={demoKind}
        beat={beat}
        beats={beats}
        accent={accent}
        onNext={next}
        onSkip={() => go('close')}
      />
    )
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex justify-center md:inset-x-0 md:bottom-6">
      <div
        className="menu-panel pointer-events-auto w-full max-w-[440px] border-l-[3px] px-4 py-3.5"
        style={closing ? undefined : { borderLeftColor: accent }}
        role="dialog"
        aria-live="polite"
      >
        {dressed && (
          <div className="mb-2 flex items-center gap-2">
            <span
              className="rounded-pill border px-2 py-0.5 text-[9px] font-semibold tracking-[0.16em]"
              style={{
                color: accent,
                borderColor: `color-mix(in srgb, ${accent} 50%, transparent)`,
              }}
            >
              {voice.onboarding.walk.sampleTag}
            </span>
            <span className="text-[10.5px] italic text-ink-faint">
              {voice.onboarding.walk.sampleNote}
            </span>
          </div>
        )}

        <p key={beat} className="min-h-10 text-[13.5px] leading-snug text-ink animate-[fade-in_200ms_ease-out]">
          {line}
        </p>

        <div className="mt-3 flex items-center gap-3">
          {!closing && (
            <>
              <BeatDots beat={beat} beats={beats} accent={accent} />
              <button
                type="button"
                onClick={() => go('close')}
                className="ml-1 min-h-11 text-[12.5px] text-ink-faint transition-colors hover:text-ink-dim"
              >
                {voice.onboarding.walk.skipRest}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={next}
            className="btn-cta ml-auto px-6 py-2.5 text-[13px]"
          >
            {closing ? voice.onboarding.close.cta : voice.onboarding.chrome.next}
          </button>
        </div>
      </div>
    </div>
  )
}

/** the three beats of one stop, with beat three composed from the user's own
 *  records (sample records never count — they carry the demo prefix, but more
 *  simply: the fact lines read counts the sweep has not touched yet, so the
 *  filters below exclude the costume explicitly) */
function walkStop(
  stage: OnboardStage,
  facts: {
    events: ReturnType<typeof useEventsStore.getState>['events']
    weekStart: 0 | 1
    goal: number
    subjects: ReturnType<typeof useStudyStore.getState>['subjects']
  },
): { meaning: string; dashboard: string; use: string; board?: string } {
  const own = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !x.id.startsWith('onb-demo-'))

  if (stage === 'walk-watch') {
    const ownEvents = own(facts.events)
    const stats = watchStats(ownEvents, Date.now(), facts.weekStart)
    const ms = stats.next ? new Date(stats.next.start).getTime() - Date.now() : null
    const w = voice.onboarding.walk.watch
    return {
      meaning: w.meaning,
      dashboard: w.dashboard,
      use: w.use({
        count: shiftsOf(ownEvents).length,
        next:
          ms !== null && ms > 0
            ? { h: Math.floor(ms / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000) }
            : null,
      }),
    }
  }
  if (stage === 'walk-grounds') {
    const g = voice.onboarding.walk.grounds
    return { meaning: g.meaning, dashboard: g.dashboard, use: g.use({ goal: facts.goal }) }
  }
  if (stage === 'walk-study') {
    const s = voice.onboarding.walk.study
    return {
      meaning: s.meaning,
      dashboard: s.dashboard,
      use: s.use({ subjects: own(facts.subjects).filter((x) => !x.archived).length }),
    }
  }
  if (stage === 'walk-workshop') {
    const w = voice.onboarding.walk.workshop
    const ventures = own(useWorkshopStore.getState().ventures).filter((v) => !v.archived)
    return {
      meaning: w.meaning,
      dashboard: w.dashboard,
      board: w.board,
      use: w.use({ ventures: ventures.length }),
    }
  }
  const l = voice.onboarding.walk.ledger
  return { meaning: l.meaning, dashboard: l.dashboard, use: l.use }
}
