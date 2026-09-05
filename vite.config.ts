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

/* A document may skip the origin token only by declaring itself noindex —
   which today is 404.html and the superseded privacy policy at
   privacy/2026-08-31.html. An error page has no canonical URL because it has
   no address: it answers at every address that is wrong. A superseded policy
   has an address and must not be FOUND at it: a search for the privacy policy
   has to land on the one that applies, so the archive says noindex and stays
   out of the sitemap.
   The guard's job is unchanged either way — a page carrying NEITHER a
   canonical nor a noindex is a page whose own address was forgotten, and it
   still fails the build.

   \s+ between the attributes, not a single space: Prettier wraps a long meta
   tag across three lines, and a regex that assumes one space silently stops
   matching the day someone adds max-image-preview to it. (The same lesson
   scripts/prerender.mjs learned about its description tag.) */
const NOINDEX = /<meta\s+name="robots"\s+content="[^"]*\bnoindex\b/i

/* ---------------------------------------------------------------------------
   The page's own address, filled in at build time.

   index.html and privacy.html carry __SITE_ORIGIN__ where their canonical, OG
   and Twitter URLs go; robots.txt and sitemap.xml carry it too; the landing's
   voice.ts and noscript banner carry __CONTACT_EMAIL__. All of them are
   resolved from one place — see site.config.ts for the precedence and why.

   Every hook here THROWS on a missing token rather than passing the file
   through untouched. A file that quietly stops being wired up is the exact
   failure this replaced: it builds, it deploys, and it is wrong in a way only
   a crawler notices. The documents exempt from the canonical are 404.html and
   the dated privacy archive, which buy the exemption by declaring themselves
   noindex — see NOINDEX above.
--------------------------------------------------------------------------- */
function siteAddress(env: Record<string, string | undefined>): Plugin {
  const origin = resolveOrigin(env)
  const contact = resolveContact(env)
  const fill = (text: string) => fillTokens(text, origin, contact)

  /* Files copied verbatim out of public/. They are left as real, readable
     files in the repo — a human should be able to open robots.txt and see a
     robots.txt — so they are rewritten in dist afterwards rather than
     generated from strings in here. */
  const PUBLIC_FILES = ['robots.txt', 'sitemap.xml']

  let config: ResolvedConfig

  return {
    name: 'majordomo-site-address',

    configResolved(resolved) {
      config = resolved
    },

    /* 'post' so the token survives anything else that rewrites the HTML. */
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!html.includes(ORIGIN_TOKEN) && !NOINDEX.test(html)) {
          throw new Error(
            `${ctx.filename} carries no ${ORIGIN_TOKEN} and does not declare itself noindex. ` +
              `Every route needs a canonical URL, and it must come from site.config.ts ` +
              `rather than being typed in — or the document must say plainly that it is ` +
              `not a route, the way 404.html does.`,
          )
        }
        return fill(html)
      },
    },

    /* The dev server serves public/ untouched, so without this `vite dev`
       would hand a crawler-shaped file full of tokens. Nothing crawls
       localhost, but a developer reading /robots.txt should see the same
       document the deploy will. Installed with a direct .use(), which puts it
       AHEAD of Vite's own static handler — returning a function here would
       queue it behind, and the raw file would win. */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '')
        if (!PUBLIC_FILES.includes(name)) return next()
        readFile(join(config.publicDir, name), 'utf8').then(
          (text) => {
            res.setHeader('Content-Type', name.endsWith('.xml') ? 'application/xml' : 'text/plain')
            res.end(fill(text))
          },
          () => next(),
        )
      })
    },

    async closeBundle() {
      for (const name of PUBLIC_FILES) {
        const file = join(config.build.outDir, name)
        const text = await readFile(file, 'utf8')
        if (!text.includes(ORIGIN_TOKEN)) {
          throw new Error(
            `dist/${name} carries no ${ORIGIN_TOKEN}. It is supposed to name this ` +
              `page's origin, and it now names nothing or names it by hand.`,
          )
        }
        await writeFile(file, fill(text), 'utf8')
      }
      config.logger.info(`  site address  ${origin}  ·  contact  ${contact}`)
    },
  }
}

