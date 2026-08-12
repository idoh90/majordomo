import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// commercial typefaces (self-hosted): Big Shoulders (display / wordmark /
// hero numerals) + Source Sans 3 (the working face)
import '@fontsource/big-shoulders/500.css'
import '@fontsource/big-shoulders/600.css'
import '@fontsource/big-shoulders/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/400-italic.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/source-sans-3/700.css'
import './core/ui/index.css'
import App from './app/App'
import { BootBoundary, BootFailure } from './app/BootFailure'
import { applySkin } from './core/ui/skins'
import { lockZoom } from './core/ui/zoomLock'
import { voice } from './core/voice'
import { initAuth } from './core/auth/store'
import { initSync } from './app/sync/init'
import { initOnboarding } from './app/onboarding/store'
import { useShellStore } from './core/store/shell'

// Founder-only assets (the seven original skins + their typefaces) load
// behind the local flag; the condition is statically false in commercial
// builds, so the whole founder bundle tree-shakes away.
if (import.meta.env.VITE_FOUNDER_SKIN === '1') {
  void import('./core/ui/founder')
}

const root = createRoot(document.getElementById('root')!)

/**
 * Everything that has to happen before the first paint — and every line of it
 * reads the estate, which is why it is inside a guard.
 *
 * The app has no loading screen by design: it boots from localStorage
 * synchronously so a cold open on a plane is indistinguishable from one on wifi.
 * The price is that a throw in here used to mean a permanently white page, with
 * no way back from inside the app. Now it means the recovery screen, which can
 * take a copy of the records before anything is cleared.
 */
try {
  // stamp the persisted skin on <html> before first paint so non-default skins
  // don't flash Midnight on load
  applySkin(useShellStore.getState().skin)
  document.title = voice.appName
  // the viewport is the app's own, not a document's: no pinch, no double-tap
  // zoom. The Workshop's board keeps a zoom of its own and handles the gesture.
  lockZoom()

  // The registry, wired at module scope (an effect would double-invoke under
  // StrictMode). Nothing waits on it: the app renders from localStorage exactly
  // as it always has, and the session — like the estate it will later carry —
  // simply arrives afterwards.
  initAuth()
  // takes the estate as its baseline and watches for edits. Records nothing as
  // deleted, ever — only the actions that delete may say that (core/sync/intent).
  initSync()
  // …and only then decide whether this boot is somebody's first: the setup reads
  // the estate to know whether there is anything here already.
  initOnboarding()

  root.render(
    <StrictMode>
      {/* the same screen, reached the other way: a blob that rehydrated without
          complaint but is the wrong shape throws in the first component that
          maps over it, not here */}
      <BootBoundary>
        <App />
      </BootBoundary>
    </StrictMode>,
  )
} catch (e) {
  console.error('[boot] the app failed to start:', e)
  root.render(<BootFailure detail={e instanceof Error ? e.message : String(e)} />)
}
