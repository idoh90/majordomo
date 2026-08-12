import { useAuthStore } from '../../core/auth/store'
import { applyQuietly as personalApplyQuietly, createEngine } from '../../core/sync/engine'
import { armed } from '../../core/sync/gate'
import { shareRecordKey, shareWing } from '../../core/sync/shareIntent'
import { useShareStore } from '../../core/sync/shareStore'
import {
  countShareRecords,
  getShare,
  joinShare,
  leaveShare,
  listMembers,
  listMemberships,
  pullShare,
  pushShareHot,
  subscribeShareRealtime,
  type ShareWireRecord,
} from '../../core/sync/shareTransport'
import { parseKey, recordKey, type IncomingRecord } from '../../core/sync/types'
import { buildShareSources, shareIdsOf, shareSource } from '../../modules/workshop/shareSource'
import { useWorkshopStore } from '../../modules/workshop/store'

/**
 * The crew loop — the share-space twin of service.ts, one engine over
 * `majordomo-share`, one cycle over every crew this account belongs to.
 * Everything is best-effort and interruptible: a failure leaves the queues
 * exactly as they were and says so once. Offline is a normal state.
 *
 * The one rule it adds to the house: EVERY remote apply — personal or share —
 * runs under applyQuietlyAll, so a pull folded into one space is never heard
 * as a local edit by the other. Without it, device C hears a share pull as a
 * personal edit (or vice versa), re-pushes a stale record with a fresh clock,
 * and LWW-beats a genuine newer write.
 */

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** the crew engine — the personal one lives as engine.ts's default instance */
const shareEngine = createEngine({
  markDirty: (keys, at) => useShareStore.getState().markDirty(keys, at),
})

/** mute BOTH engines around a remote apply — the standing rule */
export function applyQuietlyAll(apply: () => void): void {
  personalApplyQuietly(() => shareEngine.applyQuietly(apply))
}

/* ------------------------------------------------------- source lifecycle */

let sourcesKey: string | null = null

/** rebuild the engine's sources when the set of crews changes — synchronous,
 *  so there is no gap; durable dirty keys survive the restart by design */
function ensureSources(): void {
  const key = shareIdsOf(useWorkshopStore.getState().ventures).join(',')
  if (key === sourcesKey) return
  sourcesKey = key
  shareEngine.stop()
  shareEngine.start(buildShareSources())
}

/* ----------------------------------------------------------------- drain */

async function drainShare(shareId: string): Promise<void> {
  const st = useShareStore.getState()
  const prefix = `${shareWing(shareId)}/`
  const dirtyKeys = Object.keys(st.dirty).filter((k) => k.startsWith(prefix))
  const tombKeys = Object.keys(st.tombstones).filter((k) => k.startsWith(prefix))
  if (dirtyKeys.length === 0 && tombKeys.length === 0) return

  const byKey = new Map(
    shareEngine.allRecords().map((r) => [recordKey(r.wing, r.kind, r.id), r]),
  )
  const rows: ShareWireRecord[] = []

  for (const key of dirtyKeys) {
    const r = byKey.get(key)
    // marked dirty but no longer emitted, and no tombstone — not a deletion;
    // drop the mark, the count check pulls anything genuinely missing back
    if (!r) continue
    rows.push({
      kind: r.kind,
      id: r.id,
      payload: r.payload,
      deleted: false,
      client_updated_at: new Date(st.dirty[key]).toISOString(),
    })
  }
  for (const key of tombKeys) {
    const parsed = parseKey(key)
    if (!parsed) continue
    rows.push({
      kind: parsed.kind,
      id: parsed.id,
      payload: null,
      deleted: true,
      client_updated_at: new Date(st.tombstones[key]).toISOString(),
    })
  }

  if (rows.length > 0) await pushShareHot(shareId, rows)

  // cleared whether accepted or refused — a refusal means the crew registry
  // held something newer, and the pull brings the winning version down
  useShareStore.getState().clearPending([...dirtyKeys, ...tombKeys])
}

/* ------------------------------------------------------------------ pull */

