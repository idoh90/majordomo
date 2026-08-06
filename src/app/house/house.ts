import { addDays, startOfWeek, type WeekStart } from '../../core/dates'
import {
  eventsInRange,
  hoursByKind,
  weeklyHoursSeries,
} from '../../core/events/lib'
import type { CalendarEvent } from '../../core/events/types'
import type { Account, Holding, Snapshot, SpendItem, RecurringExpense } from '../../modules/capital/types'
import {
  dailyBurn,
  daysInMonthOf,
  monthKey,
  monthlySpent,
  shiftMonth,
  spendBreakdown,
} from '../../modules/capital/lib/budget'
import type { Fx, Prices } from '../../modules/capital/lib/holdings'
import { weeklyCounts } from '../../modules/training/lib/insights'
import { computeStrains, readiness, type Readiness } from '../../modules/training/lib/strain'
import type { Workout } from '../../modules/training/types'
import { bookedHoursBeforeExam, daysUntil, fulfilledHoursBetween, nextExam } from '../../modules/study/lib'
import type { Exam, SessionMeta, Subject } from '../../modules/study/types'
import { nearWatch, warnableBlock } from '../manor/nearWatch'

/**
 * THE HOUSE — what each wing is doing, read from one place.
 *
 * This module is app-level on purpose, exactly as headsUps.ts is: only
 * `src/app/**` may read every wing's store, and the import-boundary rule stops
 * the wings reaching across to each other. Keeping it a pure function of an
 * explicit inputs struct is what makes it testable and what keeps the hook
 * that feeds it trivial.
 *
 * One rule governs every figure here: a row must print what its own wing
 * prints. The Watch's hours are start-anchored because that is what the duty
 * ring counts; the Manor's are intersected because that is what its week line
 * counts. The two disagree at week edges by design, and a rail that quietly
 * picked one convention for both would contradict whichever screen it sat
 * beside.
 */

export type WingId = 'manor' | 'watch' | 'grounds' | 'study' | 'capital'

/** Which direction is the good one. The single source of truth for delta
 *  colour anywhere in the House — components read `good`, never the sign. */
const DESIRABLE: Record<WingId, 'up' | 'down' | 'neither'> = {
  manor: 'neither',
  watch: 'down', // fewer hours on duty is a better week, not a worse one
  grounds: 'up',
  study: 'up',
  capital: 'up', // more budget left
}

export interface HouseRow {
  id: WingId
  /** the wing's own headline figure, pre-formatted by the wing's own rules */
  figure: string
  /** change against the previous week, in the row's own units; null = no basis */
  delta: number | null
  /** true when the delta moves in the desirable direction for this wing */
  good: boolean | null
  /** oldest first; empty when the wing cannot honestly draw one */
  series: number[]
}

export type PatternId = 'train-after-watch' | 'study-untouched' | 'none'

export interface HouseModel {
  rows: HouseRow[]
  readiness: Readiness
  /** duty hours per week, oldest first — the Watch's own signal card */
  dutyLoad: number[]
  /** this week's booked duty total (the duty ring's denominator) */
  watchBooked: number
  /** days until the next exam, and hours booked before it */
  examRunway: { subject: string; days: number; bookedH: number } | null
  /** this month's spend per day so far, and the month before's */
  burn: { perDay: number; prevPerDay: number | null } | null
  pattern: { id: PatternId; args: Record<string, string | number> }
}

export interface HouseInputs {
  now: number
  /** rounded to the hour by the caller — nothing here should re-run per minute */
  nowH: number
  weekStart: WeekStart
  /** committed events only; a rehearsal must never move these figures */
  events: CalendarEvent[]
  workouts: Workout[]
  weeklyGoal: number
  subjects: Subject[]
  sessions: Record<string, SessionMeta>
  exams: Exam[]
  accounts: Account[]
  snapshots: Snapshot[]
  holdings: Holding[]
  prices: Prices
  fx: Fx
  spends: Record<string, number>
  spendItems: SpendItem[]
  recurring: RecurringExpense[]
  monthlyBudget: number
  /** the wing's own ₪ formatter — core has no idea what currency this is */
  formatMoney: (n: number) => string
}

