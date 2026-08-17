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
 * v4: `onboarded` — whether the first-time setup has been answered on THIS
 * device. Deliberately per-device and NOT carried by the registry: it is a
 * fact about a browser, not about the estate, and a new phone signing into an
 * existing account still deserves to be shown where the wings are.
 * Any blob written before v4 belongs to someone already using the app, so
 * migrate marks it onboarded — the interview is for new users only.
 * `wingOrder` / `wingsOff` (the navs' running order and what has been taken
 * off them) need no version bump for the same reason `panelTips` did not: an
 * older blob simply lacks them and the initializer's defaults stand.
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

/** a persisted list of wing ids, defended down to the element — a hand-edited
 *  blob must not put a number where `.filter(id => …)` expects a string */
function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

interface ShellState {
  /** active visual skin */
  skin: SkinId
  /** first day of the week app-wide: 0 = Sunday, 1 = Monday */
  weekStart: WeekStart
  /** has the first-time setup been answered on this device? */
  onboarded: boolean
  /**
   * Show the `?` beside every panel heading. ON by default — the marks exist
   * for the person who has not learned the house yet, and a switch they have
   * to find first cannot help them.
   *
   * Deliberately NOT version-bumped: a blob that predates the key simply lacks
   * it, and persist's shallow merge leaves the initializer's `true` standing.
   * A blob that CARRIES `false` was written by someone who turned the marks
   * off, and their choice wins. Adding a defaulted boolean needs no migration;
   * only a changed meaning would.
   */
  panelTips: boolean
  /**
   * Wing ids in the order the navs list them, after the Manor. Empty means
   * "however the registry is written", which is the default and stays the
   * default until the user drags something.
   *
   * Stored as a plain id list rather than an index map ON PURPOSE: it is
   * reconciled against the registry on every read (see `app/wings.ts`), so an
   * id this build has never heard of is ignored and a wing shipped in a later
   * release lands at the end of the list instead of vanishing from the navs.
   */
  wingOrder: string[]
  /** wing ids taken off both navs. Hiding is not deleting — the wing's records,
   *  its housekeeping and its briefing facts all carry on untouched. */
  wingsOff: string[]
  /**
   * Has this device been told, once, that the house is laid out for a desk?
   *
   * Per-device for the same reason `onboarded` is: it is a fact about a screen,
   * not about the estate, and the phone deserves the note even when the laptop
   * has already had it. Defaulted, so no version bump — an older blob simply
   * lacks the key and the initializer's `false` stands.
   */
  deskNoticeSeen: boolean
  setSkin: (skin: SkinId) => void
  setWeekStart: (ws: WeekStart) => void
  setOnboarded: (onboarded: boolean) => void
  setPanelTips: (panelTips: boolean) => void
  setDeskNoticeSeen: (seen: boolean) => void
  setWingOrder: (ids: string[]) => void
  setWingOff: (id: string, off: boolean) => void
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      skin: seedSkin(),
      weekStart: 1,
      onboarded: false,
      panelTips: true,
      wingOrder: [],
      wingsOff: [],
      deskNoticeSeen: false,
      setSkin: (skin) => set({ skin: normalizeSkin(skin) }),
      setWeekStart: (ws) => {
        setWeekStartDefault(ws) // keep core/dates in sync before the re-render
        set({ weekStart: ws })
      },
      setOnboarded: (onboarded) => set({ onboarded }),
      setPanelTips: (panelTips) => set({ panelTips }),
      setDeskNoticeSeen: (deskNoticeSeen) => set({ deskNoticeSeen }),
      setWingOrder: (next) => set({ wingOrder: [...next] }),
      setWingOff: (id, off) =>
        set((s) => ({
          wingsOff: off ? [...new Set([...s.wingsOff, id])] : s.wingsOff.filter((w) => w !== id),
        })),
    }),
    {
      name: 'majordomo-shell',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        skin: s.skin,
        weekStart: s.weekStart,
        onboarded: s.onboarded,
        panelTips: s.panelTips,
        wingOrder: s.wingOrder,
        wingsOff: s.wingsOff,
        deskNoticeSeen: s.deskNoticeSeen,
      }),
      // v1 blobs may hold a founder-only skin (e.g. 'gotham'); v1/v2 blobs
      // carry a now-dead `ambient` key that this simply doesn't return
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<
          Pick<
            ShellState,
            | 'skin'
            | 'weekStart'
            | 'onboarded'
            | 'panelTips'
            | 'wingOrder'
            | 'wingsOff'
            | 'deskNoticeSeen'
          >
        >
        return {
          skin: normalizeSkin(p.skin),
          weekStart: p.weekStart === 0 ? 0 : 1,
          // a blob older than v4 predates the interview, so its owner has been
          // living here for a while — never greet them as a new arrival
          onboarded: version < 4 ? true : p.onboarded === true,
          // absent means "never asked", which is the default; only an explicit
          // false is somebody having turned the marks off
          panelTips: p.panelTips !== false,
          // no blob this old carries either, but the shallow merge would write
          // `undefined` over the defaults if these were simply left out
          wingOrder: ids(p.wingOrder),
          wingsOff: ids(p.wingsOff),
          // a blob this old belongs to someone already settled in; the note
          // about small screens is for arrivals, so count it as said
          deskNoticeSeen: version < 4 ? true : p.deskNoticeSeen === true,
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
// a hand-edited or founder-flag-toggled blob can never render unstyled, and so
// the wing lists are lists whatever the blob says they are.
{
  const s = useShellStore.getState()
  const normalized = normalizeSkin(s.skin)
  if (normalized !== s.skin) useShellStore.setState({ skin: normalized })
  if (!Array.isArray(s.wingOrder)) useShellStore.setState({ wingOrder: [] })
  if (!Array.isArray(s.wingsOff)) useShellStore.setState({ wingsOff: [] })
}

// apply synchronously at module load too (before first paint)
setWeekStartDefault(useShellStore.getState().weekStart)

if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search)
  // ?skin=<id> forces (and persists) a skin (screenshot/testing aid);
  // founder-only ids apply only when the founder flag is set
  const devSkin = params.get('skin')
  if (isSkinId(devSkin)) useShellStore.getState().setSkin(devSkin)
  // ?tips / ?tips=0 — the panel `?` marks, for screenshots and for reaching
  // the state without three taps through the gear menu
  if (params.has('tips')) {
    useShellStore.getState().setPanelTips(params.get('tips') !== '0')
  }
}
