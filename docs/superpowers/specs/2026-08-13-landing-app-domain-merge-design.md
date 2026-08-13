# Landing + app on one domain — design

*13 Aug 2026. Approved in brainstorming session. Implements the decision left
open at the end of `majordomo-domain-cutover.md`: the landing page joins the
app on `majordomocal.com`.*

## Decision summary

- **One origin, one path.** Landing and app both live at `https://majordomocal.com/`.
  The app keeps the apex; no subdomain, no `/app` path, no second Supabase
  auth cutover.
- **One repo, one Vercel project.** Landing source moves into this repo
  (`modojorno`). The `majordomo-landing` repo and its Vercel project are
  retired after cutover.
- **Who sees what at `/`:** strangers (and crawlers, and browsers with JS off)
  see the landing page. Returning users — anyone with an estate in
  localStorage or a Supabase session — boot straight into the app with no
  landing flash.
- **Doors open.** The waitlist is over. The landing CTA becomes **"Get
  started"** and mounts the app's first-run/sign-in flow in place. No new
  writes to the waitlist table; its data stays in Supabase untouched.

## Architecture

### Boot flow at `/`

`index.html` ships as the **prerendered landing page**: the landing markup is
spliced into `<div id="root">` at build time, exactly as the landing repo's
`scripts/prerender.mjs` does today. A crawler or a JS-off visitor gets the
whole argument in HTML. First contentful paint is the headline, not a spinner.

Deciding landing-vs-app happens in two layers:

1. **`public/boot-gate.js`** — a tiny **external** script in `<head>`
   (external because CSP is `script-src 'self'` with no inline allowance; that
   stays). It synchronously checks localStorage for an estate marker — the
   `majordomo-shell` key, any other `majordomo-*` persistence key, or a
   Supabase `sb-*-auth-token` — and sets `data-estate` on `<html>`. A CSS rule
   hides the prerendered landing markup when `data-estate` is present, so a
   returning user never sees a landing frame. If localStorage throws (private
   mode, blocked cookies), the gate does nothing and the landing shows — the
   app's existing `storageAvailable()` handling owns that case past the CTA.

2. **`src/main.tsx`** becomes a thin switch on the same check:
   - estate present → `import('./app/…')` (the app chunk), run today's boot
     sequence (`applySkin`, `lockZoom`, `initAuth`, `initSync`,
     `initJoinGate`, `initOnboarding`), mount `<App/>` over the root.
   - no estate → `import('./landing/…')` (the landing chunk), hydrate the
     prerendered markup so the demo beats and CTA work.

   The two chunks are split: a stranger never downloads app code; a returning
   user pays only `boot-gate.js` plus the switch, never renders landing.

### Repo layout

Landing source arrives as a sibling of `app/`:

```
src/
  landing/            ← from majordomo-landing/src
    LandingPage.tsx   ← was App.tsx
    PrivacyPage.tsx
    components/       ← Hero, Masthead, Wings, Briefing, Faq, Footer, …
    demo/
    lib/analytics.ts  ← lib/waitlist.ts does NOT move (retired)
    entry-server.tsx
    tokens.css
    voice.ts
  app/                ← unchanged
  core/               ← unchanged
site.config.ts        ← from landing repo (origin + contact resolution)
scripts/prerender.mjs ← from landing repo, adapted paths
scripts/audit.mjs     ← from landing repo, adapted paths
```

- `WaitlistForm.tsx`, `lib/waitlist.ts`, and the landing repo's `supabase/`
  directory are **not** migrated.
- Fonts: landing uses Big Shoulders + Source Sans 3, both already dependencies
  of this repo. No new font weight ships.
- Landing's `tokens.css` stays scoped to the landing chunk; the app's skin
  system is untouched.

### CTA — "Get started"

Replaces the waitlist form in the hero (and the repeated CTA at the foot of
the page). On click: dynamic-import the app chunk, mount it, and let the app
present its normal first-run/LoginScreen. Same-page transition — no
navigation, no query param, no redirect. Once the user signs in or an estate
is created, the boot gate routes them app-side forever after.

`/privacy` remains a prerendered route, reachable from the landing footer.
Its copy updates: the waitlist-email clause goes; the visitor-counting clause
stays (analytics still runs on the landing).

## Build pipeline

`npm run build` becomes: `tsc --noEmit` (app) → `tsc --noEmit -p
tsconfig.api.json` → `vite build` → `node scripts/prerender.mjs`.

