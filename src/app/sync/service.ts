import { useAuthStore } from '../../core/auth/store'
import { allRecords } from '../../core/sync/engine'
import { armed } from '../../core/sync/gate'
import { useSyncStore } from '../../core/sync/store'
import {
  countRecords,
  pull,
  pushCold,
  pushHot,
  subscribeRealtime,
  type WireRecord,
} from '../../core/sync/transport'
import { parseKey, recordKey, type IncomingRecord } from '../../core/sync/types'
import { voice } from '../../core/voice'
import { SYNC_SOURCES } from './registry'
import { applyQuietlyAll } from './shareService'

/**
 * The loop: carry what changed up, bring what changed down.
 *
 * Everything here is best-effort and interruptible. A failure leaves the queue
 * exactly as it was and says so once — it never spins, never blocks the UI, and
 * never stands between the user and their estate. Offline is a normal state,
 * not an error.
 */

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const wire = (
  wing: string,
  kind: string,
  id: string,
  payload: unknown,
  deleted: boolean,
  at: number,
): WireRecord => ({
  wing,
  kind,
  id,
  payload: deleted ? null : payload,
  deleted,
  client_updated_at: new Date(at).toISOString(),
})

/* ------------------------------------------------------------------ adopt */

/**
 * Hand this device's estate to a fresh account, insert-only.
 *
 * Insert-only is what makes it safe. A device adopting an estate has no idea
 * when those records were really edited — its queue may have been cleared, the
 * estate may have come from a backup — so its clock is worthless and it is not
 * allowed to win an argument. It may only fill gaps. On a second device this
 * makes first sign-in a union rather than a fight.
 */
async function adopt(): Promise<void> {
  const userId = useAuthStore.getState().userId
  if (!userId) return
  const now = Date.now()
  await pushCold(
    allRecords().map((r) => wire(r.wing, r.kind, r.id, r.payload, false, now)),
    userId,
  )
  useSyncStore.getState().setAdopted(true)
}

/* ------------------------------------------------------------------ drain */

async function drain(): Promise<void> {
  const st = useSyncStore.getState()
  const dirtyKeys = Object.keys(st.dirty)
  const tombKeys = Object.keys(st.tombstones)
  if (dirtyKeys.length === 0 && tombKeys.length === 0) return

  const byKey = new Map(allRecords().map((r) => [recordKey(r.wing, r.kind, r.id), r]))
  const rows: WireRecord[] = []

  for (const key of dirtyKeys) {
    const r = byKey.get(key)
    // Marked dirty, but no longer here — and NO tombstone was recorded, so
    // this is not a deletion. Almost certainly a store that failed to hydrate.
    // Drop the mark and send nothing: the count check will notice we are
    // missing records and pull them back.
    if (!r) continue
    rows.push(wire(r.wing, r.kind, r.id, r.payload, false, st.dirty[key]))
  }

  for (const key of tombKeys) {
    const parsed = parseKey(key)
    if (!parsed) continue
    rows.push(wire(parsed.wing, parsed.kind, parsed.id, null, true, st.tombstones[key]))
  }

  if (rows.length > 0) await pushHot(rows)

  // Cleared whether the server accepted or refused each row. A refusal means
  // the registry held something newer — re-sending ours forever would be a
  // loop, and the pull that follows brings the winning version down instead.
  useSyncStore.getState().clearPending([...dirtyKeys, ...tombKeys])
}

/* ------------------------------------------------------------------- pull */

function foldIn(rows: IncomingRecord[]): void {
  if (rows.length === 0) return
  // ONE synchronous block across every wing. An await between wings lets a
  // component mount and run a heal pass against a half-applied estate.
  // BOTH engines are muted: a personal pull that touches a crew venture's
  // record must not be heard as a local edit by the share engine.
  applyQuietlyAll(() => {
    for (const source of SYNC_SOURCES) {
      const mine = rows.filter((r) => r.wing === source.wing)
      if (mine.length > 0) source.apply(mine)
    }
  })
}

async function takeDown(fromScratch: boolean): Promise<void> {
  const st = useSyncStore.getState()
  const since = fromScratch ? null : st.cursor
  const { rows, cursor } = await pull(since)

  // Never let a pulled record overwrite an edit this device is still carrying:
  // ours has not had its turn at the server's comparison yet. It goes up on the
  // next drain, and the server decides then.
  const pendingNow = useSyncStore.getState()
  const held = new Set([...Object.keys(pendingNow.dirty), ...Object.keys(pendingNow.tombstones)])

  foldIn(
    rows
      .filter((r) => !held.has(recordKey(r.wing, r.kind, r.id)))
      .map((r) => ({
        wing: r.wing,
        kind: r.kind,
        id: r.id,
        payload: r.payload,
        deleted: r.deleted,
      })),
  )

  if (cursor) useSyncStore.getState().setCursor(cursor)
}