const WEEKS = 8

export function computeHouse(i: HouseInputs): HouseModel {
  const nowDate = new Date(i.nowH)
  const w0 = startOfWeek(nowDate, i.weekStart)

  /* ---------------------------------------------------------------- watch */
  // start-anchored: the convention watchStats and therefore the duty ring use
  const dutyLoad = weeklyHoursSeries(i.events, ['shift'], WEEKS, nowDate, i.weekStart, 'startAnchored')
  const watchBooked = dutyLoad[dutyLoad.length - 1] ?? 0
  // The ROW reports hours already stood, because that is the figure the duty
  // ring puts in the middle of the screen. The signal card reports the week's
  // booked total, which is the ring's denominator. Reporting the denominator
  // under the word "stood" would have the rail contradicting the ring it sits
  // one column away from.
  const w1 = addDays(w0, 7)
  const watchStood = i.events
    .filter((e) => {
      if (e.kind !== 'shift' || e.allDay) return false
      const st = new Date(e.start)
      return st >= w0 && st < w1 && new Date(e.end).getTime() <= i.now
    })
    .reduce((t, e) => t + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3_600_000, 0)

  /* --------------------------------------------------------------- grounds */
  const counts = weeklyCounts(i.workouts, nowDate, WEEKS, i.weekStart).map((b) => b.count)
  const groundsNow = counts[counts.length - 1] ?? 0
  const groundsPrev = counts[counts.length - 2] ?? null
  const strains = computeStrains(i.workouts, i.nowH)
  const ready = readiness(strains)

  /* ----------------------------------------------------------------- study */
  const studySeries = Array.from({ length: WEEKS }, (_, k) => {
    const s = addDays(w0, -7 * (WEEKS - 1 - k))
    return fulfilledHoursBetween(i.events, i.sessions, s, addDays(s, 7))
  })
  const studyNow = studySeries[studySeries.length - 1] ?? 0
  const studyPrev = studySeries[studySeries.length - 2] ?? null
  const exam = nextExam(i.exams, i.now)
  const examRunway = exam
    ? {
        subject: i.subjects.find((s) => s.id === exam.subjectId)?.name ?? '—',
        days: daysUntil(exam.on, i.now),
        bookedH: bookedHoursBeforeExam(exam, i.events, i.now),
      }
    : null

  /* --------------------------------------------------------------- capital */
  const thisMonth = monthKey(nowDate)
  const spentNow = monthlySpent(thisMonth, i.spends, i.recurring, i.spendItems)
  const leftNow = i.monthlyBudget > 0 ? i.monthlyBudget - spentNow : null
  // months are the honest grain for spend: the weekly view would slice a rent
  // payment into whichever week it happened to land in
  const spendMonths = Array.from({ length: 6 }, (_, k) => {
    const m = shiftMonth(thisMonth, -(5 - k))
    return monthlySpent(m, i.spends, i.recurring, i.spendItems)
  })
  const prevMonth = shiftMonth(thisMonth, -1)
  const prevMonthSpent = spendMonths[spendMonths.length - 2] ?? null
  const dayOfMonth = nowDate.getDate()
  const prevDays = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0).getDate()
  // Fixed costs are spread flat over the days they buy and only the variable
  // side is divided by the days elapsed — otherwise rent, committed on the 1st,
  // put the burn rate at three times its true figure on the 5th and let it sag
  // back down as the month caught up with it. The month just gone is complete,
  // so its own rate is the same expression with every day elapsed.
  const burn =
    spentNow > 0
      ? {
          perDay: dailyBurn(
            spendBreakdown(thisMonth, i.spends, i.recurring, i.spendItems),
            dayOfMonth,
            daysInMonthOf(nowDate),
          ),
          prevPerDay:
            prevMonthSpent != null && prevMonthSpent > 0
              ? dailyBurn(
                  spendBreakdown(prevMonth, i.spends, i.recurring, i.spendItems),
                  prevDays,
                  prevDays,
                )
              : null,
        }
      : null

  /* ----------------------------------------------------------------- manor */
  // intersected: the convention the Manor's own week line prints
  const manorSeries = weeklyHoursSeries(
    i.events,
    ['shift', 'training', 'study'],
    WEEKS,
    nowDate,
    i.weekStart,
    'intersect',
  )
  const manorNow = manorSeries[manorSeries.length - 1] ?? 0
  const manorPrev = manorSeries[manorSeries.length - 2] ?? null

  const rows: HouseRow[] = [
    row('manor', `${manorNow.toFixed(1)} h`, manorNow, manorPrev, manorSeries),
    // no delta: the figure is hours stood SO FAR, and holding a part-week
    // against a finished one would invent a fall every Monday morning. The
    // sparkline still carries the load trend.
    row('watch', `${watchStood.toFixed(1)} h`, watchStood, null, dutyLoad),
    row(
      'grounds',
      i.weeklyGoal > 0 ? `${groundsNow}/${i.weeklyGoal}` : String(groundsNow),
      groundsNow,
      groundsPrev,
      counts,
    ),
    row('study', `${studyNow.toFixed(1)} h`, studyNow, studyPrev, studySeries),
    row(
      'capital',
      leftNow == null ? i.formatMoney(spentNow) : i.formatMoney(leftNow),
      leftNow ?? spentNow,
      null, // last month's "left" is not a comparable quantity to this month's
      spendMonths,
    ),
  ]

  return { rows, readiness: ready, dutyLoad, watchBooked, examRunway, burn, pattern: findPattern(i) }
}

