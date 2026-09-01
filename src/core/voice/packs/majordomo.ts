import type { VoicePack } from '../types'

/** Prose spells small numbers out; chips and figures stay digits. Index 0 is
 *  "No" so a zero case reads as a sentence rather than as a score. */
const WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
]

/** small integers as words, anything larger as digits */
function word(n: number): string {
  return WORDS[n] ?? String(n)
}

/** …the same, mid-sentence */
function lower(n: number): string {
  const w = WORDS[n]
  return w ? w.toLowerCase() : String(n)
}

/** hours as words where they land whole, else a figure ("twelve and a half") */
function hoursWord(h: number): string {
  const rounded = Math.round(h * 2) / 2
  const whole = Math.floor(rounded)
  const half = rounded - whole >= 0.5
  if (rounded > 12) return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}`
  if (!half) return lower(whole)
  return whole === 0 ? 'half an' : `${lower(whole)} and a half`
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** "a", "a and b", "a, b and c" — no serial comma, the register elsewhere */
function and(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** capitalise a clause that a number-word may be leading ("no hours stood…") */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Today"/"Tomorrow" are proper nouns at the head of a sentence and plain
 *  words inside one; weekday names stay capitalised either way. */
function midSentence(label: string): string {
  return label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : label
}

/**
 * A slept duration, in prose: "seven hours and twenty minutes".
 *
 * Sleep is the one figure in this app that people say out loud in words
 * rather than read off a dial, and "6.7 hours" is not a thing anyone has ever
 * said about a night. Rounded to five minutes, because a log typed on a phone
 * at seven in the morning does not carry a minute of real precision.
 */
function fmtSlept(hours: number): string {
  const total = Math.max(0, Math.round((hours * 60) / 5) * 5)
  const h = Math.floor(total / 60)
  const m = total % 60
  const hPart = `${lower(h)} ${plural(h, 'hour', 'hours')}`
  if (m === 0) return hPart
  const mPart = `${lower(m)} ${plural(m, 'minute', 'minutes')}`
  return h === 0 ? mPart : `${hPart} and ${mPart}`
}

/** "9 h 20 m" — the countdown format the Watch already prints */
function untilLabel(h: number, m: number): string {
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`
}

