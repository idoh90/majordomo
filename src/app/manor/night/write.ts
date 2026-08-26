import { addDays, localDayKey, startOfLocalDay } from '../../../core/dates'
import { rangeFree } from '../../../core/events/lib'
import { useEventsStore } from '../../../core/events/store'
import type { CalendarEvent } from '../../../core/events/types'
import { sleptRef } from '../../../core/sleep/lib'
import { useSleepStore } from '../../../core/sleep/store'
import type { NightRow } from '../../../core/sleep/types'
import { voice } from '../../../core/voice'

/**
 * Writing a night down — the one path, shared by the sheet and by anything
 * else that ever confirms one.
 *
 * Two decisions live here rather than in the component:
 *
 *  1. **Which day a bedtime belongs to is DERIVED, never asked.** The morning
 *     is chosen by the reader, so waking is pinned to it; going to bed is then
 *     the same day when the clock reads earlier than waking and the day before
 *     when it reads later. That is exactly right for both shapes this estate
 *     has to hold — 23:30 → 07:10 lands on two dates, 09:00 → 15:00 on one —
 *     and it can never produce a night of negative or 24-plus hours, which is
 *     what a "yesterday / today" toggle in the form would have allowed.
 *
 *  2. **A morning that already has a block is EDITED, not doubled.** The
 *     estate pencils six hours in after a night watch; confirming that night
 *     must correct the block it drew, not leave a suggestion sitting under a
 *     record. Stamping the ref is what turns the one into the other.
 */

/** minutes since midnight → the pair of instants a night runs between */
export function nightWindow(
  morning: Date,
  bedHHMM: number,
  wakeHHMM: number,
): { start: Date; end: Date } {
  const day = startOfLocalDay(morning)
  const sameDay = bedHHMM < wakeHHMM
  const bedDay = sameDay ? day : addDays(day, -1)
  return {
    start: new Date(bedDay.getFullYear(), bedDay.getMonth(), bedDay.getDate(), 0, bedHHMM),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, wakeHHMM),
  }
}

/**
 * Does the night lie across hours something else already holds?
 *
 * A WARNING, never a refusal — and that is the whole point. Every other clash
 * check on the Manor guards a BOOKING: two things cannot be done at once, so
 * the second is turned away. A night is a record of hours that have already
 * gone by, and the estate does not argue with the past (the same reasoning
 * `occupies()` gives for a logged workout's block). Sleep blocks are excluded
 * outright: a nap and a night on the same morning are two true records.
 */
export function nightClashes(
  events: CalendarEvent[],
  start: Date,
  end: Date,
  ignoreId?: string,
): boolean {
  return !rangeFree(
    events.filter((e) => e.kind !== 'sleep' && e.id !== ignoreId),
    start,
    end,
  )
}

export interface NightDraft {
  /** the morning the night ended on */
  morning: Date
  /** minutes since midnight, 0–1439 */
  bedHHMM: number
  wakeHHMM: number
  /** 1–5, or null for no rating */
  rest: number | null
  /** minutes awake in the night; 0 for none */
  awakeMin: number
  /** the block already on that morning, when there is one */
  existing: NightRow | null
}

/** write it down, and return the id of the block that now holds it */
export function writeNight(d: NightDraft): string {
  const { start, end } = nightWindow(d.morning, d.bedHHMM, d.wakeHHMM)
  const events = useEventsStore.getState()
  const sleep = useSleepStore.getState()
  const ref = sleptRef(localDayKey(d.morning))

  let id: string
  if (d.existing) {
    id = d.existing.eventId
    events.updateEvent(id, {
      // the title is left alone on purpose: a block the reader renamed
      // ("Slept through the alarm") is theirs, and correcting the hours is
      // not licence to overwrite what they called it
      kind: 'sleep',
      sourceRef: ref,
      start: start.toISOString(),
      end: end.toISOString(),
    })
  } else {
    id = events.addEvent({
      source: 'manual',
      sourceRef: ref,
      kind: 'sleep',
      title: voice.night.blockTitle,
      start: start.toISOString(),
      end: end.toISOString(),
    }).id
  }

  sleep.noteNight(id, {
    rest: d.rest ?? undefined,
    awakeMin: d.awakeMin > 0 ? d.awakeMin : undefined,
  })
  return id
}

/** take the night off the week and out of the ledger together */
export function removeNight(row: NightRow): void {
  useEventsStore.getState().deleteEvent(row.eventId)
  useSleepStore.getState().clearNight(row.eventId)
}
