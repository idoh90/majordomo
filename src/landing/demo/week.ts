/* ---------------------------------------------------------------------------
   The demo week.

   One person's actual seven days: a night watch on Wednesday and a twelve-hour
   day watch on Saturday, training five times, studying most evenings, a
   language lesson, an exam, two client meetings and the invoices — and, in
   between all of it, the coffee, the lunches, the commute and the errands that
   make a day continuous instead of a row of floating islands.

   Rules the layout obeys, because a calendar that ignores them stops looking
   like a calendar:

   - Nothing overlaps. Two things at once is a bug in a schedule, not density.
   - Every block is at a plausible hour for what it says. Training in the
     morning or the early evening; the exam at 09:00, not at midnight; study
     after dinner; a nap in the afternoon before a night watch.
   - Nothing daft sits next to a night watch: Wednesday trains in the MORNING
     and sleeps at 14:00, because nobody does hard intervals two hours before
     standing thirteen.
   - `minor` blocks are the connective tissue — coffee, lunch, the commute.
     They are drawn quieter and smaller than commitments, and the butler never
     mentions them, because nobody needs telling they have lunch.

   Hours are decimal hours from local midnight, end exclusive — the app's own
   convention. The Wednesday watch is ONE 13-hour commitment that happens to be
   drawn in two columns, and the dotted seam edges are how the app says so.

   "Now" is Wednesday 16:30. Everything before it is dimmed, the way the app
   dims what has already happened.
--------------------------------------------------------------------------- */

export type Wing = 'watch' | 'grounds' | 'study' | 'ledger' | 'rest' | 'plain'

export type Block = {
  id: string
  wing: Wing
  start: number
  end: number
  label: string
  sub?: string
  /** what the sub shrinks to in a 4-column phone grid, where the full line
      would clip. Omitted means the sub is hidden there instead. */
  subShort?: string
  /** the block is too short for a second line: the sub runs after the label
      on wide columns, and is dropped on narrow ones */
  subInline?: boolean
  /** connective tissue, not a commitment: smaller, quieter, never briefed,
      and it does not jitter during the chaos beat — thirty-eight blocks all
      breathing at once is more animation than a mid-range phone should be
      asked to composite for something this small. */
  minor?: boolean
  /** continues past midnight into the next column */
  cutAfter?: boolean
  /** began before midnight in the previous column */
  cutBefore?: boolean
  /** the estate pencilled this in; nobody typed it */
  hatch?: boolean
  /** already happened. The drop in opacity IS the label — nothing has to say
      "past" in words, and it is what makes the week read from left to right. */
  past?: boolean
  /** the block the briefing is about. It maps to the app's `.booked-glow`,
      whose meaning is "live, current or SELECTED" — at 16:30 tonight's watch
      is not live yet, and calling the flag `live` would be the demo claiming
      something its own clock contradicts. */
  focus?: boolean
  /** chaos-beat displacement [dx px, dy px, rotation deg] */
  scatter: [number, number, number]
  /** the order it snaps home in */
  order: number
}

export type Day = {
  label: string
  /** columns outside TUE–FRI are desktop-only: at 390px, four columns is the
      widest the money shot survives, and TUE–FRI holds the night watch, its
      midnight seam, the sleep after it and the exam */
  wide?: boolean
  blocks: Block[]
}

/* Scatter values are authored rather than generated: a random spread puts two
   blocks on top of each other as often as not, and the chaos beat has to look
   like a week nobody has sorted, not like a bug. */
