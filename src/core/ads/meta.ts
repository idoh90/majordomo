import { useShellStore } from '../store/shell'
import { consentGranted, doorPending, gpcRaised } from '../telemetry/consent'

/**
 * The Meta Pixel — advertising measurement, and the one third party the
 * public pages ever speak to.
 *
 * The Privacy Policy (src/landing/voice.ts, "Advertising measurement: the
 * Meta Pixel") is the contract this file implements, clause by clause:
 *
 * - THREE NAMED ACTIONS AND NOTHING ELSE. PageView on the landing, Lead on
 *   GET STARTED, CompleteRegistration when a new user finishes the first-time
 *   setup. `PixelEvent` is a closed union and the three call sites are the
 *   only three (landing/mount.tsx, landing/components/GetStarted.tsx,
 *   app/onboarding/store.ts). No event carries a parameter — no email, name,
 *   phone or account id. Automatic Advanced Matching is off on Meta's side,
 *   and `autoConfig` is switched off here so the script cannot go looking
 *   for any of that in the page on its own initiative.
 * - LOADS ONLY AFTER THE DOOR, NEVER BEFORE. Nothing runs until
 *   consentGranted() holds — core/telemetry/consent.ts, the same predicate
 *   the usage counts read; there is no second one. Before the door is
 *   answered, events are HELD IN MEMORY (a plain array, never storage) and
 *   sent in order the moment AGREE & ENTER stamps the device. Until then:
 *   no script tag, no global, no cookie, no request. A door that is declined
 *   discards them; a tab that closes discards them. Global Privacy Control
 *   suppresses the pixel outright — nothing is even held.
 * - THE SWITCH WITHDRAWS IT. The shell store is watched: consent flipping off
 *   (the settings switch, or the door declined) drops whatever is held and,
 *   if the script ever loaded, deletes the cookies it set. The script itself
 *   cannot be unloaded; it is simply never spoken to again, and every send
 *   re-asks the predicate first.
 * - THE SCRIPT LOADS LAZILY, on the first event that may be sent, not on
 *   consent. A resident with consent standing and nothing to report never
 *   loads Meta's script at all — no cookie, no request — which is the least
 *   "three named actions" allows.
 *
 * `VITE_META_PIXEL_ID` is the arming switch. Absent or empty, this module is
 * inert end to end: no stub, no listener, no held events. Set it in Vercel
 * for Production only, so previews stay silent the way telemetry's key does.
 * scripts/check-pixel.mjs refuses to build an armed bundle whose /privacy
 * does not disclose the pixel, or whose CSP would block it.
 *
 * Meta's own installation snippet is an inline <script>, which the CSP
 * (script-src 'self') forbids and this file does not need: the snippet is a
 * queueing stub plus a script tag, both of which are ordinary code below.
 * fbevents.js is admitted by host in vercel.json, alongside the facebook.com
 * image and connect endpoints its beacons use. There is no <noscript> image:
 * it fires without JavaScript, which is to say without asking.
 */

export type PixelEvent = 'PageView' | 'Lead' | 'CompleteRegistration'

const SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js'

const read = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** the arming switch. Public by nature — a pixel id is printed in every
 *  request the pixel makes — so it rides the VITE_ prefix like the anon key. */
const PIXEL_ID = read(import.meta.env.VITE_META_PIXEL_ID)

/** Meta's queueing stub, typed: calls made before fbevents.js arrives queue
 *  up; the script drains the queue and installs callMethod when it lands */
type Fbq = {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: Fbq
  loaded: boolean
  version: string
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

/** events that arrived before the door was answered — memory only */
let held: PixelEvent[] = []
let loaded = false

/** is there a pixel to speak to at all? */
export function pixelArmed(): boolean {
  return PIXEL_ID !== ''
}

function stub(): Fbq {
  if (window.fbq) return window.fbq
  const n = ((...args: unknown[]) => {
    if (n.callMethod) n.callMethod(...args)
    else n.queue.push(args)
  }) as Fbq
  n.queue = []
  n.push = n
  n.loaded = true
  n.version = '2.0'
  window.fbq = n
  if (!window._fbq) window._fbq = n
  return n
}

/** the script tag, once — everything Meta's snippet does, minus the inline
 *  script. `autoConfig` off BEFORE init is what keeps the pixel from reading
 *  forms and buttons on its own. */
function load(): Fbq {
  const fbq = stub()
  if (loaded) return fbq
  loaded = true
  fbq('set', 'autoConfig', false, PIXEL_ID)
  fbq('init', PIXEL_ID)
  const s = document.createElement('script')
  s.async = true
  s.src = SCRIPT
  document.head.appendChild(s)
  return fbq
}

function send(event: PixelEvent): void {
  load()('track', event)
}

/** the cookies fbevents.js sets — _fbp, and _fbc when the visit carried an
 *  fbclid — removed whenever consent is withdrawn, whether or not the script
 *  loaded in THIS document: a cookie set before a reload is still a cookie.
 *  Best effort: the script writes them against the site's registrable
 *  domain, which is not knowable from here, so every ancestor is tried. */
function forgetCookies(): void {
  const parts = window.location.hostname.split('.')
  const domains = ['']
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.')
    domains.push(d, `.${d}`)
  }
  for (const name of ['_fbp', '_fbc']) {
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`
    }
  }
}

/** the watcher — one subscription to an in-memory store, installed at load
 *  when armed, which leaves no trace a page could show. It turns the door's
 *  answer into a flush or a drop, and the settings switch into a withdrawal
 *  — in any document, including one that has sent nothing itself. */
function watch(): void {
  useShellStore.subscribe((s, prev) => {
    if (s.termsAccepted === prev.termsAccepted && s.telemetryOff === prev.telemetryOff) return
    if (consentGranted()) {
      const queue = held
      held = []
      for (const event of queue) send(event)
    } else if (!doorPending()) {
      // answered and withheld, or withdrawn later: nothing held survives,
      // and whatever the script left behind goes with it
      held = []
      forgetCookies()
    }
  })
}
if (pixelArmed()) watch()

/**
 * Report one of the three named actions — or hold it, or drop it.
 *
 * Consent standing → sent (the script loads on the first). Door not yet
 * answered → held in memory for the answer. Door answered without consent,
 * the switch off, or Global Privacy Control raised → dropped: not held, not
 * sent, not remembered.
 */
export function trackPixel(event: PixelEvent): void {
  if (!pixelArmed()) return
  if (gpcRaised()) return
  if (consentGranted()) {
    send(event)
    return
  }
  if (doorPending()) held.push(event)
}
