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
import { applySkin } from './core/ui/skins'
import { voice } from './core/voice'
import { initAuth } from './core/auth/store'
import { initSync } from './app/sync/init'
import { useShellStore } from './core/store/shell'

// Founder-only assets (the seven original skins + their typefaces) load
// behind the local flag; the condition is statically false in commercial
// builds, so the whole founder bundle tree-shakes away.
if (import.meta.env.VITE_FOUNDER_SKIN === '1') {
  void import('./core/ui/founder')
}

// stamp the persisted skin on <html> before first paint so non-default skins
// don't flash Midnight on load
applySkin(useShellStore.getState().skin)
document.title = voice.appName

// The registry, wired at module scope (an effect would double-invoke under
// StrictMode). Nothing waits on it: the app renders from localStorage exactly
// as it always has, and the session — like the estate it will later carry —
// simply arrives afterwards.
initAuth()
// takes the estate as its baseline and watches for edits. Records nothing as
// deleted, ever — only the actions that delete may say that (core/sync/intent).
initSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
