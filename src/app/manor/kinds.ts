import type { EventKind } from '../../core/events/types'
import { voice } from '../../core/voice'

/** per-kind presentation: wing accent + chip label (colors are skin tokens) */
export const KIND_META: Record<EventKind, { color: string; label: string }> = {
  shift: { color: 'var(--color-w-watch)', label: voice.kinds.shift },
  sleep: { color: 'var(--color-ink-dim)', label: voice.kinds.sleep },
  training: { color: 'var(--color-w-grounds)', label: voice.kinds.training },
  study: { color: 'var(--color-w-study)', label: voice.kinds.study },
  marker: { color: 'var(--color-w-ledger)', label: voice.kinds.marker },
}

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
