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

/* One question, answered synchronously before anything downloads: is there an
   estate in this browser? Must agree with public/boot-gate.js, which already
   hid the landing markup on the same evidence. `majordomo*` catches the shell
   and every persisted store; `sb-` is the Supabase session of a signed-in
   user whose local stores were cleared. */
function hasEstate(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('majordomo') || k.startsWith('sb-'))) return true
    }
  } catch {
    /* storage blocked (private mode): the landing shows, and the app's own
       storageAvailable() messaging takes over past the CTA */
  }
  return false
}

/* DEV escape hatch: ?landing forces the landing even with an estate present,
   so the page can be worked on without wiping localStorage. */
const forceLanding =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('landing')

if (hasEstate() && !forceLanding) {
  void import('./app/boot').then((m) => m.bootApp())
} else {
  void import('./landing/mount').then((m) => m.mountLanding())
}
