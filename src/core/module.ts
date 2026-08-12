import type * as React from 'react'

/** A wing plugged into the app shell (nav tab + tile metadata + full screen). */
export type ConsoleModule = {
  id: string
  name: string
  status: 'online' | 'offline'
  /** one-line subtitle for the dashboard tile (e.g. "Net worth · markets · ledger") */
  tagline?: string
  /** monogram glyph for the dashboard tile; inherits currentColor */
  Icon?: React.FC
  Tile: React.FC // live stat on the menu tile
  Screen: React.FC // the console itself
  /**
   * Housekeeping the wing needs done wherever the Manor renders, whether or
   * not the wing itself is ever opened — marker reconciliation, session
   * pruning, the crew work-ledger patch. Renders nothing.
   *
   * This used to ride along inside the wing's briefing row; the row is gone
   * (the brief writes every wing's lines itself now), and the heal passes
   * were load-bearing, so they get their own mount rather than a home of
   * convenience inside a component that might be deleted next.
   */
  Upkeep?: React.FC
}
