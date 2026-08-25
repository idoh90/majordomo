import { armed } from '../../core/sync/gate'
import { startGcalService } from './service'

/**
 * The `?gcal=` return door. Google's consent walk leaves the app and comes
 * home to `?gcal=connected|denied|error` — a marker chosen precisely because
 * it is NOT `?code=`, which Supabase's own detectSessionInUrl would try to
 * exchange. Called at module scope from boot, beside the other inits.
 *
 * The param is stripped whatever happens next (the ?join rule: an address is
 * not a standing order — a reload or a copied URL must not replay the news),
 * and on a disarmed origin (?demo'd, unconfigured, no storage) the service
 * never starts at all, which is also what keeps the Manor harness inert.
 */
export function initGcal(): void {
  const params = new URLSearchParams(window.location.search)
  const outcome = params.get('gcal')
  if (outcome !== null) {
    params.delete('gcal')
    const rest = params.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    )
  }
  if (!armed()) return
  startGcalService(outcome)
}