async function pullOne(shareId: string): Promise<void> {
  const st = useShareStore.getState()
  const since = st.cursors[shareId] ?? null

  // the repair signal, per crew: more live records there than here means this
  // device lost some (or never had them) — pull from the beginning
  let fromScratch = since === null
  if (!fromScratch) {
    const remote = await countShareRecords(shareId)
    if (remote !== null) {
      const prefix = `${shareWing(shareId)}/`
      const local = shareEngine
        .allRecords()
        .filter((r) => recordKey(r.wing, r.kind, r.id).startsWith(prefix)).length
      if (remote > local) fromScratch = true
    }
  }

  const { rows, cursor } = await pullShare(shareId, fromScratch ? null : since)

  // never let a pulled record overwrite an edit this device is still carrying
  const pendingNow = useShareStore.getState()
  const held = new Set([
    ...Object.keys(pendingNow.dirty),
    ...Object.keys(pendingNow.tombstones),
  ])

  const wing = shareWing(shareId)
  const incoming: IncomingRecord[] = rows
    .filter((r) => !held.has(shareRecordKey(shareId, r.kind, r.id)))
    .map((r) => ({ wing, kind: r.kind, id: r.id, payload: r.payload, deleted: r.deleted }))

  const ventureTombs = incoming.filter((r) => r.kind === 'venture' && r.deleted).length

  if (incoming.length > 0) {
    // an ad-hoc source instance: `apply` is stateless, and on a fresh join the
    // engine has no source for this crew yet (the venture only materializes
    // from this very fold)
    const src = shareSource(shareId)
    applyQuietlyAll(() => src.apply(incoming))
  }

  if (cursor) useShareStore.getState().setCursor(shareId, cursor)

  // the fold may have created (or buried) this crew's venture — re-key sources
  ensureSources()

  // the venture was deleted FOR the crew and nothing of ours remains under
  // this share: leave the roster quietly and forget the bookkeeping
  if (ventureTombs > 0) {
    const stillHere = useWorkshopStore
      .getState()
      .ventures.some((v) => v.shareId === shareId)
    if (!stillHere) {
      const me = useAuthStore.getState().userId
      if (me) await leaveShare(shareId, me).catch(() => {})
      useShareStore.getState().dropShare(shareId)
      return
    }
  }

  // roster + code refresh — cached so labels and the code render offline
  const members = await listMembers(shareId)
  if (members.length > 0) {
    useWorkshopStore.getState().setMembers(
      shareId,
      members.map((m) => ({ userId: m.userId, label: m.label, joinedAt: m.joinedAt })),
    )
  }
  if (!useShareStore.getState().codes[shareId] || !useShareStore.getState().owners[shareId]) {
    const info = await getShare(shareId).catch(() => null)
    if (info) useShareStore.getState().setCode(shareId, info.code, info.ownerId)
  }
}

/* ----------------------------------------------------------------- cycle */

let running = false
let again = false

/** the display name this account joins rosters under */
function myLabel(): string {
  const email = useAuthStore.getState().email
  return email ? email.split('@')[0] : 'someone'
}

async function cycle(): Promise<void> {
  if (!armed()) return
  if (useAuthStore.getState().status !== 'signedIn') return
  if (running) {
    again = true
    return
  }

  running = true
  const store = useShareStore.getState()
  store.setBusy(true)
  store.setError(null)

  try {
    ensureSources()

    /* 1 — membership reconcile: the server's roster is the truth about
       belonging. A crew we left (or were removed from) becomes a private
       copy; a crew we belong to with no local presence gets pulled — which
       is also how a fresh device (or an estate imported under this account)
       bootstraps every crew it is owed. */
    const memberships = new Set(await listMemberships())
    const localIds = shareIdsOf(useWorkshopStore.getState().ventures)
    for (const id of localIds) {
      if (!memberships.has(id)) {
        useWorkshopStore.getState().adoptPrivateCopy(id)
        useShareStore.getState().dropShare(id)
      }
    }
    ensureSources()
    for (const id of memberships) {
      if (!localIds.includes(id)) useShareStore.getState().requestPull(id)
    }

    /* 2 — a held join code (possibly carried across the OAuth redirect) */
    const code = useShareStore.getState().pendingJoin
    if (code) {
      try {
        const joined = await joinShare(code, myLabel())
        useShareStore.getState().setPendingJoin(null)
        useShareStore.getState().requestPull(joined)
        memberships.add(joined)
      } catch (e) {
        // an unknown code is an answer, not an outage — stop retrying it
        useShareStore.getState().setPendingJoin(null)
        useShareStore.getState().setError(message(e))
      }
    }

    /* 3 — carry every crew's queue up */
    for (const id of memberships) {
      try {
        await drainShare(id)
      } catch (e) {
        // a push refused wholesale usually means we are no longer on the
        // roster (kicked mid-flight) — check, and step out gracefully
        const still = await listMemberships().catch(() => null)
        if (still && !still.includes(id)) {
          useWorkshopStore.getState().adoptPrivateCopy(id)
          useShareStore.getState().dropShare(id)
          ensureSources()
        } else {
          throw e
        }
      }
    }

    /* 4 — bring every crew's changes down */
    const toPull = new Set([...memberships, ...useShareStore.getState().pendingPull])
    for (const id of toPull) {
      await pullOne(id)
      useShareStore.getState().clearPull(id)
    }

    /* 5 — realtime hints follow the memberships */
    manageRealtime([...memberships])
  } catch (e) {
    useShareStore.getState().setError(message(e))
  } finally {
    useShareStore.getState().setBusy(false)
    running = false
    if (again) {
      again = false
      void cycle()
    }
  }
}

