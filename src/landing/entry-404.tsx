import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import NotFoundPage from './NotFoundPage'
import './tokens.css'

/* The 404 follows the legal pages' hydration pattern: prerendered at build
   time, hydrated on the first visit. */
hydrateRoot(
  document.getElementById('root')!,
  <StrictMode>
    <NotFoundPage />
  </StrictMode>,
)
