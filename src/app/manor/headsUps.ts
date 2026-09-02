import type { CalendarEvent } from '../../core/events/types'
import { eventsInRange, hoursByKind } from '../../core/events/lib'
import {
  addDays,
  localDayKey,
  relativeDayLabel,
  startOfLocalDay,
  startOfWeek,
  type WeekStart,
} from '../../core/dates'
import { isNightRecord } from '../../core/sleep/lib'
import { voice } from '../../core/voice'
import { isLift, type Workout } from '../../modules/training/types'
import { unfulfilledTrainingEvents } from '../../modules/training/lib/fulfillment'
import type { Account, Holding, Snapshot } from '../../modules/capital/types'
import { latestSnapshot, liveNetWorth } from '../../modules/capital/lib/networth'
import type { Fx, Prices } from '../../modules/capital/lib/holdings'
import type { Exam, Homework, SessionMeta, Subject } from '../../modules/study/types'
import {
  awaitingReport,
  bookedHoursBeforeExam,
  nextExam,
  overdueHomework,
} from '../../modules/study/lib'
import type {
  Bench,
  BoardCard,
  Milestone,
  SessionMeta as WorkshopSessionMeta,
  Venture,
  WorkEntry,
} from '../../modules/workshop/types'
import {
  awaitingReport as workshopAwaitingReport,
  dueRead,
  pendingDeliveries,
  pendingMilestones,
} from '../../modules/workshop/lib'

/**
 * The butler's briefing: a greeting plus contextual heads-up lines, computed
 * on read in the `studyStats` mold — nothing persisted, no dismissal state.
 * A line exists while its condition holds and dies with it. This module is
 * app-level on purpose: only `src/app/**` may read every wing's store.
 *
 * It now answers TWO surfaces, which is why a condition produces a `Matter`
 * rather than a string. The Manor's strip prints the first `HEADS_UP_CAP`
 * strip-eligible lines as prose, exactly as before; THE VALET (the butler
 * bubble, `app/butler/`) shows ONE — the loudest un-waved matter — from any
 * wing in the house, with a way through to the room that fixes it. Both read
 * the same conditions on purpose: the Manor and the bubble contradicting each
 * other about the same fact is precisely the failure that made the exam line
 * (condition 2 below) share the Study's own helper.
 *
 * The engine stays PURE and persistence-blind: it never reads a wave-off. It
 * takes `introduced` only because a room already offered is not a candidate
 * at all — that is a condition, not a presentation choice. Everything else
 * about what the bubble chooses to show lives in the component.
 */

export type HeadsUpId =
  | 'unfiled-workout'
  | 'exam-unbooked'
  | 'next-week-watches'
  | 'week-plan'
  | 'snapshot-nudge'
  | 'night-tonight'
  | 'awaiting-report'
  | 'goal-behind'

/** the tidying, house-health and room-offer matters — the bubble's own */
export type ButlerMatterId =
  | 'overdue-homework'
  | 'overdue-milestone'
  | 'overdue-delivery'
  | 'workshop-report'
  | 'bench-long'
  | 'gcal-reconnect'
  | 'sync-choice'
  | 'prices-degraded'
  | 'offer-study'
  | 'offer-workshop'
  | 'offer-ledger'
  | 'offer-night'
  | 'offer-gcal'

export type MatterId = HeadsUpId | ButlerMatterId

/** the room offers, in the order the butler would think to mention them */
export const OFFER_IDS: ButlerMatterId[] = [
  'offer-study',
  'offer-workshop',
  'offer-ledger',
  'offer-night',
  'offer-gcal',
]

export function isOffer(id: MatterId): boolean {
  return (OFFER_IDS as string[]).includes(id)
}

/**
 * Where a matter leads — DATA, never a closure. The engine names the room; the
 * component posts to the mailboxes that open it. Keeping this serializable is
 * what lets the engine stay a pure function of its inputs (and lets a future
 * Bell-written butler produce the same thing without owning React).
 */
export type Go =
  | { view: 'manor' | 'watch' | 'training' | 'study' | 'workshop' | 'capital' }
  | { view: 'manor'; quickAdd: true }
  | { view: 'workshop'; board: string }
  /** THE NIGHT's sheet, on the morning named by this local day key */
  | { night: string }
  /** the account sheet — where the two-estates choice is answered */
  | { auth: true }
  | { settings: 'calendars' }