export default defineConfig(({ mode }) => {
  /* SITE_ORIGIN and CONTACT_EMAIL carry no VITE_ prefix: they are build-time
     configuration, not values the browser is ever handed. That also means Vite
     does not put them in process.env when they are written in .env.local — so
     without this line, setting either one locally does nothing, silently. An
     empty prefix loads every key from the .env files, so the same two names
     work here and in the Vercel dashboard. */
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }

  return {
    base: './',
    /* The landing's voice.ts asks for the contact address by this name. A
       `define` rather than an import so the string is inlined into the bundle
       exactly like the copy around it. */
    define: {
      [CONTACT_TOKEN]: JSON.stringify(resolveContact(env)),
    },
    build: {
      rollupOptions: {
        /* Five documents: the landing (which doubles as the app shell once
           the boot gate speaks), its two legal pages, the not-found page
           Vercel serves at every path the deployment does not have, and the
           privacy policy of 31 August 2026 — superseded, kept word for word at
           its dated address (Vercel's cleanUrls serves dist/privacy/<date>.html
           at /privacy/<date>). scripts/prerender.mjs fills each with markup
           after this build. */
        input: {
          index: 'index.html',
          privacy: 'privacy.html',
          terms: 'terms.html',
          '404': '404.html',
          'privacy-2026-08-31': 'privacy/2026-08-31.html',
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      siteAddress(env),
      /**
       * The estate has no backend and lives in localStorage, so the only thing
       * standing between the app and a flight is the shell being fetchable.
       * Precache everything the app boots from — then a cold open in airplane
       * mode is indistinguishable from one on wifi.
       */
      VitePWA({
        // registration lives in app/boot.tsx, estate boots only — the landing
        // entry must not register the worker or precache the app for strangers
        injectRegister: false,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: 'Majordomo',
          short_name: 'Majordomo',
          description: 'The calendar that survives your schedule',
          // WHO the installed app is, stated rather than inferred. Without an `id`
          // the browser derives identity from `start_url` — which is relative, so
          // it resolves against whatever hostname the user happened to open. An
          // install from majordomo-cyan.vercel.app and one from majordomocal.com
          // would then be two different apps on the same phone, each with its own
          // icon. `/` is resolved against the origin and is deliberately the one
          // constant across all of them.
          id: '/',
          // `start_url` and `scope` stay RELATIVE. Absolute values here break
          // `npx vercel dev` and `npm run preview`, which serve from other ports.
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0c1017',
          theme_color: '#0c1017',
          icons: [
            { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            // no maskable entry: the placeholder M has no safe-zone padding, and a
            // cropped mark is worse than the OS fallback — revisit at the logo session
            { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: './favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          // fonts are self-hosted @fontsource, so they precache with everything else
          globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
          // The link-preview card is 135 KB the app itself never renders — only
          // crawlers fetch it, and never offline. Precaching it would put it in
          // every user's install for nobody's benefit. The landing's Wing
          // screenshots (shots/) are the same story at ten times the size.
          globIgnores: ['og.png', 'shots/**'],
          // The app is served at "/" and nowhere else, so this exists for the
          // ROOT WITH A QUERY: "/?demo", "/?landing", "/?console=capital". A bare
          // "/" is already answered by the precache route (workbox's directoryIndex
          // resolves it to index.html), but a query string is not ignored when
          // matching a cache key, so without this a resident opening "/?landing"
          // offline would get nothing.
          navigateFallback: 'index.html',
          // Everything the fallback must NOT answer for. Workbox tests these
          // against `url.pathname + url.search` (see workbox-routing's
          // NavigationRoute._match), which is what lets the last rule separate a
          // real path from a query on the root.
          //
          // The first four are specific and stay specific: `api/` is a real
          // backend on the same origin, and an offline shell answering for it
          // would turn "the Bell is unreachable" into "the Bell replied with an
          // HTML page" — a failure the caller cannot read and cannot retry
          // sensibly. The legal pages are real documents the law and the consent
          // door both point at; without their entries an installed user tapping
          // Terms got the app shell back instead. They are redundant under the
          // last rule TODAY, and kept anyway so that narrowing the last rule
          // cannot silently un-protect them.
          //
          // The last rule is the general one: any path that is not "/" is not
          // this app's address. It used to be absent, and the cost was that the
          // 404 page could never be seen by anyone who had the app installed —
          // the shell answered first, at every wrong address, so a resident
          // typing a typo got their own calendar at a URL that does not exist.
          // The old comment here reasoned that "a stray deep link must never
          // dead-end offline"; the app has no router and publishes no deep
          // links, so there is no such link to strand. What it does cost is
          // real and small: a wrong address while OFFLINE now gets the
          // browser's own error page rather than 404.html, because the SW is
          // no longer the one answering and the precached copy is keyed to
          // "/404". That trade was made deliberately — see CLAUDE.md.
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/privacy$/,
            // the dated archive of every superseded privacy policy — a real
            // document at a real address, protected by name like the two above
            /^\/privacy\//,
            /^\/terms$/,
            /^\/404$/,
            /^\/[^?]/,
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          // Quotes are a live-network luxury: serve the cache when it answers,
          // refresh behind it, and never let a failed fetch break a boot.
          //
          // THERE IS NO TWELVE DATA RULE HERE, and its absence is the point.
          // Twelve Data takes its key as a query parameter, and a cache is keyed by
          // the whole URL — so caching those responses wrote the user's API key
          // into CacheStorage, where deleting it in the settings sheet does not
          // reach. It is a free read-only quote key, so the cost of losing one is
          // somebody burning a daily quota; the reason to stop is that a secret in
          // a place the app does not know it owns can never be revoked from inside
          // the app.
          //
          // Nothing is lost by dropping it: the Ledger already caches the last
          // quotes and FX rates in its own store and renders them while a refresh
          // is in flight, so an offline open shows exactly what it showed before.
          // `purgeQuoteCache` in `modules/capital/lib/prices.ts` clears the cache
          // this rule left behind on devices that already have one.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\.frankfurter\.dev\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'fx',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
