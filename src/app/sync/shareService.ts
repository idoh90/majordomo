import { useAuthStore } from '../../core/auth/store'
import { useShellStore } from '../../core/store/shell'
import { applyQuietly as personalApplyQuietly, createEngine } from '../../core/sync/engine'
import { armed } from '../../core/sync/gate'
import { shareRecordKey, shareWing } from '../../core/sync/shareIntent'
import { useShareStore } from '../../core/sync/shareStore'
import {
  countShareRecords,
  deleteShare,
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
import { canWorkCrew } from '../../modules/workshop/share'
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

  // A GUEST may look and not touch, and the registry says so in the only way
  // that counts (0006's write policies). Sending the push anyway would earn a
  // refusal for the whole batch, which reads here as an outage and would put
  // an error on screen every cycle. The queue is cleared rather than kept: a
  // guest's local edit is never going anywhere, and a queue that only grows is
  // a slow leak. The screen is what stops those edits being made at all.
  if (!canWorkCrew(shareId)) {
    useShareStore.getState().clearPending([...dirtyKeys, ...tombKeys])
    return
  }

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

/**
 * Pull the roster down and cache it — labels, ranks and standings, so all
 * three render offline.
 *
 * Its own function because the RANK GATE reads this cache, and until it did,
 * only a successful pull ever refreshed it. A push refused for want of rank
 * aborted the cycle before the pull ran, so the device could never learn it had
 * been demoted: it went on believing it was a hand, went on offering an
 * editable board, and retried the same doomed push every cycle, for good.
 */
async function refreshRoster(shareId: string): Promise<void> {
  const members = await listMembers(shareId)
  if (members.length === 0) return
  useWorkshopStore.getState().setMembers(
    shareId,
    members.map((m) => ({
      userId: m.userId,
      label: m.label,
      joinedAt: m.joinedAt,
      role: m.role,
      status: m.status,
    })),
  )
}

/** how many of this crew's records this device is currently holding */
function localCount(shareId: string): number {
  const prefix = `${shareWing(shareId)}/`
  return shareEngine
    .allRecords()
    .filter((r) => recordKey(r.wing, r.kind, r.id).startsWith(prefix)).length
}

async function pullOne(shareId: string): Promise<void> {
  const st = useShareStore.getState()
  const since = st.cursors[shareId] ?? null

  /**
   * The repair signal, per crew: more live records there than here means this
   * device lost some (or never had them) — pull from the beginning.
   *
   * `unkept` is what keeps that sentence true. The fold refuses records — as
   * malformed, as not this crew's to speak for, or of a kind this build does
   * not know — so a healthy device legitimately holds FEWER rows than the crew
   * has. Compared naively, one junk record pushed by a crewmate put this device
   * into a full re-pull of the entire crew on every cycle, for good, silently.
   * Subtracting the shortfall measured at the last full pull restores the
   * meaning: a row genuinely lost still widens the gap, and still repairs.
   */
  const remote = await countShareRecords(shareId)
  const unkept = st.unkept[shareId] ?? 0
  const fromScratch =
    since === null || (remote !== null && remote - localCount(shareId) > unkept)

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
    .map((r) => ({
      wing,
      kind: r.kind,
      id: r.id,
      payload: r.payload,
      deleted: r.deleted,
      // carried, not dropped: the registry's word on who wrote this is the only
      // field on the wire the pusher did not choose, and the ledger needs it
      authorId: r.author_id ?? null,
    }))

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

  // A full pull saw everything the crew holds, so what is missing afterwards is
  // exactly what this device declines to keep. Re-measured here and nowhere
  // else: an incremental pull has no idea what it did not ask for.
  if (fromScratch && remote !== null) {
    useShareStore.getState().setUnkept(shareId, remote - localCount(shareId))
  }

  // The venture was deleted FOR the crew and nothing of ours remains under this
  // share. A crew with no venture is nothing, so the share is wound up — but
  // HOW depends on who this device belongs to.
  //
  // The keeper cannot leave their own crew (0007 refuses it), and the old code
  // tried anyway, swallowed the refusal, and dropped the bookkeeping regardless.
  // That left the keeper on a roster for a crew they could no longer see, with
  // no venture on the shelf to reach the Crew Room through, and therefore no way
  // to disband it — an orphan crew, created by any hand who pressed delete.
  // The keeper disbands instead: it is their crew and it is now empty.
  if (ventureTombs > 0) {
    const stillHere = useWorkshopStore
      .getState()
      .ventures.some((v) => v.shareId === shareId)
    if (!stillHere) {
      const me = useAuthStore.getState().userId
      const keeper = useShareStore.getState().owners[shareId]
      if (me && keeper === me) await deleteShare(shareId).catch(() => {})
      else if (me) await leaveShare(shareId).catch(() => {})
      useShareStore.getState().dropShare(shareId)
      return
    }
  }

  await refreshRoster(shareId)
  // The share row is read on EVERY pull, not just the first. The code and the
  // keeper never change, but the door policy does, and no realtime channel
  // watches `shares` — without this a crew shut to applications would go on
  // reading "open" on every device but the keeper's.
  const info = await getShare(shareId).catch(() => null)
  if (info) useShareStore.getState().setCode(shareId, info.code, info.ownerId, info.visibility)
}

/* ----------------------------------------------------------------- cycle */

let running = false
let again = false

/**
 * The display name this account joins rosters under — the one the USER chose.
 *
 * It used to be `email.split('@')[0]`. That put the front half of a private
 * address in front of every stranger on the crew, silently, at the moment of
 * joining. Empty means nothing has been chosen, and step 2 below then declines
 * to redeem rather than inventing something.
 */
function myLabel(): string {
  return useShellStore.getState().crewName.trim()
}

/**
 * Settle every application this device is carrying against the roster rows the
 * registry actually holds. An entry already flagged `declined` is left alone —
 * it is a message waiting to be read, not a job waiting to be done.
 */
function reconcileApplications(memberships: Set<string>, waiting: Set<string>): void {
  const apps = useShareStore.getState().applications
  for (const [shareId, app] of Object.entries(apps)) {
    if (memberships.has(shareId)) {
      useShareStore.getState().setApplication(shareId, null)
      useShareStore.getState().requestPull(shareId)
    } else if (!waiting.has(shareId) && !app.declined) {
      useShareStore.getState().setApplication(shareId, { ...app, declined: true })
    }
  }
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
       bootstraps every crew it is owed.

       A crew we have only APPLIED to is not a membership: it holds a roster
       row, so it comes back from the same query, but it carries no records we
       may read and no venture to adopt. It is reconciled separately below. */
    const { active, pending } = await listMemberships()
    const memberships = new Set(active)
    const localIds = shareIdsOf(useWorkshopStore.getState().ventures)
    for (const id of localIds) {
      if (!memberships.has(id)) {
        useWorkshopStore.getState().adoptPrivateCopy(id)
        useShareStore.getState().dropShare(id)
      }
    }
    ensureSources()
    // NOTE: no `requestPull` for a membership with no local venture. Step 4
    // pulls every membership regardless, so asking was already redundant — and
    // it was worse than redundant: the request woke the loop, the loop found
    // the venture still missing, and asked again. A crew whose venture never
    // materialises (one just created, or one whose venture record the fold
    // refuses) pinned the client in a ~400 ms cycle for as long as it was open.

    /* 1b — applications lodged with vetted crews. Three ends, all decided by
       the roster rather than by anything the keeper sends us: admitted (we are
       a member now), still waiting, or turned away — the row is gone, and the
       entry is KEPT and flagged so the screen can say so once. */
    reconcileApplications(memberships, new Set(pending))

    /* 2 — a held join code (possibly carried across the OAuth redirect). On a
       vetted crew this LODGES rather than joins, and there is nothing to pull
       until the keeper answers. */
    const code = useShareStore.getState().pendingJoin
    // A code with no name behind it waits rather than joining under a guess.
    // Nothing can reach this state through the UI — both doors ask first — so
    // it is a backstop, not a path: a blob hand-edited, or a code accepted on
    // one device and rehydrated on another that has not been told a name.
    if (code && myLabel() !== '') {
      try {
        const joined = await joinShare(code, myLabel())
        useShareStore.getState().setPendingJoin(null)
        if (joined.status === 'pending') {
          useShareStore.getState().setApplication(joined.shareId, { code })
        } else {
          useShareStore.getState().setApplication(joined.shareId, null)
          useShareStore.getState().requestPull(joined.shareId)
          memberships.add(joined.shareId)
        }
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
        // A push refused wholesale means the registry disagrees with something
        // this device believes. Two cases, and NEITHER may take the cycle down
        // with it: rethrowing skipped the pull for every OTHER crew as well,
        // and the pull is the only thing that could have taught this device
        // what it got wrong.
        const still = await listMemberships().catch(() => null)
        if (still && !still.active.includes(id)) {
          // no longer on the roster — kicked or removed mid-flight
          useWorkshopStore.getState().adoptPrivateCopy(id)
          useShareStore.getState().dropShare(id)
          ensureSources()
        } else {
          // still a member, so the likeliest answer is that the RANK changed
          // under us. Refresh the roster then and there: the rank gate reads
          // that cache, and without this it would keep retrying a push the
          // registry will refuse every time.
          await refreshRoster(id).catch(() => {})
          useShareStore.getState().setError(message(e))
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
        const st = useShareStore.getState()
        const keptJoin = st.pendingJoin
        const keptInvite = st.invite
        useShareStore.getState().reset()
        if (keptJoin) useShareStore.getState().setPendingJoin(keptJoin)
        // an invitation not yet answered survives too: signing out is not the
        // same as declining, and the offer is the user's to keep
        if (keptInvite) useShareStore.getState().setInvite(keptInvite)
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
    visibilities: st.visibilities,
    unkept: st.unkept,
    invite: st.invite,
    pendingJoin: st.pendingJoin,
    applications: st.applications,
    pendingPull: st.pendingPull,
    lastError: st.lastError,
    channels: [...liveChannels.keys()],
  }
}
