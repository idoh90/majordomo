import { create } from 'zustand'

/**
 * Tab-bar / chrome → Study mailbox (the training uiStore pattern). The mobile
 * + posts a request; StudyScreen consumes it by opening the book/log sheet.
 * A Manor marker chip posts the record it stands for, and the wing opens that
 * record's sheet. Not persisted.
 */
interface StudyUi {
  addSheetRequested: boolean
  requestAddSheet: () => void
  clearAddSheetRequest: () => void
  /** the record a chip asked to open, as its `sourceRef` ('hw:…' / 'exam:…') */
  recordRequested: string | null
  requestRecord: (sourceRef: string) => void
  clearRecordRequest: () => void
}

export const useStudyUi = create<StudyUi>()((set) => ({
  addSheetRequested: false,
  requestAddSheet: () => set({ addSheetRequested: true }),
  clearAddSheetRequest: () => set({ addSheetRequested: false }),
  recordRequested: null,
  requestRecord: (sourceRef) => set({ recordRequested: sourceRef }),
  clearRecordRequest: () => set({ recordRequested: null }),
}))
