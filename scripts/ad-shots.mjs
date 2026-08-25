#!/usr/bin/env node
/**
 * Ad screenshot harness — the marketing pass.
 *
 * `?demo` seeds an HONEST week: two days old, most rings still at zero. That
 * is the right fixture for testing and the wrong one for an advert, where a
 * ring reading 0.0 says "nobody lives here". So this drives the same demo
 * estate and then FILLS it — more of exactly the records the demo already
 * seeds, never a new shape — and photographs every surface with a season's
 * worth of life in it.
 *
 * Nothing here touches app source. The fill runs in the page against the
 * dev-only `window.__*` store handles; the shots come out of a real headless
 * Chromium at phone size (390×844 @2x — an iPhone 14 frame).
 *
 * Two rules the fill obeys, because an advert that lies is worse than a thin
 * one: nothing in the past is booked that was not also fulfilled, and nothing
 * in the future is marked done.
 *
 * Usage — needs the dev server up (npm run dev):
 *   CHROME_PATH=/opt/pw-browsers/chromium node scripts/ad-shots.mjs
 *
 * Env: BASE · OUT · SKIN · W/H · SHOTS (csv of shot names to re-run)
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = process.env.OUT || 'ads/screenshots'
const SKIN = process.env.SKIN || 'midnight'
const W = Number(process.env.W || 390)
const H = Number(process.env.H || 844)
const ONLY = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null

mkdirSync(OUT, { recursive: true })

/* ------------------------------------------------------------------ *
 * The fill — runs in the page once ?demo has seeded every store.
 * ------------------------------------------------------------------ */
