import { armed } from './gate'
import { useSyncStore } from './store'
import { recordKey } from './types'

/**
 * THE ONLY AUTHORITY THAT MAY DELETE A CLOUD RECORD.
 *
 * Read this before changing anything about how deletions are found.
 *
 * The obvious design is to derive deletions by comparing the estate against a
 * snapshot: present before, absent now, therefore deleted. It is wrong, and it
 * is wrong in the way that loses everything.
 *
 * A store that fails to load is ALSO absent. zustand's persist middleware
 * swallows a hydration failure — `.catch(e => postRehydrationCallback(void 0, e))`
 * — leaving the store at its initializer defaults, with no throw and nothing in
 * the console; and `createJSONStorage.getItem` does an unguarded JSON.parse. So
 * one corrupt blob reads as an empty store, an empty store reads as "the user
 * deleted all of it", and the tombstones go up and wipe every other device.
 * Permanently, silently, for the whole estate. The same goes for a migrate that
 * throws, a quota error, and importing an older backup.
 *
 * A diff cannot tell "the user deleted this" from "this failed to load". Both
 * are absence. Deletion is the only operation that cannot be undone, so it is
 * the only one that does not get to be inferred:
 *
 *      Diff for upserts. Intent for tombstones. When in doubt, resurrect.
 *
 * A spurious upsert costs one row write. A spurious tombstone costs the record.
 * So upserts are guessed and deletions are declared — here, from inside the
 * action that actually deletes, which is the one place that knows WHY the
 * record went away.
 *
 * The corollary matters as much: "the cloud has it, this device does not, and
 * no tombstone was recorded" is NOT a deletion. It is a repair signal, and the
 * record comes back. Under the diff design a corrupt blob was extinction; under
 * this one it is the cloud noticing and putting the estate back, which is the
 * thing a backend was wanted for in the first place.
 */
export function noteDeleted(wing: string, kind: string, ids: readonly string[]): void {
  if (!armed() || ids.length === 0) return
  useSyncStore.getState().markDeleted(
    ids.map((id) => recordKey(wing, kind, id)),
    Date.now(),
  )
}

/**
 * Deletions implied by wholesale replacement — `setRecurring`, `setMonthItems`,
 * `replaceAll`: sheets that commit a whole list, where a removed row never gets
 * its own delete call.
 *
 * Safe where a global diff is not, and the difference is the point: this is
 * called FROM the replacing action, which knows the full set it is replacing
 * and knows it is replacing it. A store that failed to hydrate can never
 * masquerade as a call to setRecurring.
 */
export function noteReplaced(
  wing: string,
  kind: string,
  before: readonly string[],
  after: readonly string[],
): void {
  if (!armed()) return
  const kept = new Set(after)
  noteDeleted(
    wing,
    kind,
    before.filter((id) => !kept.has(id)),
  )
}