export const WEEK: Day[] = [
  {
    label: 'MON 13',
    wide: true,
    blocks: [
      {
        id: 'strength-mon',
        wing: 'grounds',
        start: 7,
        end: 8.5,
        label: 'STRENGTH',
        sub: '· PUSH',
        subInline: true,
        past: true,
        scatter: [44, 126, 4],
        order: 20,
      },
      { id: 'coffee-mon', wing: 'plain', start: 9, end: 10, label: 'COFFEE', minor: true, past: true, scatter: [30, 92, 3], order: 30 },
      { id: 'lunch-mon', wing: 'plain', start: 12.5, end: 13.5, label: 'LUNCH', minor: true, past: true, scatter: [-38, 70, -3], order: 31 },
      { id: 'admin-mon', wing: 'plain', start: 15, end: 16.5, label: 'ADMIN', minor: true, past: true, scatter: [56, -44, 4], order: 32 },
      {
        id: 'muaythai-mon',
        wing: 'grounds',
        start: 18,
        end: 19.5,
        label: 'MUAY THAI',
        past: true,
        scatter: [-58, -96, -6],
        order: 21,
      },
      {
        id: 'study-mon',
        wing: 'study',
        start: 20,
        end: 22,
        label: 'THE STUDY',
        sub: '20:00–22:00',
        past: true,
        scatter: [66, -52, 5],
        order: 22,
      },
    ],
  },
  {
    label: 'TUE 14',
    blocks: [
      {
        id: 'intervals-tue',
        wing: 'grounds',
        start: 6.5,
        end: 8,
        label: 'INTERVALS',
        sub: '· HARD',
        subInline: true,
        past: true,
        scatter: [52, 118, 5],
        order: 13,
      },
      { id: 'coffee-tue', wing: 'plain', start: 8.25, end: 9.25, label: 'COFFEE', minor: true, past: true, scatter: [-34, 86, -3], order: 33 },
      {
        id: 'spanish-tue',
        wing: 'study',
        start: 10,
        end: 11.5,
        label: 'SPANISH',
        sub: '· LESSON',
        subInline: true,
        past: true,
        scatter: [72, 84, 6],
        order: 14,
      },
      { id: 'lunch-tue', wing: 'plain', start: 12, end: 13, label: 'LUNCH', minor: true, past: true, scatter: [42, -60, 3], order: 34 },
      {
        id: 'invoices-tue',
        wing: 'ledger',
        start: 13.5,
        end: 15,
        label: 'INVOICES',
        past: true,
        scatter: [-66, 62, -5],
        order: 15,
      },
      {
        id: 'study-tue',
        wing: 'study',
        start: 17,
        end: 19,
        label: 'THE STUDY',
        sub: '17:00–19:00',
        past: true,
        scatter: [-52, 34, -3],
        order: 8,
      },
      { id: 'call-tue', wing: 'plain', start: 19.5, end: 20.5, label: 'CALL HOME', minor: true, past: true, scatter: [48, -78, 4], order: 35 },
    ],
  },
  {
    label: 'WED 15',
    blocks: [
      { id: 'coffee-wed', wing: 'plain', start: 7.5, end: 8.5, label: 'COFFEE', minor: true, past: true, scatter: [-30, 104, -3], order: 36 },
      {
        id: 'strength-wed',
        wing: 'grounds',
        start: 9,
        end: 10.5,
        label: 'STRENGTH',
        sub: '· PULL',
        subInline: true,
        past: true,
        scatter: [-74, 96, -5],
        order: 11,
      },
      {
        id: 'client-wed',
        wing: 'ledger',
        start: 11.5,
        end: 13,
        label: 'CLIENT',
        sub: '· MEETING',
        subInline: true,
        past: true,
        scatter: [58, -68, 5],
        order: 9,
      },
      { id: 'lunch-wed', wing: 'plain', start: 13, end: 14, label: 'LUNCH', minor: true, past: true, scatter: [36, 74, 3], order: 37 },
      {
        /* the estate pencils sleep BEFORE a night watch as readily as after —
           this is the one a person would never have thought to book */
        id: 'rest-wed',
        wing: 'rest',
        start: 14,
        end: 16,
        label: 'REST',
        sub: 'before the watch',
        subShort: 'pre-watch',
        hatch: true,
        past: true,
        scatter: [-40, 142, -4],
        order: 4,
      },
      { id: 'commute-wed', wing: 'plain', start: 18, end: 19, label: 'COMMUTE', minor: true, scatter: [-46, -66, -4], order: 38 },
      {
        id: 'watch-a',
        wing: 'watch',
        start: 19,
        end: 24,
        label: 'THE WATCH',
        sub: '19:00 →',
        subShort: '19:00 →',
        cutAfter: true,
        focus: true,
        scatter: [28, -128, 2],
        order: 0,
      },
    ],
  },
  {
    label: 'THU 16',
    blocks: [
      {
        id: 'watch-b',
        wing: 'watch',
        start: 0,
        end: 8,
        label: '→ 08:00',
        /* the whole argument of the page, in one line — so it must survive the
           phone, where the long form would clip */
        sub: '13.0 h · one shift',
        subShort: '13.0 h',
        cutBefore: true,
        focus: true,
        scatter: [-20, 158, -2],
        order: 1,
      },
      {
        id: 'rest-thu',
        wing: 'rest',
        start: 8.5,
        end: 14,
        label: 'REST',
        sub: 'pencilled',
        subShort: 'pencilled',
        hatch: true,
        scatter: [62, -74, 4],
        order: 2,
      },
      { id: 'coffee-thu', wing: 'plain', start: 14, end: 15, label: 'COFFEE', minor: true, scatter: [-32, 96, -3], order: 39 },
      {
        id: 'strength-thu',
        wing: 'grounds',
        start: 15,
        end: 16.5,
        label: 'STRENGTH',
        sub: '· 15:00',
        subInline: true,
        scatter: [-70, -186, -5],
        order: 3,
      },
      { id: 'errands-thu', wing: 'plain', start: 16.75, end: 17.75, label: 'GROCERIES', minor: true, scatter: [50, -52, 4], order: 40 },
      {
        id: 'study-thu',
        wing: 'study',
        start: 18,
        end: 20,
        label: 'THE STUDY',
        sub: '18:00–20:00',
        scatter: [46, 88, 4],
        order: 7,
      },
    ],
  },
  {
    label: 'FRI 17',
    blocks: [
      { id: 'coffee-fri', wing: 'plain', start: 7, end: 8, label: 'COFFEE', minor: true, scatter: [38, 110, 3], order: 41 },
      {
        /* an exam is three hours at nine in the morning, and it is drawn where
           it happens. An all-day marker pinned to the head of the column reads
           as "exam at midnight", which is worse than no marker at all. */
        id: 'exam',
        wing: 'study',
        start: 9,
        end: 12,
        label: 'EXAM',
        sub: '09:00–12:00',
        subShort: '09:00',
        scatter: [34, 196, 6],
        order: 5,
      },
      { id: 'lunch-fri', wing: 'plain', start: 12.25, end: 13.25, label: 'LUNCH', minor: true, scatter: [-44, 68, -3], order: 42 },
      {
        id: 'client-fri',
        wing: 'ledger',
        start: 14.5,
        end: 16,
        label: 'CLIENT',
        sub: '· MEETING',
        subInline: true,
        scatter: [-64, 46, -4],
        order: 10,
      },
      {
        id: 'muaythai-fri',
        wing: 'grounds',
        start: 18,
        end: 19.5,
        label: 'MUAY THAI',
        scatter: [58, -110, 6],
        order: 12,
      },
    ],
  },
  {
    label: 'SAT 18',
    wide: true,
    blocks: [
      { id: 'commute-sat', wing: 'plain', start: 6, end: 7, label: 'COMMUTE', minor: true, scatter: [40, 118, 3], order: 43 },
      {
        /* the other half of a rotation: twelve hours in daylight, one block,
           no seam — the same engine, a completely different-looking day */
        id: 'watch-sat',
        wing: 'watch',
        start: 7,
        end: 19,
        label: 'THE WATCH',
        sub: '12.0 h · day watch',
        subShort: '12.0 h',
        scatter: [-48, 108, -3],
        order: 6,
      },
      { id: 'meals-sat', wing: 'plain', start: 19.5, end: 20.5, label: 'MEAL PREP', minor: true, scatter: [-36, -88, -3], order: 44 },
    ],
  },
  {
    label: 'SUN 19',
    wide: true,
    blocks: [
      {
        id: 'longrun-sun',
        wing: 'grounds',
        start: 8.5,
        end: 10.5,
        label: 'LONG RUN',
        sub: '· 18 KM',
        subInline: true,
        scatter: [-44, 132, -6],
        order: 23,
      },
      { id: 'coffee-sun', wing: 'plain', start: 11, end: 12, label: 'COFFEE', minor: true, scatter: [52, 64, 4], order: 45 },
      {
        id: 'study-sun',
        wing: 'study',
        start: 13,
        end: 16,
        label: 'THE STUDY',
        sub: '13:00–16:00',
        scatter: [50, -84, 5],
        order: 24,
      },
      { id: 'reading-sun', wing: 'plain', start: 17, end: 18, label: 'READING', minor: true, scatter: [-40, -70, -3], order: 46 },
    ],
  },
]

