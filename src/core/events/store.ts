import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { makeId } from '../ids'
import { addDays, localDayKey, startOfWeek } from '../dates'
import { noteDeleted, noteReplaced } from '../sync/intent'
import { isProjection } from '../sync/projection'
import type { CalendarEvent } from './types'

/** projections are never carried, so their removal is never a deletion */
const carried = (events: CalendarEvent[]): string[] =>
  events.filter((e) => !isProjection(e)).map((e) => e.id)

/**
 * The shared events store — every wing writes through these actions, the
 * Manor reads through selectors. THIS ACTION SURFACE IS THE FUTURE BACKEND
 * SEAM: components never touch localStorage or the array directly, so a
 * Supabase-backed repo can later feed the same store as a cache without any
 * UI changes.
 */

/** the what-if fork: a full draft copy + the ids the rehearsal touched */
export interface EventsSandbox {
  events: CalendarEvent[]
  changed: string[]
}

interface EventsState {
  events: CalendarEvent[]
  /** never persisted — a reload loses only the rehearsal */
  sandbox: EventsSandbox | null
  addEvent: (e: Omit<CalendarEvent, 'id' | 'updatedAt'> & { id?: string }) => CalendarEvent
  updateEvent: (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => void
  deleteEvent: (id: string) => void
  replaceAll: (events: CalendarEvent[]) => void
  enterSandbox: () => void
  /** fold the rehearsal into the committed events in one write */
  applySandbox: () => void
  discardSandbox: () => void
}

const byStartAsc = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start)

const touched = (changed: string[], id: string) =>
  changed.includes(id) ? changed : [...changed, id]

