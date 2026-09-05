import { makeId } from '../ids'
import { TERMS_VERSION, useShellStore } from '../store/shell'
import { useAuthStore } from '../auth/store'
import { consentGranted, gpcRaised } from './consent'
import type { TelemetryEvent, TelemetryProps } from './events'

export type { TelemetryEvent, TelemetryProps } from './events'

/**
 * Usage analytics — hand-rolled on purpose.
 *
 * The estate's privacy promises are load-bearing (/privacy repeats them), so
 * every byte that leaves the app has to be auditable from this one file: no
 * SDK, no autocapture, no remote config, no session replay — named events
 * from `events.ts` and nothing else, POSTed to PostHog's public ingestion
 * endpoint. Swapping vendors is a change to `HOST` and the envelope below.
 *
 * Nothing runs, and nothing is WRITTEN, before the consent door is agreed
 * through. The second half of that sentence has teeth beyond politeness:
 * `hasEstate()` in the landing's arrival gate matches any `majordomo*`
 * localStorage key, so a telemetry blob created before consent would walk a
 * bounced stranger straight past the landing on their next visit. The blob is
 * created lazily, on the first capture the predicate allows.
 *
 * The predicate, in full: initialized, a production build, a key present
 * (set in Vercel for the Production environment ONLY, so previews stay
 * silent; DEV never sends, like the landing's analytics), and CONSENT — the
 * current TERMS_VERSION accepted on this device, the settings switch not off,
 * and the browser not raising Global Privacy Control. That last half lives in
 * ./consent.ts because the Meta Pixel (core/ads/meta.ts) asks the very same
 * question, and the policy promises one answer for both.
 *
 * Offline-first means an outbox: events are fully formed at enqueue
 * (capture-time timestamp, then-current identity) and drain on boot, on
 * regained network, on visibility changes, and shortly after each capture.
 * On `hidden` the drain rides `sendBeacon` with an optimistic clear — a
 * rarely lost event beats a duplicated one, since the ingest does not dedup.
 *
 * The `majordomo-telemetry` key is deliberately ABSENT from the estate
 * export (`ESTATE_KEYS` in core/backup.ts): a backup file must not carry a
 * device identity from one browser to another.
 */

const HOST = 'https://eu.i.posthog.com'

const read = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** PUBLIC by design — a write-only ingest key, the same class as the Supabase
 *  anon key. It ships in the bundle; it can read nothing back. */
const KEY = read(import.meta.env.VITE_POSTHOG_KEY)

const STORE_KEY = 'majordomo-telemetry'
const OUTBOX_CAP = 200
const SESSION_IDLE_MS = 30 * 60_000
const FLUSH_DEBOUNCE_MS = 2_000

type OutboxEvent = {
  event: string
  distinct_id: string
  /** capture-time ISO instant, so an offline replay keeps honest clocks */
  timestamp: string
  properties: TelemetryProps
}

type TelemetryBlob = {
  v: 1
  /** random, minted here, never derived from anything — the anonymous identity */
  deviceId: string
  /** the account this device last spoke as; genuine-sign-in detection hangs on it */
  lastUserId: string | null
  sessionId: string
  /** last capture, epoch ms — the 30-minute idle clock */
  sessionAt: number
  outbox: OutboxEvent[]
}

/** undefined = not read yet; null = read, and nothing is stored */
let cache: TelemetryBlob | null | undefined
let started = false
let inFlight = false
let flushTimer: number | null = null

/* ---------------------------------------------------------------- storage */

function peekBlob(): TelemetryBlob | null {
  if (cache !== undefined) return cache
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) {
      cache = null
    } else {
      const p = JSON.parse(raw) as Partial<TelemetryBlob>
      cache = {
        v: 1,
        deviceId: typeof p.deviceId === 'string' && p.deviceId !== '' ? p.deviceId : makeId(),
        lastUserId: typeof p.lastUserId === 'string' ? p.lastUserId : null,
        sessionId: typeof p.sessionId === 'string' ? p.sessionId : uuidv7(),
        sessionAt: typeof p.sessionAt === 'number' ? p.sessionAt : 0,
        outbox: Array.isArray(p.outbox) ? (p.outbox as OutboxEvent[]) : [],
      }
    }
  } catch {
    cache = null
  }
  return cache
}

/** create-on-first-enabled-capture — the lazy half of "nothing before consent" */
function ensureBlob(): TelemetryBlob {
  const b = peekBlob()
  if (b) return b
  cache = {
    v: 1,
    deviceId: makeId(),
    lastUserId: null,
    sessionId: uuidv7(),
    sessionAt: Date.now(),
    outbox: [],
  }
  save()
  return cache
}

function save(): void {
  if (!cache) return
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cache))
  } catch {
    // storage refused — counts are not records; the session's memory copy stands
  }
}

/* --------------------------------------------------------------- identity */

