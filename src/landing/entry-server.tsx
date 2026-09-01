import { renderToString } from 'react-dom/server'
import LandingPage from './LandingPage'
import NotFoundPage from './NotFoundPage'
import PrivacyPage from './PrivacyPage'
import TermsPage from './TermsPage'
import { voice } from './voice'

/* ---------------------------------------------------------------------------
   Prerender.

   The page's whole pitch is calm competence on a tired person's phone, so the
   headline must not wait on a JavaScript bundle to exist. This renders every
   document to static HTML at build time; the client then hydrates the same
   tree, which is why every component here is deterministic on first render:

   - the demo's initial beat is 'hold', the ordered still, always
   - the counter renders null until its fetch answers
   - nothing reads window, matchMedia or sessionStorage outside an effect
   - the not-found page cannot tell a resident from a stranger, and does not
     try: it renders one page and links to "/", where the boot gate decides

   Break any of those and hydration mismatches; there is no server at runtime
   to paper over it.
--------------------------------------------------------------------------- */
export function render(route: 'index' | 'privacy' | 'terms' | '404'): string {
  return renderToString(
    route === 'privacy' ? (
      <PrivacyPage />
    ) : route === 'terms' ? (
      <TermsPage />
    ) : route === '404' ? (
      <NotFoundPage />
    ) : (
      <LandingPage />
    ),
  )
}

/* The document's own strings come from voice.ts too — a <title> and a meta
   description are user-facing copy that happens to live in the head, and the
   spec locks their wording (§3.9). The prerender step writes them in. */
export const meta = {
  index: { title: voice.meta.title, description: voice.meta.description },
  privacy: { title: voice.privacy.metaTitle, description: voice.privacy.metaDescription },
  terms: { title: voice.terms.metaTitle, description: voice.terms.metaDescription },
  '404': { title: voice.notFound.metaTitle, description: voice.notFound.metaDescription },
}
