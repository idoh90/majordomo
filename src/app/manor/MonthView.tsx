import type { CalendarEvent } from '../../core/events/types'
import { addDays, localDayKey, startOfWeek, type WeekStart } from '../../core/dates'
import { voice } from '../../core/voice'
import { KIND_META, hhmm, markerMeta } from './kinds'
import { StrainBar } from './StrainBar'
import type { DayStrain } from './strain'

/**
 * Month view — chips per calendar day. A night watch is written on the day
 * it begins; the morning it spills into carries a "→ until" reminder chip
 * (the design's continuation convention). Sleep stays off the month view.
 */

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MO_LONG = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]

export function monthLabel(anchor: Date): string {
  return `${MO_LONG[anchor.getMonth()]} ${anchor.getFullYear()}`
}

/** the 42 days the month grid draws — shared with the Manor so it can score
 *  each cell's strain without re-deriving the grid */
export function monthCells(anchor: Date, weekStart: WeekStart): Date[] {
  const gridStart = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1), weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

interface Chip {
  key: string
  text: string
  fg: string
  bg: string
  solid?: boolean
  italic?: boolean
}

export function MonthView({
  anchor,
  events,
  now,
  weekStart,
  strain,
  onOpenDay,
}: {
  anchor: Date
  events: CalendarEvent[]
  now: number
  weekStart: WeekStart
  /** strain per cell, keyed by local day; null until anything is logged */
  strain?: Map<string, DayStrain> | null
  onOpenDay: (day: Date) => void
}) {
  const cells = monthCells(anchor, weekStart)
  const todayKey = localDayKey(new Date(now))

  // chips bucketed by local day
  const byDay = new Map<string, Chip[]>()
  const push = (key: string, chip: Chip) => {
    const list = byDay.get(key) ?? []
    list.push(chip)
    byDay.set(key, list)
  }
  for (const e of events) {
    if (e.kind === 'sleep') continue
    const meta = KIND_META[e.kind]
    const s = new Date(e.start)
    if (e.allDay) {
      const mm = markerMeta(e)
      push(localDayKey(s), {
        key: e.id,
        text: mm.glyph ? `${mm.glyph} ${e.title}` : e.title,
        fg: mm.color,
        bg: `color-mix(in srgb, ${mm.color} 14%, transparent)`,
      })
      continue
    }
    const en = new Date(e.end)
    const isShift = e.kind === 'shift'
    push(localDayKey(s), {
      key: e.id,
      text: isShift ? `${e.title} ${hhmm(s)}→${hhmm(en)}` : e.title,
      fg: isShift ? 'var(--color-bg)' : meta.color,
      bg: isShift ? meta.color : `color-mix(in srgb, ${meta.color} 13%, transparent)`,
      solid: isShift,
    })
    if (isShift && localDayKey(en) !== localDayKey(s)) {
      push(localDayKey(en), {
        key: `${e.id}-cont`,
        text: `→ until ${hhmm(en)}`,
        fg: 'var(--color-ink-dim)',
        bg: 'transparent',
        italic: true,
      })
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => WD[(i + weekStart) % 7]).map((name) => (
          <div key={name} className="pl-2 text-[10px] tracking-[0.2em] text-ink-dim">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day) => {
          const key = localDayKey(day)
          const inMonth = day.getMonth() === anchor.getMonth()
          const isToday = key === todayKey
          const chips = byDay.get(key) ?? []
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(day)}
              className="min-h-24 rounded-[10px] border p-2 text-left transition-colors hover:border-accent"
              style={{
                borderColor: isToday ? 'var(--color-accent)' : 'var(--color-line)',
                background: 'color-mix(in srgb, var(--color-panel) 55%, transparent)',
                opacity: inMonth ? 1 : 0.35,
              }}
            >
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11.5px] [font-variant-numeric:tabular-nums]"
                style={{
                  color: isToday ? 'var(--color-bg)' : 'var(--color-ink-dim)',
                  background: isToday ? 'var(--color-accent)' : 'transparent',
                }}
              >
                {day.getDate()}
              </span>
              {strain?.get(key) && (
                <span className="mt-1 block">
                  <StrainBar day={strain.get(key)!} height={3} />
                </span>
              )}
              <span className="mt-1 flex flex-col gap-[3px]">
                {chips.slice(0, 3).map((c) => (
                  <span
                    key={c.key}
                    className="overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 py-0.5 text-[9.5px] tracking-[0.03em] [font-variant-numeric:tabular-nums]"
                    style={{
                      color: c.fg,
                      background: c.bg,
                      fontStyle: c.italic ? 'italic' : 'normal',
                    }}
                  >
                    {c.text}
                  </span>
                ))}
                {chips.length > 3 && (
                  <span className="px-1.5 text-[9.5px] text-ink-faint">+{chips.length - 3}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-2.5 text-[11.5px] italic text-ink-dim">{voice.manor.monthNote}</div>
    </div>
  )
}
