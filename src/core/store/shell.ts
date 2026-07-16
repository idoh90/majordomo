import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_SKIN, isSkinId, normalizeSkin, type SkinId } from '../ui/skins'
import { adoptLegacyKey } from '../storage'
import { setWeekStartDefault, type WeekStart } from '../dates'

/**
 * App-wide shell state, persisted at `majordomo-shell` (adopted from the
 * pre-pivot `batman-shell` blob on first boot). Wings keep their own stores.
 *
 * v2: skins are normalized through `normalizeSkin` — founder-only skins fall
 * back to the default unless VITE_FOUNDER_SKIN=1 (their CSS doesn't ship
 * otherwise), and corrupt values can never reach `SKINS[skin]` lookups.
 * v3: the ambient background layer is gone (it cost idle frames on old
 * machines) — migrate drops the `ambient` key from older blobs.
 */

adoptLegacyKey('majordomo-shell', 'batman-shell')

// First boot only: inherit the skin the user picked before this store existed
// (frozen in the training blob — that field is never written again). If a
// shell blob exists, persist rehydrates over this seed synchronously during
// create().
function seedSkin(): SkinId {
  try {
    const raw =
      localStorage.getItem('majordomo-training') ?? localStorage.getItem('batman-workouts')
    const skin: unknown = raw ? JSON.parse(raw)?.state?.skin : null
    return normalizeSkin(skin)
  } catch {
    // blocked storage (private mode) or corrupt blob — fall back to default
    return DEFAULT_SKIN
  }
}

interface ShellState {
  /** active visual skin */
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
      setSkin: (skin) => set({ skin: normalizeSkin(skin) }),
      setWeekStart: (ws) => {
        setWeekStartDefault(ws) // keep core/dates in sync before the re-render
        set({ weekStart: ws })
      },
    }),
    {
      name: 'majordomo-shell',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ skin: s.skin, weekStart: s.weekStart }),
      // v1 blobs may hold a founder-only skin (e.g. 'gotham'); v1/v2 blobs
      // carry a now-dead `ambient` key that this simply doesn't return
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<Pick<ShellState, 'skin' | 'weekStart'>>
        return {
          skin: normalizeSkin(p.skin),
          weekStart: p.weekStart === 0 ? 0 : 1,
        }
      },
      // re-apply the persisted week-start into core/dates once rehydrated
      onRehydrateStorage: () => (state) => {
        if (state) setWeekStartDefault(state.weekStart)
      },
    },
  ),
)

// Same-version blobs skip migrate — normalize once more after rehydration so
// a hand-edited or founder-flag-toggled blob can never render unstyled.
{
  const s = useShellStore.getState()
  const normalized = normalizeSkin(s.skin)
  if (normalized !== s.skin) useShellStore.setState({ skin: normalized })
}

// apply synchronously at module load too (before first paint)
setWeekStartDefault(useShellStore.getState().weekStart)

if (import.meta.env.DEV) {
  // ?skin=<id> forces (and persists) a skin (screenshot/testing aid);
  // founder-only ids apply only when the founder flag is set
  const devSkin = new URLSearchParams(window.location.search).get('skin')
  if (isSkinId(devSkin)) useShellStore.getState().setSkin(devSkin)
}
