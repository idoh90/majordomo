/* Decides, before first paint, whether this browser holds an estate. An
   external file rather than an inline script because the CSP is
   script-src 'self'. Sets data-estate on <html>; tokens.css hides the
   prerendered landing under it, so an estate holder never sees a landing
   frame. Must agree with src/landing/arrival.ts, which main.tsx asks the
   same two questions of a moment later. */
;(function () {
  try {
    /* ?landing — the front door, asked for by name (the app's own link back to
       the landing page carries it). Hiding the very page the URL asked for is
       the one way this gate can be wrong in the visitor's face, so the request
       is honoured before the estate is even looked for. */
    if (/[?&]landing(?:[=&]|$)/.test(window.location.search)) return

    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i)
      if (k && (k.indexOf('majordomo') === 0 || k.indexOf('sb-') === 0)) {
        document.documentElement.setAttribute('data-estate', '')
        return
      }
    }
  } catch (e) {
    /* storage blocked → the landing shows */
  }
})()
