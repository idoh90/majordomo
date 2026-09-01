#!/usr/bin/env node
/**
 * Recast harness — the Grounds' edit-a-session regression gate.
 *
 * Backing out of an edit lands on the same method picker a new workout opens
 * on, and taking another door from it rewrites the record: save writes every
 * method's fields, so `exercises: undefined` reaches `updateWorkout` as a
 * DELETION. Three exercises and nine sets could be wiped by three taps, with
 * nothing said and nothing to undo. That is a numeric contract wearing a
 * plausible face — the same shape of bug as the Manor's cross-midnight drag —
 * so it is checked by machine rather than by eye.
 *
 * What it holds the app to:
 *   · the method step, standing over a record, says so and marks the door that
 *     record came through
 *   · a change that would cost the session something says what, before it costs
 *     it — and cancelling costs nothing
 *   · a change that costs nothing is not interrupted
 *   · a confirmed recast still does what it always did
 *   · an untouched round trip through the picker changes no stored figure
 *
 * Usage (bash) — needs the dev server up:
 *   npm run dev &
 *   npm run check:recast
 *
 * Browser: uses CHROME_PATH if set, else the usual preinstalled locations.
 * Point it at another origin with  RECAST_BASE=https://…
 *
 * HONEST LIMITS — do not read a green run as full coverage:
 *   · Desktop pointer clicks only. The mobile sheet renders the same component
 *     tree, but nothing here proves a thumb can reach the confirm's buttons.
 *   · The guard's copy is asserted by the figures it must contain, not
 *     word-for-word — rewording the sentence will not fail this.
 *   · Nothing here covers the sport door, which is shut in shipped builds and
 *     unreachable from an edit (see `canBack` in AddWorkoutSheet).
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const EXEC = process.env.CHROME_PATH || undefined
const BASE = process.env.RECAST_BASE || 'http://localhost:5173'

const results = []
const ok = (name, detail = '') => results.push({ pass: true, name, detail })
const bad = (name, detail = '') => results.push({ pass: false, name, detail })
const is = (name, got, want) =>
  got === want ? ok(name) : bad(name, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
const eq = (name, got, want) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? ok(name)
    : bad(name, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
const holds = (name, text, ...needles) => {
  const missing = needles.filter((n) => !text.includes(n))
  missing.length === 0
    ? ok(name)
    : bad(name, `"${text.replace(/\n/g, ' | ')}" is missing ${missing.join(', ')}`)
}

/** the session under test: logged the careful way, three exercises deep */
const SESSION = {
  id: 'w-recast',
  performedAt: new Date(Date.now() - 3_600_000).toISOString(),
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  method: 'custom',
  primary: ['chest', 'lats'],
  secondary: ['triceps'],
  effort: 8,
  strainFeel: 6,
  repStyle: 'mixed',
  setsTotal: 9,
  durationMin: 62,
  exercises: [
    {
      exerciseId: 'x1',
      name: 'Barbell Bench Press',
      primary: ['chest'],
      secondary: ['triceps'],
      sets: [
        { weightKg: 80, reps: 8 },
        { weightKg: 82.5, reps: 6 },
        { weightKg: 82.5, reps: 6 },
      ],
    },
    {
      exerciseId: 'x2',
      name: 'Barbell Row',
      primary: ['lats'],
      secondary: ['biceps'],
      sets: [
        { weightKg: 70, reps: 10 },
        { weightKg: 70, reps: 10 },
        { weightKg: 72.5, reps: 8 },
      ],
    },
    {
      exerciseId: 'x3',
      name: 'Overhead Press',
      primary: ['front-delts'],
      secondary: ['triceps'],
      sets: [
        { weightKg: 45, reps: 8 },
        { weightKg: 45, reps: 7 },
        { weightKg: 45, reps: 6 },
      ],
    },
  ],
}

/* The boot gate shows the LANDING to a browser with no majordomo* key, and an
   empty estate starts the onboarding walk — both correct for a stranger, both
   wrong for a harness whose whole world is one sheet. The sentinel key flips
   the gate (the Manor harness's trick) and a minimal shell blob answers the
   interview; persist's shallow merge fills in every other field. */
async function context(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    timezoneId: 'Asia/Jerusalem',
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('majordomo-harness', '1')
    localStorage.setItem('majordomo-shell', JSON.stringify({ state: { onboarded: true }, version: 4 }))
  })
  return ctx
}

const dialogSel = '[role="dialog"]'
const guardSel = '[role="alertdialog"]'
const title = (page) => page.locator(`${dialogSel} h2`).first().innerText()
const card = (page, name) =>
  page.locator(`${dialogSel} button.card`).filter({ hasText: name }).first()