/* ------------------------------------------- the two one-way replacements */

const asIncoming = (r: { wing: string; kind: string; id: string; payload: unknown; deleted: boolean }): IncomingRecord => ({
  wing: r.wing,
  kind: r.kind,
  id: r.id,
  payload: r.payload,
  deleted: r.deleted,
})

/** forget everything queued — after a wholesale replacement it describes an
 *  estate that no longer exists on either side */
function dropQueue(): void {
  const s = useSyncStore.getState()
  s.clearPending([...Object.keys(s.dirty), ...Object.keys(s.tombstones)])
}

/**
 * The registry wins. This device is replaced by what the registry holds, and
 * anything here the registry does not have is struck.
 *
 * That second half is what makes it a REPLACEMENT rather than a pull. A plain
 * pull only ever adds and updates, so a record this device holds alone would
 * quietly survive and the two would still disagree — which is not what the user
 * asked for when they said take the other version.
 */
async function takeCloud(): Promise<void> {
  const { rows, cursor } = await pull(null)
  const cloudKeys = new Set(
    rows.filter((r) => !r.deleted).map((r) => recordKey(r.wing, r.kind, r.id)),
  )
  const localOnly: IncomingRecord[] = allRecords()
    .filter((r) => !cloudKeys.has(recordKey(r.wing, r.kind, r.id)))
    .map((r) => ({ wing: r.wing, kind: r.kind, id: r.id, payload: null, deleted: true }))

  foldIn([...rows.map(asIncoming), ...localOnly])
  dropQueue()
  if (cursor) useSyncStore.getState().setCursor(cursor)
  useSyncStore.getState().setAdopted(true)
}

/**
 * This device wins. The registry is replaced by what is here, on every device.
 *
 * Everything local goes up stamped NOW so it beats whatever the registry held,
 * and every record the registry has that this device does not is buried — the
 * one place in the app where deletions are generated from a comparison rather
 * than from intent. That is only legitimate because the user just declared the
 * intent themselves, for the whole estate at once, behind a confirm that says
 * exactly this.
 */
async function takeLocal(): Promise<void> {
  const now = Date.now()
  const local = allRecords()
  const localKeys = new Set(local.map((r) => recordKey(r.wing, r.kind, r.id)))

  const { rows } = await pull(null)
  const doomed = rows
    .filter((r) => !r.deleted && !localKeys.has(recordKey(r.wing, r.kind, r.id)))
    .map((r) => wire(r.wing, r.kind, r.id, null, true, now))

  await pushHot([
    ...local.map((r) => wire(r.wing, r.kind, r.id, r.payload, false, now)),
    ...doomed,
  ])

  dropQueue()
  useSyncStore.getState().setAdopted(true)
  // re-read so the cursor sits past our own writes rather than replaying them
  await takeDown(true)
}

/* ------------------------------------------------------------------ cycle */

/**
 * How two estates should meet the first time. Held in memory only: an
 * unanswered question is re-asked from a known state, never half-restored.
 */
export type FirstSyncChoice = 'merge' | 'takeCloud' | 'takeLocal'
let chosen: FirstSyncChoice | null = null

let running = false
let again = false

