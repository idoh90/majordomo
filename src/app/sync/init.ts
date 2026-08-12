import { allRecords, pending, snapshotSize, start } from '../../core/sync/engine'
import { armed, offReason } from '../../core/sync/gate'
import { useSyncStore } from '../../core/sync/store'
import { SYNC_SOURCES } from './registry'
import { startService, syncNow } from './service'
import { shareDebug, shareSyncNow, startShareService } from './shareService'

/**
 * Wire the engine to the wings. Called at module scope from main.tsx, beside
 * initAuth — not from an effect, which StrictMode double-invokes.
 *
 * Subscribing this late is safe and worth writing down: the only mutations
 * before this runs are the `?demo` seeds (which the gate locks the registry out
 * of entirely) and the DEV `?skin=` override. Everything else is caught either
 * by the baseline scan here or, for anything edited while the registry was
 * shut, by the cold reconcile.
 */
export function initSync(): void {
  if (!armed()) return
  // baseline first, THEN the loop — the service pushes what the engine has
  // noticed, and it must not start noticing halfway through its own baseline
  start(SYNC_SOURCES)
  startService()
  // the crew loop rides beside the personal one, its own engine over its own
  // queue; it baselines whatever crews the blob already holds inside
  startShareService()
}

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__sync = {
    /** every record the estate would carry */
    records: allRecords,
    /** how many of them, by wing */
    counts: () => {
      const by: Record<string, number> = {}
      for (const r of allRecords()) by[r.wing] = (by[r.wing] ?? 0) + 1
      return by
    },
    /** what is queued to carry, and what is queued to bury */
    pending,
    snapshotSize,
    state: () => useSyncStore.getState(),
    /** null when the registry is open */
    off: offReason,
    /** force a cycle; `repair` re-pulls the whole registry from scratch */
    now: syncNow,
  }
  ;(window as unknown as Record<string, unknown>).__share = {
    state: shareDebug,
    now: shareSyncNow,
  }
}
