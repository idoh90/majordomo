import { create } from 'zustand'

/**
 * Settings-screen mailbox — the same one-shot pattern as `authUi` and the
 * Manor's, and it exists for the same reason that one does: two places now
 * open this page. The gear owns the screen's state, and THE VALET needs to
 * reach it (and sometimes a sheet inside it) from a bubble that renders at
 * the shell's root, nowhere near the header.
 *
 * `'root'` opens the page; `'calendars'` opens it with the Google sheet
 * already up, which is where both the reconnect matter and the calendar offer
 * lead. Not persisted: an address is not a standing order.
 */
interface SettingsUiState {
  request: null | 'root' | 'calendars'
  open: (request: 'root' | 'calendars') => void
  clear: () => void
}

export const useSettingsUi = create<SettingsUiState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  clear: () => set({ request: null }),
}))
