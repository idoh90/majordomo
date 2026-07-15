import { useMemo } from 'react'
import { useEventsStore } from '../../../../core/events/store'
import { addDays, localDayKey, timeLabel } from '../../../../core/dates'
import { voice } from '../../../../core/voice'

const SHOW = 5

/** Upcoming training sessions booked on the Manor — read-only here; the
 *  Manor owns moving/removing them. Renders nothing when none are ahead. */
export function ScheduledCard({ now }: { now: number }) {
  const events = useEventsStore((s) => s.events)

  // events are stored start-ascending; keep in-progress + future sessions
  const upcoming = useMemo(
    () =>
      events.filter(
        (e) => e.kind === 'training' && !e.allDay && new Date(e.end).getTime() > now,
      ),
    [events, now],
  )

  if (upcoming.length === 0) return null

  const nowDate = new Date(now)
  const dayLabel = (iso: string) => {
    const key = localDayKey(iso)
    if (key === localDayKey(nowDate)) return 'Today'
    if (key === localDayKey(addDays(nowDate, 1))) return 'Tomorrow'
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const shown = upcoming.slice(0, SHOW)
  const more = upcoming.length - shown.length

  return (
    <div className="panel p-4">
      <div className="card-title">{voice.grounds.scheduledTitle}</div>
      <ul className="mt-2.5 flex flex-col">
        {shown.map((e) => {
          const inProgress = new Date(e.start).getTime() <= now
          return (
            <li
              key={e.id}
              className="flex items-center gap-2.5 border-b border-line py-2 text-sm last:border-0"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'var(--color-w-grounds)' }}
              />
              <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
              {inProgress ? (
                <span className="shrink-0 text-[11px] font-semibold tracking-[0.12em] text-accent">
                  NOW
                </span>
              ) : (
                <span className="shrink-0 text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
                  {dayLabel(e.start)} · {timeLabel(e.start)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {more > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-faint">+ {more} more ahead</p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        {voice.grounds.scheduledNote}
      </p>
    </div>
  )
}