/* -------------------------------------------------------------- triggers */

let pushTimer: ReturnType<typeof setTimeout> | null = null

function pushSoon(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void cycle()
  }, 2000)
}

let pullTimer: ReturnType<typeof setTimeout> | null = null

function pullSoon(): void {
  if (pullTimer) clearTimeout(pullTimer)
  pullTimer = setTimeout(() => {
    pullTimer = null
    void cycle()
  }, 400)
}

export function shareSyncNow(): void {
  void cycle()
}

/* -------------------------------------------------------------- realtime */

const liveChannels = new Map<string, () => void>()

function manageRealtime(shareIds: string[]): void {
  const wanted = new Set(shareIds)
  for (const [id, dispose] of liveChannels) {
    if (!wanted.has(id)) {
      dispose()
      liveChannels.delete(id)
    }
  }
  for (const id of wanted) {
    if (!liveChannels.has(id)) {
      liveChannels.set(id, subscribeShareRealtime(id, pullSoon))
    }
  }
}

function dropRealtime(): void {
  for (const dispose of liveChannels.values()) dispose()
  liveChannels.clear()
}

/* ----------------------------------------------------------------- start */

let started = false

export function startShareService(): void {
  if (started || !armed()) return
  started = true

  // follow the session, exactly as the personal loop does. On a DIFFERENT
  // account the membership reconcile is the cleaner: crews the new account
  // does not belong to become private copies on the first cycle.
  useAuthStore.subscribe((s, prev) => {
    if (s.status === prev.status && s.userId === prev.userId) return
    if (s.status === 'signedIn' && s.userId) {
      void cycle()
      return
    }
    if (s.status === 'signedOut') {
      dropRealtime()
      // Only a REAL sign-out (signedIn → signedOut) forgets the bookkeeping —
      // the boot-time settle (loading → signedOut) must not, or a ?join code
      // stashed for after sign-in is wiped in the very window it exists to
      // survive. And even a real sign-out keeps the stashed code: an invite
      // redeemed under the next account to sign in is the intended flow.
      if (prev.status === 'signedIn') {
        const keep = useShareStore.getState().pendingJoin
        useShareStore.getState().reset()
        if (keep) useShareStore.getState().setPendingJoin(keep)
      }
    }
  })

  // a local edit in any crew's records, or a tombstone declared
  useShareStore.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty || s.tombstones !== prev.tombstones) pushSoon()
    if (s.pendingPull !== prev.pendingPull && s.pendingPull.length > 0) pullSoon()
    if (s.pendingJoin !== prev.pendingJoin && s.pendingJoin) pullSoon()
  })

  // the set of crews changed (a venture was shared, or adopted private)
  useWorkshopStore.subscribe((s, prev) => {
    if (s.ventures !== prev.ventures) ensureSources()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void cycle()
  })
  window.addEventListener('online', () => void cycle())

  if (useAuthStore.getState().status === 'signedIn') void cycle()
}

/** DEV window handle */
export function shareDebug() {
  const st = useShareStore.getState()
  return {
    records: shareEngine.allRecords(),
    dirty: Object.keys(st.dirty),
    tombstones: Object.keys(st.tombstones),
    cursors: st.cursors,
    codes: st.codes,
    pendingJoin: st.pendingJoin,
    pendingPull: st.pendingPull,
    lastError: st.lastError,
    channels: [...liveChannels.keys()],
  }
}
