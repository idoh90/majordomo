/* ---------------------------------------------------------------------------
   The way back to the landing page — the front door, from the inside.

   This is the ONE place in the app that leaves the app, and it does so by
   navigating rather than by swapping the root in place, which is the reverse
   of what landing/enterApp.ts does coming the other way. That asymmetry is
   deliberate:

   bootApp() is not re-entrant. It registers the service worker, opens the
   registry, starts sync, decides whether this boot is somebody's first, and
   takes the root — none of which expects to happen twice in one document. A
   landing → app → landing → app round trip inside a single page would run all
   of it a second time, and the failure would be a duplicated subscription
   nobody notices for a week. A navigation gets a clean document instead, and
   the prerendered landing paints on the first frame exactly as a stranger
   sees it — which is the whole point of the trip.

   Nothing is at risk in the crossing: the estate is localStorage and the
   session with it, so leaving the page costs nothing but the frame it takes
   to come back. The shell is precached, so this works with the aeroplane mode
   switch on.
--------------------------------------------------------------------------- */
export function openFrontDoor(): void {
  /* The pathname, not '/': the app is built with a relative base and has to
     keep working from a sub-path (`npm run preview`, `npx vercel dev`). The
     query is the front door's own address — see landing/arrival.ts. */
  window.location.assign(`${window.location.pathname}?landing`)
}
