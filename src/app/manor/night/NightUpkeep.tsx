import { useEffect } from 'react'
import { useEventsStore } from '../../../core/events/store'
import { useSleepStore } from '../../../core/sleep/store'

/**
 * THE NIGHT's housekeeping, on the Study's precedent: the extras a night was
 * given are keyed by event id, and an event can be deleted from the week
 * without this store hearing about it.
 *
 * Orphans are inert — every figure is derived by walking sleep EVENTS and
 * looking their extras up, so a stranded rating changes no number. They are
 * swept anyway because they would otherwise ride cloud sync forever, and
 * because an id that comes back (an undo, a restore) must not silently
 * re-attach a rating from a night that was thrown away.
 *
 * Renders nothing. Mounted wherever the Manor renders, so it runs whether or
 * not anyone opens the sheet.
 */
export function NightUpkeep() {
  const events = useEventsStore((s) => s.events)
  const sandbox = useEventsStore((s) => s.sandbox)

  useEffect(() => {
    // never mid-rehearsal: a what-if that removes a sleep block has not
    // removed anything yet, and pruning against the draft would delete the
    // rating of a night the reader is about to keep
    if (sandbox) return
    useSleepStore.getState().pruneNotes(new Set(events.map((e) => e.id)))
  }, [events, sandbox])

  return null
}
