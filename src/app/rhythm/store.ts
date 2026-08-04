import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { curvesEqual, normalizeCurve, type RhythmCurve } from './curve'

/**
 * The day's rhythm, persisted at `majordomo-rhythm`. One field: the curve,
 * or null. Null is DORMANT — no overlay, no legend entry, no briefing line;
 * the feature imposes nothing until a curve is deliberately saved. The
 * default shape lives in curve.ts and is never auto-saved.
 */

interface RhythmState {
  curve: RhythmCurve | null
  setCurve: (c: RhythmCurve) => void
  clearCurve: () => void
}

export const useRhythmStore = create<RhythmState>()(
  persist(
    (set) => ({
      curve: null,
      setCurve: (c) => set({ curve: normalizeCurve(c) }),
      clearCurve: () => set({ curve: null }),
    }),
    {
      name: 'majordomo-rhythm',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ curve: s.curve }),
      migrate: (persisted) => ({
        curve: normalizeCurve((persisted as { curve?: unknown } | null)?.curve),
      }),
    },
  ),
)

// Same-version blobs skip migrate — normalize once more after rehydration so
// a hand-edited blob can never reach a renderer (the shell-store rule). Write
// only on real change: the sync engine identifies unchanged records by the
// payload object's identity.
{
  const s = useRhythmStore.getState()
  const normalized = normalizeCurve(s.curve)
  if (!curvesEqual(normalized, s.curve)) useRhythmStore.setState({ curve: normalized })
}

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__rhythm = useRhythmStore

  // ?demo seeds a night-shift-shaped curve into a dormant store: peak energy
  // through the demo week's Night Watch hours, trough under its 09:00 sleep.
  // No fixed-id/SEEDED_AT trick needed — the demo gate disarms sync on
  // demoed origins, so this seed can never race another device's record.
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    useRhythmStore.getState().curve === null
  ) {
    useRhythmStore.getState().setCurve({
      points: [
        { t: 60, v: 8.5 },
        { t: 300, v: 5 },
        { t: 540, v: 2 },
        { t: 780, v: 3.5 },
        { t: 1020, v: 6 },
        { t: 1260, v: 9 },
      ],
    })
  }
}
