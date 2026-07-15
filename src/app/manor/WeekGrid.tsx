import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CalendarEvent, EventKind } from '../../core/events/types'
import {
  SEAM_HOUR,
  clipToWindow,
  hoursOf,
  overlaps,
  type ClippedEvent,
  type ColumnWindow,
} from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import { localDayKey } from '../../core/dates'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { voice } from '../../core/voice'
import { KIND_META, hhmm } from './kinds'
import { StrainBar } from './StrainBar'
import type { DayStrain } from './strain'

/**
 * The duty-cycle week grid (design direction 1a): each column spans
 * seam→seam (16:00 → 16:00 next day), so a 19:00→08:00 night watch renders
 * as ONE unbroken block and midnight is a dashed accent line inside the
 * column. Events that cross the SEAM split across columns with dotted cut
 * edges. Desktop: seven columns with drag-to-move (0.5h snap, occupancy
 * check, cross-day confirm, single-slot undo) and click-to-quick-add;
 * mobile: one duty cycle per screen behind day chips + snap scrolling
 * (tap for popover/quick-add; mobile drag is backlog).
 */

const PXH = 24 // px per hour
const BODY_H = 24 * PXH

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// hour offsets from the seam for the axis + rules; midnight gets the accent
const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24]
const RULES = [3, 6, 9, 12, 15, 18, 21]
/** does this offset from the seam land on midnight? (with SEAM_HOUR = 0 the
 *  column edges themselves are midnight, so no rule is drawn mid-column) */
const isMidnight = (offset: number) => (SEAM_HOUR + offset) % 24 === 0

const px = (from: Date, to: Date) => ((to.getTime() - from.getTime()) / 3_600_000) * PXH
const HOUR_MS = 3_600_000

/** stable identity for the "no ghosts" case — a fresh [] would defeat DayBody's memo */
const EMPTY_CLIPS: ClippedEvent[] = []

function tickLabel(offset: number): string {
  return `${String((SEAM_HOUR + offset) % 24).padStart(2, '0')}:00`
}

interface Popover {
  event: CalendarEvent
  col: number
  y: number
}

interface QuickAdd {
  col: number
  /** snapped hours from the column seam */
  ts: number
  y: number
}

interface DragState {
  id: string
  tc: number
  ts: number
  durH: number
  valid: boolean
  fromCol: number
  title: string
  kind: EventKind
  /** column width in px, measured once at grab — lets the ghost and the column
   *  highlight position themselves with `transform` instead of `left`/`top` */
  colW: number
}

interface MoveConfirm {
  id: string
  start: Date
  durH: number
  body: string
}

type LastAction =
  | { type: 'move'; id: string; prev: { start: string; end: string } }
  | { type: 'add'; id: string }
  | { type: 'delete'; event: CalendarEvent }

