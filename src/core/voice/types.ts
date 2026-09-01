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

/** The body map's volume bands, restated here because core may not import a
 *  console module. It must stay in step with VolumeStatus in
 *  modules/training/lib/volume.ts — the map passes one straight in as a key. */
export type VolumeBand = 'none' | 'under' | 'optimal' | 'pushing' | 'over'

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
  /** this week's sleep hours on the calendar, pencilled and slept alike —
   *  the Watch's own bookkeeping of the week's 168. THE NIGHT owns the
   *  question of how much was actually slept (core/sleep). */
  sleepH: number
  /** the next watch anywhere ahead, with time until it begins. `at` is its
   *  clock time — the Manor's brief prints that instead of the countdown, so
   *  the paragraph does not rewrite itself every minute. */
  next: { dayLabel: string; night: boolean; h: number; m: number; at: string } | null
  /** duty hours in each of the last several weeks, oldest first, this week last */
  weeklyH: number[]
  /** watches booked beyond this week */
  aheadCount: number
  /** …of which this many fall in next week */
  nextWeekCount: number
  /** the shortest gap between two of this week's watches, or null when there
   *  are fewer than two to sit between */
  turnaroundH: number | null
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
  /** the rest of the plate — the split DailySummary used to own alone */
  carbs: number
  fat: number
  /** hours since the last logged session, or null when nothing is logged yet */
  sinceLastH: number | null
  /** the least-strained group — what the body is actually offering today */
  coldest: string | null
  /** the train-next selector's top pick: a group both recovered and behind
   *  its trailing week — null when nothing qualifies. Sets and target are in
   *  the volume model's estimated-hard-set units. */
  trainNext: { group: string; sets: number; target: number } | null
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
  /** how many subjects are live on the books */
  subjectCount: number
  /** topics still uncovered on the syllabus the percentage is of */
  topicsLeft: number | null
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
  /** what a day may cost from here to month-end and still land inside the
   *  budget — null when there is no budget, nothing left, or no days left */
  allowancePerDay: string | null
  /** how many accounts the total is made of */
  accountCount: number
  /** the largest position, when every row could be converted to ₪ */
  topHolding: { symbol: string; value: string } | null
  portfolio: {
    value: string
    dayPL: string
    dayUp: boolean
    unrealized: string
    unrealUp: boolean
  } | null
}

export interface WorkshopBriefingFacts {
  fulfilledH: number
  bookedH: number
  goalH: number
  /** the nearest undone milestone anywhere on the shelf; days < 0 = overdue */
  milestone: { venture: string; title: string; days: number; towardH: number } | null
  awaiting: number
  ventureCount: number
  /** jobs struck against jobs hung, summed across every live venture — the
   *  shelf-wide total, so it cannot disagree with any one card's bar */
  tasks: { done: number; total: number } | null
  /** a bench timer is running right now */
  benchLive: { venture: string } | null
  /** the longest-untouched building venture, when it has been ≥ 7 quiet days */
  quiet: { venture: string; days: number } | null
  nextSession: { venture: string; dayLabel: string } | null
}

export interface HouseRowFacts {
  figure: string
  delta: number | null
}

/**
 * What THE NIGHT knows when it reports in.
 *
 * Every figure here is drawn from nights that were actually written down.
 * `covered7` is the honesty gate the clauses lean on: an average over two
 * nights is not a week, and the brief has to say which it is looking at.
 */
export interface SleepBriefingFacts {
  /** the most recent night on file, and how long ago it was */
  last: { hours: number; bed: string; wake: string; dayLabel: string; today: boolean } | null
  /** mean hours over the nights of the last seven that carry a record */
  avg7H: number
  covered7: number
  /** hours owed across the fortnight — 0 when nothing is short */
  debtH: number
  /** 0–100 steadiness of the body clock; null under three nights on file */
  regularity: number | null
  /** the spread of the nightly midpoint in minutes; null under three nights */
  driftMin: number | null
  targetH: number
  /** what sleep is doing to the Grounds' recovery clock right now */
  recovery: {
    applied: boolean
    /** how much slower recovery is running, as a percentage; 0 when not applied */
    pct: number
    covered: number
    needed: number
    couplingOn: boolean
  }
}

/* ---------------------------------------------------------------------------
   THE BRIEFING — the Manor's written brief and its instruments.

   The brief is ONE paragraph, composed of per-wing clauses. Each clause is an
   AREA the reader can switch off in the Pen, so every clause has to be a whole
   sentence that survives its neighbours being deleted — no clause may open
   with "and", none may refer to the one before it.
--------------------------------------------------------------------------- */

/** every wing's facts in one bag. A wing with nothing on file is null, and
 *  each of its areas then writes nothing rather than a sentence about zero. */
