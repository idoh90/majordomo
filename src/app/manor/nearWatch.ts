import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'

/**
 * "You would train already worn, sir." — a training block that sits hard by
 * a watch: ending within 6 h before one begins, or beginning within 4 h
 * after one ends. Used for the ▲ badge on blocks, the event sheet's warning
 * line, the drop-confirm on drag/placement, and the what-if drawer note.
 * Always computed from the events at hand, never stored.
 */

const HOUR_MS = 3_600_000
const BEFORE_H = 6
const AFTER_H = 4

export interface NearWatch {
  /** minutes of gap between the session and the watch */
  mins: number
  /** true = the session ends before the watch begins; false = it begins after one ends */
  before: boolean
}

export function nearWatch(
  events: CalendarEvent[],
  start: Date,
  end: Date,
  ignoreId?: string,
): NearWatch | null {
  let best: NearWatch | null = null
  const s = start.getTime()
  const en = end.getTime()
  for (const e of events) {
    if (e.kind !== 'shift' || e.allDay || e.id === ignoreId) continue
    const ws = new Date(e.start).getTime()
    const we = new Date(e.end).getTime()
    const gapBefore = ws - en // train, then watch
    if (gapBefore >= 0 && gapBefore <= BEFORE_H * HOUR_MS) {
      const mins = Math.round(gapBefore / 60_000)
      if (!best || mins < best.mins) best = { mins, before: true }
    }
    const gapAfter = s - we // watch, then train
    if (gapAfter >= 0 && gapAfter <= AFTER_H * HOUR_MS) {
      const mins = Math.round(gapAfter / 60_000)
      if (!best || mins < best.mins) best = { mins, before: false }
    }
  }
  return best
}

/**
 * The first training-hard-by-a-watch collision in a what-if draft, as the
 * butler would put it — or null when the rehearsal is clean.
 *
 * Shared by both Difference surfaces. The mobile drawer computed and showed
 * this while the desktop panel showed hours only, so on desktop the ▲ appeared
 * on the block but never in the panel where the decision is actually made.
 */
export function draftConflictLine(draft: CalendarEvent[]): string | null {
  for (const e of draft) {
    if (e.kind !== 'training' || e.allDay) continue
    const nw = nearWatch(draft, new Date(e.start), new Date(e.end), e.id)
    if (nw) return voice.manor.whatIf.conflict({ title: e.title, ...nw })
  }
  return null
}
