import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BriefAreaId, DialId } from '../../../core/voice/types'

/**
 * THE PEN — what the brief covers, and which four dials are on the board.
 *
 * Its own key rather than a corner of the shell store: this is a reading
 * preference about ONE screen, it changes far more often than a skin, and a
 * version bump on the shell blob is a heavier act than adding a switch to a
 * briefing deserves.
 *
 * NOT synced. Which dials one device shows is a fact about that device's
 * screen, the way the bench timer is a fact about one device's present.
 *
 * `picks` is `null` until the reader chooses: the house picks the four itself
 * every render while that holds, so a fresh estate that gains a subject gains
 * an exam clock without anyone touching anything. The moment a chip is placed,
 * the choice is the reader's and the house stops rearranging the board.
 */

interface BriefPrefs {
  /** a clause switched OFF is `false`; absent means on, so a new area added
   *  later arrives switched on rather than silently missing */
  areas: Partial<Record<BriefAreaId, boolean>>
  /** the advice clauses that follow a wing's figures */
  counsel: boolean
  /** the four instruments, in board order — null while the house chooses */
  picks: DialId[] | null
  toggleArea: (id: BriefAreaId) => void
  toggleCounsel: () => void
  /** put `dial` in the slot currently held by `replacing` */
  place: (current: DialId[], slot: number, dial: DialId) => void
}

/** FOOD is the one clause off by default: macros are a plan, not news, and the
 *  Grounds prints them on its own screen every day. */
const DEFAULT_AREAS: Partial<Record<BriefAreaId, boolean>> = { food: false }

export const useBriefPrefs = create<BriefPrefs>()(
  persist(
    (set) => ({
      areas: DEFAULT_AREAS,
      counsel: true,
      picks: null,
      toggleArea: (id) =>
        set((s) => ({ areas: { ...s.areas, [id]: s.areas[id] === false } })),
      toggleCounsel: () => set((s) => ({ counsel: !s.counsel })),
      place: (current, slot, dial) =>
        set(() => {
          const next = current.slice()
          next[slot] = dial
          return { picks: next }
        }),
    }),
    {
      name: 'majordomo-briefing',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ areas: s.areas, counsel: s.counsel, picks: s.picks }),
    },
  ),
)

/** is this clause written into the brief? */
export function areaOn(areas: Partial<Record<BriefAreaId, boolean>>, id: BriefAreaId): boolean {
  return areas[id] !== false
}
