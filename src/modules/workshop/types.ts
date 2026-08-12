/**
 * The Workshop's own records. Bench SESSIONS are not here — they are ordinary
 * CalendarEvents (kind 'workshop') in the shared events store, linked to a
 * venture via `sourceRef: 'proj:<id>'`. This module keeps only what the
 * calendar cannot say: the venture roster, each venture's pegboard (cards and
 * the threads between them), its milestones, per-session fulfillment metadata
 * keyed by event id, and the live bench timer.
 */

export type VentureStatus = 'spark' | 'building' | 'shipped' | 'shelved'

export interface Venture {
  id: string
  name: string
  status: VentureStatus
  /** weekly bench-hours target; 0 = no goal (ring renders quiet, hours still count) */
  goalH: number
  /** shelf order */
  order: number
  archived?: boolean
  /** ISO instant — set when status became 'shipped' ("Shipped in June.") */
  shippedAt?: string
  /** ISO instant */
  createdAt: string
  /**
   * Set when the venture belongs to a crew. The venture record itself stays in
   * PERSONAL sync (each member keeps their own `order`/`archived`); its cards,
   * threads, milestones and the work ledger travel through the share instead.
   * The share-space copy is authoritative for name/status/goalH/shippedAt only.
   */
  shareId?: string
}

/** `title` is the organising card: it heads a column and owns the cards
 *  assigned to it. The other three are the work itself. */
export type CardType = 'title' | 'note' | 'task' | 'link'

/**
 * A card hung on the venture's pegboard.
 *
 * The board is COLUMNS, not a freeform canvas — the pegboard direction's whole
 * aesthetic is right angles. A `title` card heads a column; every card naming
 * it as `parentId` hangs beneath it in `row` order. Cards with no parent fall
 * into the loose column at the end.
 *
 * `col` orders the COLUMNS (read from title cards and from loose cards only);
 * `row` orders a card within its column. Both are ordering hints resolved at
 * render, not absolute pixel slots — which is what lets a card be dropped into
 * another column and simply belong there.
 */
export interface BoardCard {
  id: string
  ventureId: string
  type: CardType
  title: string
  /** a note's text, or a task's description — the same field, since both are
   *  "the longer half" of the card and a task that needs explaining is common */
  body?: string
  /** link target */
  url?: string
  /** task state */
  done?: boolean
  /** who struck it — a user id, stamped only on a crew venture's board, so the
   *  contribution panel can say whose hands did the work. Cleared on unstrike. */
  doneBy?: string
  /**
   * A TASK's delivery deadline — an ISO instant, so the hour is part of it
   * ("Friday, 18:00", not "Friday"). It projects a Manor marker on its local
   * day (`due:<cardId>`); an overdue one trails to today the way a milestone
   * does, and a struck job gives its chip up. Only ever set on `type: 'task'`;
   * the sheet clears it when a card is switched to another type.
   */
  dueAt?: string
  /** the `title` card this one hangs under; unset = loose. A title card never
   *  has one — a heading under a heading is a tree, and this is a wall. */
  parentId?: string
  col: number
  row: number
  /**
   * Freeform position on the DESKTOP wall, in board units. Optional on
   * purpose: a card that has never been dragged sits where the column layout
   * would have put it, so boards from before the freeform pivot open
   * unchanged and only a drag commits a card to a spot of its own. The phone
   * ignores these entirely — it pages the same cards as grouped columns off
   * `parentId`/`row`, which every placement path still maintains.
   */
  fx?: number
  fy?: number
  /** ISO instant */
  createdAt: string
}

/** a length of twine between two cards on the same board */
export interface Thread {
  id: string
  ventureId: string
  from: string
  to: string
}

export interface Milestone {
  id: string
  ventureId: string
  title: string
  /** local day key (YYYY-MM-DD) of the marked day */
  on: string
  done: boolean
  /** ISO instant */
  doneAt?: string
  /** ISO instant "hours toward it" counts from (seeded at creation) */
  countFrom: string
}

export type Fulfillment = 'planned' | 'done' | 'partial' | 'skipped'

export interface SessionMeta {
  fulfillment: Fulfillment
  /** hours actually done when fulfillment === 'partial' */
  doneH?: number
  /** logged live from the bench timer rather than booked ahead */
  live?: boolean
}

/** the running bench timer — persisted so a reload cannot lose real hours */
export interface Bench {
  ventureId: string
  /** epoch ms */
  startedAt: number
}

/**
 * One member's fulfilled hours from one session, in the crew's work ledger —
 * the ONLY thing about a session that travels through a share. The session
 * itself is a private calendar event on its author's Manor; this is the
 * receipt. Keyed by the author's event id (a map entry, like `sessions`),
 * which is what makes re-writing it idempotent.
 */
export interface WorkEntry {
  ventureId: string
  /** ISO instant the session started — day/week bucketing happens at read
   *  time in the viewer's local time, like everything else in the app */
  at: string
  /** fulfilled hours; 0 when the session was walked back to planned/skipped */
  h: number
  /** the author's user id */
  by: string
}

/** one name on a crew's roster — cached locally so labels render offline */
export interface ShareMember {
  userId: string
  label: string
  /** ISO instant */
  joinedAt: string
}