async function cycle(opts: { repair?: boolean } = {}): Promise<void> {
  if (!armed()) return
  if (useAuthStore.getState().status !== 'signedIn') return
  if (running) {
    again = true
    return
  }

  running = true
  const sync = useSyncStore.getState()
  sync.setBusy(true)
  sync.setError(null)

  try {
    if (!useSyncStore.getState().adopted) {
      const remote = (await countRecords()) ?? 0
      const local = allRecords().length

      // Two populated estates meeting for the first time. Merging is usually
      // right, but it is not obviously right — and it cannot be undone once the
      // records are mingled. So the loop stops and asks, exactly once.
      if (remote > 0 && local > 0 && chosen === null) {
        useSyncStore.getState().setPendingChoice({ local, cloud: remote })
        return
      }

      const strategy = chosen ?? 'merge'
      chosen = null
      useSyncStore.getState().setPendingChoice(null)

      if (strategy === 'takeCloud') {
        await takeCloud()
      } else if (strategy === 'takeLocal') {
        await takeLocal()
      } else {
        // pull BEFORE adopting: insert-only cannot overwrite what we just took
        // down, so a second device's first sign-in ends as a union
        await takeDown(true)
        await adopt()
      }
    }

    await drain()

    // A count larger than ours means we are missing records the registry still
    // holds — the resurrection path after a local store fails to load.
    let fromScratch = opts.repair === true
    if (!fromScratch) {
      const remote = await countRecords()
      if (remote !== null && remote > allRecords().length) fromScratch = true
    }
    await takeDown(fromScratch)

    useSyncStore.getState().setCarried(new Date().toISOString())
  } catch (e) {
    // the queue is untouched, so nothing is lost — say it once and stop
    useSyncStore.getState().setError(message(e))
  } finally {
    useSyncStore.getState().setBusy(false)
    running = false
    if (again) {
      again = false
      void cycle()
    }
  }
}

/* --------------------------------------------------------------- triggers */

let pushTimer: ReturnType<typeof setTimeout> | null = null

/** a local edit — let a burst settle before carrying it */
function pushSoon(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void cycle()
  }, 2000)
}

let pullTimer: ReturnType<typeof setTimeout> | null = null

/** the registry says something changed — it does not say what, so we ask */
function pullSoon(): void {
  if (pullTimer) clearTimeout(pullTimer)
  pullTimer = setTimeout(() => {
    pullTimer = null
    void cycle()
  }, 400)
}

/** the button, and anything else that means "now, please" */
export function syncNow(opts: { repair?: boolean } = {}): void {
  void cycle(opts)
}

/** the answer to "two estates, how should they meet" */
export function resolveFirstSync(choice: FirstSyncChoice): void {
  chosen = choice
  useSyncStore.getState().setPendingChoice(null)
  void cycle()
}

/**
 * The deliberate, one-way replacements. Available at any time, not just at
 * first sign-in — the user may decide at any point that one side is simply
 * right. Both are destructive by design and both sit behind a confirm that
 * says which side loses.
 */
function runReplacement(fn: () => Promise<void>): void {
  if (!armed() || useAuthStore.getState().status !== 'signedIn') return
  if (running) return
  running = true
  const sync = useSyncStore.getState()
  sync.setBusy(true)
  sync.setError(null)
  void fn()
    .then(() => useSyncStore.getState().setCarried(new Date().toISOString()))
    .catch((e: unknown) => useSyncStore.getState().setError(message(e)))
    .finally(() => {
      useSyncStore.getState().setBusy(false)
      running = false
    })
}

export function replaceLocalFromRegistry(): void {
  runReplacement(takeCloud)
}

export function replaceRegistryFromLocal(): void {
  runReplacement(takeLocal)
}

let stopRealtime: (() => void) | null = null
let started = false

export function startService(): void {
  if (started || !armed()) return
  started = true

  // follow the session: sign in and the loop begins, sign out and it stops
  useAuthStore.subscribe((s, prev) => {
    if (s.status === prev.status && s.userId === prev.userId) return

    if (s.status === 'signedIn' && s.userId) {
      const sync = useSyncStore.getState()
      if (sync.ownerId !== s.userId) {
        if (sync.ownerId !== null) {
          // a DIFFERENT account. Never hand one person's estate to another:
          // forget the bookkeeping, mark it adopted so nothing local is
          // uploaded, and let the pull bring their own records down.
          sync.reset()
          useSyncStore.getState().setAdopted(true)
          useSyncStore.getState().setError(voice.sync.otherOwner)
        }
        useSyncStore.getState().setOwner(s.userId)
      }
      stopRealtime?.()
      stopRealtime = subscribeRealtime(s.userId, pullSoon)
      void cycle()
      return
    }

    if (s.status === 'signedOut') {
      stopRealtime?.()
      stopRealtime = null
      // the estate stays; only the bookkeeping goes
      useSyncStore.getState().reset()
    }
  })

  // a local edit anywhere in the estate
  useSyncStore.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty || s.tombstones !== prev.tombstones) pushSoon()
  })

  // coming back to the app, and coming back to the network
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void cycle()
  })
  window.addEventListener('online', () => void cycle())

  // already signed in when the app opened (the usual case)
  if (useAuthStore.getState().status === 'signedIn') void cycle()
}
