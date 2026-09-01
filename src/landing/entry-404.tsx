import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import '@fontsource/big-shoulders/latin-600.css'
import '@fontsource/big-shoulders/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'

import './tokens.css'
import NotFoundPage from './NotFoundPage'
import { startAnalytics } from './lib/analytics'

const root = document.getElementById('root')!
const tree = (
  <StrictMode>
    <NotFoundPage />
  </StrictMode>
)

/* prerendered in a production build, empty under `vite dev` */
if (root.firstChild) hydrateRoot(root, tree)
else createRoot(root).render(tree)

/* Counted, like the other two public pages — and this is the one whose count
   is operationally useful: a 404 that keeps being hit is a link somebody
   published wrong. Vercel's referrer column names it. */
startAnalytics()
