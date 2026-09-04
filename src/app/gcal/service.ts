import { useAuthStore } from '../../core/auth/store'
import { addDays } from '../../core/dates'
import { isProjection } from '../../core/sync/projection'
import { armed } from '../../core/sync/gate'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'
import { errorLine, gcalApi, type GcalErrorCode } from './apiClient'
import * as g from './google'
import {
  FUTURE_DAYS,
  PAST_DAYS,
  decodeGid,
  encodeGid,
  mirrorDiffers,
  mirrorId,
  toGoogleEvent,
  toMirrorShape,
} from './mapping'
import { useGcalStore } from './store'

/**
 * The Google bridge's engine — client-executed, like everything with domain
 * logic in this project. The server only ever minted the token; from here the
 * browser talks to Google directly and writes through the events store's own
 * action surface, so mirrored events replicate to every device through the
 * estate sync that already exists, and every device runs the same loop
 * idempotently (deterministic ids make their writes converge, not collide).
 *
 * One cycle, in order:
 *   pull   — Google's primary calendar → read-only 'abroad' mirrors
 *   ensure — the app-created "Majordomo" calendar exists and is on record
 *   write-back — edits made AT Google to our own pushed events → the estate
 *   push   — the estate's bookings → the Majordomo calendar
 *
 * Doctrine notes, because two of this project's oldest rules are touched:
 *
 *  · The pull's delete sweep is a DIFF, which intent.ts forbids in general
 *    ("diff for upserts, intent for tombstones"). It is legitimate here and
 *    only here because the mirror's authority is external: within the fetched
 *    window, for events this sync itself created (source 'google', this
 *    calendar's ref), Google's complete listing IS the intent — and the fetch
 *    aborts with no writes at all unless every page arrived, so a truncated
 *    listing can never read as absence.
 *
 *  · A deletion at Google of one of OUR events does not delete the estate
 *    record — the next push re-creates it. The estate is the authority for
 *    its own records; when in doubt, resurrect.
 *
 * Never while a what-if rehearsal is open: mutations would be redirected into
 * the sandbox and destroyed by APPLY's wholesale write. The cycle bails at the
 * door, re-checks after every await, and the store subscription that schedules
 * cycles ignores sandbox churn.
 */

/* ------------------------------------------------------------------ token */

/** module memory only — a credential this short-lived never touches storage */
let mem: { value: string; expiresAt: number } | null = null

function invalidateToken(): void {
  mem = null
}

async function ensureToken(): Promise<string | null> {
  if (mem && Date.now() < mem.expiresAt - 120_000) return mem.value
  const r = await gcalApi.token()
  if (!r.ok) {
    const s = useGcalStore.getState()
    if (r.code === 'reconnect') {
      s.setNeedsReconnect(true)
      s.setError(errorLine('reconnect', r.raw))
    } else if (r.code === 'notConnected') {
      // another device disconnected — adopt the fact quietly
      s.setConnected(null)
    } else {
      s.setError(errorLine(r.code, r.raw))
    }
    return null
  }
  mem = { value: r.data.accessToken, expiresAt: r.data.expiresAt }
  const s = useGcalStore.getState()
  s.setNeedsReconnect(false)
  s.setConnected({ email: r.data.email, calendarId: r.data.calendarId })
  return r.data.accessToken
}

/* ----------------------------------------------------------------- status */

export async function refreshGcalStatus(): Promise<void> {
  if (!armed() || useAuthStore.getState().status !== 'signedIn') return
  const r = await gcalApi.status()
  if (!r.ok) return // offline or asleep — the cache stands
  const s = useGcalStore.getState()
  s.setConnected(
    r.data.connected ? { email: r.data.email, calendarId: r.data.calendarId } : null,
  )
  if (!r.data.connected) s.setNeedsReconnect(false)
}

/* ---------------------------------------------------------------- helpers */

/** does this event take any of the window? (allDay: anchored inside it) */
function overlapsWin(e: CalendarEvent, min: Date, max: Date): boolean {
  const s = new Date(e.start)
  if (e.allDay) return s >= min && s < max
  return s < max && new Date(e.end) > min
}

const sandboxOpen = (): boolean => useEventsStore.getState().sandbox !== null

/** our writes must not read as edits to the trigger below */
let applying = false