export interface BriefFacts {
  watch: WatchBriefingFacts | null
  sleep: SleepBriefingFacts | null
  grounds: GroundsBriefingFacts | null
  study: StudyBriefingFacts | null
  workshop: WorkshopBriefingFacts | null
  ledger: CapitalBriefingFacts | null
  /** local hour, 0–23 — the greeting's only input */
  hour: number
}

/** one switchable clause of the brief, in the order it is written */
export type BriefAreaId =
  | 'shifts'
  | 'sleep'
  | 'rest'
  | 'workouts'
  | 'muscles'
  | 'food'
  | 'bench'
  | 'study'
  | 'reports'
  | 'worth'
  | 'spending'

/**
 * What each instrument knows about itself when it writes its two lines. One
 * entry per dial, deliberately narrow — a dial that wants a new number adds a
 * field here and the pack sees it typed.
 */
export interface DialFactMap {
  bodyheat: {
    hot: number
    muscles: number
    top: string | null
    topStrain: number
    readiness: number
  }
  strain: { now: number; peak: number; peakLabel: string | null; hotLine: number }
  readiness: { now: number; avg: number; band: 'fresh' | 'ready' | 'worn' | 'spent' }
  volume: { now: number; avg: number }
  sessions: { now: number; goal: number; avg: number }
  watchhours: { doneH: number; expectedH: number; avg: number; remaining: number }
  sleep: { last: number | null; avg: number; target: number; covered: number; window: number }
  sleepdebt: { now: number; target: number; covered: number; window: number }
  sleepclock: {
    regularity: number | null
    driftMin: number | null
    usualBed: string | null
    usualWake: string | null
    covered: number
  }
  turnaround: { now: number | null; tightCount: number; tightLine: number }
  nights: { now: number; avg: number }
  studyhours: { now: number; goalH: number; avg: number }
  examclock: { subject: string; days: number; doneH: number; aheadH: number }
  homework: { now: number; open: number }
  bench: { now: number; goalH: number; milestone: { title: string; days: number } | null }
  networth: { value: string; delta: string | null; up: boolean; points: number }
  spending: {
    spent: string
    budget: string
    perDay: string | null
    under: boolean
    hasBudget: boolean
    day: number
    days: number
    allowance: string | null
  }
  worthmoves: { total: string; up: boolean; count: number }
  booked: { totalH: number; peakDay: string; peakH: number }
}

/** the instruments, by id */
export type DialId = keyof DialFactMap

/** an instrument's own two lines: the caption under its figure, and the
 *  italic note saying why the house put it on the board */
