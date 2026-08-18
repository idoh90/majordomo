#!/usr/bin/env node
/**
 * SHARE-FOLD HARNESS — can a crew touch something it does not own?
 *
 * Drives the real share fold in a real page with FORGED records: a record's
 * kind, id and payload are all whatever the pushing client says they are, so
 * this is the exact shape a hostile crewmate can put on the wire. Everything
 * a crew is allowed to do is asserted too — a fold that refuses everything
 * would pass a security check and break the feature.
 *
 * Why it exists. The fold matched incoming records by id alone and trusted
 * them to belong where they claimed. A crew could therefore name a venture it
 * had never contained — a private one, or one belonging to a different crew —
 * and the fold would hand it over: rename it, receive every later edit, hang
 * cards on it, strike them off, and post milestones whose titles appeared as
 * chips on the owner's own calendar. Anyone who had ever been on a crew with
 * you kept the ids needed to do it. None of that is visible by reading the
 * code, which is precisely why it survived: every line looked reasonable.
 *
 * Run against the PRE-FIX fold this scores 6/19.
 *
 * Usage — needs the dev server up:
 *   npm run dev &
 *   npm run check:share
 *
 * Browser: uses CHROME_PATH if set, else Playwright's own resolution.
 * Point it elsewhere with SHARE_BASE=https://…
 */
import { chromium } from 'playwright-core'

const BASE = process.env.SHARE_BASE || 'http://localhost:5173'
const said = []
const say = (pass, name, detail = '') => said.push([pass ? 'PASS' : '>>> FAIL', name, detail])

const S1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' // a crew I am in
const S2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' // a crew the attacker controls

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => say(false, 'page error', String(e)))

await p.addInitScript(({ S1, S2 }) => {
  const now = '2026-01-01T00:00:00.000Z'
  localStorage.setItem('majordomo-workshop', JSON.stringify({
    version: 3,
    state: {
      ventures: [
        // never shared with anyone
        { id: 'v-private', name: 'Private Thing', status: 'building', goalH: 0, order: 0, createdAt: now },
        // belongs to a crew I am in
        { id: 'v-crew1', name: 'Crew One', status: 'building', goalH: 0, order: 1, createdAt: now, shareId: S1 },
        // left a crew: private now, but remembers where it came from
        { id: 'v-left', name: 'Left Behind', status: 'building', goalH: 0, order: 2, createdAt: now, formerShareId: S2 },
      ],
      cards: [
        { id: 'c-private', ventureId: 'v-private', type: 'note', title: 'Mine', col: 0, row: 0, createdAt: now },
        { id: 'c-keep', ventureId: 'v-private', type: 'note', title: 'Keep', col: 0, row: 1, createdAt: now },
      ],
      threads: [], milestones: [], sessions: {}, bench: null, workEntries: {}, members: {},
    },
  }))
  localStorage.setItem('majordomo-shell', JSON.stringify({
    version: 4,
    state: { skin: 'midnight', weekStart: 1, onboarded: true, panelTips: true,
             wingOrder: [], wingsOff: [], deskNoticeSeen: true, crewName: 'Rook' },
  }))
}, { S1, S2 })

await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await p.waitForTimeout(600)

/** push forged records into the fold as if they had arrived through `share` */
const fold = (share, records) =>
  p.evaluate(([share, records]) => {
    window.__shareFold(share).apply(records)
    const s = window.__workshop.getState()
    return {
      ventures: s.ventures.map((v) => ({ id: v.id, name: v.name, shareId: v.shareId ?? null })),
      cards: s.cards.map((c) => ({ id: c.id, ventureId: c.ventureId, title: c.title })),
      milestones: s.milestones.map((m) => ({ id: m.id, ventureId: m.ventureId, title: m.title })),
      work: Object.entries(s.workEntries).map(([k, e]) => ({ k, ventureId: e.ventureId, h: e.h })),
      markers: window.__events.getState().events
        .filter((e) => e.kind === 'marker')
        .map((e) => e.title),
    }
  }, [share, records])

const rec = (kind, id, payload, deleted = false) => ({ kind, id, payload, deleted })
const venturePayload = (id, name) => ({
  id, name, status: 'building', goalH: 0, createdAt: '2026-01-01T00:00:00.000Z',
})

/* ============================ 1. annexing a PRIVATE venture =============== */
{
  const st = await fold(S2, [rec('venture', 'v-private', venturePayload('v-private', 'ANNEXED'))])
  const v = st.ventures.find((x) => x.id === 'v-private')
  say(v.shareId === null, 'a crew cannot annex a private venture', `shareId=${v.shareId}`)
  say(v.name === 'Private Thing', 'and cannot rename it', `name=${v.name}`)
}