const whyLine = (w: g.GcalWhy): string | null =>
  w === 'offline'
    ? voice.calendars.errors.offline
    : w === 'auth'
      ? null // the next cycle re-mints; not a fact the user needs
      : voice.calendars.errors.google

/* ------------------------------------------------------------------- pull */

/** the primary calendar's ref inside `sourceRef` — the reconciler's scope */
const PRIMARY_REF = 'gcal:primary/'

async function pullIn(token: string, min: Date, max: Date): Promise<boolean> {
  const listed = await g.listEvents(token, 'primary', min.toISOString(), max.toISOString())
  if (!listed.ok) {
    if (listed.why === 'auth') invalidateToken()
    const line = whyLine(listed.why)
    if (line) useGcalStore.getState().setError(line)
    return false
  }
  if (sandboxOpen()) return false

  const events = useEventsStore.getState().events
  const byId = new Map(events.map((e) => [e.id, e]))

  // what Google says the window holds, keyed by the mirror id every device derives
  const fetched = new Map<string, ReturnType<typeof toMirrorShape>>()
  for (const item of listed.data) {
    if (!item.id || item.status === 'cancelled') continue
    // our own events, copied or moved into primary by the user, must not
    // come back as mirrors of themselves — a block double-booking its own hour
    const own = decodeGid(item.id)
    if (own !== null && byId.has(own)) continue
    if (item.extendedProperties?.private?.mj === '1') continue
    const shape = toMirrorShape(item, 'primary')
    if (shape) fetched.set(mirrorId(item.id), shape)
  }

  // ONE synchronous pass — an await between mutations would let a sandbox
  // open midway and quietly eat the rest
  const { addEvent, updateEvent, deleteEvent } = useEventsStore.getState()
  applying = true
  try {
    for (const [id, shape] of fetched) {
      if (!shape) continue
      const existing = byId.get(id)
      if (!existing) {
        addEvent({ ...shape, id })
      } else if (mirrorDiffers(existing, shape)) {
        updateEvent(id, shape)
      }
      // materially identical → not even a touch: updateEvent re-stamps
      // updatedAt, and two connected devices would ping-pong fresh stamps
      // through estate sync forever
    }
    // the sweep judges a window one day NARROWER than the fetch on each side:
    // Google's timeMin/timeMax filter and overlapsWin need not agree about an
    // all-day event sitting exactly on an edge, and a boundary disagreement
    // must fall toward "left standing", never toward delete/re-add flapping
    const sweepMin = addDays(min, 1)
    const sweepMax = addDays(max, -1)
    for (const e of events) {
      if (e.source !== 'google') continue
      if (!e.sourceRef?.startsWith(PRIMARY_REF)) continue
      if (!overlapsWin(e, sweepMin, sweepMax)) continue // out-of-window mirrors are history
      if (!fetched.has(e.id)) deleteEvent(e.id) // the documented diff exception
    }
  } finally {
    applying = false
  }
  return true
}

/* --------------------------------------------------------------- calendar */

/** a stored calendar id that turned out to be deleted at Google — remembered
 *  so the replacement write can prove it is replacing the right corpse */
let deadCalendarId: string | null = null

function calendarGone(dead: string): void {
  deadCalendarId = dead
  const s = useGcalStore.getState()
  if (s.connected) s.setConnected({ ...s.connected, calendarId: null })
  // every ledger entry points into the void; the successor gets fresh inserts
  s.dropPushed(Object.keys(s.pushed))
}

async function ensureCalendar(token: string): Promise<string | null> {
  const conn = useGcalStore.getState().connected
  if (!conn) return null
  if (conn.calendarId) return conn.calendarId

  const created = await g.insertCalendar(token, voice.calendars.calendarName)
  if (!created.ok) {
    if (created.why === 'auth') invalidateToken()
    const line = whyLine(created.why)
    if (line) useGcalStore.getState().setError(line)
    return null
  }
  const saved = await gcalApi.calendar(created.data, deadCalendarId)
  if (!saved.ok) {
    // the registry could not record it — leave no orphan behind and retry whole
    await g.deleteCalendar(token, created.data)
    return null
  }
  deadCalendarId = null
  const winner = saved.data.calendarId
  // another device may have won the race while we were creating; one calendar
  // per account is the registry's rule, so adopt theirs and fold ours
  if (winner !== created.data) await g.deleteCalendar(token, created.data)
  const now = useGcalStore.getState().connected
  if (now) useGcalStore.getState().setConnected({ ...now, calendarId: winner })
  return winner
}

