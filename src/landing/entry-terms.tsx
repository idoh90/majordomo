import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import '@fontsource/big-shoulders/latin-600.css'
import '@fontsource/big-shoulders/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'

import './tokens.css'
import TermsPage from './TermsPage'
import { startAnalytics } from './lib/analytics'

const root = document.getElementById('root')!
const tree = (
  <StrictMode>
    <TermsPage />
  </StrictMode>
)

/* prerendered in a production build, empty under `vite dev` */
if (root.firstChild) hydrateRoot(root, tree)
else createRoot(root).render(tree)

/* /privacy says visits to these pages are counted in aggregate. This page is
   one of "these pages", so the same counter runs here — and nothing else. */
startAnalytics()
