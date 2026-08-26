#!/usr/bin/env node
/**
 * Brand gate: a commercial build must contain no Batman-era branding.
 *
 * Usage (bash):  VITE_FOUNDER_SKIN=0 npm run build && node scripts/check-brand.mjs
 * (The env override beats .env.local, which sets the founder flag on the
 * founder's machine. CI or a clean checkout can just `npm run build`.)
 *
 * Allowed exceptions — invisible wire-compat constants, not branding:
 *   - the pre-pivot export tag  'batman-workouts'  (old backup files import forever)
 *   - the pre-pivot storage keys 'batman-shell' / 'batman-capital'
 *     (adopted verbatim on first boot after the key rename)
 * Anything else matching the banned list fails the build gate.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/* Wired into `npm run build` now, which runs on the founder machine too —
   where .env.local sets the flag and the founder bundle's strings are IN dist
   on purpose. Skip loudly there; Vercel never sets the flag, so every
   production build stays gated. */
if (process.env.VITE_FOUNDER_SKIN === '1') {
  console.log('check-brand: SKIPPED — VITE_FOUNDER_SKIN=1 (founder build; not a shippable bundle).')
  process.exit(0)
}

const DIST = join(process.cwd(), 'dist')
const ALLOWED = ['batman-workouts', 'batman-shell', 'batman-capital']
const BANNED = /batman|gotham|wayne|batcomputer|dark\s*knight/gi

const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|css|html|webmanifest|svg|json|txt)$/i.test(name)) files.push(p)
  }
})(DIST)

let bad = 0
for (const file of files) {
  let text = readFileSync(file, 'utf8')
  for (const allowed of ALLOWED) text = text.replaceAll(allowed, '')
  const hits = text.match(BANNED)
  if (hits) {
    bad += hits.length
    const kinds = [...new Set(hits.map((h) => h.toLowerCase()))].join(', ')
    console.error(`x ${file}: ${kinds} (${hits.length})`)
  }
}

if (bad) {
  console.error(`\ncheck-brand: ${bad} banned brand string(s) in dist/ — the founder bundle leaked.`)
  process.exit(1)
}
console.log(`check-brand: clean — ${files.length} files, nothing outside the legacy wire keys.`)
