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
    subtitle: 'each wing, in its own numbers',
    rowLabel: {
      manor: 'booked of 168 h',
      watch: 'worked',
      grounds: 'workouts',
      study: 'studied',
      capital: 'budget left',
      capitalSpent: 'spent this month',
    },
    signal: {
      dutyLoad: 'DUTY LOAD · 8 WEEKS',
      readiness: 'READINESS',
      examRunway: 'NEXT EXAM',
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
  },
  appName: 'Majordomo',
  wordmark: { lead: 'MAJORDOMO', accent: '' },
  skinPickerBlurb: 'Three looks for the same app. Switches instantly. Nothing else changes.',
  storageWarning: 'Your browser is blocking storage (private mode?). Nothing will survive a reload.',
  presetLabel: 'PRESET',
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
      colSets: 'sets · this week',
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
    loggedBlockTitle: ({ ppl, run }) =>
      run ? 'Run' : ppl ? { push: 'Push', pull: 'Pull', legs: 'Legs' }[ppl] : 'Training',
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
    weekTitle: 'This week',
    goalMet: "You've hit this week's goal.",
    goalRemaining: (n) => `${n} more to hit this week's goal.`,
    slackingTitle: 'Below your usual',
    slackingDetail: ({ group, thisWeek, baseline }) =>
      `${group}: ${Math.round(thisWeek)} this week, usually ${Math.round(baseline)}`,
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
    mapIdleVolume: 'Weekly volume vs your targets',
    deloadTitle: 'Deload check',
    deload: ({ count, muscles }) =>
      `${count} muscles have had too much this week (${muscles}). A lighter session or an extra rest day would settle them.`,
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
      detail: ({ awaiting, dueCount, syllabusPct, syllabusSubject, nextSession }) => {
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
        if (nextSession) {
          parts.push(`${nextSession.dayLabel}'s block is ${nextSession.subject}.`)
        }
        return parts.join(' ')
      },
    },
  },
  kinds: {
    shift: 'THE WATCH',
    sleep: 'SLEEP',
    training: 'THE GROUNDS',
    study: 'THE STUDY',
    marker: 'THE LEDGER',
  },
  modules: {
    watch: { name: 'THE WATCH', tagline: 'Shifts · hours · next up' },
    training: { name: 'THE GROUNDS', tagline: 'Workouts · recovery · food' },
    study: { name: 'THE STUDY', tagline: "Subjects · topics · what's due" },
    capital: { name: 'THE LEDGER', tagline: 'Net worth · markets · budget' },
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
            ? `${sentence(shape)}, with ${hrs(pencilledH)} blocked out for sleep.`
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
              ? `, plus ${hoursWord(sleepH)} ${plural(Math.round(sleepH), 'hour', 'hours')} of sleep blocked out after them`
              : ''
          parts.push(`${sentence(shape)} this week${withSleep}.`)
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
    },
    vaultEmpty:
      'No balances yet. Add your accounts, then save a snapshot to start tracking your net worth.',
    fxMissing: (currencies) =>
      `No ₪ rate for ${currencies.join(', ')} yet. These figures aren't converted. Try refreshing prices.`,
    liveDegraded: (currencies) =>
      `Still waiting on ${currencies.join(', ')} figures. Those accounts show their last saved balance.`,
    hide: 'HIDE',
    reveal: 'REVEAL',
    stampLive: 'live',
    stampHeld: 'held',
    stampHeldTitle:
      'No fresh quote or ₪ rate. Keeping the last saved value rather than writing a wrong one.',
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
  settings: {
    title: 'SETTINGS',
    close: 'Close',
    groupAppearance: 'APPEARANCE',
    groupGuidance: 'HELP & TIPS',
    groupAccount: 'YOUR ACCOUNT',
    groupEstate: 'YOUR RECORDS',
    groupGrounds: 'THE GROUNDS',
    themeLabel: 'Theme',
    weekStartLabel: 'Week starts on',
    weekStartBlurb: 'Every calendar and weekly total in the app follows this.',
    weekSun: 'Sunday',
    weekMon: 'Monday',
    rerunBlurb: 'Run the intro and the setup questions again, from the start.',
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
        'Majordomo puts your whole life on one calendar — work, training, study, money. One week, all of it in view.',
        'Each part gets its own wing: the Watch for work shifts, the Grounds for training, the Study for coursework, the Ledger for money. All four write to the same week.',
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
        'Each muscle is coloured by what it’s still carrying — hot where the work landed, cooling over days. Tap one for its own reading. The toggle swaps recent strain for this week’s volume.',
      ledger:
        'The body map as a table: each muscle’s strain next to its estimated hard sets this week, for when you want the number and not the colour.',
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
      summary:
        'The day in one paragraph: what your body is carrying, what the week still wants from you, and what to eat for it.',
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
