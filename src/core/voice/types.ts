/**
 * The VoicePack contract — the app's entire script lives in packs that
 * implement this shape. Parameterized lines are pack *functions* so
 * pluralization and word order live inside the pack; that is what makes a
 * Hebrew pack (or a persona pack) a content drop instead of a refactor.
 *
 * Register (playbook Appendix B): dry, composed, understatement over
 * exclamation. One "sir", sentence-final, at most once per message. Never
 * begs, never guilts, no emoji. Errors state fact + remedy.
 */
export interface VoicePack {
  /** product name — document.title, exports, about */
  appName: string
  /** masthead wordmark: `lead` first, `accent` rendered in the accent color
   *  (may be empty). Packs supply natural casing; headers uppercase via CSS. */
  wordmark: { lead: string; accent: string }
  /** one-liner under the "App skin" picker title */
  skinPickerBlurb: string
  /** blocked-localStorage banner */
  storageWarning: string
  /** tiny label beside the header's preset dots */
  presetLabel: string
  manor: {
    /** the home tab label */
    name: string
    /** empty-week state, the butler's line */
    empty: string
    /** popover note on an event whose end lands past midnight */
    crossesMidnight: string
    /** footnote under the month view */
    monthNote: string
    /** briefing-strip line for a week with `count` watches */
    briefing: (count: number) => string
    /** briefing-strip stat readout */
    briefingStat: (v: { watchH: number; trainingCount: number; studyH: number }) => string
    /** drop rejected: the target slot overlaps something */
    occupied: string
    /** drag ghost time-line when the slot is taken */
    occupiedShort: string
    /** move applied */
    moved: string
    /** undo applied */
    restored: string
    /** confirm dialog dismissed */
    asYouWere: string
    /** quick-add applied */
    onTheBooks: string
    /** event deleted from the popover */
    removed: string
    /** popover delete button */
    removeLabel: string
    /** cross-day move confirm dialog */
    moveTitle: string
    moveBody: (v: { title: string; from: string; to: string }) => string
    moveYes: string
    undoLabel: string
    /** quick-add templates (title copy is pack content) */
    templates: { kind: 'training' | 'study' | 'sleep'; title: string; hours: number }[]
    strain: {
      /** tooltip on a day's strain bar. `names` = muscles still hot at that
       *  day's worst moment (hottest first, may be empty); `forecast` = the day
       *  hasn't started yet, so the soreness is predicted, not logged. */
      tooltip: (v: { names: string[]; forecast: boolean }) => string
    }
    whatIf: {
      button: string
      banner: string
      panelTitle: string
      panelSub: string
      /** no changes yet */
      noteClean: string
      /** ghosts visible */
      noteDirty: string
      changes: (n: number) => string
      apply: string
      discard: string
      applied: string
    }
  }
  watch: {
    onDuty: string
    nextWatch: string
    noneAhead: string
    post: string
    weekList: string
    dayShift: string
    nightShift: string
    duplicate: string
    posted: string
    postedWithSleep: string
    note: string
    openManor: string
    status: { logged: string; next: string; ahead: string }
  }
  grounds: {
    /** card of upcoming training sessions booked on the Manor */
    scheduledTitle: string
    /** footnote under the list */
    scheduledNote: string
  }
  study: {
    /** rings hero card title */
    readingWeek: string
    /** hero subline: week range + fulfilled/booked totals */
    weekLine: (v: { from: string; to: string; fulfilled: number; booked: number }) => string
    /** under a ring's number when the subject has a goal */
    ringOfGoal: (goal: number) => string
    /** under a ring's number when the subject has none */
    ringNoGoal: string
    /** the "+n more" ring-row collapse button */
    more: (n: number) => string
    enrol: string
    mattersPending: string
    noExams: string
    /** days until an exam (today / tomorrow / in N days) */
    countdown: (days: number) => string
    hoursToward: (h: number) => string
    desk: string
    book: string
    awaiting: string
    noAwaiting: string
    /** unfiled quick-add row: label over the subject picker */
    fileUnder: string
    done: string
    partial: string
    skipped: string
    logIt: string
    strikeRest: string
    weekLedger: string
    noLedger: string
    status: {
      done: string
      partial: (h: number) => string
      skipped: string
      awaiting: string
      ahead: string
    }
    dossier: string
    weeklyGoal: string
    homework: string
    add: string
    syllabus: (name: string) => string
    syllabusPct: (v: { covered: number; total: number; pct: number }) => string
    addTopic: string
    addExam: string
    archive: string
    due: {
      done: string
      overdue: string
      today: string
      tomorrow: string
      on: (day: string) => string
    }
    sheet: {
      subject: string
      day: string
      start: string
      duration: string
      linkHomework: string
      noHomework: string
      note: string
      notePlaceholder: string
      name: string
      namePlaceholder: string
      weeklyGoal: string
      title: string
      hwPlaceholder: string
      examPlaceholder: string
      topicPlaceholder: string
      due: string
      noDate: string
      theDay: string
      addHomework: string
      addExam: string
      addTopic: (name: string) => string
      bookHintPast: string
      bookHintFuture: string
      goalZeroHint: string
      hwDueHint: string
      examHint: string
      ctaLog: string
      ctaBook: string
      ctaEnrol: string
      ctaHw: string
      ctaExam: string
      ctaTopic: string
      cancel: string
    }
    toast: {
      markedDone: string
      struck: string
      notedPartial: (h: number) => string
      restStruck: string
      logged: string
      onBooks: string
      enrolled: string
      hwAdded: (hasDue: boolean) => string
      hwDone: string
      hwUndone: string
      examNoted: string
      topicAdded: string
      archived: string
      filed: string
      nameFirst: string
      titleFirst: string
    }
    /** Manor marker-chip titles */
    markerHw: (title: string) => string
    markerExam: (title: string) => string
    /** archive confirm dialog */
    archiveTitle: string
    archiveBody: (name: string) => string
    archiveYes: string
    /** menu-tile labels */
    tileUntilExam: string
    tileWeekRead: string
    /** briefing line, in priority order: exam → homework due → weekly standing */
    briefingExam: (v: { subject: string; days: number; hours: number }) => string
    briefingHomework: (n: number) => string
    briefingWeek: (v: { fulfilled: number; goal: number }) => string
  }
  /** wing chip labels per event kind */
  kinds: {
    shift: string
    sleep: string
    training: string
    study: string
    marker: string
  }
  modules: {
    watch: { name: string; tagline: string }
    training: { name: string; tagline: string }
    study: { name: string; tagline: string }
    capital: { name: string; tagline: string }
  }
  capital: {
    /** Vault empty state — no accounts/snapshots yet */
    vaultEmpty: string
    /** FX rate missing for these currencies — their figures render unconverted */
    fxMissing: (currencies: string[]) => string
  }
  backup: {
    /** import rejected: wrong app tag */
    notExportFile: string
  }
}
