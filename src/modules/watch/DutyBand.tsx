import { addDays, localDayKey } from '../../core/dates'
import { clipToWindow, seamStart, type ClippedEvent } from '../../core/events/lib'
import type { CalendarEvent } from '../../core/events/types'

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** px per hour — 24 h of a fortnight has to fit beside a 300px rail */
const PXH = 13
const BODY_H = 24 * PXH
/** the rail only labels the hours you steer by */
const TICKS = [6, 12, 18]

/**
 * The fortnight, drawn.
 *
 * This replaces fourteen numbered boxes with a dot on the ones that held
 * something. The dot could tell you a day was spoken for; it could not tell
 * you that four nights in a row each ate the following morning, which is the
 * thing a roster is actually read to find out.
 *
 * Render-only on purpose: no drag, no popover, no quick-add. The Manor owns
 * editing, and a second editable calendar is a second set of bugs. Clipping
 * goes through core/events' clipToWindow — the same call the week grid makes —
 * so a night watch breaks at midnight here exactly as it does there.
 */
export function DutyBand({
  events,
  days,
  picked,
  onPick,
  now,
}: {
  events: CalendarEvent[]
  /** the fourteen local days the band covers, earliest first */
  days: Date[]
  picked: number | null
  onPick: (index: number) => void
  now: number
}) {
  const todayKey = localDayKey(new Date(now))
  const columns = days.map((day) => {
    const start = seamStart(day)
    const end = seamStart(addDays(day, 1))
    const clips = events
      .map((e) => clipToWindow(e, start, end))
      .filter((c): c is ClippedEvent => c !== null && (c.event.kind === 'shift' || c.event.kind === 'sleep'))
    return { day, start, clips }
  })

  return (
    <div className="trough mt-3 overflow-x-auto p-2.5">
      <div className="flex min-w-max">
        {/* hour rail — a sibling of the columns, sharing their top */}
        <div className="relative w-7 flex-none" style={{ paddingTop: 20 }}>
          <div className="relative" style={{ height: BODY_H }}>
            {TICKS.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[8.5px] text-ink-faint [font-variant-numeric:tabular-nums]"
                style={{ top: h * PXH }}
              >
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>

        {columns.map((col, i) => {
          const isToday = localDayKey(col.day) === todayKey
          const isPast = col.start.getTime() + 86_400_000 <= now
          const on = picked === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              aria-label={`${col.day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}${col.clips.length ? ', on duty' : ''}`}
              aria-pressed={on}
              className="group relative min-w-[44px] flex-1 rounded-[7px] px-px transition-colors"
              style={{
                background: on ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
                outline: on ? '1px solid var(--color-accent)' : 'none',
              }}
            >
              <div
                className="flex flex-col items-center leading-none"
                style={{ height: 20 }}
              >
                <span
                  className="text-[8.5px] tracking-[0.14em]"
                  style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-ink-faint)' }}
                >
                  {WD[col.day.getDay()]}
                </span>
                <span
                  className="mt-0.5 font-display text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-ink-dim)' }}
                >
                  {col.day.getDate()}
                </span>
              </div>
              <div
                className="relative mx-px rounded-[5px]"
                style={{
                  height: BODY_H,
                  background: 'color-mix(in srgb, var(--color-panel) 45%, transparent)',
                  borderLeft: '1px solid color-mix(in srgb, var(--color-line) 70%, transparent)',
                }}
              >
                {col.clips.map((clip) => {
                  const isRest = clip.event.kind === 'sleep'
                  const top = (clip.start.getTime() - col.start.getTime()) / 3_600_000
                  const h = (clip.end.getTime() - clip.start.getTime()) / 3_600_000
                  return (
                    <span
                      key={`${clip.event.id}-${top}`}
                      className={[
                        'block absolute left-px right-px rounded-[3px]',
                        isRest && 'block-hatch',
                        // the morning half of a night watch is the quieter one
                        clip.continuesBefore && 'block-cut-before block-dim',
                        clip.continuesAfter && 'block-cut-after',
                        isPast && !clip.continuesBefore && 'block-dim',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        ['--block-accent' as string]: isRest
                          ? 'var(--color-ink-dim)'
                          : 'var(--color-w-watch)',
                        top: top * PXH,
                        height: Math.max(h * PXH, 3),
                      }}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
