import type { VoicePack } from '../types'

/** The Majordomo — the commercial voice. Dry, composed, quietly satisfied. */
export const majordomoPack: VoicePack = {
  appName: 'Majordomo',
  wordmark: { lead: 'MAJORDOMO', accent: '' },
  skinPickerBlurb: 'Three presets, one house. Switches instantly — nothing else changes.',
  storageWarning: "Browser storage is blocked (private mode?) — nothing will survive a reload.",
  presetLabel: 'PRESET',
  manor: {
    name: 'THE MANOR',
    empty: 'Nothing on the books, sir. A rare quiet evening.',
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
    occupied: 'That hour is already spoken for, sir.',
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
    whatIf: {
      button: '⧉ WHAT-IF',
      banner: 'The ledger is sandboxed, sir. Nothing binds until you apply.',
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
    scheduledTitle: 'On the books',
    scheduledNote: 'Booked on the Manor, sir — move or remove them there.',
    recoveryTitle: 'RECOVERY',
    settles: ({ day, time }) => `settles ${day} ${time}`,
    fulfils: ({ day }) => {
      const d = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day
      return `This fulfils ${d}'s block, sir.`
    },
    fulfilledTag: 'LOGGED',
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
    post: 'POST A WATCH',
    weekList: "THIS WEEK'S WATCHES",
    dayShift: 'Day',
    nightShift: 'Night',
    duplicate: 'There is already a watch that day, sir.',
    posted: 'On the books, sir.',
    postedWithSleep: 'On the books, sir — sleep is pencilled for the morning after.',
    note: 'Every watch posted here takes its place in the Manor at once, sir.',
    openManor: 'Open the Manor →',
    status: { logged: 'LOGGED', next: 'NEXT', ahead: 'AHEAD' },
  },
  capital: {
    vaultEmpty:
      "No balances yet. Add your accounts, then log a snapshot to start charting the estate's worth.",
    fxMissing: (currencies) =>
      `No ₪ rate for ${currencies.join(', ')} yet, sir — these figures are unconverted. Refresh prices.`,
    hide: 'HIDE, SIR',
    reveal: 'REVEAL, SIR',
    stampLive: 'live',
    stampHeld: 'held',
    stampHeldTitle:
      'No fresh quote or ₪ rate, sir — keeping the last saved value rather than writing a wrong one.',
    recentEntries: 'RECENT ENTRIES',
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
    clearWorkouts: 'Clear the workout log…',
    clearWorkoutsTitle: 'Clear the workout log, sir?',
    clearWorkoutsBody: (n) =>
      `All ${n} workout${n === 1 ? '' : 's'} on this device are struck. The other wings keep their records.`,
    clearWorkoutsYes: 'Clear the log',
  },
}
