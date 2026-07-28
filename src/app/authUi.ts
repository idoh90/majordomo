import { create } from 'zustand'

/**
 * Whether the login screen is showing. Not persisted — a reload should land on
 * the estate, never on a login screen the user did not ask for.
 *
 * A store rather than App state because two places open it: the header's
 * account button and the gear menu's row, and the gear menu renders inside the
 * header rather than beside it.
 */
interface AuthUiState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useAuthUi = create<AuthUiState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
