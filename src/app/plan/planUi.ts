import { create } from 'zustand'

/**
 * THE PLAN's mailbox — whether the upgrade page is showing.
 *
 * The same one-shot pattern as `authUi` and `settingsUi`, for the same reason:
 * the page renders at the shell's root (it has to sit above the settings
 * screen that opens it, and below the login door it opens in turn), so the
 * places that open it cannot own its state. Not persisted — a reload lands on
 * the estate, never on an offer nobody asked to see again.
 *
 * DEV answers `?plan` so the page can be screenshotted without walking to it.
 */
interface PlanUiState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const usePlanUi = create<PlanUiState>()((set) => ({
  open: import.meta.env.DEV && new URLSearchParams(window.location.search).has('plan'),
  setOpen: (open) => set({ open }),
}))