export interface Matter {
  id: MatterId
  /**
   * What distinguishes THIS occurrence from the next one — an exam id, a week
   * key, the instant a bench clock started. The bubble's ledger keys on
   * `${id}:${instanceKey}`, so a waved matter comes back when the underlying
   * thing genuinely changes and not before.
   */
  instanceKey: string
  text: string
  /** the dials.ts scale, so bubble and instrument board agree on loudness */
  urgency: number
  go: Go
  /** printed by the Manor's briefing strip (the classic eight) */
  strip: boolean
}

export interface HeadsUp {
  id: HeadsUpId
  text: string
}

export interface HeadsUpInputs {
  now: number
  weekStart: WeekStart
  /** COMMITTED events — the butler does not brief on rehearsals */
  events: CalendarEvent[]
  workouts: Workout[]
  weeklyGoal: number
  snapshots: Snapshot[]
  paydayDay: number
  subjects: Subject[]
  exams: Exam[]
  sessions: Record<string, SessionMeta>

  /* ---- the bubble's own inputs. All optional: the Manor's strip predates
     them and must keep computing its eight lines without gathering the house. */
  homework?: Homework[]
  milestones?: Milestone[]
  cards?: BoardCard[]
  ventures?: Venture[]
  workshopSessions?: Record<string, WorkshopSessionMeta>
  workEntries?: Record<string, WorkEntry>
  bench?: Bench | null
  accounts?: Account[]
  holdings?: Holding[]
  prices?: Prices
  fx?: Fx
  hasPricesKey?: boolean
  pricesError?: string | null
  gcal?: { needsReconnect: boolean; connected: boolean; available: boolean }
  syncChoicePending?: boolean
  signedIn?: boolean
  morningPrompt?: boolean
  wingsOff?: string[]
  /** rooms already offered once — an offered room is never a candidate again */
  introduced?: string[]
}

/** at most this many heads-up lines render in the strip; the greeting is free */
export const HEADS_UP_CAP = 2

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
/** a bench clock this old is worth mentioning — a session, not a slip */
const BENCH_LONG_H = 4
/** a room is only offered once the house is plainly lived in */
const OFFER_ESTATE_AGE_DAYS = 7

