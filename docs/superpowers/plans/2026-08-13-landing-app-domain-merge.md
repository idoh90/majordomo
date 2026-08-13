# Landing + App Domain Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The landing page moves into this repo and serves at `majordomocal.com/` for strangers and crawlers, while estate holders boot straight into the app at the same URL.

**Architecture:** `index.html` ships as the prerendered landing. A tiny external boot-gate script hides the landing markup pre-paint when localStorage holds an estate; `src/main.tsx` becomes a switch that dynamic-imports either the landing chunk or the app chunk. The waitlist is retired; the CTA mounts the app's first-run in place.

**Tech Stack:** Vite 7, React 19, Tailwind 4, vite-plugin-pwa, @vercel/analytics, playwright-core + lighthouse (audit gates).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-landing-app-domain-merge-design.md`.
- CSP is `script-src 'self'` — **no inline scripts anywhere**, including in prerendered HTML.
- The working tree holds uncommitted changes from other work (`src/app/App.tsx`, `TabBar.tsx`, `SettingsScreen.tsx`, `consoles.ts`, `shell.ts`, voice packs, `CLAUDE.md`). **Never stash, reset, or `git add` those files.** Commit only files this plan creates or edits.
- Do not touch: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `base: './'`, CSP contents, `api/bell.ts`, `majordomo-cyan.vercel.app` anywhere.
- Do NOT edit `CLAUDE.md` (dirty with foreign work) — doc updates go in the final report instead.
- All user-facing strings live in `src/landing/voice.ts` (landing) — no inline copy.
- `WaitlistForm.tsx`, `Counter.tsx`, `lib/waitlist.ts`, landing `supabase/` do **not** migrate.
- Landing repo path: `C:\Users\Ido\Desktop\majordomo landing page`. App repo (this repo): `C:\Users\Ido\Desktop\modojorno`.

---

### Task 0: Baseline and branch

**Files:** none (verification only)

- [ ] **Step 1: Verify the dirty tree builds** — `npm run build && npm run lint` in the repo root. Expected: both green. If not, STOP and report — the foreign WIP is broken and nothing here should proceed on top of it.
- [ ] **Step 2: Branch** — `git checkout -b landing-merge` (from `main`, which holds the committed spec).

### Task 1: Landing source moves in — waitlist out, CTA in

**Files:**
- Create: `src/landing/` — copied from landing repo `src/` with edits below
  - `LandingPage.tsx` (was `App.tsx`), `PrivacyPage.tsx`, `entry-privacy.tsx` (was `privacy.tsx`), `entry-server.tsx`, `voice.ts`, `tokens.css`, `globals.d.ts`
  - `components/`: `BrassRule.tsx`, `Briefing.tsx`, `Faq.tsx`, `Footer.tsx`, `FounderNote.tsx`, `Hero.tsx`, `Masthead.tsx`, `Section.tsx`, `WhatIf.tsx`, `Wings.tsx`, `faq.css`, `rule.css`, `whatif.css` — **not** `WaitlistForm.tsx`, **not** `Counter.tsx`
  - `demo/`: `Demo.tsx`, `demo.css`, `week.ts`
  - `lib/`: `analytics.ts` only
  - New: `components/GetStarted.tsx`, `enterApp.ts`, `mount.tsx`
- Create: `site.config.ts` (repo root) — landing's minus the Supabase section
- Test: `npx tsc --noEmit`

**Interfaces:**
- Produces: `mountLanding(): void` / `unmountLanding(): void` from `src/landing/mount.tsx`; `enterApp(): Promise<void>` from `src/landing/enterApp.ts`; `.landing-doc` wrapper + `html[data-estate]` hide contract in `tokens.css`; `ORIGIN_TOKEN`, `CONTACT_TOKEN`, `FALLBACK_CONTACT`, `resolveOrigin`, `resolveContact`, `fillTokens` from `site.config.ts`.

- [ ] **Step 1: Copy files** per list above (PowerShell `Copy-Item`), renaming `App.tsx → LandingPage.tsx`, `privacy.tsx → entry-privacy.tsx`. Copy `site.config.ts` to repo root.

- [ ] **Step 2: `site.config.ts` edits** — delete the whole "THE REGISTRY THE FORM WRITES TO" section (`SupabaseEnv` type, `decodeJwtRole`, `assertSupabaseEnv`) and change the fallback origin (the domain is known now):

```ts
export const FALLBACK_ORIGIN = 'https://majordomocal.com'
```

Trim the FALLBACK_ORIGIN comment to say: local builds fall back to the production domain; on Vercel, `VERCEL_PROJECT_PRODUCTION_URL` overrides anyway.

- [ ] **Step 3: `voice.ts` edits** — replace `form` with `cta`, update copy the doors-open change forces, drop `proof` and `FormState`:

```ts
  meta: {
    title: 'Majordomo — the calendar that survives your schedule',
    description:
      'A calendar-first life OS for rotating shifts, serious training, and study — run by a dry, deadpan butler. The beta is open.',
  },

  masthead: {
    wordmark: 'MAJORDOMO',
    status: 'BETA · NOW OPEN',
  },

  a11y: {
    skipToCta: 'SKIP TO THE DOOR',
  },

  cta: {
    button: 'GET STARTED',
    fineprint: 'Free during the beta. Your estate lives on your device — set up in under a minute.',
    busy: 'One moment.',
    error: 'The line is down. Try once more, sir.',
  },
