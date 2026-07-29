import { setWeekStartDefault, type WeekStart } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { useShellStore } from '../../core/store/shell'
import { applyQuietly } from '../../core/sync/engine'
import { isProjection } from '../../core/sync/projection'
import type { IncomingRecord, SyncRecord, SyncSource } from '../../core/sync/types'
import { normalizeSkin } from '../../core/ui/skins'
import { useCapitalStore } from '../../modules/capital/store'
import type { Account, Holding, RecurringExpense, Snapshot, SpendItem } from '../../modules/capital/types'
import { useStudyStore } from '../../modules/study/store'
import { reconcileMarkers } from '../../modules/study/lib'
import type { Exam, Homework, SessionMeta, Subject, SyllabusTopic } from '../../modules/study/types'
import type { Profile } from '../../modules/training/lib/nutrition'
import { useWorkoutStore } from '../../modules/training/store'
import type { Workout } from '../../modules/training/types'
import { useWatchStore } from '../../modules/watch/store'
import type { ShiftTemplate } from '../../modules/watch/types'

/**
 * What each wing contributes to the registry, and how it takes records back.
 *
 * This is the ONLY file that knows both the shape of the estate and the shape
 * of a record, and it lives in app/ deliberately: core/ may not import from
 * modules/, and applying the Study's records has to call the Study's own heal
 * pass afterwards. app/ is the only floor that may see everything.
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
 *
 * Every applier writes through `setState`, NOT through the store's actions —
 * actions would re-run side effects (markers, intent) for records that are
 * merely arriving rather than being authored. The cost is that `setState`
 * skips what those actions normally do, so each applier owes the sorts and
 * module-globals by hand. They are called out where they matter.
 */

const rec = (wing: string, kind: string, id: string, payload: unknown): SyncRecord => ({
  wing,
  kind,
  id,
  payload,
})

const of = (records: IncomingRecord[], kind: string) => records.filter((r) => r.kind === kind)

/** upsert-or-remove by id, then re-sort — `setState` does not sort for us */
function mergeList<T extends { id: string }>(
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

/** the same, for the two collections keyed by something other than an `id` field */
function mergeMap<V>(current: Record<string, V>, incoming: IncomingRecord[]): Record<string, V> {
  if (incoming.length === 0) return current
  const next = { ...current }
  for (const r of incoming) {
    if (r.deleted) delete next[r.id]
    else next[r.id] = r.payload as V
  }
  return next
}

/* --------------------------------------------------------------- the shell */

const shellSource: SyncSource = {
  wing: 'shell',
  toRecords: () => {
    const s = useShellStore.getState()
    return [rec('shell', 'pref', 'skin', s.skin), rec('shell', 'pref', 'weekStart', s.weekStart)]
  },
  subscribe: (onChange) => useShellStore.subscribe(onChange),
  apply: (records) => {
    let skin: ReturnType<typeof normalizeSkin> | undefined
    let weekStart: WeekStart | undefined
    for (const r of of(records, 'pref')) {
      if (r.deleted) continue
      // normalizeSkin is NOT optional: a founder-only skin id arriving on a
      // commercial build has no CSS in the bundle, and the app renders unstyled
      if (r.id === 'skin') skin = normalizeSkin(r.payload)
      if (r.id === 'weekStart') weekStart = r.payload === 0 ? 0 : 1
    }
    if (skin !== undefined) useShellStore.setState({ skin })
    if (weekStart !== undefined) {
      useShellStore.setState({ weekStart })
      // weekStart also lives as a module global in core/dates — without this
      // every week bucket in the app stays silently wrong until a reload
      setWeekStartDefault(weekStart)
    }
  },
}

/* --------------------------------------------------------------- the Manor */

const byStartAsc = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start)

/**
 * Records that arrived mid-rehearsal.
 *
 * Applying to `events` while a what-if is open destroys them: applySandbox
 * overwrites `events` wholesale with the copy taken at enterSandbox, so
 * anything pulled in between vanishes — and discardSandbox would leave the
 * committed blob no longer byte-identical, breaking the what-if's own contract.
 * So they wait, and the wait ends when the rehearsal does.
 */
let heldForSandbox: IncomingRecord[] = []

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
  apply: (records) => {
    const incoming = of(records, 'event')
    if (incoming.length === 0) return
    if (useEventsStore.getState().sandbox) {
      heldForSandbox.push(...incoming)
      return
    }
    useEventsStore.setState((s) => ({ events: mergeList(s.events, incoming, byStartAsc) }))
  },
}

// the rehearsal is over — let the held records in
useEventsStore.subscribe((state, prev) => {
  if (prev.sandbox && !state.sandbox && heldForSandbox.length > 0) {
    const held = heldForSandbox
    heldForSandbox = []
    applyQuietly(() => {
      useEventsStore.setState((s) => ({ events: mergeList(s.events, held, byStartAsc) }))
    })
  }
})

