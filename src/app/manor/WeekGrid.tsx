import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '../../core/events/types'
import { SEAM_HOUR, clipToWindow, hoursOf, type ClippedEvent, type ColumnWindow } from '../../core/events/lib'
import { localDayKey } from '../../core/dates'
import { voice } from '../../core/voice'
import { KIND_META, hhmm } from './kinds'

/**
 * The duty-cycle week grid (design direction 1a): each column spans
 * seam→seam (16:00 → 16:00 next day), so a 19:00→08:00 night watch renders
 * as ONE unbroken block and midnight is a dashed accent line inside the
 * column. Events that cross the SEAM split across columns with dotted cut
 * edges. Desktop: seven columns; mobile: one duty cycle per screen behind
 * day chips + snap scrolling.
 */

const PXH = 24 // px per hour
const BODY_H = 24 * PXH

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// hour offsets from the seam for the axis + rules; midnight gets the accent
const TICKS = [0, 3, 6, 8, 12, 16, 20, 24]
const RULES = [3, 6, 8, 12, 16, 20]
const MIDNIGHT_OFFSET = (24 - SEAM_HOUR) % 24

const px = (from: Date, to: Date) => ((to.getTime() - from.getTime()) / 3_600_000) * PXH

function tickLabel(offset: number): string {
  return `${String((SEAM_HOUR + offset) % 24).padStart(2, '0')}:00`
}

interface Popover {
  event: CalendarEvent
  col: number
  y: number
}

export function WeekGrid({
  columns,
  events,
  now,
}: {
  columns: ColumnWindow[]
  events: CalendarEvent[]
  now: number
}) {
  const [popover, setPopover] = useState<Popover | null>(null)

  const clipsFor = (win: ColumnWindow): ClippedEvent[] =>
    events
      .map((e) => clipToWindow(e, win.start, win.end))
      .filter((c): c is ClippedEvent => c !== null)

  const markersFor = (win: ColumnWindow): CalendarEvent[] =>
    events.filter((e) => e.allDay && localDayKey(e.start) === localDayKey(win.day))

  const openPopover = (event: CalendarEvent, col: number, y: number) =>
    setPopover((p) => (p?.event.id === event.id ? null : { event, col, y }))

  return (
    <>
      {/* ------------------------------------------------ desktop: 7 columns */}
      <div className="hidden md:block">
        <div className="flex pl-12">
          {columns.map((win, i) => (
            <DayHeader key={i} win={win} markers={markersFor(win)} now={now} />
          ))}
        </div>
        <div className="flex">
          <TickAxis />
          <div
            className="relative flex-1 overflow-hidden rounded-xl border border-line"
            style={{ background: 'color-mix(in srgb, var(--color-panel) 55%, transparent)' }}
          >
            <Rules />
            <div className="flex">
              {columns.map((win, i) => (
                <DayBody
                  key={i}
                  win={win}
                  clips={clipsFor(win)}
                  now={now}
                  divider={i > 0}
                  selectedId={popover?.event.id}
                  onEventClick={(e, y) => openPopover(e, i, y)}
                />
              ))}
            </div>
            {popover && (
              <EventPopover
                popover={popover}
                onClose={() => setPopover(null)}
                style={{
                  left:
                    popover.col < 4
                      ? `calc(${popover.col + 1} * 100% / 7 + 6px)`
                      : `calc(${popover.col} * 100% / 7 - 242px)`,
                  top: Math.max(4, Math.min(popover.y, BODY_H - 190)),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------- mobile: one duty cycle per screen */}
      <MobileWeek
        columns={columns}
        clipsFor={clipsFor}
        markersFor={markersFor}
        now={now}
        popover={popover}
        openPopover={openPopover}
        closePopover={() => setPopover(null)}
      />
    </>
  )
}

/* ------------------------------------------------------------- pieces */

/** horizontal hour rules; midnight is the dashed accent line */
function Rules() {
  return (
    <>
      {RULES.map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute left-0 right-0 z-[1]"
          style={{
            top: h * PXH,
            borderTop:
              h === MIDNIGHT_OFFSET
                ? '1px dashed color-mix(in srgb, var(--color-accent) 45%, transparent)'
                : '1px solid color-mix(in srgb, var(--color-line) 60%, transparent)',
          }}
        />
      ))}
    </>
  )
}

function TickAxis() {
  return (
    <div className="relative w-12 flex-none" style={{ height: BODY_H }}>
      {TICKS.map((h) => (
        <div
          key={h}
          className="absolute right-2.5 -translate-y-1/2 text-[10px] tracking-[0.04em] [font-variant-numeric:tabular-nums]"
          style={{
            top: h * PXH,
            color: h === MIDNIGHT_OFFSET ? 'var(--color-accent)' : 'var(--color-ink-faint)',
          }}
        >
          {tickLabel(h)}
        </div>
      ))}
    </div>
  )
}

function DayHeader({
  win,
  markers,
  now,
}: {
  win: ColumnWindow
  markers: CalendarEvent[]
  now: number
}) {
  const isToday = localDayKey(win.day) === localDayKey(new Date(now))
  return (
    <div className="min-w-0 flex-1 px-1.5 pb-2">
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-display text-[15px] font-semibold tracking-[0.12em]"
          style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-ink)' }}
        >
          {WD[win.day.getDay()]}
        </span>
        <span
          className="text-xs [font-variant-numeric:tabular-nums]"
          style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-ink)' }}
        >
          {win.day.getDate()}
        </span>
        <span className="ml-auto truncate text-[9.5px] tracking-[0.08em] text-ink-faint">
          ▸ {WD[(win.day.getDay() + 1) % 7]}
        </span>
      </div>
      {markers.map((m) => (
        <span
          key={m.id}
          className="mt-1 inline-block rounded-[5px] px-1.5 py-px text-[10px] tracking-[0.08em]"
          style={{
            color: 'var(--color-w-ledger)',
            border: '1px solid color-mix(in srgb, var(--color-w-ledger) 55%, transparent)',
            background: 'color-mix(in srgb, var(--color-w-ledger) 10%, transparent)',
          }}
        >
          ₪ {m.title}
        </span>
      ))}
    </div>
  )
}

