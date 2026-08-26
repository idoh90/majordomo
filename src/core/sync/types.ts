/**
 * The registry's vocabulary. Domain-agnostic on purpose: nothing here knows
 * what a workout or a snapshot is, only that the estate is a pile of records
 * identified by (wing, kind, id) — the same tuple that is the primary key in
 * Postgres. A new wing needs no change to this file, or to the table.
 */

export interface SyncRecord {
  /** 'shell' | 'manor' | 'grounds' | 'study' | 'ledger' | 'watch' */
  wing: string
  /** 'event' | 'workout' | 'pref' | … — a wing's own record types */
  kind: string
  id: string
  /**
   * Opaque to everything but the wing that wrote it.
   *
   * MUST be the store's own object, not a copy: the engine identifies unchanged
   * records by object identity (the stores mutate immutably), and a fresh
   * object every scan would defeat that and re-hash the whole estate on every
   * keystroke.
   */
  payload: unknown
}

/** the flat `wing/kind/id` form, for use as a map key */
export type RecordKey = string

export function recordKey(wing: string, kind: string, id: string): RecordKey {
  return `${wing}/${kind}/${id}`
}

/**
 * Split a key back apart. Only the FIRST TWO separators are structural — wings
 * and kinds are our own constants and never contain '/', but an id might, and
 * an id is the one part we do not control.
 */
export function parseKey(key: RecordKey): { wing: string; kind: string; id: string } | null {
  const a = key.indexOf('/')
  if (a < 0) return null
  const b = key.indexOf('/', a + 1)
  if (b < 0) return null
  return { wing: key.slice(0, a), kind: key.slice(a + 1, b), id: key.slice(b + 1) }
}

/**
 * One store's contribution to the registry.
 *
 * `toRecords` is a projection, never a mutation, and is called often — it must
 * stay cheap and must hand back the store's own payload objects (see above).
 */
export interface SyncSource {
  wing: string
  toRecords: () => SyncRecord[]
  /** attach to the store's own change notification; returns an unsubscribe */
  subscribe: (onChange: () => void) => () => void
  /**
   * Fold pulled records into this wing's store.
   *
   * MUST be synchronous. An await between wings opens a window for a component
   * to mount and run a heal pass against a half-applied estate — which is how
   * a marker gets deleted for having no homework that simply had not landed yet.
   */
  apply: (records: IncomingRecord[]) => void
}

/** a record as it came back from the registry */
export interface IncomingRecord {
  wing: string
  kind: string
  id: string
  payload: unknown
  deleted: boolean
  /**
   * WHO WROTE IT, according to the registry — stamped from `auth.uid()` inside
   * the push RPC, so unlike everything else on a record this one field is not
   * the pushing client's to choose. Absent in personal space, where the row is
   * already scoped to one account and the question does not arise.
   */
  authorId?: string | null
}
