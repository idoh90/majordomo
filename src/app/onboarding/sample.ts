import { applyQuietly } from '../../core/sync/engine'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { useCapitalStore } from '../../modules/capital/store'
import type { Account, Snapshot } from '../../modules/capital/types'
import { useStudyStore } from '../../modules/study/store'
import type { Subject } from '../../modules/study/types'
import { useWorkoutStore } from '../../modules/training/store'
import type { Workout } from '../../modules/training/types'

/**
 * The walk's costume department: a wing the user left EMPTY is dressed with
 * sample records for its three beats, then swept the moment the tour moves on.
 * A room the user already furnished — watches they posted, subjects they
 * enrolled — is never touched; their own data IS the show there.
 *
 * Three rules make this safe enough to exist:
 *
 *  1. **Every sample id carries the `onb-demo-` prefix.** Sweeping is a filter
 *     by prefix, nothing else — so a sweep can never take anything real, and a
 *     cloud record pulled down mid-walk simply survives the filter.
 *  2. **Every write and every sweep goes through `applyQuietly`.** The sync
 *     engine re-baselines instead of noticing, so nothing here is ever marked
 *     dirty, pushed, or — worse — tombstoned. The registry never learns the
 *     costumes existed.
 *  3. **`sweepSample()` runs at boot** (initOnboarding), because persist writes
 *     the dressed stores to localStorage like any other state: a tab closed
 *     mid-walk leaves the costume on, and the next boot must take it off
 *     before anything reads the stores as truth.
 *
 * Store writes are direct `setState`, the same bargain the sync appliers make:
 * actions would run side effects (intent notes, marker sync) for records that
 * are scenery, not authorship.
 */

const PREFIX = 'onb-demo-'

/** local instant `d` days from today at `h` (fractional) hours */
function at(dayOffset: number, h: number): Date {
  const now = new Date()
  const whole = Math.floor(h)
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + dayOffset,
    whole,
    Math.round((h - whole) * 60),
  )
}

const iso = (d: Date) => d.toISOString()

let seq = 0
const id = () => `${PREFIX}${++seq}`

/* ------------------------------------------------------------------ dress */

/** dress the store(s) behind `wing`, when — and only when — they are empty */
export function dressWing(wing: string): void {
  if (wing === 'watch') dressWatch()
  else if (wing === 'training') dressGrounds()
  else if (wing === 'study') dressStudy()
  else if (wing === 'capital') dressLedger()
}

/**
 * The Watch: a working week mid-stride — hours already stood so the ring has
 * something to say, a night watch with its pencilled sleep, and one ahead so
 * the countdown runs. Skipped whenever ANY shift exists: those are the user's
 * own, posted minutes ago, and hiding them behind scenery would be theft.
 */
function dressWatch(): void {
  const events = useEventsStore.getState().events
  if (events.some((e) => e.kind === 'shift' && !e.allDay)) return

  const ev = (
    day: number,
    startH: number,
    endH: number,
    kind: CalendarEvent['kind'],
    title: string,
  ): CalendarEvent => ({
    id: id(),
    source: 'watch',
    kind,
    title,
    start: iso(at(day, startH)),
    end: iso(at(day, endH)),
    updatedAt: iso(new Date()),
  })

  const sample: CalendarEvent[] = [
    ev(-2, 7, 20, 'shift', 'Day Watch'),
    ev(-1, 19, 32, 'shift', 'Night Watch'),
    ev(0, 9, 15, 'sleep', 'Sleep'),
    ev(1, 7, 20, 'shift', 'Day Watch'),
    ev(3, 19, 32, 'shift', 'Night Watch'),
  ]

  applyQuietly(() =>
    useEventsStore.setState((s) => ({
      events: [...s.events, ...sample].sort((a, b) => a.start.localeCompare(b.start)),
    })),
  )
}

/**
 * The Grounds: a fortnight of sessions, the recent ones still warm so the body
 * map actually glows — a cold map is the one thing this stop must not show.
 */
function dressGrounds(): void {
  if (useWorkoutStore.getState().workouts.length > 0) return

  const w = (
    daysAgo: number,
    ppl: 'push' | 'pull' | 'legs',
    primary: Workout['primary'],
    secondary: Workout['secondary'],
    effort: number,
    repStyle: Workout['repStyle'],
  ): Workout => {
    const performed = at(-daysAgo, 17.5)
    return {
      id: id(),
      performedAt: iso(performed),
      createdAt: iso(performed),
      method: 'ppl',
      ppl,
      primary,
      secondary,
      effort,
      strainFeel: Math.max(3, effort - 1),
      repStyle,
    }
  }

  const sample: Workout[] = [
    w(0, 'legs', ['quads', 'hamstrings', 'glutes'], ['calves', 'lower-back'], 9, 'heavy'),
    w(1, 'push', ['chest', 'front-delts', 'triceps'], ['side-delts', 'abs'], 7, 'mixed'),
    w(3, 'pull', ['lats', 'biceps'], ['rear-delts', 'traps', 'forearms'], 8, 'mixed'),
    w(5, 'legs', ['quads', 'glutes'], ['hamstrings', 'calves'], 6, 'light'),
    w(8, 'push', ['chest', 'side-delts'], ['triceps', 'front-delts'], 8, 'heavy'),
    w(11, 'pull', ['lats', 'traps'], ['biceps', 'rear-delts'], 7, 'mixed'),
  ]

  applyQuietly(() =>
    useWorkoutStore.setState((s) => ({
      workouts: [...s.workouts, ...sample].sort((a, b) =>
        b.performedAt.localeCompare(a.performedAt),
      ),
    })),
  )
}

