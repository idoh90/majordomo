import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { localDayKey } from '../../core/dates'

/**
 * THE VALET's ledger — `majordomo-butler`.
 *
 * Three small books and a switch. What he has already said today
 * (`announced`), what he has been waved off (`waved`), and which rooms he has
 * already offered (`introduced`, once ever). None of it is estate: whether one
 * screen's butler has spoken this morning is a fact about that device, exactly
 * like the night offer's `askedOn`, the briefing's dial picks and `panelTips`.
 * So it is deliberately absent from `ESTATE_KEYS` and has no sync source —
 * see the note beside the shell's own device-local fields in sync/registry.ts.
 *
 * `announced` is PERSISTED rather than held in memory, and that is the whole
 * of "announce once": a reload is not a new morning, and a butler who
 * re-introduces the same matter every time the tab is refreshed is the nag
 * this feature exists to avoid being.
 *
 * Both day books are pruned on every write. They only ever answer "was this
 * today?", so an entry from yesterday is not history worth keeping — it is
 * litter that would otherwise grow for the life of the estate.
 */

interface ButlerState {
  /** the kill switch — settings → GUIDANCE. Off means he never appears. */
  off: boolean
  /** matterKey → the local day it was waved off on */
  waved: Record<string, string>
  /** matterKey → the local day it was last announced on */
  announced: Record<string, string>
  /** offer ids already spoken — a room is offered once in the life of an estate */
  introduced: string[]

  setOff: (off: boolean) => void
  wave: (matterKey: string, now: number) => void
  noteAnnounced: (matterKey: string, now: number) => void
  introduce: (offerId: string) => void
}

/** drop every entry that is not today's — see the note above */
function pruned(book: Record<string, string>, today: string): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [key, day] of Object.entries(book)) {
    if (day === today) kept[key] = day
  }
  return kept
}

export const useButlerStore = create<ButlerState>()(
  persist(
    (set) => ({
      off: false,
      waved: {},
      announced: {},
      introduced: [],

      setOff: (off) => set({ off }),

      wave: (matterKey, now) =>
        set((s) => {
          const today = localDayKey(new Date(now))
          return { waved: { ...pruned(s.waved, today), [matterKey]: today } }
        }),

      noteAnnounced: (matterKey, now) =>
        set((s) => {
          const today = localDayKey(new Date(now))
          return { announced: { ...pruned(s.announced, today), [matterKey]: today } }
        }),

      introduce: (offerId) =>
        set((s) =>
          s.introduced.includes(offerId) ? s : { introduced: [...s.introduced, offerId] },
        ),
    }),
    {
      name: 'majordomo-butler',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        off: s.off,
        waved: s.waved,
        announced: s.announced,
        introduced: s.introduced,
      }),
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__butler = useButlerStore
}