/* -------------------------------------------------------------- write-back */

async function writeBack(token: string, calendarId: string, min: Date, max: Date): Promise<boolean> {
  const listed = await g.listEvents(token, calendarId, min.toISOString(), max.toISOString())
  if (!listed.ok) {
    if (listed.why === 'auth') invalidateToken()
    if (listed.why === 'missing') calendarGone(calendarId)
    const line = whyLine(listed.why)
    if (line) useGcalStore.getState().setError(line)
    return false
  }
  if (sandboxOpen()) return false

  const events = useEventsStore.getState().events
  const byId = new Map(events.map((e) => [e.id, e]))
  const present = new Map<string, (typeof listed.data)[number]>()
  for (const item of listed.data) {
    const local = item.id ? decodeGid(item.id) : null
    if (local !== null) present.set(local, item)
  }

  const { updateEvent } = useEventsStore.getState()
  applying = true
  try {
    for (const [localId, item] of present) {
      const local = byId.get(localId)
      if (!local || item.status === 'cancelled') continue
      const gUpdated = Date.parse(item.updated ?? '')
      const lUpdated = Date.parse(local.updatedAt)
      if (!Number.isFinite(gUpdated) || gUpdated <= lUpdated) continue
      const shape = toMirrorShape(item, 'self')
      // ours are timed blocks; a Google-side conversion to all-day is not a
      // shape the estate's record can take, so it loses to the next push
      if (!shape || shape.allDay) continue
      if (local.title === shape.title && local.start === shape.start && local.end === shape.end)
        continue
      updateEvent(localId, { title: shape.title, start: shape.start, end: shape.end })
      // Google already holds exactly this content — the ledger advances NOW
      // or the next push would echo the same patch straight back
      const fresh = useEventsStore.getState().events.find((e) => e.id === localId)
      if (fresh) useGcalStore.getState().notePushed({ [localId]: fresh.updatedAt })
    }
  } finally {
    applying = false
  }

  // a ledger entry whose Google copy is gone or cancelled while the estate
  // still holds the record: forget the entry, and the next push re-inserts —
  // deleting our record because someone tidied a Google calendar would be the
  // wrong side winning
  const dropped: string[] = []
  const sweepMin = addDays(min, 1)
  const sweepMax = addDays(max, -1)
  for (const localId of Object.keys(useGcalStore.getState().pushed)) {
    const local = byId.get(localId)
    if (!local) continue // a real local deletion — push's delete pass owns it
    // judged a day inside the fetch window, same reasoning as the pull sweep:
    // an edge disagreement must not read as "gone at Google"
    if (!overlapsWin(local, sweepMin, sweepMax)) continue
    const item = present.get(localId)
    if (!item || item.status === 'cancelled') dropped.push(localId)
  }
  if (dropped.length > 0) useGcalStore.getState().dropPushed(dropped)
  return true
}

/* ------------------------------------------------------------------- push */

