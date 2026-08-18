import type { IncomingRecord } from './types'

/**
 * The two fold shapes every applier uses — extracted from app/sync/registry
 * the day the share sources became their second consumer. Domain-agnostic:
 * they know a record has an id and may be deleted, nothing else.
 */

/**
 * THE RECORD'S id IS THE AUTHORITY — never the payload's.
 *
 * A record arrives as an addressed envelope (`kind`/`id`) with an opaque
 * payload inside, and the two are written by the same client, so nothing stops
 * a hostile one from addressing an envelope to `harmless` while the letter
 * inside calls itself `something-of-yours`. Stored wholesale, that payload
 * lands under the envelope's key while carrying somebody else's id — two rows
 * with one identity, and every `find(x => x.id === …)` in the app then reaches
 * whichever it meets first.
 *
 * So the id is stamped from the envelope on the way in. The copy is made ONLY
 * when the two disagree: the honest path keeps payload identity, which is what
 * the engine's hash cache is keyed on.
 */
function identify<T extends { id: string }>(r: IncomingRecord): T | null {
  const p = r.payload as T | null
  // a non-deleted record with no object payload is malformed, not empty
  if (p === null || typeof p !== 'object') return null
  return p.id === r.id ? p : { ...p, id: r.id }
}

/** upsert-or-remove by id, then re-sort — `setState` does not sort for us */
export function mergeList<T extends { id: string }>(
  current: T[],
  incoming: IncomingRecord[],
  sort?: (a: T, b: T) => number,
): T[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((x) => [x.id, x]))
  for (const r of incoming) {
    if (r.deleted) {
      byId.delete(r.id)
      continue
    }
    const p = identify<T>(r)
    if (p) byId.set(r.id, p)
  }
  const next = [...byId.values()]
  return sort ? next.sort(sort) : next
}

/** the same, for collections keyed by something other than an `id` field */
export function mergeMap<V>(
  current: Record<string, V>,
  incoming: IncomingRecord[],
): Record<string, V> {
  if (incoming.length === 0) return current
  const next = { ...current }
  for (const r of incoming) {
    if (r.deleted) {
      delete next[r.id]
      continue
    }
    // keyed by the envelope, and the payload here carries no id of its own to
    // disagree with it — a malformed one is still refused rather than stored
    const p = r.payload
    if (p !== null && typeof p === 'object') next[r.id] = p as V
  }
  return next
}