function enrich() {
  const E = window.__events, S = window.__study, WK = window.__workshop
  const C = window.__capital, T = window.__store
  if (!E) return 'no events store'

  const now = new Date()
  const nowIso = now.toISOString()
  const DAY = 86400000
  const week0 = (() => {
    const dow = (now.getDay() + 6) % 7 // Monday-first
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
  })()
  const todayIdx = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - week0) / DAY,
  )
  const at = (day, hour) => {
    const d = new Date(week0.getFullYear(), week0.getMonth(), week0.getDate() + day)
    const h = Math.floor(hour)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, Math.round((hour - h) * 60)).toISOString()
  }
  const ev = (id, day, a, b, kind, title, source, sourceRef, allDay) => ({
    id, source: source || 'manual', kind, title,
    start: at(day, a), end: at(day, b), allDay: allDay || undefined,
    sourceRef, updatedAt: nowIso,
  })

  /* --- THIS WEEK ---------------------------------------------------
     Today's column already carries the night watch (00–08, 19–24), a
     recovery sleep and the demo's own logged Push. Everything added here
     threads the gaps between them: the Manor STACKS overlapping blocks
     rather than side-by-siding them, so an overlap does not read as a full
     day — it reads as a broken one.

     Two blocks that already exist are moved first. The Push block is written
     by the Grounds at "two hours ago", so its slot walks with the wall clock
     and would eventually land under something; today's sleep is six hours
     long and leaves the afternoon empty. Both are pinned, then the rest of
     the day is laid out around them.                                       */
  const isToday = (iso) => {
    const d = new Date(iso)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  }
  E.setState({
    events: E.getState().events.map((e) => {
      if (!isToday(e.start)) return e
      if (e.source === 'grounds') return { ...e, start: at(todayIdx, 15.5), end: at(todayIdx, 16.5) }
      if (e.kind === 'sleep') return { ...e, end: at(todayIdx, 13) }
      return e
    }),
  })

  const extra = [
    // TODAY — eight blocks between one night watch and the next
    ev('ad-bench-today', todayIdx, 8, 9, 'workshop', 'The Ornithopter', 'workshop', 'proj:demo-vent-orni'),
    ev('ad-bench-rec', todayIdx, 13, 14.25, 'workshop', 'Field Recorder', 'workshop', 'proj:demo-vent-rec'),
    ev('ad-study-today', todayIdx, 14.5, 15.5, 'study', 'Physics', 'study', 'subj:demo-subj-physics'),
    ev('ad-bench-eve', todayIdx, 17.5, 18.75, 'workshop', 'The Darkroom', 'workshop', 'proj:demo-vent-dark'),
    // MONDAY — the day behind us, filled in around the demo's own 15:00 session
    ev('ad-study-mon-w', 0, 6, 7, 'study', 'Academic Writing', 'study', 'subj:demo-subj-writing'),
    ev('ad-bench-mon', 0, 7.25, 9.25, 'workshop', 'The Ornithopter', 'workshop', 'proj:demo-vent-orni'),
    ev('ad-study-mon-p', 0, 9.5, 11.5, 'study', 'Physics', 'study', 'subj:demo-subj-physics'),
    ev('ad-study-mon-s', 0, 11.75, 13.25, 'study', 'Spanish', 'study', 'subj:demo-subj-spanish'),
    ev('ad-bench-mon-d', 0, 13.5, 15, 'workshop', 'The Darkroom', 'workshop', 'proj:demo-vent-dark'),
    ev('ad-train-mon', 0, 16.75, 18.25, 'training', 'Intervals', 'grounds'),
    // the rest of the week, booked ahead
    ev('ad-study-wed', 2, 10, 12, 'study', 'Academic Writing', 'study', 'subj:demo-subj-writing'),
    ev('ad-bench-wed', 2, 12.5, 14.5, 'workshop', 'The Ornithopter', 'workshop', 'proj:demo-vent-orni'),
    ev('ad-study-thu', 3, 9, 11, 'study', 'Physics', 'study', 'subj:demo-subj-physics'),
    ev('ad-train-thu', 3, 16, 17.5, 'training', 'Strength — lower', 'grounds'),
    ev('ad-study-fri', 4, 10, 12.5, 'study', 'Linear Algebra', 'study', 'subj:demo-subj-math'),
    ev('ad-bench-sat', 5, 10, 13, 'workshop', 'The Ornithopter', 'workshop', 'proj:demo-vent-orni'),
    ev('ad-study-sun', 6, 13, 15, 'study', 'Spanish', 'study', 'subj:demo-subj-spanish'),
    ev('ad-sleep-sun', 6, 1, 8, 'sleep', 'Sleep'),
    // dated markers — two on a day fills the header, three truncates it
    ev('ad-mk-review', 2, 0, 0, 'marker', 'Portfolio review', 'capital', undefined, true),
    ev('ad-mk-rent', 4, 0, 0, 'marker', 'Rent due', 'capital', undefined, true),
  ]

  /* --- THE MONTHS BEHIND -------------------------------------------
     The month grid draws a dot per wing per day. Without a back-history it
     shows one busy week floating in an empty month, which reads as an app
     opened yesterday. Six weeks of the same rhythm fixes that, and feeds
     the Watch's eight-week duty chart at the same time.                  */
  const past = []
  for (let d = 7; d <= 46; d++) {
    const day = -d
    const dow = (((day % 7) + 7) % 7 + (week0.getDay() + 6) % 7) % 7
    const cycle = d % 7
    if (cycle === 0 || cycle === 1 || cycle === 3) {
      past.push(ev(`ad-p-w${d}`, day, 19, 32, 'shift', 'Night Watch', 'watch'))
      past.push(ev(`ad-p-s${d}`, day + 1, 9, 15, 'sleep', 'Sleep'))
    }
    if (cycle === 2 || cycle === 5) {
      past.push(ev(`ad-p-t${d}`, day, 17, 18.5, 'training', cycle === 2 ? 'Strength — upper' : 'Intervals', 'grounds'))
    }
    if (cycle === 2 || cycle === 4 || cycle === 6) {
      past.push(ev(`ad-p-st${d}`, day, 10, 12, 'study', ['Linear Algebra', 'Physics', 'Spanish'][d % 3], 'study'))
    }
    if (cycle === 4 || cycle === 6) {
      past.push(ev(`ad-p-b${d}`, day, 13, 15, 'workshop', ['The Ornithopter', 'The Darkroom'][d % 2], 'workshop'))
    }
    void dow
  }

  const added = [...extra, ...past]
  const keep = E.getState().events.filter((e) => !added.some((x) => x.id === e.id))
  E.setState({ events: [...keep, ...added] })

  /* --- the rings: everything already behind us is DONE ---------------
     Including the backfilled months. A past session with no fulfillment on
     it is not neutral — the Study queues it under STILL TO LOG and the
     Workshop under THIS WEEK'S LEDGER, so six weeks of history would arrive
     as six weeks of nagging.                                              */
  const backfilled = (prefix) =>
    Object.fromEntries(past.filter((e) => e.id.startsWith(prefix)).map((e) => [e.id, { fulfillment: 'done' }]))

  if (S) {
    S.setState({
      sessions: {
        ...S.getState().sessions,
        ...backfilled('ad-p-st'),
        // nothing in the future is marked done, and nothing already behind
        // us is left merely booked
        'demo-study-1': { fulfillment: 'done' },
        'ad-study-mon-w': { fulfillment: 'done' },
        'ad-study-mon-p': { fulfillment: 'done' },
        'ad-study-mon-s': { fulfillment: 'done' },
        'ad-study-today': { fulfillment: 'done' },
      },
    })
  }
  if (WK) {
    const w = WK.getState()
    WK.setState({
      // the Field Recorder ring reads "no goal" until it has one
      ventures: w.ventures.map((v) => (v.id === 'demo-vent-rec' ? { ...v, goalH: 2 } : v)),
      sessions: {
        ...w.sessions,
        ...backfilled('ad-p-b'),
        'ad-bench-mon': { fulfillment: 'done' },
        'ad-bench-mon-d': { fulfillment: 'done' },
        'ad-bench-today': { fulfillment: 'done', live: true },
        'ad-bench-rec': { fulfillment: 'done' },
        'ad-bench-eve': { fulfillment: 'planned' },
      },
    })
  }

  /* --- the Grounds: a season of history behind the body map ---------- */
  if (T) {
    const ws = T.getState().workouts
    const w = (id, daysAgo, hour, ppl, effort, feel, style, sets, mins) => {
      const d = new Date(now.getTime() - daysAgo * DAY)
      d.setHours(hour, 10, 0, 0)
      const map = {
        push: { primary: ['chest'], secondary: ['front-delts', 'side-delts', 'triceps'] },
        pull: { primary: ['lats'], secondary: ['biceps', 'rear-delts', 'forearms', 'traps'] },
        legs: { primary: ['quads', 'hamstrings', 'glutes'], secondary: ['calves', 'lower-back'] },
      }[ppl]
      return {
        id, performedAt: d.toISOString(), createdAt: d.toISOString(), method: 'ppl', ppl,
        primary: map.primary, secondary: map.secondary,
        effort, strainFeel: feel, repStyle: style, setsTotal: sets, durationMin: mins,
      }
    }
    const back = []
    const cycle = ['push', 'pull', 'legs']
    for (let k = 0; k < 22; k++) {
      const daysAgo = 13 + k * 2
      back.push(w(`ad-w-${k}`, daysAgo, 17, cycle[k % 3], 6 + (k % 4), 5 + (k % 5),
        ['heavy', 'mixed', 'light'][k % 3], 14 + (k % 6), 55 + (k % 4) * 10))
    }
    // replaceAll, never setState: the history list groups CONSECUTIVE
    // same-day entries and leans on the store's own newest-first sort to
    // make that safe. An unsorted splice puts one day in two groups.
    T.getState().replaceAll([...ws.filter((x) => !x.id.startsWith('ad-w-')), ...back])
  }

  /* --- the ledger: a portfolio board with rows enough to read as one -- */
  if (C) {
    const st = C.getState()
    const brokerage = st.accounts.find((a) => a.name.startsWith('IBKR'))
    if (brokerage) {
      const dayKey = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const series = (closes) =>
        closes.map((close, k) => ({ date: dayKey(new Date(now.getTime() - (closes.length - 1 - k) * DAY)), close }))
      const add = [
        { id: 'ad-h-qqq', accountId: brokerage.id, symbol: 'QQQ', currency: 'USD', shares: 40, costBasis: 465 },
        { id: 'ad-h-msft', accountId: brokerage.id, symbol: 'MSFT', currency: 'USD', shares: 32, costBasis: 388 },
        { id: 'ad-h-nvda', accountId: brokerage.id, symbol: 'NVDA', currency: 'USD', shares: 60, costBasis: 118 },
        { id: 'ad-h-brk', accountId: brokerage.id, symbol: 'BRK.B', currency: 'USD', shares: 18, costBasis: 452 },
      ]
      const q = (price, prevClose, name) =>
        ({ price, prevClose, currency: 'USD', name, marketOpen: true, at: nowIso })
      C.setState({
        holdings: [...st.holdings.filter((h) => !add.some((a) => a.id === h.id)), ...add],
        prices: {
          ...st.prices,
          QQQ: q(601.4, 594.8, 'Invesco QQQ Trust'),
          MSFT: q(512.22, 507.4, 'Microsoft Corporation'),
          NVDA: q(184.6, 179.05, 'NVIDIA Corporation'),
          'BRK.B': q(497.15, 495.9, 'Berkshire Hathaway Inc.'),
        },
        history: {
          ...st.history,
          QQQ: series([578, 581.5, 579.2, 585, 588.4, 586.1, 591, 595.2, 593.4, 594.8, 601.4]),
          MSFT: series([496, 499.5, 502.1, 500.4, 505, 508.2, 506.8, 510.1, 509.4, 507.4, 512.22]),
          NVDA: series([168, 170.4, 169.1, 172.8, 175.2, 174.0, 177.6, 180.9, 178.4, 179.05, 184.6]),
          'BRK.B': series([488, 489.5, 491.2, 490.1, 492.8, 494.0, 493.2, 495.6, 496.8, 495.9, 497.15]),
        },
        spendItems: [
          ...st.spendItems.filter((s) => !s.id.startsWith('ad-s-')),
          { id: 'ad-s-1', name: 'Pharmacy', amount: 185, date: new Date(now.getTime() - 2 * DAY).toISOString() },
          { id: 'ad-s-2', name: 'Hardware — carbon tube', amount: 260, date: new Date(now.getTime() - 4 * DAY).toISOString() },
          { id: 'ad-s-3', name: 'Textbooks', amount: 540, date: new Date(now.getTime() - 6 * DAY).toISOString() },
          { id: 'ad-s-4', name: 'Coffee', amount: 96, date: new Date(now.getTime() - 7 * DAY).toISOString() },
        ],
        pricesUpdatedAt: nowIso,
      })

      /* The snapshots have to be brought up to the holdings, or the whole
         point of the live/history split turns into a lie in the brief: four
         new positions make the LIVE brokerage value jump ₪160K against a
         snapshot taken before they existed, and the house dutifully reports
         a ₪160K gain "since the last snapshot". Scaling the brokerage column
         across every snapshot keeps the trend's shape and leaves a day's
         move where a day's move belongs. */
      const fx = C.getState().fx
      const live = C.getState().holdings.reduce((sum, h) => {
        const q = C.getState().prices[h.symbol]
        return q ? sum + h.shares * q.price * (fx[h.currency] ?? 1) : sum
      }, 0)
      const snaps = C.getState().snapshots
      const latest = snaps.reduce((a, b) => (new Date(a.takenAt) > new Date(b.takenAt) ? a : b))
      const scale = (live * 0.99) / (latest.balances[brokerage.id] || 1)
      C.setState({
        snapshots: snaps.map((sn) => ({
          ...sn,
          balances: { ...sn.balances, [brokerage.id]: Math.round((sn.balances[brokerage.id] || 0) * scale) },
        })),
      })
    }
  }
  return 'ok'
}

