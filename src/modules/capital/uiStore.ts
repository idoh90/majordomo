import { create } from 'zustand'

/**
 * Tab-bar → Ledger mailbox (the training uiStore pattern). The mobile + posts
 * a request; CapitalScreen consumes it by opening the small two-action sheet
 * (update balances / log a spend). Not persisted.
 */
interface CapitalUi {
  addSheetRequested: boolean
  requestAddSheet: () => void
  clearAddSheetRequest: () => void
}

export const useCapitalUi = create<CapitalUi>()((set) => ({
  addSheetRequested: false,
  requestAddSheet: () => set({ addSheetRequested: true }),
  clearAddSheetRequest: () => set({ addSheetRequested: false }),
}))
