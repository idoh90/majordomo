/**
 * Browser zoom, refused.
 *
 * `index.html` already asks for it — `user-scalable=no, maximum-scale=1` — and
 * Android obeys. **iOS does not**: Safari has deliberately ignored that flag
 * for pinch since iOS 10, standalone launch included, so a stray two-finger
 * press anywhere in the app leaves the whole thing scaled with the browser
 * chrome hidden and no obvious way back. That is a state a home-screen install
 * cannot get out of, and it is the difference between a document and an
 * instrument.
 *
 * So the page refuses the gesture itself:
 *  - the `gesture*` family is WebKit's pinch, and cancelling `gesturestart` is
 *    the only thing iOS listens to;
 *  - the same pinch reaches every other engine as a two-finger `touchmove`;
 *  - double-tap-to-zoom is CSS, not JS (`touch-action: manipulation` on `html`
 *    in `index.css`) — a `touchend` timer would have to swallow the second tap
 *    of any fast double-press on a real button;
 *  - focus-zoom on a small input is what `maximum-scale=1` still buys, even on
 *    iOS, so nothing here needs to fight it.
 *
 * Refused at the DOCUMENT, unconditionally — there is no opt-out attribute,
 * because a surface that wants a zoom of its own does not want the browser's.
 * The Workshop's board reads the same two fingers off `touchmove` and scales
 * the WALL; cancelling the default never stops the event being delivered, so
 * the two live side by side.
 *
 * Left alone: ctrl+wheel and the desktop keyboard. Browser zoom is a normal
 * thing to want on a machine with a window, and there is no fixed viewport
 * there to strand.
 */
export function lockZoom() {
  const refuse = (e: Event) => {
    if (e.cancelable) e.preventDefault()
  }

  for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as string[]) {
    document.addEventListener(type, refuse, { passive: false, capture: true })
  }

  // Capture, so a subtree that stops propagation for its own reasons cannot
  // accidentally re-open the door.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) refuse(e)
    },
    { passive: false, capture: true },
  )
}
