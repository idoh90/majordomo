import { armed } from '../../core/sync/gate'
import { startGcalService } from './service'

/**
 * The `?gcal=` return door. Google's consent walk leaves the app and comes
 * home to `?gcal=connected|denied|error|pending` — a marker chosen precisely
 * because it is NOT `?code=`, which Supabase's own detectSessionInUrl would
 * try to exchange. Called at module scope from boot, beside the other inits.
 *
 * `pending` arrives with `n=<secret>`: the callback no longer connects
 * anything by itself, because Google's redirect proves only who STARTED the
 * walk, and a consent link can be handed to a stranger. The grant waits at the
 * server until the app spends that secret against the session actually
 * present — see claimGrant() in service.ts.
 *
 * BOTH params are stripped whatever happens next (the ?join rule: an address
 * is not a standing order — a reload or a copied URL must not replay the
 * news), and `n` has a harder reason than tidiness. It is one half of a bearer
 * credential for one Google refresh token: left standing it lands in history,
 * in a copied link, in the next navigation's Referer, and in anything that
 * ever decides to record a URL. It is therefore stripped BEFORE
 * initTelemetry() runs — which is simply where boot already calls this, the
 * ?join gate's own ordering, and the reason that ordering is worth keeping
 * even though the outbox records no URL today.
 *
 * ONE HALF is the load-bearing word, and it is not a claim that a query string
 * is private — it plainly is not. The other half is the walk secret, minted at
 * connectGoogle() and kept by the browser that began the walk (see walkStores()
 * for which storage, and why there are two). So an `n` recovered from history,
 * from a platform's request log, or from a link somebody was handed buys nothing
 * on its own: the claim step refuses without the secret, and the secret never
 * left the browser that minted it.
 *
 * On a disarmed origin (?demo'd, unconfigured, no storage) the service never
 * starts at all, which is also what keeps the Manor harness inert — and a
 * secret that can never be spent is dropped on the floor, deliberately, the
 * way an invite code is.
 */
export function initGcal(): void {
  const params = new URLSearchParams(window.location.search)
  const outcome = params.get('gcal')
  const claim = params.get('n')
  // either one alone is still ours to clear: a bare `n` means the callback
  // came home half-dressed, and it is the half that must not linger
  if (outcome !== null || claim !== null) {
    params.delete('gcal')
    params.delete('n')
    const rest = params.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    )
  }
  if (!armed()) return
  startGcalService(outcome, claim)
}
