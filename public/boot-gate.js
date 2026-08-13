/* Decides, before first paint, whether this browser holds an estate. An
   external file rather than an inline script because the CSP is
   script-src 'self'. Sets data-estate on <html>; tokens.css hides the
   prerendered landing under it, so an estate holder never sees a landing
   frame. Must agree with hasEstate() in src/main.tsx. */
;(function () {
  try {
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
