/**
 * Renders `scripts/og-card.html` into `public/og.png` — the 1200×630 image every
 * link preview of majordomocal.com shows.
 *
 *     node scripts/og-render.mjs
 *
 * Run it whenever the card changes. It is NOT part of `npm run build`: the card
 * changes about once a year, the build runs a hundred times a day, and a build
 * step that needs a browser binary is a build that breaks on a machine which had
 * no reason to have one.
 *
 * Browser: CHROME_PATH if set, otherwise the first installed Chrome/Chromium
 * this script can find — the same arrangement as `scripts/manor-harness.mjs`,
 * for the same reason (Playwright's own browsers were never downloaded here).
 *
 * The fonts are the app's self-hosted @fontsource files, substituted into the
 * template as absolute `file://` URLs. A card that quietly fell back to Arial
 * would still render, still be 1200×630, and still be wrong on every share.
 */

import { chromium } from 'playwright-core'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const TEMPLATE = join(HERE, 'og-card.html')
const OUT = join(ROOT, 'public', 'og.png')
/** the substituted copy the browser actually loads; removed on the way out */
const STAGED = join(HERE, '.og-card.staged.html')

const FONTS = {
  __BIG_SHOULDERS__: join(
    ROOT,
    'node_modules/@fontsource/big-shoulders/files/big-shoulders-latin-700-normal.woff2',
  ),
  __SOURCE_SANS__: join(
    ROOT,
    'node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2',
  ),
}

/** first Chromium we can actually find; undefined = let Playwright resolve it */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  return candidates.find((p) => existsSync(p))
}

let html = readFileSync(TEMPLATE, 'utf8')
for (const [token, file] of Object.entries(FONTS)) {
  if (!existsSync(file)) {
    console.error(`Missing font: ${file}`)
    console.error('Run `npm install` and try again.')
    process.exit(2)
  }
  html = html.replaceAll(token, pathToFileURL(file).href)
}
writeFileSync(STAGED, html)

let browser
try {
  browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  })
} catch (e) {
  unlinkSync(STAGED)
  console.error(`Could not launch Chromium: ${String(e).split('\n')[0]}`)
  console.error('Set CHROME_PATH to a Chrome/Chromium binary and try again.')
  process.exit(2)
}

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    // 1× on purpose. Every consumer of an OG image resamples it down to a card
    // a few hundred pixels wide; a 2× render buys nothing but weight, and the
    // platforms that cap image size at 1 MB are the ones that matter.
    deviceScaleFactor: 1,
  })
  await page.goto(pathToFileURL(STAGED).href, { waitUntil: 'load' })
  // A screenshot taken before the webfonts are decoded is a screenshot of the
  // fallback — the one failure that looks like success.
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: OUT, type: 'png' })
  console.log(`Wrote ${OUT} (1200×630)`)
} finally {
  await browser.close()
  unlinkSync(STAGED)
}
