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
 * Run against the fold as it stood before the ownership gate, this scores 6/19.
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
      work: Object.entries(s.workEntries).map(([k, e]) => ({ k, ventureId: e.ventureId, h: e.h, by: e.by })),
      markers: window.__events.getState().events
        .filter((e) => e.kind === 'marker')
        .map((e) => e.title),
    }
  }, [share, records])

const rec = (kind, id, payload, deleted = false) => ({ kind, id, payload, deleted })
/** a record as the registry hands it down: `authorId` is stamped by the push
 *  RPC from auth.uid(), so it is the one field a pusher cannot choose */
const signed = (kind, id, payload, authorId) => ({ kind, id, payload, deleted: false, authorId })
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

/* ====== 8. MALFORMED records: right owner, wrong shape ===================
 * The ownership gate admits these — the crew genuinely holds v-crew1 — so the
 * only thing standing between them and the store is the shape gate. Each one
 * used to reach a reader that throws. */
{
  const st = await fold(S1, [
    // the app-bricker: this day key reached dayKeyToDate(...).toISOString()
    // inside the heal pass the Manor runs on EVERY boot
    rec('milestone', 'm-bad-day', { id: 'm-bad-day', ventureId: 'v-crew1', title: 'x', on: '\u{1F480}', done: false, countFrom: '2026-01-01T00:00:00.000Z' }),
    rec('milestone', 'm-rolled', { id: 'm-rolled', ventureId: 'v-crew1', title: 'x', on: '2026-02-31', done: false, countFrom: '2026-01-01T00:00:00.000Z' }),
    // a STRING where hours belong: `t += en.h` concatenates, and the first
    // .toFixed(1) on the shelf throws
    rec('work', 'w-str', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: '999999', by: 'm' }),
    rec('work', 'w-nan', { ventureId: 'v-crew1', at: 'not-a-date', h: 3, by: 'm' }),
    rec('card', 'c-badtype', { id: 'c-badtype', ventureId: 'v-crew1', type: 'iframe', title: 'x', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('card', 'c-badnum', { id: 'c-badnum', ventureId: 'v-crew1', type: 'note', title: 'x', col: 'zero', row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('venture', 'v-badstatus', { id: 'v-badstatus', name: 'x', status: 'pwned', goalH: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('venture', 'v-badgoal', { id: 'v-badgoal', name: 'x', status: 'building', goalH: 'lots', createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('nonsense', 'n-1', { id: 'n-1', ventureId: 'v-crew1' }),
  ])
  say(!st.milestones.some((m) => m.id === 'm-bad-day'), 'an unreadable day key is refused')
  say(!st.milestones.some((m) => m.id === 'm-rolled'), 'and so is a day that does not exist')
  say(!st.work.some((w) => w.k === 'w-str'), 'hours that are not a number are refused')
  say(!st.work.some((w) => w.k === 'w-nan'), 'and so is an unreadable start')
  say(!st.cards.some((c) => c.id === 'c-badtype'), 'a card type the app has no reader for is refused')
  say(!st.cards.some((c) => c.id === 'c-badnum'), 'and a card whose position is not a number')
  say(!st.ventures.some((v) => v.id === 'v-badstatus'), 'an invented venture status is refused')
  say(!st.ventures.some((v) => v.id === 'v-badgoal'), 'and a goal that is not a number')
  say(st.markers.length === 0, 'none of it reaches the calendar', `markers=${JSON.stringify(st.markers)}`)
}

/* ====== 9. …and the app still opens afterwards ========================== */
{
  const bricked = await p.evaluate(() => {
    // the heal pass is what the Manor runs on boot; if a malformed record had
    // landed, this is the line that used to throw
    try {
      window.__workshop.getState()
      const w = window.__workshop.getState()
      window.__shareFold('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
      return null
    } catch (e) {
      return String(e)
    }
  })
  say(bricked === null, 'the store is still readable after the assault', bricked ?? '')
}

/* ====== 10. deleting a crew venture takes its whole board with it ========
 * `deleteVenture` pushes the venture tombstone and its cards/threads/
 * milestones/ledger tombstones in ONE batch. Judged against the post-fold
 * venture list, every dependent tombstone was refused — the board stayed on
 * every other member's device forever, with no venture on the shelf to reach
 * it from, while the heal pass kept redrawing its chips on the Manor. */
{
  // stand a full crew venture up first
  await fold(S1, [
    rec('venture', 'v-doomed', venturePayload('v-doomed', 'Doomed')),
    rec('card', 'c-doomed', { id: 'c-doomed', ventureId: 'v-doomed', type: 'note', title: 'Card', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('thread', 't-doomed', { id: 't-doomed', ventureId: 'v-doomed', from: 'c-doomed', to: 'c-ok' }),
    rec('milestone', 'm-doomed', { id: 'm-doomed', ventureId: 'v-doomed', title: 'DOOMED CHIP', on: '2026-04-01', done: false, countFrom: '2026-01-01T00:00:00.000Z' }),
    signed('work', 'w-doomed', { ventureId: 'v-doomed', at: '2026-01-02T00:00:00.000Z', h: 1, by: 'dana' }, 'dana'),
  ])
  // …then the whole cascade, exactly as deleteVenture pushes it
  const st = await fold(S1, [
    rec('venture', 'v-doomed', null, true),
    rec('card', 'c-doomed', null, true),
    rec('thread', 't-doomed', null, true),
    rec('milestone', 'm-doomed', null, true),
    rec('work', 'w-doomed', null, true),
  ])
  say(!st.ventures.some((v) => v.id === 'v-doomed'), 'the venture goes')
  say(!st.cards.some((c) => c.id === 'c-doomed'), 'and its cards go with it')
  say(!st.milestones.some((m) => m.id === 'm-doomed'), 'and its milestones')
  say(!st.work.some((w) => w.k === 'w-doomed'), 'and its ledger entries')
  say(!st.markers.some((t) => /DOOMED CHIP/.test(t)),
      'and no chip is left on the calendar', `markers=${JSON.stringify(st.markers)}`)
}

/* ====== 11. …even when the crew sends ONLY the venture tombstone ========= */
{
  await fold(S1, [
    rec('venture', 'v-lone', venturePayload('v-lone', 'Lone')),
    rec('milestone', 'm-lone', { id: 'm-lone', ventureId: 'v-lone', title: 'LONE CHIP', on: '2026-04-01', done: false, countFrom: '2026-01-01T00:00:00.000Z' }),
  ])
  const st = await fold(S1, [rec('venture', 'v-lone', null, true)])
  say(!st.ventures.some((v) => v.id === 'v-lone'), 'a lone venture tombstone still buries the venture')
  say(!st.milestones.some((m) => m.id === 'm-lone'), 'and its board is cascaded locally rather than orphaned')
  say(!st.markers.some((t) => /LONE CHIP/.test(t)), 'so no undeletable chip survives it')
}

/* ====== 12. a private copy is not the crew's to delete ================== */
{
  // v-left is private, formerShareId = S2. S2 may re-adopt it (checked below),
  // but a tombstone from S2 must not destroy the copy kept on leaving.
  const st = await fold(S2, [rec('venture', 'v-left', null, true)])
  say(st.ventures.some((v) => v.id === 'v-left'),
      'a crew cannot delete the private copy you kept on leaving')
}

/* ====== 13. the ledger's author is the registry's, not the payload's ===== */
{
  // dana really worked two hours; the entry is keyed by HER event id, which
  // travels on the wire where every crewmate can read it
  await fold(S1, [signed('work', 'ev-dana', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: 2, by: 'dana' }, 'dana')])

  // mallory pushes under dana's key to zero it, signing dana's name
  const st = await fold(S1, [signed('work', 'ev-dana', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: 0, by: 'dana' }, 'mallory')])
  const row = st.work.find((w) => w.k === 'ev-dana')
  say(row && row.h === 2, "a crewmate cannot erase another member's hours", `h=${row?.h}`)

  // …nor sign someone else's name to work of their own
  const st2 = await fold(S1, [signed('work', 'ev-mallory', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: 40, by: 'dana' }, 'mallory')])
  const forged = st2.work.find((w) => w.k === 'ev-mallory')
  say(forged && forged.by === 'mallory', 'work is credited to whoever the registry says wrote it', `by=${forged?.by}`)

  // an unstamped row was not written by this app
  const st3 = await fold(S1, [rec('work', 'ev-unstamped', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: 5, by: 'dana' })])
  say(!st3.work.some((w) => w.k === 'ev-unstamped'), 'an unstamped ledger row is refused')

  // …and the author may still correct their own entry
  const st4 = await fold(S1, [signed('work', 'ev-dana', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: 3.5, by: 'dana' }, 'dana')])
  const own = st4.work.find((w) => w.k === 'ev-dana')
  say(own && own.h === 3.5, 'the author may still correct their own hours', `h=${own?.h}`)
}

/* ============================ 14. the LEGITIMATE paths still work ========= */
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
  say(st.markers.some((t) => /Ship it/.test(t)), 'whose chip does reach the calendar', `markers=${JSON.stringify(st.markers)}`)
}
{
  // every kind, in its fullest legitimate form — the gate must pass all of it.
  // This is the half of the harness that stops a stricter gate silently eating
  // a crewmate's real work.
  const st = await fold(S1, [
    rec('thread', 't-ok', { id: 't-ok', ventureId: 'v-crew1', from: 'c-ok', to: 'c-keep' }),
    signed('work', 'w-ok', { ventureId: 'v-crew1', at: '2026-01-02T00:00:00.000Z', h: 2.5, by: 'dana' }, 'dana'),
    rec('card', 'c-full', { id: 'c-full', ventureId: 'v-crew1', type: 'task', title: 'Full', body: 'b', url: 'https://example.com', done: true, doneBy: 'dana', dueAt: '2026-03-01T18:00:00.000Z', parentId: 'c-ok', col: 1, row: 2, fx: 12.5, fy: 40, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('card', 'c-bare', { id: 'c-bare', ventureId: 'v-crew1', type: 'note', title: 'Bare', col: 0, row: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    rec('milestone', 'm-full', { id: 'm-full', ventureId: 'v-crew1', title: 'Full', on: '2026-04-01', done: true, doneAt: '2026-03-30T00:00:00.000Z', countFrom: '2026-01-01T00:00:00.000Z' }),
    rec('venture', 'v-crew1', { id: 'v-crew1', name: 'Crew One Renamed', status: 'shipped', goalH: 4, shippedAt: '2026-03-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }),
  ])
  say(st.cards.some((c) => c.id === 'c-full'), 'a fully-populated card is accepted')
  say(st.cards.some((c) => c.id === 'c-bare'), 'and one with every optional field absent')
  say(st.milestones.some((m) => m.id === 'm-full'), 'a completed milestone is accepted')
  say(st.work.some((w) => w.k === 'w-ok' && w.h === 2.5), 'a ledger entry is accepted')
  say(st.ventures.find((v) => v.id === 'v-crew1')?.name === 'Crew One Renamed',
      'and a shipped venture face is accepted')
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