/** the hour rail, and the one honest 00:00 at the foot of the column */
export const RULER = [0, 6, 12, 18, 24].map((h) => ({
  h,
  label: `${String(h % 24).padStart(2, '0')}:00`,
}))

/** 16:30 — the moment the briefing lands, two and a half hours before duty */
export const NOW_HOUR = 16.5

/** Wednesday: the day the demo is standing in, and the frame it rests on when
    nothing is playing */
export const TODAY = 2

/* --------------------------------------------------------------------------
   The storyboard.

   chaos → the week as every other calendar leaves it: misaligned, overlapping,
           several of them half off the grid
   snap  → each block springs home, staggered, and the watch becomes one shift
   tour  → the butler walks the week. He stops over a day, says what that day
           asks of you, and moves on. Seven stops on a desktop, four on a phone
           (which shows four columns), so the loop is not a fixed length — it
           is built from however many columns are actually on screen.
   reset → back toward scatter, and around again

   The still everyone starts from — and the only frame a reduced-motion or
   no-JavaScript visitor ever sees — is the tour stopped over Wednesday. It is
   the good frame: the week in order, with the butler mid-sentence about today.
-------------------------------------------------------------------------- */
export type Beat = 'chaos' | 'snap' | 'tour' | 'reset'

export const CHAOS_MS = 1400
export const SNAP_MS = 2800
/** how long he stands over each day */
export const STOP_MS = 2100
/** the drift back out of order, before the loop begins again */
export const RESET_MS = 1500
