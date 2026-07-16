import { useEventsStore } from '../../../core/events/store'
import { voice } from '../../../core/voice'

/**
 * Payday markers (the M8 slice) — the Ledger's projection onto the Manor,
 * riding the Study's marker pattern: the setting is the truth, markers are
 * a projection, one single-writer sync + a heal pass that never runs while
 * a what-if sandbox is open. `sourceRef: 'payday:<YYYY-MM>'`.
 */

export const paydayRef = (monthKey: string) => `payday:${monthKey}`

/** local-day key of a month's payday; days 29–31 clamp to the month's length */
export function paydayKeyFor(year: number, monthIdx: number, day: number): string {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate()
  const d = Math.min(Math.max(1, Math.round(day)), lastDay)
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** local-midnight instant of a YYYY-MM-DD key (allDay markers anchor here) */
function dayKeyToIso(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toISOString()
}

/**
 * Ensure the current and next month each carry exactly one payday marker on
 * the right day (paydayDay > 0); when off, remove today-or-future payday
 * markers and leave past ones as history. Mounts on the Ledger Briefing
 * (Manor) and CapitalScreen — the Study's dual-mount precedent.
 */
export function reconcilePaydayMarkers(paydayDay: number, now: number): void {
  const store = useEventsStore.getState()
  if (store.sandbox) return // never contaminate a rehearsal with upkeep

  const nowD = new Date(now)
  const todayKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`

  const wanted = new Map<string, string>() // ref -> dayKey
  if (paydayDay > 0) {
    for (const offset of [0, 1]) {
      const y = nowD.getFullYear()
      const m = nowD.getMonth() + offset
      const key = paydayKeyFor(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth(), paydayDay)
      wanted.set(paydayRef(key.slice(0, 7)), key)
    }
  }

  const existing = store.events.filter(
    (e) => e.kind === 'marker' && e.source === 'capital' && e.sourceRef?.startsWith('payday:'),
  )
  for (const e of existing) {
    const want = wanted.get(e.sourceRef!)
    if (want) {
      const iso = dayKeyToIso(want)
      if (e.start !== iso || e.title !== voice.capital.paydayMarker) {
        store.updateEvent(e.id, { start: iso, end: iso, title: voice.capital.paydayMarker })
      }
      wanted.delete(e.sourceRef!)
    } else if (e.start >= dayKeyToIso(todayKey)) {
      // unwanted and not yet history — off switch or month drifted out of range
      store.deleteEvent(e.id)
    }
  }
  for (const [ref, dayKey] of wanted) {
    const iso = dayKeyToIso(dayKey)
    store.addEvent({
      source: 'capital',
      sourceRef: ref,
      kind: 'marker',
      title: voice.capital.paydayMarker,
      start: iso,
      end: iso,
      allDay: true,
    })
  }
}
