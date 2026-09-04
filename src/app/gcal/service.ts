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
 * bytes, keeps them to this browser (walkStores(), below — two carriers, one
 * binding) and sends only their sha256 with `begin`; the server carries that
 * hash through the signed state onto the parked grant, and a claim must present
 * the raw secret to match it. So a link alone buys nothing: the browser that
 * finishes a walk has to be the browser that began it. Identity is the session
 * present; authority is the browser that asked — and, since the record names
 * the household that asked, the account that asked.
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

/** the walk's own secret: this walk, and no longer than the server's own state */
const WALK_KEY = 'majordomo-gcal-walk'

/**
 * How long a stored walk is worth reading — the same ten minutes `api/google.ts`
 * signs a state for. Past it the walk it belongs to cannot be finished anyway,
 * so a record older than this is not a secret, it is litter with a live shape.
 */
const WALK_TTL_MS = 10 * 60_000

type Walk = { secret: string; hash: string }

/** what a claim has to present, and who is entitled to make it */
type Grant = { n: string; w: string; owner: string | null }

/**
 * What is kept while a walk is out at Google: the secret itself, the household
 * that began the walk, and when. The last two are not decoration — see
 * `claimGrant()` for the account swap `owner` refuses, and `readWalk()` for
 * what `mintedAt` sweeps.
 */
type WalkRecord = { secret: string; owner: string | null; mintedAt: number }

/**
 * TWO CARRIERS, and the second one is a concession to a platform rather than a
 * relaxation of the rule.
 *
 * sessionStorage is the lifetime this wants and the first place it is written:
 * one tab's business, dead when the tab is, invisible to a tab that never
 * started a walk, and preserved across the top-level navigation out to Google
 * and back. That was the whole design, and on an ordinary browser it is still
 * exactly what happens.
 *
 * It is not sufficient on its own, because the walk leaves the app. An INSTALLED
 * app (the manifest says `standalone`, and the estate is meant to be installed)
 * may hand a cross-origin navigation to the system browser or a custom tab, and
 * the consent screen and the return then happen in a context whose
 * sessionStorage never held anything. A return that lands in a new tab does the
 * same. In that state the app could never connect Google at all — a total,
 * repeatable, silent failure, and the sentence on screen blamed the reader for
 * using another browser. So the record is written to localStorage too, and a
 * read takes whichever carrier still has it.
 *
 * WHAT THAT COSTS, stated plainly: another tab of the same browser can now read
 * the record. What it does NOT cost is the binding, which is the only thing the
 * security rests on — a browser handed a finished `?gcal=pending&n=…` link it
 * did not earn holds no record matching THAT walk's hash, whichever carrier it
 * looks in, and its claim is refused and burns the attacker's grant. The
 * property given up is invisibility between two tabs of one profile, which is
 * one person looking at their own storage. The localStorage copy is fenced by
 * `mintedAt` instead of by the tab's lifetime, and it is deleted the moment it
 * is spent.
 *
 * It is still out of reach of `core/backup.ts`: that export reads localStorage
 * against an ALLOW-list, so a key nobody added cannot ride into a file somebody
 * mails themselves. It does match `hasEstate()`'s `majordomo*` sweep, which is
 * harmless only because of WHO writes it: `begin` needs a bearer, so a walk can
 * only be minted from inside the app by a signed-in reader, who has had an
 * estate and an `sb-` key since long before. Nothing pre-consent ever writes
 * here — the reason `majordomo-telemetry` had to be careful.
 */
function walkStores(): Storage[] {
  const found: Storage[] = []
  for (const pick of [() => window.sessionStorage, () => window.localStorage]) {
    try {
      const s = pick()
      const probe = '__gcal_walk__'
      s.setItem(probe, '1')
      s.removeItem(probe)
      found.push(s)
    } catch {
      // private mode, blocked storage, an embedding that refuses it
    }
  }
  return found
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
  const stores = walkStores()
  if (stores.length === 0) return null
  try {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const secret = b64url(bytes)
    // subtle is absent on an insecure origin; a walk that cannot be hashed is
    // a walk that cannot be bound, and an unbindable walk must not start
    const hash = await sha256Hex(secret)
    // the household that is walking. `begin` needs a bearer, so there is always
    // one — and it is what stops a walk begun by one account being spent by
    // another that happened to sign in on this browser meanwhile
    const record: WalkRecord = {
      secret,
      owner: useAuthStore.getState().userId,
      mintedAt: Date.now(),
    }
    const written = JSON.stringify(record)
    for (const store of stores) store.setItem(WALK_KEY, written)
    return { secret, hash }
  } catch {
    return null
  }
}

