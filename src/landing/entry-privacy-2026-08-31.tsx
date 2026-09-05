import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import '@fontsource/big-shoulders/latin-600.css'
import '@fontsource/big-shoulders/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'

import './tokens.css'
import PrivacyArchivePage from './PrivacyArchivePage'
import { startAnalytics } from './lib/analytics'

const root = document.getElementById('root')!
const tree = (
  <StrictMode>
    <PrivacyArchivePage date="2026-08-31" />
  </StrictMode>
)

/* prerendered in a production build, empty under `vite dev` */
if (root.firstChild) hydrateRoot(root, tree)
else createRoot(root).render(tree)

/* One of "these documents" that the current policy says are counted in
   aggregate — so the same counter runs here, and nothing else does. The
   superseded policy this page carries promised the same thing. */
startAnalytics()