const press = (page, label) =>
  page.locator(`${dialogSel} button`).filter({ hasText: label }).first().click()
const back = async (page) => page.locator(`${dialogSel} button[aria-label="Back"]`).click()

/** open the sheet on the seeded session's effort step, exactly as the app does
 *  when the detail sheet's EDIT is pressed (?sheet=effort is that dev door) */
async function openEdit(page) {
  await page.goto(`${BASE}/?console=training`, { waitUntil: 'networkidle' })
  await page.evaluate((w) => window.__store.setState({ workouts: [w] }), SESSION)
  await page.goto(`${BASE}/?console=training&sheet=effort`, { waitUntil: 'networkidle' })
  await page.waitForSelector(dialogSel)
}

/** what the store actually holds — the only opinion that matters */
const stored = (page) =>
  page.evaluate(() => {
    const w = window.__store.getState().workouts[0]
    if (!w) return null
    return {
      method: w.method,
      exercises: (w.exercises ?? []).length,
      sets: (w.exercises ?? []).reduce((n, e) => n + e.sets.length, 0),
      weights: (w.exercises ?? []).flatMap((e) => e.sets.map((s) => s.weightKg ?? null)),
      setsTotal: w.setsTotal ?? null,
      durationMin: w.durationMin ?? null,
      primary: [...w.primary].sort(),
    }
  })

/* -------------------------------------------------------- the pure model */
/** recastLoss decides everything above it, so it is scored on its own first —
 *  a dialog that appears for the wrong reason is as bad as one that doesn't */
async function checkModel(page) {
  await page.goto(`${BASE}/?console=training`, { waitUntil: 'networkidle' })
  const m = await page.evaluate(() => {
    const { recastLoss } = window.__recast
    const list = [
      { exerciseId: 'a', name: 'A', primary: [], secondary: [], sets: [{}, {}, {}] },
      { exerciseId: 'b', name: 'B', primary: [], secondary: [], sets: [{}, {}] },
    ]
    const noRun = { distanceKm: '', paceSec: 330, heldSec: 0 }
    const d = (over) => ({
      method: 'custom',
      exercises: [],
      run: noRun,
      setsTotal: '',
      durationMin: '',
      ...over,
    })
    return {
      toRun: recastLoss(d({ method: 'exercises', exercises: list, durationMin: '62' }), 'run'),
      toLift: recastLoss(
        d({ method: 'exercises', exercises: list, setsTotal: '5', durationMin: '62' }),
        'custom',
      ),
      sameDoor: recastLoss(d({ method: 'exercises', exercises: list }), 'exercises'),
      emptyList: recastLoss(d({ method: 'exercises' }), 'run'),
      pplBare: recastLoss(d({ method: 'ppl' }), 'run'),
      pplSized: recastLoss(d({ method: 'ppl', setsTotal: '18', durationMin: '75' }), 'run'),
      pplSizedToLift: recastLoss(
        d({ method: 'ppl', setsTotal: '18', durationMin: '75' }),
        'custom',
      ),
      runFigures: recastLoss(
        d({ method: 'run', run: { distanceKm: '8', paceSec: 330, heldSec: 2677 } }),
        'custom',
      ),
      runBlank: recastLoss(d({ method: 'run' }), 'custom'),
      writtenOff: recastLoss(d({ method: 'run', exercises: list }), 'custom'),
    }
  })

  eq('model · leaving the exercise flow prices the lifts, the sets and the clock', m.toRun, {
    exercises: { exercises: 2, sets: 5 },
    run: null,
    setsTotal: null,
    durationMin: 62,
  })
  eq('model · another LIFT method keeps both size boxes, so only the list is priced', m.toLift, {
    exercises: { exercises: 2, sets: 5 },
    run: null,
    setsTotal: null,
    durationMin: null,
  })
  eq('model · re-entering the same door costs nothing', m.sameDoor, null)
  eq('model · an empty list costs nothing', m.emptyList, null)
  eq('model · a PPL day alone is one tap to restore, so it is not priced', m.pplBare, null)
  eq('model · typed session size dies on the way into conditioning', m.pplSized, {
    exercises: null,
    run: null,
    setsTotal: 18,
    durationMin: 75,
  })
  eq('model · and survives a move between lift methods', m.pplSizedToLift, null)
  eq('model · a run is priced by the two figures it recorded', m.runFigures, {
    exercises: null,
    run: { km: '8', time: '44:37' },
    setsTotal: null,
    durationMin: null,
  })
  eq('model · a run that recorded neither costs nothing', m.runBlank, null)
  eq('model · a list already written off does not ask a second time', m.writtenOff, null)
}