```

`faq.items[0]` becomes:

```ts
      {
        q: 'When is the beta?',
        a: 'It is open now. Press the button and the estate is yours — free for as long as the beta runs.',
      },
```

`footer.signoff` becomes `'The estate is open. Come through, sir.'`

`privacy.body` becomes:

```ts
    body: [
      'This page collects nothing about you. No signup form, no analytics cookies, no advertising pixels, no third-party trackers.',
      'The app keeps your estate on your own device, local-first. Signing in syncs it between your devices; nothing is sold, rented, shared, or used to build a profile of you.',
      `Write to ${__CONTACT_EMAIL__} and whatever the sync holds is deleted, without argument and without a retention offer.`,
      'Visitor counts (pages viewed, referring site) are measured in aggregate by Vercel Web Analytics, which sets no cookies and stores no personal data.',
      'An estate does not gossip.',
    ],
```

(The "Write to … and" shape is load-bearing: `scripts/audit.mjs` extracts the privacy mailbox with `/Write to ([^\s]+@[^\s]+?) and/`.)

- [ ] **Step 4: `tokens.css` edits** — scope Tailwind to the landing tree and add the gate contract. First line changes from `@import "tailwindcss";` to:

```css
@import 'tailwindcss' source(none);
@source "../landing";
```

Append at the end:

```css
/* The boot gate (public/boot-gate.js) marks an estate-holding browser on
   <html> before first paint; the landing document steps aside for the app
   chunk. display:contents normally, so the wrapper never affects layout. */
.landing-doc {
  display: contents;
}
html[data-estate] .landing-doc {
  display: none;
}
```

- [ ] **Step 5: New `src/landing/components/GetStarted.tsx`**:

```tsx
import { useState } from 'react'
import { voice } from '../voice'
import { enterApp } from '../enterApp'

/* The one button. It replaced the waitlist form the day the doors opened: the
   only thing between a visitor and the estate is the app chunk downloading. */