/** whichever carrier still holds it, if it is still inside the window the
 *  server would honour. A record past that cannot finish its walk, so it is
 *  swept rather than returned — this is also what keeps a localStorage copy
 *  from outliving the tab it was minted in by more than the walk itself. */
function readWalk(): WalkRecord | null {
  for (const store of walkStores()) {
    let raw: string | null = null
    try {
      raw = store.getItem(WALK_KEY)
    } catch {
      continue
    }
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<WalkRecord>
      if (typeof parsed.secret !== 'string' || typeof parsed.mintedAt !== 'number') continue
      if (Date.now() - parsed.mintedAt > WALK_TTL_MS) continue
      return {
        secret: parsed.secret,
        owner: typeof parsed.owner === 'string' ? parsed.owner : null,
        mintedAt: parsed.mintedAt,
      }
    } catch {
      // not ours, a half-written value, or the bare secret this key used to
      // hold before it carried an owner and a mint time — a walk in flight
      // across that deploy comes home to the `unstarted` line and one more
      // consent screen, which is the correct cost of a format change and the
      // reason that line carries a remedy
    }
  }
  return null
}

/** one walk, one secret — read and burnt in the same breath, whatever the
 *  claim goes on to do with it */
function takeWalk(): WalkRecord | null {
  const record = readWalk()
  dropWalk()
  return record
}