async function pushOut(token: string, calendarId: string, min: Date, max: Date): Promise<void> {
  const events = useEventsStore.getState().events
  const byId = new Map(events.map((e) => [e.id, e]))

  // the estate's own bookings: carried records, timed, inside the window
  const candidates = events.filter(
    (e) => !e.allDay && e.source !== 'google' && !isProjection(e) && overlapsWin(e, min, max),
  )

  for (const e of candidates) {
    const ledger = useGcalStore.getState().pushed
    if (ledger[e.id] === e.updatedAt) continue
    const gid = encodeGid(e.id)
    if (!gid) continue // a >511-byte id — cannot exist, but never throw over it
    const body = toGoogleEvent(e)
    let res: 'ok' | g.GcalWhy
    if (ledger[e.id] !== undefined) {
      // PATCH first: it keeps whatever color/reminders the user gave our
      // event at Google, and `status:'confirmed'` un-cancels a soft delete
      res = await g.patchEvent(token, calendarId, gid, body)
      if (res === 'missing') res = await g.insertEvent(token, calendarId, { ...body, id: gid })
    } else {
      res = await g.insertEvent(token, calendarId, { ...body, id: gid })
      // 409: the id exists — another device inserted it, or Google holds it
      // cancelled; either way the patch converges on the estate's truth
      if (res === 'exists') res = await g.patchEvent(token, calendarId, gid, body)
    }
    if (res === 'ok') {
      // the ledger advances on confirmation ONLY — it may under-claim (a
      // retried push is idempotent), never over-claim (a lost edit is not)
      useGcalStore.getState().notePushed({ [e.id]: e.updatedAt })
    } else if (res === 'auth') {
      invalidateToken()
      return
    } else if (res === 'offline') {
      return
    } else if (res === 'missing') {
      calendarGone(calendarId)
      return
    } else {
      const line = whyLine(res)
      if (line) useGcalStore.getState().setError(line)
    }
  }

  // deletions: a ledger entry with no committed record behind it means the
  // event was deleted HERE (map-vs-store absence — never a diff of Google's
  // list). Entries whose record merely left the window are pruned unsent.
  for (const localId of Object.keys(useGcalStore.getState().pushed)) {
    const local = byId.get(localId)
    if (local) {
      if (!overlapsWin(local, min, max)) useGcalStore.getState().dropPushed([localId])
      continue
    }
    const gid = encodeGid(localId)
    if (!gid) {
      useGcalStore.getState().dropPushed([localId])
      continue
    }
    const res = await g.deleteEvent(token, calendarId, gid)
    if (res === 'ok' || res === 'missing') {
      useGcalStore.getState().dropPushed([localId])
    } else if (res === 'auth') {
      invalidateToken()
      return
    } else if (res === 'offline') {
      return
    }
  }
}

/* ------------------------------------------------------------------ cycle */

let running = false
let again = false

async function cycle(): Promise<void> {
  if (!armed()) return
  const auth = useAuthStore.getState()
  if (auth.status !== 'signedIn' || !auth.userId) return

  // the shared-laptop guard, same as the estate sync's: one account's mirror
  // bookkeeping must never be spent on another's behalf
  const gs = useGcalStore.getState()
  if (gs.ownerId !== auth.userId) {
    if (gs.ownerId !== null) {
      gs.reset()
      invalidateToken()
    }
    useGcalStore.getState().setOwner(auth.userId)
  }

  if (sandboxOpen()) return // rehearsals own the calendar; APPLY re-triggers us

  if (useGcalStore.getState().connected === null) {
    await refreshGcalStatus()
    if (useGcalStore.getState().connected === null) return
  }

  if (running) {
    again = true
    return
  }
  running = true
  const s = useGcalStore.getState()
  s.setBusy(true)
  s.setError(null)

  try {
    const token = await ensureToken()
    if (token) {
      const today = new Date()
      const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const min = addDays(dayStart, -PAST_DAYS)
      const max = addDays(dayStart, FUTURE_DAYS)

      let sound = true
      if (useGcalStore.getState().pullOn) sound = await pullIn(token, min, max)
      if (sound && useGcalStore.getState().pushOn && !sandboxOpen()) {
        const calendarId = await ensureCalendar(token)
        if (calendarId) {
          const carried = await writeBack(token, calendarId, min, max)
          if (carried && !sandboxOpen()) await pushOut(token, calendarId, min, max)
        }
      }
      if (sound) useGcalStore.getState().setLastSync(new Date().toISOString())
    }
  } catch (e) {
    useGcalStore.getState().setError(e instanceof Error ? e.message : String(e))
  } finally {
    useGcalStore.getState().setBusy(false)
    running = false
    if (again) {
      again = false
      void cycle()
    }
  }
}

/** the button, and anything else that means "now, please" */
export function syncGcalNow(): void {
  void cycle()
}

/* ---------------------------------------------------- connect / disconnect */

export async function connectGoogle(): Promise<void> {
  const s = useGcalStore.getState()
  s.setError(null)
  s.setNotice(null)

  // The walk is minted BEFORE anything leaves for Google. A browser that
  // cannot keep the secret cannot finish the walk, and starting one anyway
  // would spend a real consent screen on a grant nobody could ever claim.
  const walk = await mintWalk()
  if (!walk) {
    s.setError(voice.calendars.claim.blocked)
    return
  }

  s.setBusy(true)
  const r = await gcalApi.begin(walk.hash, useAuthStore.getState().email)
  if (!r.ok) {
    dropWalk() // no walk ever started; a secret left behind would only mislead
    useGcalStore.getState().setBusy(false)
    useGcalStore.getState().setError(errorLine(r.code, r.raw))
    return
  }
  // leaves for Google's consent screen and comes home to `?gcal=…` — busy
  // stays on for the moment of navigation, honestly
  window.location.assign(r.data.url)
}

