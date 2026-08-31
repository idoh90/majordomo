/**
 * THE NIGHT — what the estate keeps about sleep.
 *
 * The record itself is a CalendarEvent of kind 'sleep'; there is no parallel
 * table of nights, deliberately. Sleep is a thing that happens between two
 * clock times on a calendar, the Manor already draws it, and a second store
 * holding the same hours would be free to disagree with the week on screen.
 *
 * What lives here is only what a calendar block cannot carry: the optional
 * extras a night may have been given, keyed by the event that holds it —
 * exactly the split the Study and the Workshop already make between a session
 * (an event) and its report (a record keyed by event id).
 */

/** the optional extras of one night. Every field is optional on purpose:
 *  the system's whole claim is that writing down two clock times is enough. */
export interface SleepNote {
  /** how rested it left you, 1 (wrecked) – 5 (sharp) */
  rest?: number
  /** minutes spent awake between lights out and getting up */
  awakeMin?: number
  /** ISO instant the night was written down */
  loggedAt: string
}

/**
 * One night, as the estate reads it.
 *
 * A night is attributed to the day it ENDS on — the morning you wake and log
 * it. That is the one convention that survives a night shift: a watch-worker
 * who lies down at 09:00 Tuesday and gets up at 15:00 Tuesday has slept
 * Tuesday's night, and someone who goes down at 23:30 Monday and rises at
 * 07:10 Tuesday has also slept Tuesday's night. Bucketing by START would file
 * those two on different days and make "last night" mean two things.
 *
 * (The Manor's own week line splits a cross-midnight block across its two
 * columns — core/events/lib.ts weeklyHoursSeries, 'intersect'. That is right
 * for an hour-of-the-week question and wrong for a night, so the two figures
 * differ at week edges by design, the way WeekAttribution's two modes do.)
 */
export interface NightRow {
  /** local day key of the morning it ended on */
  dayKey: string
  /** the block that carried the largest part of the night */
  eventId: string
  /** hours actually asleep — time in bed, less any time awake */
  hours: number
  /** hours between lights out and getting up, across every block of the night */
  inBedH: number
  bed: Date
  wake: Date
  /** how many separate blocks the night was made of (a nap and a night = 2) */
  blocks: number
  /** 1–5, or null when the night was never rated */
  rest: number | null
  /**
   * The night's midpoint, in minutes from midnight of the day it ended on.
   * SIGNED and un-wrapped: a 03:30 midpoint reads 210, a 23:00 one reads −60,
   * a shift-worker's midday sleep reads 720. That is what makes the spread of
   * these numbers a real measure of how much the body clock is moving —
   * wrapping them into 0–1439 would put 23:50 and 00:10 twenty-four hours
   * apart instead of twenty minutes.
   */
  midMin: number
  /**
   * The estate pencilled this in and nobody confirmed it.
   *
   * Only ever true on a row asked for with `{ includePencilled: true }` —
   * the ledger's own rows are records by construction. The morning offer and
   * the night sheet read it to tell "write this down" from "was that how it
   * went".
   */
  pencilled: boolean
}

/**
 * The ledger's figures — all of them over nights that were WRITTEN DOWN.
 *
 * A block the estate pencilled in after a night watch is a suggestion, and a
 * suggestion counted as sleep is how this app once reported a fortnight of
 * rest to somebody who had never touched the sleep feature. `pencilled` is
 * the only field that knows such blocks exist.
 */
export interface SleepStats {
  /** the most recent night on file inside the window */
  last: NightRow | null
  /** every night on file inside the window, oldest first */
  rows: NightRow[]
  /** nights the window could have held */
  windowNights: number
  /** …of which this many carry a record */
  covered: number
  /**
   * Mornings inside the window carrying only a block the estate DREW — a
   * night watch's six pencilled hours nobody has confirmed. They are counted
   * here and nowhere else: not in `covered`, not in any average, not in the
   * debt, not in the body clock, and so not in the gate on the recovery
   * coupling. A surface prints this to explain an empty figure, never to fill
   * one in.
   */
  pencilled: number
  /** mean hours slept over the covered nights (0 when there are none) */
  avgH: number
  /** the same over the trailing seven nights only */
  avg7H: number
  /** …and how many of those seven carry a record */
  covered7: number
  /**
   * Hours owed. Every covered night short of target adds its shortfall;
   * a long night pays back at HALF (sleep does not bank cleanly), and the
   * total never goes below zero. Nights with NO record are skipped, never
   * counted as zero — silence is not evidence of a bad night.
   */
  debtH: number
  /** 0–100, higher is steadier. null under three nights on file. */
  regularity: number | null
  /** the spread of the midpoint, in minutes. null under three nights. */
  driftMin: number | null
  /**
   * The median shape of a night — for prefilling a new one, and as the datum
   * the body-clock chart measures each night against. All three are minutes
   * from midnight of the morning the night ended on, signed: a 23:30 bedtime
   * reads −30.
   */
  usual: { bedMin: number; wakeMin: number; midMin: number } | null
  /** mean rest rating over the nights that carry one; null when none do */
  rest: number | null
  /** the target these figures are measured against */
  targetH: number
}

/**
 * What sleep is doing to recovery, and whether it is being allowed to.
 *
 * `scale` multiplies the strain engine's per-muscle recovery clock, so above 1
 * every muscle takes proportionally longer to settle. It is EXACTLY 1 whenever
 * the coupling is switched off or the window is too thin to speak from — a
 * neutral value rather than a hidden one, so a surface that forgets to check
 * `applied` still prints the truth.
 */
export interface RecoveryEffect {
  scale: number
  /** the coupling is on AND there were enough nights to speak from */
  applied: boolean
  /** nights on file in the trailing week */
  covered: number
  /** nights needed before the estate will say anything */
  needed: number
  avgH: number
  /** hours per night short of target — negative when ahead of it */
  deficitH: number
  /** how much slower recovery is running, as a percentage; 0 when not applied */
  pct: number
  /** the coupling switch itself, so a surface can tell "off" from "too thin" */
  couplingOn: boolean
}
