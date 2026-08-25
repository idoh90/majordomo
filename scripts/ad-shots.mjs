#!/usr/bin/env node
/**
 * The ad-shot harness — marketing/screenshot capture, not a test.
 *
 * Drives a real headless Chromium against the running dev server, on the
 * ?demo fixture, and saves raw PNGs of the actual app. No painting, no
 * upscaling, no restyling — every frame is a genuine screenshot (or a plain
 * pixel-rect crop of one) of what a browser would show.
 *
 * Every frame:
 *   - forces the Midnight skin (?skin=midnight) unless overridden
 *   - opens THE MANOR in week view, committed (never touches WHAT-IF)
 *   - seeds the ?demo fixture — fixture data only, nothing personal
 *   - settles the briefing's typewriter (presses SKIP) before shooting
 *   - moves the mouse off-canvas first, so no cursor lands in the PNG
 *   - screenshots the raw viewport (or a plain pixel clip of it) — headless
 *     Chromium draws no OS/browser chrome to begin with
 *
 * THE PACKED DAY (the house's own showcase day): the ?demo fixture
 * (src/core/events/store.ts) seeds a Mon-start week where Wednesday
 * (column index 2) carries the tail of Tuesday's 19:00→08:00 Night Watch,
 * Sleep pencilled right after, a training block, and a study block — the
 * one day dense enough to read as "a calendar that survives a brutal week."
 * That index is fixed by the fixture, not by whatever day this script runs
 * on — see PACKED_DAY_COL below.
 *
 * Usage (needs `npm run dev` up):
 *   node scripts/ad-shots.mjs --list
 *   node scripts/ad-shots.mjs desktop-week-full
 *   node scripts/ad-shots.mjs desktop-week-packed-day
 *   node scripts/ad-shots.mjs mobile-week-packed-day
 *   node scripts/ad-shots.mjs --all
 *
 * Flags: --out=<path>  (default: ads/screenshots/<frame-id>.png)
 *        --skin=<id>   (default: midnight)
 *        --base=<url>  (default: $MANOR_BASE or http://localhost:5173)
 * Browser: $CHROME_PATH overrides auto-detection.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.MANOR_BASE || 'http://localhost:5173'

/** Wednesday in the ?demo fixture's Mon-start week — see the file header. */
const PACKED_DAY_COL = 2
/** Mon..Thu — enough neighbours that the packed day reads in context. */
const CONTEXT_COLS = 4

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  return candidates.find((p) => existsSync(p))
}

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (const a of argv) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/)
    if (m) flags[m[1]] = m[2] ?? true
    else positional.push(a)
  }
  return { flags, positional }
}

