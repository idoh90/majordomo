import { create } from 'zustand'

/**
 * One-shot navigation mailbox — the same pattern as the training uiStore's
 * add-sheet request. Wings can't import the app shell (boundary rules), so a
 * wing that wants to send the user somewhere ("Open the Manor →") posts a
 * view id here and App consumes it. View ids are plain data; core stays
 * ignorant of what they mean.
 */
interface NavState {
  requestedView: string | null
  requestView: (view: string) => void
  consumeView: () => void
}

export const useNavStore = create<NavState>((set) => ({
  requestedView: null,
  requestView: (view) => set({ requestedView: view }),
  consumeView: () => set({ requestedView: null }),
}))
