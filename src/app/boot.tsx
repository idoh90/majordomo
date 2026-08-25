import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// commercial typefaces (self-hosted): Big Shoulders (display / wordmark /
// hero numerals) + Source Sans 3 (the working face)
import '@fontsource/big-shoulders/500.css'
import '@fontsource/big-shoulders/600.css'
import '@fontsource/big-shoulders/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/400-italic.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/source-sans-3/700.css'
import '../core/ui/index.css'
import App from './App'
import { BootBoundary, BootFailure } from './BootFailure'
import { applySkin } from '../core/ui/skins'
import { lockZoom } from '../core/ui/zoomLock'
import { voice } from '../core/voice'
import { initAuth } from '../core/auth/store'
import { initSync } from './sync/init'
import { initJoinGate } from './share/joinGate'
import { initGcal } from './gcal/init'
import { initOnboarding } from './onboarding/store'
import { useShellStore } from '../core/store/shell'

/* The viewport the app asks for. The DOCUMENT ships with the landing's
   zoomable viewport — a public page pinches like a page, and Lighthouse's
   accessibility gate agrees. The app is an instrument, not a document, and
   restores its own on boot. Android honours the meta swap; iOS ignores the
   flag for pinch either way, which is what lockZoom() is for. */
const APP_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

/**
 * The app's whole entry, callable: src/main.tsx imports this chunk when the
 * boot gate finds an estate, and the landing's GET STARTED button imports it
 * when a stranger walks in. Everything that has to happen before the first
 * paint lives here — and every line of it reads the estate, which is why it
 * is inside a guard.
 *
 * The app has no loading screen by design: it boots from localStorage
 * synchronously so a cold open on a plane is indistinguishable from one on wifi.
 * The price is that a throw in here used to mean a permanently white page, with
 * no way back from inside the app. Now it means the recovery screen, which can
 * take a copy of the records before anything is cleared.
 */
export function bootApp() {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', APP_VIEWPORT)

  /* Registration lives here rather than in the plugin-injected entry
     (injectRegister: false in vite.config.ts): a stranger reading the landing
     must not precache four megabytes of app. Only an estate boot registers. */
  registerSW({ immediate: true })

  // Founder-only assets (the seven original skins + their typefaces) load
  // behind the local flag; the condition is statically false in commercial
  // builds, so the whole founder bundle tree-shakes away.
  if (import.meta.env.VITE_FOUNDER_SKIN === '1') {
    void import('../core/ui/founder')
  }

  /* createRoot().render() deletes any children #root already has — which is
     exactly what clears the prerendered landing markup the boot gate hid. */
  const root = createRoot(document.getElementById('root')!)

  try {
    // stamp the persisted skin on <html> before first paint so non-default skins
    // don't flash Midnight on load
    applySkin(useShellStore.getState().skin)
    document.title = voice.appName
    // the viewport is the app's own, not a document's: no pinch, no double-tap
    // zoom. The Workshop's board keeps a zoom of its own and handles the gesture.
    lockZoom()

    // The registry, wired at boot rather than in an effect (an effect would
    // double-invoke under StrictMode). Nothing waits on it: the app renders from
    // localStorage exactly as it always has, and the session — like the estate
    // it will later carry — simply arrives afterwards.
    initAuth()
    // takes the estate as its baseline and watches for edits. Records nothing as
    // deleted, ever — only the actions that delete may say that (core/sync/intent).
    initSync()
    // a ?join=CODE invite: stash the code (it must survive an OAuth round-trip),
    // strip the param, and open the sign-in door if one is needed.
    initJoinGate()
    // the Google Calendar bridge: read and strip the ?gcal return marker, then
    // start the mirror loop (which waits for a session before doing anything).
    initGcal()
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
}