/** open the Manor on the ?demo fixture, committed week view, brief settled */
async function openManor(page, { skin }) {
  await page.goto(`${BASE}/?demo&skin=${skin}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.evaluate(async () => {
    const skip = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'SKIP')
    if (skip) skip.click()
    await new Promise((r) => setTimeout(r, 300))
  })
}

/** desktop grid geometry + the sidebar's left edge, so crops stay accurate
    if spacing or copy ever shifts — never hand-tuned pixel constants */
async function desktopLayout(page) {
  return page.evaluate(() => {
    const gridEl = [...document.querySelectorAll('div')].find(
      (d) => d.className.includes('overflow-hidden') && d.className.includes('rounded-xl'),
    )
    const grid = gridEl.getBoundingClientRect()
    const house = [...document.querySelectorAll('*')].find((el) => el.textContent?.trim() === 'THE HOUSE')
    let sidebarLeft = null
    let el = house
    while (el && el.parentElement) {
      const r = el.getBoundingClientRect()
      if (r.width > 250) {
        sidebarLeft = r.x
        break
      }
      el = el.parentElement
    }
    return {
      grid: { x: grid.x, y: grid.y, w: grid.width, h: grid.height },
      sidebarLeft,
    }
  })
}

const FRAMES = {
  'desktop-week-full': {
    label: 'Desktop — full committed week, sidebar (and its ₪ figures) excluded',
    async shoot(browser, { skin, out }) {
      const ctx = await browser.newContext({
        viewport: { width: 1680, height: 1000 },
        deviceScaleFactor: 2,
        timezoneId: 'Asia/Jerusalem',
      })
      await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
      const page = await ctx.newPage()
      await openManor(page, { skin })
      const { grid, sidebarLeft } = await desktopLayout(page)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(150)
      const width = Math.round((sidebarLeft ?? 1680) - 8)
      const height = Math.round(grid.y + grid.h + 25)
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } })
      await ctx.close()
    },
  },

  'desktop-week-packed-day': {
    label: 'Desktop — zoomed to Mon–Thu, the packed day (Wed) as the hero',
    async shoot(browser, { skin, out }) {
      const ctx = await browser.newContext({
        viewport: { width: 1680, height: 1000 },
        deviceScaleFactor: 2,
        timezoneId: 'Asia/Jerusalem',
      })
      await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
      const page = await ctx.newPage()
      await openManor(page, { skin })
      const { grid } = await desktopLayout(page)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(150)
      const colW = grid.w / 7
      const width = Math.round(grid.x + colW * CONTEXT_COLS + 5)
      const height = Math.round(grid.y + grid.h + 25)
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } })
      await ctx.close()
    },
  },

  'mobile-week-packed-day': {
    label: 'Mobile (iPhone 14 logical, @2x) — paged to the packed day (Wed)',
    async shoot(browser, { skin, out }) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        timezoneId: 'Asia/Jerusalem',
      })
      await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
      const page = await ctx.newPage()
      await openManor(page, { skin })
      // 7 day chips, in fixture column order — nth(PACKED_DAY_COL) is Wednesday
      const chips = page.locator('button', { hasText: /^[A-Z]\s*\d{1,2}$/ })
      if ((await chips.count()) >= 7) {
        await chips.nth(PACKED_DAY_COL).click()
        await page.waitForTimeout(600) // smooth-scroll settle
      }
      // NEVER use { fullPage: true } here — Playwright's full-page capture
      // resizes the viewport mid-shot, and that resize races the mobile
      // week's column math into reading .day off an undefined column,
      // which trips the app's storage-shape guard ("The estate did not
      // open") even though nothing is actually wrong with the data. Scroll
      // the ordinary page instead, to the block range worth showing, and
      // shoot the fixed viewport.
      const range = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll('[data-event-block]')].filter((b) => {
          const r = b.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        const want = blocks.filter((b) => /Sleep|Strength|Physics|Study|Academic/.test(b.textContent ?? ''))
        const pool = want.length ? want : blocks
        const tops = pool.map((b) => b.getBoundingClientRect().top + window.scrollY)
        const bottoms = pool.map((b) => b.getBoundingClientRect().bottom + window.scrollY)
        return { top: Math.min(...tops), bottom: Math.max(...bottoms) }
      })
      const viewportH = 844
      const mid = (range.top + range.bottom) / 2
      const scrollY = Math.max(0, Math.round(mid - viewportH / 2))
      await page.evaluate((y) => window.scrollTo(0, y), scrollY)
      await page.waitForTimeout(200)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(150)
      await page.screenshot({ path: out })
      await ctx.close()
    },
  },

  'mobile-week-today': {
    label: 'Mobile (iPhone 14 logical, @2x) — opens on today, no paging',
    async shoot(browser, { skin, out }) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        timezoneId: 'Asia/Jerusalem',
      })
      await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
      const page = await ctx.newPage()
      await openManor(page, { skin })
      await page.mouse.move(0, 0)
      await page.waitForTimeout(150)
      // no fullPage here either — see the note in mobile-week-packed-day
      await page.screenshot({ path: out })
      await ctx.close()
    },
  },
}

/* -------------------------------------------------------------------- run */

const { flags, positional } = parseArgs(process.argv.slice(2))

if (flags.list || (positional.length === 0 && !flags.all)) {
  console.log('AD FRAMES:\n')
  for (const [id, f] of Object.entries(FRAMES)) console.log(`  ${id}\n    ${f.label}`)
  console.log('\nUsage: node scripts/ad-shots.mjs <frame-id> [--out=path] [--skin=midnight] [--all]')
  process.exit(0)
}

try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch {
  console.error(`No app at ${BASE} — start it with \`npm run dev\` first.`)
  process.exit(2)
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})

const skin = flags.skin || 'midnight'
const targets = flags.all ? Object.keys(FRAMES) : positional

for (const id of targets) {
  const frame = FRAMES[id]
  if (!frame) {
    console.error(`Unknown frame "${id}". Run with --list to see the sheet.`)
    continue
  }
  const out = flags.out && targets.length === 1 ? flags.out : `ads/screenshots/${id}.png`
  mkdirSync(dirname(out), { recursive: true })
  await frame.shoot(browser, { skin, out })
  console.log(`saved ${id} -> ${out}`)
}

await browser.close()
