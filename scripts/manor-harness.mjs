#!/usr/bin/env node
/**
 * Manor measurement harness — the calendar's regression gate.
 *
 * The Manor's contract is mostly NUMERIC: a 13 h night watch stays 13 h under
 * a drag, the printed hour rail agrees with the blocks it describes, a
 * template that cannot fit is not offered. Verifying that by eye is exactly
 * how the cross-midnight data loss survived so long — every block looked
 * plausible. So this drives a real headless Chromium through the real app and
 * reads back both the DOM geometry and the events store.
 *
 * Deliberately NOT a test runner for the app at large — the repo's rule that
 * verification happens in the browser still stands. This covers the one
 * surface where "looks right" and "is right" come apart.
 *
 * Usage (bash) — needs the dev server up:
 *   npm run dev &
 *   npm run check:manor           # all checks
 *   npm run check:manor -- --probe  # dump what's on screen, for debugging
 *
 * Browser: uses CHROME_PATH if set, else Playwright's own resolution. On a
 * machine with Chrome elsewhere:  CHROME_PATH=/path/to/chrome npm run check:manor
 * Point it at another origin with  MANOR_BASE=https://…  (e.g. a preview build).
 *
 * HONEST LIMITS — do not read a green run as full coverage:
 *   · Desktop pointer drags ARE faithful (Playwright emits trusted pointer
 *     events, which is what onBlockPointerDown listens for).
 *   · The mobile 350 ms long-press against snap-scroll is NOT drivable this
 *     way. Mobile coverage here is geometry, the FAB and the sheets only —
 *     the long-press drag still needs two minutes on real hardware.
 *   · No DST coverage. Israel's October change deserves a manual pass.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const EXEC = process.env.CHROME_PATH || undefined
const BASE = process.env.MANOR_BASE || 'http://localhost:5173'
const PXH = 24 // px per hour — must match WeekGrid.tsx

const results = []
const ok = (name, detail = '') => results.push({ pass: true, name, detail })
const bad = (name, detail = '') => results.push({ pass: false, name, detail })
const near = (a, b, tol) => Math.abs(a - b) <= tol

/** the events store, straight out of the page */
const readEvents = (page) =>
  page.evaluate(() => {
    const s = window.__events?.getState?.()
    if (!s) return null
    return s.events.map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      allDay: !!e.allDay,
      start: e.start,
      end: e.end,
      hours: (new Date(e.end) - new Date(e.start)) / 3600000,
      startHour: new Date(e.start).getHours() + new Date(e.start).getMinutes() / 60,
    }))
  })

