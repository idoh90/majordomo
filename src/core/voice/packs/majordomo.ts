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

/** capitalise a clause that a number-word may be leading ("no hours stood…") */
function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "9 h 20 m" — the countdown format the Watch already prints */
function untilLabel(h: number, m: number): string {
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`
}

/** The Majordomo — the commercial voice. Dry, composed, quietly satisfied. */
export const majordomoPack: VoicePack = {
  house: {
    title: 'THE HOUSE',
    subtitle: 'as each wing reports it',
    rowLabel: {
      manor: 'booked of 168',
      watch: 'stood',
      grounds: 'workouts',
      study: 'read',
      capital: 'budget left',
    },
    signal: {
      dutyLoad: 'DUTY LOAD · 8 WEEKS',
      readiness: 'READINESS',
      examRunway: 'EXAM RUNWAY',
      burnRate: 'BURN RATE',
      dutyLoadLine: ({ thisWeek, avg }) => {
        // a first counted week has a figure but nothing to measure it against;
        // saying "nothing to draw on" beside a drawn line is a contradiction
        if (avg <= 0) {
          return thisWeek > 0
            ? 'The first week the estate has counted, sir — no usual to compare it against yet.'
            : 'No duty on the books, sir.'
        }
        const d = thisWeek - avg
        if (Math.abs(d) < 1) return 'A week much like your usual, sir.'
        return d > 0
          ? `${hoursWord(d)} ${plural(Math.round(d), 'hour', 'hours')} heavier than your usual week, sir.`
          : `${sentence(hoursWord(-d))} ${plural(Math.round(-d), 'hour', 'hours')} lighter than your usual week, sir.`
      },
      readinessLine: ({ band, limiter }) => {
        if (!limiter) return 'Nothing is sore, sir. The body is yours to spend.'
        const state =
          { fresh: 'barely marked', ready: 'holding up', worn: 'worn', spent: 'spent' }[band] ??
          'worn'
        return `${limiter} costs you the most, sir — the body reads ${state}.`
      },
      examRunwayLine: ({ subject, days, bookedH }) => {
        const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${lower(days)} days`
        return bookedH > 0
          ? `${subject} ${when}, with ${hoursWord(bookedH)} ${plural(Math.round(bookedH), 'hour', 'hours')} still booked before it.`
          : `${subject} ${when}, with nothing booked before it, sir.`
      },
      burnRateLine: ({ perDay, prevPerDay }) =>
        prevPerDay
          ? `${perDay} a day, against ${prevPerDay} a day last month.`
          : `${perDay} a day so far this month.`,
      idle: 'Nothing to draw on yet, sir.',
    },
    pattern: {
      title: 'THE PATTERN',
      lines: {
        trainAfterWatch: ({ title, mins, before }) => {
          const h = Math.round((mins / 60) * 10) / 10
          return before
            ? `${title} finishes ${hoursWord(h)} ${plural(Math.round(h), 'hour', 'hours')} before a watch begins, sir. You would stand it already spent.`
            : `${title} begins ${hoursWord(h)} ${plural(Math.round(h), 'hour', 'hours')} after a watch ends, sir. You would train already worn.`
        },
        studyUntouched: ({ subject }) => `${subject} has a goal this week and nothing booked against it, sir.`,
        none: 'The wings are not treading on one another this week, sir.',
      },
      action: 'MOVE IT FOR ME →',
    },
  },
  briefing: {
    label: 'THE BRIEFING',
    expand: 'Read the rest of the briefing',
    collapse: 'Fold the briefing away',
  },
  appName: 'Majordomo',
  wordmark: { lead: 'MAJORDOMO', accent: '' },
  skinPickerBlurb: 'Three presets, one house. Switches instantly — nothing else changes.',
  storageWarning: "Browser storage is blocked (private mode?) — nothing will survive a reload.",
  presetLabel: 'PRESET',
  ui: {
    discard: {
      title: 'Leave this unsaved, sir?',
      body: 'What you have typed here is not yet on the books. Closing loses it.',
      confirm: 'Discard it',
    },
  },
  manor: {
    name: 'THE MANOR',
    empty: 'Nothing on the books this week, sir.',
    quickAddLabel: 'QUICK ADD',
    crossesMidnight: 'Crosses midnight — one block, as it should be.',
    monthNote: 'A night watch is written on the day it begins, sir; the small hours carry a reminder.',
    briefing: (count) => {
      if (count === 0) return 'No watches this week, sir. The estate is yours.'
      if (count === 1) return 'A single watch this week, sir. A comparatively civilised stretch.'
      const words = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
      return `${words[count] ?? count} watches this week, sir.`
    },
    briefingStat: ({ watchH, trainingCount, studyH }) => {
      const parts: string[] = []
      if (watchH > 0) parts.push(`${watchH.toFixed(1)} h watch`)
      if (trainingCount > 0) parts.push(`${trainingCount} training`)
      if (studyH > 0) parts.push(`${studyH.toFixed(0)} h study`)
      return parts.join(' · ')
    },
    briefingScope: { now: 'TODAY', viewing: 'VIEWING' },
    anchoredEarlier: 'That one begins last week, sir. Move it from there.',
    custom: {
      row: 'Something else…',
      kindLabel: 'KIND',
      book: 'ON THE BOOKS',
      back: '‹ Templates',
      wontFit: "Won't fit here, sir.",
    },
    occupied:'That hour is already spoken for, sir.',
    occupiedShort: 'occupied, sir',
    moved: 'Moved, sir.',
    restored: 'Restored, sir.',
    asYouWere: 'As you were, sir.',
    onTheBooks: 'On the books, sir.',
    removed: 'Struck from the books, sir.',
    removeLabel: 'Remove',
    moveTitle: 'Move to another day, sir?',
    moveBody: ({ title, from, to }) => `${title} would run ${to} instead of ${from}.`,
    moveYes: 'Move it',
    undoLabel: 'UNDO',
    quickAddTitle: 'QUICK ADD',
    slotClear: 'The slot is clear, sir.',
    movePlace: 'Tap where it should go, sir.',
    releaseCancel: 'RELEASE TO CANCEL',
    movedTo: (time) => `Moved to ${time}, sir.`,
    nearWatchLine: ({ mins, before }) =>
      before
        ? `Ends ${mins} minutes before the watch, sir.`
        : `Begins ${mins} minutes after the watch, sir.`,
    nearWatchTitle: 'A word before you do, sir.',
    nearWatchBody: 'You would train already worn — the watch sits hard against this hour.',
    eventSheet: {
      move: 'MOVE',
      edit: 'Edit',
      editTitle: 'A SMALL CORRECTION',
      titleLabel: 'TITLE',
      startLabel: 'START',
      durationLabel: 'DURATION',
      save: 'SO NOTED',
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
        if (names.length === 0) return forecast ? 'Recovered by then, sir.' : 'Nothing sore, sir.'
        const shown = names.slice(0, 3)
        const rest = names.length - shown.length
        const list =
          rest > 0
            ? `${shown.join(', ')} and ${rest} more`
            : shown.length === 1
              ? shown[0]
              : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
        return forecast ? `${list} — hot by then, sir.` : `${list} — still hot, sir.`
      },
    },
    headsUp: {
      monthGreeting: (month) => `Happy ${month}, sir.`,
      weekGreeting: (day) => `Happy ${day}.`,
      unfiledWorkout: ({ day }) => {
        const d = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
        return `${d === 'today' || d === 'yesterday' ? `${d[0].toUpperCase()}${d.slice(1)}'s` : `${d}'s`} training block passed unrecorded — file the details and the strain engine will count it, sir.`
      },
      examUnbooked: ({ subject, days }) =>
        `The ${subject} exam is ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} with nothing on the books, sir.`,
      nextWeekWatches:
        'Next week carries no watches yet — worth putting them on the books while the week is still soft.',
      weekPlan: 'The week is a blank page, sir. The watches and training slots, when you have a moment.',
      snapshotNudge:
        'The pay should have landed — a fresh snapshot of the balances would keep the ledger honest, sir.',
      nightTonight: 'A night watch tonight — the afternoon belongs to sleep, sir.',
      awaitingReport: (n) =>
        n === 1
          ? 'A study session awaits its report, sir.'
          : `${n} study sessions await their report, sir.`,
      goalBehind: ({ done, goal }) =>
        `${done} session${done === 1 ? '' : 's'} of ${goal} this week, sir, with the week nearly out.`,
    },
    whatIf: {
      button: '⧉ WHAT-IF',
      // "the ledger" collided with THE LEDGER wing one tab over — the first
      // read was that your net worth was being rehearsed
      banner: 'The week is a rehearsal, sir. Nothing binds until you apply.',
      panelTitle: 'THE DIFFERENCE',
      panelSub: 'hours this week, before → after',
      noteClean: 'Drag freely, sir. I shall keep the originals in pencil.',
      noteDirty: 'The faint blocks are how things stand today, sir.',
      changes: (n) => (n === 0 ? 'no changes yet' : n === 1 ? '1 change' : `${n} changes`),
      apply: 'APPLY',
      discard: 'Discard',
      applied: 'So arranged, sir.',
      conflict: ({ title, mins, before }) =>
        before
          ? `${title} would end ${mins} minutes before the watch, sir.`
          : `${title} would begin ${mins} minutes after the watch, sir.`,
    },
  },
  grounds: {
    ledger: {
      title: 'The muscle ledger',
      hotNow: 'HOT NOW',
      hotNowValue: ({ hot, total }) => `${hot} of ${total}`,
      colStrain: 'strain',
      colSets: 'sets · this week',
      sets: (n) => `~${n} ${plural(n, 'set', 'sets')}`,
      note: 'Sets are an estimate, sir — the estate logs sessions, not sets, and a run feeds recovery without counting toward them.',
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
            ? `${word(done)} ${plural(done, 'workout', 'workouts')} of ${lower(goal)} this week, sir`
            : done > 0
              ? `${word(done)} ${plural(done, 'workout', 'workouts')} this week, sir`
              : 'Nothing logged this week, sir'
        if (hot === 0 || !top) {
          return `${week}, and nothing is still sore. The body is yours to spend.`
        }
        return `${week}, and ${lower(hot)} ${plural(hot, 'muscle group is', 'muscle groups are')} still hot. ${top.name} leads at ${top.strain.toFixed(1)}.`
      },
      detail: ({ readiness, kcal, protein, meals, isTrainingDay, nextBlock, blocksAhead }) => {
        const bandWord = {
          fresh: 'fresh',
          ready: 'ready',
          worn: 'worn',
          spent: 'spent',
        }[readiness.band]
        const parts = [`Readiness ${readiness.score} of 100, ${bandWord}.`]
        if (kcal > 0) {
          parts.push(
            `Fuel asks ${kcal.toLocaleString('en-US')} kcal on ${isTrainingDay ? 'a training day' : 'a rest day'} — ${protein} g of protein across ${lower(meals)} ${plural(meals, 'meal', 'meals')}.`,
          )
        }
        if (nextBlock) {
          const more =
            blocksAhead > 1
              ? `${word(blocksAhead)} blocks remain on the books; the next is`
              : 'One block remains on the books:'
          parts.push(`${more} ${nextBlock.dayLabel}'s ${nextBlock.title}.`)
        } else {
          parts.push('Nothing further is booked on the Manor.')
        }
        return parts.join(' ')
      },
    },
    scheduledTitle: 'On the books',
    scheduledNote: 'Booked on the Manor, sir — move or remove them there.',
    recoveryTitle: 'RECOVERY',
    settles: ({ day, time }) => `settles ${day} ${time}`,
    fulfils: ({ day, time }) => {
      const d = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
      return `This fulfils ${d}'s ${time} block, sir.`
    },
    fulfilsNothing: 'This fulfils no booked block, sir.',
    fulfilsChange: 'change',
    fulfilsNoBlock: "None — don't link",
    fulfilledTag: 'LOGGED',
    runPace: ({ pace }) => `That is ${pace} per kilometre, sir.`,
    runPaceWalking: 'Walking pace, sir.',
    runOptional: 'Both optional, sir — effort is what drives the strain.',
    weekTitle: 'This week',
    goalMet: "The week's goal is met, sir.",
    goalRemaining: (n) => `${n} more to meet the week's goal.`,
    slackingTitle: 'Below your usual',
    slackingDetail: ({ group, thisWeek, baseline }) =>
      `${group}: ${Math.round(thisWeek)} against a usual ${Math.round(baseline)} a week`,
    goalDialogTitle: 'Weekly goal',
    goalDialogBody: 'How many sessions should the week hold, sir? Change it whenever you like.',
    goalPerWeek: 'per week',
    goalNone: 'no goal',
    fuelTitle: 'Fuel · Today',
    fuelTrainingDay: 'Training day',
    fuelRestDay: 'Rest day',
    fuelTips: [
      'A piece of fruit today covers the vitamin C and potassium the meat does not, sir.',
      'Training days want a starch — potato, rice, oats — to reach the carbs, sir.',
      'Yogurt or milk covers the calcium the meat is missing, sir.',
      'Liver once a week fills the folate and vitamin A gaps, sir. No vegetables required.',
      'Oats or a supplement closes the fibre gap gently, sir.',
      'A periodic lipid panel — LDL, ApoB — is worth having on a red-meat diet, sir.',
    ],
    historyEmptyTitle: 'Nothing logged yet',
    historyEmptyMobile: 'Hit the glowing + to log the first one, sir.',
    historyEmptyDesktop: 'Hit LOG WORKOUT above to log the first one, sir.',
    // device-neutral: one info line renders under a mouse as often as a thumb,
    // and unlike the history empty state there is no second element to swap
    mapIdleStrain: 'Select a muscle for details',
    mapIdleVolume: 'Weekly volume vs your targets',
    deloadTitle: 'Deload check',
    deload: ({ count, muscles }) =>
      `${count} muscles are overreaching this week (${muscles}). A lighter session or an extra rest day would settle them, sir.`,
    topMusclesTitle: 'Most Trained · 30d',
    topMusclesNote: 'Lifting only — runs feed recovery, not this chart.',
    topMusclesEmpty: 'No lifting volume yet',
  },
  study: {
    readingWeek: 'THE READING THIS WEEK',
    weekLine: ({ from, to, fulfilled, booked }) =>
      `${from} → ${to} · ${fulfilled.toFixed(1)} of ${booked.toFixed(1)} h fulfilled`,
    ringOfGoal: (goal) => `of ${goal.toFixed(1)} h`,
    ringNoGoal: 'h · no goal',
    more: (n) => `+${n} MORE`,
    enrol: 'ENROL A SUBJECT',
    mattersPending: 'MATTERS PENDING',
    noExams: 'No examinations ahead, sir.',
    countdown: (days) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`),
    hoursToward: (h) => `${h.toFixed(1)} h logged toward it`,
    desk: 'THE DESK',
    book: 'BOOK / LOG A SESSION',
    awaiting: 'AWAITING REPORT',
    noAwaiting: 'Nothing awaiting report, sir.',
    fileUnder: 'FILE UNDER',
    done: 'DONE',
    partial: 'PARTIAL',
    skipped: 'SKIPPED',
    logIt: 'LOG IT',
    strikeRest: 'STRIKE THE REST AS SKIPPED',
    weekLedger: "THIS WEEK'S LEDGER",
    noLedger: 'Nothing on the books this week, sir.',
    status: {
      done: 'DONE',
      partial: (h) => `PARTIAL ${h.toFixed(1)} H`,
      skipped: 'SKIPPED',
      awaiting: 'AWAITING',
      ahead: 'AHEAD',
    },
    dossier: 'THE DOSSIER',
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
      notePlaceholder: 'A note, if any',
      name: 'NAME',
      namePlaceholder: 'e.g. Number Theory',
      weeklyGoal: 'WEEKLY GOAL',
      title: 'TITLE',
      hwPlaceholder: 'e.g. Problem set 5',
      examPlaceholder: 'e.g. Midterm',
      topicPlaceholder: 'e.g. Diagonalization',
      due: 'DUE — OPTIONAL',
      noDate: 'NO DATE',
      theDay: 'THE DAY',
      addHomework: 'ADD HOMEWORK',
      addExam: 'ADD AN EXAM',
      addTopic: (name) => `ADD A TOPIC — ${name}`,
      bookHintPast: 'The hour is already behind us, sir — this lands as logged, and the ring moves at once.',
      bookHintFuture: 'This will take its place on the Manor at once, sir.',
      goalZeroHint: 'A goal of nought keeps the ring quiet, sir — hours are still counted.',
      hwDueHint: 'A due day takes its chip on the Manor, sir — and trails to today if it goes unanswered.',
      examHint: 'Hours logged for the subject from today count toward it, sir.',
      ctaLog: 'LOG IT',
      ctaBook: 'ON THE BOOKS',
      ctaEnrol: 'ENROL',
      ctaHw: 'ON THE DOCKET',
      ctaExam: 'MARK THE DATE',
      ctaTopic: 'ADD TOPIC',
      cancel: 'CANCEL',
    },
    toast: {
      markedDone: 'Marked done, sir. The ring moves.',
      struck: 'Struck as skipped, sir.',
      notedPartial: (h) => `Noted, sir — ${h.toFixed(1)} h of it.`,
      restStruck: 'The rest are struck, sir.',
      logged: 'Logged, sir. The ring moves.',
      onBooks: 'On the books, sir.',
      enrolled: 'Enrolled, sir. A fresh ring awaits.',
      hwAdded: (hasDue) =>
        hasDue ? 'On the docket, sir. The chip takes its day on the Manor.' : 'On the docket, sir.',
      hwDone: 'Done, sir. The chip retires from the Manor.',
      hwUndone: 'Back on the docket, sir.',
      examNoted: 'Noted, sir. The countdown begins.',
      topicAdded: 'Added to the syllabus, sir.',
      archived: 'Archived, sir. The ring retires.',
      filed: 'Filed, sir.',
      nameFirst: 'A name first, sir.',
      titleFirst: 'A title first, sir.',
    },
    markerHw: (title) => `Due — ${title}`,
    markerExam: (title) => `Exam — ${title}`,
    archiveTitle: 'Archive the subject, sir?',
    archiveBody: (name) => `${name} keeps its history — the ring simply retires from the row.`,
    archiveYes: 'Archive',
    tileUntilExam: 'until the next examination',
    tileWeekRead: 'read this week',
    briefingExam: ({ subject, days, hours }) => {
      const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
      const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
      const h = Math.round(hours)
      const hw = h <= 12 ? (words[h] ?? `${h}`).toLowerCase() : `${h}`
      return `The ${subject} exam ${when}, sir — ${hw} ${h === 1 ? 'hour' : 'hours'} on the books.`
    },
    briefingHomework: (n) => {
      const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
      return n === 1
        ? 'One matter due this week, sir.'
        : `${words[n] ?? n} matters due this week, sir.`
    },
    briefingWeek: ({ fulfilled, goal }) =>
      goal > 0
        ? `${fulfilled.toFixed(1)} of ${goal.toFixed(1)} hours read this week, sir.`
        : `${fulfilled.toFixed(1)} hours read this week, sir.`,
    subjectLedger: {
      title: 'The subject ledger',
      fulfilledTag: 'filed',
      bookedTag: 'booked',
      goalTag: 'goal',
      row: ({ fulfilled, booked, goal }) =>
        `${fulfilled.toFixed(1)} filed of ${booked.toFixed(1)} booked against ${goal.toFixed(1)}`,
      noGoal: 'no goal set',
      empty: 'No subjects enrolled, sir.',
    },
    briefingPanel: {
      chips: ({ fulfilledH, bookedH, exam, awaiting }) => [
        { label: 'READ', value: `${fulfilledH.toFixed(1)} / ${bookedH.toFixed(1)} h` },
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
        { label: 'AWAITING', value: String(awaiting) },
      ],
      headline: ({ fulfilledH, bookedH, goalH, exam }) => {
        const read =
          bookedH > 0
            ? `${hoursWord(fulfilledH).charAt(0).toUpperCase()}${hoursWord(fulfilledH).slice(1)} ${plural(Math.round(fulfilledH), 'hour', 'hours')} read of ${hoursWord(bookedH)} booked, sir.`
            : goalH > 0
              ? `Nothing booked this week against a goal of ${hoursWord(goalH)} ${plural(Math.round(goalH), 'hour', 'hours')}, sir.`
              : 'Nothing booked this week, sir.'
        if (!exam) return `${read} No examination is on the horizon.`
        const when = exam.days <= 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${lower(exam.days)} days`
        // hours BEHIND you and hours STILL BOOKED are different questions;
        // answering one with the other is how this line used to contradict
        // the Manor's heads-up
        const behind = `${hoursWord(exam.doneH)} ${plural(Math.round(exam.doneH), 'hour', 'hours')} behind you`
        const ahead =
          exam.aheadH > 0
            ? `${hoursWord(exam.aheadH)} more on the books`
            : 'nothing further on the books'
        return `${read} The ${exam.subject} examination is ${when}, with ${behind} and ${ahead}.`
      },
      detail: ({ awaiting, dueCount, syllabusPct, syllabusSubject, nextSession }) => {
        const parts: string[] = []
        const clauses: string[] = []
        if (awaiting > 0) {
          clauses.push(
            `${lower(awaiting)} ${plural(awaiting, 'session still awaits its report', 'sessions still await their reports')}`,
          )
        }
        if (dueCount > 0) {
          clauses.push(`${lower(dueCount)} ${plural(dueCount, 'matter falls', 'matters fall')} due this week`)
        }
        if (syllabusPct !== null) {
          clauses.push(
            syllabusSubject
              ? `the ${syllabusSubject} syllabus stands at ${syllabusPct}% covered`
              : `the syllabi stand at ${syllabusPct}% covered overall`,
          )
        }
        if (clauses.length === 0) {
          parts.push('Nothing awaits a report and nothing falls due, sir.')
        } else {
          const joined =
            clauses.length === 1
              ? clauses[0]
              : `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
          parts.push(`${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`)
        }
        if (nextSession) {
          parts.push(`${nextSession.dayLabel}'s block belongs to ${nextSession.subject}.`)
        }
        return parts.join(' ')
      },
    },
  },
  kinds: {
    shift: 'THE WATCH',
    sleep: 'REST',
    training: 'THE GROUNDS',
    study: 'THE STUDY',
    marker: 'THE LEDGER',
  },
  modules: {
    watch: { name: 'THE WATCH', tagline: 'Shifts · duty · the roster' },
    training: { name: 'THE GROUNDS', tagline: 'Conditioning · strain · fuel' },
    study: { name: 'THE STUDY', tagline: 'Subjects · syllabi · the docket' },
    capital: { name: 'THE LEDGER', tagline: 'Net worth · markets · budget' },
  },
  watch: {
    onDuty: 'ON DUTY · THIS WEEK',
    nextWatch: 'NEXT WATCH',
    nextIn: ({ h, m }) => (h > 0 ? `NEXT IN ${h} H ${m} M` : `NEXT IN ${m} M`),
    noneAhead: 'No watch posted, sir.',
    noneThisWeek: 'None this week, sir.',
    post: 'POST A WATCH',
    weekList: "THIS WEEK'S WATCHES",
    ringIdle: 'none on the books this week, sir',
    aheadList: 'FURTHER AHEAD',
    aheadSummary: ({ count, hours }) =>
      `${count} ahead · ${hours.toFixed(1)} h`,
    dayShift: 'Day',
    nightShift: 'Night',
    duplicate: 'There is already a watch that day, sir.',
    posted: 'On the books, sir.',
    postedWithSleep: 'On the books, sir — sleep is pencilled for the morning after.',
    note: 'Every watch posted here takes its place in the Manor at once, sir.',
    openManor: 'Open the Manor →',
    status: { logged: 'LOGGED', next: 'NEXT', ahead: 'AHEAD' },
    aheadNone: 'Nothing beyond this week, sir.',
    bandNote: 'Pick a day to post it; the Manor takes it from there.',
    cycle: {
      title: 'THE CYCLE',
      nights: 'NIGHTS',
      days: 'DAYS',
      pencilled: 'PENCILLED',
      turnaround: 'SHORTEST TURNAROUND',
      onDuty: 'ON DUTY',
      own: 'YOUR OWN',
      splitTitle: "THE WEEK'S 168 HOURS",
      empty: 'No duty this week, sir. The whole hundred and sixty-eight are yours.',
      line: ({ nights, days, pencilledH, turnaroundH, ownH }) => {
        const shape = [
          nights > 0 ? `${lower(nights)} ${plural(nights, 'night', 'nights')}` : '',
          days > 0 ? `${lower(days)} ${plural(days, 'day', 'days')}` : '',
        ]
          .filter(Boolean)
          .join(' and ')
        const hrs = (h: number) => `${hoursWord(h)} ${plural(Math.round(h), 'hour', 'hours')}`
        const parts = [
          pencilledH > 0
            ? `${sentence(shape)}, with ${hrs(pencilledH)} pencilled for sleep.`
            : `${sentence(shape)}, with no sleep pencilled after them.`,
        ]
        // a turnaround under eight hours is the one figure here worth a remark
        if (turnaroundH !== null && turnaroundH < 8) {
          parts.push(`${sentence(hrs(turnaroundH))} is the tightest turnaround, sir.`)
        }
        parts.push(`${sentence(hrs(ownH))} of the week are your own.`)
        return parts.join(' ')
      },
    },
    briefingPanel: {
      chips: ({ doneH, expectedH, next, nights }) => [
        {
          label: 'STOOD',
          value: expectedH > 0 ? `${doneH.toFixed(1)} / ${expectedH.toFixed(1)} h` : '—',
        },
        { label: 'NEXT', value: next ? untilLabel(next.h, next.m) : '—' },
        { label: 'NIGHTS', value: String(nights) },
      ],
      headline: ({ doneH, expectedH, logged, remaining, next }) => {
        if (expectedH <= 0) {
          return next
            ? `Nothing on the books this week, sir. The next watch is ${next.dayLabel}'s, in ${untilLabel(next.h, next.m)}.`
            : 'No watches on the books, sir. The estate is entirely yours.'
        }
        const stood = sentence(
          `${hoursWord(doneH)} ${plural(Math.round(doneH), 'hour', 'hours')} stood of ${hoursWord(expectedH)}, sir`,
        )
        const tally =
          remaining > 0
            ? `${lower(logged)} ${plural(logged, 'watch', 'watches')} logged, ${lower(remaining)} still to come`
            : `all ${lower(logged)} ${plural(logged, 'watch', 'watches')} logged`
        const upNext = next
          ? ` ${next.dayLabel}'s ${next.night ? 'night' : 'day'} watch begins in ${untilLabel(next.h, next.m)}.`
          : ''
        return `${stood} — ${tally}.${upNext}`
      },
      detail: ({ nights, days, sleepH, weeklyH, expectedH, nextWeekCount, aheadCount }) => {
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
              ? `, with ${hoursWord(sleepH)} ${plural(Math.round(sleepH), 'hour', 'hours')} of sleep pencilled after them`
              : ''
          parts.push(`${sentence(shape)} this week${withSleep}.`)
        }
        // only claim a record when there is enough history to have one
        const prior = weeklyH.slice(0, -1).filter((h) => h > 0)
        if (expectedH > 0 && prior.length >= 3 && expectedH > Math.max(...prior)) {
          parts.push(
            `${sentence(hoursWord(expectedH))} booked hours is your heaviest week since the estate started counting.`,
          )
        }
        if (nextWeekCount > 0) {
          parts.push(
            `Next week carries ${lower(nextWeekCount)} ${plural(nextWeekCount, 'watch', 'watches')}.`,
          )
        } else if (aheadCount > 0) {
          parts.push(
            `${word(aheadCount)} ${plural(aheadCount, 'watch waits', 'watches wait')} further ahead.`,
          )
        } else {
          parts.push('Nothing is posted beyond this week.')
        }
        return parts.join(' ')
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
            ? `${netWorth} on the books, sir.`
            : `${netWorth} on the books, sir — ${delta.up ? 'up' : 'down'} ${delta.amount} since ${delta.basis}.`
        if (!hasBudget) return `${worth} ${spent} spent this month, against no set budget.`
        const daysLeft = Math.max(0, daysInMonth - dayOfMonth)
        const runway =
          daysLeft === 0
            ? 'with the month out'
            : `with ${lower(daysLeft)} ${plural(daysLeft, 'day', 'days')} to run`
        return over
          ? `${worth} ${left} over the month's budget of ${budget}, ${runway}.`
          : `${worth} ${left} of the month's budget remains, ${runway}.`
      },
      detail: ({ portfolio, perDay, underPace, hasBudget }) => {
        const parts: string[] = []
        if (portfolio) {
          parts.push(
            `The portfolio holds ${portfolio.value}, ${portfolio.dayUp ? 'up' : 'off'} ${portfolio.dayPL} today and ${portfolio.unrealUp ? 'ahead' : 'behind'} ${portfolio.unrealized} overall.`,
          )
        }
        if (perDay) {
          parts.push(
            hasBudget
              ? `Spending runs at ${perDay} a day, against a budget that allows ${underPace ? 'more' : 'less'}.`
              : `Spending runs at ${perDay} a day.`,
          )
        }
        if (parts.length === 0) parts.push('Nothing further to report on the books, sir.')
        return parts.join(' ')
      },
    },
    vaultEmpty:
      "No balances yet. Add your accounts, then log a snapshot to start charting the estate's worth.",
    fxMissing: (currencies) =>
      `No ₪ rate for ${currencies.join(', ')} yet, sir — these figures are unconverted. Refresh prices.`,
    liveDegraded: (currencies) =>
      `Awaiting ${currencies.join(', ')} figures, sir — those accounts show their last saved balances.`,
    hide: 'HIDE, SIR',
    reveal: 'REVEAL, SIR',
    stampLive: 'live',
    stampHeld: 'held',
    stampHeldTitle:
      'No fresh quote or ₪ rate, sir — keeping the last saved value rather than writing a wrong one.',
    recentEntries: 'RECENT ENTRIES',
    trend: {
      rangeEmpty: (months) => `Not enough points in the last ${months} months, sir — two make a line.`,
      showAll: 'Show all',
    },
    spend: {
      underPace: 'UNDER PACE',
      overPace: 'AHEAD OF PACE',
      history: 'History',
      prevMonth: 'Previous month',
      nextMonth: 'Next month',
      oneOffs: (month) => `One-offs · ${month}`,
      total: (month) => `Total · ${month}`,
      oneOffsHint: 'One-off spends — groceries, fuel, dining… a refund goes in as a minus.',
      dateLabel: 'Date',
      amountMissing: 'amount?',
      fixRows: (n) =>
        n === 1
          ? 'One row has a name but no amount, sir — give it one, or strike the row.'
          : `${n} rows have a name but no amount, sir — give them one, or strike them.`,
      noMinus: 'A minus belongs on a one-off row, sir — the budget and the card total only run forwards.',
    },
    addBalances: 'Update balances',
    addSpend: 'Log a spend',
    paydayMarker: 'Payday',
    settings: {
      title: 'The Ledger',
      paydayLabel: 'Payday',
      paydayBlurb:
        'The day the pay lands, sir — a marker takes that day on the Manor, and I shall mind the snapshot.',
      paydayOff: 'No marker',
      privacyLabel: 'Privacy',
      privacyBlurb: 'Blur the figures until hovered — for reading the Ledger in company.',
      autoRefreshLabel: 'Prices on open',
      autoRefreshBlurb:
        'Fetch fresh quotes whenever the Ledger opens. The free tier allows 8 calls a minute, 800 a day.',
    },
  },
  backup: {
    notExportFile: 'Not a Majordomo export file.',
    estate: {
      exportItem: 'Export the estate…',
      importItem: 'Import an estate…',
      importTitle: 'IMPORT AN ESTATE',
      importBlurb:
        'The whole household in one file, sir — every wing. Nothing on this device survives it.',
      carries: 'THE FILE CARRIES',
      takenOn: (when) => `taken ${when}`,
      chooseFile: 'CHOOSE A FILE',
      confirmTitle: 'Replace the estate, sir?',
      confirmBody: (stores) =>
        `${stores} on this device will be written over. The estate in the file takes their place.`,
      confirmYes: 'Import it',
      restored: 'The estate is restored, sir.',
    },
  },
  settings: {
    groupEstate: 'THE ESTATE',
    groupGrounds: 'THE GROUNDS',
    clearWorkouts: 'Clear the workout log…',
    clearWorkoutsTitle: 'Clear the workout log, sir?',
    clearWorkoutsBody: (n) =>
      `All ${n} workout${n === 1 ? '' : 's'} on this device are struck. The other wings keep their records.`,
    clearWorkoutsYes: 'Clear the log',
  },
}
