import { useSyncExternalStore } from 'react'

/**
 * True below the app's single mobile breakpoint (Tailwind `md`, 768px).
 * JS twin of the `md:` classes — for the few places where mobile chrome is a
 * different component tree (bottom sheets vs popovers, the mobile drag
 * engine), not just different styling. Keep CSS-only switching everywhere
 * this genuinely isn't needed.
 */
const QUERY = '(max-width: 767.98px)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