function row(
  id: WingId,
  figure: string,
  now: number,
  prev: number | null,
  series: number[],
): HouseRow {
  const delta = prev == null ? null : now - prev
  const want = DESIRABLE[id]
  const good =
    delta == null || delta === 0 || want === 'neither' ? null : want === 'up' ? delta > 0 : delta < 0
  return { id, figure, delta, good, series }
}

/**
 * One cross-wing observation, chosen by a fixed rule set rather than generated.
 * Only the first that applies is reported — a rail is a glance, not a list.
 */
function findPattern(i: HouseInputs): { id: PatternId; args: Record<string, string | number> } {
  const weekEnd = addDays(startOfWeek(new Date(i.nowH), i.weekStart), 7)
  const ahead = i.events.filter(
    (e) => !e.allDay && new Date(e.start).getTime() >= i.now && new Date(e.start) < weekEnd,
  )

  // a training block sitting hard by a watch — the estate can name the block
  for (const e of ahead) {
    if (!warnableBlock(e)) continue
    const nw = nearWatch(i.events, new Date(e.start), new Date(e.end), e.id)
    if (nw) return { id: 'train-after-watch', args: { title: e.title, mins: nw.mins, before: String(nw.before) } }
  }

  // an enrolled subject with a goal and nothing booked against it this week
  const active = i.subjects.filter((s) => !s.archived && s.goalH > 0)
  const w0 = startOfWeek(new Date(i.nowH), i.weekStart)
  const booked = eventsInRange(i.events, w0, addDays(w0, 7))
  for (const s of active) {
    const has = booked.some((e) => e.kind === 'study' && e.sourceRef === `subj:${s.id}`)
    if (!has) return { id: 'study-untouched', args: { subject: s.name } }
  }

  return { id: 'none', args: {} }
}

/** total booked hours this week, for the Manor's own signal line */
export function weekBooked(events: CalendarEvent[], anchor: Date, weekStart: WeekStart): number {
  const w0 = startOfWeek(anchor, weekStart)
  const t = hoursByKind(eventsInRange(events, w0, addDays(w0, 7)))
  return t.shift + t.training + t.study
}