export function computeBriefing(i: HeadsUpInputs): {
  greeting: string | null
  headsUps: HeadsUp[]
  matters: Matter[]
} {
  const nowD = new Date(i.now)
  const matters: Matter[] = []
  /**
   * Uncapped on purpose. The cap used to gate COLLECTION — conditions after
   * the second hit never ran — which was invisible while the strip was the
   * only reader and wrong the moment a second surface asked "what is the
   * loudest thing in the house?" and got an answer off a list that stopped
   * early. The cap now applies where it belongs: to what the strip prints.
   */
  const add = (m: Matter) => matters.push(m)

  /* ---- greeting: the 1st of the month wins over the week-start day ---- */
  const greeting =
    nowD.getDate() === 1
      ? voice.manor.headsUp.monthGreeting(nowD.toLocaleDateString('en-US', { month: 'long' }))
      : nowD.getDay() === i.weekStart
        ? voice.manor.headsUp.weekGreeting(nowD.toLocaleDateString('en-US', { weekday: 'long' }))
        : null

  const todayKey = localDayKey(nowD)
  const weekKey = localDayKey(startOfWeek(nowD, i.weekStart))

  /* ---- 1 · a training block passed with nothing logged against it ---- */
  const unfiled = unfulfilledTrainingEvents(i.events, i.workouts, i.now, 48)
  if (unfiled.length > 0) {
    add({
      id: 'unfiled-workout',
      instanceKey: unfiled[0].id,
      text: voice.manor.headsUp.unfiledWorkout({ day: relativeDayLabel(unfiled[0].start, nowD) }),
      urgency: 4,
      go: { view: 'training' },
      strip: true,
    })
  }

  /* ---- 2 · an exam inside a week, nothing booked for its subject ---- */
  const exam = nextExam(i.exams, i.now)
  if (exam) {
    const [y, m, d] = exam.on.split('-').map(Number)
    const examDay = new Date(y, m - 1, d)
    const days = Math.round((examDay.getTime() - startOfLocalDay(nowD).getTime()) / DAY_MS)
    if (days <= 7) {
      // same helper, same window as the Study wing's own briefing line — the
      // two used to compute this separately and contradict each other on screen
      const booked = bookedHoursBeforeExam(exam, i.events, i.now) > 0
      if (!booked) {
        const subject = i.subjects.find((s) => s.id === exam.subjectId)?.name ?? exam.title
        add({
          id: 'exam-unbooked',
          instanceKey: exam.id,
          text: voice.manor.headsUp.examUnbooked({ subject, days }),
          // the examclock dial's own ceiling: nothing in the house is louder
          urgency: 8,
          go: { view: 'study' },
          strip: true,
        })
      }
    }
  }

  /* ---- 3 · Thu/Fri and next week carries no watches ---- */
  if (nowD.getDay() === 4 || nowD.getDay() === 5) {
    const nextWeekStart = addDays(startOfWeek(nowD, i.weekStart), 7)
    const nextWeek = eventsInRange(i.events, nextWeekStart, addDays(nextWeekStart, 7))
    if (!nextWeek.some((e) => e.kind === 'shift' && !e.allDay)) {
      add({
        id: 'next-week-watches',
        instanceKey: localDayKey(nextWeekStart),
        text: voice.manor.headsUp.nextWeekWatches,
        urgency: 2,
        go: { view: 'manor', quickAdd: true },
        strip: true,
      })
    }
  }

  /* ---- 4 · the week-start day over a nearly-empty week ---- */
  if (nowD.getDay() === i.weekStart) {
    const weekStartD = startOfWeek(nowD, i.weekStart)
    const week = eventsInRange(i.events, weekStartD, addDays(weekStartD, 7))
    const t = hoursByKind(week)
    if (t.shift + t.training + t.study < 4) {
      add({
        id: 'week-plan',
        instanceKey: weekKey,
        text: voice.manor.headsUp.weekPlan,
        urgency: 2,
        go: { view: 'manor', quickAdd: true },
        strip: true,
      })
    }
  }

  /* ---- 5 · payday passed, no snapshot this month ---- */
  {
    // clamped to THIS month's length, exactly as the Manor's payday marker is
    // (payday.ts paydayKeyFor). Unclamped, a payday of 31 put the window past
    // the end of every 30-day month, so the marker sat on the 30th while the
    // nudge that belongs with it never fired all month.
    const lastDay = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate()
    const payday = Math.min(i.paydayDay > 0 ? i.paydayDay : 1, lastDay)
    const dayOfMonth = nowD.getDate()
    const inWindow = dayOfMonth >= payday && dayOfMonth < payday + 7 // never-begs: a week, then rest
    const monthKey = todayKey.slice(0, 7)
    const snapped = i.snapshots.some((s) => localDayKey(s.takenAt).slice(0, 7) === monthKey)
    if (inWindow && !snapped && i.snapshots.length > 0) {
      add({
        id: 'snapshot-nudge',
        instanceKey: monthKey,
        text: voice.manor.headsUp.snapshotNudge,
        urgency: 3,
        go: { view: 'capital' },
        strip: true,
      })
    }
  }

  /* ---- 6 · a night watch starts this evening ---- */
  const nightAhead = i.events.some((e) => {
    if (e.kind !== 'shift' || e.allDay) return false
    const start = new Date(e.start)
    return localDayKey(e.start) === todayKey && start.getHours() >= 17 && start.getTime() > i.now
  })
  if (nightAhead) {
    add({
      id: 'night-tonight',
      instanceKey: todayKey,
      text: voice.manor.headsUp.nightTonight,
      urgency: 3,
      go: { view: 'manor' },
      strip: true,
    })
  }

  /* ---- 7 · study sessions still awaiting their report ---- */
  const pending = awaitingReport(i.events, i.sessions, i.now)
  if (pending.length > 0) {
    const oldestEnd = Math.min(...pending.map((e) => new Date(e.end).getTime()))
    if (i.now - oldestEnd > 24 * HOUR_MS) {
      add({
        id: 'awaiting-report',
        instanceKey: pending[0].id,
        text: voice.manor.headsUp.awaitingReport(pending.length),
        urgency: 3,
        go: { view: 'study' },
        strip: true,
      })
    }
  }

  /* ---- 8 · weekly goal short with the week nearly out ---- */
  if (i.weeklyGoal > 0) {
    const weekStartD = startOfWeek(nowD, i.weekStart)
    const daysIn = Math.floor((startOfLocalDay(nowD).getTime() - weekStartD.getTime()) / DAY_MS)
    if (daysIn >= 5) {
      const weekEnd = addDays(weekStartD, 7).getTime()
      const done = i.workouts.filter((w) => {
        const t = new Date(w.performedAt).getTime()
        return isLift(w) && t >= weekStartD.getTime() && t < weekEnd
      }).length
      if (done <= i.weeklyGoal - 2) {
        add({
          id: 'goal-behind',
          instanceKey: weekKey,
          text: voice.manor.headsUp.goalBehind({ done, goal: i.weeklyGoal }),
          urgency: 3,
          go: { view: 'training' },
          strip: true,
        })
      }
    }
  }

  /* ==================================================================
   * THE VALET's own matters. Everything below is `strip: false` — the
   * Manor's paragraph keeps the shape it had before the bubble existed.
   * ================================================================== */

  const liveVentures = (i.ventures ?? []).filter((v) => !v.archived)
  const liveVentureIds = new Set(liveVentures.map((v) => v.id))
  const ventureName = (id: string) => i.ventures?.find((v) => v.id === id)?.name ?? '—'

  /* ---- 9 · homework whose day has already gone ---- */
  const overdueHw = overdueHomework(i.homework ?? [], i.now)
  if (overdueHw.length > 0) {
    add({
      id: 'overdue-homework',
      instanceKey: overdueHw[0].id,
      text: voice.butler.matter.overdueHomework(overdueHw.length),
      urgency: 4,
      go: { view: 'study' },
      strip: false,
    })
  }

  /* ---- 10 · a milestone whose date has passed ---- */
  {
    const late = pendingMilestones(i.milestones ?? []).find(
      (m) => liveVentureIds.has(m.ventureId) && m.on < todayKey,
    )
    if (late) {
      add({
        id: 'overdue-milestone',
        instanceKey: late.id,
        text: voice.butler.matter.overdueMilestone({
          venture: ventureName(late.ventureId),
          title: late.title,
        }),
        urgency: 5,
        go: { view: 'workshop', board: late.ventureId },
        strip: false,
      })
    }
  }

  /* ---- 11 · a delivery promised for an hour that has passed ---- */
  {
    const late = pendingDeliveries(i.cards ?? []).find(
      (c) => liveVentureIds.has(c.ventureId) && dueRead(c, i.now)?.overdue === true,
    )
    if (late) {
      add({
        id: 'overdue-delivery',
        instanceKey: late.id,
        text: voice.butler.matter.overdueDelivery({
          venture: ventureName(late.ventureId),
          title: late.title,
        }),
        urgency: 6,
        go: { view: 'workshop', board: late.ventureId },
        strip: false,
      })
    }
  }

  /* ---- 12 · bench sessions still awaiting their report (study's window) ---- */
  if (i.workshopSessions) {
    const owed = workshopAwaitingReport(i.events, i.workshopSessions, i.now)
    if (owed.length > 0) {
      const oldestEnd = Math.min(...owed.map((e) => new Date(e.end).getTime()))
      if (i.now - oldestEnd > 24 * HOUR_MS) {
        add({
          id: 'workshop-report',
          instanceKey: owed[0].id,
          text: voice.butler.matter.workshopReport(owed.length),
          urgency: 3,
          go: { view: 'workshop' },
          strip: false,
        })
      }
    }
  }

  /* ---- 13 · a bench clock left running ---- */
  if (i.bench && i.now - i.bench.startedAt >= BENCH_LONG_H * HOUR_MS) {
    const started = new Date(i.bench.startedAt)
    // the START time, never an elapsed count: anything the butler prints has
    // to still be true an hour from now (the brief's own stability rule)
    const since = `${String(started.getHours()).padStart(2, '0')}:${String(
      started.getMinutes(),
    ).padStart(2, '0')}`
    add({
      id: 'bench-long',
      instanceKey: String(i.bench.startedAt),
      text: voice.butler.matter.benchLong({ since }),
      urgency: 5,
      go: { view: 'workshop', board: i.bench.ventureId },
      strip: false,
    })
  }

  /* ---- 14 · the Google grant has lapsed ---- */
  if (i.gcal?.needsReconnect) {
    add({
      id: 'gcal-reconnect',
      instanceKey: 'gcal',
      text: voice.butler.matter.gcalReconnect,
      urgency: 6,
      go: { settings: 'calendars' },
      strip: false,
    })
  }

  /* ---- 15 · sync has stopped, waiting to be told which estate is real ---- */
  if (i.syncChoicePending) {
    add({
      id: 'sync-choice',
      instanceKey: 'sync',
      text: voice.butler.matter.syncChoice,
      urgency: 7,
      go: { auth: true },
      strip: false,
    })
  }

  /* ---- 16 · the prices behind the Vault are not to be trusted ---- */
  if ((i.holdings?.length ?? 0) > 0 && i.hasPricesKey) {
    const degraded =
      i.pricesError !== null && i.pricesError !== undefined
        ? true
        : liveNetWorth(
            i.accounts ?? [],
            i.holdings ?? [],
            i.prices ?? {},
            i.fx ?? { ILS: 1 },
            latestSnapshot(i.snapshots),
          ).degraded.length > 0
    if (degraded) {
      add({
        id: 'prices-degraded',
        instanceKey: 'prices',
        text: voice.butler.matter.pricesDegraded,
        urgency: 3,
        go: { view: 'capital' },
        strip: false,
      })
    }
  }

  /* ---- 17 · a room never opened, offered ONCE ------------------------
   * The quietest thing the butler does, and the most easily made obnoxious.
   * Three guards: he only offers when he has nothing else to say, only once
   * the house is plainly lived in, and only ever once per room in the life
   * of the estate (the caller records it the moment it is spoken). A room
   * switched off in settings is not a room to be offered. */
  if (matters.length === 0) {
    const offer = pickOffer(i, todayKey)
    if (offer) add(offer)
  }

  const headsUps: HeadsUp[] = matters
    .filter((m) => m.strip)
    .slice(0, HEADS_UP_CAP)
    .map((m) => ({ id: m.id as HeadsUpId, text: m.text }))

  return { greeting, headsUps, matters }
}