async function fresh(browser, { width, height }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    // the app buckets by LOCAL time everywhere; pin a zone so runs are comparable
    timezoneId: 'Asia/Jerusalem',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${BASE}/?demo`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  return { ctx, page, errors }
}

/** locate a timed block by its title text */
async function blockBox(page, title, nth = 0) {
  const el = page.locator(`[data-event-block]`, { hasText: title }).nth(nth)
  if ((await el.count()) === 0) return null
  return await el.boundingBox()
}

/* ------------------------------------------------------------------ probe */

async function probe(browser) {
  const { page } = await fresh(browser, { width: 1440, height: 900 })
  const info = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('[data-event-block]')].map((b) => {
      const r = b.getBoundingClientRect()
      return { text: b.textContent?.slice(0, 40), top: Math.round(r.top), h: Math.round(r.height) }
    })
    return {
      title: document.title,
      blocks: blocks.slice(0, 12),
      blockCount: blocks.length,
      bodyText: document.body.innerText.slice(0, 400),
    }
  })
  console.log(JSON.stringify(info, null, 2))
  const ev = await readEvents(page)
  console.log('events:', ev ? ev.length : 'NO __events HANDLE')
  if (ev) console.table(ev.slice(0, 8))
}

/* ------------------------------------------------- desktop drag assertions */

async function desktopChecks(browser) {
  const { page, errors } = await fresh(browser, { width: 1440, height: 900 })

  const before = await readEvents(page)
  if (!before) {
    bad('store handle', 'window.__events missing — dev build?')
    return
  }
  const watch = before.find((e) => e.title === 'Night Watch' && e.hours === 13)
  if (!watch) {
    bad('demo estate', 'no 13 h Night Watch seeded')
    return
  }
  ok('demo estate', `${before.length} events, 13 h watch present`)

  /* --- A1: nudge a cross-midnight watch inside its own column -------------- */
  const box = await blockBox(page, 'Night Watch')
  if (!box) {
    bad('A1 drag', 'no Night Watch block rendered')
  } else {
    // grab near the top of the block, move 10 px down — the reported repro
    await page.mouse.move(box.x + box.width / 2, box.y + 6)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 10, { steps: 3 })
    await page.mouse.move(box.x + box.width / 2, box.y + 16, { steps: 3 })

    // read the live ghost label before dropping
    const ghost = await page
      .locator('text=/→/')
      .allTextContents()
      .catch(() => [])
    await page.mouse.up()
    await page.waitForTimeout(350)

    const after = await readEvents(page)
    const moved = after.find((e) => e.id === watch.id)
    if (!moved) {
      bad('A1 duration', 'watch vanished after drag')
    } else if (near(moved.hours, 13, 0.001)) {
      ok('A1 cross-midnight drag keeps duration', `${moved.hours.toFixed(1)} h @ ${moved.startHour}`)
    } else {
      bad(
        'A1 cross-midnight drag keeps duration',
        `expected 13.0 h, got ${moved.hours.toFixed(1)} h (start ${moved.startHour}) — CLAMP BUG`,
      )
    }
    if (moved) {
      const onGrid = near((moved.startHour * 2) % 1, 0, 0.001)
      onGrid
        ? ok('A1 start snaps to 0.5 h grid', `start ${moved.startHour}`)
        : bad('A1 start snaps to 0.5 h grid', `start ${moved.startHour}`)
      // startHour is computed IN the page, so it is already local to the app's
      // timezone — a 19:00 + 13 h watch must still run past 24:00.
      const crosses = moved.startHour + moved.hours > 24
      crosses
        ? ok('A1 overnight end survives', `${moved.startHour}:00 + ${moved.hours} h`)
        : bad(
            'A1 overnight end survives',
            `collapsed inside the day: start yanked ${watch.startHour} → ${moved.startHour} — CLAMP BUG`,
          )
      // the start must follow the pointer, not be dragged back up the column
      moved.startHour >= watch.startHour
        ? ok('A1 start follows the pointer', `${watch.startHour} → ${moved.startHour}`)
        : bad('A1 start follows the pointer', `dragged DOWN but start moved UP to ${moved.startHour}`)
    }
    if (ghost.length) ok('A1 ghost label present', ghost.slice(0, 1).join(''))
  }

  /* --- A2: an ordinary same-day event is unaffected ----------------------- */
  const trainBefore = (await readEvents(page)).find((e) => e.title === 'Intervals')
  if (trainBefore) {
    const tb = await blockBox(page, 'Intervals')
    if (tb) {
      await page.mouse.move(tb.x + tb.width / 2, tb.y + 5)
      await page.mouse.down()
      await page.mouse.move(tb.x + tb.width / 2, tb.y + 12, { steps: 3 })
      await page.mouse.move(tb.x + tb.width / 2, tb.y + 29, { steps: 3 }) // ~1 h down
      await page.mouse.up()
      await page.waitForTimeout(350)
      const t2 = (await readEvents(page)).find((e) => e.id === trainBefore.id)
      near(t2.hours, trainBefore.hours, 0.001)
        ? ok('A2 ordinary event keeps duration', `${t2.hours.toFixed(1)} h`)
        : bad('A2 ordinary event keeps duration', `${trainBefore.hours} → ${t2.hours}`)
    }
  }

  /* --- A2b: cross-day drag still routes through the confirm, intact ------- */
  {
    const w2 = (await readEvents(page)).find((e) => e.title === 'Night Watch' && e.hours === 13)
    const wb = await blockBox(page, 'Night Watch')
    // Friday (col 5) is the only column with a free 19:00 in the demo week —
    // the other watch days would (correctly) reject with "occupied, sir".
    const grid = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(
        (d) => d.className.includes('overflow-hidden') && d.className.includes('rounded-xl'),
      )
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, width: r.width }
    })
    if (w2 && wb && grid) {
      const colW = grid.width / 7
      const targetX = grid.left + colW * 5 + colW / 2
      await page.mouse.move(wb.x + wb.width / 2, wb.y + 6)
      await page.mouse.down()
      await page.mouse.move(wb.x + wb.width / 2 + 40, wb.y + 8, { steps: 4 })
      await page.mouse.move(targetX, wb.y + 8, { steps: 8 })
      // capture the ghost's geometry while it is still crossing midnight
      const ghostGeo = await page.evaluate(() => {
        // marked element, not a style fingerprint: this used to sniff for
        // `willChange: transform` + a 90ms transition, both of which the tilt
        // motor legitimately removes — and a missed ghost skipped the check
        // in silence rather than failing it.
        const g = document.querySelector('[data-drag-ghost]')
        if (!g) return null
        const box = g.closest('[style*="overflow"]')?.getBoundingClientRect()
        const r = g.getBoundingClientRect()
        return {
          bottom: r.bottom,
          boxBottom: box?.bottom ?? null,
          borderBottom: getComputedStyle(g).borderBottomStyle,
        }
      })
      await page.mouse.up()
      await page.waitForTimeout(400)

      const dlg = await page.evaluate(() => document.body.innerText)
      if (/Move (?:it )?to another day/i.test(dlg)) {
        ok('A2b cross-day drag asks first', dlg.match(/would run[^.]*\./)?.[0]?.slice(0, 70) ?? '')
        await page.getByText('Move it', { exact: true }).click()
        await page.waitForTimeout(350)
        const after = (await readEvents(page)).find((e) => e.id === w2.id)
        near(after.hours, 13, 0.001) && after.startHour + after.hours > 24
          ? ok('A2b cross-day move keeps the overnight range', `${after.startHour} + ${after.hours} h`)
          : bad(
              'A2b cross-day move keeps the overnight range',
              `${after.startHour} + ${after.hours} h`,
            )
      } else {
        bad('A2b cross-day drag asks first', 'no confirm dialog appeared')
      }
      if (ghostGeo) {
        ghostGeo.borderBottom === 'dotted'
          ? ok('A2b crossing ghost wears the seam cut edge')
          : bad('A2b crossing ghost wears the seam cut edge', `border-bottom: ${ghostGeo.borderBottom}`)
      } else {
        bad('A2b crossing ghost wears the seam cut edge', 'no [data-drag-ghost] mid-drag')
      }
    }
  }

  /* --- E: desktop editing parity (Phase 2) -------------------------------- */
  {
    // open a 13 h watch's popover
    const wb = await blockBox(page, 'Night Watch')
    const target = (await readEvents(page)).find((e) => e.title === 'Night Watch' && e.hours === 13)
    if (wb && target) {
      await page.mouse.click(wb.x + wb.width / 2, wb.y + 8)
      await page.waitForTimeout(300)

      const hasEdit = await page.evaluate(() =>
        [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Edit'),
      )
      hasEdit
        ? ok('E1 desktop popover offers Edit')
        : bad('E1 desktop popover offers Edit', 'actions are still view + Remove only')

      if (hasEdit) {
        await page.locator('button', { hasText: /^Edit$/ }).first().click()
        await page.waitForTimeout(400)
        const editorOpen = await page.evaluate(() =>
          /A SMALL CORRECTION|QUICK EDIT/i.test(document.body.innerText),
        )
        editorOpen
          ? ok('E2 Edit opens the editor on desktop')
          : bad('E2 Edit opens the editor on desktop', 'no editor appeared')

        if (editorOpen) {
          // E3: a 12 h retime of a 13 h watch must stay cross-midnight
          await page.getByLabel('DURATION down').click()
          await page.getByLabel('DURATION down').click()
          await page.waitForTimeout(150)
          await page.locator('button', { hasText: /^(?:SO NOTED|SAVE)$/ }).first().click()
          await page.waitForTimeout(400)
          const ed = (await readEvents(page)).find((e) => e.id === target.id)
          ed && near(ed.hours, 12, 0.001) && ed.startHour + ed.hours > 24
            ? ok('E3 a 12 h retime stays cross-midnight', `${ed.startHour} + ${ed.hours} h`)
            : bad(
                'E3 a 12 h retime stays cross-midnight',
                ed ? `${ed.startHour} + ${ed.hours} h` : 'event lost',
              )
        }
      }

      // E4: Escape closes the popover (the report verified it did nothing)
      const wb2 = await blockBox(page, 'Night Watch')
      if (wb2) {
        await page.mouse.click(wb2.x + wb2.width / 2, wb2.y + 8)
        await page.waitForTimeout(300)
        const opened = await page.evaluate(() =>
          [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Edit'),
        )
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
        const closed = await page.evaluate(
          () => ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Edit'),
        )
        opened && closed
          ? ok('E4 Escape closes the popover')
          : bad('E4 Escape closes the popover', `opened=${opened} closed=${closed}`)
      }
    }
  }

  /* --- E5: last week's overnight tail explains itself (M-02) -------------- */
  {
    // seed a Sunday-night watch that runs into next Monday, then view next week
    await page.evaluate(() => {
      const s = window.__events.getState()
      // the viewed week's LAST column (Sunday, weekStart = Monday), derived
      // from now — not from another event, which earlier checks have moved
      const now = new Date()
      const sunday = new Date(now)
      sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7))
      sunday.setHours(19, 0, 0, 0)
      s.addEvent({
        source: 'manual',
        kind: 'shift',
        title: 'Boundary Watch',
        start: sunday.toISOString(),
        end: new Date(sunday.getTime() + 13 * 3600000).toISOString(),
      })
    })
    await page.waitForTimeout(300)
    await page.getByLabel('Next').click() // page to the following week
    await page.waitForTimeout(500)
    const tail = await blockBox(page, 'Boundary Watch')
    if (tail) {
      await page.mouse.move(tail.x + tail.width / 2, tail.y + 6)
      await page.mouse.down()
      await page.mouse.move(tail.x + tail.width / 2, tail.y + 30, { steps: 4 })
      await page.mouse.up()
      await page.waitForTimeout(400)
      const said = await page.evaluate(() => /(?:begins|starts) last week/i.test(document.body.innerText))
      said
        ? ok("E5 last week's tail explains itself")
        : bad("E5 last week's tail explains itself", 'drag still fails silently')
    } else {
      bad("E5 last week's tail explains itself", 'no tail block rendered in the next week')
    }
    await page.getByLabel('Previous').click()
    await page.waitForTimeout(300)
  }

  /* --- E6: a clash keeps the editor open and changes nothing -------------- */
  {
    // fresh demo estate — earlier checks have moved things around
    const c = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      timezoneId: 'Asia/Jerusalem',
    })
    const q = await c.newPage()
    await q.goto(`${BASE}/?demo`, { waitUntil: 'networkidle' })
    await q.waitForTimeout(700)

    const sleep = (await readEvents(q)).find((e) => e.title === 'Sleep')
    const sb = await blockBox(q, 'Sleep')
    if (sleep && sb) {
      await q.mouse.click(sb.x + sb.width / 2, sb.y + 8)
      await q.waitForTimeout(300)
      await q.locator('button', { hasText: /^Edit$/ }).first().click()
      await q.waitForTimeout(400)
      // grow 09:00–15:00 past the 19:00 watch on the same day
      for (let i = 0; i < 22; i++) await q.getByLabel('DURATION up').click()
      await q.waitForTimeout(150)
      await q.locator('button', { hasText: /^(?:SO NOTED|SAVE)$/ }).first().click()
      await q.waitForTimeout(450)

      const stillOpen = await q.evaluate(() => /A SMALL CORRECTION|QUICK EDIT/i.test(document.body.innerText))
      const said = await q.evaluate(() => /already (?:spoken for|taken)/i.test(document.body.innerText))
      const after = (await readEvents(q)).find((e) => e.id === sleep.id)
      stillOpen && said
        ? ok('E6 a clash keeps the editor open, with a word')
        : bad('E6 a clash keeps the editor open, with a word', `open=${stillOpen} said=${said}`)
      after && near(after.hours, sleep.hours, 0.001)
        ? ok('E6 a rejected save changes nothing', `${after.hours} h`)
        : bad('E6 a rejected save changes nothing', `${sleep.hours} → ${after?.hours}`)
    } else {
      bad('E6 a clash keeps the editor open, with a word', 'no Sleep block to edit')
    }
    await c.close()
  }

  /* --- Q: quick-add opens its world (Phase 3) ----------------------------- */
  {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      timezoneId: 'Asia/Jerusalem',
    })
    const q = await c.newPage()
    await q.goto(`${BASE}/?demo`, { waitUntil: 'networkidle' })
    await q.waitForTimeout(700)

    // Wednesday has study 15:00–16:30 then training 17:00–18:30 — click the
    // gap so only short templates can fit.
    const grid = await q.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(
        (d) => d.className.includes('overflow-hidden') && d.className.includes('rounded-xl'),
      )
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width }
    })
    const colW = grid.width / 7
    // Wednesday's 18:30 → 20:00 gap: 1.5 h free, so Run (1.0) and Strength
    // (1.5) fit while The Watch (13), Sleep (6) and Study (2.0) cannot.
    await q.mouse.click(grid.left + colW * 2 + colW / 2, grid.top + 18.5 * 24 + 3)
    await q.waitForTimeout(400)

    // scope to the popover — event blocks are buttons whose text starts the same way
    const state = await q.evaluate(() => {
      const pop = document.querySelector('[data-manor-popover]')
      if (!pop) return []
      return [...pop.querySelectorAll('button')]
        .filter((b) => /\d\.\d\s*h$/.test(b.textContent?.trim() ?? ''))
        .map((b) => ({ label: b.textContent.trim().slice(0, 22), disabled: b.disabled }))
    })
    if (state.length === 0) {
      bad('Q1 templates fit-check', 'quick-add popover did not open')
    } else {
      const watch = state.find((s) => s.label.startsWith('The Watch'))
      const sleep = state.find((s) => s.label.startsWith('Sleep'))
      watch?.disabled && sleep?.disabled
        ? ok('Q1 templates that cannot fit render disabled', `${state.length} listed, long ones dimmed`)
        : bad(
            'Q1 templates that cannot fit render disabled',
            state.map((s) => `${s.label}:${s.disabled ? 'off' : 'on'}`).join(' '),
          )
      state.length === 6
        ? ok('Q1 the menu shape stays stable', 'all six still listed')
        : bad('Q1 the menu shape stays stable', `${state.length} templates listed, expected 6`)

      // Q2: an ENABLED template must never bounce with "occupied, sir"
      const enabled = state.find((s) => !s.disabled)
      if (enabled) {
        // scope to the popover for the same reason Q1 does: an event BLOCK on
        // the grid is also a button whose text starts with the template title,
        // and the first page-wide match can be one sitting UNDER the popover —
        // which Playwright waits 30 s to become clickable, taking the suite
        // down with it
        await q.locator('[data-manor-popover] button', {
          hasText: new RegExp(`^${enabled.label.slice(0, 8)}`),
        })
          .first()
          .click()
        await q.waitForTimeout(450)
        const bounced = await q.evaluate(() => /already spoken for|occupied/i.test(document.body.innerText))
        bounced
          ? bad('Q2 an enabled template never bounces', `"${enabled.label}" was offered and rejected`)
          : ok('Q2 an enabled template never bounces', `booked "${enabled.label}"`)
      }
    }

    // Q3: "Something else…" books a free-form event. Friday 20:00 is clear.
    await q.keyboard.press('Escape')
    await q.waitForTimeout(200)
    await q.mouse.click(grid.left + colW * 5 + colW / 2, grid.top + 20 * 24 + 3)
    await q.waitForTimeout(400)
    const rowThere = await q.evaluate(() => /Something else/.test(document.body.innerText))
    if (!rowThere) {
      bad('Q3 free-form row exists', 'no "Something else…" row in the popover')
    } else {
      ok('Q3 free-form row exists')
      await q.locator('button', { hasText: /Something else/ }).first().click()
      await q.waitForTimeout(300)
      await q.locator('input[type="text"]').first().fill('Dentist')
      await q.getByLabel('DURATION down').click() // 1.0 h → 0.5 h
      await q.waitForTimeout(150)
      await q.locator('button', { hasText: /^(?:ON THE BOOKS|ADD IT)$/ }).first().click()
      await q.waitForTimeout(450)
      const booked = (await readEvents(q)).find((e) => e.title === 'Dentist')
      booked && near(booked.hours, 0.5, 0.001)
        ? ok('Q3 "Dentist · 0.5 h" books with its own title', `${booked.hours} h, kind ${booked.kind}`)
        : bad('Q3 "Dentist · 0.5 h" books with its own title', booked ? `${booked.hours} h` : 'not booked')
    }
    await c.close()
  }

  /* --- A7: a block's accessible name is not title+time run together ------- */
  {
    const named = await page.evaluate(() => {
      const b = document.querySelector('[data-event-block]')
      const label = b?.getAttribute('aria-label') ?? ''
      // the visible text composes them with only a margin, e.g.
      // "Linear Algebra15:00 → 16:30" — the label must separate them
      return { label, ok: /,\s*\d\d:\d\d/.test(label) }
    })
    named.ok
      ? ok('A7 blocks spell their name and time apart', named.label.slice(0, 46))
      : bad('A7 blocks spell their name and time apart', `aria-label: "${named.label}"`)
  }

  /* --- A3: no console errors --------------------------------------------- */
  errors.length === 0
    ? ok('A3 console clean')
    : bad('A3 console clean', errors.slice(0, 2).join(' | '))

  /* --- A4: desktop can reach the grid + an add control on a FRESH estate --- */
  //  (Phase 1 acceptance — expected to FAIL until Phase 1 lands)
  const ctx2 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Asia/Jerusalem',
  })
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/`, { waitUntil: 'networkidle' }) // no ?demo → empty estate
  await p2.waitForTimeout(600)
  const emptyState = await p2.evaluate(() => {
    const ticks = [...document.querySelectorAll('*')].filter(
      (n) => n.children.length === 0 && /^\d\d:00$/.test(n.textContent?.trim() ?? ''),
    )
    const txt = document.body.innerText
    return {
      hasGrid: ticks.length >= 5,
      hasQuickAdd: /QUICK ADD/i.test(txt),
      hasWhatIf: /WHAT[- ]?IF/i.test(txt),
    }
  })
  emptyState.hasGrid
    ? ok('A4 empty week still renders the grid (Phase 1)')
    : bad('A4 empty week still renders the grid (Phase 1)', 'no hour axis on a fresh desktop estate')
  emptyState.hasQuickAdd
    ? ok('A4 desktop has an add control (Phase 1)')
    : bad('A4 desktop has an add control (Phase 1)', 'no QUICK ADD in the chrome')
  emptyState.hasWhatIf
    ? ok('A4 empty week can be rehearsed (Phase 1)')
    : bad('A4 empty week can be rehearsed (Phase 1)', 'What-If hidden on an empty week')

  /* --- A5: desktop QUICK ADD actually books (the lifted mailbox) ---------- */
  await p2.getByText('QUICK ADD', { exact: false }).first().click()
  await p2.waitForTimeout(350)
  const popped = await p2.evaluate(() => /The Watch|Study|Sleep/.test(document.body.innerText))
  if (!popped) {
    bad('A5 desktop QUICK ADD opens the template popover', 'nothing opened — mailbox unconsumed?')
  } else {
    ok('A5 desktop QUICK ADD opens the template popover')
    // the button reads "Study2.0 h" — a dot span, a bare text node, an hours
    // span — so match the composed label, not an exact "Study"
    await p2.locator('button', { hasText: /^Study\s*\d/ }).first().click()
    await p2.waitForTimeout(400)
    const booked = await readEvents(p2)
    booked?.some((e) => e.title === 'Study')
      ? ok('A5 desktop QUICK ADD books an event', `${booked.length} event(s) on the books`)
      : bad('A5 desktop QUICK ADD books an event', 'store still empty after picking a template')
  }

  /* --- A6: month → day tap lands on that week's grid, never a card -------- */
  await p2.getByText('Month', { exact: true }).first().click()
  await p2.waitForTimeout(400)
  const dayCell = p2.locator('button', { hasText: /^\d{1,2}$/ }).nth(8)
  if ((await dayCell.count()) > 0) {
    await dayCell.click()
    await p2.waitForTimeout(450)
    const back = await p2.evaluate(() => {
      const axis = [...document.querySelectorAll('div.w-12.flex-none')].find((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      return { hasGrid: !!axis }
    })
    back.hasGrid
      ? ok('A6 month → day lands on the grid')
      : bad('A6 month → day lands on the grid', 'landed on a card, not a calendar')
  }
  await ctx2.close()
}

/* ------------------------------------------- the estate agrees with itself */

/**
 * M-03 regression. The exam heads-up and the Study wing's briefing answer the
 * same question — "is anything on the books before this exam, sir?" — and used
 * to compute it two different ways, so with past sessions done and nothing
 * booked ahead the estate said "nothing on the books" and "two hours on the
 * books" on one screen. Checked in both states the fix has to survive.
 *
 * The check BUILDS its own state. It used to lean on the ?demo fixture having
 * "a PAST Linear Algebra session and none ahead", which is not a property the
 * fixture actually has: its blocks are seeded at fixed offsets into the week,
 * so which of them are past depends on the weekday the harness runs on, and
 * one of them is marked done while still being in the future. Both checks were
 * therefore red for months without anything being wrong.
 *
 * Note what is deliberately NOT collapsed: examProgress (hours already DONE)
 * and bookedHoursBeforeExam (hours still SCHEDULED) are different questions,
 * and the briefing prints both — "… hours behind you and … more on the books".
 * Only the second is what M-03 is about.
 */
async function briefingChecks(browser) {
  const { page } = await fresh(browser, { width: 1440, height: 1200 })

  /** what each surface currently claims about the run-up to the exam */
  const readClaims = () =>
    page.evaluate(() => {
      const text = document.body.innerText
      return {
        // the Manor's heads-up appears ONLY when nothing is booked ahead
        headsUpNothing: /exam is .*(?:with nothing on the books|and you have no study booked)/i.test(text),
        // …and the Study briefing's own trailing clause must say the same
        briefingNothing: /and (?:nothing further on the books|nothing more booked)/i.test(text),
        // the greedy prefix forces the LAST "and": the sentence can contain an
        // earlier one inside a spelled-out figure ("one and a half hours
        // behind you and three more on the books"), and anchoring on the first
        // captured half the clause
        briefingAhead: text.match(/.*\band ([^.]+?) more (?:on the books|booked)/i)?.[1] ?? null,
      }
    })

  /* --- state 1: work done, nothing booked ahead -------------------------- */
  await page.evaluate(() => {
    const ev = window.__events.getState()
    const now = Date.now()
    // strip every maths session that has not already ended…
    ev.events
      .filter(
        (e) =>
          e.kind === 'study' &&
          e.sourceRef === 'subj:demo-subj-math' &&
          new Date(e.end).getTime() > now,
      )
      .forEach((e) => ev.deleteEvent(e.id))
    // …and log one that genuinely happened, so "hours behind you" is non-zero
    // while "on the books" is empty — the exact shape M-03 got wrong
    const start = new Date(now - 26 * 3600000)
    start.setHours(10, 0, 0, 0)
    const logged = window.__events.getState().addEvent({
      source: 'study',
      kind: 'study',
      title: 'Linear Algebra',
      sourceRef: 'subj:demo-subj-math',
      start: start.toISOString(),
      end: new Date(start.getTime() + 2 * 3600000).toISOString(),
    })
    window.__study.getState().fulfill(logged.id, 'done')
  })
  await page.waitForTimeout(600)

  const past = await readClaims()
  past.headsUpNothing && past.briefingNothing
    ? ok('B1 past sessions only: both lines say nothing is booked', 'heads-up and briefing agree')
    : bad(
        'B1 past sessions only: both lines say nothing is booked',
        `heads-up nothing=${past.headsUpNothing}, briefing nothing=${past.briefingNothing}` +
          (past.briefingAhead ? `, briefing claims "${past.briefingAhead}" ahead` : ''),
      )

  /* --- state 2: three hours booked ahead — both lines must flip together --
     Three, not two: state 1 logged exactly two hours DONE, so a briefing that
     went back to reporting fulfilled hours here would still read "two" and
     slip past. The two figures have to differ for this to discriminate. */
  await page.evaluate(() => {
    // an hour from now, so it lands before the end of the exam's day even if
    // the exam is today
    const start = new Date(Date.now() + 3600000)
    window.__events.getState().addEvent({
      source: 'study',
      kind: 'study',
      title: 'Linear Algebra',
      sourceRef: 'subj:demo-subj-math',
      start: start.toISOString(),
      end: new Date(start.getTime() + 3 * 3600000).toISOString(),
    })
  })
  await page.waitForTimeout(600)
  const ahead = await readClaims()
  !ahead.headsUpNothing && !ahead.briefingNothing && ahead.briefingAhead === 'three'
    ? ok('B2 sessions booked ahead: both lines agree', 'briefing "three more", heads-up gone')
    : bad(
        'B2 sessions booked ahead: both lines agree',
        `heads-up nothing=${ahead.headsUpNothing}, briefing nothing=${ahead.briefingNothing}, briefing ahead="${ahead.briefingAhead}"`,
      )

  /* --- B3: the now-relative block is labelled as such --------------------- */
  const tagged = await page.evaluate(() => /\bTODAY\b/.test(document.body.innerText))
  tagged
    ? ok('B3 heads-ups are tagged now-relative')
    : bad('B3 heads-ups are tagged now-relative', 'no TODAY tag on the heads-up block')

  /* --- B4: paging off the current week says so ---------------------------- */
  const before = await page.evaluate(() => /\bVIEWING\b/.test(document.body.innerText))
  await page.getByLabel('Next').click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => /\bVIEWING\b/.test(document.body.innerText))
  !before && after
    ? ok('B4 an off-week strip marks itself', 'VIEWING appears only off the current week')
    : bad('B4 an off-week strip marks itself', `current week=${before}, next week=${after}`)
  await page.getByLabel('Previous').click()
  await page.waitForTimeout(400)

  /* --- B5: the legend is visible on DESKTOP, in both views ---------------- */
  const weekLegend = await page.evaluate(() => {
    const t = document.body.innerText
    return /THE WATCH/i.test(t) && /strain/i.test(t)
  })
  weekLegend
    ? ok('B5 week view shows a legend on desktop')
    : bad('B5 week view shows a legend on desktop', 'no key above the grid')
  await page.getByText('Month', { exact: true }).first().click()
  await page.waitForTimeout(500)
  const monthLegend = await page.evaluate(() => {
    const t = document.body.innerText
    return /runs past/i.test(t) && /strain/i.test(t)
  })
  monthLegend
    ? ok('B5 month view shows its legend on desktop')
    : bad('B5 month view shows its legend on desktop', 'still behind md:hidden')
  await page.getByText('Week', { exact: true }).first().click()
  await page.waitForTimeout(400)

  /* --- B6: What-If is honest about its controls --------------------------- */
  await page.getByText('WHAT-IF', { exact: false }).first().click()
  await page.waitForTimeout(600)
  const wi = await page.evaluate(() => {
    const t = document.body.innerText
    const apply = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'APPLY',
    )
    return {
      saysLedger: /ledger is sandboxed/i.test(t),
      rehearsal: /rehearsal|draft/i.test(t),
      applyDisabled: apply ? apply.disabled : null,
      noChanges: /no changes yet/i.test(t),
    }
  })
  wi.applyDisabled === true && wi.noChanges
    ? ok('B6 APPLY is disabled at zero changes')
    : bad('B6 APPLY is disabled at zero changes', `disabled=${wi.applyDisabled} counter=${wi.noChanges}`)
  !wi.saysLedger && wi.rehearsal
    ? ok('B6 the banner no longer says "ledger"')
    : bad('B6 the banner no longer says "ledger"', `ledger=${wi.saysLedger} rehearsal=${wi.rehearsal}`)

  /* --- B7: the desktop Difference panel reports a near-watch conflict ----- */
  // M-06: mobile computed and showed this; desktop showed hours only, so the
  // ▲ was on the block but never where the decision gets made.
  await page.evaluate(() => {
    const s = window.__events.getState()
    const watch = s.events.find((e) => e.kind === 'shift' && !e.allDay)
    if (!watch) return
    const end = new Date(watch.start) // train hard up against a watch's start
    const start = new Date(end.getTime() - 30 * 60000)
    s.addEvent({
      source: 'manual',
      kind: 'training',
      title: 'Squeezed session',
      start: new Date(start.getTime() - 30 * 60000).toISOString(),
      end: start.toISOString(),
    })
  })
  await page.waitForTimeout(700)
  const panelSaid = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')].find((d) =>
      /THE DIFFERENCE|WHAT CHANGES/.test(d.textContent ?? ''),
    )
    return /minutes (?:before|after) (?:the watch|your shift)/i.test(panel?.textContent ?? '')
  })
  panelSaid
    ? ok('B7 the desktop Difference panel names the conflict')
    : bad('B7 the desktop Difference panel names the conflict', 'panel still shows hours only')
}

