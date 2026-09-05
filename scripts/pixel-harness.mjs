import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/* ---------------------------------------------------------------------------
   The pixel harness — "nothing before consent", scored in a real browser.

   Drives headless Chromium through a PRODUCTION build served by
   `npm run preview`, because the door and the setup are gated differently in
   DEV (the door answers only ?consent there, the setup only ?onboard) and it
   is the shipped gating that matters. Build it armed with a throwaway id
   first, so that nothing could be attributed even if one slipped through:

     VITE_META_PIXEL_ID=000000000000000 npm run build && npm run preview

   then `npm run check:pixel` in another terminal.

   Meta is never reached. Every request to a Meta host is intercepted;
   fbevents.js is answered with a stub that does what the real script does on
   arrival — drains the queue, takes over callMethod, sets the _fbp cookie —
   and records every call where the harness can read it. What it does NOT
   prove is that the real fbevents.js beacons go where the CSP admits them:
   that is checked on the live site, once, with the network tab open.

   What it asserts, in order:
     P1  a stranger on the landing: no Meta request, no script, no fbq, no
         cookie, no localStorage at all — the pixel does not exist yet
     P2  GET STARTED, then the door: still nothing (a Lead is being held)
     P3  AGREE & ENTER: the script is fetched ONCE, autoConfig is off, init
         carries the id and nothing else, then PageView and Lead in order —
         every call bare of user data
     P4  waving the setup off: CompleteRegistration, exactly once; a reload
         sends nothing more (no PageView from a boot, no repeat)
     P5  the switch, after that reload: turning "Share usage counts" off
         deletes the cookie the script set, and the device records the switch
     P6  ENTER WITHOUT MEASUREMENT: nothing is ever fetched, the held events
         die with the answer, the app opens all the same, the switch is off
     P7  Global Privacy Control raised: AGREE changes nothing — nothing held,
         nothing fetched, no cookie
     P8  a resident's revisit through ?landing: no PageView, no Lead, and the
         script never loads for a device with nothing to say
     P9  a returning account (the welcome-back stage): PageView and Lead, but
         NO CompleteRegistration — a sign-in on a new device is not a
         registration

   `CHROME_PATH` / `PIXEL_BASE` override the browser and the origin. Exits
   non-zero on failure.
--------------------------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.PIXEL_BASE ?? 'http://localhost:4173'
/** every host Meta's pixel could speak to */
const META = /(^|\.)facebook\.(net|com)$/
const FBEVENTS = 'https://connect.facebook.net/en_US/fbevents.js'

/* the door's current revision, read from the source so a bump cannot leave
   the resident fixture below stamped at a version the door no longer takes */
const TERMS_VERSION = Number(
  readFileSync(join(root, 'src/core/store/shell.ts'), 'utf8').match(/TERMS_VERSION = (\d+)/)?.[1],
)
if (!Number.isFinite(TERMS_VERSION)) throw new Error('pixel-harness: could not read TERMS_VERSION')

let failures = 0
const ok = (m) => console.log(`  ok    ${m}`)
const bad = (m, why) => {
  failures++
  console.log(`  FAIL  ${m}${why ? ` — ${why}` : ''}`)
}
const is = (label, got, want) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? ok(label)
    : bad(label, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)

/* What fbevents.js is answered with. */
const STUB = `(function () {
  var w = window
  w.__fbqCalls = w.__fbqCalls || []
  w.__fbqLoads = (w.__fbqLoads || 0) + 1
  function rec(a) { w.__fbqCalls.push(Array.prototype.slice.call(a)) }
  var q = w.fbq && w.fbq.queue ? w.fbq.queue.slice() : []
  for (var i = 0; i < q.length; i++) rec(q[i])
  if (w.fbq) { w.fbq.queue = []; w.fbq.callMethod = function () { rec(arguments) } }
  document.cookie = '_fbp=fb.1.' + Date.now() + '.1234567890; path=/'
})()`

/** a device that already lives here and has agreed at the current door */
const RESIDENT = JSON.stringify({
  state: {
    skin: 'midnight',
    weekStart: 1,
    onboarded: true,
    panelTips: true,
    wingOrder: [],
    wingsOff: [],
    termsAccepted: TERMS_VERSION,
    termsAcceptedAt: '2026-09-05T10:00:00.000Z',
    telemetryOff: false,
  },
  version: 4,
})

/* ---------------------------------------------------------------- driving */

