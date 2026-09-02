import { useEffect, useRef, useState } from 'react'
import { localDayKey } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useNavStore } from '../../core/store/nav'
import { track } from '../../core/telemetry'
import { voice } from '../../core/voice'
import { useWorkshopUi } from '../../modules/workshop/uiStore'
import { useAuthUi } from '../authUi'
import { useHeadsUps } from '../manor/useHeadsUps'
import { isOffer, type Go, type Matter } from '../manor/headsUps'
import { useManorUi } from '../manor/uiStore'
import { useOnboarding } from '../onboarding/store'
import { useSettingsUi } from '../settingsUi'
import { useButlerStore } from './store'

/**
 * THE VALET — the butler bubble.
 *
 * The house already knew these things; it could only say them on the Manor.
 * This carries ONE of them — the loudest — to wherever you are standing, says
 * it once, and then folds into a chip and waits to be asked again.
 *
 * Everything about it is shaped by the standing rule that the Majordomo never
 * begs. He holds one matter, never a list and never a count. He says a thing
 * once a day and not twice. Waved off, it is gone until tomorrow; switched off
 * in settings, he is gone for good. He never acts — the CTA opens the room
 * that owns the deed, exactly as THE PATTERN names a clash and offers to take
 * you to it rather than fixing it behind your back.
 *
 * Where he says NOTHING AT ALL, which is most of the time and deliberately so:
 * an estate with no records (he has nothing to be helpful about), a first-run
 * setup in progress (the walk is already talking), a what-if rehearsal open
 * (he briefs on the estate, never on a hypothetical), and under a headless
 * browser — see WEBDRIVER below.
 */

/** how long the announced card stands before folding itself away */
const ANNOUNCE_MS = 8_000

/**
 * The harnesses drive a real Chromium over `?demo`, whose fixtures guarantee
 * live matters — so this would announce on every run, and a fixed element in
 * the corner can swallow a click Playwright aimed at a grid block or the tab
 * bar. Rather than teach two harnesses to dodge him, he stands down for them.
 * The cost is stated plainly: this component has no automated coverage, and
 * is verified by hand (`?butler`, below, forces it open for exactly that).
 */
const WEBDRIVER = typeof navigator !== 'undefined' && navigator.webdriver === true

/**
 * DEV: force the card open on the current top matter — screenshot aid, and
 * the only way to see this under automation. It deliberately skips the ledger
 * writes below, so screenshotting a room offer does not SPEND it: `?butler`
 * shows the house as it is, it does not play a turn of it.
 */
const FORCED =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('butler')

type Mode = 'hidden' | 'announce' | 'chip' | 'open'

const keyOf = (m: Matter) => `${m.id}:${m.instanceKey}`

