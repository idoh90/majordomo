/**
 * The 404 page's only script — and it is a FILE, not an inline block, because
 * `vercel.json` serves `script-src 'self'` on `/(.*)` and that policy reaches
 * the 404 response like any other. An inline block would be dropped by the
 * browser while the page still rendered perfectly, which is the one way this
 * CSP fails quietly instead of loudly: the skin and the echoed path would just
 * quietly stop happening. Loaded from an ABSOLUTE path for the same reason the
 * page has no stylesheet — `404.html` is served AT the address that was typed,
 * so a relative `src` would go looking in whatever directory that implies.
 *
 * Everything here is an enhancement over a page that is already complete. If
 * this file never arrives, the 404 still renders — in Midnight, with the path
 * row hidden — which is why it is safe to depend on nothing and check nothing.
 */
;(function () {
  // ── the estate's chosen palette, before first paint ──────────────────────
  // Same key and shape the shell store persists (`majordomo-shell` v3). This
  // script is loaded synchronously from <head>, so the attribute lands before
  // the first paint and nobody running Terminal sees a flash of Midnight.
  // Anything unreadable — blocked storage, a stale blob, or one of the
  // founder-only skin ids, whose CSS ships only in the founder bundle — falls
  // through to Midnight, which is what `normalizeSkin` does in the app.
  try {
    var THEME = { terminal: '#000000', aurora: '#131022' }
    var skin = JSON.parse(localStorage.getItem('majordomo-shell') || '{}').state.skin
    if (THEME[skin]) {
      document.documentElement.setAttribute('data-skin', skin)
      var meta = document.querySelector('meta[name=theme-color]')
      if (meta) meta.setAttribute('content', THEME[skin])
    }
  } catch (e) {
    /* Midnight it is. */
  }

  // ── echo the address back, so a typo is visible rather than guessed at ───
  // Deferred to DOMContentLoaded: the script runs from <head>, so the elements
  // below do not exist yet. textContent, never innerHTML — the string comes
  // from the address bar, which is to say from anyone who can hand out a link.
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var p = location.pathname + location.search
      if (!p || p === '/') return
      document.getElementById('path').textContent = p.length > 180 ? p.slice(0, 179) + '…' : p
      document.getElementById('asked').hidden = false
    } catch (e) {
      /* the panel simply doesn't show a path */
    }
  })
})()