export const useEventsStore = create<EventsState>()(
  persist(
    (set, get) => ({
      events: [],
      sandbox: null,
      // mutations route to the sandbox draft while a rehearsal is active —
      // committed events are structurally unreachable until applySandbox.
      // That is also why the registry needs no sandbox guard when READING: a
      // rehearsal never touches `events`, so the engine sees nothing to carry
      // until it is applied. Do not "fix" that by syncing `sandbox`.
      addEvent: (e) => {
        const full: CalendarEvent = {
          ...e,
          id: e.id ?? makeId(),
          updatedAt: new Date().toISOString(),
        }
        set((s) =>
          s.sandbox
            ? {
                sandbox: {
                  events: [...s.sandbox.events, full].sort(byStartAsc),
                  changed: touched(s.sandbox.changed, full.id),
                },
              }
            : { events: [...s.events, full].sort(byStartAsc) },
        )
        return full
      },
      updateEvent: (id, patch) =>
        set((s) => {
          const apply = (list: CalendarEvent[]) =>
            list
              .map((e) =>
                e.id === id ? { ...e, ...patch, id, updatedAt: new Date().toISOString() } : e,
              )
              .sort(byStartAsc)
          return s.sandbox
            ? {
                sandbox: {
                  events: apply(s.sandbox.events),
                  changed: touched(s.sandbox.changed, id),
                },
              }
            : { events: apply(s.events) }
        }),
      deleteEvent: (id) => {
        const s = get()
        if (s.sandbox) {
          // a rehearsal is not a deletion until it is applied
          set({
            sandbox: {
              events: s.sandbox.events.filter((e) => e.id !== id),
              changed: touched(s.sandbox.changed, id),
            },
          })
          return
        }
        const gone = s.events.find((e) => e.id === id)
        set({ events: s.events.filter((e) => e.id !== id) })
        // projections are redrawn locally and never carried, so their heal
        // passes must not be able to bury a cloud record
        if (gone && !isProjection(gone)) noteDeleted('manor', 'event', [id])
      },
      replaceAll: (events) => {
        const before = carried(get().events)
        set({ events: [...events].sort(byStartAsc) })
        noteReplaced('manor', 'event', before, carried(events))
      },
      enterSandbox: () =>
        set((s) => ({ sandbox: { events: s.events.map((e) => ({ ...e })), changed: [] } })),
      applySandbox: () => {
        const s = get()
        if (!s.sandbox) return
        const before = new Set(carried(s.events))
        const next = s.sandbox.events
        const survives = new Set(next.map((e) => e.id))
        // only the ids the rehearsal actually touched can have been deleted by
        // it — the store already tracks them, so this needs no extra bookkeeping
        const removed = s.sandbox.changed.filter((id) => before.has(id) && !survives.has(id))
        set({ events: next, sandbox: null })
        noteDeleted('manor', 'event', removed)
      },
      // deliberately records NOTHING: discarding a rehearsal must leave the
      // committed estate exactly as it was, here and in the cloud
      discardSandbox: () => set({ sandbox: null }),
    }),
    {
      name: 'majordomo-events',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ events: s.events }),
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__events = useEventsStore

  // ?demo seeds the design's "brutal week" into an empty events store:
  // four 13-hour night watches, a fortnight of written-down sleep, next
  // week's pencilled recovery blocks, training, study, a payday.
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    useEventsStore.getState().events.length === 0
  ) {
    const week0 = startOfWeek(new Date())
    /** today's column index within this week — negative offsets reach backwards */
    const today = new Date()
    const todayIdx = Math.round(
      (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
        week0.getTime()) /
        86_400_000,
    )
    const at = (day: number, hour: number): string => {
      const d = addDays(week0, day)
      const h = Math.floor(hour)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, (hour - h) * 60).toISOString()
    }
    const ev = (
      day: number,
      startH: number,
      endH: number,
      kind: CalendarEvent['kind'],
      title: string,
      source: CalendarEvent['source'] = 'manual',
      allDay?: boolean,
    ): CalendarEvent => ({
      id: makeId(),
      source,
      kind,
      title,
      start: at(day, startH),
      end: at(day, endH),
      allDay,
      updatedAt: new Date().toISOString(),
    })
    /**
     * Fourteen mornings back from today, minus two nobody wrote down.
     *
     * Shapes rather than random noise: eight ordinary nights around 23:20 →
     * 06:50, four daytime sleeps after a night watch (09:00 → 15:00), and a
     * short one. That is what makes the body-clock instrument worth looking at
     * — a fortnight of identical nights draws a flat band and demonstrates
     * nothing about the chart or about the person.
     *
     * Ids are literal (`demo-night-<n>`) so the sleep store's own demo block
     * can hang ratings off them; the `slept:` ref is what marks a block as a
     * RECORD rather than one of the estate's pencil marks (core/sleep/lib.ts).
     *
     * Mornings the brutal week already fills (its four 09:00 daytime sleeps)
     * are skipped: two blocks on one morning is a legitimate shape — a nap
     * and a night — but it is not what this fixture is demonstrating, and the
     * Manor harness edits one of those four by name.
     */
    const demoNights = (todayIdx: number): CalendarEvent[] => {
      // [nights back, bed hour on the previous evening (or that morning when
      // the night is a daytime one), hours slept]; a gap is simply absent
      const SHAPES: [number, number, number][] = [
        [13, 23.25, 7.4],
        [12, 23.75, 7.0],
        [11, 9, 6],
        [10, 9, 5.5],
        [9, 23.5, 8.4],
        [8, 0.5, 6.2],
        [6, 22.9, 7.8],
        [5, 9, 6],
        [4, 9, 5.2],
        [3, 23.9, 6.6],
        [1, 23.4, 7.2],
        [0, 0.75, 6.9],
      ]
      const FIXED = new Set([1, 2, 4, 5])
      return SHAPES.filter(([back]) => !FIXED.has(todayIdx - back)).map(([back, bedH, len], i) => {
        const morning = todayIdx - back
        // a bed hour at or past noon belongs to the evening BEFORE the morning
        // it ends on; anything earlier is that morning's own clock
        const startDay = bedH >= 12 ? morning - 1 : morning
        return {
          id: `demo-night-${i}`,
          source: 'manual' as const,
          sourceRef: `slept:${localDayKey(addDays(week0, morning))}`,
          kind: 'sleep' as const,
          title: 'Slept',
          start: at(startDay, bedH),
          end: at(startDay, bedH + len),
          updatedAt: new Date().toISOString(),
        }
      })
    }

    useEventsStore.getState().replaceAll([
      // this week — endH > 24 rolls into the next local day naturally
      ev(0, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(1, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(3, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(4, 19, 32, 'shift', 'Night Watch', 'watch'),
      // the four daytime sleeps of the brutal week, as RECORDS (a `slept:`
      // ref) rather than pencil marks — this IS the shift-worker's fortnight,
      // and the demo should show what a written-down night looks like on the
      // grid, not only what a suggestion looks like
      ...[1, 2, 4, 5].map((d) => ({
        ...ev(d, 9, 15, 'sleep', 'Sleep'),
        id: `demo-day-sleep-${d}`,
        sourceRef: `slept:${localDayKey(addDays(week0, d))}`,
      })),
      ev(2, 17, 18.5, 'training', 'Strength — lower', 'grounds'),
      ev(5, 17, 18.5, 'training', 'Strength — upper', 'grounds'),
      ev(6, 10, 11.5, 'training', 'Intervals', 'grounds'),
      // literal ids + subj: refs so the study-store demo can pin fulfillment metas.
      // demo-study-1 is the one the study demo marks DONE, so it has to have
      // actually happened: yesterday, not a fixed weekday. Pinned to day 2 it
      // was a future block reported as done whenever the demo was opened early
      // in the week, which let one session read as both "behind you" and "still
      // on the books". On the week's first day this lands in the previous week
      // and the ring reads nothing read yet — which is the truth.
      {
        ...ev(todayIdx - 1, 15, 16.5, 'study', 'Linear Algebra', 'study'),
        id: 'demo-study-1',
        sourceRef: 'subj:demo-subj-math',
      },
      { ...ev(2, 20, 22, 'study', 'Physics', 'study'), id: 'demo-study-2', sourceRef: 'subj:demo-subj-physics' },
      { ...ev(6, 16, 18, 'study', 'Academic Writing', 'study'), id: 'demo-study-3', sourceRef: 'subj:demo-subj-writing' },
      // bench blocks in the 15:00 lane (free of the fixture's sleeps/shifts);
      // literal ids + proj: refs so the workshop-store demo can pin metas
      {
        ...ev(todayIdx - 2, 15, 17, 'workshop', 'The Ornithopter', 'workshop'),
        id: 'demo-bench-1',
        sourceRef: 'proj:demo-vent-orni',
      },
      {
        ...ev(todayIdx - 3, 15, 16.5, 'workshop', 'The Ornithopter', 'workshop'),
        id: 'demo-bench-2',
        sourceRef: 'proj:demo-vent-orni',
      },
      {
        ...ev(5, 15, 17, 'workshop', 'The Darkroom', 'workshop'),
        id: 'demo-bench-3',
        sourceRef: 'proj:demo-vent-dark',
      },
      ev(3, 0, 0, 'marker', 'Payday', 'capital', true),
      // THE NIGHT — a shift-worker's fortnight, anchored to TODAY rather than
      // to the week so the dials always have their full window whichever day
      // the demo is opened on. Two mornings are deliberately missing: the
      // charts have to be seen with gaps in them, because the gaps are what
      // make every average below them honest.
      ...demoNights(todayIdx),
      // next week — a quieter stretch
      ev(8, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(11, 19, 32, 'shift', 'Night Watch', 'watch'),
      // next week's sleep is the estate's own PENCIL — source 'watch', no
      // `slept:` ref — so the demo shows both states of a sleep block at once:
      // hatched suggestions ahead, solid records behind (core/sleep/lib.ts)
      ev(9, 9, 15, 'sleep', 'Sleep', 'watch'),
      ev(12, 9, 15, 'sleep', 'Sleep', 'watch'),
      ev(10, 17, 18.5, 'training', 'Strength — full', 'grounds'),
      ev(12, 0, 0, 'marker', 'Card bill', 'capital', true),
    ])
  }
}