/**
 * The Study: three subjects on the rings, two sessions already answered for
 * this week (the rings fill), one booked ahead (the Manor link shows). The
 * docket is left alone — homework and exams write Manor markers through a heal
 * pass that mints its own ids, which the sweep could not reclaim.
 */
function dressStudy(): void {
  if (useStudyStore.getState().subjects.length > 0) return

  const now = iso(new Date())
  const subj = (name: string, goalH: number, order: number): Subject => ({
    id: id(),
    name,
    goalH,
    order,
    createdAt: now,
  })
  const subjects = [
    subj('Linear Algebra', 6, 0),
    subj('Philosophy', 4, 1),
    subj('Spanish', 2.5, 2),
  ]

  const session = (day: number, startH: number, endH: number, s: Subject): CalendarEvent => ({
    id: id(),
    source: 'study',
    kind: 'study',
    title: s.name,
    start: iso(at(day, startH)),
    end: iso(at(day, endH)),
    sourceRef: `subj:${s.id}`,
    updatedAt: now,
  })
  const done1 = session(-2, 10, 12, subjects[0])
  const done2 = session(-1, 16, 17.5, subjects[1])
  const ahead = session(1, 10, 12, subjects[0])

  applyQuietly(() => {
    useStudyStore.setState((s) => ({
      subjects: [...s.subjects, ...subjects],
      sessions: {
        ...s.sessions,
        [done1.id]: { fulfillment: 'done' as const },
        [done2.id]: { fulfillment: 'done' as const },
        [ahead.id]: { fulfillment: 'planned' as const },
      },
    }))
    useEventsStore.setState((s) => ({
      events: [...s.events, done1, done2, ahead].sort((a, b) => a.start.localeCompare(b.start)),
    }))
  })
}

/**
 * The Ledger: four accounts and five monthly snapshots climbing gently, so the
 * Vault has a figure, the chart a history, the allocation its bars. No budget,
 * no holdings — those are scalars and live feeds, not records a prefix can
 * reclaim, and the stop asks for no money anyway.
 */
function dressLedger(): void {
  if (useCapitalStore.getState().accounts.length > 0) return

  const accounts: Account[] = [
    { id: id(), name: 'Checking', assetClass: 'cash' },
    { id: id(), name: 'Savings', assetClass: 'cash' },
    { id: id(), name: 'Index fund', assetClass: 'investment' },
    { id: id(), name: 'Pension', assetClass: 'pension' },
  ]
  const [checking, savings, fund, pension] = accounts

  const snap = (monthsAgo: number, drift: number): Snapshot => {
    const d = new Date()
    d.setMonth(d.getMonth() - monthsAgo)
    return {
      id: id(),
      takenAt: iso(d),
      balances: {
        [checking.id]: Math.round(6200 + drift * 300),
        [savings.id]: Math.round(38000 + drift * 1200),
        [fund.id]: Math.round(52000 + drift * 2600),
        [pension.id]: Math.round(31000 + drift * 900),
      },
    }
  }
  const snapshots = [snap(4, 0), snap(3, 1), snap(2, 2), snap(1, 3), snap(0, 4)]

  applyQuietly(() =>
    useCapitalStore.setState((s) => ({
      accounts: [...s.accounts, ...accounts],
      snapshots: [...s.snapshots, ...snapshots],
    })),
  )
}

/* ------------------------------------------------------------------ sweep */

const isSample = (x: { id: string }) => x.id.startsWith(PREFIX)

/**
 * An event is scenery if it IS a sample — or if it was drawn FROM one: the
 * wings' heal passes project demo records onto the Manor under their own
 * fresh ids (a demo workout begets a `workout:onb-demo-…` training block),
 * and a sweep that only reads ids would leave those phantoms standing.
 */
const isSampleEvent = (e: CalendarEvent) =>
  isSample(e) || (e.sourceRef !== undefined && e.sourceRef.includes(PREFIX))

/**
 * Take every costume off, everywhere, idempotently. Filters by prefix and
 * writes only where something actually matched, so calling it at every boot
 * and every stop-change costs nothing when there is nothing to do.
 */
export function sweepSample(): void {
  applyQuietly(() => {
    const ev = useEventsStore.getState()
    if (ev.events.some(isSampleEvent)) {
      useEventsStore.setState({ events: ev.events.filter((e) => !isSampleEvent(e)) })
    }

    const tr = useWorkoutStore.getState()
    if (tr.workouts.some(isSample)) {
      useWorkoutStore.setState({ workouts: tr.workouts.filter((w) => !isSample(w)) })
    }

    const st = useStudyStore.getState()
    if (st.subjects.some(isSample) || Object.keys(st.sessions).some((k) => k.startsWith(PREFIX))) {
      useStudyStore.setState({
        subjects: st.subjects.filter((s) => !isSample(s)),
        sessions: Object.fromEntries(
          Object.entries(st.sessions).filter(([k]) => !k.startsWith(PREFIX)),
        ),
      })
    }

    const cap = useCapitalStore.getState()
    if (cap.accounts.some(isSample) || cap.snapshots.some(isSample)) {
      useCapitalStore.setState({
        accounts: cap.accounts.filter((a) => !isSample(a)),
        snapshots: cap.snapshots.filter((s) => !isSample(s)),
      })
    }
  })
}

/** is anything currently wearing a costume? (the walk card's SAMPLE tag) */
export function sampleDressed(): boolean {
  return (
    useEventsStore.getState().events.some(isSample) ||
    useWorkoutStore.getState().workouts.some(isSample) ||
    useStudyStore.getState().subjects.some(isSample) ||
    useCapitalStore.getState().accounts.some(isSample)
  )
}
