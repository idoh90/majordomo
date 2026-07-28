import { useEventsStore } from '../../core/events/store'
import { useShellStore } from '../../core/store/shell'
import { isProjection } from '../../core/sync/projection'
import type { SyncRecord, SyncSource } from '../../core/sync/types'
import { useCapitalStore } from '../../modules/capital/store'
import { useStudyStore } from '../../modules/study/store'
import { useWorkoutStore } from '../../modules/training/store'

/**
 * What each wing contributes to the registry.
 *
 * This is the ONLY file that knows both the shape of the estate and the shape
 * of a record, and it lives in app/ deliberately: core/ may not import from
 * modules/, and later milestones need to call a wing's own heal pass after
 * applying its records. app/ is the only floor that may see everything.
 *
 * Two rules hold throughout:
 *
 *  - `payload` is the store's OWN object, never a copy. The engine identifies
 *    unchanged records by object identity, so a spread here would re-hash the
 *    whole estate on every keystroke.
 *  - One record per singleton FIELD, never one grouped 'prefs' record. Editing
 *    the weekly goal on a phone and body weight on a laptop, both offline,
 *    would otherwise be a single conflicted record and one edit would vanish.
 *    Rows are free at this scale; a silently dropped edit is not.
 */

const rec = (wing: string, kind: string, id: string, payload: unknown): SyncRecord => ({
  wing,
  kind,
  id,
  payload,
})

/* --------------------------------------------------------------- the shell */

const shellSource: SyncSource = {
  wing: 'shell',
  toRecords: () => {
    const s = useShellStore.getState()
    return [rec('shell', 'pref', 'skin', s.skin), rec('shell', 'pref', 'weekStart', s.weekStart)]
  },
  subscribe: (onChange) => useShellStore.subscribe(onChange),
}

/* --------------------------------------------------------------- the Manor */

const manorSource: SyncSource = {
  wing: 'manor',
  toRecords: () => {
    const { events } = useEventsStore.getState()
    // markers drawn from homework/exams/payday are redrawn locally, never
    // carried — see core/sync/projection.ts for what carrying them destroys.
    // `sandbox` is not read at all: a rehearsal is not an edit until applied.
    return events.filter((e) => !isProjection(e)).map((e) => rec('manor', 'event', e.id, e))
  },
  subscribe: (onChange) => useEventsStore.subscribe(onChange),
}

/* -------------------------------------------------------------- the Grounds */

const groundsSource: SyncSource = {
  wing: 'grounds',
  toRecords: () => {
    const s = useWorkoutStore.getState()
    return [
      ...s.workouts.map((w) => rec('grounds', 'workout', w.id, w)),
      rec('grounds', 'pref', 'weeklyGoal', s.weeklyGoal),
      rec('grounds', 'pref', 'profile', s.profile),
      // `skin` is a frozen legacy passthrough nothing reads — excluded
    ]
  },
  subscribe: (onChange) => useWorkoutStore.subscribe(onChange),
}

/* ---------------------------------------------------------------- the Study */

const studySource: SyncSource = {
  wing: 'study',
  toRecords: () => {
    const s = useStudyStore.getState()
    return [
      ...s.subjects.map((x) => rec('study', 'subject', x.id, x)),
      ...s.topics.map((x) => rec('study', 'topic', x.id, x)),
      ...s.homework.map((x) => rec('study', 'homework', x.id, x)),
      ...s.exams.map((x) => rec('study', 'exam', x.id, x)),
      // keyed by event id, which is stable and unique; the value has no id of
      // its own. Orphans are inert and are never buried — see pruneSessions.
      ...Object.entries(s.sessions).map(([eventId, meta]) =>
        rec('study', 'session', eventId, meta),
      ),
    ]
  },
  subscribe: (onChange) => useStudyStore.subscribe(onChange),
}

/* --------------------------------------------------------------- the Ledger */

const ledgerSource: SyncSource = {
  wing: 'ledger',
  toRecords: () => {
    const s = useCapitalStore.getState()
    return [
      ...s.accounts.map((x) => rec('ledger', 'account', x.id, x)),
      ...s.holdings.map((x) => rec('ledger', 'holding', x.id, x)),
      // `balances` stays whole inside the payload — shredding it per account
      // would make deleting an account a rewrite of every snapshot row
      ...s.snapshots.map((x) => rec('ledger', 'snapshot', x.id, x)),
      ...s.spendItems.map((x) => rec('ledger', 'spend-item', x.id, x)),
      ...s.recurring.map((x) => rec('ledger', 'recurring', x.id, x)),
      // one record per MONTH, so editing July can never clobber June
      ...Object.entries(s.spends).map(([month, total]) =>
        rec('ledger', 'spend-month', month, total),
      ),
      rec('ledger', 'pref', 'monthlyBudget', s.monthlyBudget),
      rec('ledger', 'pref', 'blurAmounts', s.blurAmounts),
      rec('ledger', 'pref', 'paydayDay', s.paydayDay),
      rec('ledger', 'pref', 'autoRefreshPrices', s.autoRefreshPrices),
      // DELIBERATELY ABSENT:
      //   apiKey — a credential. A leaked read-only quote key is a small
      //     failure; a mistake in row-level security on a table holding
      //     credentials is not. Retyped once per device instead.
      //   prices / history / fx / pricesUpdatedAt — a network cache, rebuilt
      //     on demand. refreshPrices rewrites all four on every poll, so
      //     carrying them would be a write storm that syncs nothing real.
    ]
  },
  subscribe: (onChange) => useCapitalStore.subscribe(onChange),
}

export const SYNC_SOURCES: SyncSource[] = [
  shellSource,
  manorSource,
  groundsSource,
  studySource,
  ledgerSource,
]
