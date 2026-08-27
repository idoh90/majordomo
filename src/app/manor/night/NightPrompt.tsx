import { addDays, localDayKey, startOfLocalDay } from '../../../core/dates'
import { useEventsStore } from '../../../core/events/store'
import { nightOf } from '../../../core/sleep/lib'
import { useSleepStore } from '../../../core/sleep/store'
import { useNow } from '../../../core/useNow'
import { voice } from '../../../core/voice'

/**
 * THE MORNING OFFER — one line above the week, on a morning with no note.
 *
 * The whole of this system's discipline is in the conditions below rather than
 * in the markup. The butler never begs, so:
 *
 *  · it asks about ONE morning — the one you are in — and never about the four
 *    you missed last week. A backlog presented as a to-do list is a guilt
 *    machine, and the pager inside the sheet is there for anyone who actually
 *    wants to fill one in.
 *  · it asks between four in the morning and ten at night, which is the window
 *    in which "how did you sleep" is a sensible question to a person on days
 *    OR on nights. Before four you are still up; the night has not happened.
 *  · waved off, it is gone until tomorrow, and a switch in settings ends it
 *    for good.
 *  · it says nothing at all to an estate with nothing in it — a first-run
 *    screen has one job, and this is not it.
 *
 * When the estate has already PENCILLED a night in after a watch, the offer
 * changes from a request to a confirmation: the hours are drawn, and all that
 * is wanted is a yes.
 */

/** the window in which asking about last night is a sensible question */
const FROM_HOUR = 4
const TO_HOUR = 22

/**
 * Which morning the offer is about, or null when now is not a time to ask.
 * Before 04:00 the night is still in progress, so the offer looks back at
 * yesterday's — you are up at three, and the night it is asking about is the
 * one that ended before you went out.
 */
export function offerMorning(now: number): Date | null {
  const d = new Date(now)
  const h = d.getHours()
  if (h >= FROM_HOUR && h < TO_HOUR) return startOfLocalDay(d)
  if (h < FROM_HOUR) return addDays(startOfLocalDay(d), -1)
  return null
}

export function NightPrompt({ onOpen }: { onOpen: (morning: Date) => void }) {
  const now = useNow()
  const events = useEventsStore((s) => s.events)
  const notes = useSleepStore((s) => s.notes)
  const on = useSleepStore((s) => s.morningPrompt)
  const askedOn = useSleepStore((s) => s.askedOn)
  const V = voice.night.prompt

  if (!on || events.length === 0) return null
  const morning = offerMorning(now)
  if (!morning) return null
  if (askedOn === localDayKey(new Date(now))) return null

  const row = nightOf(events, notes, morning)
  // a night already written down needs nothing; a night the estate PENCILLED
  // is a suggestion waiting on a yes, which is a different sentence
  if (row && !row.pencilled) return null

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border px-4 py-2.5"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-w-sleep) 45%, transparent)',
        background: 'color-mix(in srgb, var(--color-w-sleep) 7%, transparent)',
      }}
    >
      <span
        aria-hidden
        className="font-display text-[15px] leading-none"
        style={{ color: 'var(--color-w-sleep)' }}
      >
        ☾
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-ink">
        {row ? V.pencilLine : V.line}
      </span>
      <button
        type="button"
        onClick={() => onOpen(morning)}
        className="chip min-h-9 whitespace-nowrap px-3 py-1.5 font-display text-[10.5px] font-semibold tracking-[0.16em] transition-colors"
        style={{
          borderColor: 'var(--color-w-sleep)',
          color: 'var(--color-w-sleep)',
          background: 'color-mix(in srgb, var(--color-w-sleep) 12%, transparent)',
        }}
      >
        {row ? V.pencilCta : V.cta}
      </button>
      <button
        type="button"
        onClick={() => useSleepStore.getState().declineToday(now)}
        className="min-h-9 whitespace-nowrap px-1 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
      >
        {V.dismiss}
      </button>
    </div>
  )
}