export function Butler() {
  const { matters } = useHeadsUps()
  const off = useButlerStore((s) => s.off)
  const waved = useButlerStore((s) => s.waved)
  const announced = useButlerStore((s) => s.announced)
  const onboardStage = useOnboarding((s) => s.stage)
  const sandbox = useEventsStore((s) => s.sandbox)
  const eventCount = useEventsStore((s) => s.events.length)

  const [mode, setMode] = useState<Mode>('hidden')
  /**
   * The matter currently being SHOWN, held locally rather than read fresh.
   * A room offer is recorded as introduced the instant it is spoken, which
   * removes it from the engine's very next output — without this it would
   * vanish mid-sentence. It also keeps a card stable while the minute tick
   * re-derives underneath it.
   */
  const [shown, setShown] = useState<Matter | null>(null)
  const timer = useRef<number | null>(null)
  /**
   * A wave-off ends the conversation, not just the sentence. Without this the
   * next matter announced itself the instant "Not today" was pressed, which is
   * the exact nag this whole surface is built not to be: whatever is left over
   * waits as the chip until it is asked for.
   */
  const steppedBack = useRef(false)

  const silent = off || onboardStage !== null || eventCount === 0 || (WEBDRIVER && !FORCED)

  // the loudest matter still worth raising: never one already waved off today
  const today = localDayKey(new Date())
  const top =
    matters
      .filter((m) => waved[keyOf(m)] !== today)
      .sort((a, b) => b.urgency - a.urgency)[0] ?? null

  const topKey = top ? keyOf(top) : null
  const shownKey = shown ? keyOf(shown) : null

  /**
   * Which matter is being presented, and how. Keyed on the matter's IDENTITY
   * rather than on the object, because the engine hands back a fresh array on
   * every minute tick — deciding off the object re-ran this on each of them,
   * and a second pass would happily re-open what the first had just folded
   * away.
   */
  useEffect(() => {
    if (silent) {
      setMode('hidden')
      setShown(null)
      return
    }
    if (!top || topKey === null) {
      setMode('hidden')
      setShown(null)
      return
    }
    // a card being read is not interrupted by something arriving behind it
    if (shown && (mode === 'announce' || mode === 'open')) return
    if (shownKey === topKey) {
      // same matter, new words (an hour turned over): swap them in SILENTLY.
      // Re-announcing a line because a number rounded differently is the
      // briefing's own rule, and it applies twice as hard to a card.
      if (shown && shown.text !== top.text) setShown(top)
      return
    }

    setShown(top)
    if (steppedBack.current) {
      steppedBack.current = false
      setMode('chip')
      return
    }
    if (FORCED) {
      setMode('open')
      return
    }
    if (announced[topKey] === today) {
      setMode('chip')
      return
    }
    // a rehearsal is no time to start talking; the chip may stand, but the
    // announcement waits for the estate to be real again
    if (sandbox !== null) {
      setMode('chip')
      return
    }
    setMode('announce')
    // recorded on SHOW, not on fold: a reload two seconds later is not a new
    // morning, and he must not introduce the same matter twice
    useButlerStore.getState().noteAnnounced(topKey, Date.now())
    if (isOffer(top.id)) useButlerStore.getState().introduce(top.id)
  }, [silent, top, topKey, shownKey, shown, mode, announced, today, sandbox])

  // the announced card folds itself away
  useEffect(() => {
    if (mode !== 'announce') return
    timer.current = window.setTimeout(() => setMode('chip'), ANNOUNCE_MS)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [mode, shown])

  if (silent || !shown || mode === 'hidden') return null

  const dismiss = () => {
    useButlerStore.getState().wave(keyOf(shown), Date.now())
    steppedBack.current = true
    setShown(null)
    setMode('hidden')
  }

  const follow = () => {
    track('butler_followed', { matter: shown.id })
    go(shown.go)
    setMode('chip')
  }

  if (mode === 'chip') {
    return (
      <div className={PERCH}>
        <button
          type="button"
          aria-label={voice.butler.chipAria}
          onClick={() => {
            track('butler_open', { matter: shown.id })
            setMode('open')
          }}
          className="chip flex h-9 w-9 items-center justify-center rounded-pill font-display text-[12px] font-bold"
          style={{
            color: 'var(--color-accent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)',
            background: 'color-mix(in srgb, var(--color-panel) 92%, transparent)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          M
        </button>
      </div>
    )
  }

  return (
    <div className={PERCH}>
      <div
        role="status"
        className="menu-panel w-[min(340px,calc(100vw-1.5rem))] rounded-[12px] border border-line px-3.5 py-3"
        style={{
          animation: 'valet-in var(--fold-in, 240ms) var(--ease-fold-in) both',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border font-display text-xs font-bold"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
            aria-hidden
          >
            M
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed">{shown.text}</p>
        </div>
        <div className="mt-3 flex items-center gap-2 pl-[34px]">
          <button
            type="button"
            onClick={follow}
            className="btn-cta rounded-pill px-3 py-1.5 font-display text-[10px] font-semibold tracking-[0.14em]"
          >
            {ctaOf(shown.go)}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="px-1.5 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {voice.butler.dismiss}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Clear of the tab bar on a phone and of nothing much on a desktop. It sits at
 * z-44: above the chrome so it can be read and tapped, below the settings page
 * (z-45) and every sheet (z-50) so it can never cover the thing it just sent
 * you to. The toast lane is bottom-CENTRE, which is why this is bottom-right.
 */
const PERCH =
  'fixed right-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[44] flex justify-end md:bottom-6 md:right-6'

function ctaOf(g: Go): string {
  if ('settings' in g) return voice.butler.cta.settings
  if ('night' in g) return voice.butler.cta.write
  return voice.butler.cta.go
}

/**
 * The way through — mailbox posts, never a mutation. Every one of these doors
 * already exists and is already used by something else (the bench chip takes
 * the workshop one verbatim); the butler is just another caller.
 */
function go(g: Go): void {
  if ('settings' in g) {
    useSettingsUi.getState().open(g.settings)
    return
  }
  if ('auth' in g) {
    useAuthUi.getState().setOpen(true)
    return
  }
  if ('night' in g) {
    useManorUi.getState().requestNight(g.night)
    useNavStore.getState().requestView('manor')
    return
  }
  if ('board' in g) {
    useWorkshopUi.getState().requestBoard(g.board)
    useNavStore.getState().requestView('workshop')
    return
  }
  if ('quickAdd' in g) {
    useNavStore.getState().requestView('manor')
    useManorUi.getState().requestQuickAdd()
    return
  }
  useNavStore.getState().requestView(g.view)
}
