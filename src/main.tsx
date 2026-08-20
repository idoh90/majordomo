// Landing fonts — the subsets the prerendered document paints in. The app's
// own imports (full weights) live in app/boot.tsx and arrive with its chunk.
import '@fontsource/big-shoulders/latin-600.css'
import '@fontsource/big-shoulders/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-400-italic.css'
// Landing styles, statically: the prerendered markup must be styled by the
// render-blocking stylesheet, not by CSS that arrives with a lazy chunk. The
// landing chunk imports the same files and Rollup dedupes them into these.
import './landing/tokens.css'
import './landing/components/faq.css'
import './landing/components/rule.css'
import './landing/components/whatif.css'
import './landing/demo/demo.css'

import { hasEstate, wantsLanding } from './landing/arrival'

/* Two questions, answered synchronously before anything downloads: is there an
   estate in this browser, and did the URL ask for the landing anyway? Both live
   in landing/arrival.ts, and both must agree with public/boot-gate.js, which
   has already shown or hidden the prerendered markup on the same evidence.

   `?landing` is the front door's own address — the app links back to it from
   the settings screen, and it is how the page gets worked on without wiping
   localStorage. */
const estate = hasEstate()

if (estate && !wantsLanding()) {
  void import('./app/boot').then((m) => m.bootApp())
} else {
  /* A resident who asked for the landing is taking another look at a page
     written for strangers, and the page's own numbers are about strangers —
     so his visit is shown to him and counted for nobody. */
  void import('./landing/mount').then((m) => m.mountLanding({ revisit: estate }))
}
