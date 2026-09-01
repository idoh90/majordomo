/**
 * The LEDGER harness — the Ledger's sign contract, driven through a real
 * browser against the running dev server.
 *
 *   npm run dev             (in another terminal — this drives it, it does not start it)
 *   npm run check:ledger
 *
 * It exists for the reason the Manor's and THE NIGHT's do. A bank app shows a
 * mortgage as −400,000, so that is what people type, and the app subtracted the
 * negative: ₪50,000 in the bank beside a ₪400,000 mortgage read ₪450,000 — out
 * by ₪800,000, in the biggest type on the screen, in the brief, on the tile,
 * and stamped permanently into the trend history. The only tell was a garbled
 * "−-₪400K" in two different minus glyphs, which reads as a font problem.
 * That is precisely what "verify in the browser" cannot catch, so the sign is
 * asserted as a number and as rendered text.
 *
 * HONEST LIMITS — do not read a green run as full coverage:
 *   · It scores the SIGN of a balance. Every other Ledger figure (spend pace,
 *     live prices, FX, the portfolio board, the delta's basis) is untouched here.
 *   · Debt accounts hold no live-priced holdings — the sheet only offers them
 *     to non-liability accounts — so the live/degraded path is not crossed with
 *     this one.
 *   · The blur toggle is left off; a blurred figure is a CSS filter over the
 *     same text, so it changes nothing this reads.
 */
import { chromium } from 'playwright-core'

const EXEC = process.env.CHROME_PATH || undefined
const BASE = process.env.LEDGER_BASE || process.env.MANOR_BASE || 'http://localhost:5173'

const results = []
const ok = (name, detail = '') => results.push({ pass: true, name, detail })
const bad = (name, detail = '') => results.push({ pass: false, name, detail })
const is = (name, got, want, tol = 0.001) =>
  Math.abs(got - want) <= tol ? ok(name, `${got}`) : bad(name, `got ${got}, wanted ${want}`)
const says = (name, text, want) =>
  text.includes(want) ? ok(name, want) : bad(name, `no "${want}" in ${JSON.stringify(text.slice(0, 160))}`)
const silent = (name, text, unwanted) =>
  text.includes(unwanted) ? bad(name, `found "${unwanted}"`) : ok(name, `no "${unwanted}"`)

async function fresh(browser, query = '?console=capital') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  // the boot gate shows the LANDING to a browser with no majordomo* key; one
  // sentinel flips it without touching any store's persisted blob
  await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  return { ctx, page, errors }
}

/** The estate from the bug report: ₪50,000 in the bank, a ₪400,000 mortgage —
 *  `debt` is the balance to write against the mortgage, sign included. */
async function seed(page, debt) {
  await page.evaluate((d) => {
    window.__capital.setState({
      accounts: [
        { id: 'acc-bank', name: 'Bank Hapoalim', assetClass: 'cash' },
        { id: 'acc-mortgage', name: 'Mortgage', assetClass: 'debt' },
      ],
      snapshots: [
        {
          id: 'snap-1',
          takenAt: new Date(Date.now() - 30 * 86400000).toISOString(),
          balances: { 'acc-bank': 50000, 'acc-mortgage': d },
        },
      ],
      holdings: [],
      blurAmounts: false,
    })
  }, debt)
  await page.waitForTimeout(500)
}

/* ----------------------------------------------------------------- the model */

async function model(page) {
  const r = await page.evaluate(() => {
    const L = window.__ledger
    if (!L) return { missing: true }
    const acc = (id, assetClass) => ({ id, name: id, assetClass })
    const snap = (balances) => ({ id: 's', takenAt: new Date().toISOString(), balances })

    const bank = acc('bank', 'cash')
    const mortgage = acc('mortgage', 'debt')
    const accounts = [bank, mortgage]
    const typedNegative = snap({ bank: 50000, mortgage: -400000 })
    const typedPositive = snap({ bank: 50000, mortgage: 400000 })

    const live = (s) => L.liveNetWorth(accounts, [], {}, { ILS: 1 }, s)

    // an overdraft is a REAL negative and must survive untouched
    const overdrawn = [acc('current', 'cash'), acc('savings', 'cash')]

    return {
      negativeNW: L.netWorthOf(typedNegative, accounts),
      positiveNW: L.netWorthOf(typedPositive, accounts),
      negativeLiab: L.liabilitiesOf(typedNegative, accounts),
      liveNegativeNW: live(typedNegative).netWorth,
      liveNegativeLiab: live(typedNegative).liabilities,
      livePositiveNW: live(typedPositive).netWorth,
      overdraft: L.netWorthOf(snap({ current: -5000, savings: 20000 }), overdrawn),
      // history: two points, the older typed the house's way and the newer the
      // bank app's — the line must not leap ₪800,000 between them
      series: L.netWorthSeries(
        [
          { id: 'a', takenAt: '2026-06-01T09:00:00.000Z', balances: { bank: 50000, mortgage: 400000 } },
          { id: 'b', takenAt: '2026-07-01T09:00:00.000Z', balances: { bank: 50000, mortgage: -400000 } },
        ],
        accounts,
      ).map((p) => p.value),
    }
  })

  if (r.missing) return bad('A0 window.__ledger is on file', 'not a dev build?')
  ok('A0 window.__ledger is on file')

  is('A1 a debt typed as a minus SUBTRACTS', r.negativeNW, -350000)
  is('A2 …and reads the same typed the house way', r.positiveNW, -350000)
  is('A3 liabilities is a magnitude, never signed', r.negativeLiab, 400000)
  is('A4 the live figure agrees with the snapshot', r.liveNegativeNW, -350000)
  is('A5 live liabilities is a magnitude too', r.liveNegativeLiab, 400000)
  is('A6 live agrees whichever way it was typed', r.livePositiveNW, -350000)
  is('A7 an overdraft stays a real negative', r.overdraft, 15000)
  r.series[0] === r.series[1]
    ? ok('A8 history does not leap on the sign alone', `${r.series.join(' → ')}`)
    : bad('A8 history does not leap on the sign alone', `${r.series.join(' → ')}`)
}