/** UUIDv7 — PostHog reads $session_id's leading timestamp for session views */
function uuidv7(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  const t = Date.now()
  b[0] = (t / 2 ** 40) & 0xff
  b[1] = (t / 2 ** 32) & 0xff
  b[2] = (t / 2 ** 24) & 0xff
  b[3] = (t / 2 ** 16) & 0xff
  b[4] = (t / 2 ** 8) & 0xff
  b[5] = t & 0xff
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/* -------------------------------------------------------------- predicate */

function enabled(): boolean {
  if (!started || !import.meta.env.PROD || KEY === '') return false
  return consentGranted()
}

/** the full predicate, readable from outside — a debugging door, nothing more */
export function telemetryEnabled(): boolean {
  return enabled()
}

/* ---------------------------------------------------------------- capture */

function enqueue(event: string, props: TelemetryProps, distinctId?: string): void {
  const b = ensureBlob()
  const now = Date.now()
  if (now - b.sessionAt > SESSION_IDLE_MS) b.sessionId = uuidv7()
  b.sessionAt = now
  b.outbox.push({
    event,
    distinct_id: distinctId ?? b.lastUserId ?? b.deviceId,
    timestamp: new Date(now).toISOString(),
    properties: { ...props, $session_id: b.sessionId },
  })
  if (b.outbox.length > OUTBOX_CAP) b.outbox.splice(0, b.outbox.length - OUTBOX_CAP)
  save()
  flushSoon()
}

/** count a named action. A silent no-op unless the whole predicate holds. */
export function track(event: TelemetryEvent, props: TelemetryProps = {}): void {
  if (!enabled()) return
  enqueue(event, props)
}

/* ------------------------------------------------------------------ flush */

function flushSoon(): void {
  if (flushTimer !== null) window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    flush('track')
  }, FLUSH_DEBOUNCE_MS)
}

/** drain the outbox. 'hidden' rides sendBeacon (the page is going away and a
 *  fetch cannot be awaited there) and clears optimistically; every other
 *  reason is an ordinary fetch that clears only on HTTP success. */
export function flush(reason: 'boot' | 'online' | 'visible' | 'hidden' | 'track' = 'track'): void {
  const b = peekBlob()
  if (!b || b.outbox.length === 0) return
  if (!import.meta.env.PROD || KEY === '') return
  // a Global Privacy Control raised since these were queued covers them too:
  // drop, don't send — the signal means "stop", not "finish what you started"
  if (gpcRaised()) {
    b.outbox = []
    save()
    return
  }
  const payload = JSON.stringify({ api_key: KEY, batch: b.outbox.slice() })

  if (reason === 'hidden') {
    try {
      // a bare string body keeps the beacon's content-type CORS-safelisted —
      // a preflight is exactly what a page being torn down cannot do
      if (navigator.sendBeacon(`${HOST}/batch/`, payload)) {
        b.outbox = []
        save()
      }
    } catch {
      // kept for the next boot's flush
    }
    return
  }

  if (inFlight) return
  inFlight = true
  const sent = b.outbox.length
  void fetch(`${HOST}/batch/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  })
    .then((res) => {
      if (res.ok) {
        // the outbox may have grown mid-flight — remove exactly what was sent
        b.outbox.splice(0, sent)
        save()
      }
    })
    .catch(() => {
      // offline or refused — the outbox carries it to the next trigger
    })
    .finally(() => {
      inFlight = false
    })
}

/* ------------------------------------------------------------------- init */

/**
 * Wire the listeners and drain anything a previous session left behind.
 * Called once from bootApp(), never from an effect (StrictMode double-invokes
 * effects; boot code runs once).
 */
export function initTelemetry(): void {
  if (started) return
  started = true

  window.addEventListener('online', () => flush('online'))
  window.addEventListener('appinstalled', () => track('pwa_installed'))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer)
        flushTimer = null
      }
      flush('hidden')
      return
    }
    // a PWA resumed from the background after a long sleep is an "open" the
    // boot path never sees; enqueue() rotates the stale session on its own
    const b = peekBlob()
    if (b && Date.now() - b.sessionAt > SESSION_IDLE_MS) {
      track('app_open', { standalone: isStandalone(), resumed: true })
    }
    flush('visible')
  })

  // Identity. A real sign-in is indistinguishable in memory from the session
  // restore every boot performs (OAuth leaves the page and returns), so the
  // durable `lastUserId` is the discriminator: only an account this device has
  // not spoken as before counts, and PostHog's $identify merges the anonymous
  // device history into it. Sign-out drops back to the device id, so a later
  // genuine sign-in counts again. The email never leaves the auth store.
  useAuthStore.subscribe((s, prev) => {
    if (s.status === 'signedIn' && s.userId) {
      if (!enabled()) return
      const b = ensureBlob()
      if (b.lastUserId === s.userId) return
      enqueue('$identify', { $anon_distinct_id: b.deviceId }, s.userId)
      b.lastUserId = s.userId
      save()
      track('signed_in')
    } else if (prev.status === 'signedIn' && s.status === 'signedOut') {
      const b = peekBlob()
      if (b && b.lastUserId !== null) {
        b.lastUserId = null
        save()
      }
    }
  })

  flush('boot')
  // the boot that carries acceptance fires this from the door instead —
  // enabled() is false here until the stamp lands
  track('app_open', { standalone: isStandalone() })
}

/** the ordered off-switch: say goodbye, send it, then go quiet — and drop
 *  whatever the send did not take, because the point of the switch is that
 *  nothing is sent after it. */
export function disableTelemetry(): void {
  track('telemetry_off')
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  flush('track')
  useShellStore.getState().setTelemetryOff(true)
  const b = peekBlob()
  if (b && b.outbox.length > 0) {
    b.outbox = []
    save()
  }
}

/** the consent door's boot: the stamp is already down when this is called */
export function trackConsentAccepted(): void {
  track('consent_accepted', { version: TERMS_VERSION })
  track('app_open', { standalone: isStandalone() })
}