/* ------------------------------------------------------------------ */

/**
 * Every shot: a name, the URL it opens, and where to stop scrolling.
 *
 * The stop is an ANCHOR — a panel's own heading — not a pixel offset. Offsets
 * were measured once against the plain `?demo` estate and then drifted the
 * moment the fill made the pages longer, which is how a shot ends up framing
 * the gap above the panel it was aimed at. `lead` is the gap left above the
 * anchor, in CSS px. A number instead of an anchor means scroll there flat,
 * for the two screens whose subject sits above every heading.
 */
const SHOTS = [
  ['01-manor-day',         'view=manor',               300],
  ['02-manor-briefing',    'view=manor',               'THE BRIEFING', 24],
  ['03-manor-instruments', 'view=manor',               'THE INSTRUMENTS', 24],
  ['04-manor-month',       'view=manor&manor=month',   150],
  ['05-grounds-bodymap',   'view=training',            'Muscle Status', 24],
  ['06-grounds-volume',    'view=training&map=volume', 'Muscle Status', 24],
  ['07-grounds-stats',     'view=training',            'This week', 24],
  ['08-grounds-charts',    'view=training',            'Streak', 24],
  ['09-ledger-vault',      'view=capital',             'The Vault', 24],
  ['10-ledger-portfolio',  'view=capital',             'Allocation', 24],
  ['11-ledger-spending',   'view=capital',             'Spending', 24],
  ['12-study-rings',       'view=study',               'HOURS THIS WEEK', 24],
  ['13-study-homework',    'view=study',               'HOMEWORK', 24],
  ['14-workshop-bench',    'view=workshop',            'THE WEEK AT THE BENCH', 24],
  ['15-workshop-board',    'board',                    205],
  ['16-watch-duty',        'view=watch',               'ON DUTY', 24],
  ['17-watch-post',        'view=watch',               'POST A SHIFT', 24],
]

