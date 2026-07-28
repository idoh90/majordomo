import { armed } from './gate'
import { useSyncStore } from './store'
import { recordKey, type RecordKey, type SyncRecord, type SyncSource } from './types'

/**
 * The engine: notice what changed, and say nothing about what vanished.
 *
 * It sits BESIDE the persist middleware rather than in front of the stores'
 * action surface. The consequence is the whole design: the app still boots
 * synchronously from localStorage with no async gate, and cloud data merely
 * arrives later and setStates in. Offline is untouched.
 *
 * It never emits a deletion. Not one. Tombstones come only from intent.ts —
 * see the long note there for why, and for what the alternative costs.
 */

let sources: SyncSource[] = []
let unsubscribes: Array<() => void> = []
let started = false

/**
 * key → hash of the payload as last seen. IN MEMORY ONLY, rebuilt at every
 * boot, and that is not an oversight:
 *
 *  - it would be ~300-500 KB of a 5 MB localStorage budget, next to an estate
 *    already several MB — and fighting quota is itself a way to corrupt a blob;
 *  - `dirty` already distinguishes "edited this session" from "never tracked",
 *    and unlike this it is durable;
 *  - a persisted snapshot can end up AHEAD of the persisted estate (the sync
 *    store's write happens inside the domain store's setState, before the
 *    domain blob's own write), and a snapshot that is ahead is a snapshot that
 *    manufactures false deletions.
 */
const snapshot = new Map<RecordKey, string>()

/**
 * True while the engine is writing pulled records into the stores. The
 * subscribers fire synchronously, so a plain boolean is enough — no async
 * guard, no queue. Without it every pulled record would be seen as a local
 * edit and pushed straight back.
 */
let applying = false

/**
 * Identity-keyed hashes. The stores mutate immutably, so an untouched record
 * keeps its object reference and hits this cache; only genuinely new objects
 * are stringified. That is what makes a full rescan on every mutation cheap
 * enough to be the whole change-detection strategy.
 */
const hashCache = new WeakMap<object, string>()

function hashOf(payload: unknown): string {
  if (payload !== null && typeof payload === 'object') {
    const hit = hashCache.get(payload)
    if (hit !== undefined) return hit
    const computed = JSON.stringify(payload) ?? 'null'
    hashCache.set(payload, computed)
    return computed
  }
  return JSON.stringify(payload) ?? 'null'
}

/**
 * Re-read one wing and return the keys whose payload differs from the snapshot,
 * updating the snapshot to match.
 *
 * Records that have VANISHED are dropped from the snapshot and reported to
 * nobody. That silence is the doctrine, not an omission.
 */
function scan(source: SyncSource): RecordKey[] {
  const seen = new Map<RecordKey, string>()
  const changed: RecordKey[] = []

  for (const r of source.toRecords()) {
    const key = recordKey(r.wing, r.kind, r.id)
    const hash = hashOf(r.payload)
    seen.set(key, hash)
    if (snapshot.get(key) !== hash) changed.push(key)
  }

  const prefix = `${source.wing}/`
  for (const key of snapshot.keys()) {
    if (key.startsWith(prefix) && !seen.has(key)) snapshot.delete(key)
  }
  for (const [key, hash] of seen) snapshot.set(key, hash)

  return changed
}

function onWingChanged(source: SyncSource): void {
  // a pull is not an edit
  if (applying) return
  const changed = scan(source)
  if (changed.length > 0) useSyncStore.getState().markDirty(changed, Date.now())
}

/**
 * Fold pulled records into the stores without the engine hearing its own echo.
 * `apply` must be SYNCHRONOUS across every wing — an await between wings opens
 * a window for a component to mount and run a heal pass against a half-applied
 * estate.
 */
export function applyQuietly(apply: () => void): void {
  applying = true
  try {
    apply()
  } finally {
    // re-baseline first, so what we just wrote is never mistaken for a local
    // edit, THEN start listening again
    for (const source of sources) scan(source)
    applying = false
  }
}

/** every record the estate would carry, right now */
export function allRecords(): SyncRecord[] {
  return sources.flatMap((s) => s.toRecords())
}

/**
 * Take the current estate as the baseline WITHOUT marking any of it dirty.
 *
 * A first boot is not a pile of edits. Getting the estate up to a fresh account
 * is the cold reconcile's job (insert-only, so it can never overwrite), not the
 * dirty queue's.
 */
export function start(registered: SyncSource[]): void {
  if (started || !armed()) return
  started = true
  sources = registered

  for (const source of sources) scan(source)
  for (const source of sources) {
    unsubscribes.push(source.subscribe(() => onWingChanged(source)))
  }
}

export function stop(): void {
  for (const off of unsubscribes) off()
  unsubscribes = []
  sources = []
  snapshot.clear()
  started = false
}

/** what is waiting to be carried, and what is waiting to be buried */
export function pending(): { dirty: RecordKey[]; tombstones: RecordKey[] } {
  const s = useSyncStore.getState()
  return { dirty: Object.keys(s.dirty), tombstones: Object.keys(s.tombstones) }
}

export function snapshotSize(): number {
  return snapshot.size
}
