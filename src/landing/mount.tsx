import { StrictMode } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import LandingPage from './LandingPage'
import { trackPixel } from '../core/ads/meta'
import { startAnalytics } from './lib/analytics'

let root: Root | null = null

/* Hydrates the prerendered document — the headline is on screen before this
   file is even fetched. Under `vite dev` the root is empty and it mounts
   cold. */
export function mountLanding({ revisit = false }: { revisit?: boolean } = {}) {
  const el = document.getElementById('root')!
  const tree = (
    <StrictMode>
      <LandingPage />
    </StrictMode>
  )
  if (el.firstChild) {
    root = hydrateRoot(el, tree)
  } else {
    root = createRoot(el)
    root.render(tree)
  }
  /* `revisit` is the resident who came back through the app's own link. The
     analytics here count visitors and referrers so the page can be judged on
     strangers; counting the owner's own sightseeing would quietly inflate the
     one number the landing exists to move. */
  if (!revisit) {
    startAnalytics()
    /* The first of the pixel's three named actions — HELD, not sent, until
       the door is answered (core/ads/meta.ts); a stranger has not seen it
       yet. The resident's revisit is skipped for the reason the counter above
       skips it, and for one more: a resident has nothing to be attributed. */
    trackPixel('PageView')
  }
}

/* Called by enterApp() once the app chunk is ready to take the root. */
export function unmountLanding() {
  root?.unmount()
  root = null
}