export default function GetStarted({ placement }: { placement: 'hero' | 'footer' }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  return (
    <div data-placement={placement}>
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy')
          enterApp().catch(() => setState('error'))
        }}
        className="btn-cta h-[54px] w-full px-[30px] text-[15px] whitespace-nowrap sm:h-[52px] sm:w-auto"
      >
        {voice.cta.button}
      </button>
      <p
        aria-live="polite"
        className={`mt-3.5 text-[12.5px] leading-relaxed ${state === 'error' ? 'text-danger' : 'text-ink-dim'}`}
      >
        {state === 'busy' ? voice.cta.busy : state === 'error' ? voice.cta.error : voice.cta.fineprint}
      </p>
    </div>
  )
}
```

- [ ] **Step 6: New `src/landing/enterApp.ts`**:

```ts
/* The door itself. Unmounts the landing and boots the app in place — no
   navigation, no redirect: the URL is already the right one. Dynamic imports
   only, so the landing chunk never carries app code. */
export async function enterApp(): Promise<void> {
  const [{ unmountLanding }, { bootApp }] = await Promise.all([
    import('./mount'),
    import('../app/boot'),
  ])
  unmountLanding()
  bootApp()
}
```

- [ ] **Step 7: New `src/landing/mount.tsx`**:

```tsx
import { StrictMode } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import LandingPage from './LandingPage'
import { startAnalytics } from './lib/analytics'

let root: Root | null = null

/* Hydrates the prerendered document (or mounts cold under `vite dev`, where
   the root is empty). */
export function mountLanding() {
  const el = document.getElementById('root')!
  const tree = (
    <StrictMode>
      <LandingPage />
    </StrictMode>
  )
  if (el.firstChild) {
    root = hydrateRoot(el, tree)
  } else {
    root = createRoot(el)
    root.render(tree)
  }
  startAnalytics()
}

/* Called by enterApp() once the app chunk is ready to take the root. */
export function unmountLanding() {
  root?.unmount()
  root = null
}
```

- [ ] **Step 8: `LandingPage.tsx` edits** — drop `useEffect`/`captureSource` (import and call), wrap in the gate wrapper, retarget the skip link:

```tsx
export default function LandingPage() {
  return (
    <div className="landing-doc">
      <a
        href="#enter"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ember focus:px-4 focus:py-2 focus:font-display focus:text-sm focus:tracking-widest focus:text-bg"
      >
        {voice.a11y.skipToCta}
      </a>
      {/* Masthead / main / Footer exactly as before */}
    </div>
  )
}
```

- [ ] **Step 9: `Hero.tsx` edits** — `WaitlistForm`/`Counter` imports become `GetStarted`; the CTA block becomes:

```tsx
        <div id="enter" tabIndex={-1} className="mx-auto mt-7 max-w-[560px] md:mt-9">
          <GetStarted placement="hero" />
        </div>
