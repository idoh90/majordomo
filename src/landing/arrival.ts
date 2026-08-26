/* ---------------------------------------------------------------------------
   Who is at the door.

   Two questions, asked before anything downloads, by the three files that have
   to agree on the answer: public/boot-gate.js (which has already shown or
   hidden the prerendered markup on the same evidence), src/main.tsx (which
   picks the chunk), and the landing's own CTA (which is the way back in).

   It lives here rather than in main.tsx because main.tsx IS the boot — importing
   it to ask a question would run one.
--------------------------------------------------------------------------- */

/**
 * Does this browser hold an estate? `majordomo*` catches the shell and every
 * persisted store; `sb-` is the Supabase session of a signed-in user whose
 * local stores were cleared.
 *
 * Storage blocked (private mode) reads as no estate: the landing shows, and
 * the app's own storageAvailable() messaging takes over past the CTA.
 */
export function hasEstate(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('majordomo') || k.startsWith('sb-'))) return true
    }
  } catch {
    /* no storage, no estate */
  }
  return false
}

/**
 * Did this URL ask for the landing by name?
 *
 * `?landing` is the front door's own address. The app links back to it from
 * the settings screen (app/frontDoor.ts) — a resident taking another look at
 * the page that introduced the house — and it doubles as the escape hatch for
 * working on that page without wiping localStorage.
 *
 * The pattern is deliberately not `search.includes('landing')`: `?src=uplanding`
 * is a referrer tag, not a request.
 */
export function wantsLanding(): boolean {
  return /[?&]landing(?:[=&]|$)/.test(window.location.search)
}
