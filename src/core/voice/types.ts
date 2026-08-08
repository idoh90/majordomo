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
/** one figure on a briefing strip: a micro-label and the number under it */
export interface BriefingChip {
  label: string
  value: string
}

/** what the Watch knows about its own week when it reports in */
export interface WatchBriefingFacts {
  doneH: number
  expectedH: number
  /** watches this week that have already ended */
  logged: number
  /** watches this week still to come */
  remaining: number
  nights: number
  days: number
  /** recovery sleep pencilled after this week's nights */
  sleepH: number
  /** the next watch anywhere ahead, with time until it begins */
  next: { dayLabel: string; night: boolean; h: number; m: number } | null
  /** duty hours in each of the last several weeks, oldest first, this week last */
  weeklyH: number[]
  /** watches booked beyond this week */
  aheadCount: number
  /** …of which this many fall in next week */
  nextWeekCount: number
}

export interface GroundsBriefingFacts {
  done: number
  goal: number
  hot: number
  muscles: number
  /** the hottest muscle right now, if anything is warm */
  top: { name: string; strain: number } | null
  readiness: { score: number; band: 'fresh' | 'ready' | 'worn' | 'spent' }
  kcal: number
  protein: number
  meals: number
  isTrainingDay: boolean
  /** the next training block booked on the Manor */
  nextBlock: { title: string; dayLabel: string } | null
  blocksAhead: number
}

export interface StudyBriefingFacts {
  fulfilledH: number
  bookedH: number
  goalH: number
  /** hours DONE before the exam vs hours still SCHEDULED before it — two
   *  different questions, and answering one with the other is the M-03 bug */
  exam: { subject: string; days: number; doneH: number; aheadH: number } | null
  awaiting: number
  dueCount: number
  syllabusPct: number | null
  /** which syllabus the percentage is of — null means every subject at once,
   *  and the line must say so rather than imply one */
  syllabusSubject: string | null
  nextSession: { subject: string; dayLabel: string } | null
}

export interface CapitalBriefingFacts {
  /** money arrives pre-formatted — the ₪ formatter lives in the wing */
  netWorth: string
  /** null when there is no basis to compare against, and then the clause is dropped */
  delta: { amount: string; up: boolean; basis: string } | null
  spent: string
  budget: string
  left: string
  over: boolean
  hasBudget: boolean
  dayOfMonth: number
  daysInMonth: number
  /** the honest daily figure: fixed costs spread flat, variable over days elapsed */
  perDay: string | null
  /** Σ this month's fixed commitments, or null when nothing recurs */
  fixed: string | null
  underPace: boolean
  portfolio: {
    value: string
    dayPL: string
    dayUp: boolean
    unrealized: string
    unrealUp: boolean
  } | null
}

export interface HouseRowFacts {
  figure: string
  delta: number | null
}

