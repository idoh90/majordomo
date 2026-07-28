import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { makeId } from '../ids'
import { addDays, startOfWeek } from '../dates'
import type { CalendarEvent } from './types'

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
    (set) => ({
      events: [],
      sandbox: null,
      // mutations route to the sandbox draft while a rehearsal is active —
      // committed events are structurally unreachable until applySandbox
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
      deleteEvent: (id) =>
        set((s) =>
          s.sandbox
            ? {
                sandbox: {
                  events: s.sandbox.events.filter((e) => e.id !== id),
                  changed: touched(s.sandbox.changed, id),
                },
              }
            : { events: s.events.filter((e) => e.id !== id) },
        ),
      replaceAll: (events) => set({ events: [...events].sort(byStartAsc) }),
      enterSandbox: () =>
        set((s) => ({ sandbox: { events: s.events.map((e) => ({ ...e })), changed: [] } })),
      applySandbox: () =>
        set((s) => (s.sandbox ? { events: s.sandbox.events, sandbox: null } : {})),
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
  // four 13-hour night watches, recovery sleep, training, study, a payday.
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
    useEventsStore.getState().replaceAll([
      // this week — endH > 24 rolls into the next local day naturally
      ev(0, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(1, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(3, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(4, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(1, 9, 15, 'sleep', 'Sleep'),
      ev(2, 9, 15, 'sleep', 'Sleep'),
      ev(4, 9, 15, 'sleep', 'Sleep'),
      ev(5, 9, 15, 'sleep', 'Sleep'),
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
      ev(3, 0, 0, 'marker', 'Payday', 'capital', true),
      // next week — a quieter stretch
      ev(8, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(11, 19, 32, 'shift', 'Night Watch', 'watch'),
      ev(9, 9, 15, 'sleep', 'Sleep'),
      ev(12, 9, 15, 'sleep', 'Sleep'),
      ev(10, 17, 18.5, 'training', 'Strength — full', 'grounds'),
      ev(12, 0, 0, 'marker', 'Card bill', 'capital', true),
    ])
  }
}
