import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import '@fontsource/big-shoulders/latin-600.css'
import '@fontsource/big-shoulders/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'

import './tokens.css'
import PrivacyPage from './PrivacyPage'
import { startAnalytics } from './lib/analytics'

const root = document.getElementById('root')!
const tree = (
  <StrictMode>
    <PrivacyPage />
  </StrictMode>
)

/* prerendered in a production build, empty under `vite dev` */
if (root.firstChild) hydrateRoot(root, tree)
else createRoot(root).render(tree)

/* This page tells the reader their visit is counted in aggregate. It has to be
   true here too, or the sentence is a lie on the one page that must not lie. */
startAnalytics()
