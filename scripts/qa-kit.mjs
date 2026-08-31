/**
 * QA driver kit — a thin shared harness for hands-on flow QA.
 *
 * Not a test runner. This exists so a QA pass can DRIVE the real app in a real
 * browser (the repo's rule: verification happens in the browser) without every
 * probe re-deriving the boot gate, the store handles and the viewport setup.
 *
 * Usage:
 *   import { open, close, storeDump, clickText, shot } from './qa-kit.mjs'
 *   const s = await open({ demo: true })
 *   ...
 *   await close(s)
 *
 * Env: CHROME_PATH, QA_BASE (default http://localhost:5173), QA_TZ.
 */
import { chromium } from 'playwright-core'

const EXEC = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.QA_BASE || 'http://localhost:5173'
const TZ = process.env.QA_TZ || 'Asia/Jerusalem'

export const DESKTOP = { width: 1440, height: 900 }
export const MOBILE = { width: 390, height: 844 }

let browser = null
export async function getBrowser() {
  if (!browser) browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
  return browser
}

/**
 * Open a fresh, isolated estate.
 *  opts.demo    — seed the ?demo fixtures
 *  opts.params  — extra query string, e.g. 'console=capital'
 *  opts.mobile  — mobile viewport
 *  opts.seed    — fn(localStorage-ish) run as an init script before boot
 *  opts.fresh   — true = do NOT set the harness sentinel (you'll get the landing)
 */
export async function open(opts = {}) {
  const b = await getBrowser()
  const ctx = await b.newContext({
    viewport: opts.mobile ? MOBILE : DESKTOP,
    deviceScaleFactor: 1,
    timezoneId: opts.tz || TZ,
    hasTouch: !!opts.mobile,
    isMobile: !!opts.mobile,
  })
  if (!opts.fresh) await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
  if (opts.seed) await ctx.addInitScript(opts.seed)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const qs = [opts.demo ? 'demo' : null, opts.params || null].filter(Boolean).join('&')
  await page.goto(`${BASE}/${qs ? '?' + qs : ''}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(opts.settle ?? 800)
  return { ctx, page, errors }
}

export async function close(s) {
  try { await s.ctx.close() } catch { /* already gone */ }
}
export async function shutdown() {
  if (browser) { await browser.close(); browser = null }
}

/** every store, as plain JSON — the fastest way to see what a flow actually wrote */
export const storeDump = (page) =>
  page.evaluate(() => {
    const g = (h) => { try { return h?.getState?.() ?? null } catch { return null } }
    const ev = g(window.__events)
    return {
      events: ev ? ev.events.map((e) => ({
        id: e.id, title: e.title, kind: e.kind, allDay: !!e.allDay, source: e.source,
        sourceRef: e.sourceRef, start: e.start, end: e.end,
        hours: e.allDay ? null : (new Date(e.end) - new Date(e.start)) / 3600000,
      })) : null,
      training: g(window.__store),
      capital: g(window.__capital),
      study: g(window.__study),
      workshop: g(window.__workshop),
      watch: g(window.__watch),
      sleep: g(window.__sleep),
      localKeys: Object.keys(localStorage).filter((k) => /majordomo|batman/.test(k)),
    }
  })

/** raw localStorage blob for one key */
export const lsGet = (page, key) => page.evaluate((k) => localStorage.getItem(k), key)

/** what a human sees, roughly */
export const screenText = (page) => page.evaluate(() => document.body.innerText)

/** click the first visible element whose text matches (string = exact-ish, regex = test) */
export async function clickText(page, text, opts = {}) {
  const loc = page.getByText(text, { exact: opts.exact ?? false }).filter({ visible: true }).nth(opts.nth ?? 0)
  if ((await loc.count()) === 0) return false
  await loc.click({ timeout: opts.timeout ?? 4000 }).catch(() => {})
  await page.waitForTimeout(opts.wait ?? 350)
  return true
}

/** every clickable thing on screen, with its label — the map of a screen's affordances */
export const affordances = (page) =>
  page.evaluate(() => {
    const out = []
    const sel = 'button,[role=button],a,input,select,textarea,[data-event-block],[tabindex]'
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || undefined,
        label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 60),
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      })
    }
    return out
  })

/** tap-target audit: interactive things under 44px in either axis */
export const smallTargets = async (page) =>
  (await affordances(page)).filter((a) => (a.box.w < 44 || a.box.h < 44) && !a.disabled)

export async function shot(page, path) {
  await page.screenshot({ path, fullPage: false })
  return path
}

/** drive an event block by title */
export const blockBox = async (page, title, nth = 0) => {
  const el = page.locator('[data-event-block]', { hasText: title }).nth(nth)
  if ((await el.count()) === 0) return null
  return el.boundingBox()
}

/** navigate to a wing by its tab label (desktop header or mobile TabBar) */
export async function openWing(page, label) {
  const ok = await clickText(page, label, { wait: 700 })
  if (!ok) return false
  return true
}
