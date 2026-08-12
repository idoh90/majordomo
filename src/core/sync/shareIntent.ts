import { armed } from './gate'
import { useShareStore } from './shareStore'
import { recordKey, type RecordKey } from './types'

/**
 * The crew-space twin of intent.ts — THE ONLY AUTHORITY THAT MAY DELETE A
 * SHARED RECORD. The doctrine is the same and it matters MORE here: a diffed
 * deletion in personal space wipes your own other devices; a diffed deletion
 * in a share wipes the record for every member of the crew. Read the long
 * note in intent.ts before changing anything about this.
 *
 *      Diff for upserts. Intent for tombstones. When in doubt, resurrect.
 */

/** the wing string a share's records travel under */
export const shareWing = (shareId: string): string => `share:${shareId}`

export const shareRecordKey = (shareId: string, kind: string, id: string): RecordKey =>
  recordKey(shareWing(shareId), kind, id)

/** read a shareId back out of a `share:<id>` wing, or null for ordinary wings */
export function shareIdOfWing(wing: string): string | null {
  return wing.startsWith('share:') ? wing.slice(6) : null
}

export function noteShareDeleted(
  shareId: string,
  kind: string,
  ids: readonly string[],
): void {
  if (!armed() || ids.length === 0) return
  useShareStore.getState().markDeleted(
    ids.map((id) => shareRecordKey(shareId, kind, id)),
    Date.now(),
  )
}
