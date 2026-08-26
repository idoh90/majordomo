import { useAuthStore } from '../../core/auth/store'
import { addDays } from '../../core/dates'
import { isProjection } from '../../core/sync/projection'
import { armed } from '../../core/sync/gate'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'
import { errorLine, gcalApi } from './apiClient'
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
  s.setBusy(true)
  const r = await gcalApi.begin(useAuthStore.getState().email)
  if (!r.ok) {
    useGcalStore.getState().setBusy(false)
    useGcalStore.getState().setError(errorLine(r.code, r.raw))
    return
  }
  // leaves for Google's consent screen and comes home to `?gcal=…` — busy
  // stays on for the moment of navigation, honestly
  window.location.assign(r.data.url)
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

export function startGcalService(outcome: string | null): void {
  if (started || !armed()) return
  started = true

  if (outcome === 'connected') {
    useGcalStore.getState().setNotice(voice.calendars.returnedConnected)
  } else if (outcome === 'denied') {
    useGcalStore.getState().setError(voice.calendars.returnedDenied)
  } else if (outcome === 'error') {
    useGcalStore.getState().setError(voice.calendars.returnedError)
  }

  // follow the session, exactly as the estate sync does
  useAuthStore.subscribe((s, prev) => {
    if (s.status === prev.status && s.userId === prev.userId) return
    if (s.status === 'signedIn') {
      void refreshGcalStatus().then(() => cycle())
    } else if (s.status === 'signedOut') {
      // the mirrors are estate records and stay, like everything on sign-out;
      // only the credential dies with the session
      invalidateToken()
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
    if (document.visibilityState === 'visible') void cycle()
  })
  window.addEventListener('online', () => void cycle())

  if (useAuthStore.getState().status === 'signedIn') {
    void refreshGcalStatus().then(() => cycle())
  }
}

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__gcal = {
    state: () => useGcalStore.getState(),
    now: syncGcalNow,
    status: refreshGcalStatus,
  }
}
