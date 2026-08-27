import { addDays, localDayKey, startOfLocalDay } from '../dates'
import { hoursOf } from '../events/lib'
import type { CalendarEvent } from '../events/types'
import type { NightRow, RecoveryEffect, SleepNote, SleepStats } from './types'

/**
 * THE NIGHT — every figure the estate draws from sleep, derived and never
 * stored. Same bargain the strain engine makes: the records are the truth and
 * the constants below can be re-tuned without a migration.
 *
 * This module lives in core because it has two consumers from birth — the
 * Manor writes and reads nights, and the Grounds reads them through recovery —
 * and modules may not import each other. That is the extract-on-contact rule
 * being satisfied, not anticipated.
 */

/* ------------------------------------------------------------------ refs */

/**
 * A night that was written down carries `slept:<wake day>`.
 *
 * The estate already pencils a recovery block in after a night watch
 * (modules/watch/lib.ts). That block is a SUGGESTION — six hours the house
 * drew for you — and counting it as sleep would let the app report a week of
 * rest nobody actually took. The ref is what separates the two, it survives
 * an edit and a sync, and it needs no lookup: a pure predicate over the event.
 *
 * Deliberately NOT a projection prefix (core/sync/projection.ts): a night is a
 * record, and records are carried between devices.
 */
export const SLEPT_PREFIX = 'slept:'

export const sleptRef = (dayKey: string): string => `${SLEPT_PREFIX}${dayKey}`

const isSleepBlock = (e: CalendarEvent): boolean => e.kind === 'sleep' && !e.allDay

/**
 * Did this actually happen?
 *
 * Two ways to qualify. The ref is the one the night sheet stamps. The second —
 * anything not written by the Watch — grandfathers every sleep block placed by
 * hand before this system existed: dragging a block onto the week and calling
 * it sleep has always been a person asserting they slept, and those estates
 * should not wake up to an empty ledger.
 */
export function isNightRecord(e: CalendarEvent): boolean {
  if (!isSleepBlock(e)) return false
  return e.sourceRef?.startsWith(SLEPT_PREFIX) === true || e.source !== 'watch'
}

/** the estate drew it and nobody has confirmed it yet */
export function isPencilledNight(e: CalendarEvent): boolean {
  return isSleepBlock(e) && !isNightRecord(e)
}

export function sleepBlocks(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(isSleepBlock)
}

/* ---------------------------------------------------------------- nights */

/** minutes from midnight of `day`, signed — the evening before reads negative */
function minutesFrom(day: Date, at: Date): number {
  return Math.round((at.getTime() - startOfLocalDay(day).getTime()) / 60_000)
}

/**
 * The nights that ENDED inside [from, to), oldest first.
 *
 * Blocks are grouped by the day they end on (see NightRow), so a nap and a
 * night that both finish on Tuesday are one Tuesday of sleep. The hours are
 * the sum of every block; the clock times are the LONGEST block's, because
 * "when did you go to bed" means the night, not the nap.
 */
export function nightsIn(
  events: CalendarEvent[],
  notes: Record<string, SleepNote>,
  from: Date,
  to: Date,
): NightRow[] {
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of sleepBlocks(events)) {
    const end = new Date(e.end)
    if (end < from || end >= to) continue
    const key = localDayKey(end)
    const list = byDay.get(key)
    if (list) list.push(e)
    else byDay.set(key, [e])
  }

  const rows: NightRow[] = []
  for (const [dayKey, blocks] of byDay) {
    const main = blocks.reduce((best, e) => (hoursOf(e) > hoursOf(best) ? e : best), blocks[0])
    const inBedH = blocks.reduce((t, e) => t + hoursOf(e), 0)
    const awakeMin = blocks.reduce((t, e) => t + (notes[e.id]?.awakeMin ?? 0), 0)
    const rated = blocks.map((e) => notes[e.id]?.rest).filter((r): r is number => r != null)
    const bed = new Date(main.start)
    const wake = new Date(main.end)
    const anchor = startOfLocalDay(new Date(main.end))
    rows.push({
      dayKey,
      eventId: main.id,
      inBedH,
      hours: Math.max(0, inBedH - awakeMin / 60),
      bed,
      wake,
      blocks: blocks.length,
      rest: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
      midMin: minutesFrom(anchor, new Date((bed.getTime() + wake.getTime()) / 2)),
      // one confirmed block is enough to make the night real; a pencilled
      // block sitting beside a logged one is just a leftover suggestion
      pencilled: !blocks.some(isNightRecord),
    })
  }
  return rows.sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