/* --------------------------------------------------- mobile rail geometry */

async function mobileChecks(browser) {
  const { page } = await fresh(browser, { width: 390, height: 844 })

  // Measure the printed hour rail against the blocks it claims to describe.
  const geo = await page.evaluate((PXH) => {
    // BOTH trees are in the DOM at every width — desktop is `hidden md:block`,
    // so at 390 px it is display:none with all-zero rects. Measuring those
    // silently "passes" every geometry check, so filter to what is rendered.
    const shown = (el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    // scope to the TickAxis element itself (w-12 flex-none) — globbing every
    // "NN:00" on the page picks up block time text and toasts too.
    const axis = [...document.querySelectorAll('div.w-12.flex-none')].find(shown)
    const labels = axis
      ? [...axis.children].filter((n) => /^\d\d:00$/.test(n.textContent?.trim() ?? ''))
      : []
    const rail = labels.map((n) => {
      const r = n.getBoundingClientRect()
      return { label: n.textContent.trim(), centreY: r.top + r.height / 2 }
    })
    const blocks = [...document.querySelectorAll('[data-event-block]')]
      .filter(shown)
      .map((b) => {
        const r = b.getBoundingClientRect()
        return { text: b.textContent?.slice(0, 24) ?? '', top: r.top, height: r.height }
      })
    return { rail, blocks, PXH }
  }, PXH)

  if (geo.rail.length < 2) {
    bad('M1 mobile rail found', `only ${geo.rail.length} hour labels`)
    return
  }
  ok('M1 mobile rail found', `${geo.rail.length} labels, ${geo.blocks.length} blocks`)

  // A 09:00 Sleep block exists in the demo week. Compare its top to the 09:00
  // label centre — the plan's exact acceptance test.
  const nineLabel = geo.rail.find((r) => r.label === '09:00')
  const sleep = geo.blocks.find((b) => /Sleep/.test(b.text))
  if (nineLabel && sleep) {
    const delta = sleep.top - nineLabel.centreY
    near(delta, 0, 2)
      ? ok('M2 rail agrees with blocks', `09:00 label ↔ 09:00 block: ${delta.toFixed(1)} px`)
      : bad(
          'M2 rail agrees with blocks',
          `09:00 label centre y=${nineLabel.centreY.toFixed(0)}, 09:00 block top y=${sleep.top.toFixed(0)} — off by ${delta.toFixed(1)} px`,
        )
  } else {
    bad('M2 rail agrees with blocks', `label=${!!nineLabel} sleepBlock=${!!sleep}`)
  }

  // the offset must be uniform, not a per-hour drift: check rail spacing == PXH
  const spans = []
  for (let i = 1; i < geo.rail.length; i++) {
    const a = parseInt(geo.rail[i - 1].label, 10)
    const b = parseInt(geo.rail[i].label, 10)
    if (b > a) spans.push((geo.rail[i].centreY - geo.rail[i - 1].centreY) / (b - a))
  }
  const avg = spans.reduce((s, v) => s + v, 0) / (spans.length || 1)
  near(avg, PXH, 0.6)
    ? ok('M3 rail spacing is uniform', `${avg.toFixed(2)} px/h`)
    : bad('M3 rail spacing is uniform', `${avg.toFixed(2)} px/h, expected ${PXH}`)

  /* --- M4: the mobile FAB still targets the day on screen ----------------- */
  // Phase 1 moved the quick-add mailbox consumer out of MobileWeek; mobile must
  // be unchanged, so the sheet has to open on the VISIBLE day, not on today.
  // page to another day first, so "opens on the VISIBLE day" is a real claim
  const chips = page.locator('button', { hasText: /^[MTWFS]\s*\d{1,2}$/ })
  if ((await chips.count()) >= 7) {
    await chips.nth(2).click()
    await page.waitForTimeout(700)
  }
  const visibleDay = await page.evaluate(() => {
    const hdrs = [...document.querySelectorAll('div')]
      .filter((d) => /^(SUN|MON|TUE|WED|THU|FRI|SAT)\s+\d{1,2}$/.test(d.textContent?.trim() ?? ''))
      .filter((d) => {
        const r = d.getBoundingClientRect()
        return r.width > 0 && r.left >= 0 && r.left < window.innerWidth
      })
    return hdrs[0]?.textContent?.trim() ?? null
  })

  // the FAB is an icon button — identified by aria-label, it has no text
  const fab = page.getByLabel('Quick add')
  if ((await fab.count()) > 0) {
    await fab.first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
    const opened = await page.evaluate(() => /The Watch|Sleep/.test(document.body.innerText))
    opened
      ? ok('M4 mobile FAB still opens quick-add', `on the visible day: ${visibleDay ?? '?'}`)
      : bad('M4 mobile FAB still opens quick-add', 'sheet did not open after the mailbox lift')
  } else {
    bad('M4 mobile FAB still opens quick-add', 'no "Quick add" control found')
  }
}

/* -------------------------------------------------------------------- run */

/** first Chromium we can actually find; undefined = let Playwright resolve it */
function findChrome() {
  if (EXEC) return EXEC
  const candidates = [
    '/opt/pw-browsers/chromium', // the browser pane's preinstalled build
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  return candidates.find((p) => existsSync(p))
}

// fail loudly and usefully: a missing browser is the one setup problem that
// otherwise reads as "the app is broken"
let browser
try {
  browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  })
} catch (e) {
  console.error(`Could not launch Chromium: ${String(e).split('\n')[0]}`)
  console.error('Set CHROME_PATH to a Chrome/Chromium binary and try again.')
  process.exit(2)
}

// and a dev server that isn't running is the other one
try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch {
  console.error(`No app at ${BASE} — start it with \`npm run dev\` first.`)
  await browser.close()
  process.exit(2)
}

if (process.argv.includes('--probe')) {
  await probe(browser)
} else {
  // one broken check must not hide the other twenty — always print the table
  for (const [name, fn] of [
    ['desktop', desktopChecks],
    ['briefing', briefingChecks],
    ['mobile', mobileChecks],
  ]) {
    try {
      await fn(browser)
    } catch (e) {
      bad(`${name} suite crashed`, String(e).split('\n')[0].slice(0, 120))
    }
  }
  console.log('')
  for (const r of results) {
    console.log(`${r.pass ? ' PASS' : '*FAIL'}  ${r.name}${r.detail ? `  —  ${r.detail}` : ''}`)
  }
  const failed = results.filter((r) => !r.pass).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  // non-zero so this can gate a commit rather than just inform one
  if (failed > 0) process.exitCode = 1
}
await browser.close()
