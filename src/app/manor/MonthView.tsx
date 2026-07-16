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
 * Below md the seven columns survive as a heat/dot grid: wing dots instead
 * of text chips, the continuation chip condensed to an arrow, a strain tint
 * on sore days, and the current week carrying the accent outline.
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
  const thisWeek = new Set(
    Array.from({ length: 7 }, (_, i) =>
      localDayKey(addDays(startOfWeek(new Date(now), weekStart), i)),
    ),
  )

  // chips bucketed by local day, plus the mobile grid's condensed signals:
  // one dot per wing present that day, an arrow where a watch spills in
  const byDay = new Map<string, Chip[]>()
  const dotsByDay = new Map<string, string[]>()
  const contDays = new Set<string>()
  const push = (key: string, chip: Chip) => {
    const list = byDay.get(key) ?? []
    list.push(chip)
    byDay.set(key, list)
  }
  const dot = (key: string, color: string) => {
    const list = dotsByDay.get(key) ?? []
    if (!list.includes(color) && list.length < 3) list.push(color)
    dotsByDay.set(key, list)
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
      dot(localDayKey(s), mm.color)
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
    dot(localDayKey(s), meta.color)
    // any timed event that runs into the next day gets a continuation chip
    // there — unless the exclusive end IS that day's midnight (nothing runs
    // into the day, the event just touches its edge)
    const endsAtMidnight = en.getHours() === 0 && en.getMinutes() === 0
    if (localDayKey(en) !== localDayKey(s) && !endsAtMidnight) {
      push(localDayKey(en), {
        key: `${e.id}-cont`,
        text: `→ until ${hhmm(en)}`,
        fg: 'var(--color-ink-dim)',
        bg: 'transparent',
        italic: true,
      })
      contDays.add(localDayKey(en))
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
          const inThisWeek = thisWeek.has(key)
          const chips = byDay.get(key) ?? []
          const dots = dotsByDay.get(key) ?? []
          const sore = (strain?.get(key)?.hot.length ?? 0) > 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(day)}
              className="relative min-h-[58px] rounded-[9px] border p-1.5 text-left transition-colors hover:border-accent md:min-h-24 md:rounded-[10px] md:p-2"
              style={{
                borderColor: isToday
                  ? 'var(--color-accent)'
                  : inThisWeek
                    ? 'color-mix(in srgb, var(--color-accent) 45%, transparent)'
                    : 'var(--color-line)',
                background: sore
                  ? 'color-mix(in srgb, var(--color-danger) 9%, color-mix(in srgb, var(--color-panel) 55%, transparent))'
                  : 'color-mix(in srgb, var(--color-panel) 55%, transparent)',
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
              {contDays.has(key) && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 text-[9px] leading-none md:hidden"
                  style={{ color: 'var(--color-w-watch)' }}
                >
                  →
                </span>
              )}
              {strain?.get(key) && (
                <span className="mt-1 hidden md:block">
                  <StrainBar day={strain.get(key)!} height={3} />
                </span>
              )}
              {/* mobile: one dot per wing present */}
              <span className="mt-1.5 flex gap-[3px] md:hidden">
                {dots.map((c) => (
                  <span
                    key={c}
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="mt-1 hidden flex-col gap-[3px] md:flex">
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
      {/* mobile legend — the dots decoded */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] lowercase text-ink-dim md:hidden">
        {(['shift', 'training', 'study', 'marker'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: KIND_META[k].color }}
            />
            {KIND_META[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: 'var(--color-w-watch)' }}>→</span>
          {voice.manor.monthLegend.runsPast}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, var(--color-panel))' }}
          />
          {voice.manor.monthLegend.strain}
        </span>
      </div>
      <div className="mt-2.5 text-[11.5px] italic text-ink-dim">{voice.manor.monthNote}</div>
    </div>
  )
}
