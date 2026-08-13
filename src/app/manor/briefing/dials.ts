import { useMemo } from 'react'
import { addDays, localDayKey, startOfLocalDay, startOfWeek } from '../../../core/dates'
import { weeklyHoursSeries } from '../../../core/events/lib'
import { useEventsStore } from '../../../core/events/store'
import { useShellStore } from '../../../core/store/shell'
import { useNow } from '../../../core/useNow'
import { voice } from '../../../core/voice'
import type { BriefFacts, DialCopy, DialId } from '../../../core/voice/types'
import type { CalendarEvent, EventKind } from '../../../core/events/types'
import { formatCompact, formatILS } from '../../../modules/capital/lib/money'
import { monthKey, spendBreakdown } from '../../../modules/capital/lib/budget'
import { netWorthSeries } from '../../../modules/capital/lib/networth'
import { useCapitalStore } from '../../../modules/capital/store'
import { fulfilledHoursBetween as studyHoursBetween } from '../../../modules/study/lib'
import { useStudyStore } from '../../../modules/study/store'
import { ALL_MUSCLE_IDS, muscleLabel } from '../../../modules/training/data/muscles'
import { HOT_THRESHOLD } from '../../../modules/training/lib/recovery'
import { computeStrains, readiness, type StrainMap } from '../../../modules/training/lib/strain'
import { sessionSets } from '../../../modules/training/lib/volume'
import { useWorkoutStore } from '../../../modules/training/store'
import { isLift } from '../../../modules/training/types'
import { fulfilledHoursBetween as benchHoursBetween } from '../../../modules/workshop/lib'
import { useWorkshopStore } from '../../../modules/workshop/store'

/**
 * THE INSTRUMENTS — the dial catalogue behind the briefing's four cards.
 *
 * Every dial here draws REAL records. A dial whose wing has nothing on file is
 * not built at all, so it never reaches the shelf and can never be placed on
 * the board: an empty chart is a worse answer than no chart.
 *
 * `urgency` is how loudly a dial is asking to be seen. It only decides the
 * house's own four — the moment the reader places a chip, their board is
 * theirs and nothing re-ranks it.
 */

export type DialKind = 'line' | 'bars' | 'pace' | 'diverge' | 'body'

export interface DialPoint {
  label: string
  v: number
}

export interface Dial {
  id: DialId
  name: string
  wing: string
  /** a CSS colour value — always a wing token, so every skin re-colours free */
  color: string
  kind: DialKind
  points: DialPoint[]
  /** fractional x per point (0–1) when the points are not evenly spaced */
  fx?: number[]
  min: number
  max: number
  /** the horizontal reference line and what it means */
  rule?: { v: number; label: string }
  /** the dashed even-pace guide: [[x0, v0], [x1, v1]] in the same units */
  guide?: [[number, number], [number, number]]
  /** points after this index are a forecast and draw dashed */
  nowIdx?: number
  /** the big figure over the card */
  headV: string
  /** what the caption under it is claiming */
  tone: 'dim' | 'good' | 'warn'
  copy: DialCopy
  range: string
  urgency: number
  /** how a scrubbed value prints */
  fmt: (v: number) => string
  /** the body map's only payload */
  strains?: StrainMap
}

const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const h1 = (v: number) => `${v.toFixed(1)} h`
const int = (v: number) => String(Math.round(v))
const s1 = (v: number) => v.toFixed(1)

/** the kinds that actually occupy an hour of the day */
const OCCUPYING: EventKind[] = ['shift', 'sleep', 'training', 'study', 'workshop']

/** ms of `e` that fall inside [a, b) */
function overlapMs(e: CalendarEvent, a: number, b: number): number {
  if (e.allDay) return 0
  const s = new Date(e.start).getTime()
  const t = new Date(e.end).getTime()
  return Math.max(0, Math.min(t, b) - Math.max(s, a))
}

interface Bucket {
  start: Date
  end: Date
  label: string
}

