import { useEffect } from 'react'

/**
 * Takes down the boot curtain — the static skeleton in `index.html` that
 * paints while the bundle is still being fetched and parsed.
 *
 * WHY IT IS MOUNTED OUTSIDE `BootBoundary` (see `boot.tsx`): if this lived
 * inside the tree that can throw, a store whose blob is the wrong shape would
 * take `App` down during render, the boundary would swap in the recovery
 * screen — and this effect would never have run. The curtain would then sit
 * on top of the one screen that can still rescue the estate. Outside the
 * boundary it mounts either way, so the recovery screen is always reachable.
 *
 * It renders nothing. The curtain is real DOM the app did not create, so it
 * is torn down imperatively rather than owned by React.
 *
 * The curtain is hidden by CSS unless `public/boot-gate.js` marked this
 * browser as holding an estate, so a stranger who walks in from the landing's
 * GET STARTED button boots the app having never seen it. That path still
 * mounts this component and still removes the node — a `display: none`
 * element fires no `transitionend`, which is exactly what the timer below is
 * for, and `remove()` on a node nobody looked at costs nothing.
 */

const CURTAIN_ID = 'boot'
const OUT_CLASS = 'bt-out'
/** must match the `transition` on #boot in index.html */
const FADE_MS = 220
/** the wait before the fade is forced, when a frame never arrives to start it */
const GRACE_MS = 90

/**
 * Module scope, not a ref: StrictMode runs effects twice in development, and
 * the second pass would otherwise re-arm the teardown on a node already on its
 * way out. Also means an HMR reload after the curtain is gone is a no-op.
 */
let dismissed = false

export function BootCurtain() {
  useEffect(() => {
    if (dismissed) return
    dismissed = true

    const el = document.getElementById(CURTAIN_ID)
    if (!el) return

    const remove = () => el.remove()
    const fade = () => {
      if (!el.isConnected || el.classList.contains(OUT_CLASS)) return
      el.classList.add(OUT_CLASS)
      el.addEventListener('transitionend', remove, { once: true })
    }

    // The good path: one painted frame of the app underneath, then fade.
    requestAnimationFrame(fade)

    // …and the same work on a timer, because NOTHING here may hang off a frame
    // that might never arrive. A page that is not compositing — a tab opened in
    // the background, a backgrounded install, a hidden preview pane — does not
    // run rAF at all, and a curtain whose only exit is a frame is then welded
    // to the screen over a perfectly healthy app. Learned the hard way, in a
    // preview pane that was not on screen.
    setTimeout(fade, GRACE_MS)
    // Belt to that brace: a fade with no `transitionend` (reduced motion, a
    // browser that skips it) still has to end. `remove()` on a detached node is
    // a no-op, so every one of these racing is harmless.
    setTimeout(remove, GRACE_MS + FADE_MS + 120)

    // Deliberately no cleanup. StrictMode's simulated unmount would clear the
    // timers, and the second pass returns early on `dismissed` — so cancelling
    // here is exactly how the curtain would get stuck in development.
  }, [])

  return null
}
