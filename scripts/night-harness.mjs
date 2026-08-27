/**
 * THE NIGHT harness — the sleep system's numeric contract, driven through a
 * real browser against the running dev server.
 *
 *   npm run dev            (in another terminal — this drives it, it does not start it)
 *   npm run check:night
 *
 * It exists for the same reason the Manor's does. Sleep is the one part of
 * this estate where every visible figure is a derivation two or three steps
 * from what was typed — a night belongs to the morning it ENDED on, a missing
 * night is a gap and never a zero, a pencilled block is a plan and never a
 * record, and a scalar the reader cannot see moves every muscle on the body
 * map. All four of those are wrong in ways that still look completely
 * plausible on screen, which is precisely what "verify in the browser" cannot
 * catch. So they are asserted as numbers.
 *
 * HONEST LIMITS — do not read a green run as full coverage:
 *   · The morning offer is checked against a clock pinned by TIMEZONE, so it
 *     proves the window logic, not every hour of the day.
 *   · No DST coverage, exactly as the Manor harness has none.
 *   · The native <input type="time"> is driven by value, not by the OS wheel.
 */
import { chromium } from 'playwright-core'

const EXEC = process.env.CHROME_PATH || undefined
const BASE = process.env.NIGHT_BASE || process.env.MANOR_BASE || 'http://localhost:5173'
/** pinned so "now" lands mid-morning: the offer's window is 04:00–22:00 */
const TZ = process.env.NIGHT_TZ || 'Asia/Tokyo'

const results = []
const ok = (name, detail = '') => results.push({ pass: true, name, detail })
const bad = (name, detail = '') => results.push({ pass: false, name, detail })
const near = (a, b, tol) => Math.abs(a - b) <= tol
const is = (name, got, want, tol = 0.001) =>
  near(got, want, tol) ? ok(name, `${got}`) : bad(name, `got ${got}, wanted ${want}`)