export interface VoicePack {
  /** THE HOUSE — the cross-wing rail every wing carries */
  house: {
    title: string
    /** load-bearing: it licenses each row to show its OWN headline metric
     *  rather than one normalised number nobody would recognise */
    subtitle: string
    /** what each row's figure means, in that wing's own terms. `capitalSpent`
     *  replaces `capital` when no budget is set — the figure is then what has
     *  gone out, not what is left of a target that does not exist. */
    rowLabel: Record<
      'manor' | 'watch' | 'grounds' | 'study' | 'capital' | 'capitalSpent',
      string
    >
    /** the wing's own signal card, shown only on that wing */
    signal: {
      dutyLoad: string
      readiness: string
      examRunway: string
      burnRate: string
      /** each signal's one composed line */
      dutyLoadLine: (v: { thisWeek: number; avg: number }) => string
      readinessLine: (v: { score: number; band: string; limiter: string | null }) => string
      examRunwayLine: (v: { subject: string; days: number; bookedH: number }) => string
      burnRateLine: (v: { perDay: string; prevPerDay: string | null }) => string
      /** nothing to draw yet */
      idle: string
    }
    pattern: {
      title: string
      lines: {
        trainAfterWatch: (v: { title: string; mins: number; before: boolean }) => string
        studyUntouched: (v: { subject: string }) => string
        none: string
      }
      /** the single remedy the card offers */
      action: string
    }
  }
  /** the briefing strip every wing renders */
  briefing: {
    /** scope label prefix: "THE BRIEFING · THE WATCH" */
    label: string
    expand: string
    collapse: string
  }
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
  /** shared UI primitives (core/ui) — copy a wing must not have to supply */
  ui: {
    /** a Sheet asked to close while its draft differs from the store */
    discard: { title: string; body: string; confirm: string }
  }
  manor: {
    /** the home tab label */
    name: string
    /** caption above an empty week's grid — the structure stays, the voice shrinks */
    empty: string
    /** desktop nav-row control mirroring the mobile tab bar's + */
    quickAddLabel: string
    /** popover note on an event whose end lands past midnight */
    crossesMidnight: string
    /** footnote under the month view */
    monthNote: string
    /** briefing-strip line for a week with `count` watches */
    briefing: (count: number) => string
    /** briefing-strip stat readout */
    briefingStat: (v: { watchH: number; trainingCount: number; studyH: number }) => string
    /**
     * The strip is mixed-scope BY DESIGN: greeting, week line and stats follow
     * the VIEWED week, while the heads-up prose is now-relative (paging the
     * calendar must not change what the butler knows). These two tags say
     * which is which, so a now-relative line stops reading as a claim about
     * the grid on screen.
     */
    briefingScope: {
      /** tags the now-relative heads-up block */
      now: string
      /** marks the strip when the viewed week is not the current one */
      viewing: string
    }
    /** drag refused: the block began before the viewed week, so it has no
     *  column here to be moved from */
    anchoredEarlier: string
    /** quick-add's free-form escape hatch, past the one-tap templates */
    custom: {
      /** the row that opens the mini-form */
      row: string
      kindLabel: string
      book: string
      /** back to the one-tap templates */
      back: string
      /** shown against a template that cannot fit the chosen slot */
      wontFit: string
    }
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
    /** mobile quick-add sheet: title + the footer line when the slot is free */
    quickAddTitle: string
    slotClear: string
    /** banner while placing a move by tap (the mobile MOVE flow) */
    movePlace: string
    /** the drag escape strip */
    releaseCancel: string
    /** drop toast carrying the landing time */
    movedTo: (time: string) => string
    /** toast after dragging a block's end edge changed how long it runs */
    resized: (v: { hours: string; longer: boolean }) => string
    /** tooltip on the grip at a block's end edge */
    resizeHandle: string
    /** ▲ line on a training event booked hard by a watch. `before` = the
     *  session ends `mins` minutes before the watch begins; otherwise it
     *  begins `mins` minutes after the watch ends. */
    nearWatchLine: (v: { mins: number; before: boolean }) => string
    /** confirm dialog for a move that would train near a watch */
    nearWatchTitle: string
    nearWatchBody: string
    /** mobile event sheet */
    eventSheet: {
      move: string
      edit: string
      /** edit sheet heading + field labels + CTA */
      editTitle: string
      titleLabel: string
      startLabel: string
      durationLabel: string
      save: string
      /** "Open in THE GROUNDS →" — wing name comes from modules.*.name */
      openIn: (wing: string) => string
    }
    /** mobile month legend labels */
    monthLegend: { runsPast: string; strain: string }
    /**
     * Quick-add templates (title copy is pack content). ONE list, read by both
     * the desktop popover and the mobile sheet — so making these user-editable
     * rituals later means changing where this array comes from, and nothing
     * else. Kept a plain array for exactly that reason.
     */
    templates: { kind: 'shift' | 'training' | 'study' | 'sleep'; title: string; hours: number }[]
    strain: {
      /** tooltip on a day's strain bar. `names` = muscles still hot at that
       *  day's worst moment (hottest first, may be empty); `forecast` = the day
       *  hasn't started yet, so the soreness is predicted, not logged. */
      tooltip: (v: { names: string[]; forecast: boolean }) => string
    }
    /** the butler's briefing: greetings + contextual heads-up lines. Prose,
     *  not notifications — no dismissal, they expire with their condition.
     *  Voice bible: dry, at most one sentence-final "sir", never begs. */
    headsUp: {
      /** the 1st of the month */
      monthGreeting: (month: string) => string
      /** the week-start day (weekday name per the weekStart setting) */
      weekGreeting: (day: string) => string
      /** a training block passed with nothing logged against it */
      unfiledWorkout: (v: { day: string }) => string
      /** an exam inside a week with no study booked for its subject */
      examUnbooked: (v: { subject: string; days: number }) => string
      /** Thu/Fri and next week carries no watches yet */
      nextWeekWatches: string
      /** week-start day and the week is nearly empty */
      weekPlan: string
      /** payday passed, no snapshot this month yet */
      snapshotNudge: string
      /** a night watch starts this evening */
      nightTonight: string
      /** past study sessions still awaiting their report */
      awaitingReport: (n: number) => string
      /** weekly training goal short with the week nearly over */
      goalBehind: (v: { done: number; goal: number }) => string
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
      /** drawer note when a rehearsed training block sits near a watch */
      conflict: (v: { title: string; mins: number; before: boolean }) => string
    }
  }
  watch: {
    onDuty: string
    nextWatch: string
    /** mobile header pill: time until the next watch begins */
    nextIn: (v: { h: number; m: number }) => string
    /** NEXT WATCH panel: nothing booked anywhere ahead */
    noneAhead: string
    /** THIS WEEK'S WATCHES: empty for THIS WEEK — which is a different claim,
     *  and using noneAhead here denied watches that were plainly booked */
    noneThisWeek: string
    post: string
    weekList: string
    /** the duty ring with nothing expected — a setup state, not a 0.0/0.0 score */
    ringIdle: string
    /** heading for watches beyond this calendar week */
    aheadList: string
    /** their one-line summary beside THIS WEEK'S WATCHES */
    aheadSummary: (v: { count: number; hours: number }) => string
    /** the shapes seeded on a first run — data once written, not live copy */
    starters: { day: string; night: string; nineToFive: string; evening: string }
    /** the flyout's escape hatch into a one-off watch */
    customChip: string
    /** the affordance onto the shape list */
    manage: string
    /** title of a custom watch the user chose not to keep as a shape */
    customEventTitle: string
    /** title of the recovery block pencilled after a cross-midnight watch */
    sleepTitle: string
    posted: string
    postedWithSleep: string
    /** posted, but lying over sleep the estate had pencilled in */
    postedOverSleep: string
    /** refused: it would lie over a watch already on the books */
    overlap: string
    /** the shape editor — custom posts and the shape list share these */
    sheet: {
      customTitle: string
      manageTitle: string
      startLabel: string
      endLabel: string
      hoursLine: (h: number) => string
      /** shown when the end time wraps past midnight — never left implied */
      nextDay: string
      /** end equals start: no watch at all, and a 24 h one can't be typed */
      invalid: string
      keep: string
      nameLabel: string
      namePlaceholder: string
      post: string
      newTemplate: string
      save: string
      cancel: string
      empty: string
      deleteTitle: string
      deleteBody: (name: string) => string
      deleteYes: string
    }
    toast: { kept: string; amended: string; retired: string; nameFirst: string }
    note: string
    openManor: string
    status: { logged: string; next: string; ahead: string }
    /** THIS WEEK'S WATCHES has a FURTHER AHEAD section whether or not anything
     *  is in it — a heading that vanishes reads as "there is nothing to know" */
    aheadNone: string
    /** the fortnight band under POST A WATCH */
    bandNote: string
    /** THE CYCLE — the shape of the week's duty */
    cycle: {
      title: string
      nights: string
      days: string
      pencilled: string
      turnaround: string
      /** the week's 168 hours, split three ways */
      onDuty: string
      own: string
      splitTitle: string
      /** nothing on the books this week */
      empty: string
      line: (v: {
        nights: number
        days: number
        pencilledH: number
        turnaroundH: number | null
        ownH: number
      }) => string
    }
    briefingPanel: {
      chips: (v: WatchBriefingFacts) => BriefingChip[]
      headline: (v: WatchBriefingFacts) => string
      detail: (v: WatchBriefingFacts) => string
    }
  }
  grounds: {
    /** THE MUSCLE LEDGER — the body map's data twin */
    ledger: {
      title: string
      /** label on the how-many-are-hot tile, and its figure */
      hotNow: string
      hotNowValue: (v: { hot: number; total: number }) => string
      /** column headings — the sets column MUST name its window, or a row
       *  reading "strain 10.0" beside "—" looks like a contradiction */
      colStrain: string
      colSets: string
      /** estimated hard sets for one muscle this week */
      sets: (n: number) => string
      /** heading over the short list the panel folds down to on a phone */
      peak: string
      /** the fold control: word on the button, then what pressing it does */
      expandLabel: (total: number) => string
      collapseLabel: string
      expandHint: string
      collapseHint: string
      /** the short list has nothing to rank — every muscle reads cold */
      allCold: string
      /** the standing caveat: the app logs sessions, not sets, and runs feed
       *  strain without counting toward lifting volume */
      note: string
    }
    briefingPanel: {
      chips: (v: GroundsBriefingFacts) => BriefingChip[]
      headline: (v: GroundsBriefingFacts) => string
      detail: (v: GroundsBriefingFacts) => string
    }
    /** card of upcoming training sessions booked on the Manor */
    scheduledTitle: string
    /** footnote under the list */
    scheduledNote: string
    /** recovery card: title + per-muscle settle line */
    recoveryTitle: string
    settles: (v: { day: string; time: string }) => string
    /** line over the save button naming the booked block the session will fulfil */
    fulfils: (v: { day: string; time: string }) => string
    /** the same slot once the user has aimed the session at no block at all */
    fulfilsNothing: string
    /** tap affordance on that line when several blocks are in range */
    fulfilsChange: string
    /** the opt-out row of the block picker */
    fulfilsNoBlock: string
    /** dim tag on a booked block that already has a workout linked */
    fulfilledTag: string
    /** title of the Manor block drawn from a logged session that answered no
     *  booking — the Grounds' own projection onto the week */
    loggedBlockTitle: (v: { ppl: 'push' | 'pull' | 'legs' | null; run: boolean }) => string
    /** run step: the pace read-out, its walking-pace floor, and the hint */
    runPace: (v: { pace: string }) => string
    runPaceWalking: string
    runOptional: string
    /** weekly-goal card + its dialog */
    weekTitle: string
    goalMet: string
    goalRemaining: (n: number) => string
    slackingTitle: string
    slackingDetail: (v: { group: string; thisWeek: number; baseline: number }) => string
    goalDialogTitle: string
    goalDialogBody: string
    goalPerWeek: string
    goalNone: string
    /** fuel card: title, day chips, and the rotating diet notes */
    fuelTitle: string
    fuelTrainingDay: string
    fuelRestDay: string
    fuelTips: string[]
    /** history with nothing in it — the prompt differs by where the button is */
    historyEmptyTitle: string
    historyEmptyMobile: string
    historyEmptyDesktop: string
    /** body map: the idle info line per mode, and the over-volume hint */
    mapIdleStrain: string
    mapIdleVolume: string
    deloadTitle: string
    deload: (v: { count: number; muscles: string }) => string
    /** most-trained chart — lifting only, so it says so */
    topMusclesTitle: string
    topMusclesNote: string
    topMusclesEmpty: string
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
    /** THE SUBJECT LEDGER — fulfilled against booked against the goal */
    subjectLedger: {
      title: string
      fulfilledTag: string
      bookedTag: string
      goalTag: string
      /** one subject's week, stated so the three figures cannot be confused */
      row: (v: { fulfilled: number; booked: number; goal: number }) => string
      /** a subject carrying no weekly goal has no track to fill */
      noGoal: string
      empty: string
    }
    briefingPanel: {
      chips: (v: StudyBriefingFacts) => BriefingChip[]
      headline: (v: StudyBriefingFacts) => string
      detail: (v: StudyBriefingFacts) => string
    }
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
    briefingPanel: {
      chips: (v: CapitalBriefingFacts) => BriefingChip[]
      headline: (v: CapitalBriefingFacts) => string
      detail: (v: CapitalBriefingFacts) => string
    }
    /** Vault empty state — no accounts/snapshots yet */
    vaultEmpty: string
    /** FX rate missing for these currencies — their figures render unconverted */
    fxMissing: (currencies: string[]) => string
    /** the Vault's caveat: priced accounts fell back to their last saved balance
     *  because these currencies lack a quote or a ₪ rate */
    liveDegraded: (currencies: string[]) => string
    /** blur-toggle pill labels: action to take (hide when shown, reveal when hidden) */
    hide: string
    reveal: string
    /** snapshot sheet: a priced account stamped from live quotes… */
    stampLive: string
    /** …or held at its last saved value because quotes/₪ rate are missing */
    stampHeld: string
    stampHeldTitle: string
    /** recent one-off spends card title */
    recentEntries: string
    /** the 10-day P/L covers only the positions whose history actually arrived */
    tenDayPartial: (covered: number, positions: number) => string
    /** the portfolio total omits rows with no ₪ rate — it cannot sum currencies */
    totalsPartial: (currencies: string[]) => string
    /** the net-worth trend chart */
    trend: {
      /** the selected range holds fewer than two points — say so, don't widen it */
      rangeEmpty: (months: number) => string
      showAll: string
    }
    /** the spending sheet, month by month */
    spend: {
      /** the pace chip beside the bar: spend-so-far against what the month
       *  ought to have claimed by now — fixed costs in full plus the elapsed
       *  share of the rest. A comparison of two fractions, never a projection */
      underPace: string
      overPace: string
      /** the spend card's legend: names the bar's muted fixed slice, then the
       *  variable side and the days it accrued over */
      fixedWord: string
      variableOverDays: (days: number) => string
      /** the recurring section's hint — why a fixed cost is not "spent on the 1st" */
      recurringHint: string
      /** the spend card's affordance onto the sheet's month pager */
      history: string
      /** month pager arrows */
      prevMonth: string
      nextMonth: string
      /** one-off items section title / the viewed month's total */
      oneOffs: (month: string) => string
      total: (month: string) => string
      /** one-off section hint — says how a refund goes in */
      oneOffsHint: string
      /** per-row date control */
      dateLabel: string
      /** a row carries a name but no amount: inline marker + the blocked-Save note */
      amountMissing: string
      fixRows: (n: number) => string
      /** budget + card snapshot are forward-only totals, so a minus is refused there */
      noMinus: string
    }
    /** the mobile + action sheet rows */
    addBalances: string
    addSpend: string
    /** title of the allDay payday marker on the Manor */
    paydayMarker: string
    /** the Ledger settings sheet (grown from the API-key sheet) */
    settings: {
      title: string
      paydayLabel: string
      paydayBlurb: string
      paydayOff: string
      privacyLabel: string
      privacyBlurb: string
      autoRefreshLabel: string
      autoRefreshBlurb: string
    }
  }
  backup: {
    /** import rejected: wrong app tag */
    notExportFile: string
    /** the estate backup — every wing's store in one file */
    estate: {
      /** gear menu items */
      exportItem: string
      importItem: string
      /** import sheet */
      importTitle: string
      /** blurb under the title */
      importBlurb: string
      /** the file's stores, listed before it lands */
      carries: string
      takenOn: (when: string) => string
      chooseFile: string
      /** confirm dialog before overwriting */
      confirmTitle: string
      confirmBody: (stores: string) => string
      confirmYes: string
      /** after a successful import (the app reloads on the spot) */
      restored: string
    }
  }
  /** the registry — one account, and the estate follows between devices */
  sync: {
    /** gear menu: the door, signed out vs signed in */
    connectItem: string
    accountItem: string
    /** gear menu, in place of the door, when ?demo has disarmed the registry */
    demoNote: string
    /** the sheet */
    title: string
    blurb: string
    /** while the door works but the carrying does not — retire when push lands */
    notYet: string
    google: string
    working: string
    signedInAs: (email: string) => string
    signOut: string
    /** sign-out must say plainly what it does NOT take away */
    signOutBlurb: string
    /** leave the login screen — it is a door, not a wall */
    close: string
    /** the door is shut, and the reason is the user's to see */
    offDemo: string
    offStorage: string
    offUnconfigured: string
    /** the registry did not answer at all — dead host, or no connection. Said
     *  BEFORE the redirect, so the user never lands on a browser error page.
     *  Reads as the tail of `failed()`, which supplies the lead clause. */
    unreachable: string
    failed: (why: string) => string
    /* --- carrying --- */
    /** the header button and its label */
    syncNow: string
    carrying: string
    /** n records queued but not yet carried — the honest number */
    waiting: (n: number) => string
    upToDate: string
    lastCarried: (when: string) => string
    neverCarried: string
    /** a different account signed in on a device that already had an owner */
    otherOwner: string
    /* --- the carrying section, and the two one-way replacements --- */
    section: string
    autoOn: string
    /** two populated estates meeting for the first time */
    choiceTitle: string
    choiceBody: (local: number, cloud: number) => string
    choiceMerge: string
    choiceMergeHint: string
    /** the registry wins; this device is replaced */
    takeCloud: string
    takeCloudHint: string
    takeCloudTitle: string
    takeCloudBody: string
    takeCloudYes: string
    /** this device wins; the registry is replaced, everywhere */
    takeLocal: string
    takeLocalHint: string
    takeLocalTitle: string
    takeLocalBody: string
    takeLocalYes: string
  }
  settings: {
    /** the settings screen itself */
    title: string
    close: string
    /** section headings: the estate's own settings vs the Grounds' own, which
     *  sat in one flat list where a workout export read as an estate concern */
    groupAppearance: string
    groupGuidance: string
    groupAccount: string
    groupEstate: string
    groupGrounds: string
    /** appearance */
    themeLabel: string
    weekStartLabel: string
    weekStartBlurb: string
    weekSun: string
    weekMon: string
    /** guidance */
    rerunBlurb: string
    /** the estate backup pair */
    exportBlurb: string
    /** the Grounds' own rows */
    profileLabel: string
    profileBlurb: string
    exportWorkouts: string
    exportWorkoutsBlurb: string
    copyWorkouts: string
    copied: string
    importWorkouts: string
    /** gear menu item: strike the workout log (and ONLY the workout log) */
    clearWorkouts: string
    clearWorkoutsTitle: string
    /** confirm body — must say the other wings keep their records */
    clearWorkoutsBody: (n: number) => string
    /** the same, signed in: "on this device" stops being true */
    clearWorkoutsBodySynced: (n: number) => string
    clearWorkoutsYes: string
  }
  /**
   * The first-time setup — the butler, scripted.
   *
   * The stages below are named after the Bell's concierge script (assistant
   * spec §3.4) on purpose: when the summonable butler can run the interview
   * himself, the ENGINE changes and this script does not. Every stage is
   * skippable in one tap, so no line here may pressure — it offers, it does
   * not ask twice.
   */
  onboarding: {
    welcome: {
      /** who is speaking, and what he keeps */
      intro: string
      /** how long this takes, and that none of it is compulsory */
      promise: string
      /** under the registry button — the strongest nudge the door is allowed */
      googleHint: string
      /** the equal, offline path */
      localCta: string
      localHint: string
      /** decline the whole thing — the Manor's ghost structure picks it up */
      later: string
    }
    registry: {
      /** waiting for the estate to come down after the redirect */
      checking: string
      /** it came down populated: this is a returning user, not a new one */
      welcomeBack: string
      welcomeBackBody: string
      welcomeBackCta: string
      /** the registry never answered — fact, then remedy, then carry on */
      checkFailed: string
    }
    /**
     * The house presents itself — three beats before a single question is
     * asked, because "complicated as hell" begins with being asked to
     * configure a thing nobody has explained. Exactly three: what it is,
     * how the wings work, whose it is.
     */
    intro: {
      lines: [string, string, string]
    }
    /**
     * The butler takes the measure of the user before asking anything — which
     * concerns actually fill their week. Every question after this exists
     * only if its chip was picked; a student without a job is never asked
     * what shape their working day is.
     */
    composition: {
      title: string
      prompt: string
      chips: {
        shift: string
        dayJob: string
        training: string
        study: string
        money: string
      }
      /** under the chips: nothing picked is allowed, and what that means */
      hint: string
    }
    /** the setup panel's own furniture */
    chrome: {
      /** "1 OF 4" */
      step: (v: { n: number; of: number }) => string
      next: string
      skip: string
      back: string
    }
    work: {
      title: string
      prompt: string
      /** the day-job flavour of the same question — one shape, five taps */
      dayJobPrompt: string
      /** one-tap fill: Mon–Fri, this week and next */
      weekdaysCta: string
      /** says plainly that tapping a day POSTS it — the grid moves behind this */
      hint: string
      daysLabel: string
      /** the running tally under the day strip */
      posted: (n: number) => string
      /** only shown once a cross-midnight shape is picked */
      nightNote: string
    }
    training: {
      title: string
      prompt: string
      /** the optional fold — the silent default build made visible */
      profileLabel: string
      profileHint: string
      weightLabel: string
      weightUnit: string
      heightLabel: string
      heightUnit: string
      ageLabel: string
      ageUnit: string
      sexLabel: string
      sexMale: string
      sexFemale: string
    }
    study: {
      title: string
      prompt: string
      goalLabel: string
      add: string
      enrolled: (n: number) => string
      /** the same name again — a re-run of the setup must not double the roster */
      duplicate: string
      /** enrolling nothing is a real answer, and the line must not sulk */
      none: string
    }
    preset: {
      title: string
      prompt: string
    }
    /**
     * The walk: one stop per wing, three beats at each. `meaning` says what
     * the wing is FOR, `dashboard` narrates what is on screen (the sample,
     * when the room was dressed), `use` closes with how it is best used —
     * composed from the user's OWN choices wherever they made any.
     */
    walk: {
      /** small chip on the card while a dressed sample is on screen */
      sampleTag: string
      /** the honest footnote: this is for show, and it is swept on advance */
      sampleNote: string
      watch: {
        meaning: string
        dashboard: string
        use: (v: { count: number; next: { h: number; m: number } | null }) => string
      }
      grounds: {
        meaning: string
        dashboard: string
        use: (v: { goal: number }) => string
      }
      study: {
        meaning: string
        dashboard: string
        use: (v: { subjects: number }) => string
      }
      /** the Ledger still asks for nothing on a first run — its beats say so */
      ledger: {
        meaning: string
        dashboard: string
        use: string
      }
      skipRest: string
    }
    close: {
      line: string
      cta: string
    }
    /** the Manor with an empty estate and the interview declined */
    ghost: {
      line: string
      cta: string
    }
    /** the gear-menu row that runs the whole thing again */
    settingsRerun: string
  }
  /**
   * THE `?` MARKS — one line per panel saying what the thing is FOR.
   *
   * Every other string in this pack states a fact about the estate; these
   * state a fact about the HOUSE, and that difference sets their register.
   * They are instructions, not readings: present tense, no figures, no "sir"
   * (a room does not address anyone), and each answers the same question —
   * why would a person come to this panel, and what should they do with it.
   */
  hints: {
    /** the `?` button's accessible name */
    buttonLabel: string
    /** the gear-menu switch and its blurb */
    settingsToggle: string
    settingsBlurb: string
    /** the cross-wing furniture every screen carries */
    house: {
      rail: string
      signal: string
      pattern: string
      briefing: string
    }
    watch: {
      onDuty: string
      post: string
      week: string
      cycle: string
    }
    grounds: {
      bodyMap: string
      ledger: string
      weekGoal: string
      weekChart: string
      topMuscles: string
      scheduled: string
      recovery: string
      fuel: string
      calendar: string
      summary: string
    }
    study: {
      pending: string
      dossier: string
      readingWeek: string
      subjectLedger: string
      desk: string
      weekLedger: string
    }
    capital: {
      vault: string
      trend: string
      allocation: string
      accounts: string
      portfolio: string
      tenDay: string
      spend: string
      recent: string
    }
  }
}