/* ---------------------------------------------------------------- the screen */

async function screen(page) {
  await seed(page, -400000)
  const text = await page.evaluate(() => document.body.innerText)

  says('B1 the Vault states the truth', text, '−₪350,000')
  silent('B2 …and never the fiction', text, '₪450,000')
  // one minus, the faint one the row draws itself — never the formatter's too
  silent('B3 no double minus anywhere on the screen', text, '−-₪')
  says('B4 liabilities read as a magnitude', text, '−₪400K')
  says('B5 the allocation still lists the debt', text, 'Liabilities')

  // the same estate typed the house's way must render identically
  await seed(page, 400000)
  const houseWay = await page.evaluate(() => document.body.innerText)
  says('B6 the house way reads the same', houseWay, '−₪350,000')
  says('B7 …down to the accounts row', houseWay, '−₪400K')
}

/* ------------------------------------------------------------------ the door */

async function door(page) {
  await seed(page, 400000)
  await page.getByRole('button', { name: 'Update balances' }).first().click()
  await page.waitForTimeout(500)

  // the mortgage's field is the second money input in the sheet
  const fields = page.locator('.sheet-surface input[type="number"]')
  const count = await fields.count()
  if (count < 2) return bad('C0 the sheet opens with a field per account', `found ${count}`)
  ok('C0 the sheet opens with a field per account', `${count} fields`)

  await fields.nth(1).fill('-400000')
  await page.waitForTimeout(300)
  const sheet = page.locator('.sheet-surface')
  says('C1 the preview reads the minus as a debt', await sheet.innerText(), '−₪350,000')

  await page.getByRole('button', { name: /save snapshot/i }).click()
  await page.waitForTimeout(500)

  // a sheet that CLOSED took the minus — the very thing this refuses. Reported
  // rather than thrown: a harness that dies mid-run says nothing about the
  // checks it never reached.
  if ((await sheet.count()) === 0) {
    bad('C2 Save is refused, and says why', 'the sheet closed — the minus was accepted')
    bad('C4 the offending row is marked', 'the sheet closed')
  } else {
    says('C2 Save is refused, and says why', await sheet.innerText(), 'A debt is what you owe')
    const marked = await fields.nth(1).getAttribute('aria-invalid')
    marked === 'true'
      ? ok('C4 the offending row is marked')
      : bad('C4 the offending row is marked', `aria-invalid=${marked}`)
  }
  is(
    'C3 …and nothing was written',
    await page.evaluate(() => window.__capital.getState().snapshots.at(-1).balances['acc-mortgage']),
    400000,
  )

  // the same figure without the minus goes through
  if ((await sheet.count()) === 0) await page.getByRole('button', { name: 'Update balances' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('.sheet-surface input[type="number"]').nth(1).fill('412000')
  await page.getByRole('button', { name: /save snapshot/i }).click()
  await page.waitForTimeout(600)
  is(
    'C5 the plain number saves',
    await page.evaluate(() => window.__capital.getState().snapshots.at(-1).balances['acc-mortgage']),
    412000,
  )
  ;(await sheet.count()) === 0
    ? ok('C6 the sheet closes on a good save')
    : bad('C6 the sheet closes on a good save')
}

/* -------------------------------------------------------------------- main */

const res = await fetch(BASE).catch(() => null)
if (!res?.ok) {
  console.error(`No app at ${BASE} — start it with \`npm run dev\` first.`)
  process.exit(2)
}

/** A section that throws is itself a failure, and must not take the report with it. */
const run = async (label, fn) => {
  try {
    await fn()
  } catch (e) {
    bad(`${label} ran to the end`, String(e).split('\n')[0])
  }
}

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
try {
  const a = await fresh(browser)
  await run('A the model', () => model(a.page))
  await run('B the screen', () => screen(a.page))
  await a.ctx.close()

  const b = await fresh(browser)
  await run('C the door', () => door(b.page))
  b.errors.length === 0 ? ok('Z1 console clean') : bad('Z1 console clean', b.errors.slice(0, 2).join(' | '))
  await b.ctx.close()
} finally {
  await browser.close()
}

let passed = 0
for (const r of results) {
  console.log(`${r.pass ? ' PASS ' : '*FAIL '} ${r.name}${r.detail ? `  —  ${r.detail}` : ''}`)
  if (r.pass) passed++
}
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