```

- [ ] **Step 10: `Footer.tsx` edit** — `<WaitlistForm placement="footer" />` becomes `<GetStarted placement="footer" />`, import updated.

- [ ] **Step 11: `entry-server.tsx` edit** — `import App from './App'` becomes `import LandingPage from './LandingPage'`; `render` returns `renderToString(route === 'privacy' ? <PrivacyPage /> : <LandingPage />)`.

- [ ] **Step 12: Typecheck** — `npx tsc --noEmit`. Expected: clean. (`entry-privacy.tsx` needs no edits — its relative imports survive the move.)

- [ ] **Step 13: Commit** — `git add src/landing site.config.ts && git commit` — "The landing moves in: waitlist out, one brass button in".

### Task 2: Entry split — boot gate, app boot module

**Files:**
- Create: `src/app/boot.tsx`, `public/boot-gate.js`
- Modify: `src/main.tsx` (full rewrite), `src/vite-env.d.ts`, `vite.config.ts` (one option)

**Interfaces:**
- Consumes: `mountLanding` from Task 1.
- Produces: `bootApp(): void` from `src/app/boot.tsx` (used by `enterApp`); `data-estate` attribute set by `public/boot-gate.js`.

- [ ] **Step 1: Create `src/app/boot.tsx`** — the entire body of today's `src/main.tsx` moves here (imports adjusted one level deeper: `./app/App` → `./App`, `./core/…` → `../core/…`), wrapped in `bootApp()` with three additions — viewport swap, manual SW registration, founder import moved inside:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// commercial typefaces (self-hosted): Big Shoulders (display / wordmark /
// hero numerals) + Source Sans 3 (the working face)
import '@fontsource/big-shoulders/500.css'
import '@fontsource/big-shoulders/600.css'
import '@fontsource/big-shoulders/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/400-italic.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/source-sans-3/700.css'
import '../core/ui/index.css'
import App from './App'
import { BootBoundary, BootFailure } from './BootFailure'
import { applySkin } from '../core/ui/skins'
import { lockZoom } from '../core/ui/zoomLock'
import { voice } from '../core/voice'
import { initAuth } from '../core/auth/store'
import { initSync } from './sync/init'
import { initJoinGate } from './share/joinGate'
import { initOnboarding } from './onboarding/store'
import { useShellStore } from '../core/store/shell'

/* The viewport the app asks for. The DOCUMENT ships with the landing's
   zoomable viewport (Lighthouse accessibility requires it, and a public page
   should scale); the app is an instrument, not a document, and restores its
   own on boot. Android honours the meta swap; iOS ignores the flag for pinch
   either way, which is what lockZoom() is for. */
const APP_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

export function bootApp() {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', APP_VIEWPORT)

  /* Registration moved out of the plugin-injected entry (injectRegister:
     false in vite.config.ts): a stranger reading the landing must not precache
     the whole app. Only an estate boot registers the worker. */
  registerSW({ immediate: true })

  if (import.meta.env.VITE_FOUNDER_SKIN === '1') {
    void import('../core/ui/founder')
  }

  const root = createRoot(document.getElementById('root')!)
  /* … the existing try/catch boot body from main.tsx, verbatim:
     applySkin, document.title, lockZoom, initAuth, initSync, initJoinGate,
     initOnboarding, root.render(<StrictMode><BootBoundary><App/></BootBoundary></StrictMode>),
     catch → root.render(<BootFailure …/>) … */
}
```