/** The Majordomo — the commercial voice. Dry, composed, quietly satisfied. */
export const majordomoPack: VoicePack = {
  house: {
    title: 'THE HOUSE',
    subtitle: 'each wing, in its own numbers',
    rowLabel: {
      manor: 'booked of 168 h',
      watch: 'worked',
      grounds: 'workouts',
      study: 'studied',
      workshop: 'at the bench',
      capital: 'budget left',
      capitalSpent: 'spent this month',
    },
    signal: {
      dutyLoad: 'DUTY LOAD · 8 WEEKS',
      readiness: 'READINESS',
      examRunway: 'NEXT EXAM',
      milestoneRunway: 'NEXT MILESTONE',
      burnRate: 'SPEND PER DAY',
      dutyLoadLine: ({ thisWeek, avg }) => {
        // a first counted week has a figure but nothing to measure it against;
        // saying "nothing to show yet" beside a drawn line is a contradiction
        if (avg <= 0) {
          return thisWeek > 0
            ? 'Your first week on record. Nothing to compare it against yet.'
            : 'No shifts scheduled.'
        }
        const d = thisWeek - avg
        if (Math.abs(d) < 1) return 'About the same as your usual week.'
        return d > 0
          ? `${sentence(hoursWord(d))} ${plural(Math.round(d), 'hour', 'hours')} more than your usual week.`
          : `${sentence(hoursWord(-d))} ${plural(Math.round(-d), 'hour', 'hours')} less than your usual week.`
      },
      readinessLine: ({ band, limiter }) => {
        if (!limiter) return "Nothing is sore. You're good to train."
        const state =
          { fresh: 'fresh', ready: 'fine', worn: 'worn down', spent: 'wiped out' }[band] ??
          'worn down'
        return `Sorest right now: ${limiter}. Overall you're ${state}.`
      },
      examRunwayLine: ({ subject, days, bookedH }) => {
        const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${lower(days)} days`
        return bookedH > 0
          ? `${subject} ${when}. You have ${hoursWord(bookedH)} ${plural(Math.round(bookedH), 'hour', 'hours')} of study booked before it.`
          : `${subject} ${when}. Nothing booked before it.`
      },
      milestoneRunwayLine: ({ venture, title, days }) => {
        if (days < 0) {
          return `${title} for ${venture} is ${lower(-days)} ${plural(-days, 'day', 'days')} past its day.`
        }
        const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${lower(days)} days`
        return `${title} for ${venture} ${when}.`
      },
      burnRateLine: ({ perDay, prevPerDay }) =>
        prevPerDay
          ? `${perDay} a day. Last month it was ${prevPerDay} a day.`
          : `${perDay} a day so far this month.`,
      idle: 'Nothing to show yet.',
    },
    pattern: {
      title: 'THE PATTERN',
      lines: {
        trainAfterWatch: ({ title, mins, before }) => {
          const h = Math.round((mins / 60) * 10) / 10
          return before
            ? `${title} ends ${hoursWord(h)} ${plural(Math.round(h), 'hour', 'hours')} before your shift starts. You'd start that shift already tired.`
            : `${title} starts ${hoursWord(h)} ${plural(Math.round(h), 'hour', 'hours')} after your shift ends. You'd train already tired.`
        },
        studyUntouched: ({ subject }) => `${subject} has a goal this week, but nothing booked for it.`,
        none: 'Nothing clashes this week.',
      },
      action: 'MOVE IT →',
    },
  },
  briefing: {
    label: 'THE BRIEFING',
    expand: 'Show the full briefing',
    collapse: 'Show less',
    brief: {
      stamp: ({ time, day }) => `WRITTEN ${time} · ${day}`,
      skip: 'SKIP',
      penButton: 'THE PEN',
      pen: {
        title: 'THE PEN',
        sub: 'what the brief covers',
        close: 'Close',
        note: 'The brief is rewritten when you close this.',
        counselLabel: 'ADVICE',
        counselNote: 'his suggestions and warnings',
      },
      areaLabel: {
        shifts: 'SHIFTS',
        sleep: 'SLEEP',
        rest: 'RECOVERY',
        workouts: 'WORKOUTS',
        muscles: 'MUSCLES',
        food: 'FOOD',
        bench: 'BENCH',
        study: 'STUDY',
        reports: 'REPORTS',
        worth: 'NET WORTH',
        spending: 'SPENDING',
      },
      greeting: (hour) =>
        hour < 5
          ? 'Good evening.'
          : hour < 12
            ? 'Good morning.'
            : hour < 18
              ? 'Good afternoon.'
              : 'Good evening.',
      closing: {
        quiet: 'Nothing else needs you today, sir.',
        silent: 'The wings have been asked to keep quiet. Nothing needs you, sir.',
      },
      line: {
        shifts: ({ watch: w }) => {
          if (!w) return null
          if (w.expectedH === 0 && w.doneH === 0 && !w.next) return null
          const parts: string[] = []
          if (w.expectedH > 0) {
            parts.push(`You have worked ${w.doneH.toFixed(1)} of ${w.expectedH.toFixed(1)} hours this week.`)
          } else if (w.doneH > 0) {
            parts.push(`You have worked ${w.doneH.toFixed(1)} hours this week.`)
          } else {
            parts.push('No shifts on the books this week.')
          }
          if (w.next) {
            parts.push(
              `The next ${w.next.night ? 'night shift' : 'shift'} starts ${midSentence(w.next.dayLabel)} at ${w.next.at}.`,
            )
          }
          return parts.join(' ')
        },
        // The clause the Watch used to write about its own pencil marks now
        // reports what was actually slept. A pencilled block is a plan, and a
        // plan reported as a night is how a week of six-hour suggestions used
        // to read as a week of rest.
        sleep: ({ sleep: n }) => {
          if (!n) return null
          if (!n.last) {
            return n.covered7 > 0 ? null : 'No nights are written down yet.'
          }
          const first = n.last.today
            ? `You slept ${fmtSlept(n.last.hours)} last night, ${n.last.bed} to ${n.last.wake}.`
            : `The last night on file is ${midSentence(n.last.dayLabel)}: ${fmtSlept(n.last.hours)}, ${n.last.bed} to ${n.last.wake}.`
          const parts = [first]
          if (n.covered7 >= 3) {
            parts.push(
              `That averages ${fmtSlept(n.avg7H)} a night across the ${lower(n.covered7)} ${plural(n.covered7, 'night', 'nights')} of this week you have written down.`,
            )
          }
          if (n.targetH > 0 && n.debtH >= 1) {
            parts.push(`The fortnight is ${fmtSlept(n.debtH)} short of ${n.targetH} a night.`)
          }
          return parts.join(' ')
        },
        // Recovery is its own clause because it is the one place sleep changes
        // another wing's numbers, and a reader must be able to switch off the
        // modelling without losing the plain hours.
        rest: ({ sleep: n }) => {
          if (!n || !n.recovery.couplingOn) return null
          const r = n.recovery
          if (!r.applied) {
            return r.covered >= 1
              ? `Sleep is not moving the recovery clock — ${lower(r.covered)} of the last seven ${plural(r.covered, 'night is', 'nights are')} on file, and I want ${lower(r.needed)}.`
              : null
          }
          if (r.pct === 0) return 'Your sleep leaves the recovery clock where it is.'
          return r.pct > 0
            ? `On that sleep I am running recovery ${r.pct} per cent slower than the book.`
            : `On that sleep I am running recovery ${-r.pct} per cent faster than the book.`
        },
        workouts: ({ grounds: g }) => {
          if (!g) return null
          // "No of four workouts are done" is what naming the goal first costs
          // on a quiet week; a zero is a sentence, not a score
          const week =
            g.done === 0
              ? 'Nothing has been logged this week.'
              : g.goal > 0
                ? `${word(g.done)} of ${lower(g.goal)} workouts ${plural(g.done, 'is', 'are')} done this week.`
                : `${word(g.done)} ${plural(g.done, 'workout is', 'workouts are')} done this week.`
          const parts = [week]
          // readiness off an empty history is 100 by construction, which reads
          // as a claim about a body nobody has measured
          if (g.sinceLastH !== null) parts.push(`Readiness is ${g.readiness.score} of 100.`)
          if (g.nextBlock) {
            parts.push(`${g.nextBlock.title} is next, ${midSentence(g.nextBlock.dayLabel)}.`)
          }
          return parts.join(' ')
        },
        muscles: ({ grounds: g }) => {
          if (!g || !g.top) return null
          if (g.hot === 0) {
            return `Nothing is sore. ${g.top.name} is the last group still warm, at ${g.top.strain.toFixed(1)}.`
          }
          const cold = g.coldest ? ` ${g.coldest} is the freshest.` : ''
          return `${sentence(word(g.hot))} ${plural(g.hot, 'muscle group is', 'muscle groups are')} still sore — ${g.top.name} leads at ${g.top.strain.toFixed(1)}.${cold}`
        },
        food: ({ grounds: g }) =>
          !g || g.kcal <= 0
            ? null
            : `Today wants ${g.kcal.toLocaleString('en-US')} kcal and ${g.protein} g of protein across ${lower(g.meals)} ${plural(g.meals, 'meal', 'meals')} — ${g.isTrainingDay ? 'training-day' : 'rest-day'} rates.`,
        bench: ({ workshop: k }) => {
          if (!k) return null
          if (k.benchLive) return `The bench clock is running on ${k.benchLive.venture} right now.`
          const parts: string[] = []
          if (k.goalH > 0) {
            parts.push(`The bench has ${k.fulfilledH.toFixed(1)} of ${k.goalH.toFixed(1)} hours this week.`)
          } else if (k.fulfilledH > 0) {
            parts.push(`The bench has ${k.fulfilledH.toFixed(1)} hours this week.`)
          }
          if (k.milestone) {
            const m = k.milestone
            parts.push(
              m.days < 0
                ? `${m.title} for ${m.venture} is ${lower(-m.days)} ${plural(-m.days, 'day', 'days')} late.`
                : m.days === 0
                  ? `${m.title} for ${m.venture} is due today.`
                  : `${m.title} for ${m.venture} is ${lower(m.days)} ${plural(m.days, 'day', 'days')} out.`,
            )
          }
          return parts.length > 0 ? parts.join(' ') : null
        },
        study: ({ study: s }) => {
          if (!s) return null
          const parts: string[] = []
          if (s.goalH > 0) {
            parts.push(`The Study has ${s.fulfilledH.toFixed(1)} of ${s.goalH.toFixed(1)} hours this week.`)
          } else if (s.fulfilledH > 0) {
            parts.push(`The Study has ${s.fulfilledH.toFixed(1)} hours this week.`)
          }
          if (s.exam) {
            const e = s.exam
            const when =
              e.days <= 0 ? 'is today' : e.days === 1 ? 'is tomorrow' : `is ${lower(e.days)} days away`
            parts.push(
              e.aheadH > 0
                ? `The ${e.subject} exam ${when}, with ${e.aheadH.toFixed(1)} hours booked before it.`
                : `The ${e.subject} exam ${when}, and nothing is booked before it.`,
            )
          }
          return parts.length > 0 ? parts.join(' ') : null
        },
        reports: ({ study: s }) => {
          if (!s) return null
          const parts: string[] = []
          if (s.awaiting > 0) {
            parts.push(
              `${sentence(word(s.awaiting))} ${plural(s.awaiting, 'session is', 'sessions are')} still waiting on a report.`,
            )
          }
          if (s.dueCount > 0) {
            parts.push(
              `${sentence(word(s.dueCount))} ${plural(s.dueCount, 'piece', 'pieces')} of homework ${plural(s.dueCount, 'is', 'are')} due this week.`,
            )
          }
          return parts.length > 0 ? parts.join(' ') : null
        },
        worth: ({ ledger: l }) => {
          if (!l) return null
          return l.delta
            ? `The Ledger holds ${l.netWorth}, ${l.delta.up ? 'up' : 'down'} ${l.delta.amount} since ${l.delta.basis}.`
            : `The Ledger holds ${l.netWorth}.`
        },
        spending: ({ ledger: l }) => {
          if (!l) return null
          const parts: string[] = []
          if (l.hasBudget) {
            parts.push(`You have spent ${l.spent} of ${l.budget} this month.`)
          } else if (l.perDay) {
            parts.push(`You have spent ${l.spent} this month.`)
          } else {
            return null
          }
          if (l.perDay) parts.push(`That runs ${l.perDay} a day.`)
          if (l.allowancePerDay) parts.push(`${l.allowancePerDay} a day is left to the end of it.`)
          return parts.join(' ')
        },
      },
      counsel: {
        shifts: ({ watch: w }) =>
          w && w.turnaroundH !== null && w.turnaroundH < 10
            ? `Two of those shifts sit ${w.turnaroundH.toFixed(0)} hours apart. That is tight.`
            : null,
        sleep: ({ sleep: n }) => {
          if (!n || n.targetH <= 0) return null
          if (n.covered7 >= 3 && n.avg7H > 0 && n.targetH - n.avg7H >= 1) {
            return 'An earlier hour tonight would cost you less than it looks.'
          }
          if (n.regularity !== null && n.regularity < 45) {
            return 'The hour you go down moves more than the hour you get up. That is the one worth holding.'
          }
          return null
        },
        rest: ({ sleep: n }) =>
          n && n.recovery.applied && n.recovery.pct >= 8
            ? 'I would take a set or two off the next session, sir.'
            : null,
        workouts: ({ grounds: g }) =>
          g && g.nextBlock && (g.readiness.band === 'worn' || g.readiness.band === 'spent')
            ? 'You are worn down. I would take that one easy.'
            : null,
        muscles: ({ grounds: g }) =>
          g && g.hot >= 4 ? 'That is a lot to be carrying. A rest day would settle it.' : null,
        food: () => null,
        bench: ({ workshop: k }) =>
          k && k.milestone && k.milestone.days >= 0 && k.milestone.days <= 7 && k.fulfilledH < k.goalH
            ? 'The bench is behind, with that date close.'
            : null,
        study: ({ study: s }) =>
          s && s.exam && s.exam.days >= 0 && s.exam.days <= 14 && s.exam.aheadH < 2
            ? 'I would book a session before it.'
            : null,
        reports: () => null,
        worth: () => null,
        spending: ({ ledger: l }) =>
          !l || !l.hasBudget
            ? null
            : l.over
              ? 'You are past the budget for this month.'
              : !l.underPace
                ? 'Spending is running ahead of pace.'
                : null,
      },
      instruments: {
        title: 'THE INSTRUMENTS',
        sub: "four dials, picked for today — what moved, what's owed, what's close",
      },
      shelf: {
        title: 'ALSO ON FILE',
        note: 'Pick a chip, then choose the dial it replaces. Drag across a chart to read it point by point.',
        picking: (label) => `Choose the dial ${label} replaces — or press its chip again to leave things as they are.`,
        place: (label) => `PUT ${label} HERE`,
        replaces: (cat) => `replaces ${cat}`,
      },
      noDials: 'Nothing on file to draw yet.',
      dialName: {
        bodyheat: 'BODY HEAT',
        strain: 'SORENESS',
        readiness: 'READINESS',
        volume: 'VOLUME',
        sessions: 'WORKOUTS',
        watchhours: 'HOURS WORKED',
        sleep: 'SLEEP',
        sleepdebt: 'SLEEP DEBT',
        sleepclock: 'BODY CLOCK',
        turnaround: 'TURNAROUND',
        nights: 'NIGHT SHIFTS',
        studyhours: 'STUDY HOURS',
        examclock: 'EXAM COUNTDOWN',
        homework: 'HOMEWORK',
        bench: 'BENCH HOURS',
        networth: 'NET WORTH',
        spending: 'SPENDING',
        worthmoves: 'CHANGES',
        booked: 'BOOKED HOURS',
      },
      dialRange: {
        bodyheat: 'RIGHT NOW',
        strain: "THIS WEEK + WHAT'S COMING",
        readiness: 'LAST 14 DAYS',
        volume: 'LAST 8 WEEKS',
        sessions: 'LAST 8 WEEKS',
        watchhours: 'LAST 8 WEEKS',
        sleep: 'LAST 14 NIGHTS',
        sleepdebt: 'LAST 14 NIGHTS',
        sleepclock: 'LAST 14 NIGHTS',
        turnaround: 'LAST 8 GAPS',
        nights: 'LAST 8 WEEKS',
        studyhours: 'LAST 8 WEEKS',
        examclock: 'UP TO THE EXAM',
        homework: 'LAST 8 WEEKS',
        bench: 'LAST 8 WEEKS',
        networth: 'EVERY SNAPSHOT',
        spending: 'THIS MONTH',
        worthmoves: 'BETWEEN SNAPSHOTS',
        booked: 'THIS WEEK',
      },
      dial: {
        bodyheat: ({ hot, muscles, top, topStrain, readiness }) => ({
          headSub: top ? `${top} ${topStrain.toFixed(1)} · ready ${readiness}` : `ready ${readiness}`,
          why:
            hot === 0
              ? 'Everything has recovered. You can train what you like.'
              : `${sentence(word(hot))} of ${lower(muscles)} groups still carry soreness.`,
        }),
        strain: ({ now, peak, peakLabel, hotLine }) => ({
          headSub: peak > now && peakLabel ? `peaks ${peak.toFixed(1)} ${peakLabel}` : 'settling',
          why:
            peak >= hotLine
              ? 'Soreness already owed but not yet felt. The line crosses sore before it drops.'
              : 'Nothing ahead crosses the sore line. The week is clear to train.',
        }),
        readiness: ({ now, avg, band }) => ({
          headSub:
            { fresh: 'fresh', ready: 'ready', worn: 'worn down', spent: 'wiped out' }[band],
          why:
            now >= avg
              ? 'Better than your usual fortnight.'
              : 'Below your usual fortnight — the week has cost something.',
        }),
        volume: ({ now, avg }) => ({
          headSub: avg > 0 ? `usually ${avg.toFixed(0)}` : 'week in progress',
          why:
            avg <= 0
              ? 'The first weeks on record. Nothing to compare against yet.'
              : now >= avg
                ? 'A heavier week than usual for hard sets.'
                : 'A lighter week than usual for hard sets.',
        }),
        sessions: ({ now, goal, avg }) => ({
          headSub: goal > 0 ? `of ${goal} this week` : 'this week',
          why:
            avg <= 0
              ? 'The first weeks on record.'
              : now >= avg
                ? 'At or above your usual count.'
                : 'Under your usual count for a week.',
        }),
        watchhours: ({ doneH, expectedH, avg, remaining }) => ({
          headSub: expectedH > 0 ? `of ${expectedH.toFixed(1)} booked` : 'this week',
          why:
            remaining > 0
              ? `${sentence(word(remaining))} more ${plural(remaining, 'shift', 'shifts')} to go. The bar fills as they are worked.`
              : avg > 0 && doneH > avg
                ? 'A heavier week than usual on shift.'
                : 'Every shift on the books is worked.',
        }),
        sleep: ({ last, avg, target, covered, window }) => ({
          headSub:
            last === null
              ? 'nothing on last night'
              : target > 0
                ? last >= target
                  ? `at or over ${target}`
                  : `${fmtSlept(target - last)} short of ${target}`
                : `${fmtSlept(avg)} a night on average`,
          why:
            covered === 0
              ? 'Nothing is written down yet. Two clock times a morning is the whole of it.'
              : covered < window
                ? `Drawn from the ${lower(covered)} ${plural(covered, 'night', 'nights')} of the last ${lower(window)} you wrote down. The gaps are gaps, not zeroes.`
                : target > 0 && avg >= target
                  ? 'The fortnight averages at or above your mark.'
                  : 'The bars are what you slept. The line is what you asked of yourself.',
        }),
        sleepdebt: ({ now, target, covered, window }) => ({
          headSub: now < 1 ? 'nothing owed' : `owed against ${target} a night`,
          why:
            covered === 0
              ? 'Nothing is written down yet.'
              : now < 1
                ? 'The fortnight has kept up with itself.'
                : `Short nights add here and long ones pay back at half. Drawn from the ${lower(covered)} ${plural(covered, 'night', 'nights')} of the last ${lower(window)} on file.`,
        }),
        sleepclock: ({ regularity, driftMin, usualBed, usualWake, covered }) => ({
          headSub:
            regularity === null
              ? `${lower(covered)} of three nights`
              : usualBed && usualWake
                ? `usually ${usualBed} to ${usualWake}`
                : 'steadiness of the hour',
          why:
            regularity === null
              ? 'Three nights on file and I can say how steady the hour is.'
              : driftMin !== null && driftMin >= 90
                ? `The middle of your night moves about ${lower(Math.round(driftMin / 15) * 15)} minutes either way. Every band is one night; the line is the hour you usually keep.`
                : 'Every band is one night, drawn against the hour you usually keep.',
        }),
        turnaround: ({ now, tightCount, tightLine }) => ({
          headSub: now === null ? 'no gap to measure' : 'since the last shift',
          why:
            tightCount > 0
              ? `${sentence(word(tightCount))} ${plural(tightCount, 'gap', 'gaps')} under ${tightLine} hours. Those are the ones that cost you.`
              : 'Every gap gives you time to recover.',
        }),
        nights: ({ now, avg }) => ({
          headSub: `${plural(now, 'night', 'nights')} this week`,
          why:
            avg <= 0
              ? 'No night shifts on record yet.'
              : now > avg
                ? 'More nights than the rotation usually asks.'
                : 'About what the rotation usually asks.',
        }),
        studyhours: ({ now, goalH, avg }) => ({
          headSub: goalH > 0 ? `of ${goalH.toFixed(1)} this week` : 'this week',
          why:
            avg <= 0
              ? 'The first weeks on record.'
              : now >= avg
                ? 'A stronger week than usual at the desk.'
                : 'Study dips on shift-heavy weeks. This is one.',
        }),
        examclock: ({ subject, days, aheadH }) => ({
          headSub:
            aheadH > 0
              ? `done for ${subject} · ${aheadH.toFixed(1)} h booked`
              : `done for ${subject} · nothing booked`,
          why:
            days <= 0
              ? 'The exam is here. This is everything you put in.'
              : aheadH > 0
                ? `${sentence(lower(days))} days out. The dashed line is where the booked sessions take you.`
                : `${sentence(lower(days))} days out, and nothing is booked before it.`,
        }),
        homework: ({ open }) => ({
          headSub: open > 0 ? `${open} still open` : 'nothing outstanding',
          why:
            open > 0
              ? 'What you have struck, week by week. The open ones are still yours.'
              : 'The docket is clear.',
        }),
        bench: ({ now, goalH, milestone }) => ({
          headSub: goalH > 0 ? `of ${goalH.toFixed(1)} this week` : 'this week',
          why: milestone
            ? milestone.days < 0
              ? `${milestone.title} is past its day.`
              : `${milestone.title} is ${lower(milestone.days)} ${plural(milestone.days, 'day', 'days')} out.`
            : now > 0
              ? 'Bench hours, week by week.'
              : 'The bench has been quiet.',
        }),
        networth: ({ delta, up, points }) => ({
          headSub: delta ? `${up ? '▲' : '▼'} ${delta}` : `${points} ${plural(points, 'snapshot', 'snapshots')}`,
          why:
            points < 2
              ? 'One snapshot so far. The line needs a second to say anything.'
              : 'Every snapshot you have taken, in order.',
        }),
        spending: ({ under, hasBudget, perDay, day, days, allowance }) => ({
          headSub: !hasBudget
            ? `day ${day} of ${days}`
            : under
              ? allowance
                ? `under pace — ${allowance} a day left`
                : 'under pace'
              : 'ahead of pace',
          why: hasBudget
            ? perDay
              ? `Running ${perDay} a day. The dashed line is where even pace would sit.`
              : 'The dashed line is where even pace would sit.'
            : 'What has gone out this month, day by day. Set a budget and the pace line appears.',
        }),
        worthmoves: ({ total, up, count }) => ({
          headSub: `${up ? 'up' : 'down'} over ${count} ${plural(count, 'move', 'moves')}`,
          why: `Each bar is one snapshot against the one before it. ${total} across the lot.`,
        }),
        booked: ({ totalH, peakDay, peakH }) => ({
          headSub: 'of the week’s 168 hours',
          why:
            totalH <= 0
              ? 'Nothing booked this week.'
              : `${peakDay} is the heaviest day, at ${peakH.toFixed(1)} hours.`,
        }),
      },
    },
  },
  appName: 'Majordomo',
  wordmark: { lead: 'MAJORDOMO', accent: '' },
  skinPickerBlurb: 'Three looks for the same app. Switches instantly. Nothing else changes.',
  storageWarning: 'Your browser is blocking storage (private mode?). Nothing will survive a reload.',
  presetLabel: 'PRESET',
  wingsTab: 'WINGS',
  ui: {
    discard: {
      title: 'Leave this unsaved?',
      body: "You haven't saved these changes. Closing will lose them.",
      confirm: 'Discard',
    },
  },
  manor: {
    name: 'THE MANOR',
    empty: 'Nothing on the calendar this week.',
    quickAddLabel: 'QUICK ADD',
    crossesMidnight: 'Runs past midnight. It stays one block.',
    monthNote: 'A night shift sits on the day it starts. The next day gets the "runs past" arrow.',
    briefing: (count) => {
      if (count === 0) return 'No shifts this week. The week is yours.'
      if (count === 1) return 'One shift this week. A quiet stretch.'
      const words = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
      return `${words[count] ?? count} shifts this week.`
    },
    briefingStat: ({ watchH, trainingCount, studyH }) => {
      const parts: string[] = []
      if (watchH > 0) parts.push(`${watchH.toFixed(1)} h on shift`)
      if (trainingCount > 0) parts.push(`${trainingCount} training`)
      if (studyH > 0) parts.push(`${studyH.toFixed(0)} h study`)
      return parts.join(' · ')
    },
    briefingScope: { now: 'TODAY', viewing: 'VIEWING' },
    anchoredEarlier: 'That one starts last week. Move it from there.',
    custom: {
      row: 'Something else…',
      kindLabel: 'KIND',
      book: 'ADD IT',
      back: '‹ Templates',
      wontFit: "Won't fit here.",
    },
    bench: {
      row: 'At the bench…',
      ventureLabel: 'WHICH VENTURE',
      book: 'ON THE BOOKS',
    },
    occupied:'That hour is already taken.',
    occupiedShort: 'taken',
    moved: 'Moved.',
    restored: 'Put back.',
    asYouWere: 'Left as it was.',
    onTheBooks: 'Added.',
    removed: 'Removed.',
    removeLabel: 'Remove',
    moveTitle: 'Move it to another day?',
    moveBody: ({ title, from, to }) => `${title} would run ${to} instead of ${from}.`,
    moveYes: 'Move it',
    undoLabel: 'UNDO',
    quickAddTitle: 'QUICK ADD',
    slotClear: 'This slot is free.',
    quickAdd: {
      dayLabel: 'WHICH DAY',
      dateLabel: 'Pick a date',
      otherWeek: 'Another week. The calendar will follow it.',
      whatLabel: 'WHAT GOES THERE',
    },
    movePlace: 'Tap where it should go.',
    releaseCancel: 'RELEASE TO CANCEL',
    movedTo: (time) => `Moved to ${time}.`,
    resized: ({ hours, longer }) =>
      longer ? `Extended to ${hours} h.` : `Shortened to ${hours} h.`,
    resizeHandle: 'Drag to change when it ends',
    nearWatchLine: ({ mins, before }) =>
      before
        ? `Ends ${mins} minutes before your shift.`
        : `Starts ${mins} minutes after your shift.`,
    nearWatchTitle: 'One thing first.',
    nearWatchBody: "Your shift sits right up against this hour. You'd be training tired.",
    eventSheet: {
      move: 'MOVE',
      edit: 'Edit',
      editTitle: 'QUICK EDIT',
      titleLabel: 'TITLE',
      startLabel: 'START',
      durationLabel: 'DURATION',
      save: 'SAVE',
      openIn: (wing) => `Open in ${wing} →`,
    },
    monthLegend: { runsPast: 'runs past', strain: 'strain' },
    templates: [
      { kind: 'shift', title: 'The Watch', hours: 13 },
      { kind: 'training', title: 'Strength — lower', hours: 1.5 },
      { kind: 'training', title: 'Strength — upper', hours: 1.5 },
      { kind: 'training', title: 'Run — hard', hours: 1 },
      { kind: 'study', title: 'Study', hours: 2 },
      { kind: 'sleep', title: 'Sleep', hours: 6 },
    ],
    strain: {
      tooltip: ({ names, forecast }) => {
        if (names.length === 0) return forecast ? 'Recovered by then.' : 'Nothing sore.'
        const shown = names.slice(0, 3)
        const rest = names.length - shown.length
        const list =
          rest > 0
            ? `${shown.join(', ')} and ${rest} more`
            : shown.length === 1
              ? shown[0]
              : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
        return forecast ? `${list} — sore by then.` : `${list} — still sore.`
      },
    },
    headsUp: {
      monthGreeting: (month) => `Happy ${month}.`,
      weekGreeting: (day) => `Happy ${day}.`,
      unfiledWorkout: ({ day }) => {
        const d = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
        return `${d === 'today' || d === 'yesterday' ? `${d[0].toUpperCase()}${d.slice(1)}'s` : `${d}'s`} training block has nothing logged against it. Add the details and it counts toward your strain.`
      },
      examUnbooked: ({ subject, days }) =>
        `The ${subject} exam is ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} and you have no study booked.`,
      nextWeekWatches:
        'Next week has no shifts yet. Easier to block them out now than later.',
      weekPlan: 'The week is empty. Worth blocking out the shifts and training when you have a moment.',
      snapshotNudge:
        'Payday has passed. A fresh snapshot of the balances would keep the Ledger honest.',
      nightTonight: 'A night shift tonight. Keep the afternoon for sleep.',
      awaitingReport: (n) =>
        n === 1
          ? 'One study session still needs logging.'
          : `${n} study sessions still need logging.`,
      goalBehind: ({ done, goal }) =>
        `${done} session${done === 1 ? '' : 's'} of ${goal} this week, and the week is nearly out.`,
    },
    whatIf: {
      button: '⧉ WHAT-IF',
      // "the ledger" collided with THE LEDGER wing one tab over — the first
      // read was that your net worth was being rehearsed
      banner: 'This is a draft of the week. Nothing changes until you apply.',
      panelTitle: 'WHAT CHANGES',
      panelSub: 'hours this week, before → after',
      noteClean: 'Drag things around. I will keep the originals faint underneath.',
      noteDirty: 'The faint blocks are how the week stands now.',
      changes: (n) => (n === 0 ? 'no changes yet' : n === 1 ? '1 change' : `${n} changes`),
      apply: 'APPLY',
      discard: 'Discard',
      applied: 'Applied.',
      conflict: ({ title, mins, before }) =>
        before
          ? `${title} would end ${mins} minutes before your shift.`
          : `${title} would start ${mins} minutes after your shift.`,
    },
  },
  grounds: {
    ledger: {
      title: 'The muscle ledger',
      hotNow: 'HOT NOW',
      hotNowValue: ({ hot, total }) => `${hot} of ${total}`,
      colStrain: 'strain',
      colSets: 'sets · 7 days',
      sets: (n) => `~${n} ${plural(n, 'set', 'sets')}`,
      peak: 'Hottest now',
      expandLabel: (total) => `All ${total}`,
      collapseLabel: 'Fewer',
      expandHint: 'Show every muscle in the ledger',
      collapseHint: 'Show only the four hottest',
      allCold: 'Nothing is hot right now. Everything has recovered.',
      note: "Sets are an estimate. The app logs sessions, not sets. Runs feed recovery but don't count as sets.",
    },
    briefingPanel: {
      chips: ({ done, goal, hot, muscles, readiness }) => [
        { label: 'WEEK', value: goal > 0 ? `${done} / ${goal}` : String(done) },
        { label: 'HOT', value: `${hot} of ${muscles}` },
        { label: 'READY', value: String(readiness.score) },
      ],
      headline: ({ done, goal, hot, top }) => {
        const week =
          goal > 0
            ? `${word(done)} ${plural(done, 'workout', 'workouts')} of ${lower(goal)} this week`
            : done > 0
              ? `${word(done)} ${plural(done, 'workout', 'workouts')} this week`
              : 'Nothing logged this week'
        if (hot === 0 || !top) {
          return `${week}, and nothing is still hot. You're free to train hard.`
        }
        return `${week}, and ${lower(hot)} ${plural(hot, 'muscle group is', 'muscle groups are')} still hot. ${top.name} leads at ${top.strain.toFixed(1)}.`
      },
      detail: ({
        readiness,
        kcal,
        protein,
        meals,
        isTrainingDay,
        nextBlock,
        blocksAhead,
        sinceLastH,
      }) => {
        const bandWord = {
          fresh: 'fresh',
          ready: 'ready',
          worn: 'worn',
          spent: 'spent',
        }[readiness.band]
        const parts = [`Readiness ${readiness.score} of 100, ${bandWord}.`]
        // how long the body has been left alone is the other half of a
        // readiness score — the number says how recovered, this says since when
        if (sinceLastH === null) {
          parts.push('Nothing has been logged yet.')
        } else if (sinceLastH < 1) {
          parts.push('Your last session was less than an hour ago.')
        } else if (sinceLastH < 24) {
          const h = Math.round(sinceLastH)
          parts.push(`Your last session was ${lower(h)} ${plural(h, 'hour', 'hours')} ago.`)
        } else {
          const d = Math.floor(sinceLastH / 24)
          parts.push(`${sentence(word(d))} ${plural(d, 'day has', 'days have')} passed since the last session.`)
        }
        if (kcal > 0) {
          parts.push(
            `You need ${kcal.toLocaleString('en-US')} kcal on ${isTrainingDay ? 'a training day' : 'a rest day'}, and ${protein} g of protein across ${lower(meals)} ${plural(meals, 'meal', 'meals')}.`,
          )
        }
        if (nextBlock) {
          const more =
            blocksAhead > 1
              ? `${word(blocksAhead)} blocks are still booked. The next is`
              : 'One block left:'
          parts.push(`${more} ${nextBlock.dayLabel}'s ${nextBlock.title}.`)
        } else {
          parts.push('Nothing else is booked on the Manor.')
        }
        return parts.join(' ')
      },
      aside: ({ carbs, fat, kcal, coldest, done, goal, trainNext }) => {
        const parts: string[] = []
        // the carb/fat split was the Grounds' own summary card; the briefing
        // only ever quoted the two headline macros, so opening it now finishes
        // the plate rather than sending the reader to another screen
        if (kcal > 0) {
          parts.push(`${carbs} g of carbohydrate and ${fat} g of fat complete the day.`)
        }
        // a group that is both recovered and behind its week is a real
        // recommendation; the freshest-group line is the fallback when nothing
        // is actually owed
        if (trainNext) {
          const sets = Math.round(trainNext.sets)
          parts.push(
            `${trainNext.group} is recovered and behind its week — ${sets === 0 ? 'none' : lower(sets)} of ${lower(Math.round(trainNext.target))} sets, sir.`,
          )
        } else if (coldest) parts.push(`${coldest} is your freshest group.`)
        if (goal > 0) {
          const left = goal - done
          parts.push(
            left > 0
              ? `${sentence(word(left))} more ${plural(left, 'session', 'sessions')} ${plural(left, 'meets', 'meet')} the weekly goal.`
              : 'The weekly goal is met.',
          )
        }
        return parts.length > 0 ? parts.join(' ') : null
      },
    },
    scheduledTitle: 'Coming up',
    scheduledNote: 'These are booked on the Manor. Move or remove them there.',
    recoveryTitle: 'RECOVERY',
    settles: ({ day, time }) => `ready ${day} ${time}`,
    fulfils: ({ day, time }) => {
      const d = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
      return `Linked to ${d}'s ${time} block.`
    },
    fulfilsNothing: 'Not linked to any block.',
    fulfilsChange: 'change',
    fulfilsNoBlock: "None — don't link",
    fulfilledTag: 'LOGGED',
    loggedBlockTitle: ({ ppl, run, sport }) =>
      run
        ? 'Run'
        : (sport ?? (ppl ? { push: 'Push', pull: 'Pull', legs: 'Legs' }[ppl] : 'Training')),
    runPaceLabel: 'Pace',
    runUnitPerKm: '/km',
    runEasyLabel: 'EASY',
    runEasyFasterAria: 'Easy pace 5 seconds faster',
    runEasySlowerAria: 'Easy pace 5 seconds slower',
    runZoneNames: {
      max: 'MAX',
      threshold: 'THRESHOLD',
      steady: 'STEADY',
      easy: 'EASY',
      recovery: 'RECOVERY',
    },
    runSliderHint: 'fast ← slide → slow',
    runFineFaster: '−1s',
    runFineSlower: '+1s',
    runTotal: ({ time, km }) => `That's ${time} for ${km} km.`,
    runNeedsDistance: 'A pace needs a distance before it can become a time.',
    runHeldTime: ({ time }) => `Holding the logged ${time}. A distance would give it a pace.`,
    runEffortPrefill: ({ n }) => `Effort ${n} · prefilled on the next step`,
    runEffortIdle: 'Effort prefill follows your pace',
    sessionSizeTitle: 'Session size',
    sessionSetsLabel: 'Working sets',
    sessionSetsUnit: 'sets',
    sessionMinLabel: 'Duration',
    sessionMinUnit: 'min',
    sessionSizeNote:
      'Optional, whole-session figures. They sharpen the volume map; blank keeps the estimate.',
    muscleTwin: {
      front: 'FRONT',
      back: 'BACK',
      shape: { push: 'PUSH SHAPE', pull: 'PULL SHAPE', legs: 'LEGS SHAPE' },
      shapeCustom: 'CUSTOM MIX',
      shapeNone: 'NOTHING YET',
      counts: ({ p, s }) => `${p} primary · ${s} secondary`,
      countsNone: 'Nothing marked yet, sir.',
      effortPrefill: ({ n }) => `Effort ${n} · prefilled on the next step`,
      effortIdle: 'Effort prefill follows your picks',
    },
    runs: {
      title: 'Runs',
      weekLabel: 'This week',
      timeLabel: 'Time',
      paceLabel: 'Avg pace',
      count: (n) => `${n} ${n === 1 ? 'run' : 'runs'}`,
      vsLast: ({ km, up }) => `${up ? 'Up' : 'Down'} ${km} km on last week.`,
      vsLastLevel: 'Level with last week.',
      recent: 'Lately',
      paceUnknown: '—',
      quietWeek: 'No runs this week.',
      empty: 'No runs logged yet. Log a workout as a run and it lands here.',
      badge: 'Run',
      distanceLabel: 'Distance',
      paceOne: 'Pace',
      detailNone: 'No distance or time recorded — this run was logged on effort alone.',
    },
    sport: {
      methodTitle: 'OTHER SPORT',
      methodCaption: 'MMA, swimming, tennis and more. Feeds recovery, not the weekly count.',
      stepTitle: 'Which sport?',
      pickerLabel: 'Sport',
      pickerPlaceholder: 'Choose a sport',
      hitsNote: 'What it loads on the body map — solid chips take the brunt, outlined ones assist.',
      save: 'Save Session',
      detailCaption: 'A sport session — it feeds recovery, not the weekly lifting count.',
      lastLine: ({ name, when }) => ` — last was a ${name} session ${when}`,
      weekTally: ({ runs, sports }) => {
        const parts: string[] = []
        if (runs > 0) parts.push(`${runs} ${runs === 1 ? 'run' : 'runs'}`)
        if (sports > 0) parts.push(`${sports} sport ${sports === 1 ? 'session' : 'sessions'}`)
        return parts.length ? ` (plus ${parts.join(' and ')})` : ''
      },
    },
    exercises: {
      methodTitle: 'EXERCISES',
      methodCaption: 'Named lifts, set by set — with last time beside you.',
      stepTitle: 'What did you lift?',
      addExercise: 'Add exercise',
      empty: 'Nothing logged yet. Add the first exercise and its sets follow.',
      searchPlaceholder: 'Search exercises',
      filterAll: 'All',
      loading: 'Fetching the catalogue.',
      noResults: ({ query }) => `Nothing matches “${query}”.`,
      yoursTag: 'Yours',
      create: ({ name }) => `Add “${name}” as your own`,
      createTitle: 'Your own exercise',
      createNameLabel: 'Name',
      createNamePlaceholder: 'What you call it',
      createMusclesLabel: 'What it works',
      createMusclesHint:
        'Tap once for the muscles taking the brunt, twice for the ones assisting. At least one has to take the brunt.',
      createSave: 'Add exercise',
      createNeedsName: 'Give it a name first.',
      createNeedsPrimary: 'Mark at least one muscle as taking the brunt.',
      addSet: 'Add set',
      setCount: (n) => `${n} ${plural(n, 'set', 'sets')}`,
      weightLabel: 'kg',
      repsLabel: 'reps',
      lastTime: ({ sets }) => `Last time · ${sets}`,
      derivedSets: ({ sets, exercises }) =>
        `${sets} working ${plural(sets, 'set', 'sets')} across ${exercises} ${plural(exercises, 'exercise', 'exercises')} — counted, not estimated.`,
      detailTitle: 'Exercises',
    },
    recast: {
      stepTitle: 'How is it logged?',
      currentTag: 'CURRENT',
      confirmTitle: 'Change how this is logged?',
      confirmBody: ({ exercises, run, setsTotal, durationMin }) => {
        const parts: string[] = []
        if (exercises) {
          parts.push(`${exercises.exercises} ${plural(exercises.exercises, 'exercise', 'exercises')}`)
          parts.push(`${exercises.sets} ${plural(exercises.sets, 'set', 'sets')}`)
        }
        if (run)
          parts.push(
            run.km && run.time
              ? `${run.km} km in ${run.time}`
              : run.km
                ? `${run.km} km`
                : `a time of ${run.time}`,
          )
        if (setsTotal !== null)
          parts.push(`${setsTotal} working ${plural(setsTotal, 'set', 'sets')}`)
        if (durationMin !== null)
          parts.push(`${durationMin} ${plural(durationMin, 'minute', 'minutes')}`)
        return `This session holds ${and(parts)}. Saved under another method, none of that is kept.`
      },
      confirmLabel: 'Change method',
    },
    weekTitle: 'This week',
    goalMet: "You've hit this week's goal.",
    goalRemaining: (n) => `${n} more to hit this week's goal.`,
    behindTitle: 'Behind its week',
    behindDetail: ({ group, sets, target }) =>
      `${group}: ~${Math.round(sets)} ${plural(Math.round(sets), 'set', 'sets')} in the last 7 days · target ${Math.round(target)}`,
    goalDialogTitle: 'Weekly goal',
    goalDialogBody: 'How many sessions a week are you aiming for? You can change it any time.',
    goalPerWeek: 'per week',
    goalNone: 'no goal',
    fuelTitle: 'Fuel · Today',
    fuelTrainingDay: 'Training day',
    fuelRestDay: 'Rest day',
    fuelTips: [
      'A piece of fruit covers the vitamin C and potassium that meat misses.',
      'Training days need a starch to reach the carbs. Potato, rice or oats.',
      'Yogurt or milk covers the calcium meat is missing.',
      'Liver once a week fills the folate and vitamin A gaps. No vegetables needed.',
      'Oats or a supplement closes the fibre gap.',
      'On a red-meat diet, check your LDL and ApoB now and then.',
    ],
    historyEmptyTitle: 'Nothing logged yet',
    historyEmptyMobile: 'Tap the glowing + to log your first one.',
    historyEmptyDesktop: 'Hit LOG WORKOUT above to log your first one.',
    // device-neutral: one info line renders under a mouse as often as a thumb,
    // and unlike the history empty state there is no second element to swap
    mapIdleStrain: 'Select a muscle for details',
    mapIdleVolume: 'Last 7 days of volume against each muscle’s range',
    // a muscle with no history says so instead of borrowing "fully recovered",
    // which used to be the NEVER-trained line — the one state that had done
    // nothing to recover from
    mapStrain: ({ muscle, strain, trained, state }) => {
      if (trained === null) return `${muscle} — nothing logged yet`
      return [
        `${muscle} — strain ${strain.toFixed(1)}`,
        `trained ${trained}`,
        state === 'recovered' ? 'fully recovered' : state === 'mostly' ? 'mostly recovered' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    },
    // an untrained muscle needs the window stated once, not twice: "~0 sets in
    // 7 days · nothing logged" is the same fact wearing two hats
    mapVolume: ({ muscle, sets, band, trend }) =>
      [
        sets === 0
          ? `${muscle} — nothing in 7 days`
          : `${muscle} — ~${sets} ${plural(sets, 'set', 'sets')} in 7 days`,
        sets === 0 ? null : band,
        trend,
      ]
        .filter(Boolean)
        .join(' · '),
    volumeLabel: {
      none: 'nothing logged',
      under: 'under its range',
      optimal: 'in range',
      pushing: 'past the range',
      over: 'at the ceiling',
    },
    volumeLegend: {
      under: 'Under',
      optimal: 'In range',
      pushing: 'Pushing',
      over: 'Ceiling',
    },
    volumeTrend: {
      above: 'above your usual',
      usual: 'about your usual',
      below: 'below your usual',
    },
    deloadTitle: 'Deload check',
    deload: ({ count, muscles }) =>
      `${count} muscles have had too much in the last seven days (${muscles}). A lighter session or an extra rest day would settle them.`,
    phaseLine: {
      fresh: 'Acute fatigue is at its peak right now.',
      peaking: 'Soreness is still building toward its peak.',
      easing: 'Past the peak — soreness is easing off.',
      recovered: 'Fully recovered — this workout no longer adds strain.',
    },
    topMusclesTitle: 'Most Trained · 30d',
    topMusclesNote: 'Lifting only. Runs affect recovery, not this chart.',
    topMusclesEmpty: 'No lifting volume yet',
  },
  study: {
    readingWeek: 'HOURS THIS WEEK',
    weekLine: ({ from, to, fulfilled, booked }) =>
      `${from} → ${to} · ${fulfilled.toFixed(1)} of ${booked.toFixed(1)} h done`,
    ringOfGoal: (goal) => `of ${goal.toFixed(1)} h`,
    ringNoGoal: 'h · no goal',
    more: (n) => `+${n} MORE`,
    enrol: 'ADD A SUBJECT',
    mattersPending: 'EXAMS AHEAD',
    noExams: 'No exams coming up.',
    countdown: (days) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`),
    hoursToward: (h) => `${h.toFixed(1)} h logged toward it`,
    desk: 'THE DESK',
    book: 'BOOK / LOG A SESSION',
    awaiting: 'STILL TO LOG',
    noAwaiting: 'Nothing left to log.',
    fileUnder: 'WHICH SUBJECT',
    done: 'DONE',
    partial: 'PARTIAL',
    skipped: 'SKIPPED',
    logIt: 'LOG IT',
    strikeRest: 'MARK THE REST SKIPPED',
    weekLedger: "THIS WEEK'S SESSIONS",
    noLedger: 'Nothing booked this week.',
    status: {
      done: 'DONE',
      partial: (h) => `PARTIAL ${h.toFixed(1)} H`,
      skipped: 'SKIPPED',
      awaiting: 'TO LOG',
      ahead: 'BOOKED',
    },
    dossier: 'SUBJECT DETAIL',
    weeklyGoal: 'WEEKLY GOAL',
    homework: 'HOMEWORK',
    add: '+ ADD',
    syllabus: (name) => `SYLLABUS — ${name}`,
    syllabusPct: ({ covered, total, pct }) => `${covered} of ${total} · ${pct}% covered`,
    addTopic: '+ ADD TOPIC',
    addExam: '+ ADD EXAM',
    archive: 'ARCHIVE',
    due: {
      done: 'done',
      overdue: 'overdue',
      today: 'due today',
      tomorrow: 'due tomorrow',
      on: (day) => `due ${day}`,
    },
    sheet: {
      subject: 'SUBJECT',
      day: 'DAY',
      start: 'START',
      duration: 'DURATION',
      linkHomework: 'LINK HOMEWORK — OPTIONAL',
      noHomework: 'No homework link',
      note: 'NOTE — OPTIONAL',
      notePlaceholder: 'Optional note',
      name: 'NAME',
      namePlaceholder: 'e.g. Number Theory',
      weeklyGoal: 'WEEKLY GOAL',
      title: 'TITLE',
      hwPlaceholder: 'e.g. Problem set 5',
      examPlaceholder: 'e.g. Midterm',
      topicPlaceholder: 'e.g. Diagonalization',
      due: 'DUE — OPTIONAL',
      noDate: 'NO DATE',
      theDay: 'DATE',
      addHomework: 'ADD HOMEWORK',
      addExam: 'ADD AN EXAM',
      addTopic: (name) => `ADD A TOPIC — ${name}`,
      bookHintPast: 'That time has already passed. This saves as done, and the ring moves now.',
      bookHintFuture: 'This goes straight onto the Manor.',
      goalZeroHint: 'A goal of zero just keeps the ring quiet. Hours are still counted.',
      hwDueHint: "A due date puts a chip on the Manor. If you don't tick it off, the chip moves to today.",
      examHint: 'Hours you log for this subject from today count toward it.',
      ctaLog: 'LOG IT',
      ctaBook: 'BOOK IT',
      ctaEnrol: 'ADD SUBJECT',
      ctaHw: 'ADD IT',
      ctaExam: 'MARK THE DATE',
      ctaTopic: 'ADD TOPIC',
      cancel: 'CANCEL',
    },
    toast: {
      markedDone: 'Marked done. The ring moves.',
      struck: 'Marked skipped.',
      notedPartial: (h) => `Noted. ${h.toFixed(1)} h of it.`,
      restStruck: 'The rest are marked skipped.',
      logged: 'Logged. The ring moves.',
      onBooks: 'Booked.',
      enrolled: 'Added. A fresh ring, empty for now.',
      hwAdded: (hasDue) =>
        hasDue ? 'Added. The chip has its day on the Manor.' : 'Added.',
      hwDone: 'Done. The chip leaves the Manor.',
      hwUndone: 'Back on the list.',
      examNoted: 'Noted. The countdown starts.',
      topicAdded: 'Added to the syllabus.',
      archived: 'Archived. The ring leaves the row.',
      filed: 'Filed.',
      nameFirst: 'It needs a name first.',
      titleFirst: 'It needs a title first.',
    },
    markerHw: (title) => `Due — ${title}`,
    markerExam: (title) => `Exam — ${title}`,
    archiveTitle: 'Archive this subject?',
    archiveBody: (name) => `${name} keeps its history. It just leaves the ring row.`,
    archiveYes: 'Archive',
    tileUntilExam: 'until the next exam',
    tileWeekRead: 'studied this week',
    briefingExam: ({ subject, days, hours }) => {
      const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
      const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
      const h = Math.round(hours)
      const hw = h <= 12 ? (words[h] ?? `${h}`).toLowerCase() : `${h}`
      return `The ${subject} exam is ${when}, with ${hw} ${h === 1 ? 'hour' : 'hours'} booked.`
    },
    briefingHomework: (n) => {
      const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
      return n === 1
        ? 'One task due this week.'
        : `${words[n] ?? n} tasks due this week.`
    },
    briefingWeek: ({ fulfilled, goal }) =>
      goal > 0
        ? `${fulfilled.toFixed(1)} of ${goal.toFixed(1)} hours studied this week.`
        : `${fulfilled.toFixed(1)} hours studied this week.`,
    subjectLedger: {
      title: 'Hours by subject',
      fulfilledTag: 'done',
      bookedTag: 'booked',
      goalTag: 'goal',
      row: ({ fulfilled, booked, goal }) =>
        `${fulfilled.toFixed(1)} done of ${booked.toFixed(1)} booked, goal ${goal.toFixed(1)}`,
      noGoal: 'no goal set',
      empty: 'No subjects yet.',
    },
    briefingPanel: {
      chips: ({ fulfilledH, bookedH, exam, awaiting }) => [
        { label: 'HOURS', value: `${fulfilledH.toFixed(1)} / ${bookedH.toFixed(1)} h` },
        {
          label: 'EXAM',
          value: exam
            ? exam.days <= 0
              ? 'today'
              : exam.days === 1
                ? 'tomorrow'
                : `${exam.days} d`
            : '—',
        },
        { label: 'TO LOG', value: String(awaiting) },
      ],
      headline: ({ fulfilledH, bookedH, goalH, exam }) => {
        const read =
          bookedH > 0
            ? `${sentence(hoursWord(fulfilledH))} ${plural(Math.round(fulfilledH), 'hour', 'hours')} studied of ${hoursWord(bookedH)} booked.`
            : goalH > 0
              ? `Nothing booked this week. Your goal is ${hoursWord(goalH)} ${plural(Math.round(goalH), 'hour', 'hours')}.`
              : 'Nothing booked this week.'
        if (!exam) return `${read} No exam coming up.`
        const when = exam.days <= 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${lower(exam.days)} days`
        // hours ALREADY DONE and hours STILL BOOKED are different questions;
        // answering one with the other is how this line used to contradict
        // the Manor's heads-up
        const behind = `${hoursWord(exam.doneH)} ${plural(Math.round(exam.doneH), 'hour', 'hours')} done`
        const ahead =
          exam.aheadH > 0
            ? `${hoursWord(exam.aheadH)} more booked`
            : 'nothing more booked'
        return `${read} The ${exam.subject} exam is ${when}, with ${behind} and ${ahead}.`
      },
      detail: ({
        awaiting,
        dueCount,
        syllabusPct,
        syllabusSubject,
        nextSession,
        fulfilledH,
        goalH,
      }) => {
        const parts: string[] = []
        const clauses: string[] = []
        if (awaiting > 0) {
          clauses.push(
            `${lower(awaiting)} ${plural(awaiting, 'session still needs logging', 'sessions still need logging')}`,
          )
        }
        if (dueCount > 0) {
          clauses.push(`${lower(dueCount)} ${plural(dueCount, 'task is', 'tasks are')} due this week`)
        }
        if (syllabusPct !== null) {
          clauses.push(
            syllabusSubject
              ? `the ${syllabusSubject} syllabus is ${syllabusPct}% covered`
              : `your subjects are ${syllabusPct}% covered overall`,
          )
        }
        if (clauses.length === 0) {
          parts.push('Nothing to log and nothing due.')
        } else {
          const joined =
            clauses.length === 1
              ? clauses[0]
              : `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
          parts.push(`${sentence(joined)}.`)
        }
        if (goalH > 0) {
          const gap = goalH - fulfilledH
          parts.push(
            gap > 0.05
              ? `You are ${hoursWord(gap)} ${plural(Math.round(gap), 'hour', 'hours')} short of the weekly goal.`
              : 'The weekly goal is met.',
          )
        }
        if (nextSession) {
          parts.push(`${nextSession.dayLabel}'s block is ${nextSession.subject}.`)
        }
        return parts.join(' ')
      },
      aside: ({ subjectCount, topicsLeft, syllabusSubject, bookedH, fulfilledH }) => {
        const parts: string[] = []
        if (subjectCount > 0) {
          parts.push(
            `${sentence(word(subjectCount))} ${plural(subjectCount, 'subject is', 'subjects are')} on the books.`,
          )
        }
        if (topicsLeft !== null && topicsLeft > 0) {
          const where = syllabusSubject ? `the ${syllabusSubject} syllabus` : 'your syllabi'
          parts.push(
            `${sentence(word(topicsLeft))} ${plural(topicsLeft, 'topic', 'topics')} left on ${where}.`,
          )
        } else if (topicsLeft === 0) {
          parts.push(
            syllabusSubject
              ? `The ${syllabusSubject} syllabus is fully covered.`
              : 'Every syllabus is fully covered.',
          )
        }
        // NOT "still ahead of you" — a booked hour that passed unlogged is
        // behind you and undone, and the two are not the same claim
        const undone = bookedH - fulfilledH
        if (undone > 0.05) {
          const n = Math.round(undone)
          parts.push(
            `${sentence(hoursWord(undone))} ${plural(n, 'hour', 'hours')} of this week's booking ${plural(n, 'is', 'are')} not done.`,
          )
        }
        return parts.length > 0 ? parts.join(' ') : null
      },
    },
  },
  workshop: {
    weekAtBench: 'THE WEEK AT THE BENCH',
    weekLine: ({ from, to, fulfilled, booked }) =>
      `${from} – ${to} · ${fulfilled.toFixed(1)} h fulfilled of ${booked.toFixed(1)} booked`,
    ringOfGoal: (goal) => `of ${goal.toFixed(1)} h`,
    ringNoGoal: 'h · no goal',
    more: (n) => `+${n} MORE`,
    toTheBench: 'TO THE BENCH',
    downTools: 'DOWN TOOLS',
    atTheBench: 'AT THE BENCH',
    mattersPending: 'MATTERS PENDING',
    noMilestones: 'No milestones marked.',
    countdown: (days) =>
      days < 0
        ? days === -1
          ? 'a day over'
          : `${-days} days over`
        : days === 0
          ? 'today'
          : days === 1
            ? 'tomorrow'
            : `in ${days} days`,
    hoursToward: (h) => `${h.toFixed(1)} h at the bench toward it`,
    overdueNote: "The chip follows you until it's dealt with.",
    desk: 'THE DESK',
    book: 'BOOK BENCH TIME',
    awaiting: 'AWAITING REPORT',
    noAwaiting: 'Nothing awaiting report.',
    fileUnder: 'FILE UNDER',
    done: 'DONE',
    partial: 'PARTIAL',
    skipped: 'SKIPPED',
    logIt: 'LOG IT',
    strikeRest: 'MARK THE REST SKIPPED',
    weekLedger: "THIS WEEK'S LEDGER",
    noLedger: 'Nothing on the books this week.',
    status: {
      done: 'DONE',
      liveDone: 'LIVE · DONE',
      partial: (h) => `PARTIAL ${h.toFixed(1)} H`,
      skipped: 'SKIPPED',
      awaiting: 'TO LOG',
      ahead: 'AHEAD',
    },
    shelf: 'THE SHELF',
    shelfCount: ({ total, shipped }) =>
      shipped > 0
        ? `${total} ${total === 1 ? 'VENTURE' : 'VENTURES'} · ${shipped} SHIPPED`
        : `${total} ${total === 1 ? 'VENTURE' : 'VENTURES'}`,
    openVenture: '+ OPEN A VENTURE',
    lifetime: 'LIFETIME',
    odometer: 'LIFETIME · THE ODOMETER',
    tasks: {
      label: 'JOBS DONE',
      count: ({ done, total }) => `${done} of ${total}`,
      pct: (pct) => `${pct}%`,
      none: 'No jobs on the board yet.',
      allDone: 'Every job on the board is struck.',
    },
    statusName: { spark: 'SPARK', building: 'BUILDING', shipped: 'SHIPPED', shelved: 'SHELVED' },
    rename: 'RENAME',
    ship: 'SHIP',
    shelve: 'SHELVE',
    reopen: 'REOPEN',
    archive: 'ARCHIVE',
    touched: {
      today: 'At the bench today.',
      days: (n) => (n === 1 ? 'Quiet a day.' : `Quiet ${lower(n)} days.`),
      quietLong: (n) => `The bench has been quiet ${lower(n)} days, sir.`,
      never: 'Not yet at the bench.',
      shippedIn: (month) => `Shipped in ${month}.`,
      shippedLine: 'Shipped, sir. Quietly satisfying.',
    },
    board: {
      back: 'THE SHELF',
      hang: '+ HANG A CARD',
      empty: 'A clean bench, sir. Pin the first card.',
      hangFirst: '+ HANG A CARD',
      colOf: ({ col, total }) => `${col} / ${total}`,
      done: 'DONE',
      /** the column for work that has not been filed under a heading */
      loose: 'UNFILED',
      /** the press-here target at the foot of a column on the phone */
      hangHere: '+ HANG ONE HERE',
      /** the hint under the board on desktop, where the gesture is invisible */
      pressHint: 'Press bare board to hang a card there. Drag it to move the wall, wheel to zoom.',
      threadHint: "Drag a card's eyelet onto another to thread them, or onto a threaded one to cut it.",
      zoomIn: 'Closer',
      zoomOut: 'Further back',
      zoomReset: 'Back to full size',
      headingHint: 'Press a heading to see everything filed under it.',
      threadFrom: 'Thread from this card',
      threadPick: 'Now tap the other card.',
      threadStop: 'STOP',
      columnTitle: (name) => `UNDER ${name}`,
      columnCount: (n) =>
        n === 0
          ? 'Nothing filed here yet.'
          : `${sentence(word(n))} ${plural(n, 'card', 'cards')}, in the order the phone pages them.`,
      columnEmpty: 'Nothing hangs under this heading.',
      moveUp: 'Move up',
      moveDown: 'Move down',
      takeDown: 'Take it down',
      editHeading: 'EDIT THE HEADING',
    },
    due: {
      label: 'DELIVERY',
      none: 'No deadline',
      set: '+ SET A DEADLINE',
      clear: 'NO DEADLINE',
      dateLabel: 'DAY',
      timeLabel: 'HOUR',
      hint: "A deadline takes a chip on the Manor's week, sir. Struck jobs give theirs up.",
      chip: ({ date, time, days, overdue }) =>
        overdue
          ? `OVERDUE · ${date} ${time}`
          : days === 0
            ? `DUE TODAY · ${time}`
            : days === 1
              ? `DUE TOMORROW · ${time}`
              : `DUE ${date} · ${time}`,
    },
    emptyWing: 'The workshop stands ready, sir. Begin with a venture.',
    sheet: {
      name: 'NAME',
      namePlaceholder: 'e.g. The Ornithopter',
      weeklyGoal: 'WEEKLY BENCH GOAL',
      goalZeroHint: 'Goal nought keeps the ring faint — the hours still count, sir.',
      venture: 'VENTURE',
      day: 'DAY',
      start: 'START',
      duration: 'DURATION',
      bookHintPast: 'A past booking files as fulfilled, sir.',
      bookHintFuture: 'This goes straight onto the Manor.',
      title: 'TITLE',
      body: 'NOTE — OPTIONAL',
      bodyPlaceholder: 'A line or two',
      detail: 'DETAIL — OPTIONAL',
      detailPlaceholder: 'What it involves',
      url: 'ADDRESS',
      urlPlaceholder: 'https://…',
      threadTo: 'THREAD TO — OPTIONAL',
      noThread: 'No thread',
      under: 'UNDER WHICH HEADING',
      underNone: 'UNFILED',
      cardType: { title: 'HEADING', note: 'NOTE', task: 'TASK', link: 'LINK' },
      titlePlaceholder: 'e.g. Re-rig the tail servo',
      msPlaceholder: 'Name the next marker…',
      msHint: "Each marker takes a chip on the Manor's week, sir.",
      theDay: 'THE DAY',
      ctaOpen: 'OPEN THE VENTURE',
      ctaRename: 'SAVE',
      ctaBook: 'ON THE BOOKS',
      ctaLog: 'LOG IT',
      ctaHang: 'HANG IT',
      ctaSaveCard: 'SAVE',
      ctaMs: 'MARK THE DAY',
      cancel: 'CANCEL',
      takeDown: 'TAKE THIS CARD DOWN',
      takeDownTitle: 'Take this card down?',
      takeDownBody: ({ title, threads }) =>
        threads > 0
          ? `${title} comes off the wall, and the ${lower(threads)} ${plural(threads, 'thread', 'threads')} to it ${plural(threads, 'is', 'are')} cut. This cannot be undone.`
          : `${title} comes off the wall. This cannot be undone.`,
      takeDownYes: 'Take it down',
    },
    milestonesTitle: (name) => `MILESTONES — ${name}`,
    addMs: '+ ADD',
    toast: {
      benchStart: 'The bench is yours, sir.',
      benchStop: ({ h, m }) => {
        const hours = h > 0 ? `${lower(h)} ${plural(h, 'hour', 'hours')}` : ''
        const mins = m > 0 ? `${m <= 12 ? lower(m) : m} ${plural(m, 'minute', 'minutes')}` : ''
        const span = hours && mins ? `${hours} and ${mins}` : hours || mins || 'a moment'
        return `Down tools — ${span} to the good, sir.`
      },
      benchShort: 'Barely a minute, sir. Not logged.',
      benchSandbox: 'A rehearsal is open, sir — apply or discard it first.',
      markedDone: 'Marked done. The ring moves.',
      struck: 'Marked skipped.',
      notedPartial: (h) => `Noted. ${h.toFixed(1)} h of it.`,
      restStruck: 'The rest are marked skipped.',
      logged: 'Logged. The ring moves.',
      onBooks: 'Booked.',
      opened: 'Opened. The bench awaits.',
      renamed: 'Renamed.',
      shipped: 'Shipped, sir. Quietly satisfying.',
      shelved: 'Shelved. It keeps its hours.',
      reopened: 'Back on the bench.',
      archived: 'Archived. The odometer stands.',
      cardHung: 'Hung.',
      titleHung: 'A heading. Hang the work under it.',
      cardGone: 'Taken down.',
      threaded: 'Threaded.',
      threadCut: 'Thread cut.',
      threadSelf: 'A card cannot thread to itself, sir.',
      dueSet: 'Noted. The chip has its day on the Manor.',
      dueCleared: 'No deadline. The chip leaves the Manor.',
      msAdded: 'Marked. The chip has its day on the Manor.',
      msDone: 'Struck. The chip leaves the Manor.',
      msUndone: 'Back on the board.',
      msGone: 'Unmarked.',
      filed: 'Filed.',
      nameFirst: 'It needs a name first.',
      titleFirst: 'It needs a title first.',
    },
    markerMs: (title) => title,
    markerDue: (title, time) => `${title} · ${time}`,
    archiveTitle: 'Archive this venture?',
    archiveBody: (name) => `${name} keeps its hours and its board. It just leaves the shelf.`,
    archiveYes: 'Archive',
    crew: {
      shareButton: 'CREW',
      crewButton: (n) => `CREW · ${n}`,
      badge: 'CREW',
      sheetTitle: 'THE CREW',
      blurb:
        'Open this venture to another pair of hands, sir. They join by code, the board and milestones become shared, and the hours count everyone.',
      blurbCrewed: 'Anyone with this code joins the crew. Read it aloud or send the link.',
      cta: 'OPEN TO A CREW',
      creating: 'Opening…',
      codeLabel: 'JOIN CODE',
      copyCode: 'COPY CODE',
      copyLink: 'COPY LINK',
      copied: 'Copied.',
      rosterTitle: 'ON THE CREW',
      you: 'you',
      owner: 'keeper',
      kick: 'REMOVE',
      kickTitle: 'Remove them from the crew?',
      kickBody: (label) =>
        `${label} loses the shared board and keeps a private copy of what they saw. Their hours stay on the books.`,
      kickYes: 'Remove',
      leave: 'LEAVE THE CREW',
      leaveTitle: 'Leave this crew?',
      leaveBody:
        'You keep a private copy of the venture as it stands. Your hours stay on the crew’s books.',
      leaveYes: 'Leave',
      unshare: 'DISBAND THE CREW',
      unshareTitle: 'Disband the crew?',
      unshareBody:
        'The code stops working and everyone keeps a private copy of the venture. Nothing is deleted.',
      unshareYes: 'Disband',
      deleteTitle: 'Delete for the whole crew?',
      deleteBody: (name) =>
        `${name} comes down for every member — board, milestones and the shared ledger. Bench sessions stay on each Manor as history.`,
      deleteYes: 'Delete for everyone',
      contributionTitle: 'THE HANDS',
      weekH: (h) => `${h.toFixed(1)} h this week`,
      totalH: (h) => `${h.toFixed(1)} h all told`,
      tasksDone: (n) => `${n} ${plural(n, 'job', 'jobs')} struck`,
      joinButton: 'JOIN A CREW',
      joinTitle: 'JOIN A CREW',
      joinBlurb: 'Enter the code you were given, sir. The venture takes its place on your shelf.',
      codePlaceholder: 'XXXX-XXXX',
      joinCta: 'JOIN',
      joining: 'Joining…',
      toast: {
        shared: 'The venture is open to a crew. Pass the code along, sir.',
        joined: 'Joined. The venture is on your shelf.',
        joinUnknown: 'No crew answers to that code, sir.',
        left: 'You have left the crew. A private copy stays on your shelf.',
        unshared: 'The crew is disbanded. Every member keeps a private copy.',
        kicked: 'Removed. They keep a private copy.',
        needsSignIn: 'Crews need the household register, sir — sign in first.',
        offline: 'The register is out of reach, sir. Try again when connected.',
        linkHeld: 'A crew invitation is waiting, sir. Sign in and it will be honoured.',
        demoOff: 'Crews are off while demo records are loaded, sir.',
      },
      errorLine: (msg) => `The crew registry demurred: ${msg}`,
    },
    tileNextMs: 'until the next milestone',
    tileWeek: 'at the bench this week',
    briefingPanel: {
      // jobs first: how far along the work is outranks how long it has taken
      chips: ({ tasks, milestone, awaiting }) => [
        {
          label: 'JOBS',
          value: tasks ? `${tasks.done} / ${tasks.total}` : '—',
        },
        {
          label: 'MILESTONE',
          value: milestone
            ? milestone.days < 0
              ? 'over'
              : milestone.days === 0
                ? 'today'
                : milestone.days === 1
                  ? 'tomorrow'
                  : `${milestone.days} d`
            : '—',
        },
        { label: 'TO LOG', value: String(awaiting) },
      ],
      headline: ({ fulfilledH, goalH, milestone, benchLive }) => {
        const hours =
          fulfilledH > 0
            ? `${hoursWord(fulfilledH)} ${plural(Math.round(fulfilledH), 'hour', 'hours')} at the bench this week`
            : 'no hours at the bench yet this week'
        if (benchLive) return `${benchLive.venture} is on the clock — ${hours}.`
        if (milestone) {
          const when =
            milestone.days < 0
              ? `${lower(-milestone.days)} ${plural(-milestone.days, 'day', 'days')} over`
              : milestone.days === 0
                ? 'today'
                : milestone.days === 1
                  ? 'tomorrow'
                  : `in ${lower(milestone.days)} days`
          return `The ${milestone.title} milestone ${milestone.days < 0 ? 'is ' : ''}${when}, sir — ${hours}.`
        }
        if (goalH > 0 && fulfilledH < goalH) {
          return `${sentence(hours)}, of ${hoursWord(goalH)} intended.`
        }
        return `${sentence(hours)}.`
      },
      detail: ({ awaiting, quiet, nextSession, milestone }) => {
        const parts: string[] = []
        if (awaiting > 0) {
          parts.push(
            `${sentence(word(awaiting))} ${plural(awaiting, 'session awaits report', 'sessions await report')}.`,
          )
        }
        if (milestone && milestone.days < 0) {
          parts.push(`${milestone.title} is past its day and the chip is trailing you.`)
        }
        if (quiet) {
          parts.push(`${quiet.venture} has been quiet ${lower(quiet.days)} days.`)
        }
        if (nextSession) {
          parts.push(`${nextSession.dayLabel}'s bench is ${nextSession.venture}.`)
        }
        if (parts.length === 0) parts.push('Nothing awaits report and nothing is overdue.')
        return parts.join(' ')
      },
      aside: ({ ventureCount, bookedH, fulfilledH, milestone, tasks }) => {
        const parts: string[] = []
        if (ventureCount > 0) {
          parts.push(
            `${sentence(word(ventureCount))} ${plural(ventureCount, 'venture is', 'ventures are')} on the shelf.`,
          )
        }
        if (tasks) {
          parts.push(
            tasks.done === tasks.total
              ? `Every job on the boards is struck — ${lower(tasks.total)} of ${lower(tasks.total)}.`
              : `${sentence(word(tasks.done))} of ${lower(tasks.total)} ${plural(tasks.total, 'job', 'jobs')} struck across the boards.`,
          )
        }
        if (milestone) {
          parts.push(
            `${sentence(hoursWord(milestone.towardH))} ${plural(Math.round(milestone.towardH), 'hour', 'hours')} at the bench toward ${milestone.title}.`,
          )
        }
        const undone = bookedH - fulfilledH
        if (undone > 0.05) {
          const n = Math.round(undone)
          parts.push(
            `${sentence(hoursWord(undone))} ${plural(n, 'hour', 'hours')} of this week's booking ${plural(n, 'is', 'are')} not done.`,
          )
        }
        return parts.length > 0 ? parts.join(' ') : null
      },
    },
  },
  kinds: {
    shift: 'THE WATCH',
    sleep: 'THE NIGHT',
    training: 'THE GROUNDS',
    study: 'THE STUDY',
    workshop: 'THE WORKSHOP',
    marker: 'THE LEDGER',
    abroad: 'ABROAD',
  },
  modules: {
    watch: { name: 'THE WATCH', tagline: 'Shifts · hours · next up' },
    training: { name: 'THE GROUNDS', tagline: 'Workouts · recovery · food' },
    study: { name: 'THE STUDY', tagline: "Subjects · topics · what's due" },
    workshop: { name: 'THE WORKSHOP', tagline: 'Ventures · bench hours · milestones' },
    capital: { name: 'THE LEDGER', tagline: 'Net worth · markets · budget' },
  },
  night: {
    name: 'THE NIGHT',
    button: 'NIGHT',
    blockTitle: 'Sleep',
    openLabel: 'THE NIGHT',
    sheet: {
      logTitle: 'WRITE DOWN A NIGHT',
      editTitle: 'CORRECT A NIGHT',
      confirmTitle: 'IS THAT HOW IT WENT?',
      whichLabel: 'THE MORNING OF',
      thisMorning: 'THIS MORNING',
      dayBefore: 'the night before',
      prev: 'Earlier',
      next: 'Later',
      bedLabel: 'DOWN AT',
      wakeLabel: 'UP AT',
      slept: ({ crossesMidnight, inBedH, awakeMin }) =>
        awakeMin > 0
          ? `${fmtSlept(inBedH)} in bed, less ${awakeMin} awake`
          : crossesMidnight
            ? 'through midnight'
            : 'inside the one day',
      impossible: 'Those two hours make no night. Move one of them.',
      tooLong: 'Over eighteen hours in bed. I have written it down as asked.',
      restLabel: 'HOW IT LEFT YOU',
      restNote: 'Optional. It nudges the recovery clock, nothing more.',
      restWords: ['Wrecked', 'Rough', 'Fine', 'Good', 'Sharp'],
      restClear: 'No rating',
      awakeLabel: 'AWAKE IN THE NIGHT',
      awakeNote: 'Optional. Taken off the hours above.',
      save: 'WRITE IT DOWN',
      confirm: 'YES, THAT IS IT',
      remove: 'Remove this night',
      removeConfirm: {
        title: 'Remove the night?',
        body: 'The block leaves the week and its figures leave the ledger.',
        confirm: 'REMOVE',
      },
      occupied: 'Those hours are already spoken for.',
      pencilNote: 'I pencilled this in after your watch. Confirm it and it counts.',
      ledger: 'THE FORTNIGHT',
      ledgerEmpty: 'Nothing written down yet.',
    },
    prompt: {
      line: 'Last night is not written down.',
      cta: 'WRITE IT DOWN',
      pencilLine: 'I pencilled last night in after your watch. Was that how it went?',
      pencilCta: 'CONFIRM IT',
      dismiss: 'Not today',
    },
    stats: {
      lastNight: 'LAST NIGHT',
      average: 'AVERAGE',
      debt: 'OWED',
      regularity: 'BODY CLOCK',
      covered: ({ covered, of }) => `${covered} of the last ${of} nights`,
      averageNote: ({ covered }) =>
        covered === 0
          ? 'nothing to average'
          : `over ${lower(covered)} ${plural(covered, 'night', 'nights')}`,
      debtNote: ({ target }) => (target > 0 ? `against ${target} h a night` : 'no target set'),
      regularityNote: ({ driftMin, bed, wake }) =>
        bed && wake
          ? driftMin === null
            ? `usually ${bed} to ${wake}`
            : `usually ${bed} to ${wake} · ±${driftMin} min`
          : 'not enough nights yet',
      tooThin: 'Three nights and I can say how steady the hour is.',
      empty: 'Nothing on file. Two clock times a morning is the whole of it.',
      notWritten: 'not written down',
    },
    recovery: {
      line: ({ pct, avgH, covered }) =>
        pct === 0
          ? `Your sleep leaves this clock where it is — ${fmtSlept(avgH)} a night across ${lower(covered)} ${plural(covered, 'night', 'nights')}.`
          : pct > 0
            ? `Running ${pct} per cent slow on ${fmtSlept(avgH)} a night across ${lower(covered)} ${plural(covered, 'night', 'nights')}.`
            : `Running ${-pct} per cent quick on ${fmtSlept(avgH)} a night across ${lower(covered)} ${plural(covered, 'night', 'nights')}.`,
      thin: ({ covered, needed }) =>
        `${sentence(word(covered))} of the last seven nights ${plural(covered, 'is', 'are')} written down. I want ${lower(needed)} before I let sleep move this clock.`,
      off: 'Sleep is not moving this clock. You switched that off.',
      caveat: 'An estimate from hours you typed yourself — read it as one.',
    },
    settings: {
      group: 'THE NIGHT',
      targetLabel: 'Hours a night',
      targetBlurb: 'What the ledger measures a night against. Set it to none and it stops keeping score.',
      targetNone: 'No target',
      couplingLabel: 'Let sleep move recovery',
      couplingBlurb:
        'Short weeks slow the Grounds\u2019 recovery clock, long ones quicken it — by a fifth at the very most, and only once four of the last seven nights are on file. It is an estimate from hours you typed yourself.',
      promptLabel: 'Ask about last night',
      promptBlurb: 'A single line above the week on a morning that has no note. Waved off, it waits until tomorrow.',
    },
  },
  watch: {
    onDuty: 'ON DUTY · THIS WEEK',
    nextWatch: 'NEXT SHIFT',
    nextIn: ({ h, m }) => (h > 0 ? `NEXT IN ${h} H ${m} M` : `NEXT IN ${m} M`),
    noneAhead: 'Nothing booked ahead.',
    noneThisWeek: 'Nothing this week.',
    post: 'POST A SHIFT',
    weekList: "THIS WEEK'S SHIFTS",
    ringIdle: 'nothing scheduled this week',
    aheadList: 'FURTHER AHEAD',
    aheadSummary: ({ count, hours }) =>
      `${count} ahead · ${hours.toFixed(1)} h`,
    starters: {
      day: 'Day Shift',
      night: 'Night Shift',
      nineToFive: 'Nine to Five',
      evening: 'Evening',
    },
    customChip: 'Custom…',
    manage: 'Manage shifts',
    customEventTitle: 'Shift',
    sleepTitle: 'Sleep',
    posted: 'Booked.',
    postedWithSleep: 'Booked. Sleep is blocked out for the morning after.',
    postedOverSleep: 'Booked. It runs over sleep already blocked out for you. You can move either one in the Manor.',
    overlap: 'That overlaps a shift you have already booked.',
    sheet: {
      customTitle: 'A CUSTOM SHIFT',
      manageTitle: 'YOUR SAVED SHIFTS',
      startLabel: 'STARTS',
      endLabel: 'ENDS',
      hoursLine: (h) => `${h.toFixed(1)} h on duty`,
      nextDay: 'Ends the next day.',
      invalid: 'It has to end at a different time than it starts.',
      keep: 'Save for next time',
      nameLabel: 'NAME IT',
      namePlaceholder: 'Closing shift',
      post: 'POST IT',
      newTemplate: 'NEW SHIFT',
      save: 'SAVE IT',
      cancel: 'Cancel',
      empty: 'No saved shifts yet. Add one, or post a custom shift and save it.',
      deleteTitle: 'Delete this shift?',
      deleteBody: (name) =>
        `${name} comes off the list. Shifts you have already booked stay exactly where they are.`,
      deleteYes: 'Delete it',
    },
    toast: {
      kept: "Saved. It'll be on the list next time.",
      amended: 'Updated.',
      retired: 'Deleted.',
      nameFirst: 'It needs a name first.',
    },
    note: 'Anything you post here shows up in the Manor right away.',
    openManor: 'Open the Manor →',
    status: { logged: 'DONE', next: 'NEXT', ahead: 'AHEAD' },
    aheadNone: 'Nothing beyond this week.',
    bandNote: 'Pick a day to post it. The Manor takes it from there.',
    cycle: {
      title: 'THE CYCLE',
      nights: 'NIGHTS',
      days: 'DAYS',
      pencilled: 'SLEEP',
      turnaround: 'SHORTEST GAP',
      onDuty: 'ON DUTY',
      own: 'FREE',
      splitTitle: "THE WEEK'S 168 HOURS",
      empty: 'No shifts this week. All 168 hours are yours.',
      sleepSplit: ({ sleptH, pencilledH }) =>
        pencilledH > 0
          ? `${sleptH.toFixed(1)} h written down, ${pencilledH.toFixed(1)} h pencilled`
          : 'all of it written down',
      line: ({ nights, days, pencilledH, sleptH, turnaroundH, ownH }) => {
        const shape = [
          nights > 0 ? `${lower(nights)} ${plural(nights, 'night', 'nights')}` : '',
          days > 0 ? `${lower(days)} ${plural(days, 'day', 'days')}` : '',
        ]
          .filter(Boolean)
          .join(' and ')
        const hrs = (h: number) => `${hoursWord(h)} ${plural(Math.round(h), 'hour', 'hours')}`
        const sleepH = pencilledH + sleptH
        const parts = [
          sleepH > 0
            ? sleptH > 0 && pencilledH > 0
              ? `${sentence(shape)}, with ${hrs(sleepH)} given to sleep — ${hrs(sleptH)} of it written down.`
              : sleptH > 0
                ? `${sentence(shape)}, with ${hrs(sleptH)} of sleep written down around them.`
                : `${sentence(shape)}, with ${hrs(pencilledH)} pencilled in for sleep.`
            : `${sentence(shape)}, with no sleep blocked out after them.`,
        ]
        // a gap under eight hours between shifts is the one figure here worth a remark
        if (turnaroundH !== null && turnaroundH < 8) {
          parts.push(`${sentence(hrs(turnaroundH))} is your shortest gap between shifts.`)
        }
        parts.push(`${sentence(hrs(ownH))} of the week are yours.`)
        return parts.join(' ')
      },
    },
    briefingPanel: {
      chips: ({ doneH, expectedH, next, nights }) => [
        {
          label: 'WORKED',
          value: expectedH > 0 ? `${doneH.toFixed(1)} / ${expectedH.toFixed(1)} h` : '—',
        },
        { label: 'NEXT', value: next ? untilLabel(next.h, next.m) : '—' },
        { label: 'NIGHTS', value: String(nights) },
      ],
      headline: ({ doneH, expectedH, logged, remaining, next }) => {
        if (expectedH <= 0) {
          return next
            ? `Nothing scheduled this week. ${next.dayLabel}'s shift starts in ${untilLabel(next.h, next.m)}.`
            : 'No shifts scheduled. The week is entirely yours.'
        }
        const stood = sentence(
          `${hoursWord(doneH)} ${plural(Math.round(doneH), 'hour', 'hours')} worked out of ${hoursWord(expectedH)}`,
        )
        const tally = sentence(
          remaining > 0
            ? `${lower(logged)} ${plural(logged, 'shift', 'shifts')} done, ${lower(remaining)} still to come`
            : `all ${lower(logged)} ${plural(logged, 'shift', 'shifts')} done`,
        )
        const upNext = next
          ? ` ${next.dayLabel}'s ${next.night ? 'night' : 'day'} shift starts in ${untilLabel(next.h, next.m)}.`
          : ''
        return `${stood}. ${tally}.${upNext}`
      },
      detail: ({
        nights,
        days,
        sleepH,
        weeklyH,
        doneH,
        expectedH,
        nextWeekCount,
        aheadCount,
      }) => {
        const parts: string[] = []
        if (nights + days > 0) {
          const shape = [
            nights > 0 ? `${lower(nights)} ${plural(nights, 'night', 'nights')}` : '',
            days > 0 ? `${lower(days)} ${plural(days, 'day', 'days')}` : '',
          ]
            .filter(Boolean)
            .join(' and ')
          const withSleep =
            sleepH > 0
              ? `, plus ${hoursWord(sleepH)} ${plural(Math.round(sleepH), 'hour', 'hours')} of sleep blocked out after them`
              : ''
          parts.push(`${sentence(shape)} this week${withSleep}.`)
        }
        // only once some hours ARE behind you: with none stood the headline has
        // just said "no hours worked out of 52" and this would repeat the 52
        if (doneH > 0.05 && expectedH - doneH > 0.05) {
          const left = expectedH - doneH
          parts.push(
            `${sentence(hoursWord(left))} ${plural(Math.round(left), 'hour is', 'hours are')} still to stand.`,
          )
        }
        // only claim a record when there is enough history to have one
        const prior = weeklyH.slice(0, -1).filter((h) => h > 0)
        if (expectedH > 0 && prior.length >= 3 && expectedH > Math.max(...prior)) {
          parts.push(
            `${sentence(hoursWord(expectedH))} scheduled hours is your heaviest week yet.`,
          )
        }
        if (nextWeekCount > 0) {
          parts.push(
            `Next week has ${lower(nextWeekCount)} ${plural(nextWeekCount, 'shift', 'shifts')}.`,
          )
        } else if (aheadCount > 0) {
          parts.push(
            `${word(aheadCount)} ${plural(aheadCount, 'shift is', 'shifts are')} booked further out.`,
          )
        } else {
          parts.push('Nothing is booked beyond this week.')
        }
        return parts.join(' ')
      },
      aside: ({ doneH, expectedH, sleepH, weeklyH, turnaroundH }) => {
        const parts: string[] = []
        if (expectedH > 0) {
          parts.push(`${Math.round((doneH / expectedH) * 100)}% of the week's duty is behind you.`)
          const prior = weeklyH.slice(0, -1).filter((h) => h > 0)
          if (prior.length >= 2) {
            const avg = prior.reduce((t, h) => t + h, 0) / prior.length
            const diff = expectedH - avg
            const n = Math.round(Math.abs(diff))
            // the subject is named rather than left as "that" — the sentence
            // before it ends on a percentage, and "that" would point at it
            parts.push(
              Math.abs(diff) >= 1
                ? `This week's ${expectedH.toFixed(1)} scheduled hours sit ${hoursWord(Math.abs(diff))} ${plural(n, 'hour', 'hours')} ${diff > 0 ? 'above' : 'below'} your ${prior.length}-week average of ${avg.toFixed(1)}.`
                : `That is level with your ${prior.length}-week average of ${avg.toFixed(1)}.`,
            )
          }
        }
        if (turnaroundH !== null && turnaroundH < 12) {
          const n = Math.round(turnaroundH)
          parts.push(
            `${sentence(hoursWord(turnaroundH))} ${plural(n, 'hour', 'hours')} is the shortest gap between two of this week's watches.`,
          )
        }
        if (expectedH + sleepH > 0) {
          const share = Math.round(((expectedH + sleepH) / 168) * 100)
          parts.push(`Duty and the sleep pencilled around it take ${share}% of the week.`)
        }
        return parts.length > 0 ? parts.join(' ') : null
      },
    },
  },
  capital: {
    briefingPanel: {
      chips: ({ netWorth, delta, left, over, hasBudget }) => [
        { label: 'NET', value: netWorth },
        {
          label: 'SINCE',
          value: delta ? `${delta.up ? '▲' : '▼'} ${delta.amount}` : '—',
        },
        { label: over ? 'OVER' : 'LEFT', value: hasBudget ? left : '—' },
      ],
      headline: ({ netWorth, delta, spent, budget, left, over, hasBudget, dayOfMonth, daysInMonth }) => {
        const worth =
          delta === null
            ? `${netWorth} in total.`
            : `${netWorth} in total. ${delta.up ? 'Up' : 'Down'} ${delta.amount} since ${delta.basis}.`
        if (!hasBudget) return `${worth} ${spent} spent this month, with no budget set.`
        const daysLeft = Math.max(0, daysInMonth - dayOfMonth)
        const runway =
          daysLeft === 0
            ? 'and the month is over'
            : `with ${lower(daysLeft)} ${plural(daysLeft, 'day', 'days')} to go`
        return over
          ? `${worth} You're ${left} over the ${budget} budget, ${runway}.`
          : `${worth} ${left} left of the ${budget} budget, ${runway}.`
      },
      detail: ({ portfolio, perDay, fixed, underPace, hasBudget }) => {
        const parts: string[] = []
        if (portfolio) {
          parts.push(
            `Your portfolio holds ${portfolio.value}. That's ${portfolio.dayUp ? 'up' : 'down'} ${portfolio.dayPL} today and ${portfolio.unrealUp ? 'up' : 'down'} ${portfolio.unrealized} overall.`,
          )
        }
        if (perDay) {
          parts.push(
            hasBudget
              ? `You're spending ${perDay} a day. The budget allows ${underPace ? 'more' : 'less'} than that.`
              : `You're spending ${perDay} a day.`,
          )
          // the daily figure is only honest if it says how the fixed side was
          // treated — otherwise it reads as a run rate the user could change
          if (fixed) {
            parts.push(`${fixed} of the month is fixed cost, spread evenly rather than charged on the 1st.`)
          }
        }
        if (parts.length === 0) parts.push('Nothing more to report.')
        return parts.join(' ')
      },
      aside: ({
        allowancePerDay,
        accountCount,
        topHolding,
        dayOfMonth,
        daysInMonth,
        over,
        hasBudget,
      }) => {
        const parts: string[] = []
        if (hasBudget) {
          const daysLeft = Math.max(0, daysInMonth - dayOfMonth)
          if (over) {
            parts.push('The budget is spent. Anything further this month is over it.')
          } else if (allowancePerDay && daysLeft > 0) {
            parts.push(
              `${allowancePerDay} a day for the ${lower(daysLeft)} ${plural(daysLeft, 'day', 'days')} left keeps you inside it.`,
            )
          }
        }
        if (accountCount > 0) {
          parts.push(
            `${sentence(word(accountCount))} ${plural(accountCount, 'account makes', 'accounts make')} up the total.`,
          )
        }
        if (topHolding) {
          parts.push(`${topHolding.symbol} is your largest position at ${topHolding.value}.`)
        }
        return parts.length > 0 ? parts.join(' ') : null
      },
    },
    vaultEmpty:
      'No balances yet. Add your accounts, then save a snapshot to start tracking your net worth.',
    fxMissing: (currencies) =>
      `No ₪ rate for ${currencies.join(', ')} yet. These figures aren't converted. Try refreshing prices.`,
    liveDegraded: (currencies) =>
      `Still waiting on ${currencies.join(', ')} figures. Those accounts show their last saved balance — Update balances will take a typed one.`,
    hide: 'HIDE',
    reveal: 'REVEAL',
    stampLive: 'live',
    stampHeld: 'held',
    stampHeldTitle:
      'No fresh quote or ₪ rate. Showing the last balance you saved — Update balances will take a new one.',
    stampNoQuote: 'no quote',
    stampNoQuoteTitle:
      'No fresh quote or ₪ rate, so this one takes a typed balance. Your figure stands until quotes return.',
    stampNoQuoteNote: (accounts) =>
      accounts === 1
        ? 'No quote for the marked account. Type its balance — your figure stands until quotes return.'
        : 'No quote for the marked accounts. Type their balances — your figures stand until quotes return.',
    recentEntries: 'RECENT ENTRIES',
    tenDayPartial: (covered, positions) => `${covered} of ${positions} positions`,
    totalsPartial: (currencies) =>
      `Totals only cover the converted rows. ${currencies.join(', ')} ${
        currencies.length === 1 ? 'is' : 'are'
      } still waiting on a ₪ rate.`,
    trend: {
      rangeEmpty: (months) => `Not enough data in the last ${months} months. A line needs two points.`,
      showAll: 'Show all',
    },
    spend: {
      underPace: 'UNDER PACE',
      overPace: 'OVER PACE',
      fixedWord: 'fixed',
      variableOverDays: (days) => `over ${lower(days)} ${plural(days, 'day', 'days')}`,
      recurringHint:
        'Rent, subscriptions and the like. Counted every month until you remove them. The full amount counts against the month, but the daily rate spreads it out — rent is not a spike on the 1st.',
      history: 'History',
      prevMonth: 'Previous month',
      nextMonth: 'Next month',
      oneOffs: (month) => `One-offs · ${month}`,
      total: (month) => `Total · ${month}`,
      oneOffsHint: 'One-off spends: groceries, fuel, dining. A refund goes in as a minus.',
      dateLabel: 'Date',
      amountMissing: 'amount?',
      fixRows: (n) =>
        n === 1
          ? 'One row has a name but no amount. Add one, or delete the row.'
          : `${n} rows have a name but no amount. Add them, or delete the rows.`,
      noMinus: 'A minus only belongs on a one-off row. The budget and the card total only count upwards.',
    },
    addBalances: 'Update balances',
    addSpend: 'Log a spend',
    paydayMarker: 'Payday',
    settings: {
      title: 'The Ledger',
      paydayLabel: 'Payday',
      paydayBlurb:
        "The day you get paid. It gets a marker on the Manor, and I'll remind you to save a snapshot.",
      paydayOff: 'No marker',
      privacyLabel: 'Privacy',
      privacyBlurb: 'Blur the numbers until you hover. For checking the Ledger in company.',
      autoRefreshLabel: 'Prices on open',
      autoRefreshBlurb:
        'Fetch fresh quotes every time the Ledger opens. The free tier allows 8 calls a minute, 800 a day.',
    },
  },
  backup: {
    notExportFile: 'Not a Majordomo export file.',
    estate: {
      exportItem: 'Export everything…',
      importItem: 'Import a backup…',
      importTitle: 'IMPORT A BACKUP',
      importBlurb:
        'One file with all your records in it. It replaces everything on this device.',
      carries: 'IN THIS FILE',
      takenOn: (when) => `saved ${when}`,
      chooseFile: 'CHOOSE A FILE',
      confirmTitle: 'Replace everything?',
      confirmBody: (stores) =>
        `${stores} on this device will be overwritten by what is in the file.`,
      confirmYes: 'Import it',
      restored: 'Your records are restored.',
    },
  },
  sync: {
    connectItem: 'Connect an account…',
    accountItem: 'Your account',
    demoNote: 'Demo data is loaded. Sign-in is off.',
    title: 'YOUR ACCOUNT',
    blurb: 'One account, and your records follow you between devices.',
    notYet: 'Accounts do not sync records yet. For now, move them with an export file.',
    google: 'Continue with Google',
    working: 'One moment…',
    signedInAs: (email) => `Signed in as ${email}.`,
    signOut: 'Sign out',
    signOutBlurb: 'Your records stay on this device.',
    close: 'Back to the app',
    offDemo:
      'Demo data is loaded. Sign-in stays off so made-up records never reach your account.',
    offStorage: 'This browser blocks storage, so an account cannot be kept here.',
    offUnconfigured: "This build doesn't have an account server set up.",
    unreachable: 'this device is offline, or the server is not answering.',
    failed: (why) => `Could not reach your account: ${why}`,
    syncNow: 'Sync now',
    carrying: 'Syncing…',
    waiting: (n) => `${n} record${n === 1 ? '' : 's'} waiting`,
    upToDate: 'Everything is up to date.',
    lastCarried: (when) => `Last synced ${when}`,
    neverCarried: 'Not synced yet.',
    otherOwner:
      'This device belonged to another account. Its records stay here and were not sent.',
    section: 'SYNC',
    autoOn: 'Records sync as soon as they change. These are for when you want to decide yourself.',
    choiceTitle: 'Two sets of records.',
    choiceBody: (local, cloud) =>
      `This device has ${local} record${local === 1 ? '' : 's'}. Your account has ${cloud}. They have never been merged.`,
    choiceMerge: 'Keep both',
    choiceMergeHint:
      "Nothing is deleted. Where both hold the same record, your account's copy wins.",
    takeCloud: 'Use the account version',
    takeCloudHint: "This device is overwritten. Anything here your account doesn't have is deleted.",
    takeCloudTitle: 'Replace this device?',
    takeCloudBody:
      "Every record here is replaced by your account's copy, and anything your account doesn't have is deleted. This can't be undone.",
    takeCloudYes: 'Replace this device',
    takeLocal: 'Make this the only version',
    takeLocalHint: "Your account is overwritten. Anything it has that this device doesn't is deleted, on every device.",
    takeLocalTitle: 'Replace the account version?',
    takeLocalBody:
      "Your account is replaced by this device, on every device you use. Anything your account has that this device doesn't is deleted. This can't be undone.",
    takeLocalYes: 'Replace the account',
  },
  calendars: {
    settingsLabel: 'Google Calendar…',
    settingsBlurb: 'Your bookings in Google Calendar, and your Google events on the Manor.',
    needsAccount: 'Calendar sync follows your account. Sign in above and it opens.',
    sheetTitle: 'GOOGLE CALENDAR',
    blurb:
      'Two-way. Your bookings are written to a calendar of their own in your Google account — and to any phone that shows it — while your Google events take their hours on the Manor, read-only.',
    connect: 'Connect Google Calendar',
    working: 'One moment…',
    connectedAs: (email) => `Connected as ${email}.`,
    reconnect: 'Reconnect Google Calendar',
    reconnectNote:
      'Google has let the connection lapse. One more consent restores it; your records never left.',
    pullToggle: 'Google events on the Manor',
    pullBlurb: 'They arrive as read-only blocks and hold their hours against new bookings.',
    pushToggle: 'Your bookings in Google',
    pushBlurb: 'Watches and sessions are kept in a calendar named Majordomo, never mixed into your own.',
    syncNow: 'Sync now',
    syncing: 'Syncing…',
    lastSynced: (when) => `Last synced ${when}`,
    neverSynced: 'Not synced yet.',
    disconnect: 'Disconnect',
    disconnectTitle: 'Disconnect Google Calendar?',
    disconnectBody:
      'Google events leave the Manor. The Majordomo calendar already in your Google account stays until you delete it there.',
    disconnectYes: 'Disconnect it',
    returnedConnected: 'Google Calendar is connected, sir.',
    returnedDenied: 'Google was told no. Nothing was connected.',
    returnedError: 'The connection did not complete. Try the door again.',
    abroadLine: 'From your Google calendar. It is edited there, not here.',
    untitled: '(untitled)',
    calendarName: 'Majordomo',
    errors: {
      off: 'Calendar sync is not in service on this build.',
      offline: 'This device is offline. The calendars will catch up when it is not.',
      unreachable: 'The account register did not answer. It may simply be asleep — try again shortly.',
      signin: 'Sign in first; the connection follows your account.',
      reconnect: 'Google has let the connection lapse. Reconnect to resume.',
      google: 'Google did not answer. Try again shortly.',
      notConnected: 'Google Calendar is not connected.',
      rehearsal: 'A rehearsal is open on the Manor. Close it first, then disconnect.',
    },
  },
  settings: {
    title: 'SETTINGS',
    close: 'Close',
    groupAppearance: 'APPEARANCE',
    groupGuidance: 'HELP & TIPS',
    groupAccount: 'YOUR ACCOUNT',
    groupCalendars: 'CALENDARS',
    groupEstate: 'YOUR RECORDS',
    groupGrounds: 'THE GROUNDS',
    groupWings: 'THE WINGS',
    wingsBlurb:
      'Which wings the navigation lists, and in what order. Switching one off takes it off the tabs only — its records, and everything it has written to the calendar, stay where they are.',
    wingsBarNote: 'On a phone the first three ride the bar. The rest fold behind WINGS.',
    wingsAllOff: 'Every wing is off. The navigation is the Manor alone.',
    wingUp: (name) => `Move ${name} up`,
    wingDown: (name) => `Move ${name} down`,
    wingShow: (name) => `Show ${name}`,
    wingHide: (name) => `Hide ${name}`,
    themeLabel: 'Theme',
    weekStartLabel: 'Week starts on',
    weekStartBlurb: 'Every calendar and weekly total in the app follows this.',
    weekSun: 'Sunday',
    weekMon: 'Monday',
    rerunBlurb: 'Run the intro and the setup questions again, from the start.',
    frontDoorLabel: 'The front door',
    frontDoorBlurb:
      'The page the house shows a stranger. Your records stay as they are, and the button on it brings you back.',
    exportBlurb: 'One file with everything in it. Use it to move to another device.',
    profileLabel: 'Profile & nutrition',
    profileBlurb: 'Your body stats, and the numbers your food targets are worked out from.',
    exportWorkouts: 'Export workouts only',
    exportWorkoutsBlurb: 'The old workouts-only file. The full export above already covers it.',
    copyWorkouts: 'Copy workouts as JSON',
    copied: 'Copied',
    importWorkouts: 'Import workouts…',
    clearWorkouts: 'Clear the workout log…',
    clearWorkoutsTitle: 'Clear the workout log?',
    clearWorkoutsBody: (n) =>
      `All ${n} workout${n === 1 ? '' : 's'} on this device are deleted. Nothing outside the Grounds is touched.`,
    clearWorkoutsBodySynced: (n) =>
      `All ${n} workout${n === 1 ? '' : 's'} are deleted, here and on every other device. Nothing outside the Grounds is touched.`,
    clearWorkoutsYes: 'Clear the log',
    groupLegal: 'THE FINE PRINT',
    termsLabel: 'Terms of Service',
    termsBlurb: 'The terms the house runs by. Opens in a new tab.',
    privacyLabel: 'Privacy Policy',
    privacyBlurb: 'What is kept, where it lives, and what is counted. Opens in a new tab.',
    analyticsToggle: 'Share usage counts',
    analyticsBlurb:
      'Anonymous counts of which features get used — never the contents of your records. Off means the house reports nothing.',
  },
  consent: {
    title: 'The terms of the house',
    body: 'Your records live on your device and remain yours. The house runs by the terms below, and entering is agreeing to them, sir.',
    analyticsLine:
      'Once inside, the app counts which features are used — anonymous counts, never what your records say. Settings holds the switch to stop it.',
    termsLink: 'Terms of Service',
    privacyLink: 'Privacy Policy',
    agree: 'AGREE & ENTER',
  },
  onboarding: {
    welcome: {
      intro:
        'I am the Majordomo, sir. I keep one calendar for all of it — work, training, study, money.',
      promise: 'Three minutes to set things up. Skip anything you like.',
      googleHint: 'Recommended — your data follows you to other devices.',
      localCta: 'Start on this device',
      localHint: 'Everything stays on this device. You can sign in later.',
      later: 'Not now',
    },
    registry: {
      checking: 'Checking your account…',
      welcomeBack: 'Welcome back, sir.',
      welcomeBackBody: 'Everything is where you left it.',
      welcomeBackCta: 'TO THE MANOR',
      checkFailed: "I could not reach your account. We can carry on — it will catch up later.",
    },
    intro: {
      lines: [
        'Majordomo puts your whole life on one calendar — work, training, study, projects, money. One week, all of it in view.',
        'Each part gets its own wing: the Watch for work shifts, the Grounds for training, the Study for coursework, the Workshop for your own projects, the Ledger for money. All of them write to the same week.',
        'Everything is kept on this device and works offline. No account needed.',
      ],
    },
    composition: {
      title: 'ABOUT YOU',
      prompt: 'What fills your week?',
      chips: {
        shift: 'Shift work',
        dayJob: 'A day job',
        training: 'Training',
        study: 'Studying',
        projects: 'Side projects',
        money: 'Money to track',
      },
      hint: "I only ask about what you pick. Pick nothing and I'll skip ahead.",
    },
    chrome: {
      step: ({ n, of }) => `${n} OF ${of}`,
      next: 'NEXT',
      skip: 'Skip',
      back: 'Back',
    },
    work: {
      title: 'YOUR WORK WEEK',
      prompt: 'When do you work?',
      dayJobPrompt: 'Which days do you work? The usual five are one tap.',
      weekdaysCta: 'MON – FRI, BOTH WEEKS',
      hint: 'Pick your hours, then tap the days you work. Watch them land on the calendar behind.',
      daysLabel: 'THIS WEEK AND NEXT',
      posted: (n) =>
        n === 0
          ? 'Nothing added yet.'
          : n === 1
            ? 'One shift added — it is on the calendar behind this panel.'
            : `${word(n)} shifts added.`,
      nightNote: 'An overnight shift books your sleep for the next morning too.',
    },
    training: {
      title: 'YOUR TRAINING',
      prompt: 'How many sessions a week?',
      profileLabel: 'YOUR BUILD — OPTIONAL',
      profileHint:
        'Calories and protein are worked out from these. Leave them and I use rough defaults.',
      weightLabel: 'Weight',
      weightUnit: 'kg',
      heightLabel: 'Height',
      heightUnit: 'cm',
      ageLabel: 'Age',
      ageUnit: 'yr',
      sexLabel: 'Sex',
      sexMale: 'male',
      sexFemale: 'female',
    },
    study: {
      title: 'YOUR STUDIES',
      prompt: "Studying anything? Name it and I'll keep track of the hours.",
      goalLabel: 'HOURS A WEEK',
      add: 'ADD',
      enrolled: (n) => `${word(n)} ${plural(n, 'subject', 'subjects')} added.`,
      duplicate: 'That one is already on the list.',
      none: 'Nothing to study is a perfectly good answer.',
    },
    workshop: {
      title: 'YOUR PROJECTS',
      prompt:
        'Building anything of your own? Name it and I will keep the hours it takes.',
      goalLabel: 'HOURS A WEEK',
      add: 'OPEN',
      opened: (n) => `${word(n)} ${plural(n, 'venture', 'ventures')} opened.`,
      duplicate: 'That one is already on the shelf.',
      none: 'Nothing on the bench yet is a fine place to start.',
    },
    preset: {
      title: 'THE LOOK',
      prompt: 'Three themes. Tap one to try it — it changes straight away.',
    },
    walk: {
      sampleTag: 'SAMPLE DATA',
      sampleNote: 'These numbers are only an example. I clear them when we move on.',
      watch: {
        meaning:
          'The Watch is where your work shifts live. Add one here and it lands on the calendar. An overnight shift books sleep the next morning too.',
        dashboard:
          'The ring is hours worked against hours planned this week. Under it, a countdown to your next shift — and a two-week strip for adding more.',
        use: ({ count, next }) =>
          count > 0
            ? `Your shifts are already on the calendar.${
                next ? ` The first starts in ${untilLabel(next.h, next.m)}.` : ''
              }`
            : 'Best used when a new schedule comes out: add two weeks in a dozen taps, and everything else plans around it.',
      },
      grounds: {
        meaning:
          'The Grounds is for training. Log a session and the body map shows what it cost you, muscle by muscle, cooling off over the days after.',
        dashboard:
          'The figure glows where you trained and fades as you recover. Beside it, the week against your goal, and what to eat today.',
        use: ({ goal }) =>
          goal > 0
            ? `Your goal is ${lower(goal)} a week. Log the first session with the + and the map lights up.`
            : 'Best used right after training: two taps to log it, and the map remembers the rest.',
        demo: {
          note: 'A demonstration — nothing here is logged. Continue when you have seen enough.',
          run: {
            title: 'How far?',
            line: 'A run is a distance and a pace. Drag the band: the zone, the colour and the effort all follow it.',
          },
          muscles: {
            title: 'What did you hit?',
            line: 'Or name the muscles yourself. Every one you tap lights up on the figure — tap again for secondary, once more to clear.',
          },
        },
      },
      study: {
        meaning:
          'The Study is for coursework — subjects, weekly hours, homework and exams. Book sessions ahead, then say how they went.',
        dashboard:
          'One ring per subject, filling as you put the hours in. Below that, what is due — and for each exam, days left against hours booked.',
        use: ({ subjects }) =>
          subjects > 0
            ? `${word(subjects)} ${plural(subjects, 'subject is', 'subjects are')} set up. Book a session and it lands on the calendar.`
            : 'Add subjects here whenever you have coursework to keep track of.',
      },
      workshop: {
        meaning:
          'The Workshop is for what you build in your own time — a venture for each one. Start the timer when you sit down, and the hours record themselves.',
        dashboard:
          'A ring per venture for the week, and beside it the shelf: what each one has taken in its whole life, and what it ships next.',
        board:
          'Every venture has a pegboard. Notes, jobs to do and links, hung on it and threaded together — drag a card and the twine follows.',
        use: ({ ventures }) =>
          ventures > 0
            ? 'Press TO THE BENCH when you start work. Press it again when you stop, and the hours are on the calendar without you writing anything down.'
            : 'Best used the moment an idea becomes a project: open a venture, and the hours it takes stop being invisible.',
      },
      ledger: {
        meaning:
          'The Ledger is for money — your accounts, what they are worth over time, and this month\u2019s spending against a budget.',
        dashboard:
          'The Vault is your total in one number. The chart is its history, the bars show where the money sits, and the spending card paces the month.',
        use: 'Only as often as you like. Update a balance now and then and the chart stays honest. Nothing is needed today.',
      },
      skipRest: 'Skip the rest',
    },
    close: {
      line: 'You are all set, sir.',
      cta: 'TO THE MANOR',
    },
    ghost: {
      line: 'An empty week. Shall we set things up?',
      cta: 'SET THINGS UP',
    },
    settingsRerun: 'Run first-time setup again',
  },
  hints: {
    buttonLabel: 'What is this panel for?',
    settingsToggle: 'Panel tips',
    settingsBlurb: 'Adds a ? to every panel that explains what it does.',
    house: {
      rail:
        'One number from each wing, in whatever that wing counts in. Tap a row to go there.',
      signal:
        'The one thing this wing wants you to notice today, written as a sentence instead of a number.',
      pattern:
        'Where two wings clash — training booked right after a shift, or a subject with a goal and nothing scheduled. The fix is one tap.',
      briefing:
        'How this wing is doing right now. Closed, you get the headline. Open it for the detail behind it.',
      briefingLedger:
        'The day in one paragraph, in each wing’s own colour, over four dials the house thought worth showing. THE PEN chooses what it covers; the chips below swap a dial.',
    },
    watch: {
      onDuty:
        'Your week as a ring: hours already worked against hours scheduled, with the countdown to your next shift underneath.',
      post:
        'Where your roster becomes a calendar. Pick a shift, tap the days you work it. One that runs past midnight blocks out recovery sleep for you.',
      week:
        'Every shift this week in order, with the hours each one costs, and what’s scheduled after them.',
      cycle:
        'The shape of the week rather than the total: how many nights, how much sleep is blocked out, your shortest gap between two shifts, and how much of the 168 hours is still yours.',
    },
    grounds: {
      bodyMap:
        'Each muscle is coloured by what it’s still carrying — hot where the work landed, cooling over days. Tap one for its own reading. The toggle swaps recent strain for the last seven days’ volume, where each muscle is shaded against its own range rather than a shared number.',
      ledger:
        'The body map as a table: each muscle’s strain next to its estimated hard sets over the last seven days, for when you want the number and not the colour.',
      weekGoal:
        'Sessions logged this week against the target you set. Runs still feed strain, but they don’t count here — this counts lifting.',
      weekChart:
        'Lifting sessions per week over recent weeks. Good for catching a habit slipping before your body tells you.',
      topMuscles:
        'What you’ve actually trained over the last thirty days, ranked. Usually the quickest way to find what you’ve been avoiding.',
      runs:
        'Distance, time and average pace for this calendar week, then your last few runs. Pace is averaged over the runs that recorded both sides.',
      scheduled:
        'Training already on the Manor calendar. Log a session and it gets matched to the block it fills.',
      recovery:
        'When each sore muscle should be back to normal, so you can aim the next session at something that’s ready.',
      fuel:
        'What today asks for, worked out from your build and what you actually trained. Training days get more, rest days less.',
      calendar:
        'Every session you’ve logged, by date. Tap a day to see what you did.',
    },
    study: {
      pending:
        'Exams coming up, soonest first, with the hours you have studied toward each.',
      dossier:
        'One subject in full: its syllabus, its homework, its exams. The syllabus percentage covers this subject only.',
      readingWeek:
        'One ring per subject, filling as you log hours against the weekly goal you set for it.',
      subjectLedger:
        'Hours done, hours booked and the goal, per subject — three questions the rings answer at once.',
      desk:
        'Book a study session ahead here. Past sessions still waiting to be logged are listed below.',
      weekLedger:
        'Every study session this week and how it went — done, partial, or skipped.',
    },
    workshop: {
      bench:
        'One ring per venture, filling as bench hours are fulfilled. The timer logs unplanned work; booked sessions land on the Manor.',
      pending:
        'Milestones coming up, soonest first, with the hours worked toward each. An overdue chip trails to today until dealt with.',
      desk:
        'Book bench time ahead here. Past sessions still waiting to be reported are listed below.',
      weekLedger:
        'Every bench session this week and how it went — done, partial, or skipped. LIVE marks hours the timer logged.',
      shelf:
        'Every venture and its lifetime hours. The odometer never resets — shipping or shelving keeps the history.',
      board:
        'The venture’s pegboard: notes, tasks and links hung on a grid and threaded together. Drag a card to move it.',
    },
    capital: {
      vault:
        'Everything in one number: assets minus debts. Accounts with holdings use live prices. The rest use their last saved balance.',
      trend:
        'Net worth across your saved snapshots. The line is history and only moves when you update balances, so the live number above it can differ.',
      allocation:
        'Where the money actually sits, by type. The quickest way to spot more of one thing than you meant to hold.',
      accounts:
        'Every account and what it holds right now. An account on live prices says so, and so does one whose quotes are missing.',
      portfolio:
        'Each holding with its price, today’s move, and its profit or loss. Every row is in its own currency.',
      tenDay:
        'How the portfolio has moved lately — enough to tell a bad day from a bad two weeks.',
      spend:
        'This month’s spending against its budget, with the pace so far. History opens the same sheet month by month.',
      recent:
        'The individual purchases you entered this month, newest first. A minus is a refund and comes off the total.',
    },
  },
}
