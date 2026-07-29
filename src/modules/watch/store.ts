import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { makeId } from '../../core/ids'
import { noteDeleted } from '../../core/sync/intent'
import { voice } from '../../core/voice'
import type { ShiftTemplate } from './types'

/**
 * `majordomo-watch` v1 — the shapes of a person's working day.
 *
 * The Watch used to know exactly two: 07:00–20:00 and 19:00–08:00, which is
 * one household's roster hard-coded into the product. Shifts themselves still
 * live in the shared events store; this holds only the shapes worth reusing.
 *
 * The starters below ARE the initial state, so a first run is never a blank
 * form — but a rehydrated blob always wins, including an empty list, because
 * a user who retired every shape meant it.
 */

interface WatchState {
  templates: ShiftTemplate[]
  addTemplate: (t: { name: string; startMin: number; endMin: number }) => ShiftTemplate
  updateTemplate: (id: string, patch: Partial<Omit<ShiftTemplate, 'id' | 'createdAt'>>) => void
  deleteTemplate: (id: string) => void
}

const byCreatedAt = (a: ShiftTemplate, b: ShiftTemplate) => a.createdAt.localeCompare(b.createdAt)

/**
 * Fixed ids and a CONSTANT stamp, both load-bearing under sync: two devices
 * seeding independently must produce the same records, or the registry gets
 * eight starters instead of four and a hash fight over identical shapes.
 *
 * Known limit: a device seeding fresh can re-push a starter another device
 * retired (its stamp is newer). Retiring it again sticks — not worth a
 * server-aware seed.
 */
const SEEDED_AT = '2026-01-01T00:00:00.000Z'

const starters = (): ShiftTemplate[] => [
  // the two shapes the Watch shipped with; their names match the titles the
  // old posting code wrote, so an existing estate reads exactly as before
  { id: 'starter-day', name: voice.watch.starters.day, startMin: 420, endMin: 1200, createdAt: SEEDED_AT },
  { id: 'starter-night', name: voice.watch.starters.night, startMin: 1140, endMin: 1920, createdAt: SEEDED_AT },
  { id: 'starter-nine', name: voice.watch.starters.nineToFive, startMin: 540, endMin: 1020, createdAt: SEEDED_AT },
  { id: 'starter-evening', name: voice.watch.starters.evening, startMin: 1020, endMin: 1380, createdAt: SEEDED_AT },
]

export const useWatchStore = create<WatchState>()(
  persist(
    (set) => ({
      templates: starters(),

      addTemplate: ({ name, startMin, endMin }) => {
        const template: ShiftTemplate = {
          id: makeId(),
          name,
          startMin,
          endMin,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ templates: [...s.templates, template].sort(byCreatedAt) }))
        return template
      },

      updateTemplate: (id, patch) =>
        set((s) => ({
          templates: s.templates
            .map((t) => (t.id === id ? { ...t, ...patch, id, createdAt: t.createdAt } : t))
            .sort(byCreatedAt),
        })),

      deleteTemplate: (id) => {
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
        noteDeleted('watch', 'template', [id])
      },
    }),
    {
      name: 'majordomo-watch',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ templates: s.templates }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<Pick<WatchState, 'templates'>>
        return { templates: p.templates ?? [] }
      },
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__watch = useWatchStore
}