/* ============================ 2. annexing ANOTHER crew's venture ========== */
{
  const st = await fold(S2, [rec('venture', 'v-crew1', venturePayload('v-crew1', 'STOLEN'))])
  const v = st.ventures.find((x) => x.id === 'v-crew1')
  say(v.shareId === S1, "a crew cannot annex another crew's venture", `shareId=${v.shareId}`)
  say(v.name === 'Crew One', 'and cannot rename it', `name=${v.name}`)
}

/* ============================ 3. writing onto a private board ============= */
{
  const st = await fold(S2, [
    rec('card', 'c-intruder', { id: 'c-intruder', ventureId: 'v-private', type: 'note', title: 'THEIRS', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('milestone', 'm-intruder', { id: 'm-intruder', ventureId: 'v-private', title: 'THEIR TEXT', on: '2026-02-01', done: false, countFrom: '2026-01-01T00:00:00.000Z' }),
    rec('work', 'w-intruder', { ventureId: 'v-private', at: '2026-01-02T00:00:00.000Z', h: 99, by: 'mallory' }),
  ])
  say(!st.cards.some((c) => c.id === 'c-intruder'), 'a crew cannot hang a card on a private venture')
  say(!st.milestones.some((m) => m.id === 'm-intruder'), 'nor a milestone')
  say(!st.work.some((w) => w.k === 'w-intruder'), 'nor hours on a private venture')
  say(!st.markers.some((t) => /THEIR TEXT/.test(t)),
      'and none of it reaches the personal calendar', `markers=${JSON.stringify(st.markers)}`)
}

/* ============================ 4. overwriting an existing private card ===== */
{
  const st = await fold(S2, [
    rec('card', 'c-private', { id: 'c-private', ventureId: 'v-private', type: 'note', title: 'REWRITTEN', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
  ])
  const c = st.cards.find((x) => x.id === 'c-private')
  say(c.title === 'Mine', 'a crew cannot rewrite a card on a private board', `title=${c.title}`)
}

/* ============================ 5. striking a private card ================== */
{
  const st = await fold(S2, [rec('card', 'c-private', null, true)])
  say(st.cards.some((c) => c.id === 'c-private'), 'a crew cannot strike a card off a private board')
}

/* ============================ 6. deleting a venture it does not hold ====== */
{
  const st = await fold(S2, [rec('venture', 'v-crew1', null, true)])
  say(st.ventures.some((v) => v.id === 'v-crew1'), 'a crew cannot delete another crew’s venture')
}

/* ============================ 7. an envelope lying about its payload ====== */
{
  const st = await fold(S1, [
    rec('card', 'c-harmless', { id: 'c-keep', ventureId: 'v-crew1', type: 'note', title: 'SPOOF', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
  ])
  const dupes = st.cards.filter((c) => c.id === 'c-keep')
  say(dupes.length === 1, 'a payload cannot claim an id the envelope does not', `${dupes.length} cards share that id`)
  say(dupes.every((c) => c.title === 'Keep'), 'and the original is untouched',
      `titles=${dupes.map((c) => c.title).join(',')}`)
}

/* ============================ 8. the LEGITIMATE paths still work ========== */
{
  // the crew I am in may speak for its own venture, and hang things on it
  const st = await fold(S1, [
    rec('venture', 'v-crew1', venturePayload('v-crew1', 'Crew One Renamed')),
    rec('card', 'c-ok', { id: 'c-ok', ventureId: 'v-crew1', type: 'note', title: 'Fine', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('milestone', 'm-ok', { id: 'm-ok', ventureId: 'v-crew1', title: 'Ship it', on: '2026-02-01', done: false, countFrom: '2026-01-01T00:00:00.000Z' }),
  ])
  const v = st.ventures.find((x) => x.id === 'v-crew1')
  say(v.name === 'Crew One Renamed', 'my own crew still renames its venture', `name=${v.name}`)
  say(st.cards.some((c) => c.id === 'c-ok'), 'and still hangs cards on it')
  say(st.milestones.some((m) => m.id === 'm-ok'), 'and still posts milestones')
}
{
  // a venture arriving from a crew I have just joined is created
  const st = await fold(S1, [rec('venture', 'v-new', venturePayload('v-new', 'Arrived'))])
  const v = st.ventures.find((x) => x.id === 'v-new')
  say(v && v.shareId === S1, 'a crew still delivers a venture I have never seen')
}
{
  // …and REJOINING the crew a venture came from re-adopts it
  const st = await fold(S2, [rec('venture', 'v-left', venturePayload('v-left', 'Back In'))])
  const v = st.ventures.find((x) => x.id === 'v-left')
  say(v.shareId === S2, 'rejoining re-adopts the venture that crew held', `shareId=${v.shareId}`)
  say(v.name === 'Back In', 'and the crew speaks for its face again', `name=${v.name}`)
}

await browser.close()
let failed = 0
for (const [s, n, d] of said) {
  if (s !== 'PASS') failed += 1
  console.log(` ${s}  ${n}${d ? `  —  ${d}` : ''}`)
}
console.log(`\n${said.length - failed}/${said.length} passed`)
process.exit(failed ? 1 : 0)