/** the first room worth offering, or null — see condition 17 */
function pickOffer(i: HeadsUpInputs, todayKey: string): Matter | null {
  if (estateAgeDays(i) < OFFER_ESTATE_AGE_DAYS) return null
  const introduced = new Set(i.introduced ?? [])
  const off = new Set(i.wingsOff ?? [])

  const has = (id: ButlerMatterId): boolean => !introduced.has(id)

  if (has('offer-study') && !off.has('study') && (i.subjects?.length ?? 0) === 0) {
    return offerMatter('offer-study', voice.butler.offer.study, { view: 'study' })
  }
  if (has('offer-workshop') && !off.has('workshop') && (i.ventures?.length ?? 0) === 0) {
    return offerMatter('offer-workshop', voice.butler.offer.workshop, { view: 'workshop' })
  }
  if (has('offer-ledger') && !off.has('capital') && (i.accounts?.length ?? 0) === 0) {
    return offerMatter('offer-ledger', voice.butler.offer.ledger, { view: 'capital' })
  }
  if (has('offer-night') && i.morningPrompt !== false && !i.events.some(isNightRecord)) {
    return offerMatter('offer-night', voice.butler.offer.night, { night: todayKey })
  }
  if (
    has('offer-gcal') &&
    i.signedIn === true &&
    i.gcal?.available === true &&
    i.gcal.connected === false &&
    i.gcal.needsReconnect === false
  ) {
    return offerMatter('offer-gcal', voice.butler.offer.gcal, { settings: 'calendars' })
  }
  return null
}

function offerMatter(id: ButlerMatterId, text: string, go: Go): Matter {
  // instanceKey is the id itself: an offer happens once, ever, so there is no
  // second occurrence for a key to tell apart
  return { id, instanceKey: id, text, urgency: 1, go, strip: false }
}

/**
 * How long this estate has plainly been lived in — the oldest thing on file.
 * Zero when there is nothing at all, which is what keeps a first-run estate
 * from being offered rooms before it has walls.
 */
function estateAgeDays(i: HeadsUpInputs): number {
  let oldest = Infinity
  for (const e of i.events) {
    const t = new Date(e.start).getTime()
    if (t < oldest) oldest = t
  }
  for (const w of i.workouts) {
    const t = new Date(w.performedAt).getTime()
    if (t < oldest) oldest = t
  }
  if (!Number.isFinite(oldest)) return 0
  return Math.max(0, (i.now - oldest) / DAY_MS)
}