/* ------------------------------------------------- the step and the guard */
async function checkGuard(page) {
  await openEdit(page)
  is('the edit opens on the effort step', await title(page), 'How did it go?')

  await back(page)
  is('one step back is the flow the session was logged through', await title(page), 'What did you lift?')

  await back(page)
  is(
    'the method step no longer wears the new-workout title over a record',
    await title(page),
    'How is it logged?',
  )
  holds(
    'the door this session came through is marked',
    await card(page, 'EXERCISES').innerText(),
    'CURRENT',
  )
  const runCard = await card(page, 'RUN').innerText()
  !runCard.includes('CURRENT')
    ? ok('and only that door is marked')
    : bad('and only that door is marked', runCard)

  // the tap that used to wipe the record
  await card(page, 'RUN').click()
  await page.waitForSelector(guardSel, { timeout: 3000 }).catch(() => {})
  const guard = await page
    .locator(guardSel)
    .innerText()
    .catch(() => '')
  holds(
    'it names what the session holds, in figures',
    guard,
    '3 exercises',
    '9 sets',
    '62 minutes',
  )

  await page.locator(guardSel).getByRole('button', { name: 'Cancel' }).click()
  is('cancelling stays on the method step', await title(page), 'How is it logged?')
  holds(
    'and leaves the draft exactly as it was',
    await card(page, 'EXERCISES').innerText(),
    'CURRENT',
  )
}

/* -------------------------------------- the record survives the round trip */
async function checkRoundTrip(page) {
  await openEdit(page)
  await back(page)
  await back(page)
  await card(page, 'RUN').click()
  await page.locator(guardSel).getByRole('button', { name: 'Cancel' }).click()
  // back through its own door and out again, touching nothing
  await card(page, 'EXERCISES').click()
  await press(page, 'Continue')
  await press(page, 'Save')
  await page.waitForTimeout(400)
  eq('a refused recast saves the session back whole', await stored(page), {
    method: 'custom',
    exercises: 3,
    sets: 9,
    weights: [80, 82.5, 82.5, 70, 70, 72.5, 45, 45, 45],
    setsTotal: 9,
    durationMin: 62,
    primary: ['chest', 'lats'],
  })
}

/* ------------------------------------------- a consented recast still works */
async function checkConsented(page) {
  await openEdit(page)
  await back(page)
  await back(page)
  await card(page, 'RUN').click()
  await page.locator(guardSel).getByRole('button', { name: 'Change method' }).click()
  is('confirming takes the new door', await title(page), 'How far?')
  await press(page, 'Continue')
  await press(page, 'Save')
  await page.waitForTimeout(400)
  const after = await stored(page)
  is('a consented recast still becomes a run', after?.method, 'run')
  is('and clears the list it was told it would clear', after?.sets, 0)
}

/* ------------------------------------------------ a new workout is not nagged */
async function checkBlankFlow(page) {
  await page.goto(`${BASE}/?console=training`, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.__store.setState({ workouts: [] }))
  await page.goto(`${BASE}/?console=training&sheet=add`, { waitUntil: 'networkidle' })
  await page.waitForSelector(dialogSel)
  is('a new workout still opens on the new-workout title', await title(page), 'Log Workout')
  const first = await page.locator(`${dialogSel} button.card`).first().innerText()
  !first.includes('CURRENT')
    ? ok('with nothing marked CURRENT')
    : bad('with nothing marked CURRENT', first)
  await card(page, 'PUSH / PULL / LEGS').click()
  is('and a costless choice is never interrupted', await title(page), 'What kind of day?')
}

/* ------------------------------------------------------------------- main */
function findChrome() {
  if (EXEC) return EXEC
  return [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p))
}

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

try {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch {
  console.error(`No app at ${BASE} — start it with \`npm run dev\` first.`)
  await browser.close()
  process.exit(2)
}

const ctx = await context(browser)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

// one broken check must not hide the rest — always print the table
for (const [name, fn] of [
  ['model', checkModel],
  ['guard', checkGuard],
  ['round trip', checkRoundTrip],
  ['consented', checkConsented],
  ['blank flow', checkBlankFlow],
]) {
  try {
    await fn(page)
  } catch (e) {
    bad(`${name} — threw`, String(e).split('\n')[0])
  }
}

if (errors.length) bad('the console stayed quiet', errors.slice(0, 3).join(' · '))
else ok('the console stayed quiet')

console.log('')
for (const r of results)
  console.log(`  ${r.pass ? '·' : '✗'} ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`)
const failed = results.filter((r) => !r.pass).length
console.log(`\n  ${results.length - failed}/${results.length} passed\n`)
await browser.close()
process.exit(failed ? 1 : 0)
