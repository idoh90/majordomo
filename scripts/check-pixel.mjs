import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadEnv } from 'vite'

/* ---------------------------------------------------------------------------
   The pixel gate — the last step of `npm run build`.

   The Meta Pixel's disclosure was published on /privacy BEFORE the pixel
   existed, so that the policy was true first. This is the guard against the
   reverse ever happening again: a pixel that exists without its disclosure.
   If the pixel module is in the tree AND a pixel id is configured for this
   build, then the built /privacy must carry the disclosure — each of its
   load-bearing promises, by phrase — or the build fails. The CSP must admit
   the three Meta hosts too, because a pixel the policy blocks is not a
   private site, it is a broken one that happens to look private.

   Nothing is checked when no id is configured: an unarmed build is the state
   this repo shipped in between the two changes, and the policy is allowed to
   promise more than the code does. It is never allowed to promise less.
--------------------------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dist = join(root, 'dist')

const MODULE = join(root, 'src/core/ads/meta.ts')
if (!existsSync(MODULE)) {
  console.log('check-pixel: no pixel module in the tree — nothing to gate.')
  process.exit(0)
}

/* The same resolution Vite gives import.meta.env: the .env files under the
   production mode, plus VITE_-prefixed process variables — which is how
   Vercel hands the value over. */
const env = loadEnv('production', root, 'VITE_')
const id = (env.VITE_META_PIXEL_ID ?? '').trim()
if (id === '') {
  console.log('check-pixel: VITE_META_PIXEL_ID is not set — the pixel is inert in this build, nothing to gate.')
  process.exit(0)
}

const fails = []

/* 1. The id actually shipped. Vite inlines import.meta.env.VITE_* as string
   literals, so an armed build carries the id in a chunk; one that does not
   has a module nothing imports, and a dashboard that thinks it is measuring. */
const assets = join(dist, 'assets')
const shipped = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .some((f) => readFileSync(join(assets, f), 'utf8').includes(id))
if (!shipped) {
  fails.push(
    'VITE_META_PIXEL_ID is set but no chunk in dist/assets carries it — the pixel ' +
      'module is not wired into a build that believes it is armed.',
  )
}

/* 2. The disclosure, on the built page, by the phrases that carry its
   promises. The markup is stripped and the entities React escapes are put
   back, so "AGREE & ENTER" is found as a person would read it. */
const html = readFileSync(join(dist, 'privacy.html'), 'utf8')
const text = html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
const PROMISES = [
  ['name the pixel', 'Meta Pixel'],
  ['name who operates it', 'Meta Platforms'],
  ['say it loads only after the door', 'AGREE & ENTER'],
  ['say Global Privacy Control suppresses it', 'Global Privacy Control'],
  ['name the transfer to the United States', 'United States'],
  ['name the switch that withdraws it', 'Share usage counts'],
  ["link Meta's own policy", 'facebook.com/privacy/policy'],
]
for (const [what, phrase] of PROMISES) {
  if (!text.includes(phrase) && !html.includes(phrase)) {
    fails.push(
      `dist/privacy.html does not ${what}: "${phrase}" is missing. The pixel is armed ` +
        'and the policy no longer discloses it — that is the contradiction this gate exists to stop.',
    )
  }
}

/* 3. The CSP admits what the pixel needs, and nothing it must never need. */
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const csp =
  (vercel.headers ?? [])
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
const directive = (name) =>
  (csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s === name || s.startsWith(`${name} `)) ?? '')
    .split(/\s+/)
    .slice(1)
const NEEDS = [
  ['script-src', 'https://connect.facebook.net'],
  ['img-src', 'https://www.facebook.com'],
  ['connect-src', 'https://www.facebook.com'],
]
for (const [d, host] of NEEDS) {
  if (!directive(d).includes(host)) {
    fails.push(`vercel.json CSP: ${d} does not admit ${host} — the browser would block the pixel silently.`)
  }
}
if (directive('script-src').includes("'unsafe-inline'")) {
  fails.push(
    "vercel.json CSP: script-src carries 'unsafe-inline' — the pixel is loaded as an " +
      'external script precisely so this never has to happen.',
  )
}

if (fails.length) {
  for (const f of fails) console.error(`check-pixel: FAIL — ${f}`)
  process.exit(1)
}
console.log(`check-pixel: armed (id ending ${id.slice(-4)}), disclosed on /privacy, admitted by the CSP.`)
