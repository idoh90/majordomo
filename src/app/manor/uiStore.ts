import { create } from 'zustand'

/**
 * Tab-bar → Manor mailbox (same one-shot pattern as the training uiStore).
 * The mobile tab bar's + lives in the shell while the quick-add state lives
 * inside the Manor's week grid, so the button posts a request here and the
 * grid consumes it: active day, next free half-hour. Not persisted.
 */
interface ManorUi {
  quickAddRequested: boolean
  requestQuickAdd: () => void
  clearQuickAddRequest: () => void
  /**
   * THE NIGHT's sheet, asked for from somewhere that does not own it — a
   * local day key naming the MORNING to open on. Same one-shot mailbox as
   * quick-add, and for the same reason: a sleep block lives inside the week
   * grid, the sheet lives beside it in the Manor, and lifting the sheet's
   * state into the grid to join them would put a form inside a calendar.
   */
  nightRequest: string | null
  requestNight: (dayKey: string) => void
  clearNightRequest: () => void
}

export const useManorUi = create<ManorUi>()((set) => ({
  quickAddRequested: false,
  requestQuickAdd: () => set({ quickAddRequested: true }),
  clearQuickAddRequest: () => set({ quickAddRequested: false }),
  nightRequest: null,
  requestNight: (dayKey) => set({ nightRequest: dayKey }),
  clearNightRequest: () => set({ nightRequest: null }),
}))

if (import.meta.env.DEV) {
  // the night harness posts to this mailbox directly, to prove the Manor
  // refuses it while a rehearsal is open even when no button offers to
  ;(window as unknown as Record<string, unknown>).__manorUi = useManorUi
}