function DayBody({
  win,
  clips,
  now,
  divider,
  selectedId,
  onEventClick,
}: {
  win: ColumnWindow
  clips: ClippedEvent[]
  now: number
  divider: boolean
  selectedId?: string
  onEventClick: (e: CalendarEvent, y: number) => void
}) {
  const nowInCol = now >= win.start.getTime() && now < win.end.getTime()
  return (
    <div
      className="relative min-w-0 flex-1"
      style={{
        height: BODY_H,
        borderLeft: divider
          ? '1px solid color-mix(in srgb, var(--color-line) 80%, transparent)'
          : 'none',
      }}
    >
      {clips.map((c) => (
        <EventBlock
          key={c.event.id}
          clip={c}
          win={win}
          selected={selectedId === c.event.id}
          onClick={(y) => onEventClick(c.event, y)}
        />
      ))}
      {nowInCol && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-[4]"
          style={{ top: px(win.start, new Date(now)), borderTop: '1.5px solid var(--color-danger)' }}
        >
          <span
            className="absolute -top-[7px] left-1 px-1 text-[9px] [font-variant-numeric:tabular-nums]"
            style={{ color: 'var(--color-danger)', background: 'var(--color-bg)' }}
          >
            {hhmm(new Date(now))}
          </span>
        </div>
      )}
    </div>
  )
}

