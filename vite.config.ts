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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Majordomo',
        short_name: 'Majordomo',
        description: 'The calendar that survives your schedule',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c1017',
        theme_color: '#0c1017',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: './favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // fonts are self-hosted @fontsource, so they precache with everything else
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        // any unknown path falls back to the shell — there is no router, but a
        // stray deep link must never dead-end offline
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Quotes are a live-network luxury: serve the cache when it answers,
        // refresh behind it, and never let a failed fetch break a boot.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.twelvedata\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'quotes',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
