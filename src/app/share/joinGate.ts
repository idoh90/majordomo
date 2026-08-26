import { armed } from '../../core/sync/gate'
import { useShareStore } from '../../core/sync/shareStore'
import { CODE_LEN, normalizeCode } from '../../modules/workshop/joinCode'

/**
 * The ?join=CODE door — the first URL param the app honours in production.
 *
 * It OFFERS. It does not admit.
 *
 * This used to drop the code straight into `pendingJoin`, which the share
 * service redeems on its next cycle — so opening a link WAS joining. Whoever
 * tapped it was on a crew's roster seconds later, having agreed to nothing and
 * having been told nothing: not whose crew it was, not that a name of theirs
 * would appear on it, not that the venture's board was about to land on their
 * shelf. A link in a group chat could enrol a bystander who only wanted to look.
 *
 * So the code goes into `invite` instead, and `InviteDoor` shows it and waits.
 * Accepting is what moves it to `pendingJoin`, and accepting is also where the
 * name is chosen — see the door.
 *
 * Called at module scope from main.tsx, beside initSync. The mailbox is
 * PERSISTED because accepting may require a Google sign-in, and
 * `signInWithOAuth` leaves for another origin and comes back to a bare
 * `window.location.origin` — the query does not survive that trip, localStorage
 * does. The param is then stripped from the address bar so a reload (or a
 * copied URL) does not re-offer it.
 *
 * Registry off (demo'd origin, no storage, unconfigured) → the code is dropped
 * on the floor, deliberately: a disarmed device has nowhere to take it, and
 * holding it would promise something that cannot happen.
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

  // An invite already accepted and still in flight wins: someone who said yes,
  // signed in, and came back must not be asked the same question again by the
  // very redirect that was carrying their answer.
  if (useShareStore.getState().pendingJoin) return

  // Stored CANONICAL, never raw. What arrives here is a query parameter — a
  // stranger's text — and it used to be persisted verbatim, so anything that
  // later choked on it choked again on every boot. A parameter that is not a
  // code is not an invitation, and is dropped rather than kept.
  const canonical = normalizeCode(code)
  if (canonical.length !== CODE_LEN) return

  useShareStore.getState().setInvite(canonical)
  // NOTE: the login door is deliberately NOT opened here any more. Being asked
  // to sign in before being told what for is the wall this house does not put
  // up; the invitation asks first, and sign-in follows accepting.
}
