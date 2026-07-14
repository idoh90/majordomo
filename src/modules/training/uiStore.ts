import { create } from 'zustand'

/**
 * Shell → screen mailbox. The header's Log button renders in the app shell
 * while the add sheet's state lives in TrainingScreen, so the button posts a
 * one-shot request here and the screen consumes it. Not persisted.
 */
interface TrainingUi {
  addSheetRequested: boolean
  requestAddSheet: () => void
  clearAddSheetRequest: () => void
}

export const useTrainingUi = create<TrainingUi>()((set) => ({
  addSheetRequested: false,
  requestAddSheet: () => set({ addSheetRequested: true }),
  clearAddSheetRequest: () => set({ addSheetRequested: false }),
}))
