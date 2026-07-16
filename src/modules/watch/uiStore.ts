import { create } from 'zustand'

/**
 * Tab-bar → Watch mailbox (the training uiStore pattern). The mobile + posts
 * a request; WatchScreen consumes it by selecting today in the roster and
 * scrolling the post strip into view. Not persisted.
 */
interface WatchUi {
  postRequested: boolean
  requestPost: () => void
  clearPostRequest: () => void
}

export const useWatchUi = create<WatchUi>()((set) => ({
  postRequested: false,
  requestPost: () => set({ postRequested: true }),
  clearPostRequest: () => set({ postRequested: false }),
}))