/** the night that ended on `day`, if one is on file */
export function nightOf(
  events: CalendarEvent[],
  notes: Record<string, SleepNote>,
  day: Date,
): NightRow | null {
  const rows = nightsIn(events, notes, startOfLocalDay(day), addDays(day, 1))
  return rows[0] ?? null
}

/* ----------------------------------------------------------------- stats */

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((t, x) => t + (x - mean) ** 2, 0) / xs.length)
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** the default a fresh estate measures itself against, in hours */
export const DEFAULT_TARGET_H = 8

/** how many nights the ledger looks back over */
export const WINDOW_NIGHTS = 14

/** a surplus night pays back debt at half rate — sleep does not bank cleanly */
const CREDIT_RATE = 0.5

/**
 * How steady the body clock is, 0–100, from the spread of the nightly
 * midpoint. Regularity is the one thing a two-timestamp log can measure that
 * the literature likes better than duration, and it costs the user nothing
 * extra to produce.
 *
 * DECAY, not a straight line, and the difference matters for exactly the
 * person this app was built for. A line steep enough to separate an ordinary
 * week (half an hour of spread from a full hour) hits zero somewhere around
 * three hours — and a shift worker alternating nights and days runs four or
 * five hours of spread as a matter of course, so the figure would read 0 every
 * week for ever and tell them nothing about whether this fortnight was better
 * than the last. An exponential keeps discriminating all the way out: half an
 * hour reads 78, an hour 61, two hours 37, four hours 14. It is a reading in
 * the app's own units, not a clinical index.
 */
const REGULARITY_TAU_MIN = 120

function regularityOf(sdMin: number): number {
  return clamp(Math.round(100 * Math.exp(-sdMin / REGULARITY_TAU_MIN)), 0, 100)
}

export function sleepStats(
  events: CalendarEvent[],
  notes: Record<string, SleepNote>,
  now: number,
  targetH: number = DEFAULT_TARGET_H,
  windowNights: number = WINDOW_NIGHTS,
): SleepStats {
  const today = startOfLocalDay(new Date(now))
  const to = addDays(today, 1)
  const rows = nightsIn(events, notes, addDays(to, -windowNights), to)
  const seven = rows.filter((r) => r.dayKey >= localDayKey(addDays(to, -7)))

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const mids = rows.map((r) => r.midMin)
  const sd = rows.length >= 3 ? stdev(mids) : null

  let debt = 0
  for (const r of rows) {
    const gap = targetH - r.hours
    debt += gap >= 0 ? gap : gap * CREDIT_RATE
  }

  // the shape to prefill a new night with — from CONFIRMED nights only, so a
  // fortnight of the house's own pencil marks cannot teach it your habits
  const kept = rows.filter((r) => !r.pencilled)
  const usual = kept.length
    ? {
        bedMin: Math.round(
          median(kept.map((r) => minutesFrom(startOfLocalDay(r.wake), r.bed))),
        ),
        wakeMin: Math.round(
          median(kept.map((r) => minutesFrom(startOfLocalDay(r.wake), r.wake))),
        ),
        midMin: Math.round(median(kept.map((r) => r.midMin))),
      }
    : null

  const rated = rows.map((r) => r.rest).filter((r): r is number => r != null)

  return {
    last: rows.length ? rows[rows.length - 1] : null,
    rows,
    windowNights,
    covered: rows.length,
    avgH: mean(rows.map((r) => r.hours)),
    avg7H: mean(seven.map((r) => r.hours)),
    covered7: seven.length,
    debtH: Math.max(0, debt),
    regularity: sd === null ? null : regularityOf(sd),
    driftMin: sd === null ? null : Math.round(sd),
    usual,
    rest: rated.length ? mean(rated) : null,
    targetH,
  }
}

