import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_SKIN, isSkinId, type SkinId } from '../ui/skins'
import { setWeekStartDefault, type WeekStart } from '../dates'

/**
 * App-wide shell state, persisted at `batman-shell`. Console modules keep
 * their own stores (training's is the untouched `batman-workouts` v4 blob).
 */

// First boot only: inherit the skin the user picked before this store existed
// (frozen in the legacy `batman-workouts` blob — that field is never written
// again). If a `batman-shell` blob exists, persist rehydrates over this seed
// synchronously during create().
function seedSkin(): SkinId {
  try {
    const raw = localStorage.getItem('batman-workouts')
    const skin: unknown = raw ? JSON.parse(raw)?.state?.skin : null
    if (isSkinId(skin)) return skin
  } catch {
    // blocked storage (private mode) or corrupt blob — fall back to default
  }
  return DEFAULT_SKIN
}

interface ShellState {
  /** active visual skin (one of the seven design directions) */
  skin: SkinId
  /** first day of the week app-wide: 0 = Sunday, 1 = Monday */
  weekStart: WeekStart
  setSkin: (skin: SkinId) => void
  setWeekStart: (ws: WeekStart) => void
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      skin: seedSkin(),
      weekStart: 1,
      setSkin: (skin) => set({ skin: isSkinId(skin) ? skin : DEFAULT_SKIN }),
      setWeekStart: (ws) => {
        setWeekStartDefault(ws) // keep core/dates in sync before the re-render
        set({ weekStart: ws })
      },
    }),
    {
      name: 'batman-shell',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // re-apply the persisted week-start into core/dates once rehydrated
      onRehydrateStorage: () => (state) => {
        if (state) setWeekStartDefault(state.weekStart)
      },
    },
  ),
)

// apply synchronously at module load too (before first paint)
setWeekStartDefault(useShellStore.getState().weekStart)

if (import.meta.env.DEV) {
  // ?skin=<id> forces (and persists) a skin (screenshot/testing aid)
  const devSkin = new URLSearchParams(window.location.search).get('skin')
  if (isSkinId(devSkin)) useShellStore.getState().setSkin(devSkin)
}
