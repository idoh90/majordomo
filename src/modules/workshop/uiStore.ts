import { create } from 'zustand'

/**
 * Tab-bar / chrome → Workshop mailbox (the training uiStore pattern). The
 * mobile + posts a book-bench request; the app-wide bench chip posts a
 * board-open request. WorkshopScreen consumes both. Not persisted.
 */
interface WorkshopUi {
  addSheetRequested: boolean
  requestAddSheet: () => void
  clearAddSheetRequest: () => void
  /** venture whose board the chrome asked to open (the bench chip's tap) */
  boardRequested: string | null
  requestBoard: (ventureId: string) => void
  clearBoardRequest: () => void
}

export const useWorkshopUi = create<WorkshopUi>()((set) => ({
  addSheetRequested: false,
  requestAddSheet: () => set({ addSheetRequested: true }),
  clearAddSheetRequest: () => set({ addSheetRequested: false }),
  boardRequested: null,
  requestBoard: (ventureId) => set({ boardRequested: ventureId }),
  clearBoardRequest: () => set({ boardRequested: null }),
}))