- The prerender step compiles `src/landing/entry-server.tsx` for node, renders
  `/` and `/privacy`, and splices the markup into the client build's HTML —
  the landing repo's existing mechanism with paths adjusted.
- The origin-token Vite plugin from the landing repo comes along:
  `SITE_ORIGIN` → `VERCEL_PROJECT_PRODUCTION_URL` → fallback, resolved once,
  stamped everywhere (canonical, OG, robots, sitemap). The hand-written OG
  block added to `index.html` during the domain cutover is **replaced** by
  this token system — same output, one source of truth. `public/og.png`
  comes from the landing repo (the drafted 1200×630 card, not the app icon).

## Config changes (`vercel.json`, `public/`)

| Item | Change | Why |
|---|---|---|
| `X-Robots-Tag: noindex, nofollow` on `/(.*)` | **Removed** | `/` is now the public product page and must be indexed. Nothing app-side becomes crawlable: app UI is never server-rendered, all app state is behind JS + auth. |
| `public/robots.txt` | `Disallow: /` → allow all, plus `Sitemap:` line | Same reason. |
| `public/sitemap.xml` | New, lists `/` and `/privacy` | From landing repo's token-stamped template. |
| CSP | **Unchanged** | Landing is same-origin everywhere. `@vercel/analytics` loads `/_vercel/insights/script.js` and beacons to `/_vercel/insights/*` — both covered by `'self'` on Vercel. |
| `X-Frame-Options: DENY` | Unchanged | Stricter than the landing's old SAMEORIGIN; fine. |
| Service worker / manifest | Unchanged files; **registration stays app-side** | SW must not cache the landing for strangers. Registration already happens from app code, which strangers never load. Manifest `<link>` in head is harmless and stays. |
| Cache headers | Unchanged | `/assets/*` immutable already covers both chunks. |

`@vercel/analytics` is imported **only inside the landing chunk**. The app
stays analytics-free, which keeps the privacy page honest.

## Error handling

- **boot-gate failure** (localStorage blocked): silent fallthrough to landing.
  App-side `storageAvailable()` messaging handles the rest after the CTA.
- **App chunk fails to import** (offline stranger clicking CTA, bad deploy):
  the existing `BootBoundary`/`BootFailure` recovery screen wraps the mount.
- **Prerender step fails**: build fails loudly — no silent fallback to an
  empty shell, same posture as the landing repo today.

## Rollout

1. All work on a new branch in this repo. **The working tree currently holds
   uncommitted changes from other work** — those are committed or stashed by
   Ido before implementation starts; the implementation never stashes, resets,
   or commits work it didn't write.
2. Deploy to a Vercel preview URL; run gates there.
3. Promote to production on `majordomocal.com`. The app path is verified first
   (returning user boots clean, no flash), then the stranger path.
4. After production is verified: retire the `majordomo-landing` Vercel
   project. Optionally point `majordomo-landing.vercel.app` at the apex with a
   308 (or simply delete the project — nothing public ever linked to it).
5. `majordomo-cyan.vercel.app` stays connected — deliberate app fallback,
   untouched by this work. (It will serve the landing to strangers too, with
   canonical pointing at the apex — correct and harmless.)

## Testing & gates

Ported from the landing repo, adapted to the merged build, all must pass:

- **contrast** — every visible text node, both routes, 390/1440, against real
  composited background.
- **JS off** — both routes legible as static HTML.
- **Lighthouse ≥ 95** — mobile + desktop, both routes. The code split is what
  keeps this reachable; the app chunk must not load on the stranger path.
- **one address, everywhere** — canonicals, OG, robots, sitemap all on one
  origin; no build token in shipped files; contact address consistent.

Unchanged and still required green: `npm run lint`, both tsc passes,
`npm run check:manor`.

Manual verification before reporting done:

- Stranger path: landing paints, demo runs, CTA mounts first-run.
- Returning-user path: app boots with **no landing flash** (throttled network
  check, not just fast localhost).
- `/privacy` renders, updated copy.
- Old alias `majordomo-cyan.vercel.app` still boots the app for an estate
  holder.

## Out of scope

- No change to Supabase auth config, env vars, or the waitlist table's data.
- No change to app modules, skins, sync, or the Bell.
- No www or subdomain work — the cutover topology stands.
- Landing copy rewrite beyond what the CTA change forces (waitlist wording →
  "Get started", privacy page waitlist clause).
