import type * as React from 'react'

/** A console plugged into the Batcomputer shell (menu tile + full screen). */
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
  Briefing?: React.FC // its lines in the daily briefing
}
