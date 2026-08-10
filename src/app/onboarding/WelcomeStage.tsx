import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { useEventsStore } from '../../core/events/store'
import { offReason } from '../../core/sync/gate'
import { useSyncStore } from '../../core/sync/store'
import { voice } from '../../core/voice'
import { resolveFirstSync } from '../sync/service'
import {
  EMPTY_COMPOSITION,
  estateEmpty,
  useOnboarding,
  type Composition,
  type OnboardStage,
} from './store'

/**
 * The door, and what happens just inside it.
 *
 * Full-bleed on purpose — this is the one moment the app has nothing to show
 * behind a panel, and a first impression made through a 360px drawer is no
 * impression at all. Everything after this stage docks beside a populating
 * Manor instead.
 *
 * The registry is offered here, never imposed: the caption under the Google
 * button is the strongest nudge allowed, and "Begin on this device" is the same
 * width, the same tap, one line below.
 */
export function WelcomeStage({ stage }: { stage: OnboardStage }) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label={voice.appName}
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center">
        <Wordmark />
        {stage === 'welcome' ? (
          <Welcome />
        ) : stage === 'registry' ? (
          <Registry />
        ) : stage === 'welcomeBack' ? (
          <WelcomeBack />
        ) : stage === 'intro' ? (
          <Intro />
        ) : (
          <CompositionStage />
        )}
      </div>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="font-display text-[19px] font-bold uppercase leading-none tracking-[0.3em] text-ink md:text-[24px]">
      {voice.wordmark.lead}
      {voice.wordmark.accent && (
        <>
          {' '}
          <span className="text-accent">{voice.wordmark.accent}</span>
        </>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- welcome */

function Welcome() {
  const go = useOnboarding((s) => s.go)
  const finish = useOnboarding((s) => s.finish)
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const signIn = useAuthStore((s) => s.signIn)

  // A tab that returns from the redirect without its query (the OAuth round
  // trip comes back to the bare origin) resumes here, so a session that is
  // already good means the registry stage is where this run actually is.
  useEffect(() => {
    if (status === 'signedIn') go('registry')
  }, [status, go])

  const intro = () => go('intro')

  // no registry to offer: an unconfigured build, a demoed origin, or a browser
  // refusing storage. The local path is then the only path, and saying so with
  // a dead button would be worse than not saying it at all.
  const registryOpen = offReason() === null

  return (
    <>
      <p className="mt-7 text-[15px] leading-relaxed text-ink">{voice.onboarding.welcome.intro}</p>
      <p className="mt-2.5 text-sm text-ink-dim">{voice.onboarding.welcome.promise}</p>

      <div className="mt-9">
        {registryOpen && (
          <div className="mb-4">
            <button
              type="button"
              disabled={status === 'loading'}
              onClick={() => void signIn()}
              className="btn-cta w-full py-4 text-base disabled:opacity-30"
            >
              {status === 'loading' ? voice.sync.working : voice.sync.google}
            </button>
            <p className="mt-2 text-center text-xs text-ink-dim">
              {voice.onboarding.welcome.googleHint}
            </p>
          </div>
        )}

        <button type="button" onClick={intro} className="btn-soft w-full py-4 text-base">
          {voice.onboarding.welcome.localCta}
        </button>
        <p className="mt-2 text-center text-xs text-ink-dim">
          {voice.onboarding.welcome.localHint}
        </p>
      </div>

      {error && <p className="mt-5 text-sm text-danger">{voice.sync.failed(error)}</p>}

      <button
        type="button"
        onClick={finish}
        className="mx-auto mt-10 inline-flex min-h-11 items-center text-sm text-ink-faint transition-colors hover:text-ink-dim"
      >
        {voice.onboarding.welcome.later}
      </button>
    </>
  )
}

/* -------------------------------------------------------------- registry */

/** the estate has ten seconds to come down before we stop waiting on it */
const REGISTRY_TIMEOUT_MS = 10_000

/**
 * Back from the redirect: wait for the first sync to settle, then decide which
 * kind of user this is. An estate that came down populated belongs to someone
 * returning — putting them through a setup interview would be an insult and an
 * idempotency hazard both.
 */
function Registry() {
  const go = useOnboarding((s) => s.go)
  const status = useAuthStore((s) => s.status)
  const authError = useAuthStore((s) => s.error)
  const adopted = useSyncStore((s) => s.adopted)
  const busy = useSyncStore((s) => s.busy)
  const syncError = useSyncStore((s) => s.lastError)
  const choice = useSyncStore((s) => s.pendingChoice)
  const [gaveUp, setGaveUp] = useState(false)
  const answered = useRef(false)

  /**
   * The one place in the app allowed to answer "two estates" on the user's
   * behalf — and only because there is no second estate to speak of. A device
   * mid-first-run holds the four seeded shift SHAPES and nothing else, which is
   * enough for the sync loop to count it as populated and stop to ask a
   * question with only one sensible answer. The guards are the point: it fires
   * once, only on this stage, and only while the estate is genuinely empty.
   */
  useEffect(() => {
    if (!choice || answered.current || !estateEmpty()) return
    answered.current = true
    resolveFirstSync('merge')
  }, [choice])

  // the sign-in was cancelled or dropped — back to the door
  useEffect(() => {
    if (status === 'signedOut') go('welcome')
  }, [status, go])

  useEffect(() => {
    if (!adopted || busy) return
    go(useEventsStore.getState().events.length > 0 ? 'welcomeBack' : 'intro')
  }, [adopted, busy, go])

  useEffect(() => {
    const t = setTimeout(() => setGaveUp(true), REGISTRY_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])

  // A registry that never answered must not hold the setup hostage: state the
  // fact, offer the remedy (it catches up later), and let the user carry on.
  const stalled = gaveUp || syncError !== null || authError !== null

  return (
    <>
      <p className="mt-7 text-[15px] leading-relaxed text-ink">
        {stalled ? voice.onboarding.registry.checkFailed : voice.onboarding.registry.checking}
      </p>
      {stalled ? (
        <button
          type="button"
          onClick={() => go('intro')}
          className="btn-cta mt-7 w-full py-3.5 text-sm"
        >
          {voice.onboarding.chrome.next}
        </button>
      ) : (
        <div className="mt-7 flex justify-center" aria-hidden>
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
        </div>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- intro */

/**
 * The house presents itself: three beats, no questions, no controls but NEXT.
 * "Complicated as hell" begins with being asked to configure a thing nobody
 * has explained — so nothing is asked until this has been said.
 */
function Intro() {
  const advance = useOnboarding((s) => s.advance)
  const [beat, setBeat] = useState(0)
  const lines = voice.onboarding.intro.lines
  const last = beat >= lines.length - 1

  return (
    <>
      <p
        key={beat}
        className="mt-7 min-h-24 text-[15px] leading-relaxed text-ink animate-[fade-in_240ms_ease-out]"
      >
        {lines[beat]}
      </p>
      {/* beat dots — where the introduction stands, not a control */}
      <div className="mt-4 flex gap-1.5" aria-hidden>
        {lines.map((_, i) => (
          <span
            key={i}
            className="h-1 w-6 rounded-full transition-colors"
            style={{
              background: i <= beat ? 'var(--color-accent)' : 'var(--color-panel-2)',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => (last ? advance() : setBeat(beat + 1))}
        className="btn-cta mt-8 w-full py-3.5 text-sm"
      >
        {voice.onboarding.chrome.next}
      </button>
    </>
  )
}

/* ----------------------------------------------------------- composition */

/**
 * The measure: which concerns actually fill this user's week. Every interview
 * stage after this exists only if its chip was picked — the analysis that
 * replaces asking a student what shape their working day is.
 */
function CompositionStage() {
  const advance = useOnboarding((s) => s.advance)
  const setComposition = useOnboarding((s) => s.setComposition)
  const [picked, setPicked] = useState<Composition>(
    () => useOnboarding.getState().composition ?? EMPTY_COMPOSITION,
  )

  const chips: { key: keyof Composition; label: string }[] = [
    { key: 'shift', label: voice.onboarding.composition.chips.shift },
    { key: 'dayJob', label: voice.onboarding.composition.chips.dayJob },
    { key: 'training', label: voice.onboarding.composition.chips.training },
    { key: 'study', label: voice.onboarding.composition.chips.study },
    { key: 'projects', label: voice.onboarding.composition.chips.projects },
    { key: 'money', label: voice.onboarding.composition.chips.money },
  ]

  const commit = () => {
    setComposition(picked)
    advance()
  }

  return (
    <>
      <p className="mt-7 text-[15px] leading-relaxed text-ink">
        {voice.onboarding.composition.prompt}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {chips.map(({ key, label }) => {
          const on = picked[key]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => ({ ...p, [key]: !p[key] }))}
              className={`rounded-pill border px-4 py-2.5 text-sm transition-colors ${
                on
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line text-ink-dim hover:border-accent/40 hover:text-ink'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-xs leading-snug text-ink-dim">
        {voice.onboarding.composition.hint}
      </p>
      <button type="button" onClick={commit} className="btn-cta mt-8 w-full py-3.5 text-sm">
        {voice.onboarding.chrome.next}
      </button>
    </>
  )
}

/* ----------------------------------------------------------- welcomeBack */

function WelcomeBack() {
  const finish = useOnboarding((s) => s.finish)
  return (
    <>
      <p className="mt-7 font-display text-xl font-bold tracking-wide text-ink">
        {voice.onboarding.registry.welcomeBack}
      </p>
      <p className="mt-2 text-sm text-ink-dim">{voice.onboarding.registry.welcomeBackBody}</p>
      <button type="button" onClick={finish} className="btn-cta mt-8 w-full py-4 text-base">
        {voice.onboarding.registry.welcomeBackCta}
      </button>
    </>
  )
}
