import type { IncomingRecord } from './types'

/**
 * The two fold shapes every applier uses — extracted from app/sync/registry
 * the day the share sources became their second consumer. Domain-agnostic:
 * they know a record has an id and may be deleted, nothing else.
 */

/** upsert-or-remove by id, then re-sort — `setState` does not sort for us */
export function mergeList<T extends { id: string }>(
  current: T[],
  incoming: IncomingRecord[],
  sort?: (a: T, b: T) => number,
): T[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((x) => [x.id, x]))
  for (const r of incoming) {
    if (r.deleted) byId.delete(r.id)
    else byId.set(r.id, r.payload as T)
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
    if (r.deleted) delete next[r.id]
    else next[r.id] = r.payload as V
  }
  return next
}
