/* ---------------------------------------------------------------------------
   Build-time constants, injected by `define` in vite.config.ts.

   Not `import.meta.env`: that only exposes VITE_-prefixed variables, and the
   address this page publishes is resolved from Vercel's own
   VERCEL_PROJECT_PRODUCTION_URL, which carries no such prefix. Resolving it in
   the config and inlining it here keeps one answer for the whole build —
   the HTML, the bundle and the prerendered document cannot disagree.

   See site.config.ts for where the value comes from.
--------------------------------------------------------------------------- */

/** The mailbox the footer's Contact link and /privacy's deletion clause name. */
declare const __CONTACT_EMAIL__: string
