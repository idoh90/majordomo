import { readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* ---------------------------------------------------------------------------
   Prerender the landing's routes — and its not-found page — into dist/*.html.

   Runs after the client build. It compiles src/landing/entry-server.tsx for
   node, renders each route to a string, and splices it into the
   <div id="root"> that the client build already emitted (script tags,
   stylesheet links and all the meta the head carries stay exactly as Vite
   left them).

   Why bother: the landing's largest contentful paint is the headline, and
   without this it cannot paint until a bundle has downloaded, parsed and
   mounted. With it, the page is legible on the first frame — and the boot
   gate hides all of it before paint on a browser that holds an estate.

   The build below runs with configFile: false — the project config carries
   VitePWA and the site-address plugin, and neither belongs in an SSR scratch
   build (the SW would be regenerated into .ssr, and the address plugin would
   demand tokens of a bundle that has no HTML).
--------------------------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dist = join(root, 'dist')
const ssrDir = join(root, '.ssr')

/* Fallback duplicated from site.config.ts (FALLBACK_CONTACT): this script is
   plain node and cannot import TypeScript. It only feeds the SSR bundle's
   `define`; the shipped HTML got the real value from vite.config.ts. */
const contact = (process.env.CONTACT_EMAIL ?? '').trim() || 'majordomocal@gmail.com'

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
    // the SSR bundle is a build artefact for this script and nothing else
    minify: false,
    copyPublicDir: false,
    rollupOptions: {
      /* The landing's GET STARTED button dynamic-imports app/boot, so the SSR
         graph reaches `virtual:pwa-register` — a module only the VitePWA
         plugin (deliberately absent here) can resolve. External is safe: the
         boot chunk exists in this bundle but render() never calls it. */
      external: ['virtual:pwa-register'],
    },
  },
})

const { render, meta } = await import(
  /* @vite-ignore */ new URL('../.ssr/entry-server.js', import.meta.url).href
)

/* ---------------------------------------------------------------------------
   Font preloads.

   The two faces the first screen is set in are discovered only after the
   stylesheet has downloaded and parsed — the browser cannot see them in the
   HTML, so they sit one level deeper in the critical chain than they need to.
   Preloading them flattens that. Filenames are content-hashed, so they are
   found here rather than hard-coded, and a rename in @fontsource shows up as a
   loud failure instead of a silently dead preload.
--------------------------------------------------------------------------- */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const WANTED = [/^big-shoulders-latin-700-normal-.*\.woff2$/, /^source-sans-3-latin-400-normal-.*\.woff2$/]
const assets = await readdir(join(dist, 'assets'))
const preloads = WANTED.map((re) => {
  const hit = assets.find((f) => re.test(f))
  if (!hit) throw new Error(`prerender: no built font matches ${re} — did @fontsource rename its files?`)
  return `<link rel="preload" href="/assets/${hit}" as="font" type="font/woff2" crossorigin>`
}).join('')

/* '404' rides along with the real routes: it is prerendered for exactly the
   same reason they are — the page must be legible on the first frame, and an
   error page that needs a bundle to say what went wrong is a worse error
   page. It differs only in carrying no canonical (see the NOINDEX note in
   vite.config.ts) and in staying out of the sitemap, which lists routes. */
for (const route of ['index', 'privacy', 'terms', '404']) {
  const file = join(dist, `${route}.html`)
  let html = await readFile(file, 'utf8')
  html = html.replace('</head>', `${preloads}</head>`)

  /* The title and description are copy, and copy lives in voice.ts. The HTML
     files carry them too so the dev server and a raw file:// open are not
     blank, but voice.ts wins in the build — one place to change a sentence. */
  const m = meta[route]
  const TITLE = /<title>[\s\S]*?<\/title>/
  /* \s+ between the attributes: Prettier wraps a long meta tag across three
     lines, and a regex that assumes single spaces silently stops matching the
     day the description gets longer */
  const DESC = /(<meta\s+name="description"\s+content=")[\s\S]*?(")/
  /* Test for the TAG, not for a difference: the HTML files already carry the
     same sentences (so `vite dev` and a raw file:// open are not blank), and
     "nothing changed" is the healthy case, not a missing tag. */
  for (const [name, re] of [
    ['<title>', TITLE],
    ['<meta name="description">', DESC],
  ]) {
    if (!re.test(html)) throw new Error(`prerender: ${route}.html has no ${name} to fill`)
  }
  /* Replacer FUNCTIONS, never replacement strings: `$&`, `$'` and friends are
     interpreted inside a string replacement, so a sentence that ever contains
     one would splice a copy of the surrounding document into the page. */
  html = html
    .replace(TITLE, () => `<title>${esc(m.title)}</title>`)
    .replace(DESC, (_all, open, close) => `${open}${esc(m.description)}${close}`)

  const marker = '<div id="root"></div>'
  if (!html.includes(marker)) {
    throw new Error(
      `prerender: ${route}.html has no empty <div id="root"></div> to fill — ` +
        `did the markup change?`,
    )
  }
  const body = render(route)
  await writeFile(file, html.replace(marker, () => `<div id="root">${body}</div>`), 'utf8')
  console.log(`prerendered dist/${route}.html`)
}

await rm(ssrDir, { recursive: true, force: true })