(Original comment blocks move with their lines. React's `createRoot().render()` deletes any existing children of `#root` on first render — that is what clears the hidden prerendered landing for estate boots.)

- [ ] **Step 2: Rewrite `src/main.tsx`**:

```tsx
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
```

- [ ] **Step 3: Create `public/boot-gate.js`**:

```js
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
```

- [ ] **Step 4: `src/vite-env.d.ts`** — add `/// <reference types="vite-plugin-pwa/client" />` (types for `virtual:pwa-register`).

- [ ] **Step 5: `vite.config.ts`** — add `injectRegister: false` to the `VitePWA({ … })` options, directly above `registerType`, with the comment: `// registration moved to app/boot.tsx — the landing entry must not register it`.

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 7: Commit** — `git add src/main.tsx src/app/boot.tsx public/boot-gate.js src/vite-env.d.ts vite.config.ts && git commit` — "One entry, two doors: the boot gate decides before first paint".

### Task 3: HTML entries, build config, prerender, deps

**Files:**
- Modify: `index.html` (full rewrite), `vite.config.ts` (merge in the site-address plugin and entries), `package.json`
- Create: `privacy.html`, `scripts/prerender.mjs`

**Interfaces:**
- Consumes: `ORIGIN_TOKEN`, `CONTACT_TOKEN`, `resolveOrigin`, `resolveContact`, `fillTokens`, `FALLBACK_CONTACT` from `site.config.ts`; `entry-server.tsx` `render`/`meta`.
- Produces: `npm run build` = tsc ×2 → vite build → prerender; `dist/index.html` + `dist/privacy.html` prerendered and token-filled.

- [ ] **Step 1: Rewrite `index.html`** — landing head (SEO + token block + zoomable viewport) merged with the app's install metas, boot-gate first in head, updated noscript:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- The landing's viewport, zoomable: the document a stranger and a crawler
         meet is a public page, and pinch-zoom on it is an accessibility
         requirement. The app swaps in its own locked viewport in app/boot.tsx
         the moment an estate boots. -->
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#0c1017" />

    <title>Majordomo — the calendar that survives your schedule</title>
    <meta
      name="description"
      content="A calendar-first life OS for rotating shifts, serious training, and study — run by a dry, deadpan butler. The beta is open."
    />

    <!-- This page WANTS to be found. The app behind it renders nothing a
         crawler can see; nothing else needs a noindex. -->
    <meta name="robots" content="index, follow, max-image-preview:large" />

    <!-- The origin in every absolute URL below is filled in at build time from
         site.config.ts, which reads Vercel's own production domain when there
         is one. Domain day changes nothing in this file. -->
    <link rel="canonical" href="__SITE_ORIGIN__/" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Majordomo" />
    <meta property="og:url" content="__SITE_ORIGIN__/" />
    <meta property="og:title" content="Majordomo — the calendar that survives your schedule" />
    <meta
      property="og:description"
      content="A calendar-first life OS for rotating shifts, serious training, and study — run by a dry, deadpan butler. The beta is open."
    />
    <meta property="og:image" content="__SITE_ORIGIN__/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Every mission needs a MAJORDOMO." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Majordomo — the calendar that survives your schedule" />
    <meta
      name="twitter:description"
      content="A calendar-first life OS for rotating shifts, serious training, and study — run by a dry, deadpan butler. The beta is open."
    />
    <meta name="twitter:image" content="__SITE_ORIGIN__/og.png" />

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <!-- the manifest link + SW asset links are injected at build time by
         vite-plugin-pwa; registration itself happens in app/boot.tsx, estate
         boots only -->
    <link rel="apple-touch-icon" href="./icons/icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Majordomo" />

    <!-- The gate. Synchronous and first, so an estate holder never paints a
         landing frame. External file: the CSP forbids inline script. -->
    <script src="/boot-gate.js"></script>
    <script type="module" src="/src/main.tsx"></script>
  </head>
  <body>
    <div id="root"></div>

    <!-- The build prerenders, so the whole pitch above reads without
         JavaScript. The estate itself is an app and cannot. -->
    <noscript>
      <div
        style="
          position: fixed;
          inset: 0 0 auto 0;
          z-index: 50;
          padding: 12px 20px;
          background: #d4ae6a;
          color: #0c1017;
          font-family: 'Source Sans 3', system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          text-align: center;
        "
      >
        The estate itself needs JavaScript — the page above reads fine without it. Questions to
        <a href="mailto:__CONTACT_EMAIL__" style="color: #0c1017"><b>__CONTACT_EMAIL__</b></a>.
      </div>
    </noscript>
  </body>
</html>
```

- [ ] **Step 2: Create `privacy.html`** — landing's, script path adjusted:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#0c1017" />
    <title>Privacy — Majordomo</title>
    <meta name="description" content="What this page collects, and what it does not." />
    <link rel="canonical" href="__SITE_ORIGIN__/privacy" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script type="module" src="/src/landing/entry-privacy.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

- [ ] **Step 3: `vite.config.ts` merge** — bring in the landing's `siteAddress` plugin verbatim (with its imports from `./site.config`), switch to the function config form, add the define and the two HTML inputs. Final shape:

```ts
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CONTACT_TOKEN,
  ORIGIN_TOKEN,
  fillTokens,
  resolveContact,
  resolveOrigin,
} from './site.config'

/* … the siteAddress() plugin from the landing repo, verbatim, including its
   header comment, PUBLIC_FILES = ['robots.txt', 'sitemap.xml'], the
   transformIndexHtml/configureServer/closeBundle hooks and the isSsrBuild
   guard … */

