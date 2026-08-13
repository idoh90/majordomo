import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
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
        // every user's install for nobody's benefit.
        globIgnores: ['og.png'],
        // any unknown path falls back to the shell — there is no router, but a
        // stray deep link must never dead-end offline
        navigateFallback: 'index.html',
        // …except the server's own routes. `api/` is a real backend on the same
        // origin, and an offline shell that answers for it would turn "the Bell
        // is unreachable" into "the Bell replied with an HTML page" — a failure
        // the caller cannot read and cannot retry sensibly. Nothing under /api
        // is a navigation today, so this changes nothing yet; it is here so the
        // chat UI does not discover it the hard way.
        navigateFallbackDenylist: [/^\/api\//],
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
})