async function open(browser, init) {
  /* the worker is blocked so that every request the page makes is one the
     harness can see and intercept — Playwright cannot route what a service
     worker fetches on the page's behalf */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.route(
    (url) => META.test(url.hostname),
    (route) => {
      const u = new URL(route.request().url())
      if (u.pathname.endsWith('/fbevents.js')) {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB })
      }
      return route.fulfill({ status: 204, body: '' })
    },
  )
  if (init) await ctx.addInitScript(init.fn, init.arg)
  const page = await ctx.newPage()
  const meta = []
  page.on('request', (r) => {
    try {
      if (META.test(new URL(r.url()).hostname)) meta.push(r.url())
    } catch {
      /* data: and blob: URLs have no hostname */
    }
  })
  return { ctx, page, meta }
}

const probe = (page) =>
  page.evaluate(() => ({
    fbq: typeof window.fbq,
    scripts: Array.from(document.scripts)
      .map((s) => s.src)
      .filter((s) => /facebook/.test(s)),
    cookie: document.cookie,
    ls: Object.keys(localStorage),
    calls: window.__fbqCalls ?? [],
    loads: window.__fbqLoads ?? 0,
  }))

/** nothing from the pixel, anywhere it could leave a trace */
function silent(label, p, meta) {
  const traces = []
  if (meta.length) traces.push(`${meta.length} request(s) to Meta: ${meta.join(', ')}`)
  if (p.fbq !== 'undefined') traces.push(`window.fbq is ${p.fbq}`)
  if (p.scripts.length) traces.push(`script tags: ${p.scripts.join(', ')}`)
  if (/_fb/.test(p.cookie)) traces.push(`cookie: ${p.cookie}`)
  const keys = p.ls.filter((k) => /fb|meta|pixel|ads/i.test(k))
  if (keys.length) traces.push(`localStorage: ${keys.join(', ')}`)
  if (traces.length) bad(label, traces.join('; '))
  else ok(label)
}

const shellState = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('majordomo-shell') ?? 'null')?.state ?? null
    } catch {
      return null
    }
  })

async function landing(page, path = '/') {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
}
const button = (page, name) => page.getByRole('button', { name }).first()
async function pressGetStarted(page) {
  await button(page, /^GET STARTED$/).click()
  await button(page, /^AGREE & ENTER$/).waitFor({ timeout: 20000 })
}
async function waveOff(page) {
  await button(page, /^Not now$/).waitFor({ timeout: 10000 })
  await button(page, /^Not now$/).click()
}
const settle = (page) => page.waitForTimeout(1500)
const calls = (page, n) =>
  page
    .waitForFunction((n) => (window.__fbqCalls ?? []).length >= n, n, { timeout: 8000 })
    .then(
      () => true,
      () => false,
    )
const appOpen = (page) => button(page, /^SETTINGS$/).waitFor({ timeout: 10000 }).then(() => true, () => false)

const browser = await chromium.launch({ executablePath: CHROME })

/* -------------------------------------------------- the stranger's walk */
console.log("\nthe stranger's walk: nothing before the door, everything after it")
{
  const { ctx, page, meta } = await open(browser)
  await landing(page)
  let p = await probe(page)
  silent('P1 the landing loads no pixel, sets no cookie, holds no global', p, meta)
  is('P1 …and localStorage is entirely empty for a stranger', p.ls, [])

  await pressGetStarted(page)
  p = await probe(page)
  silent('P2 GET STARTED and the door: still nothing from Meta', p, meta)

  await button(page, /^AGREE & ENTER$/).click()
  await calls(page, 4)
  p = await probe(page)
  const id = p.calls[1]?.[1]
  is('P3 AGREE loads the script exactly once', p.loads, 1)
  is('P3 …fetched from connect.facebook.net, and nothing else asked of Meta', meta, [FBEVENTS])
  is('P3 …init carries a pixel id and nothing else', [typeof id, p.calls[1]?.length], ['string', 2])
  is(
    'P3 …autoConfig off, then init, then PageView and Lead in that order',
    p.calls,
    [
      ['set', 'autoConfig', false, id],
      ['init', id],
      ['track', 'PageView'],
      ['track', 'Lead'],
    ],
  )

  await waveOff(page)
  await calls(page, 5)
  p = await probe(page)
  is('P4 waving the setup off sends CompleteRegistration, once', p.calls.slice(4), [['track', 'CompleteRegistration']])
  is(
    'P4 …every call bare of user data',
    p.calls.every((c) => c.length === 2 || (c[0] === 'set' && c[1] === 'autoConfig')),
    true,
  )
  const before = meta.length
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  p = await probe(page)
  is('P4 …and a reload of the app sends nothing more', [p.calls, meta.length - before], [[], 0])
  is('P4 …while the cookie the script set is still there', /_fbp=/.test(p.cookie), true)

  /* the switch, in a document that has loaded nothing itself */
  await button(page, /^SETTINGS$/).click()
  const sw = page.getByRole('switch', { name: /Share usage counts/ }).first()
  await sw.waitFor({ timeout: 10000 })
  is('P5 the switch reads ON after AGREE', await sw.getAttribute('aria-checked'), 'true')
  await sw.click()
  await settle(page)
  p = await probe(page)
  const s = await shellState(page)
  is('P5 …turning it off deletes the cookie the pixel set', /_fbp=/.test(p.cookie), false)
  is('P5 …and the device records the switch', s?.telemetryOff, true)
  is('P5 …with nothing asked of Meta since', meta.length - before, 0)
  await ctx.close()
}