/** the last `n` weeks, oldest first, ending with the week holding `anchor` */
function weekBuckets(anchor: Date, n: number, weekStart: 0 | 1): Bucket[] {
  const current = startOfWeek(anchor, weekStart)
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(current, -7 * (n - 1 - i))
    return {
      start,
      end: addDays(start, 7),
      label:
        i === n - 1 ? 'THIS WEEK' : `${MO[start.getMonth()]} ${start.getDate()}`,
    }
  })
}

/** the last `n` days, oldest first, ending today */
function dayBuckets(anchor: Date, n: number): Bucket[] {
  const today = startOfLocalDay(anchor)
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(today, -(n - 1 - i))
    return {
      start,
      end: addDays(start, 1),
      label: i === n - 1 ? 'TODAY' : DAY[start.getDay()],
    }
  })
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

/** a shift that ends on a later calendar day than it began */
function isNight(e: CalendarEvent): boolean {
  const s = new Date(e.start)
  const t = new Date(e.end)
  return s.getDate() !== t.getDate() || s.getMonth() !== t.getMonth()
}

/**
 * Build every dial the estate can honestly draw, most-urgent first.
 */
export function useDials(facts: BriefFacts): Dial[] {
  const now = useNow()
  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const events = useEventsStore((s) => s.events)
  const weekStart = useShellStore((s) => s.weekStart)

  const workouts = useWorkoutStore((s) => s.workouts)
  const studySessions = useStudyStore((s) => s.sessions)
  const exams = useStudyStore((s) => s.exams)
  const subjects = useStudyStore((s) => s.subjects)
  const homework = useStudyStore((s) => s.homework)
  const benchSessions = useWorkshopStore((s) => s.sessions)
  const ventures = useWorkshopStore((s) => s.ventures)
  const workEntries = useWorkshopStore((s) => s.workEntries)

  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)

  return useMemo(() => {
    const V = voice.briefing.brief
    const nowDate = new Date(nowH)
    const dials: Dial[] = []

    const push = <K extends DialId>(
      id: K,
      wing: string,
      color: string,
      rest: Omit<Dial, 'id' | 'name' | 'wing' | 'color' | 'copy' | 'range'>,
      copy: DialCopy,
    ) => {
      dials.push({
        id,
        name: V.dialName[id],
        wing,
        color,
        range: V.dialRange[id],
        copy,
        ...rest,
      } as Dial)
    }

    /* ---- THE GROUNDS ---------------------------------------------------- */
    const GROUNDS = voice.modules.training.name
    const GC = 'var(--color-w-grounds)'
    const g = facts.grounds

    if (workouts.length > 0 && g) {
      const strains = computeStrains(workouts, nowH)
      const hot = ALL_MUSCLE_IDS.filter((m) => strains[m] >= HOT_THRESHOLD).length
      const ready = readiness(strains)

      push(
        'bodyheat',
        GROUNDS,
        GC,
        {
          kind: 'body',
          points: [],
          min: 0,
          max: 10,
          headV: hot > 0 ? `${hot} sore` : 'clear',
          tone: hot >= 4 ? 'warn' : 'dim',
          urgency: 4 + hot,
          fmt: s1,
          strains,
        },
        V.dial.bodyheat({
          hot,
          muscles: ALL_MUSCLE_IDS.length,
          top: g.top?.name ?? null,
          topStrain: g.top?.strain ?? 0,
          readiness: ready.score,
        }),
      )

      // this week and the next few days, sampled every twelve hours. The engine
      // scores any instant, so the tail is soreness already owed and not yet
      // felt — a forecast in the strict sense, not a guess.
      // 14 samples, not 15: the fifteenth lands on next week's first midnight
      // and prints the same label as the first, which reads as a bug
      const w0 = startOfWeek(nowDate, weekStart)
      const samples = Array.from({ length: 14 }, (_, i) => addDays(w0, i / 2))
      const peakAt = (t: Date) => {
        const s = computeStrains(workouts, t.getTime())
        return ALL_MUSCLE_IDS.reduce((best, m) => Math.max(best, s[m]), 0)
      }
      const strainPts: DialPoint[] = samples.map((t) => ({
        label: `${DAY[t.getDay()]} ${String(t.getHours()).padStart(2, '0')}:00`,
        v: peakAt(t),
      }))
      let nowIdx = 0
      samples.forEach((t, i) => {
        if (t.getTime() <= nowH) nowIdx = i
      })
      const ahead = strainPts.slice(nowIdx)
      const peak = ahead.reduce((best, p) => (p.v > best.v ? p : best), ahead[0])

      push(
        'strain',
        GROUNDS,
        GC,
        {
          kind: 'line',
          points: strainPts,
          min: 0,
          max: 10,
          rule: { v: HOT_THRESHOLD, label: 'SORE' },
          nowIdx,
          headV: strainPts[nowIdx].v.toFixed(1),
          tone: strainPts[nowIdx].v >= HOT_THRESHOLD ? 'warn' : 'dim',
          urgency: peak.v >= HOT_THRESHOLD ? 6 : 2,
          fmt: s1,
        },
        V.dial.strain({
          now: strainPts[nowIdx].v,
          peak: peak.v,
          peakLabel: peak.v > strainPts[nowIdx].v ? peak.label : null,
          hotLine: HOT_THRESHOLD,
        }),
      )

      const days = dayBuckets(nowDate, 14)
      const readyPts: DialPoint[] = days.map((d, i) => ({
        label:
          i === days.length - 1
            ? 'NOW'
            : `${MO[d.start.getMonth()]} ${d.start.getDate()}`,
        v:
          i === days.length - 1
            ? ready.score
            : readiness(computeStrains(workouts, addDays(d.start, 1).getTime() - 1)).score,
      }))
      push(
        'readiness',
        GROUNDS,
        GC,
        {
          kind: 'line',
          points: readyPts,
          min: 0,
          max: 100,
          headV: String(ready.score),
          tone: ready.band === 'spent' ? 'warn' : ready.band === 'fresh' ? 'good' : 'dim',
          urgency: ready.band === 'spent' ? 5 : 2,
          fmt: int,
        },
        V.dial.readiness({
          now: ready.score,
          avg: mean(readyPts.slice(0, -1).map((p) => p.v)),
          band: ready.band,
        }),
      )

      const weeks = weekBuckets(nowDate, 8, weekStart)
      const volPts: DialPoint[] = weeks.map((w) => {
        // lifts only — the volume policy in lib/volume.ts. A run's primaries
        // used to leak estimated "sets" into this dial that the body map
        // (correctly) refused to count.
        const inWeek = workouts.filter((x) => {
          if (!isLift(x)) return false
          const t = new Date(x.performedAt).getTime()
          return t >= w.start.getTime() && t < w.end.getTime()
        })
        let sets = 0
        for (const x of inWeek) for (const m of ALL_MUSCLE_IDS) sets += sessionSets(x, m)
        return { label: w.label, v: Math.round(sets) }
      })
      const volNow = volPts[volPts.length - 1].v
      const volAvg = mean(volPts.slice(0, -1).map((p) => p.v))
      push(
        'volume',
        GROUNDS,
        GC,
        {
          kind: 'bars',
          points: volPts,
          min: 0,
          max: Math.max(10, ...volPts.map((p) => p.v)) * 1.15,
          headV: `${volNow} sets`,
          tone: 'dim',
          urgency: 2,
          fmt: (v) => `${Math.round(v)} sets`,
        },
        V.dial.volume({ now: volNow, avg: volAvg }),
      )

      // lifts only, matching the headline figure (g.done is thisWeekCount,
      // which is isLift) — a sport week used to put bars above a headline
      // that refused to count them
      const sessPts: DialPoint[] = weeks.map((w) => ({
        label: w.label,
        v: workouts.filter((x) => {
          if (!isLift(x)) return false
          const t = new Date(x.performedAt).getTime()
          return t >= w.start.getTime() && t < w.end.getTime()
        }).length,
      }))
      push(
        'sessions',
        GROUNDS,
        GC,
        {
          kind: 'bars',
          points: sessPts,
          min: 0,
          max: Math.max(4, ...sessPts.map((p) => p.v), g.goal) * 1.2,
          rule: g.goal > 0 ? { v: g.goal, label: 'GOAL' } : undefined,
          headV: String(g.done),
          tone: g.goal > 0 && g.done >= g.goal ? 'good' : 'dim',
          urgency: 2,
          fmt: int,
        },
        V.dial.sessions({
          now: g.done,
          goal: g.goal,
          avg: mean(sessPts.slice(0, -1).map((p) => p.v)),
        }),
      )
    }

    /* ---- THE WATCH ------------------------------------------------------ */
    const WATCH = voice.modules.watch.name
    const WC = 'var(--color-w-watch)'
    const w = facts.watch

    if (w) {
      const hours = weeklyHoursSeries(events, ['shift'], 8, nowDate, weekStart, 'startAnchored')
      const weeks = weekBuckets(nowDate, 8, weekStart)
      const hourPts: DialPoint[] = weeks.map((b, i) => ({ label: b.label, v: hours[i] }))
      push(
        'watchhours',
        WATCH,
        WC,
        {
          kind: 'bars',
          points: hourPts,
          min: 0,
          max: Math.max(10, w.expectedH, ...hours) * 1.15,
          rule: w.expectedH > 0 ? { v: w.expectedH, label: 'BOOKED' } : undefined,
          headV: h1(w.doneH),
          tone: 'dim',
          urgency: 3,
          fmt: h1,
        },
        V.dial.watchhours({
          doneH: w.doneH,
          expectedH: w.expectedH,
          avg: mean(hours.slice(0, -1)),
          remaining: w.remaining,
        }),
      )

      const nightPts: DialPoint[] = weeks.map((b) => ({
        label: b.label,
        v: events.filter((e) => {
          if (e.kind !== 'shift' || e.allDay || !isNight(e)) return false
          const t = new Date(e.start).getTime()
          return t >= b.start.getTime() && t < b.end.getTime()
        }).length,
      }))
      if (nightPts.some((p) => p.v > 0)) {
        push(
          'nights',
          WATCH,
          WC,
          {
            kind: 'bars',
            points: nightPts,
            min: 0,
            max: Math.max(2, ...nightPts.map((p) => p.v)) * 1.25,
            headV: String(w.nights),
            tone: 'dim',
            urgency: 1,
            fmt: int,
          },
          V.dial.nights({ now: w.nights, avg: mean(nightPts.slice(0, -1).map((p) => p.v)) }),
        )
      }

      // gaps between one shift ending and the next beginning — the figure the
      // Watch's own cycle card prints, in a row so the tight ones are visible
      const shifts = events
        .filter((e) => e.kind === 'shift' && !e.allDay)
        .sort((a, b) => a.start.localeCompare(b.start))
      const gaps: DialPoint[] = []
      for (let i = 1; i < shifts.length; i++) {
        const gap =
          (new Date(shifts[i].start).getTime() - new Date(shifts[i - 1].end).getTime()) / 3_600_000
        if (gap <= 0 || gap > 24 * 14) continue
        const d = new Date(shifts[i].start)
        gaps.push({ label: `${MO[d.getMonth()]} ${d.getDate()}`, v: gap })
      }
      const lastGaps = gaps.slice(-8)
      if (lastGaps.length >= 2) {
        const TIGHT = 10
        const tightCount = lastGaps.filter((p) => p.v < TIGHT).length
        push(
          'turnaround',
          WATCH,
          WC,
          {
            kind: 'bars',
            points: lastGaps,
            min: 0,
            max: Math.max(12, ...lastGaps.map((p) => p.v)) * 1.15,
            rule: { v: TIGHT, label: 'TIGHT' },
            headV: `${Math.round(lastGaps[lastGaps.length - 1].v)} h`,
            tone: lastGaps[lastGaps.length - 1].v < TIGHT ? 'warn' : 'dim',
            urgency: w.turnaroundH !== null && w.turnaroundH < TIGHT ? 7 : 1,
            fmt: (v) => `${Math.round(v)} h`,
          },
          V.dial.turnaround({ now: w.turnaroundH, tightCount, tightLine: TIGHT }),
        )
      }

      const nights = dayBuckets(nowDate, 7)
      const sleepPts: DialPoint[] = nights.map((b) => ({
        label: b.label,
        v:
          events
            .filter((e) => e.kind === 'sleep')
            .reduce((t, e) => t + overlapMs(e, b.start.getTime(), b.end.getTime()), 0) / 3_600_000,
      }))
      if (sleepPts.some((p) => p.v > 0)) {
        const TARGET = 8
        push(
          'sleep',
          WATCH,
          WC,
          {
            kind: 'bars',
            points: sleepPts,
            min: 0,
            max: Math.max(10, ...sleepPts.map((p) => p.v)) * 1.1,
            rule: { v: TARGET, label: 'TARGET' },
            headV: h1(sleepPts[sleepPts.length - 1].v),
            tone: sleepPts[sleepPts.length - 1].v >= TARGET ? 'good' : 'dim',
            urgency: 2,
            fmt: h1,
          },
          V.dial.sleep({
            last: sleepPts[sleepPts.length - 1].v,
            avg: mean(sleepPts.map((p) => p.v)),
            target: TARGET,
          }),
        )
      }
    }

    /* ---- THE STUDY ------------------------------------------------------ */
    const STUDY = voice.modules.study.name
    const SC = 'var(--color-w-study)'
    const st = facts.study

    if (st) {
      const weeks = weekBuckets(nowDate, 8, weekStart)
      const hoursPts: DialPoint[] = weeks.map((b) => ({
        label: b.label,
        v: studyHoursBetween(events, studySessions, b.start, b.end),
      }))
      push(
        'studyhours',
        STUDY,
        SC,
        {
          kind: 'bars',
          points: hoursPts,
          min: 0,
          max: Math.max(4, st.goalH, ...hoursPts.map((p) => p.v)) * 1.15,
          rule: st.goalH > 0 ? { v: st.goalH, label: 'GOAL' } : undefined,
          headV: h1(st.fulfilledH),
          tone: st.goalH > 0 && st.fulfilledH >= st.goalH ? 'good' : 'dim',
          urgency: 2,
          fmt: h1,
        },
        V.dial.studyhours({
          now: st.fulfilledH,
          goalH: st.goalH,
          avg: mean(hoursPts.slice(0, -1).map((p) => p.v)),
        }),
      )

      // hours already put toward the next exam, and where the booked sessions
      // would take them by the day itself — solid behind, dashed ahead
      const nextExamRec = exams
        .filter((e) => e.on >= localDayKey(nowDate))
        .sort((a, b) => a.on.localeCompare(b.on))[0]
      if (st.exam && nextExamRec) {
        const from = new Date(nextExamRec.countFrom)
        const examDay = addDays(startOfLocalDay(new Date(`${nextExamRec.on}T00:00:00`)), 1)
        const span = Math.max(1, examDay.getTime() - from.getTime())
        const STEPS = 6
        const pts: DialPoint[] = []
        const fx: number[] = []
        for (let i = 1; i <= STEPS; i++) {
          const at = new Date(from.getTime() + ((nowH - from.getTime()) * i) / STEPS)
          pts.push({
            label: `${MO[at.getMonth()]} ${at.getDate()}`,
            v: studyHoursBetween(events, studySessions, from, at, nextExamRec.subjectId),
          })
          fx.push((at.getTime() - from.getTime()) / span)
        }
        pts.push({ label: 'EXAM', v: st.exam.doneH + st.exam.aheadH })
        fx.push(1)
        push(
          'examclock',
          STUDY,
          SC,
          {
            kind: 'pace',
            points: pts,
            fx,
            min: 0,
            max: Math.max(2, st.exam.doneH + st.exam.aheadH) * 1.15,
            nowIdx: STEPS - 1,
            headV: h1(st.exam.doneH),
            tone: st.exam.aheadH === 0 && st.exam.days <= 14 ? 'warn' : 'dim',
            urgency: st.exam.days <= 14 ? 8 - Math.max(0, st.exam.days) / 4 : 3,
            fmt: h1,
          },
          V.dial.examclock({
            subject: st.exam.subject,
            days: st.exam.days,
            doneH: st.exam.doneH,
            aheadH: st.exam.aheadH,
          }),
        )
      }

      const hwPts: DialPoint[] = weeks.map((b) => ({
        label: b.label,
        v: homework.filter((x) => {
          if (!x.done || !x.doneAt) return false
          const t = new Date(x.doneAt).getTime()
          return t >= b.start.getTime() && t < b.end.getTime()
        }).length,
      }))
      const open = homework.filter((x) => !x.done).length
      if (open > 0 || hwPts.some((p) => p.v > 0)) {
        push(
          'homework',
          STUDY,
          SC,
          {
            kind: 'bars',
            points: hwPts,
            min: 0,
            max: Math.max(3, ...hwPts.map((p) => p.v)) * 1.25,
            headV: String(hwPts[hwPts.length - 1].v),
            tone: open > 0 ? 'dim' : 'good',
            urgency: st.dueCount > 0 ? 4 : 1,
            fmt: int,
          },
          V.dial.homework({ now: hwPts[hwPts.length - 1].v, open }),
        )
      }
    }

    /* ---- THE WORKSHOP --------------------------------------------------- */
    const k = facts.workshop
    if (k) {
      const weeks = weekBuckets(nowDate, 8, weekStart)
      const pts: DialPoint[] = weeks.map((b) => ({
        label: b.label,
        v: benchHoursBetween(
          events,
          benchSessions,
          b.start,
          b.end,
          undefined,
          ventures,
          workEntries,
        ),
      }))
      push(
        'bench',
        voice.modules.workshop.name,
        'var(--color-w-workshop)',
        {
          kind: 'bars',
          points: pts,
          min: 0,
          max: Math.max(4, k.goalH, ...pts.map((p) => p.v)) * 1.15,
          rule: k.goalH > 0 ? { v: k.goalH, label: 'GOAL' } : undefined,
          headV: h1(k.fulfilledH),
          tone: k.goalH > 0 && k.fulfilledH >= k.goalH ? 'good' : 'dim',
          urgency: k.milestone && k.milestone.days <= 7 ? 5 : 2,
          fmt: h1,
        },
        V.dial.bench({
          now: k.fulfilledH,
          goalH: k.goalH,
          milestone: k.milestone
            ? { title: k.milestone.title, days: k.milestone.days }
            : null,
        }),
      )
    }

    /* ---- THE LEDGER ----------------------------------------------------- */
    const LEDGER = voice.modules.capital.name
    const LC = 'var(--color-w-ledger)'
    const l = facts.ledger

    if (l) {
      const series = netWorthSeries(snapshots, accounts)
      if (series.length >= 1) {
        const pts: DialPoint[] = series.map((p, i) => {
          const d = new Date(p.takenAt)
          return {
            label: i === series.length - 1 ? 'LATEST' : `${MO[d.getMonth()]} ${d.getDate()}`,
            v: p.value,
          }
        })
        const vals = pts.map((p) => p.v)
        const lo = Math.min(...vals)
        const hi = Math.max(...vals)
        const pad = Math.max(1, (hi - lo) * 0.2)
        push(
          'networth',
          LEDGER,
          LC,
          {
            kind: 'line',
            points: pts,
            min: lo - pad,
            max: hi + pad,
            headV: formatCompact(vals[vals.length - 1]),
            tone: l.delta ? (l.delta.up ? 'good' : 'warn') : 'dim',
            urgency: 3,
            fmt: (v) => formatILS(Math.round(v)),
          },
          V.dial.networth({
            value: l.netWorth,
            delta: l.delta ? l.delta.amount : null,
            up: l.delta?.up ?? true,
            points: series.length,
          }),
        )
      }

      if (series.length >= 2) {
        const moves: DialPoint[] = []
        for (let i = 1; i < series.length; i++) {
          const d = new Date(series[i].takenAt)
          moves.push({
            label: `${MO[d.getMonth()]} ${d.getDate()}`,
            v: series[i].value - series[i - 1].value,
          })
        }
        const last = moves.slice(-10)
        const total = last.reduce((t, p) => t + p.v, 0)
        const bound = Math.max(...last.map((p) => Math.abs(p.v)), 1) * 1.15
        push(
          'worthmoves',
          LEDGER,
          LC,
          {
            kind: 'diverge',
            points: last,
            min: -bound,
            max: bound,
            headV: `${total >= 0 ? '+' : '−'}${formatCompact(Math.abs(total))}`,
            tone: total >= 0 ? 'good' : 'warn',
            urgency: 1,
            fmt: (v) => `${v >= 0 ? '+' : '−'}${formatILS(Math.round(Math.abs(v)))}`,
          },
          V.dial.worthmoves({
            total: formatCompact(Math.abs(total)),
            up: total >= 0,
            count: last.length,
          }),
        )
      }

      const month = monthKey(nowDate)
      const breakdown = spendBreakdown(month, spends, recurring, spendItems)
      if (breakdown.total > 0) {
        const day = nowDate.getDate()
        const days = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate()
        const dated = spendItems.filter((x) => monthKey(new Date(x.date)) === month)
        const datedTotal = dated.reduce((t, x) => t + x.amount, 0)
        // the card snapshot is a running total with no day attached, so it is
        // spread flat over the days elapsed — the least-assuming shape there
        // is. Every dated one-off lands on its own day on top of that, and the
        // last point is exactly the month's real total.
        const flat = breakdown.variable - datedTotal
        const pts: DialPoint[] = []
        const fx: number[] = []
        for (let d = 1; d <= day; d++) {
          const upTo = dated
            .filter((x) => new Date(x.date).getDate() <= d)
            .reduce((t, x) => t + x.amount, 0)
          pts.push({
            label: `${MO[nowDate.getMonth()]} ${d}`,
            v: breakdown.fixed + (flat * d) / day + upTo,
          })
          fx.push(d / days)
        }
        push(
          'spending',
          LEDGER,
          LC,
          {
            kind: 'pace',
            points: pts,
            fx,
            min: 0,
            max: Math.max(monthlyBudget, breakdown.total) * 1.1,
            guide:
              monthlyBudget > 0 ? [[0, 0], [1, monthlyBudget]] : undefined,
            headV: formatCompact(breakdown.total),
            tone: l.over ? 'warn' : l.underPace ? 'good' : 'dim',
            urgency: l.over ? 6 : l.underPace ? 3 : 5,
            fmt: (v) => formatILS(Math.round(v)),
          },
          V.dial.spending({
            spent: l.spent,
            budget: l.budget,
            perDay: l.perDay,
            under: l.underPace,
            hasBudget: l.hasBudget,
            day,
            days,
            allowance: l.allowancePerDay,
          }),
        )
      }
    }

    /* ---- THE MANOR ------------------------------------------------------ */
    const w0 = startOfWeek(nowDate, weekStart)
    const bookedPts: DialPoint[] = Array.from({ length: 7 }, (_, i) => {
      const start = addDays(w0, i)
      const end = addDays(start, 1)
      return {
        label: DAY[start.getDay()],
        v:
          events
            .filter((e) => OCCUPYING.includes(e.kind))
            .reduce((t, e) => t + overlapMs(e, start.getTime(), end.getTime()), 0) / 3_600_000,
      }
    })
    const bookedTotal = bookedPts.reduce((t, p) => t + p.v, 0)
    if (bookedTotal > 0) {
      const peak = bookedPts.reduce((best, p) => (p.v > best.v ? p : best), bookedPts[0])
      push(
        'booked',
        voice.manor.name,
        'var(--color-accent)',
        {
          kind: 'bars',
          points: bookedPts,
          min: 0,
          max: 24,
          headV: h1(bookedTotal),
          tone: 'dim',
          urgency: 2,
          fmt: h1,
        },
        V.dial.booked({ totalH: bookedTotal, peakDay: peak.label, peakH: peak.v }),
      )
    }

    return dials.sort((a, b) => b.urgency - a.urgency)
    // `events` and the wing stores are the real inputs; `facts` is derived from
    // them and changes with them, which is why it is the only fact dependency.
  }, [
    facts,
    nowH,
    events,
    weekStart,
    workouts,
    studySessions,
    exams,
    subjects,
    homework,
    benchSessions,
    ventures,
    workEntries,
    accounts,
    snapshots,
    spends,
    spendItems,
    recurring,
    monthlyBudget,
  ])
}

/** the label a scrub chip shows for a muscle plate */
export { muscleLabel }

/** hours-of-work formatter, exported so the card footer prints the same shape */
export { h1 as formatHours }
