import { create } from 'zustand'

/**
 * Tab-bar → Study mailbox (the training uiStore pattern). The mobile + posts
 * a request; StudyScreen consumes it by opening the book/log sheet.
 * Not persisted.
 */
interface StudyUi {
  addSheetRequested: boolean
  requestAddSheet: () => void
  clearAddSheetRequest: () => void
}

export const useStudyUi = create<StudyUi>()((set) => ({
  addSheetRequested: false,
  requestAddSheet: () => set({ addSheetRequested: true }),
  clearAddSheetRequest: () => set({ addSheetRequested: false }),
}))