/* ------------------------------------------------------------------ claim */

/**
 * The last step of the consent walk, and the reason there is a step at all.
 *
 * Google's callback proves only who STARTED the walk, and a walk travels
 * inside a link. Both directions of that have been exploited on paper:
 *
 *  · a consent screen sent to a stranger used to file the STRANGER's calendar
 *    under whoever built the link — so the grant now waits at the server and
 *    is filed under the session that spends it, never a user id read out of
 *    something that travelled through Google;
 *  · and the mirror image — an attacker walking consent with their OWN Google
 *    account, then handing the finished `?gcal=pending&n=…` to a signed-in
 *    victim whose app would claim it without being asked, quietly pointing
 *    that household's calendar at the attacker's.
 *
 * The second is what the WALK SECRET closes. connectGoogle() mints 32 random
 * bytes, keeps them in this tab's sessionStorage and sends only their sha256
 * with `begin`; the server carries that hash through the signed state onto the
 * parked grant, and a claim must present the raw secret to match it. So a link
 * alone buys nothing: the browser that finishes a walk has to be the browser
 * that began it. Identity is the session present; authority is the tab that
 * asked.
 *
 * The secret is a bearer credential for a refresh token, so it is held exactly
 * the way the access tokens are: never in the store (which holds no
 * credential, by charter), never exported, never synced, and out of the
 * address bar before the first line of boot finishes.
 *
 * A claim that could not be SENT — no session yet, no network, a register
 * asleep — keeps what it holds for the triggers below; a claim the server
 * REFUSED drops it, because a spent, expired or mismatched secret is worth
 * nothing to anyone and a second attempt would fail the same way.
 */

/** the walk's own secret: this tab, this walk, and no longer than either */
const WALK_KEY = 'majordomo-gcal-walk'

type Walk = { secret: string; hash: string }
type Grant = { n: string; w: string }

/**
 * sessionStorage and not localStorage, deliberately. A walk is one tab's
 * business: it must not outlive the tab, and it must not be readable by
 * another tab that never started one. A top-level navigation out to Google
 * and back keeps the same tab's sessionStorage, which is exactly the lifetime
 * wanted — no more.
 */
function walkStore(): Storage | null {
  try {
    const s = window.sessionStorage
    const probe = '__gcal_walk__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    // private mode, blocked storage, an embedding that refuses it
    return null
  }
}