async function fresh(browser, { width = 1440, height = 1100 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    timezoneId: TZ,
  })
  // the boot gate shows the LANDING to a browser with no majordomo* key; one
  // sentinel flips it without touching any store's persisted blob
  await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${BASE}/?demo`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  return { ctx, page, errors }
}

/* --------------------------------------------------------------- the model */

async function model(page) {
  /* Every case is built from an events array handed straight to the pure
     functions — no store, no React, no fixture drift. */
  const r = await page.evaluate(() => {
    const N = window.__night
    if (!N) return { missing: true }
    const iso = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm).toISOString()
    const ev = (id, sIso, eIso, extra = {}) => ({
      id,
      source: 'manual',
      kind: 'sleep',
      title: 'Sleep',
      start: sIso,
      end: eIso,
      updatedAt: sIso,
      ...extra,
    })
    // Wed 10 Jun 2026 is the anchor "today"; nights are named by the morning
    const now = new Date(2026, 5, 10, 12, 0).getTime()
    const out = {}

    /* --- attribution: two very different shapes, one morning each --- */
    const crossing = ev('a', iso(2026, 6, 9, 23, 30), iso(2026, 6, 10, 7, 10))
    const daytime = ev('b', iso(2026, 6, 8, 9, 0), iso(2026, 6, 8, 15, 0))
    const rows = N.nightsIn(
      [crossing, daytime],
      {},
      new Date(2026, 5, 1),
      new Date(2026, 5, 11),
    )
    out.rowCount = rows.length
    out.crossKey = rows.find((x) => x.eventId === 'a')?.dayKey
    out.crossHours = rows.find((x) => x.eventId === 'a')?.hours
    out.dayKey = rows.find((x) => x.eventId === 'b')?.dayKey
    out.dayHours = rows.find((x) => x.eventId === 'b')?.hours

    /* --- time awake comes off the hours --- */
    const awake = N.nightsIn([crossing], { a: { awakeMin: 40, loggedAt: '' } }, new Date(2026, 5, 1), new Date(2026, 5, 11))
    out.awakeHours = awake[0].hours
    out.awakeInBed = awake[0].inBedH

    /* --- a pencilled block is not a record --- */
    const pencil = ev('p', iso(2026, 6, 7, 9, 0), iso(2026, 6, 7, 15, 0), { source: 'watch' })
    out.pencilIsRecord = N.isNightRecord(pencil)
    out.pencilIsPencil = N.isPencilledNight(pencil)
    const confirmed = { ...pencil, sourceRef: N.sleptRef('2026-06-07') }
    out.confirmedIsRecord = N.isNightRecord(confirmed)

    /* --- a missing night is a GAP, never a zero --- */
    const series = N.nightlySeries([crossing, daytime], {}, now, 5)
    out.seriesLen = series.length
    out.gaps = series.filter((p) => !p.has).length
    out.hasSum = series.reduce((t, p) => t + (p.has ? 1 : 0), 0)

    /* --- debt counts only the nights on file, and credits at half --- */
    // three nights: 6 h (2 short), 10 h (2 over → 1 credit), 8 h (level)
    const three = [
      ev('d1', iso(2026, 6, 7, 23, 0), iso(2026, 6, 8, 5, 0)),
      ev('d2', iso(2026, 6, 8, 22, 0), iso(2026, 6, 9, 8, 0)),
      ev('d3', iso(2026, 6, 9, 23, 0), iso(2026, 6, 10, 7, 0)),
    ]
    out.debt = N.sleepStats(three, {}, now, 8, 14).debtH
    // the same three nights inside a fourteen-night window: the eleven with
    // nothing on file must contribute NOTHING
    out.debtCovered = N.sleepStats(three, {}, now, 8, 14).covered

    /* --- the recovery gate --- */
    const short = []
    for (let i = 0; i < 7; i++) {
      short.push(ev(`s${i}`, iso(2026, 6, 3 + i, 23, 30), iso(2026, 6, 4 + i, 5, 30)))
    }
    const shortStats = N.sleepStats(short, {}, now, 8, 14)
    out.shortAvg = shortStats.avg7H
    out.effOn = N.recoveryEffect(shortStats, true).scale
    out.effOff = N.recoveryEffect(shortStats, false).scale
    out.effApplied = N.recoveryEffect(shortStats, true).applied
    // three nights is under the gate: exactly neutral, and it says so
    const thin = N.sleepStats(short.slice(0, 3), {}, now, 8, 14)
    out.thinScale = N.recoveryEffect(thin, true).scale
    out.thinApplied = N.recoveryEffect(thin, true).applied
    // a wildly short week is capped rather than unbounded
    const wrecked = short.map((e, i) => ev(`w${i}`, e.start, new Date(new Date(e.start).getTime() + 3 * 3600000).toISOString()))
    out.cappedScale = N.recoveryEffect(N.sleepStats(wrecked, {}, now, 8, 14), true).scale
    // …and a long week quickens it, also capped
    const rested = short.map((e, i) => ev(`r${i}`, e.start, new Date(new Date(e.start).getTime() + 12 * 3600000).toISOString()))
    out.restedScale = N.recoveryEffect(N.sleepStats(rested, {}, now, 8, 14), true).scale

    /* --- no target means no score kept --- */
    out.noTargetDebt = N.sleepStats(three, {}, now, 0, 14).debtH
    return out
  })

  if (r.missing) return bad('N0 the model is reachable', 'window.__night missing')
  ok('N0 the model is reachable')

  is('N1 a night is filed under the morning it ended on', r.crossKey === '2026-06-10' ? 1 : 0, 1)
  is('N1 …and reads its true length', r.crossHours, 7.6667, 0.01)
  is('N2 a daytime sleep files under its own day', r.dayKey === '2026-06-08' ? 1 : 0, 1)
  is('N2 …and reads six hours', r.dayHours, 6)
  is('N3 time awake comes off the hours', r.awakeHours, 7.0, 0.01)
  is('N3 …and time in bed keeps them', r.awakeInBed, 7.6667, 0.01)

  r.pencilIsRecord === false && r.pencilIsPencil === true
    ? ok('N4 a pencilled block is a plan, not a record')
    : bad('N4 a pencilled block is a plan, not a record', `record=${r.pencilIsRecord} pencil=${r.pencilIsPencil}`)
  r.confirmedIsRecord
    ? ok('N4 …and the slept: ref turns it into one')
    : bad('N4 …and the slept: ref turns it into one', 'still not a record')

  is('N5 a missing night is a gap, not a zero', r.gaps, 3)
  is('N5 …and the nights on file are counted', r.hasSum, 2)

  // 2 short + 0 level − 1 credit (half of 2 over) = 1 hour owed
  is('N6 debt adds shortfalls and credits surpluses at half', r.debt, 1)
  is('N6 …over only the nights on file', r.debtCovered, 3)
  is('N6 no target, no score kept', r.noTargetDebt, 0)

  is('N7 six-hour weeks average six hours', r.shortAvg, 6)
  // 2 h/night short × 0.05 = +10 % — slower, never faster
  is('N7 a short week slows the recovery clock', r.effOn, 1.1, 0.001)
  r.effApplied ? ok('N7 …and says it applied') : bad('N7 …and says it applied', 'applied=false')
  is('N8 the switch off is EXACTLY neutral', r.effOff, 1)
  is('N8 too few nights is EXACTLY neutral', r.thinScale, 1)
  r.thinApplied === false
    ? ok('N8 …and says why rather than pretending')
    : bad('N8 …and says why rather than pretending', 'applied=true under the gate')
  r.cappedScale <= 1.2001 && r.cappedScale > 1.1
    ? ok('N9 a wrecked week is capped', `${r.cappedScale}`)
    : bad('N9 a wrecked week is capped', `${r.cappedScale}`)
  r.restedScale >= 0.88 && r.restedScale < 1
    ? ok('N9 a long week quickens it, also capped', `${r.restedScale}`)
    : bad('N9 a long week quickens it, also capped', `${r.restedScale}`)
}

/* ------------------------------------------------------- the writing path */

async function writing(page) {
  // clear the demo's own nights so the morning is genuinely unwritten
  await page.evaluate(() => {
    const s = window.__events.getState()
    s.replaceAll(s.events.filter((e) => e.kind !== 'sleep'))
    window.__sleep.setState({ notes: {}, askedOn: null })
  })
  await page.waitForTimeout(400)

  /* --- the morning offer --- */
  const offer = page.getByRole('button', { name: /WRITE IT DOWN/i }).first()
  ;(await offer.count())
    ? ok('W1 an unwritten morning is offered')
    : bad('W1 an unwritten morning is offered', 'no offer above the week')
  if (!(await offer.count())) return

  await offer.click()
  await page.waitForTimeout(500)
  const sheetOpen = await page.evaluate(() => /THE MORNING OF/i.test(document.body.innerText))
  sheetOpen ? ok('W2 the offer opens the sheet') : bad('W2 the offer opens the sheet')
  if (!sheetOpen) return

  /* --- two clocks, one night --- */
  const setTime = async (label, value) => {
    const f = page.getByLabel(label, { exact: true })
    await f.fill(value)
    await page.waitForTimeout(150)
  }
  await setTime('DOWN AT', '23:30')
  await setTime('UP AT', '07:10')
  await page.waitForTimeout(300)

  const shown = await page.evaluate(() => document.body.innerText)
  const arithmetic = /7\s*h\s*40\s*m/.test(shown)
  const restated = /23:30\s*→\s*07:10/.test(shown)
  arithmetic
    ? ok('W3 the sheet does the arithmetic', '23:30 → 07:10 = 7 h 40 m')
    : bad('W3 the sheet does the arithmetic', 'no 7 h 40 m on screen')
  restated
    ? ok('W3 …and restates the pair in 24-hour')
    : bad('W3 …and restates the pair in 24-hour', 'no 24-hour pair on screen')

  await page.getByRole('button', { name: /^WRITE IT DOWN$/ }).last().click()
  await page.waitForTimeout(600)

  const written = await page.evaluate(() => {
    const evs = window.__events.getState().events.filter((e) => e.kind === 'sleep')
    if (evs.length !== 1) return { count: evs.length }
    const e = evs[0]
    const s = new Date(e.start)
    const t = new Date(e.end)
    return {
      count: 1,
      ref: e.sourceRef || '',
      hours: (t - s) / 3600000,
      bed: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
      wake: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      /** the bedtime landed on the day BEFORE the morning, derived not asked */
      crossed: s.getDate() !== t.getDate(),
    }
  })
  is('W4 exactly one night is written', written.count, 1)
  if (written.count === 1) {
    is('W4 …of the length the sheet showed', written.hours, 7.6667, 0.01)
    written.bed === '23:30' && written.wake === '07:10'
      ? ok('W4 …at the clock times typed', `${written.bed} → ${written.wake}`)
      : bad('W4 …at the clock times typed', `${written.bed} → ${written.wake}`)
    written.crossed
      ? ok('W5 the bedtime day is derived, and it crossed midnight')
      : bad('W5 the bedtime day is derived, and it crossed midnight', 'landed on one day')
    written.ref.startsWith('slept:')
      ? ok('W6 it is marked a record, not a pencil', written.ref)
      : bad('W6 it is marked a record, not a pencil', `ref="${written.ref}"`)
  }

  const gone = await page.evaluate(() => !/Last night is not written down/i.test(document.body.innerText))
  gone
    ? ok('W7 the offer stops once the morning is written')
    : bad('W7 the offer stops once the morning is written', 'still asking')

  /* --- two identical clocks are not a night ---
     The bedtime's DAY is derived from the pair, so equal times resolve to
     "the day before" and the arithmetic cheerfully answers twenty-four hours
     — a nonsense record, saveable in one press, occupying a whole day on the
     week. It has to be refused rather than merely warned about. */
  await page.getByRole('button', { name: /^NIGHT$/ }).first().click()
  await page.waitForTimeout(500)
  await page.getByLabel('DOWN AT', { exact: true }).fill('07:00')
  await page.getByLabel('UP AT', { exact: true }).fill('07:00')
  await page.waitForTimeout(350)
  const equal = await page.evaluate(() => document.body.innerText)
  const noFigure = !/24 h/.test(equal)
  const disabled = await page
    .getByRole('button', { name: /^WRITE IT DOWN$/ })
    .last()
    .isDisabled()
    .catch(() => false)
  noFigure
    ? ok('W8 equal clocks print no duration')
    : bad('W8 equal clocks print no duration', 'a 24 h night is on screen')
  disabled
    ? ok('W8 …and cannot be written down')
    : bad('W8 …and cannot be written down', 'save is live')
}

/* --------------------------------------------------- pencil → confirmation */

async function pencil(page) {
  await page.evaluate(() => {
    const s = window.__events.getState()
    const today = new Date()
    const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString()
    s.replaceAll([
      ...s.events.filter((e) => e.kind !== 'sleep'),
      {
        id: 'pencil-test',
        source: 'watch',
        kind: 'sleep',
        title: 'Sleep',
        start: at(today, 9, 0),
        end: at(today, 15, 0),
        updatedAt: new Date().toISOString(),
      },
    ])
    window.__sleep.setState({ notes: {}, askedOn: null })
  })
  await page.waitForTimeout(500)

  const hatched = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-event-block]')].find((n) =>
      /Sleep/.test(n.textContent || ''),
    )
    return b ? b.className.includes('booked-hatch') : null
  })
  hatched === true
    ? ok('P1 a pencilled night draws hatched')
    : bad('P1 a pencilled night draws hatched', `hatch=${hatched}`)

  const asks = await page.evaluate(() => /Was that how it went/i.test(document.body.innerText))
  asks
    ? ok('P2 the estate asks for a yes rather than an entry')
    : bad('P2 the estate asks for a yes rather than an entry')

  const confirm = page.getByRole('button', { name: /CONFIRM IT/i }).first()
  if (!(await confirm.count())) return bad('P3 the confirm door exists', 'no CONFIRM IT button')
  await confirm.click()
  await page.waitForTimeout(500)
  const title = await page.evaluate(() => document.body.innerText)
  const isConfirm = /IS THAT HOW IT WENT/i.test(title)
  isConfirm
    ? ok('P3 the sheet opens as a confirmation')
    : bad('P3 the sheet opens as a confirmation', 'wrong sheet title')

  await page.getByRole('button', { name: /YES, THAT IS IT/i }).last().click()
  await page.waitForTimeout(600)

  const after = await page.evaluate(() => {
    const e = window.__events.getState().events.find((x) => x.id === 'pencil-test')
    const b = [...document.querySelectorAll('[data-event-block]')].find((n) =>
      /Sleep/.test(n.textContent || ''),
    )
    return {
      ref: e?.sourceRef || '',
      hours: e ? (new Date(e.end) - new Date(e.start)) / 3600000 : null,
      hatched: b ? b.className.includes('booked-hatch') : null,
    }
  })
  after.ref.startsWith('slept:')
    ? ok('P4 confirming turns the plan into a record', after.ref)
    : bad('P4 confirming turns the plan into a record', `ref="${after.ref}"`)
  is('P4 …without inventing hours', after.hours, 6)
  after.hatched === false
    ? ok('P5 …and it stops drawing hatched')
    : bad('P5 …and it stops drawing hatched', `hatch=${after.hatched}`)
}

/* ------------------------------------------------ closed during a rehearsal */

/**
 * A night is half calendar block and half record. Writing one while a what-if
 * is open would put the hours in the DRAFT and the rating in the real store,
 * so discarding the rehearsal would strand a rating with no night under it.
 * Every door has to be shut, not just the obvious one in the nav row.
 */
async function rehearsal(page) {
  await page.getByRole('button', { name: /WHAT-IF/i }).first().click()
  await page.waitForTimeout(800)

  const navGone = (await page.getByRole('button', { name: /^NIGHT$/ }).count()) === 0
  navGone
    ? ok('R1 the standing door is shut mid-rehearsal')
    : bad('R1 the standing door is shut mid-rehearsal', 'NIGHT still in the nav row')

  const body = await page.evaluate(() => document.body.innerText)
  const offerGone = !/not written down|Was that how it went/i.test(body)
  offerGone
    ? ok('R2 the morning offer is silent mid-rehearsal')
    : bad('R2 the morning offer is silent mid-rehearsal', 'still asking over a draft')

  const blk = page.locator('[data-event-block]', { hasText: 'Sleep' }).first()
  if ((await blk.count()) === 0) return bad('R3 a sleep block to press', 'none on the week')
  await blk.click({ position: { x: 40, y: 20 } })
  await page.waitForTimeout(500)
  const doors = await page.getByRole('button', { name: /THE NIGHT|CONFIRM IT/ }).count()
  doors === 0
    ? ok("R3 a sleep block's own door is shut too")
    : bad("R3 a sleep block's own door is shut too", `${doors} still open`)

  // the mailbox backstop: even a door that got past the UI must not open it
  await page.evaluate(() => {
    const d = new Date()
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    window.__manorUi?.getState?.().requestNight?.(k)
  })
  await page.waitForTimeout(500)
  const sheetShut = await page.evaluate(() => !/THE MORNING OF/i.test(document.body.innerText))
  sheetShut
    ? ok('R4 …and the mailbox refuses to open the sheet over a draft')
    : bad('R4 …and the mailbox refuses to open the sheet over a draft', 'sheet opened')
}

/* ---------------------------------------------- the coupling actually bites */

async function coupling(page) {
  const r = await page.evaluate(() => {
    const N = window.__night
    const iso = (d, h, m) => {
      const x = new Date()
      x.setDate(x.getDate() - d)
      x.setHours(h, m, 0, 0)
      return x.toISOString()
    }
    // seven six-hour nights against an eight-hour target: a 10 % drag
    const nights = []
    for (let i = 1; i <= 7; i++) {
      nights.push({
        id: `c${i}`,
        source: 'manual',
        sourceRef: N.sleptRef('x'),
        kind: 'sleep',
        title: 'Sleep',
        start: iso(i, 23, 30),
        end: iso(i - 1, 5, 30),
        updatedAt: new Date().toISOString(),
      })
    }
    const s = window.__events.getState()
    s.replaceAll([...s.events.filter((e) => e.kind !== 'sleep'), ...nights])
    window.__sleep.setState({ notes: {}, targetH: 8, coupling: true })
    return true
  })
  if (!r) return bad('C0 the coupling fixture went in')
  await page.waitForTimeout(700)

  const scaled = await page.evaluate(() => {
    const w = window.__store.getState().workouts
    const E = window.__engine
    const now = Date.now()
    return {
      neutral: E.computeStrains(w, now, 1),
      dragged: E.computeStrains(w, now, 1.1),
      workouts: w.length,
    }
  })
  if (scaled.workouts === 0) return bad('C1 there are workouts to score', 'demo has none')
  const keys = Object.keys(scaled.neutral)
  const moved = keys.filter((k) => Math.abs(scaled.dragged[k] - scaled.neutral[k]) > 0.01)
  const higher = keys.filter((k) => scaled.dragged[k] > scaled.neutral[k] + 0.01)
  moved.length > 0
    ? ok('C1 a slower clock moves the body map', `${moved.length}/${keys.length} muscles`)
    : bad('C1 a slower clock moves the body map', 'nothing moved')
  higher.length >= moved.length
    ? ok('C2 …and it moves them the RIGHT way (sorer for longer)')
    : bad('C2 …and it moves them the RIGHT way (sorer for longer)', `${higher.length} of ${moved.length} rose`)

  // and the app's own scale, read the way every surface reads it
  const live = await page.evaluate(() => {
    const N = window.__night
    const st = N.sleepStats(
      window.__events.getState().events,
      window.__sleep.getState().notes,
      Date.now(),
      window.__sleep.getState().targetH,
    )
    return N.recoveryEffect(st, window.__sleep.getState().coupling)
  })
  live.applied && live.scale > 1
    ? ok('C3 the estate is running the drag it printed', `${live.scale.toFixed(3)} · ${live.pct}%`)
    : bad('C3 the estate is running the drag it printed', JSON.stringify(live))

  await page.evaluate(() => window.__sleep.setState({ coupling: false }))
  await page.waitForTimeout(400)
  const off = await page.evaluate(() => {
    const N = window.__night
    const st = N.sleepStats(
      window.__events.getState().events,
      window.__sleep.getState().notes,
      Date.now(),
      window.__sleep.getState().targetH,
    )
    return N.recoveryEffect(st, false).scale
  })
  is('C4 the settings switch returns it to exactly 1', off, 1)
}

/* --------------------------------------------------------------- the dials */

async function dials(page) {
  await page.evaluate(() => window.__sleep.setState({ coupling: true }))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const skip = page.getByRole('button', { name: /skip/i })
  if (await skip.count()) {
    try {
      await skip.first().click({ timeout: 800 })
    } catch {
      /* the brief had already finished typing */
    }
  }
  await page.waitForTimeout(400)

  const text = await page.evaluate(() => document.body.innerText)
  const names = ['SLEEP', 'SLEEP DEBT', 'BODY CLOCK']
  const missing = names.filter((n) => !text.includes(n))
  missing.length === 0
    ? ok('D1 all three instruments are on file', names.join(', '))
    : bad('D1 all three instruments are on file', `missing ${missing.join(', ')}`)

  // the brief must quote the same fortnight the dials draw
  const said = /You slept .* last night/i.test(text) || /No nights are written down/i.test(text)
  said ? ok('D2 the brief writes a sleep clause') : bad('D2 the brief writes a sleep clause')
}

/* ------------------------------------------------------------------- main */

const res = await fetch(BASE).catch(() => null)
if (!res?.ok) {
  console.error(`No app at ${BASE} — start it with \`npm run dev\` first.`)
  process.exit(2)
}

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
try {
  const a = await fresh(browser)
  await model(a.page)
  await dials(a.page)
  await a.ctx.close()

  const b = await fresh(browser)
  await writing(b.page)
  await b.ctx.close()

  const c = await fresh(browser)
  await pencil(c.page)
  await c.ctx.close()

  const r = await fresh(browser)
  await rehearsal(r.page)
  await r.ctx.close()

  const d = await fresh(browser)
  await coupling(d.page)
  d.errors.length === 0
    ? ok('Z1 console clean')
    : bad('Z1 console clean', d.errors.slice(0, 2).join(' | '))
  await d.ctx.close()
} finally {
  await browser.close()
}

let passed = 0
for (const r of results) {
  console.log(
    `${r.pass ? ' PASS ' : '*FAIL '} ${r.name}${r.detail ? `  —  ${r.detail}` : ''}`,
  )
  if (r.pass) passed++
}
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
