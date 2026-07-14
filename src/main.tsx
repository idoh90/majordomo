import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// skin fonts (self-hosted): Gotham Gold — Rajdhani; Tac-Ops — Chakra Petch +
// IBM Plex Mono; Noir Ledger — Instrument Serif; Ghost — Saira; Ironworks — Anton
import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/saira/200.css'
import '@fontsource/saira/300.css'
import '@fontsource/saira/400.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/600.css'
import '@fontsource/anton/400.css'
import './core/ui/index.css'
import App from './app/App'
import { applySkin } from './core/ui/skins'
import { useShellStore } from './core/store/shell'

// stamp the persisted skin on <html> before first paint so non-default skins
// don't flash Gotham Gold on load
applySkin(useShellStore.getState().skin)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