/** scroll so `anchor`'s heading sits `lead` px below the top of the frame */
async function frame(page, anchor, lead) {
  if (typeof anchor === 'number') {
    await page.evaluate((y) => window.scrollTo(0, y), anchor)
    return true
  }
  return page.evaluate(
    ([text, gap]) => {
      const want = text.toLowerCase()
      const el = [...document.querySelectorAll('h1,h2,h3,h4,.card-title,[class*="card-title"]')].find(
        (n) => n.textContent.trim().toLowerCase().includes(want) && n.offsetParent !== null,
      )
      if (!el) return false
      window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - gap))
      return true
    },
    [anchor, lead],
  )
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })

for (const [name, query, anchor, lead] of SHOTS) {
  if (ONLY && !ONLY.has(name)) continue
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'dark',
  })
  // the boot gate shows the LANDING to a browser with no majordomo* key
  await ctx.addInitScript(() => localStorage.setItem('majordomo-harness', '1'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(`${BASE}/?demo&skin=${SKIN}&${query}`, { waitUntil: 'networkidle' })
  const res = await page.evaluate(enrich)
  if (res !== 'ok') errors.push(`enrich: ${res}`)
  await page.waitForTimeout(900)
  // the brief types itself out on a first visit — never photograph half a sentence
  const skip = page.getByRole('button', { name: /^skip$/i })
  if (await skip.count()) { try { await skip.first().click({ timeout: 1200 }) } catch { /* done typing */ } }
  await page.waitForTimeout(700)
  if (!(await frame(page, anchor, lead))) errors.push(`anchor not found: ${anchor}`)
  await page.waitForTimeout(500)
  await frame(page, anchor, lead)
  await page.waitForTimeout(400)

  const file = `${OUT}/${name}.png`
  await page.screenshot({ path: file })
  console.log(`${name.padEnd(22)} ${file}${errors.length ? '   ⚠ ' + errors.slice(0, 2).join(' | ') : ''}`)
  await ctx.close()
}
await browser.close()