export default defineConfig(({ mode }) => {
  /* SITE_ORIGIN and CONTACT_EMAIL carry no VITE_ prefix — build-time
     configuration, not values the browser is handed. Empty prefix so the same
     names work in .env files and the Vercel dashboard. */
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }

  return {
    base: './',
    define: {
      [CONTACT_TOKEN]: JSON.stringify(resolveContact(env)),
    },
    build: {
      rollupOptions: {
        input: { index: 'index.html', privacy: 'privacy.html' },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      siteAddress(env),
      VitePWA({
        /* … existing options, unchanged, plus injectRegister: false from Task 2 … */
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
```

(No `cssCodeSplit: false` — unlike the landing repo, the app's stylesheet must stay in the app chunk. No `assertSupabaseEnv` — the waitlist is gone.)

- [ ] **Step 4: Create `scripts/prerender.mjs`** — the landing's, with an explicit inline config (the project config now carries VitePWA and the site-address plugin, neither of which belongs in an SSR scratch build):

```js
import { readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* Prerender / and /privacy into dist/*.html — the landing repo's mechanism.
   Runs after the client build, renders src/landing/entry-server.tsx to
   strings, splices them into the emitted HTML. The largest contentful paint
   is the headline; it must not wait for a bundle. */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dist = join(root, 'dist')
const ssrDir = join(root, '.ssr')

/* Fallback duplicated from site.config.ts (FALLBACK_CONTACT): this script is
   plain node and cannot import TypeScript. Only feeds the SSR bundle's
   define; the shipped HTML got the real value from vite.config.ts. */
const contact = (process.env.CONTACT_EMAIL ?? '').trim() || 'idoh40@gmail.com'

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  define: { __CONTACT_EMAIL__: JSON.stringify(contact) },
  build: {
    ssr: join(root, 'src/landing/entry-server.tsx'),
    outDir: ssrDir,
    emptyOutDir: true,
    minify: false,
    copyPublicDir: false,
  },
})

const { render, meta } = await import(
  /* @vite-ignore */ new URL('../.ssr/entry-server.js', import.meta.url).href
)

/* … font preloads (WANTED regexes for big-shoulders-latin-700 and
   source-sans-3-latin-400), title/description splice, root splice — all
   verbatim from the landing repo's scripts/prerender.mjs lines 42-105 … */
```

- [ ] **Step 5: `package.json`** — scripts become:

```json
    "build": "tsc --noEmit && tsc --noEmit -p tsconfig.api.json && vite build && node scripts/prerender.mjs",
    "audit": "node scripts/audit.mjs",
```

Then `npm install @vercel/analytics@^2.0.1` and `npm install -D lighthouse@^13.4.1 playwright-core@^1.62.0`.

- [ ] **Step 6: Build** — `npm run build`. Expected: green; `dist/index.html` contains the hero headline text and `https://majordomocal.com` in the canonical; `dist/privacy.html` exists; no `__SITE_ORIGIN__`/`__CONTACT_EMAIL__` anywhere in `dist/*.html`.

- [ ] **Step 7: Commit** — `git add index.html privacy.html vite.config.ts scripts/prerender.mjs package.json package-lock.json && git commit` — "The document builds prerendered, with its address filled in once".

### Task 4: Public files and headers

**Files:**
- Modify: `public/robots.txt` (replace), `vercel.json`
- Create: `public/sitemap.xml`, `public/shots/` (copied), `public/og.png` (overwritten from landing)

- [ ] **Step 1: `public/robots.txt`** — replace with the landing's token version (Allow all + `Sitemap: __SITE_ORIGIN__/sitemap.xml`), comment updated to say the app serves nothing crawlable so the page is safe to open up.
- [ ] **Step 2: `public/sitemap.xml`** — copy the landing's verbatim (tokens intact, `/` weekly 1.0, `/privacy` yearly 0.1).
- [ ] **Step 3: `public/og.png`** — overwrite with the landing repo's card (per spec; matches the `og:image:alt` copy). `public/shots/` — copy the landing repo's directory (the Wings screenshots the landing renders).
- [ ] **Step 4: `vercel.json`** — delete the `X-Robots-Tag` header line; add at top level `"cleanUrls": true, "trailingSlash": false` (serves `/privacy` from `privacy.html`). Everything else (CSP, sw.js, manifest, asset caching) unchanged.
- [ ] **Step 5: Rebuild** — `npm run build`; then verify `dist/robots.txt` and `dist/sitemap.xml` carry `https://majordomocal.com` and no tokens.
- [ ] **Step 6: Commit** — `git add public/robots.txt public/sitemap.xml public/og.png public/shots vercel.json && git commit` — "The front door opens to crawlers; the estate stays dark by construction".

### Task 5: Audit gates ported and green

**Files:**
- Create: `scripts/audit.mjs` (from landing repo, adapted)

- [ ] **Step 1: Copy `scripts/audit.mjs`** with exactly these adaptations:
  - `BASE` default → `http://localhost:4173` (this repo's `vite preview` port).
  - JS-off `MUST` list → `['Every mission needs a', 'schedules that fight back', 'GET STARTED', 'Why “Majordomo”?', 'The estate is open']`.
  - Everything else (contrast walker, one-address checks, placeholder-link check, Lighthouse ≥95 floor) verbatim.
- [ ] **Step 2: Run the gates** — terminal 1: `npm run preview`; terminal 2: `npm run audit`. Expected: contrast, JS-off, one-address all green; Lighthouse ≥95 all four categories both routes both presets (best-practices 96 locally is the documented analytics-404 artifact).
- [ ] **Step 3: Fix anything red** — likely candidates: a contrast regression from copy changes (none expected — palette untouched), or Lighthouse perf if the entry accidentally pulls app code (check `dist/assets` chunk sizes: the entry chunk must be small, the app chunk loaded only behind the gate).
- [ ] **Step 4: Existing gates** — `npm run lint`, `npm run check:manor`. If `check:manor` fails because the harness now lands on the landing page (empty storage), add a seed to the harness's page-init: set `localStorage['majordomo-shell']` before navigation — smallest change that restores its old view of the world; keep it inside `scripts/manor-harness.mjs`.
- [ ] **Step 5: Commit** — `git add scripts/audit.mjs` (plus harness if touched) `&& git commit` — "The landing's four gates hold on the merged build".

### Task 6: Browser verification

**Files:** none (verification; fixes loop back to their task's files)

- [ ] **Step 1: Stranger path** — serve `dist` (`npm run preview`), open in browser with cleared storage: landing paints, demo beats run, skip-link targets `#enter`.
- [ ] **Step 2: CTA path** — click GET STARTED: app chunk loads, first-run/login appears in place, no navigation. Reload after: boot gate now routes straight to the app (estate exists).
- [ ] **Step 3: Returning path** — with `majordomo-shell` in localStorage, hard-reload `/`: no landing flash (throttle network in devtools to confirm), app boots as before.
- [ ] **Step 4: `/privacy`** — renders prerendered, updated copy, back link works.
- [ ] **Step 5: Screenshot proof** — capture stranger landing + booted app for the report.

### Task 7: Final report

**Files:** none in-repo (CLAUDE.md is dirty with foreign work — do not touch)

- [ ] **Step 1: Report to Ido**, including the dashboard/user checklist the repo cannot do:
  1. Merge `landing-merge` when satisfied; deploy to the `majordomo` Vercel project (preview first).
  2. Set `CONTACT_EMAIL` in the majordomo Vercel project if a domain mailbox exists (falls back to idoh40@gmail.com).
  3. After production verify: retire the `majordomo-landing` Vercel project (delete or 308 its vercel.app URL to the apex).
  4. CLAUDE.md updates to fold in once the foreign WIP lands (noindex rationale now historical; Ship section: landing lives at the apex; `?landing` dev flag).
  5. The old landing repo is archive-only from here.