export function WeekGrid({
  columns,
  events,
  now,
  strain,
  sandbox = false,
  ghosts = [],
  changedIds,
}: {
  columns: ColumnWindow[]
  events: CalendarEvent[]
  now: number
  /** per-column strain from the Grounds' engine; null until anything is logged */
  strain?: DayStrain[] | null
  /** what-if rehearsal active: silent draft mutations, no confirms/toasts */
  sandbox?: boolean
  /** committed originals of changed events, rendered as dashed pencil marks */
  ghosts?: CalendarEvent[]
  changedIds?: ReadonlySet<string>
}) {
  const addEvent = useEventsStore((s) => s.addEvent)
  const updateEvent = useEventsStore((s) => s.updateEvent)
  const deleteEvent = useEventsStore((s) => s.deleteEvent)

  const [popover, setPopover] = useState<Popover | null>(null)
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [confirm, setConfirm] = useState<MoveConfirm | null>(null)
  const [toast, setToast] = useState<{ msg: string; undo: boolean } | null>(null)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickUntil = useRef(0)

  const butler = (msg: string, undo = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, undo })
    toastTimer.current = setTimeout(() => setToast(null), 5_200)
  }
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  // Clipping is per (column × event) work. Memoized so a drag — which re-renders
  // WeekGrid on every frame — hands the memoized DayBody/EventBlock children the
  // SAME array identities and they bail out of re-rendering entirely.
  const clipsByCol = useMemo(
    () =>
      columns.map((win) =>
        events
          .map((e) => clipToWindow(e, win.start, win.end))
          .filter((c): c is ClippedEvent => c !== null),
      ),
    [columns, events],
  )
  const ghostsByCol = useMemo(
    () =>
      columns.map((win) =>
        ghosts
          .map((e) => clipToWindow(e, win.start, win.end))
          .filter((c): c is ClippedEvent => c !== null),
      ),
    [columns, ghosts],
  )
  const markersByCol = useMemo(
    () =>
      columns.map((win) =>
        events.filter((e) => e.allDay && localDayKey(e.start) === localDayKey(win.day)),
      ),
    [columns, events],
  )

  const openPopover = (event: CalendarEvent, col: number, y: number) => {
    if (Date.now() < suppressClickUntil.current) return
    setQuickAdd(null)
    setPopover((p) => (p?.event.id === event.id ? null : { event, col, y }))
  }

  /** is a [tc, ts, ts+durH) slot free of every other timed event? */
  const slotFree = (ignoreId: string | null, tc: number, ts: number, durH: number): boolean => {
    const start = new Date(columns[tc].start.getTime() + ts * HOUR_MS)
    const end = new Date(start.getTime() + durH * HOUR_MS)
    return !events.some(
      (e) =>
        !e.allDay &&
        e.id !== ignoreId &&
        overlaps(new Date(e.start), new Date(e.end), start, end),
    )
  }

  /* ------------------------------------------------------------ mutations */

  const applyMove = (id: string, start: Date, durH: number) => {
    const prev = events.find((e) => e.id === id)
    if (!prev) return
    updateEvent(id, {
      start: start.toISOString(),
      end: new Date(start.getTime() + durH * HOUR_MS).toISOString(),
    })
    if (!sandbox) {
      setLastAction({ type: 'move', id, prev: { start: prev.start, end: prev.end } })
      butler(voice.manor.moved, true)
    }
  }

  const undo = () => {
    if (!lastAction) return
    if (lastAction.type === 'move') updateEvent(lastAction.id, lastAction.prev)
    else if (lastAction.type === 'add') deleteEvent(lastAction.id)
    else {
      // re-book the removed event under its original id
      const { updatedAt: _updatedAt, ...rest } = lastAction.event
      addEvent(rest)
    }
    setLastAction(null)
    butler(voice.manor.restored)
  }

  const removeEvent = (id: string) => {
    const e = events.find((x) => x.id === id)
    if (!e) return
    deleteEvent(id)
    setPopover(null)
    if (!sandbox) {
      setLastAction({ type: 'delete', event: e })
      butler(voice.manor.removed, true)
    }
  }

  const finishDrag = (d: DragState) => {
    setDrag(null)
    dragRef.current = null
    if (!d.valid) {
      butler(voice.manor.occupied)
      return
    }
    const e = events.find((x) => x.id === d.id)
    if (!e) return
    const newStart = new Date(columns[d.tc].start.getTime() + d.ts * HOUR_MS)
    if (newStart.getTime() === new Date(e.start).getTime()) return
    if (d.tc !== d.fromCol && !sandbox) {
      const newEnd = new Date(newStart.getTime() + d.durH * HOUR_MS)
      const s = new Date(e.start)
      const en = new Date(e.end)
      setConfirm({
        id: d.id,
        start: newStart,
        durH: d.durH,
        body: voice.manor.moveBody({
          title: e.title,
          from: `${WD[s.getDay()]} ${hhmm(s)} → ${hhmm(en)}`,
          to: `${WD[newStart.getDay()]} ${hhmm(newStart)} → ${hhmm(newEnd)}`,
        }),
      })
      return
    }
    applyMove(d.id, newStart, d.durH)
  }

  /* ----------------------------------------------------------- drag start */

  const onBlockPointerDown = (e: CalendarEvent, ev: React.PointerEvent) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const s = new Date(e.start)
    const fromCol = columns.findIndex((w) => s >= w.start && s < w.end)
    if (fromCol < 0) return // starts before this week's window — not draggable here
    const startOffsetH = (s.getTime() - columns[fromCol].start.getTime()) / HOUR_MS
    const grabH = (ev.clientY - rect.top) / PXH - startOffsetH
    const durH = hoursOf(e)
    const startX = ev.clientX
    const startY = ev.clientY
    const colW = rect.width / 7
    let moved = false

    // pointermove fires faster than the display refreshes (high-poll mice fire
    // several times per frame). Coalesce to one setDrag per animation frame —
    // otherwise every extra event buys a wasted React render nothing can paint.
    let raf = 0
    let pendingX = 0
    let pendingY = 0

    const apply = () => {
      raf = 0
      const x = pendingX - rect.left
      const y = pendingY - rect.top
      const tc = Math.max(0, Math.min(6, Math.floor(x / colW)))
      let ts = Math.round((y / PXH - grabH) * 2) / 2
      ts = Math.max(0, Math.min(24 - durH, ts))
      const prev = dragRef.current
      if (prev && prev.tc === tc && prev.ts === ts) return // snapped to the same slot
      const next: DragState = {
        id: e.id,
        tc,
        ts,
        durH,
        valid: slotFree(e.id, tc, ts, durH),
        fromCol,
        title: e.title,
        kind: e.kind,
        colW,
      }
      dragRef.current = next
      setDrag(next)
    }

    const mm = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - startX, m.clientY - startY) < 5) return
      if (!moved) {
        moved = true
        setPopover(null)
        setQuickAdd(null)
      }
      pendingX = m.clientX
      pendingY = m.clientY
      if (!raf) raf = requestAnimationFrame(apply)
      m.preventDefault()
    }
    const mu = () => {
      window.removeEventListener('pointermove', mm)
      window.removeEventListener('pointerup', mu)
      if (raf) {
        cancelAnimationFrame(raf)
        apply() // flush the last frame so the drop lands where the pointer is
      }
      if (!moved) return // plain click → the block's onClick opens the popover
      suppressClickUntil.current = Date.now() + 250
      const d = dragRef.current
      if (d) finishDrag(d)
    }
    window.addEventListener('pointermove', mm)
    window.addEventListener('pointerup', mu)
  }

  /* Stable identities for everything handed to a memoized child: the handlers
     themselves are re-created each render (they close over `events`), so route
     them through a ref — the children then never re-render during a drag. */
  const latest = useRef({ onBlockPointerDown, openPopover })
  latest.current = { onBlockPointerDown, openPopover }
  const handleBlockPointerDown = useCallback(
    (e: CalendarEvent, ev: React.PointerEvent) => latest.current.onBlockPointerDown(e, ev),
    [],
  )
  const handleEventClick = useCallback(
    (col: number, e: CalendarEvent, y: number) => latest.current.openPopover(e, col, y),
    [],
  )

  /* ------------------------------------------------------------ quick-add */

  const onColumnClick = (col: number, ev: React.MouseEvent) => {
    if (Date.now() < suppressClickUntil.current) return
    if ((ev.target as HTMLElement).closest('[data-event-block]')) return
    if (popover) {
      setPopover(null)
      return
    }
    if (quickAdd) {
      setQuickAdd(null)
      return
    }
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    const y = ev.clientY - rect.top
    let ts = Math.floor((y / PXH) * 2) / 2
    ts = Math.max(0, Math.min(23.5, ts))
    setQuickAdd({ col, ts, y })
  }

  const quickAddPick = (tpl: { kind: EventKind; title: string; hours: number }) => {
    if (!quickAdd) return
    const ts = Math.min(quickAdd.ts, 24 - tpl.hours)
    if (!slotFree(null, quickAdd.col, ts, tpl.hours)) {
      butler(voice.manor.occupied)
      setQuickAdd(null)
      return
    }
    const start = new Date(columns[quickAdd.col].start.getTime() + ts * HOUR_MS)
    const added = addEvent({
      source: 'manual',
      kind: tpl.kind,
      title: tpl.title,
      start: start.toISOString(),
      end: new Date(start.getTime() + tpl.hours * HOUR_MS).toISOString(),
    })
    setQuickAdd(null)
    if (!sandbox) {
      setLastAction({ type: 'add', id: added.id })
      butler(voice.manor.onTheBooks, true)
    }
  }

  /* -------------------------------------------------------------- render */

  return (
    <>
      {/* ------------------------------------------------ desktop: 7 columns */}
      <div className="hidden md:block">
        <div className="flex pl-12">
          {columns.map((win, i) => (
            <DayHeader
              key={i}
              win={win}
              markers={markersByCol[i]}
              strain={strain?.[i]}
              now={now}
            />
          ))}
        </div>
        <div className="flex">
          <TickAxis />
          <div
            ref={boxRef}
            className="relative flex-1 overflow-hidden rounded-xl"
            style={{
              border: sandbox ? '1px dashed var(--color-accent)' : '1px solid var(--color-line)',
              boxShadow: sandbox ? '0 0 34px var(--glow-accent)' : 'none',
              transition: 'box-shadow 250ms',
              background: 'color-mix(in srgb, var(--color-panel) 55%, transparent)',
            }}
          >
            <Rules />
            {drag && (
              <div
                className="pointer-events-none absolute bottom-0 left-0 top-0"
                style={{
                  width: drag.colW,
                  transform: `translate3d(${drag.tc * drag.colW}px, 0, 0)`,
                  background: drag.valid
                    ? 'color-mix(in srgb, var(--color-accent) 5%, transparent)'
                    : 'color-mix(in srgb, var(--color-danger) 6%, transparent)',
                  transition: 'transform 120ms ease-out',
                }}
              />
            )}
            <div className="flex">
              {columns.map((win, i) => (
                <div key={i} className="min-w-0 flex-1" onClick={(ev) => onColumnClick(i, ev)}>
                  <DayBody
                    col={i}
                    win={win}
                    clips={clipsByCol[i]}
                    ghostClips={ghostsByCol[i]}
                    changedIds={changedIds}
                    now={now}
                    divider={i > 0}
                    selectedId={popover?.event.id}
                    dragId={drag?.id}
                    onEventClick={handleEventClick}
                    onEventPointerDown={handleBlockPointerDown}
                  />
                </div>
              ))}
            </div>
            {drag && <DragGhost drag={drag} columns={columns} />}
            {popover && (
              <EventPopover
                popover={popover}
                onClose={() => setPopover(null)}
                onDelete={() => removeEvent(popover.event.id)}
                style={{
                  left:
                    popover.col < 4
                      ? `calc(${popover.col + 1} * 100% / 7 + 6px)`
                      : `calc(${popover.col} * 100% / 7 - 242px)`,
                  top: Math.max(4, Math.min(popover.y, BODY_H - 232)),
                }}
              />
            )}
            {quickAdd && (
              <QuickAddPopover
                quickAdd={quickAdd}
                columns={columns}
                onPick={quickAddPick}
                onClose={() => setQuickAdd(null)}
                style={{
                  left:
                    quickAdd.col < 4
                      ? `calc(${quickAdd.col + 1} * 100% / 7 + 6px)`
                      : `calc(${quickAdd.col} * 100% / 7 - 218px)`,
                  top: Math.max(4, Math.min(quickAdd.y, BODY_H - 236)),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------- mobile: one duty cycle per screen */}
      <MobileWeek
        columns={columns}
        clipsByCol={clipsByCol}
        ghostsByCol={ghostsByCol}
        changedIds={changedIds}
        markersByCol={markersByCol}
        strain={strain}
        now={now}
        popover={popover}
        onEventClick={handleEventClick}
        closePopover={() => setPopover(null)}
        onDeleteEvent={removeEvent}
        quickAdd={quickAdd}
        onColumnClick={onColumnClick}
        quickAddPick={quickAddPick}
        closeQuickAdd={() => setQuickAdd(null)}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={voice.manor.moveTitle}
        message={confirm?.body ?? ''}
        confirmLabel={voice.manor.moveYes}
        onCancel={() => {
          setConfirm(null)
          butler(voice.manor.asYouWere)
        }}
        onConfirm={() => {
          if (confirm) applyMove(confirm.id, confirm.start, confirm.durH)
          setConfirm(null)
        }}
      />

      {toast && (
        <div className="menu-panel fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3.5 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out]">
          {toast.msg}
          {toast.undo && lastAction && (
            <button
              type="button"
              onClick={undo}
              className="font-bold tracking-[0.14em] text-accent hover:underline"
            >
              {voice.manor.undoLabel}
            </button>
          )}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------- pieces */

/** horizontal hour rules; midnight is the dashed accent line */
const Rules = memo(function Rules() {
  return (
    <>
      {RULES.map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute left-0 right-0 z-[1]"
          style={{
            top: h * PXH,
            borderTop: isMidnight(h)
              ? '1px dashed color-mix(in srgb, var(--color-accent) 45%, transparent)'
              : '1px solid color-mix(in srgb, var(--color-line) 60%, transparent)',
          }}
        />
      ))}
    </>
  )
})

const TickAxis = memo(function TickAxis() {
  return (
    <div className="relative w-12 flex-none" style={{ height: BODY_H }}>
      {TICKS.map((h) => (
        <div
          key={h}
          className="absolute right-2.5 -translate-y-1/2 text-[10px] tracking-[0.04em] [font-variant-numeric:tabular-nums]"
          style={{
            top: h * PXH,
            color: isMidnight(h) ? 'var(--color-accent)' : 'var(--color-ink-faint)',
          }}
        >
          {tickLabel(h)}
        </div>
      ))}
    </div>
  )
})

const DayHeader = memo(function DayHeader({
  win,
  markers,
  strain,
  now,
}: {
  win: ColumnWindow
  markers: CalendarEvent[]
  strain?: DayStrain
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
      </div>
      {strain && (
        <div className="mt-1.5">
          <StrainBar day={strain} />
        </div>
      )}
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
})

const DayBody = memo(function DayBody({
  col,
  win,
  clips,
  ghostClips = EMPTY_CLIPS,
  changedIds,
  now,
  divider,
  selectedId,
  dragId,
  onEventClick,
  onEventPointerDown,
}: {
  col: number
  win: ColumnWindow
  clips: ClippedEvent[]
  ghostClips?: ClippedEvent[]
  changedIds?: ReadonlySet<string>
  now: number
  divider: boolean
  selectedId?: string
  dragId?: string
  onEventClick: (col: number, e: CalendarEvent, y: number) => void
  onEventPointerDown?: (e: CalendarEvent, ev: React.PointerEvent) => void
}) {
  const nowInCol = now >= win.start.getTime() && now < win.end.getTime()
  return (
    <div
      className="relative min-w-0"
      style={{
        height: BODY_H,
        borderLeft: divider
          ? '1px solid color-mix(in srgb, var(--color-line) 80%, transparent)'
          : 'none',
      }}
    >
      {ghostClips.map((c) => (
        <GhostBlock key={`ghost-${c.event.id}`} clip={c} win={win} />
      ))}
      {clips.map((c) => (
        <EventBlock
          key={c.event.id}
          col={col}
          clip={c}
          win={win}
          selected={selectedId === c.event.id}
          changed={changedIds?.has(c.event.id) ?? false}
          dimmed={dragId === c.event.id}
          onClick={onEventClick}
          onPointerDown={onEventPointerDown}
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
})

const EventBlock = memo(function EventBlock({
  col,
  clip,
  win,
  selected,
  changed = false,
  dimmed,
  onClick,
  onPointerDown,
}: {
  col: number
  clip: ClippedEvent
  win: ColumnWindow
  selected: boolean
  changed?: boolean
  dimmed: boolean
  onClick: (col: number, e: CalendarEvent, y: number) => void
  onPointerDown?: (e: CalendarEvent, ev: React.PointerEvent) => void
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
      data-event-block
      onClick={(ev) => onClick(col, e, (ev.currentTarget as HTMLElement).offsetTop)}
      onPointerDown={onPointerDown ? (ev) => onPointerDown(e, ev) : undefined}
      className="absolute left-[3px] right-[3px] z-[2] select-none overflow-hidden rounded-[7px] p-0 text-left"
      style={{
        top: topPx + 1,
        height: Math.max(heightPx - 2, 12),
        cursor: onPointerDown ? 'grab' : 'pointer',
        touchAction: onPointerDown ? 'none' : undefined,
        opacity: dimmed ? 0.3 : 1,
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
        outline: selected
          ? `1.5px solid ${meta.color}`
          : changed
            ? '1.5px solid var(--color-accent)'
            : 'none',
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
})

/** the committed original of a rehearsed change — kept in pencil */
const GhostBlock = memo(function GhostBlock({
  clip,
  win,
}: {
  clip: ClippedEvent
  win: ColumnWindow
}) {
  const meta = KIND_META[clip.event.kind]
  return (
    <div
      className="pointer-events-none absolute left-[3px] right-[3px] z-[1] overflow-hidden rounded-[7px] px-2 py-[5px]"
      style={{
        top: px(win.start, clip.start) + 1,
        height: Math.max(px(clip.start, clip.end) - 2, 12),
        border: `1.5px dashed ${meta.color}`,
        opacity: 0.32,
      }}
    >
      <div className="text-xs font-semibold leading-[1.2]">{clip.event.title}</div>
      <div className="text-[11px] text-ink-dim [font-variant-numeric:tabular-nums]">
        {hhmm(new Date(clip.event.start))} → {hhmm(new Date(clip.event.end))}
      </div>
    </div>
  )
})

/** the lifted copy that follows the pointer during a drag. Position is a
 *  `transform` (compositor-only) — the old `left`/`top` transition re-laid-out
 *  the block on every frame of the drag, which is what made it feel sticky. */
function DragGhost({ drag, columns }: { drag: DragState; columns: ColumnWindow[] }) {
  const meta = KIND_META[drag.kind]
  const start = new Date(columns[drag.tc].start.getTime() + drag.ts * HOUR_MS)
  const end = new Date(start.getTime() + drag.durH * HOUR_MS)
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[6] rounded-[7px] px-2 py-[5px]"
      style={{
        width: drag.colW - 6,
        height: drag.durH * PXH - 2,
        transform: `translate3d(${drag.tc * drag.colW + 3}px, ${drag.ts * PXH + 1}px, 0) scale(1.02)`,
        willChange: 'transform',
        border: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        background: drag.valid
          ? `color-mix(in srgb, ${meta.color} 26%, var(--color-panel-2))`
          : 'color-mix(in srgb, var(--color-danger) 22%, var(--color-panel-2))',
        boxShadow: drag.valid
          ? '0 14px 34px rgb(0 0 0 / 0.5), 0 0 18px var(--glow-accent)'
          : '0 14px 34px rgb(0 0 0 / 0.5)',
        transition: 'transform 90ms ease-out',
      }}
    >
      <div className="text-xs font-semibold leading-[1.2]">{drag.title}</div>
      <div
        className="text-[11px] [font-variant-numeric:tabular-nums]"
        style={{ color: drag.valid ? 'var(--color-ink-dim)' : 'var(--color-danger)' }}
      >
        {drag.valid
          ? `${WD[start.getDay()]} ${hhmm(start)} → ${hhmm(end)}`
          : voice.manor.occupiedShort}
      </div>
    </div>
  )
}

function EventPopover({
  popover,
  onClose,
  onDelete,
  style,
}: {
  popover: Popover
  onClose: () => void
  onDelete: () => void
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
      <button
        type="button"
        onClick={onDelete}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11.5px] font-semibold tracking-[0.12em] text-danger transition-colors hover:bg-panel-2"
        style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {voice.manor.removeLabel}
      </button>
    </div>
  )
}

function QuickAddPopover({
  quickAdd,
  columns,
  onPick,
  onClose,
  style,
}: {
  quickAdd: QuickAdd
  columns: ColumnWindow[]
  onPick: (tpl: { kind: EventKind; title: string; hours: number }) => void
  onClose: () => void
  style: React.CSSProperties
}) {
  const when = new Date(columns[quickAdd.col].start.getTime() + quickAdd.ts * HOUR_MS)
  return (
    <div
      className="menu-panel absolute z-[11] w-[212px] animate-[fade-in_160ms_ease-out] p-3.5"
      style={style}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-bold [font-variant-numeric:tabular-nums]">
          {WD[when.getDay()]} · {hhmm(when)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[13px] text-ink-dim transition-colors hover:text-ink"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {voice.manor.templates.map((tpl) => {
          const meta = KIND_META[tpl.kind]
          return (
            <button
              key={tpl.title}
              type="button"
              onClick={() => onPick(tpl)}
              className="card flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors"
              style={{ borderColor: undefined }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = meta.color)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '')}
            >
              <span
                className="h-[7px] w-[7px] flex-none rounded-full"
                style={{ background: meta.color }}
              />
              {tpl.title}
              <span className="ml-auto text-[10.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                {tpl.hours.toFixed(1)} h
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- mobile */

function MobileWeek({
  columns,
  clipsByCol,
  ghostsByCol,
  changedIds,
  markersByCol,
  strain,
  now,
  popover,
  onEventClick,
  closePopover,
  onDeleteEvent,
  quickAdd,
  onColumnClick,
  quickAddPick,
  closeQuickAdd,
}: {
  columns: ColumnWindow[]
  clipsByCol: ClippedEvent[][]
  ghostsByCol: ClippedEvent[][]
  changedIds?: ReadonlySet<string>
  markersByCol: CalendarEvent[][]
  strain?: DayStrain[] | null
  now: number
  popover: Popover | null
  onEventClick: (col: number, e: CalendarEvent, y: number) => void
  closePopover: () => void
  onDeleteEvent: (id: string) => void
  quickAdd: QuickAdd | null
  onColumnClick: (col: number, ev: React.MouseEvent) => void
  quickAddPick: (tpl: { kind: EventKind; title: string; hours: number }) => void
  closeQuickAdd: () => void
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
              {strain?.[i] && (
                <span className="mt-1 block px-0.5">
                  <StrainBar day={strain[i]} height={3} />
                </span>
              )}
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
                {markersByCol[i].map((m) => (
                  <span
                    key={m.id}
                    className="text-[10px]"
                    style={{ color: 'var(--color-w-ledger)' }}
                  >
                    ₪ {m.title}
                  </span>
                ))}
              </div>
              <div className="relative" style={{ height: BODY_H }} onClick={(ev) => onColumnClick(i, ev)}>
                <Rules />
                <DayBody
                  col={i}
                  win={win}
                  clips={clipsByCol[i]}
                  ghostClips={ghostsByCol[i]}
                  changedIds={changedIds}
                  now={now}
                  divider={false}
                  selectedId={popover?.event.id}
                  onEventClick={onEventClick}
                />
                {popover && popover.col === i && (
                  <EventPopover
                    popover={popover}
                    onClose={closePopover}
                    onDelete={() => onDeleteEvent(popover.event.id)}
                    style={{
                      left: 8,
                      right: 8,
                      width: 'auto',
                      top: Math.max(4, Math.min(popover.y, BODY_H - 232)),
                    }}
                  />
                )}
                {quickAdd && quickAdd.col === i && (
                  <QuickAddPopover
                    quickAdd={quickAdd}
                    columns={columns}
                    onPick={quickAddPick}
                    onClose={closeQuickAdd}
                    style={{
                      left: 8,
                      right: 8,
                      width: 'auto',
                      top: Math.max(4, Math.min(quickAdd.y, BODY_H - 236)),
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