const b64url = (bytes: Uint8Array): string => {
  let raw = ''
  for (const b of bytes) raw += String.fromCharCode(b)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 256 bits from the browser's CSPRNG — 43 base64url characters, kept here,
 *  and its shadow (lowercase hex sha256) the only half that ever travels */
async function mintWalk(): Promise<Walk | null> {
  const store = walkStore()
  if (!store) return null
  try {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const secret = b64url(bytes)
    // subtle is absent on an insecure origin; a walk that cannot be hashed is
    // a walk that cannot be bound, and an unbindable walk must not start
    const hash = await sha256Hex(secret)
    store.setItem(WALK_KEY, secret)
    return { secret, hash }
  } catch {
    return null
  }
}

/** one walk, one secret — read and burnt in the same breath, whatever the
 *  claim goes on to do with it */
function takeWalk(): string | null {
  try {
    const secret = window.sessionStorage.getItem(WALK_KEY)
    window.sessionStorage.removeItem(WALK_KEY)
    return secret
  } catch {
    return null
  }
}

function dropWalk(): void {
  try {
    window.sessionStorage.removeItem(WALK_KEY)
  } catch {
    // nothing was stored; nothing to regret
  }
}

let pendingClaim: Grant | null = null

/**
 * At most one claim in the air per tab, and the reason is not tidiness.
 *
 * Boot alone guarantees two callers — the tail below, and the auth
 * subscription firing on loading → signedIn — with a third available from
 * visibilitychange. The secret is single-use at the server: one of them wins
 * the atomic delete and the losers are told the grant does not exist, which is
 * not a retryable answer. Unguarded, a loser painted "the connection was
 * granted but never completed" OVER a connection that had just succeeded, and
 * the reader dutifully walked consent again, minting a second Google grant on
 * top of a working one. So concurrent callers share the first caller's promise
 * and the secret is spent once.
 */
let claimInFlight: Promise<void> | null = null

function claimGrant(): Promise<void> {
  if (claimInFlight) return claimInFlight
  const grant = pendingClaim
  if (!grant) return Promise.resolve()
  claimInFlight = runClaim(grant).finally(() => {
    claimInFlight = null
  })
  return claimInFlight
}

/** which refusals are worth holding the secret for */
const retryable = (code: GcalErrorCode): boolean =>
  code === 'offline' || code === 'unreachable' || code === 'signin'

/** the walk's own sentences: the general error lines promise a catching-up
 *  that a one-use secret cannot honour ("the calendars will catch up when it
 *  is not" is true of a sync, false of a grant nobody claimed) */
const claimLine = (code: GcalErrorCode, raw: string): string => {
  switch (code) {
    case 'offline':
      return voice.calendars.claim.offline
    case 'signin':
      return voice.calendars.claim.signin
    case 'unreachable':
      // the register, not the claim — and its own line already says "shortly"
      return errorLine(code, raw)
    default:
      return voice.calendars.claim.failed
  }
}

async function runClaim(grant: Grant): Promise<void> {
  useGcalStore.getState().setBusy(true)
  const r = await gcalApi.claim(grant.n, grant.w)
  const s = useGcalStore.getState()
  s.setBusy(false)

  // the server answering "nobody is connected" is an answer, not a failure of
  // transport: the grant is gone, and there is nothing left to wait for
  if (r.ok && !r.data.connected) {
    pendingClaim = null
    s.setNotice(null)
    s.setError(voice.calendars.claim.failed)
    ordinaryStart(voice.calendars.claim.failed)
    return
  }
  if (r.ok) {
    pendingClaim = null
    s.setError(null)
    s.setNeedsReconnect(false)
    s.setConnected({ email: r.data.email, calendarId: r.data.calendarId })
    s.setNotice(voice.calendars.returnedConnected)
    void cycle()
    return
  }

  if (!retryable(r.code)) pendingClaim = null
  const line = claimLine(r.code, r.raw)
  s.setNotice(null)
  s.setError(line)
  // a claim that is over, one way or another, must hand the tab back its
  // ordinary work — the boot tail took the claim branch INSTEAD of the usual
  // status-then-cycle, and nothing else was ever going to restore it
  if (!pendingClaim) ordinaryStart(line)
}

/**
 * Take every mirror off the Manor. Real deletions through the store, so real
 * tombstones travel to every device — the one legitimate wholesale removal,
 * declared by the user behind the disconnect confirm.
 */
function purgeMirrors(): void {
  const store = useEventsStore.getState()
  applying = true
  try {
    for (const e of [...store.events]) {
      if (e.source === 'google') store.deleteEvent(e.id)
    }
  } finally {
    applying = false
  }
}

export async function disconnectGoogle(): Promise<boolean> {
  if (sandboxOpen()) {
    // deletions would be redirected into the rehearsal and lost on APPLY
    useGcalStore.getState().setError(voice.calendars.errors.rehearsal)
    return false
  }
  const s = useGcalStore.getState()
  s.setError(null)
  s.setBusy(true)
  const r = await gcalApi.disconnect()
  const after = useGcalStore.getState()
  after.setBusy(false)
  if (!r.ok && r.code !== 'notConnected') {
    after.setError(errorLine(r.code, r.raw))
    return false
  }
  purgeMirrors()
  invalidateToken()
  after.setConnected(null)
  after.setNeedsReconnect(false)
  after.setNotice(null)
  after.dropPushed(Object.keys(useGcalStore.getState().pushed))
  return true
}

/* --------------------------------------------------------------- triggers */

let pushTimer: ReturnType<typeof setTimeout> | null = null

/** a local edit — let the burst settle, then carry it across */
function soon(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void cycle()
  }, 5000)
}

let started = false

