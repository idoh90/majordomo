import { useAuthStore } from '../../core/auth/store'
import { armed } from '../../core/sync/gate'
import { useShareStore } from '../../core/sync/shareStore'
import { useAuthUi } from '../authUi'

/**
 * The ?join=CODE door — the first URL param the app honours in production.
 *
 * Called at module scope from main.tsx, beside initSync. The code is stashed
 * into the PERSISTED mailbox before anything else, because redeeming it may
 * require a Google sign-in and `signInWithOAuth` leaves for another origin
 * and comes back to a bare `window.location.origin` — the query does not
 * survive that trip, localStorage does. Then the param is stripped from the
 * address bar so a reload (or a copied URL) does not re-join.
 *
 * Signed in already → the share service notices the mailbox on its next
 * cycle. Signed out → the login door opens; the service redeems after the
 * redirect lands. Registry off (demo'd origin, no storage, unconfigured) →
 * the code is dropped on the floor, deliberately: a disarmed device has
 * nowhere to take it, and holding it would promise something that cannot
 * happen.
 */
export function initJoinGate(): void {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('join')
  if (!code) return

  // strip the param whatever happens next — an address is not a standing order
  params.delete('join')
  const rest = params.toString()
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
  )

  if (!armed()) return

  useShareStore.getState().setPendingJoin(code.trim())

  // the door, never a wall: opened only because the user carried an invite
  if (useAuthStore.getState().status !== 'signedIn') {
    useAuthUi.getState().setOpen(true)
  }
}
