import { create } from 'zustand'

/**
 * Tab-bar / chrome → Workshop mailbox (the training uiStore pattern). The
 * mobile + posts a book-bench request; the app-wide bench chip posts a
 * board-open request; a Manor marker chip posts the record it stands for.
 * WorkshopScreen consumes all three. Not persisted.
 */
interface WorkshopUi {
  addSheetRequested: boolean
  requestAddSheet: () => void
  clearAddSheetRequest: () => void
  /** venture whose board the chrome asked to open (the bench chip's tap) */
  boardRequested: string | null
  requestBoard: (ventureId: string) => void
  clearBoardRequest: () => void
  /** a record on a board that something asked to be opened for amending — a
   *  MATTERS PENDING card, or a marker chip on the Manor */
  recordRequested: { ventureId: string; kind: 'milestone' | 'card'; id: string } | null
  requestRecord: (req: { ventureId: string; kind: 'milestone' | 'card'; id: string }) => void
  clearRecordRequest: () => void
}

export const useWorkshopUi = create<WorkshopUi>()((set) => ({
  addSheetRequested: false,
  requestAddSheet: () => set({ addSheetRequested: true }),
  clearAddSheetRequest: () => set({ addSheetRequested: false }),
  boardRequested: null,
  requestBoard: (ventureId) => set({ boardRequested: ventureId }),
  clearBoardRequest: () => set({ boardRequested: null }),
  recordRequested: null,
  requestRecord: (req) => set({ recordRequested: req }),
  clearRecordRequest: () => set({ recordRequested: null }),
}))