export interface DialCopy {
  headSub: string
  why: string
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
      'manor' | 'watch' | 'grounds' | 'study' | 'workshop' | 'capital' | 'capitalSpent',
      string
    >
    /** the wing's own signal card, shown only on that wing */
    signal: {
      dutyLoad: string
      readiness: string
      examRunway: string
      milestoneRunway: string
      burnRate: string
      /** each signal's one composed line */
      dutyLoadLine: (v: { thisWeek: number; avg: number }) => string
      readinessLine: (v: { score: number; band: string; limiter: string | null }) => string
      examRunwayLine: (v: { subject: string; days: number; bookedH: number }) => string
      milestoneRunwayLine: (v: { venture: string; title: string; days: number }) => string
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
    /** THE BRIEFING on the Manor — the written brief, its Pen, its dials */
    brief: {
      /** when the brief was written, and off what */
      stamp: (v: { time: string; day: string }) => string
      /** cut the typing short */
      skip: string
      /** the button that opens the Pen */
      penButton: string
      pen: {
        title: string
        sub: string
        close: string
        /** the footnote under the switches */
        note: string
        /** the one switch that is not a wing */
        counselLabel: string
        counselNote: string
      }
      /** what each switchable clause is called in the Pen */
      areaLabel: Record<BriefAreaId, string>
      /** the opening — morning, afternoon, evening, small hours */
      greeting: (hour: number) => string
      /** the sign-off: `quiet` when every clause wrote something, `silent`
       *  when the wings were all switched off or had nothing to say */
      closing: { quiet: string; silent: string }
      /** one clause of the brief; null when that wing has nothing to report */
      line: Record<BriefAreaId, (f: BriefFacts) => string | null>
      /** the advice that follows a clause, shown only with counsel on */
      counsel: Record<BriefAreaId, (f: BriefFacts) => string | null>
      /** the instruments strip */
      instruments: { title: string; sub: string }
      /** the dial shelf under the cards */
      shelf: {
        title: string
        /** resting note: how the shelf works */
        note: string
        /** …while a chip is picked up and waiting for a card */
        picking: (label: string) => string
        /** the overlay on each card while a chip is picked up */
        place: (label: string) => string
        replaces: (cat: string) => string
      }
      /** nothing on file anywhere — no dials to draw */
      noDials: string
      /** what each instrument is called, and the two lines it writes */
      dialName: Record<DialId, string>
      dial: { [K in DialId]: (f: DialFactMap[K]) => DialCopy }
      /** the caption under each instrument, between its first and last point */
      dialRange: Record<DialId, string>
    }
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
  /** the mobile bar's overflow tab, holding the wings past the fourth */
  wingsTab: string
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
    /** quick-add's bench row — booking an hour against a Workshop venture
     *  without leaving the week. Hidden when the shelf is empty. */
    bench: {
      row: string
      ventureLabel: string
      book: string
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
    /** the QUICK ADD panel, which asks for the slot before the activity —
     *  the start-hour row borrows eventSheet.startLabel rather than spelling
     *  the same word twice */
    quickAdd: {
      /** the row of seven day chips */
      dayLabel: string
      /** accessible name for the date field that reaches other weeks */
      dateLabel: string
      /** note under the chips once they have left the week on screen */
      otherWeek: string
      /** the activity list below the slot */
      whatLabel: string
    }
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
  /**
   * THE NIGHT — sleep: the sheet that writes a night down, the morning offer,
   * the figures the ledger prints, and the switches that govern all of it.
   *
   * The register is the same as everywhere else, with one extra rule this
   * system needs more than most: sleep is the easiest thing in the app to be
   * made to feel bad about, and the butler does not do that. Nothing here may
   * scold a short night, chase a missed morning, or congratulate a long one.
   * It states hours and it moves on.
   */
  night: {
    /** what the system is called wherever it needs a name */
    name: string
    /** the Manor's own way in */
    button: string
    /** what a night is called on the calendar when the estate writes one */
    blockTitle: string
    /** the door from a sleep block on the week into its own sheet */
    openLabel: string
    sheet: {
      /** writing a night that has none */
      logTitle: string
      /** correcting one already on file */
      editTitle: string
      /** the estate drew this and is asking whether it happened */
      confirmTitle: string
      /** the night being written, e.g. "Tuesday morning" */
      whichLabel: string
      /** the morning being written is today's */
      thisMorning: string
      /** the bedtime landed on the day before the morning */
      dayBefore: string
      prev: string
      next: string
      bedLabel: string
      wakeLabel: string
      /** the qualifier beside the live duration — what SHAPE of night this is,
       *  and what was taken off it. The figure itself is drawn by the sheet. */
      slept: (v: { crossesMidnight: boolean; inBedH: number; awakeMin: number }) => string
      /** …when the two clocks make no night at all */
      impossible: string
      /** …when a night runs longer than the estate will believe */
      tooLong: string
      restLabel: string
      restNote: string
      /** five words for the five ratings, worst first */
      restWords: [string, string, string, string, string]
      /** clear a rating that was set by mistake */
      restClear: string
      awakeLabel: string
      awakeNote: string
      save: string
      /** the pencilled block being confirmed rather than created */
      confirm: string
      remove: string
      /** ConfirmDialog words its own Cancel; only these three are ours */
      removeConfirm: { title: string; body: string; confirm: string }
      /** it would land on hours already spoken for */
      occupied: string
      /** the note under a pencilled night waiting to be confirmed */
      pencilNote: string
      /** the strip of recent nights under the form */
      ledger: string
      /** …when there is nothing in it yet */
      ledgerEmpty: string
    }
    /** the morning offer above the week */
    prompt: {
      /** nothing at all on last night */
      line: string
      cta: string
      /** the estate pencilled the night in and wants a yes, not an entry */
      pencilLine: string
      pencilCta: string
      /** waved off for today */
      dismiss: string
    }
    /** the figures, wherever they are printed */
    stats: {
      lastNight: string
      average: string
      debt: string
      regularity: string
      /** "of the last 7 nights" style caption under a coverage figure */
      covered: (v: { covered: number; of: number }) => string
      /** the average's caption, which must say what it averaged over */
      averageNote: (v: { covered: number }) => string
      debtNote: (v: { target: number }) => string
      /** the body-clock line: spread, and the usual shape it spreads around */
      regularityNote: (v: { driftMin: number | null; bed: string | null; wake: string | null }) => string
      /** too few nights to say anything about steadiness */
      tooThin: string
      /** nothing on file at all */
      empty: string
      /** a night with no record, wherever one is pointed at */
      notWritten: string
    }
    /** the Grounds' recovery coupling, stated wherever it bites */
    recovery: {
      /** the line on the recovery card when the coupling is doing something */
      line: (v: { pct: number; avgH: number; covered: number }) => string
      /** …when it is on but the week is too thin to speak from */
      thin: (v: { covered: number; needed: number }) => string
      /** …when it is switched off */
      off: string
      /** the standing caveat, printed wherever the coupling shows a number */
      caveat: string
    }
    settings: {
      /** the section heading */
      group: string
      targetLabel: string
      targetBlurb: string
      /** the target set to nothing */
      targetNone: string
      couplingLabel: string
      couplingBlurb: string
      promptLabel: string
      promptBlurb: string
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
      /** under the SLEEP figure, when some of it was actually slept */
      sleepSplit: (v: { sleptH: number; pencilledH: number }) => string
      line: (v: {
        nights: number
        days: number
        /** hours the estate drew and nobody confirmed */
        pencilledH: number
        /** …and hours that were written down */
        sleptH: number
        turnaroundH: number | null
        ownH: number
      }) => string
    }
    briefingPanel: {
      chips: (v: WatchBriefingFacts) => BriefingChip[]
      headline: (v: WatchBriefingFacts) => string
      detail: (v: WatchBriefingFacts) => string
      /** the third line, shown only where the briefing has been opened — the
       *  figures a reader who asked for more is entitled to. Null when the
       *  wing has nothing further that is actually true. */
      aside: (v: WatchBriefingFacts) => string | null
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
      /** see watch.briefingPanel.aside */
      aside: (v: GroundsBriefingFacts) => string | null
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
     *  booking — the Grounds' own projection onto the week. `sport` is the
     *  sport's display name, pre-resolved by the wing (core stays ignorant of
     *  the sport roster). */
    loggedBlockTitle: (v: {
      ppl: 'push' | 'pull' | 'legs' | null
      run: boolean
      sport: string | null
    }) => string
    /** run step: pace lives on a band of zones anchored to the easy pace */
    runPaceLabel: string
    runUnitPerKm: string
    /** the easy-pace anchor's label and its ±5s stepper (for screen readers) */
    runEasyLabel: string
    runEasyFasterAria: string
    runEasySlowerAria: string
    /** the five zones, as the chip prints them */
    runZoneNames: Record<'max' | 'threshold' | 'steady' | 'easy' | 'recovery', string>
    /** under the band: which way the slider runs, and the ±1s fine-tune */
    runSliderHint: string
    runFineFaster: string
    runFineSlower: string
    /** the read-out: the time the pace works out to, or what it still wants */
    runTotal: (v: { time: string; km: string }) => string
    runNeedsDistance: string
    /** a stored clock held verbatim while it has no distance to pace against */
    runHeldTime: (v: { time: string }) => string
    /** the effort line under the band — prefilled, or waiting on a distance */
    runEffortPrefill: (v: { n: number }) => string
    runEffortIdle: string
    /** lift session size — two optional whole-session figures on the effort
     *  step. The sets field's placeholder shows the estimate a typed count
     *  would override, so the note has to say blank keeps the estimate. */
    sessionSizeTitle: string
    sessionSetsLabel: string
    sessionSetsUnit: string
    sessionMinLabel: string
    sessionMinUnit: string
    sessionSizeNote: string
    /** the muscle step's body-map twin (Run Entry Explorations 3a): mini
     *  figures beside the picker that ignite muscle by muscle as chips are
     *  tapped */
    muscleTwin: {
      /** captions under the two figures */
      front: string
      back: string
      /** the shape chip — picks matching a PPL day, a free mix, or nothing yet */
      shape: Record<'push' | 'pull' | 'legs', string>
      shapeCustom: string
      shapeNone: string
      /** the tally beside the figures, and its empty state */
      counts: (v: { p: number; s: number }) => string
      countsNone: string
      /** the effort line — what Continue will hand the next step, or that
       *  nothing has been earned yet */
      effortPrefill: (v: { n: number }) => string
      effortIdle: string
    }
    /** RUNS panel — conditioning for the calendar week, then the last few out */
    runs: {
      title: string
      weekLabel: string
      /** the week's headline figure is distance; these label the two beside it */
      timeLabel: string
      paceLabel: string
      /** "3 runs" under the week's distance */
      count: (n: number) => string
      /** distance against the week before, when that week held any */
      vsLast: (v: { km: string; up: boolean }) => string
      vsLastLevel: string
      /** heading over the short list of the most recent runs */
      recent: string
      /** a run that recorded one side only — no pace can be quoted for it */
      paceUnknown: string
      /** the week is empty, but runs exist further back */
      quietWeek: string
      /** no run has ever been logged */
      empty: string
      /** detail sheet: the badge that names a run, and its three figures —
       *  `paceOne` is one run's pace, not the week's average */
      badge: string
      distanceLabel: string
      paceOne: string
      /** the run was logged on effort alone, with neither side recorded */
      detailNone: string
    }
    /** OTHER SPORT — sessions of sports beyond lifting and running. Sport
     *  names arrive pre-resolved as plain strings; the roster is wing data. */
    sport: {
      /** the method step's fourth door: card title + its one-line caption */
      methodTitle: string
      methodCaption: string
      /** sheet title while the sport picker is up */
      stepTitle: string
      /** label over the dropdown, and the unpicked state's line */
      pickerLabel: string
      pickerPlaceholder: string
      /** under the picked sport's muscle chips: what the chips mean */
      hitsNote: string
      /** the save button on the effort step */
      save: string
      /** detail sheet caption in place of a rep style (a sport's is fixed) */
      detailCaption: string
      /** briefing: " — last was a Boxing session yesterday" */
      lastLine: (v: { name: string; when: string }) => string
      /** briefing: the week's conditioning tally, ' (plus 2 runs and an MMA
       *  session)' — returns '' when both are zero, leading space included */
      weekTally: (v: { runs: number; sports: number }) => string
    }
    /** EXERCISES — the named-lift flow: pick exercises, log kg × reps per set.
     *  Exercise names themselves are wing data (the catalogue), never voice —
     *  only the chrome around them lives here. */
    exercises: {
      /** the method step's fifth door: card title + its one-line caption */
      methodTitle: string
      methodCaption: string
      /** sheet title while the session list / picker is up */
      stepTitle: string
      /** the session list: the button that opens the picker, and the line
       *  standing where the list will be before anything is chosen */
      addExercise: string
      empty: string
      /** the picker: its search field, the filter chip that clears the muscle
       *  group, the line while the catalogue's chunk is still arriving, and
       *  what a search matching nothing says */
      searchPlaceholder: string
      filterAll: string
      loading: string
      noResults: (v: { query: string }) => string
      /** an exercise the user wrote themselves, marked in every list */
      yoursTag: string
      /** the door out of the picker into the create form, offered under a
       *  search that found nothing (or too little) */
      create: (v: { name: string }) => string
      /** the create form: heading, its two fields, and the refusal when no
       *  muscle has been marked as taking the brunt */
      createTitle: string
      createNameLabel: string
      createNamePlaceholder: string
      createMusclesLabel: string
      createMusclesHint: string
      createSave: string
      createNeedsName: string
      createNeedsPrimary: string
      /** a set row: the add button, and the tally under an exercise's name */
      addSet: string
      setCount: (n: number) => string
      /** the two set columns */
      weightLabel: string
      repsLabel: string
      /** last session's numbers for this exercise, shown while logging the
       *  next — `sets` arrives pre-formatted ('60×8 · 60×8 · 62.5×6') */
      lastTime: (v: { sets: string }) => string
      /** the effort step, where the working-sets field would otherwise be:
       *  this session's size, counted rather than estimated */
      derivedSets: (v: { sets: number; exercises: number }) => string
      /** detail sheet: the heading over the session's exercises */
      detailTitle: string
    }
    /**
     * RECASTING — the method step reached from a session that already exists.
     * Backing out of an edit lands on the same picker a new workout opens on,
     * and taking another door from it rewrites the record: an exercise list, a
     * run's figures and the typed session size are each carried by exactly one
     * method. So the step says which session it is standing in, marks the door
     * that session already came through, and the guard names what a change
     * would cost before it costs it.
     */
    recast: {
      /** sheet title on the method step while a stored session is open — the
       *  new-workout title there reads as a blank slate, which is the whole
       *  reason a wipe felt like a fresh log */
      stepTitle: string
      /** tag on the door this session is currently logged through */
      currentTag: string
      /** the guard. `body` receives only what would actually be dropped —
       *  every field null-when-absent, at least one always set. */
      confirmTitle: string
      confirmBody: (v: {
        exercises: { exercises: number; sets: number } | null
        run: { km: string | null; time: string | null } | null
        setsTotal: number | null
        durationMin: number | null
      }) => string
      confirmLabel: string
    }
    /** weekly-goal card + its dialog */
    weekTitle: string
    goalMet: string
    goalRemaining: (n: number) => string
    /** groups behind their trailing week — same units and window as the body
     *  map's volume mode, so the two can never disagree */
    behindTitle: string
    behindDetail: (v: { group: string; sets: number; target: number }) => string
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
    /** the tapped-muscle readout in strain mode. `trained` is the last-session
     *  day label — null means the muscle has NO history at all; `state` names
     *  recovery once the figure has cooled enough that a bare number would
     *  read as "never trained" ('mostly' below the train-next gate, 'recovered'
     *  below the visual floor) */
    mapStrain: (v: {
      muscle: string
      strain: number
      trained: string | null
      state: 'recovered' | 'mostly' | null
    }) => string
    /** the tapped-muscle readout in volume mode. `band` is the prose status
     *  word, `trend` the comparison with the muscle's own usual week — null
     *  when there isn't enough history to compare against */
    mapVolume: (v: { muscle: string; sets: number; band: string; trend: string | null }) => string
    /** what each volume band is called in prose (the readout, and the
     *  ledger's screen-reader text) */
    volumeLabel: Record<VolumeBand, string>
    /** the same bands as legend ticks — short enough to sit under a gradient */
    volumeLegend: Record<Exclude<VolumeBand, 'none'>, string>
    /** how this window compares with the muscle's own four-week average */
    volumeTrend: Record<'above' | 'usual' | 'below', string>
    deloadTitle: string
    deload: (v: { count: number; muscles: string }) => string
    /** workout detail sheet: where the session sits on its recovery arc */
    phaseLine: Record<'fresh' | 'peaking' | 'easing' | 'recovered', string>
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
      /** see watch.briefingPanel.aside */
      aside: (v: StudyBriefingFacts) => string | null
    }
  }
  workshop: {
    /** rings hero card title */
    weekAtBench: string
    weekLine: (v: { from: string; to: string; fulfilled: number; booked: number }) => string
    ringOfGoal: (goal: number) => string
    ringNoGoal: string
    more: (n: number) => string
    /** the timer's three states */
    toTheBench: string
    downTools: string
    atTheBench: string
    /** milestone countdown strip */
    mattersPending: string
    noMilestones: string
    /** days < 0 reads as overdue — "N days over", and the chip trails to today */
    countdown: (days: number) => string
    hoursToward: (h: number) => string
    overdueNote: string
    desk: string
    book: string
    awaiting: string
    noAwaiting: string
    /** unfiled quick-add row: label over the venture picker */
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
      /** a session logged live from the bench timer */
      liveDone: string
      partial: (h: number) => string
      skipped: string
      awaiting: string
      ahead: string
    }
    /** the venture roster */
    shelf: string
    shelfCount: (v: { total: number; shipped: number }) => string
    openVenture: string
    /** the odometer never resets */
    lifetime: string
    odometer: string
    /** how far along the BOARD is — jobs struck against jobs hung. A separate
     *  reading from hours: effort only climbs, this can fall when new work is
     *  found, which is honest about inventing. */
    tasks: {
      label: string
      count: (v: { done: number; total: number }) => string
      pct: (pct: number) => string
      none: string
      allDone: string
    }
    statusName: { spark: string; building: string; shipped: string; shelved: string }
    rename: string
    ship: string
    shelve: string
    reopen: string
    archive: string
    /** the last-touched line under a shelf card */
    touched: {
      today: string
      days: (n: number) => string
      /** ≥ 7 quiet days earns the sir line */
      quietLong: (n: number) => string
      never: string
      shippedIn: (month: string) => string
      shippedLine: string
    }
    /** the venture board — the pegboard */
    board: {
      back: string
      hang: string
      empty: string
      hangFirst: string
      colOf: (v: { col: number; total: number }) => string
      done: string
      loose: string
      hangHere: string
      pressHint: string
      /** the second half of the hint: the eyelet, and what dragging it does */
      threadHint: string
      zoomIn: string
      zoomOut: string
      zoomReset: string
      /** the third line of the hint: what pressing a heading does */
      headingHint: string
      /** the eyelet on a card — where a thread is picked up */
      threadFrom: string
      /** armed on the phone, waiting for the other end to be tapped */
      threadPick: string
      threadStop: string
      /** THE COLUMN — the list a heading opens */
      columnTitle: (name: string) => string
      columnCount: (n: number) => string
      columnEmpty: string
      moveUp: string
      moveDown: string
      takeDown: string
      editHeading: string
    }
    /** a task's delivery deadline — date AND hour, unlike a milestone's day */
    due: {
      label: string
      none: string
      set: string
      clear: string
      dateLabel: string
      timeLabel: string
      hint: string
      /** the chip on the card: `days` buckets the day, `overdue` the moment */
      chip: (v: { date: string; time: string; days: number; overdue: boolean }) => string
    }
    emptyWing: string
    sheet: {
      name: string
      namePlaceholder: string
      weeklyGoal: string
      goalZeroHint: string
      venture: string
      day: string
      start: string
      duration: string
      bookHintPast: string
      bookHintFuture: string
      title: string
      body: string
      bodyPlaceholder: string
      /** the same field on a TASK card — a job's description, not a note's text */
      detail: string
      detailPlaceholder: string
      url: string
      urlPlaceholder: string
      threadTo: string
      noThread: string
      /** which heading a card hangs under, and the loose option */
      under: string
      underNone: string
      cardType: { title: string; note: string; task: string; link: string }
      titlePlaceholder: string
      msPlaceholder: string
      msHint: string
      theDay: string
      ctaOpen: string
      ctaRename: string
      ctaBook: string
      ctaLog: string
      ctaHang: string
      ctaSaveCard: string
      ctaMs: string
      cancel: string
      /** taking a card off the wall: the button, and the question it asks
       *  first. The label is an INSTRUCTION — `toast.cardGone` is the report
       *  afterwards, and the two must never be the same string. */
      takeDown: string
      takeDownTitle: string
      takeDownBody: (v: { title: string; threads: number }) => string
      takeDownYes: string
    }
    milestonesTitle: (name: string) => string
    addMs: string
    toast: {
      benchStart: string
      benchStop: (v: { h: number; m: number }) => string
      benchShort: string
      benchSandbox: string
      markedDone: string
      struck: string
      notedPartial: (h: number) => string
      restStruck: string
      logged: string
      onBooks: string
      opened: string
      renamed: string
      shipped: string
      shelved: string
      reopened: string
      archived: string
      cardHung: string
      titleHung: string
      cardGone: string
      threaded: string
      threadCut: string
      threadSelf: string
      dueSet: string
      dueCleared: string
      msAdded: string
      msDone: string
      msUndone: string
      msGone: string
      filed: string
      nameFirst: string
      titleFirst: string
    }
    /** Manor marker-chip title */
    markerMs: (title: string) => string
    /** Manor marker-chip title for a delivery — carries the promised hour */
    markerDue: (title: string, time: string) => string
    archiveTitle: string
    archiveBody: (name: string) => string
    archiveYes: string
    /** the crew — a venture opened to another pair of hands via a code */
    crew: {
      /** board-header door: private venture vs crewed (member count) */
      shareButton: string
      crewButton: (n: number) => string
      /** badge on a crewed shelf card */
      badge: string
      sheetTitle: string
      /** what opening the venture to a crew does — shown before the code exists */
      blurb: string
      /** the sheet once crewed — code on display */
      blurbCrewed: string
      cta: string
      creating: string
      codeLabel: string
      copyCode: string
      copyLink: string
      copied: string
      rosterTitle: string
      you: string
      owner: string
      kick: string
      kickTitle: string
      kickBody: (label: string) => string
      kickYes: string
      leave: string
      leaveTitle: string
      leaveBody: string
      leaveYes: string
      unshare: string
      unshareTitle: string
      unshareBody: string
      unshareYes: string
      /** deleting a crewed venture deletes it for the whole crew — said plainly */
      deleteTitle: string
      deleteBody: (name: string) => string
      deleteYes: string
      contributionTitle: string
      /** contribution figures — hours are shown to one decimal upstream */
      weekH: (h: number) => string
      totalH: (h: number) => string
      tasksDone: (n: number) => string
      /** the join door on the shelf */
      joinButton: string
      joinTitle: string
      joinBlurb: string
      codePlaceholder: string
      joinCta: string
      joining: string
      toast: {
        shared: string
        joined: string
        joinUnknown: string
        left: string
        unshared: string
        kicked: string
        needsSignIn: string
        offline: string
        /** a ?join link arrived while signed out — the code waits */
        linkHeld: string
        demoOff: string
      }
      /** transport trouble, in the user's words */
      errorLine: (msg: string) => string
    }
    /** menu-tile labels */
    tileNextMs: string
    tileWeek: string
    briefingPanel: {
      chips: (v: WorkshopBriefingFacts) => BriefingChip[]
      headline: (v: WorkshopBriefingFacts) => string
      detail: (v: WorkshopBriefingFacts) => string
      /** see watch.briefingPanel.aside */
      aside: (v: WorkshopBriefingFacts) => string | null
    }
  }
  /** wing chip labels per event kind */
  kinds: {
    shift: string
    sleep: string
    training: string
    study: string
    workshop: string
    marker: string
    /** mirrored from an external calendar — read-only on the Manor */
    abroad: string
  }
  modules: {
    watch: { name: string; tagline: string }
    training: { name: string; tagline: string }
    study: { name: string; tagline: string }
    workshop: { name: string; tagline: string }
    capital: { name: string; tagline: string }
  }
  capital: {
    briefingPanel: {
      chips: (v: CapitalBriefingFacts) => BriefingChip[]
      headline: (v: CapitalBriefingFacts) => string
      detail: (v: CapitalBriefingFacts) => string
      /** see watch.briefingPanel.aside */
      aside: (v: CapitalBriefingFacts) => string | null
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
    /** snapshot sheet + accounts list: a priced account valued from live quotes */
    stampLive: string
    /** accounts list: a priced account with no quote, reading its last saved
     *  balance. The title has to name the way out — a policy with no door is how
     *  a deposit became unrecordable */
    stampHeld: string
    stampHeldTitle: string
    /** snapshot sheet: a priced account with no quote takes a TYPED balance, so
     *  its row is an ordinary input wearing this tag */
    stampNoQuote: string
    stampNoQuoteTitle: string
    /** the visible line under the list saying what those rows want (a title
     *  attribute is nothing on a phone) */
    stampNoQuoteNote: (accounts: number) => string
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
  /**
   * External calendar sync — the Google Calendar bridge. The estate's own
   * bookings go out to a calendar this app creates in the user's Google
   * account; the user's Google events come in as read-only 'abroad' blocks.
   * Every off/error state names its own reason, per the sync convention.
   */
  calendars: {
    /** settings row (the section heading is settings.groupCalendars) */
    settingsLabel: string
    settingsBlurb: string
    /** settings note when signed out — sign-in is the remedy, and the note says so */
    needsAccount: string
    /** the sheet */
    sheetTitle: string
    blurb: string
    connect: string
    working: string
    connectedAs: (email: string) => string
    /** the grant lapsed or was revoked — the fix is the same door again */
    reconnect: string
    reconnectNote: string
    /** the two directions, each its own switch */
    pullToggle: string
    pullBlurb: string
    pushToggle: string
    pushBlurb: string
    syncNow: string
    syncing: string
    lastSynced: (when: string) => string
    neverSynced: string
    disconnect: string
    disconnectTitle: string
    /** must say both truths: mirrors leave the Manor; the Google-side calendar stays */
    disconnectBody: string
    disconnectYes: string
    /** what the ?gcal return param says, once, before it is stripped */
    returnedConnected: string
    returnedDenied: string
    returnedError: string
    /** the line that stands where Edit/Remove would, on an abroad event */
    abroadLine: string
    /** a Google event that arrived without a title still needs a name */
    untitled: string
    /** the calendar this app creates in the user's Google account */
    calendarName: string
    /** the server's closed error codes, given words — fact + remedy */
    errors: {
      off: string
      offline: string
      unreachable: string
      signin: string
      reconnect: string
      google: string
      notConnected: string
      /** disconnect refused while a what-if rehearsal holds the calendar */
      rehearsal: string
    }
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
    groupCalendars: string
    groupEstate: string
    groupGrounds: string
    /** the navigation itself: which wings it lists, and in what order */
    groupWings: string
    wingsBlurb: string
    /** what the phone's bar does with the top of that order */
    wingsBarNote: string
    /** every wing switched off — the navs are the Manor alone */
    wingsAllOff: string
    /** the row's controls, which are icons and therefore need words */
    wingUp: (name: string) => string
    wingDown: (name: string) => string
    wingShow: (name: string) => string
    wingHide: (name: string) => string
    /** appearance */
    themeLabel: string
    weekStartLabel: string
    weekStartBlurb: string
    weekSun: string
    weekMon: string
    /** guidance */
    rerunBlurb: string
    /** the way out to the landing page, and back in again */
    frontDoorLabel: string
    frontDoorBlurb: string
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
    /** the legal section: the documents, and the analytics switch */
    groupLegal: string
    termsLabel: string
    /** both blurbs say the row leaves the app — these are pages, not sheets */
    termsBlurb: string
    privacyLabel: string
    privacyBlurb: string
    /** the usage-analytics opt-out. The blurb must restate the door's promise:
     *  counts of features used, never the contents of any record. */
    analyticsToggle: string
    analyticsBlurb: string
  }
  /**
   * The consent door — the one deliberate wall in an app of doors. Shown
   * before the shell whenever this device has not accepted the current
   * TERMS_VERSION; one reading, one button, no dismiss. The analytics line
   * is the disclosure the Privacy Policy's usage-analytics section stands on,
   * so the two must never drift apart in substance.
   */
  consent: {
    title: string
    /** what the house keeps and what pressing the button means — this line IS
     *  the clickwrap, so it must say that entering is agreeing */
    body: string
    /** the one-line analytics disclosure: anonymous feature counts, never
     *  record contents, and where the off-switch lives */
    analyticsLine: string
    termsLink: string
    privacyLink: string
    agree: string
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
        projects: string
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
    /** the first venture — the Study's question in the Workshop's terms */
    workshop: {
      title: string
      prompt: string
      goalLabel: string
      add: string
      opened: (n: number) => string
      /** the same name again — a re-run must not double the shelf */
      duplicate: string
      /** opening nothing is a real answer here too */
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
        /**
         * The two beats that close this stop by SHOWING the entry rather than
         * describing it: the real run step and the real muscle picker, seeded
         * and inert. `title` repeats each step's own heading so the tour
         * teaches the screen the user will actually meet.
         */
        demo: {
          /** the honest footnote inside both — this one writes nothing */
          note: string
          run: { title: string; line: string }
          muscles: { title: string; line: string }
        }
      }
      study: {
        meaning: string
        dashboard: string
        use: (v: { subjects: number }) => string
      }
      /**
       * The Workshop runs four beats: the extra one is `board`, where the
       * pegboard opens itself rather than being described. It sits third so
       * the stop still closes on `use`, like every other.
       */
      workshop: {
        meaning: string
        dashboard: string
        board: string
        use: (v: { ventures: number }) => string
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
      /** one wing's own briefing panel, as the wing screens render it */
      briefing: string
      /** the Manor's written brief and its instruments */
      briefingLedger: string
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
      runs: string
      scheduled: string
      recovery: string
      fuel: string
      calendar: string
    }
    study: {
      pending: string
      dossier: string
      readingWeek: string
      subjectLedger: string
      desk: string
      weekLedger: string
    }
    workshop: {
      bench: string
      pending: string
      desk: string
      weekLedger: string
      shelf: string
      board: string
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