export function startGcalService(outcome: string | null, claim: string | null): void {
  if (started || !armed()) return
  started = true

  // whatever line the return door leaves standing, so the ordinary work below
  // can put it back if it starts a cycle over the top of it
  let standing: string | null = null

  if (outcome === 'pending' && claim) {
    // The walk is home but NOTHING is connected yet, and this is the branch
    // that decides whether it ever will be. The secret is read out of this
    // tab's sessionStorage and burnt on the spot — one walk, one secret,
    // whatever happens next.
    const walk = takeWalk()
    if (walk) {
      // the grant is claimed below, against whoever is actually signed in here
      pendingClaim = { n: claim, w: walk }
      useGcalStore.getState().setNotice(voice.calendars.claim.working)
    } else {
      // THIS BROWSER DID NOT START THIS WALK. Somebody else finished a consent
      // screen with their own Google account and handed the address on; a tab
      // that claimed it would file a stranger's calendar over this household's
      // and push its bookings out to them. So nothing is sent at all — no
      // claim, no probe, no acknowledgement the link's author could read.
      standing = voice.calendars.claim.unstarted
      useGcalStore.getState().setError(standing)
    }
  } else if (outcome === 'connected') {
    // a server that still connects on the callback's word alone (an older
    // deployment answering a newer app); its news is still news
    useGcalStore.getState().setNotice(voice.calendars.returnedConnected)
  } else if (outcome === 'denied') {
    standing = voice.calendars.returnedDenied
    useGcalStore.getState().setError(standing)
  } else if (outcome === 'error') {
    standing = voice.calendars.returnedError
    useGcalStore.getState().setError(standing)
  } else if (outcome === 'pending') {
    // home from the walk with nothing to spend — the secret was lost between
    // the callback and here, and only another consent can replace it
    standing = voice.calendars.claim.failed
    useGcalStore.getState().setError(standing)
  }

  // an unclaimable walk secret is litter of the most expensive kind; never
  // leave one lying in a tab that has just been told it cannot use it
  if (!pendingClaim) dropWalk()

  // follow the session, exactly as the estate sync does
  useAuthStore.subscribe((s, prev) => {
    if (s.status === prev.status && s.userId === prev.userId) return
    if (s.status === 'signedIn') {
      // a session that arrived late is the ordinary case for a claim: the
      // registry rehydrates after boot, and the secret waited for it
      if (pendingClaim) void claimGrant()
      else void refreshGcalStatus().then(() => cycle())
    } else if (s.status === 'signedOut') {
      // the mirrors are estate records and stay, like everything on sign-out;
      // only the credential dies with the session
      invalidateToken()
      // …and so does an unspent grant — but only on a GENUINE sign-out, one
      // that had a session to end. Boot's first auth resolution for a visitor
      // who is not signed in is loading → signedOut, and dropping the grant
      // there made the whole "hold it until a session arrives" path (the
      // server's ten-minute window, runClaim's 'signin' retry) unreachable.
      // Whoever signs in NEXT on this tab need not be who walked through
      // Google's consent screen, and handing them that calendar would be the
      // very swap this claim step exists to stop.
      if (prev.status === 'signedIn') pendingClaim = null
    }
  })

  // an edit anywhere on the calendar — but never sandbox churn, and never
  // our own writes echoing back as fresh work
  useEventsStore.subscribe((s, prev) => {
    if (applying) return
    if (s.sandbox !== null) return
    if (s.events === prev.events) return
    soon()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume()
  })
  window.addEventListener('online', () => resume())

  if (pendingClaim) {
    // the claim comes first: a status call before it would only ask the server
    // a question it cannot answer until the grant has an owner. Every terminal
    // outcome hands the tab back to ordinaryStart(), so this branch is a
    // detour and never a dead end.
    void claimGrant()
  } else {
    ordinaryStart(standing)
  }
}

/**
 * The ordinary boot work: what the tab does when no grant is waiting.
 *
 * `standing` is a line already on screen. cycle() clears lastError on its way
 * in — right for a stale sync complaint, wrong for a verdict about a walk —
 * so a line that survived the round trip unchallenged is put back. Anything
 * the cycle itself had to say wins, and says it later.
 */
function ordinaryStart(standing: string | null): void {
  if (useAuthStore.getState().status !== 'signedIn') return
  void refreshGcalStatus()
    .then(() => cycle())
    .then(() => {
      if (standing && useGcalStore.getState().lastError === null) {
        useGcalStore.getState().setError(standing)
      }
    })
}

/** a tab coming back, or a network with it: an unspent grant outranks a cycle,
 *  and is the only thing here that can expire while nobody is looking */
function resume(): void {
  if (pendingClaim) void claimGrant()
  else void cycle()
}

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__gcal = {
    state: () => useGcalStore.getState(),
    now: syncGcalNow,
    status: refreshGcalStatus,
  }
}