function dropWalk(): void {
  for (const store of walkStores()) {
    try {
      store.removeItem(WALK_KEY)
    } catch {
      // nothing was stored; nothing to regret
    }
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

  // THE WALK'S OWN HOUSEHOLD, and this is the last swap the claim step had left
  // open. A grant is held across boot's first `loading → signedOut` on purpose
  // (below), which is also what a session that lapsed while its owner stood at
  // Google's consent screen looks like. Sign-ins broadcast between tabs of one
  // browser profile, so the NEXT session to arrive here could be somebody
  // else's — and it would have been handed a calendar it never walked for,
  // which is the exact confusion the whole claim exists to prevent, reached
  // from inside the house instead of from a link. The walk recorded who began
  // it; only they may finish it. Nobody signed in yet is not a mismatch — that
  // is the wait the ten-minute window is for.
  const who = useAuthStore.getState().userId
  if (grant.owner !== null && who !== null && who !== grant.owner) {
    pendingClaim = null
    const s = useGcalStore.getState()
    s.setNotice(null)
    s.setError(voice.calendars.claim.otherAccount)
    standingLine = voice.calendars.claim.otherAccount
    ordinaryStart()
    return Promise.resolve()
  }

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
    standingLine = voice.calendars.claim.failed
    ordinaryStart()
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

  if (!retryable(r.code)) {
    pendingClaim = null
    // A CLAIM CAN FAIL ON THE WAY BACK. The server deletes the row, files the
    // grant, and the reply is lost in transit; the retry then finds nothing and
    // is answered 'expired', which reads here as *granted but never completed*
    // over a connection that is already made. A reader who obeys that sentence
    // walks the consent screen and mints a second Google grant on top of a live
    // one — precisely what the in-flight guard above exists to prevent, reached
    // through another door. So the household is ASKED before it is told, and a
    // 'yes' outranks the claim's own verdict: a grant that turns out to be
    // filed here is a success that lost its receipt.
    //
    // On a RECONNECT the row was already there, so a 'yes' can also be the old
    // connection answering for itself. That is why this hands straight to
    // cycle() rather than declaring victory: the very next thing it does is ask
    // Google for a token on that grant, and a lapsed one says so in its own
    // words a second later. Better a right answer arriving late than a wrong
    // instruction to walk consent again.
    await refreshGcalStatus()
    if (useGcalStore.getState().connected !== null) {
      const after = useGcalStore.getState()
      after.setError(null)
      after.setNeedsReconnect(false)
      after.setNotice(voice.calendars.returnedConnected)
      void cycle()
      return
    }
  }
  const line = claimLine(r.code, r.raw)
  const now = useGcalStore.getState()
  now.setNotice(null)
  now.setError(line)
  // a claim that is over, one way or another, must hand the tab back its
  // ordinary work — the boot tail took the claim branch INSTEAD of the usual
  // status-then-cycle, and nothing else was ever going to restore it
  if (!pendingClaim) {
    standingLine = line
    ordinaryStart()
  }
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

  if (outcome === 'pending' && claim) {
    // The walk is home but NOTHING is connected yet, and this is the branch
    // that decides whether it ever will be. The record is read out of whichever
    // carrier still holds it and burnt on the spot — one walk, one secret,
    // whatever happens next.
    const walk = takeWalk()
    if (walk) {
      // the grant is claimed below, against whoever is actually signed in here
      pendingClaim = { n: claim, w: walk.secret, owner: walk.owner }
      useGcalStore.getState().setNotice(voice.calendars.claim.working)
    } else {
      // THIS BROWSER DID NOT START THIS WALK. Somebody else finished a consent
      // screen with their own Google account and handed the address on; a tab
      // that claimed it would file a stranger's calendar over this household's
      // and push its bookings out to them. So nothing is sent at all — no
      // claim, no probe, no acknowledgement the link's author could read. The
      // line carries a remedy as well as the fact, because an honest reader can
      // land here too — a walk older than ten minutes, storage cleared mid-walk
      // — and being told only that they are in the wrong browser leaves them
      // with nothing to do about it.
      standingLine = voice.calendars.claim.unstarted
      useGcalStore.getState().setError(standingLine)
    }
  } else if (outcome === 'connected') {
    // a server that still connects on the callback's word alone (an older
    // deployment answering a newer app); its news is still news
    useGcalStore.getState().setNotice(voice.calendars.returnedConnected)
    dropWalk()
  } else if (outcome === 'denied') {
    standingLine = voice.calendars.returnedDenied
    useGcalStore.getState().setError(standingLine)
    dropWalk()
  } else if (outcome === 'error') {
    standingLine = voice.calendars.returnedError
    useGcalStore.getState().setError(standingLine)
    dropWalk()
  } else if (outcome === 'pending') {
    // home from the walk with nothing to spend — the secret was lost between
    // the callback and here, and only another consent can replace it
    standingLine = voice.calendars.claim.failed
    useGcalStore.getState().setError(standingLine)
    dropWalk()
  }

  // NOTHING IS SWEPT ON AN ORDINARY BOOT, and that is the fix for a bug this
  // very line used to be. A walk survives a top-level navigation out to Google
  // and back — but the tab in between is free to be re-created: BACK out of the
  // consent screen with the bfcache missing, a service worker serving a fresh
  // document, iOS reclaiming memory. Each of those is a boot with no `?gcal=`
  // param, and dropping the record there destroyed a live walk thirty seconds
  // old and then told its owner it had been begun in another browser, while the
  // grant they went on to authorise sat parked and unclaimable. A record is
  // swept when the return door says the walk is over, and otherwise ages out on
  // its own `mintedAt`.

  // follow the session, exactly as the estate sync does
  useAuthStore.subscribe((s, prev) => {
    if (s.status === prev.status && s.userId === prev.userId) return
    if (s.status === 'signedIn') {
      // a session that arrived late is the ordinary case for a claim: the
      // registry rehydrates after boot, and the secret waited for it
      if (pendingClaim) void claimGrant()
      // …and it is the ordinary case for the rest of boot too. `initAuth()`
      // resolves through a dynamic import, so the status is ALWAYS 'loading'
      // when the tail below runs and the tail's own ordinaryStart() always
      // returns at the door. This is where the boot work actually happens, and
      // routing it through the same function is what carries a standing verdict
      // — a denial, a refused claim — across that resolution. Called directly,
      // the cycle here cleared the line before anyone could read it.
      else ordinaryStart()
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
      // very swap this claim step exists to stop — which is why holding the
      // grant across this transition is safe only in company: claimGrant()
      // refuses an account that does not match the walk's recorded owner, and
      // a sign-in broadcast from another tab of the same profile arrives here
      // looking exactly like the session that walked.
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
    ordinaryStart()
  }
}

/**
 * A verdict from the return door that has to outlive the cycle following it.
 *
 * It is a module variable rather than an argument because the two are separated
 * by an await nobody controls: the boot tail sets it while auth is still
 * 'loading', and the work that would erase it does not start until the session
 * resolves a moment later, in the subscription above. Passed as an argument it
 * was simply dropped — every boot took the early return, and the denial or the
 * refused claim the reader most needed to see was the one line guaranteed to
 * disappear.
 */
let standingLine: string | null = null

/**
 * The ordinary boot work: what the tab does when no grant is waiting.
 *
 * cycle() clears lastError on its way in — right for a stale sync complaint,
 * wrong for a verdict about a walk — so a line that survived the round trip
 * unchallenged is put back. Anything the cycle itself had to say wins, and says
 * it later. The line is consumed only once the work actually starts, so a boot
 * that leaves at the door keeps it for the session that arrives next.
 */
function ordinaryStart(): void {
  if (useAuthStore.getState().status !== 'signedIn') return
  const standing = standingLine
  standingLine = null
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