/* ---------------------------------------------------- the other answer */
console.log('\nthe other answer: ENTER WITHOUT MEASUREMENT')
{
  const { ctx, page, meta } = await open(browser)
  await landing(page)
  await pressGetStarted(page)
  await button(page, /^ENTER WITHOUT MEASUREMENT$/).click()
  await waveOff(page)
  const inside = await appOpen(page)
  await settle(page)
  const p = await probe(page)
  const s = await shellState(page)
  silent('P6 declining sends nothing, ever — the held PageView and Lead die with the answer', p, meta)
  is('P6 …the setup still ran and the app is open', inside, true)
  is('P6 …the door is answered at the current version with the switch off', [s?.termsAccepted, s?.telemetryOff], [TERMS_VERSION, true])
  await ctx.close()
}

/* ----------------------------------------------- Global Privacy Control */
console.log('\nGlobal Privacy Control raised')
{
  const { ctx, page, meta } = await open(browser, {
    fn: () => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }),
  })
  await landing(page)
  await pressGetStarted(page)
  await button(page, /^AGREE & ENTER$/).click()
  await waveOff(page)
  await appOpen(page)
  await settle(page)
  const p = await probe(page)
  silent('P7 with the signal raised, AGREE and the setup send nothing and set nothing', p, meta)
  await ctx.close()
}

/* -------------------------------------------------- the resident's revisit */
console.log("\nthe resident's revisit")
{
  const { ctx, page, meta } = await open(browser, {
    fn: (blob) => {
      if (!localStorage.getItem('majordomo-shell')) localStorage.setItem('majordomo-shell', blob)
    },
    arg: RESIDENT,
  })
  await landing(page, '/?landing')
  await button(page, /^BACK TO THE ESTATE$/).waitFor({ timeout: 10000 })
  await settle(page)
  let p = await probe(page)
  silent('P8 the landing, revisited, queues no PageView and loads nothing', p, meta)
  await button(page, /^BACK TO THE ESTATE$/).click()
  await appOpen(page)
  await settle(page)
  p = await probe(page)
  silent('P8 …and BACK TO THE ESTATE is not a Lead: the script never loads for a device with nothing to say', p, meta)
  await ctx.close()
}

/* --------------------------------------------------- the returning account */
console.log('\nthe returning account (welcome-back stage)')
{
  const { ctx, page, meta } = await open(browser, {
    fn: () => sessionStorage.setItem('majordomo-onboard', JSON.stringify({ v: 2, stage: 'welcomeBack', composition: null })),
  })
  await landing(page)
  await pressGetStarted(page)
  await button(page, /^AGREE & ENTER$/).click()
  await calls(page, 4)
  await button(page, /^TO THE MANOR$/).waitFor({ timeout: 10000 })
  await button(page, /^TO THE MANOR$/).click()
  await appOpen(page)
  await settle(page)
  const p = await probe(page)
  is(
    'P9 a returning account sends PageView and Lead but NO CompleteRegistration',
    p.calls.map((c) => c[1]),
    ['autoConfig', p.calls[1]?.[1], 'PageView', 'Lead'],
  )
  is('P9 …with one script fetch and nothing else asked of Meta', meta, [FBEVENTS])
  await ctx.close()
}

await browser.close()
console.log(failures ? `\n${failures} failure(s)\n` : '\nthe pixel keeps its word\n')
process.exit(failures ? 1 : 0)
