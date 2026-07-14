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

interface EventsState {
  events: CalendarEvent[]
  addEvent: (e: Omit<CalendarEvent, 'id' | 'updatedAt'> & { id?: string }) => CalendarEvent
  updateEvent: (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => void
  deleteEvent: (id: string) => void
  replaceAll: (events: CalendarEvent[]) => void
}

const byStartAsc = (a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start)

export const useEventsStore = create<EventsState>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (e) => {
        const full: CalendarEvent = {
          ...e,
          id: e.id ?? makeId(),
          updatedAt: new Date().toISOString(),
        }
        set((s) => ({ events: [...s.events, full].sort(byStartAsc) }))
        return full
      },
      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events
            .map((e) =>
              e.id === id ? { ...e, ...patch, id, updatedAt: new Date().toISOString() } : e,
            )
            .sort(byStartAsc),
        })),
      deleteEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      replaceAll: (events) => set({ events: [...events].sort(byStartAsc) }),
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
      ev(2, 20, 22, 'study', 'Course reading'),
      ev(6, 16, 18, 'study', 'Lecture recap'),
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