/* -------------------------------------------------------------- recovery */

/**
 * Sleep's pull on the strain engine's recovery clock.
 *
 * Under-sleeping genuinely slows recovery — impaired protein synthesis,
 * blunted force restoration, higher perceived soreness — but the input here is
 * two clock times typed by hand into a phone, not a polysomnograph, so the
 * effect is deliberately SMALL and hard-capped. At its worst it says recovery
 * is running a fifth slower; it never doubles anything, and it never invents a
 * figure out of a week nobody logged.
 *
 * MIN_NIGHTS is the honesty gate and matters more than the coefficient: below
 * it the scale is exactly 1 and every surface reads unchanged, so an estate
 * that ignores this system entirely is never quietly being modelled.
 */
export const MIN_NIGHTS = 4
const DRAG_PER_HOUR = 0.05
const DRAG_MIN = -0.1
const DRAG_MAX = 0.18
/** a rest rating pulls ±4 % on top, the way felt-strain corrects effort */
const REST_SPAN = 0.02
const SCALE_FLOOR = 0.88
const SCALE_CEIL = 1.2

export function recoveryEffect(stats: SleepStats, couplingOn: boolean): RecoveryEffect {
  const deficitH = stats.targetH - stats.avg7H
  const base: RecoveryEffect = {
    scale: 1,
    applied: false,
    covered: stats.covered7,
    needed: MIN_NIGHTS,
    avgH: stats.avg7H,
    deficitH,
    pct: 0,
    couplingOn,
  }
  if (!couplingOn || stats.covered7 < MIN_NIGHTS) return base

  let scale = 1 + clamp(deficitH * DRAG_PER_HOUR, DRAG_MIN, DRAG_MAX)
  if (stats.rest != null) scale += (3 - stats.rest) * REST_SPAN
  scale = clamp(scale, SCALE_FLOOR, SCALE_CEIL)

  return { ...base, scale, applied: true, pct: Math.round((scale - 1) * 100) }
}

/* ---------------------------------------------------------------- series */

export interface NightPoint {
  dayKey: string
  day: Date
  /** hours slept; 0 when the night is not on file */
  hours: number
  /** is there a record behind that 0? */
  has: boolean
  row: NightRow | null
}

/** the last `n` nights ending today, oldest first — gaps included as gaps */
export function nightlySeries(
  events: CalendarEvent[],
  notes: Record<string, SleepNote>,
  now: number,
  n: number,
): NightPoint[] {
  const today = startOfLocalDay(new Date(now))
  const rows = nightsIn(events, notes, addDays(today, 1 - n), addDays(today, 1))
  const byKey = new Map(rows.map((r) => [r.dayKey, r]))
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, -(n - 1 - i))
    const dayKey = localDayKey(day)
    const row = byKey.get(dayKey) ?? null
    return { dayKey, day, hours: row?.hours ?? 0, has: row !== null, row }
  })
}

/** running sleep debt after each of the last `n` nights, oldest first */
export function debtSeries(points: NightPoint[], targetH: number): number[] {
  let debt = 0
  return points.map((p) => {
    if (p.has) {
      const gap = targetH - p.hours
      debt = Math.max(0, debt + (gap >= 0 ? gap : gap * CREDIT_RATE))
    }
    return debt
  })
}

/* --------------------------------------------------------------- format */

/** "7 h 25 m" — the one place the app spells a slept duration */
export function fmtHM(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} m`
}

/** 'HH:MM' of a signed minutes-from-midnight value, wrapped into a clock face */
export function hhmmOfMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
