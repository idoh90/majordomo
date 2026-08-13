import { StrictMode } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import LandingPage from './LandingPage'
import { startAnalytics } from './lib/analytics'

let root: Root | null = null

/* Hydrates the prerendered document — the headline is on screen before this
   file is even fetched. Under `vite dev` the root is empty and it mounts
   cold. */
export function mountLanding() {
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
  startAnalytics()
}

/* Called by enterApp() once the app chunk is ready to take the root. */
export function unmountLanding() {
  root?.unmount()
  root = null
}
