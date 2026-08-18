import { inject } from '@vercel/analytics'

/* ---------------------------------------------------------------------------
   Visitors and referrers, and nothing else.

   Vercel Web Analytics: no cookies, no cross-site identifiers, no personal
   data, and the script is served from this origin — which is why /privacy can
   say plainly that the page sets no cookies and needs no consent banner. That
   claim is load-bearing; anything added here that breaks it makes the privacy
   page a lie, so this file stays as small as it is.

   Conversions are NOT counted here. The signup count is the row count in the
   waitlist table, and "which channel filled the beta" is the ?src= column with
   a group-by. An analytics tool's idea of a conversion is a guess; a row is not.

   Production only. In dev it would just log a request to an endpoint that does
   not exist locally.
--------------------------------------------------------------------------- */
export function startAnalytics() {
  if (import.meta.env.DEV) return
  inject({ mode: 'production' })
}
