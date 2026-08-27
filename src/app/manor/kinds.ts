import type { CalendarEvent, EventKind } from '../../core/events/types'
import { voice } from '../../core/voice'

/** per-kind presentation: wing accent + chip label (colors are skin tokens) */
export const KIND_META: Record<EventKind, { color: string; label: string }> = {
  shift: { color: 'var(--color-w-watch)', label: voice.kinds.shift },
  // THE NIGHT's own accent rather than plain dim ink: sleep is a first-class
  // record now, and a block you wrote down deserves to be identifiable as one
  // colour among the wings' rather than as absence of colour.
  sleep: { color: 'var(--color-w-sleep)', label: voice.kinds.sleep },
  training: { color: 'var(--color-w-grounds)', label: voice.kinds.training },
  study: { color: 'var(--color-w-study)', label: voice.kinds.study },
  workshop: { color: 'var(--color-w-workshop)', label: voice.kinds.workshop },
  marker: { color: 'var(--color-w-ledger)', label: voice.kinds.marker },
  abroad: { color: 'var(--color-w-abroad)', label: voice.kinds.abroad },
}

/** marker chips color by the wing that owns them (payday = ledger ₪; a study
 *  due/exam day = study accent, its title already says what it is). The google
 *  branch must sit before the ledger default — an external all-day event must
 *  never wear the payday ₪. */
export function markerMeta(e: CalendarEvent): { color: string; label: string; glyph: string } {
  if (e.source === 'study') return { color: 'var(--color-w-study)', label: voice.kinds.study, glyph: '' }
  if (e.source === 'workshop') return { color: 'var(--color-w-workshop)', label: voice.kinds.workshop, glyph: '◇' }
  if (e.source === 'google') return { color: 'var(--color-w-abroad)', label: voice.kinds.abroad, glyph: '' }
  return { color: 'var(--color-w-ledger)', label: voice.kinds.marker, glyph: '₪' }
}

/** KIND_META, except markers resolve per-source */
export function eventMeta(e: CalendarEvent): { color: string; label: string } {
  return e.kind === 'marker' ? markerMeta(e) : KIND_META[e.kind]
}

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