function EventBlock({
  clip,
  win,
  selected,
  onClick,
}: {
  clip: ClippedEvent
  win: ColumnWindow
  selected: boolean
  onClick: (y: number) => void
}) {
  const e = clip.event
  const meta = KIND_META[e.kind]
  const isRest = e.kind === 'sleep'
  const topPx = px(win.start, clip.start)
  const heightPx = px(clip.start, clip.end)
  const visibleHours = (clip.end.getTime() - clip.start.getTime()) / 3_600_000
  const fullHours = hoursOf(e)
  const twoLine = visibleHours >= 2
  const big = visibleHours >= 8
  const timeText = `${hhmm(new Date(e.start))} → ${hhmm(new Date(e.end))}`
  const cutEdge = '2px dotted color-mix(in srgb, var(--color-ink) 45%, transparent)'
  const hairline = isRest
    ? '1px dashed color-mix(in srgb, var(--color-ink-dim) 45%, transparent)'
    : `1px solid color-mix(in srgb, ${meta.color} 28%, transparent)`
  return (
    <button
      type="button"
      onClick={(ev) => onClick((ev.currentTarget as HTMLElement).offsetTop)}
      className="absolute left-[3px] right-[3px] z-[2] overflow-hidden rounded-[7px] p-0 text-left"
      style={{
        top: topPx + 1,
        height: Math.max(heightPx - 2, 12),
        borderLeft: isRest ? hairline : `3px solid ${meta.color}`,
        borderRight: hairline,
        borderTop: clip.continuesBefore ? cutEdge : hairline,
        borderBottom: clip.continuesAfter ? cutEdge : hairline,
        borderTopLeftRadius: clip.continuesBefore ? 0 : undefined,
        borderTopRightRadius: clip.continuesBefore ? 0 : undefined,
        borderBottomLeftRadius: clip.continuesAfter ? 0 : undefined,
        borderBottomRightRadius: clip.continuesAfter ? 0 : undefined,
        background: isRest
          ? 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-ink-dim) 10%, transparent) 0 4px, transparent 4px 9px)'
          : `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        outline: selected ? `1.5px solid ${meta.color}` : 'none',
        outlineOffset: 1.5,
      }}
    >
      <span className="block px-2 py-[5px]">
        <span
          className="block text-xs font-semibold leading-[1.2]"
          style={{
            whiteSpace: twoLine ? 'normal' : 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {e.title}
          {!twoLine && (
            <span className="ml-1 text-[10.5px] font-normal text-ink-dim [font-variant-numeric:tabular-nums]">
              {timeText}
            </span>
          )}
        </span>
        {twoLine && (
          <span className="block text-[11px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {timeText}
          </span>
        )}
        {big && (
          <>
            <span
              className="mt-1 block font-display text-base font-semibold [font-variant-numeric:tabular-nums]"
              style={{ color: meta.color }}
            >
              {fullHours.toFixed(1)} h
            </span>
            <span className="absolute bottom-1.5 left-2 text-[9.5px] tracking-[0.14em] text-ink-faint">
              {meta.label}
            </span>
          </>
        )}
      </span>
    </button>
  )
}

function EventPopover({
  popover,
  onClose,
  style,
}: {
  popover: Popover
  onClose: () => void
  style: React.CSSProperties
}) {
  const e = popover.event
  const meta = KIND_META[e.kind]
  const s = new Date(e.start)
  const en = new Date(e.end)
  const cross = localDayKey(s) !== localDayKey(en)
  return (
    <div
      className="menu-panel absolute z-[11] w-[236px] animate-[fade-in_160ms_ease-out] p-4"
      style={style}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
        <span className="text-sm font-bold">{e.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[13px] text-ink-dim transition-colors hover:text-ink"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 text-[12.5px] [font-variant-numeric:tabular-nums]">
        {cross
          ? `${WD[s.getDay()]} ${hhmm(s)} → ${WD[en.getDay()]} ${hhmm(en)}`
          : `${WD[s.getDay()]} · ${hhmm(s)} → ${hhmm(en)}`}
      </div>
      {cross && (
        <div className="mt-1 text-[11px] italic text-ink-dim">{voice.manor.crossesMidnight}</div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="chip px-2 py-0.5 text-[10px] tracking-[0.12em]"
          style={{
            color: meta.color,
            border: `1px solid color-mix(in srgb, ${meta.color} 50%, transparent)`,
          }}
        >
          {meta.label}
        </span>
        <span className="text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
          {hoursOf(e).toFixed(1)} h
        </span>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- mobile */

function MobileWeek({
  columns,
  clipsFor,
  markersFor,
  now,
  popover,
  openPopover,
  closePopover,
}: {
  columns: ColumnWindow[]
  clipsFor: (win: ColumnWindow) => ClippedEvent[]
  markersFor: (win: ColumnWindow) => CalendarEvent[]
  now: number
  popover: Popover | null
  openPopover: (e: CalendarEvent, col: number, y: number) => void
  closePopover: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const todayIdx = columns.findIndex((w) => now >= w.start.getTime() && now < w.end.getTime())
  const [active, setActive] = useState(todayIdx >= 0 ? todayIdx : 0)

  const goTo = (i: number) => {
    setActive(i)
    closePopover()
    const el = scrollRef.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  // position on mount (today's duty cycle) — deliberately not re-run on
  // `active` changes; goTo/onScroll own the position after mount
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = active * el.clientWidth
  }, [])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== active) {
      setActive(Math.max(0, Math.min(6, i)))
      closePopover()
    }
  }

  return (
    <div className="md:hidden">
      <div className="flex gap-1.5">
        {columns.map((win, i) => {
          const isToday = localDayKey(win.day) === localDayKey(new Date(now))
          const on = i === active
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className="chip flex-1 border py-1.5 text-center transition-colors"
              style={{
                borderColor: on ? 'var(--color-accent)' : 'var(--color-line)',
                background: on
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'transparent',
                color: on
                  ? 'var(--color-accent)'
                  : isToday
                    ? 'var(--color-ink)'
                    : 'var(--color-ink-dim)',
              }}
            >
              <span className="block text-[9px] tracking-[0.16em]">{WD[win.day.getDay()][0]}</span>
              <span className="block text-xs font-semibold [font-variant-numeric:tabular-nums]">
                {win.day.getDate()}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex">
        <TickAxis />
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-xl border border-line"
          style={{ background: 'color-mix(in srgb, var(--color-panel) 55%, transparent)' }}
        >
          {columns.map((win, i) => (
            <div key={i} className="w-full flex-none snap-center">
              <div className="flex h-8 items-center gap-2 px-2">
                <span className="font-display text-[13px] font-semibold tracking-[0.12em] text-ink">
                  {WD[win.day.getDay()]} {win.day.getDate()}
                </span>
                <span className="text-[9px] tracking-[0.08em] text-ink-faint">
                  {tickLabel(0)} → {tickLabel(24)}
                </span>
                {markersFor(win).map((m) => (
                  <span
                    key={m.id}
                    className="text-[10px]"
                    style={{ color: 'var(--color-w-ledger)' }}
                  >
                    ₪ {m.title}
                  </span>
                ))}
              </div>
              <div className="relative" style={{ height: BODY_H }}>
                <Rules />
                <DayBody
                  win={win}
                  clips={clipsFor(win)}
                  now={now}
                  divider={false}
                  selectedId={popover?.event.id}
                  onEventClick={(e, y) => openPopover(e, i, y)}
                />
                {popover && popover.col === i && (
                  <EventPopover
                    popover={popover}
                    onClose={closePopover}
                    style={{
                      left: 8,
                      right: 8,
                      width: 'auto',
                      top: Math.max(4, Math.min(popover.y, BODY_H - 190)),
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