/* -------------------------------------------------------------- the Grounds */

const byDateDesc = (a: Workout, b: Workout) => b.performedAt.localeCompare(a.performedAt)

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
  apply: (records) => {
    const workouts = of(records, 'workout')
    if (workouts.length > 0) {
      useWorkoutStore.setState((s) => ({ workouts: mergeList(s.workouts, workouts, byDateDesc) }))
    }
    for (const r of of(records, 'pref')) {
      if (r.deleted) continue
      if (r.id === 'weeklyGoal' && typeof r.payload === 'number') {
        useWorkoutStore.setState({ weeklyGoal: r.payload })
      }
      if (r.id === 'profile' && r.payload && typeof r.payload === 'object') {
        // merged over the defaults, so an older device's profile missing a
        // newer tunable does not blank it
        const incoming = r.payload as Partial<Profile>
        useWorkoutStore.setState((s) => ({ profile: { ...s.profile, ...incoming } }))
      }
    }
  },
}

/* ---------------------------------------------------------------- the Study */

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

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
      ...Object.entries(s.sessions).map(([eventId, meta]) => rec('study', 'session', eventId, meta)),
    ]
  },
  subscribe: (onChange) => useStudyStore.subscribe(onChange),
  apply: (records) => {
    useStudyStore.setState((s) => ({
      subjects: mergeList<Subject>(s.subjects, of(records, 'subject'), byOrder),
      topics: mergeList<SyllabusTopic>(s.topics, of(records, 'topic'), byOrder),
      homework: mergeList<Homework>(s.homework, of(records, 'homework')),
      exams: mergeList<Exam>(s.exams, of(records, 'exam')),
      sessions: mergeMap<SessionMeta>(s.sessions, of(records, 'session')),
    }))
    // markers are never carried, so this device has to draw its own from the
    // homework and exams that just arrived. Safe here: reconcileMarkers returns
    // early while a rehearsal is open, and the engine is muted for this apply.
    const s = useStudyStore.getState()
    reconcileMarkers(s.homework, s.exams, Date.now())
  },
}

/* --------------------------------------------------------------- the Ledger */

const bySnapshotDateAsc = (a: Snapshot, b: Snapshot) => a.takenAt.localeCompare(b.takenAt)

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
      ...Object.entries(s.spends).map(([month, total]) => rec('ledger', 'spend-month', month, total)),
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
  apply: (records) => {
    useCapitalStore.setState((s) => ({
      accounts: mergeList<Account>(s.accounts, of(records, 'account')),
      holdings: mergeList<Holding>(s.holdings, of(records, 'holding')),
      snapshots: mergeList<Snapshot>(s.snapshots, of(records, 'snapshot'), bySnapshotDateAsc),
      spendItems: mergeList<SpendItem>(s.spendItems, of(records, 'spend-item')),
      recurring: mergeList<RecurringExpense>(s.recurring, of(records, 'recurring')),
      spends: mergeMap<number>(s.spends, of(records, 'spend-month')),
    }))
    for (const r of of(records, 'pref')) {
      if (r.deleted) continue
      if (r.id === 'monthlyBudget' && typeof r.payload === 'number') {
        useCapitalStore.setState({ monthlyBudget: r.payload })
      }
      if (r.id === 'blurAmounts' && typeof r.payload === 'boolean') {
        useCapitalStore.setState({ blurAmounts: r.payload })
      }
      if (r.id === 'paydayDay' && typeof r.payload === 'number') {
        useCapitalStore.setState({ paydayDay: r.payload })
      }
      if (r.id === 'autoRefreshPrices' && typeof r.payload === 'boolean') {
        useCapitalStore.setState({ autoRefreshPrices: r.payload })
      }
    }
  },
}

/* ---------------------------------------------------------------- the Watch */

const byCreatedAt = (a: ShiftTemplate, b: ShiftTemplate) => a.createdAt.localeCompare(b.createdAt)

/**
 * Shift SHAPES only. The watches themselves are calendar events and travel
 * with the Manor; what lives here is the handful of shapes a person actually
 * works, which is the part a second device would otherwise have to retype.
 */
const watchSource: SyncSource = {
  wing: 'watch',
  toRecords: () =>
    useWatchStore.getState().templates.map((x) => rec('watch', 'template', x.id, x)),
  subscribe: (onChange) => useWatchStore.subscribe(onChange),
  apply: (records) =>
    useWatchStore.setState((s) => ({
      templates: mergeList<ShiftTemplate>(s.templates, of(records, 'template'), byCreatedAt),
    })),
}

export const SYNC_SOURCES: SyncSource[] = [
  shellSource,
  manorSource,
  groundsSource,
  studySource,
  ledgerSource,
  watchSource,
]
