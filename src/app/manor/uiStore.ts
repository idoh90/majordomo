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
}

export const useManorUi = create<ManorUi>()((set) => ({
  quickAddRequested: false,
  requestQuickAdd: () => set({ quickAddRequested: true }),
  clearQuickAddRequest: () => set({ quickAddRequested: false }),
}))
