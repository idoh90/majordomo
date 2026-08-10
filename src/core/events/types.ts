/**
 * The one canonical calendar entity. Every wing that touches time writes
 * these; the Manor reads them. `start`/`end` are ISO instants with an
 * EXCLUSIVE end — never day-bucketed, so a 19:00→08:00 night watch is one
 * event whose end simply lands on the next local day. Rendering decides how
 * to draw that (the duty-cycle grid keeps it whole); the data never splits.
 */

/** what the event is — drives color, iconography and wing routing */
export type EventKind = 'shift' | 'sleep' | 'training' | 'study' | 'workshop' | 'marker'

/** which wing wrote the event ('manual' = placed by hand on the Manor) */
export type EventSource = 'manual' | 'watch' | 'grounds' | 'capital' | 'study' | 'workshop'

export interface CalendarEvent {
  id: string
  source: EventSource
  /** id of the source record (e.g. a watch pattern) for future-only regeneration */
  sourceRef?: string
  kind: EventKind
  title: string
  /** ISO instant */
  start: string
  /** ISO instant, exclusive; must be > start (cross-midnight is natural data) */
  end: string
  /** day-scoped marker chip (e.g. payday) — anchored to start's local day */
  allDay?: boolean
  notes?: string
  /** ISO instant of last mutation — the future sync/merge hook */
  updatedAt: string
}
