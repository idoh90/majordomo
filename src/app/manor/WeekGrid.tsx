import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { useIsMobile } from '../useIsMobile'
import { KIND_META, eventMeta, hhmm, markerMeta } from './kinds'
import { ManorLegend } from './Legend'
import { CustomEventForm } from './fields'
import { EventEditSheet, MobileEventSheet, MobileQuickAddSheet } from './MobileSheets'
import { nearWatch } from './nearWatch'
import { StrainBar } from './StrainBar'
import type { DayStrain } from './strain'
import { useManorUi } from './uiStore'

/**
 * The week grid. Columns span seam→seam; with SEAM_HOUR = 0 that is the
 * ordinary calendar day (00:00 → 00:00), so a 19:00→08:00 night watch splits
 * across its two columns with dotted "continues" edges (the data is never
 * day-bucketed, only its rendering — a duty-cycle seam stays one constant
 * away). Desktop: seven columns with drag-to-move (0.5h snap, occupancy
 * check, cross-day confirm, single-slot undo) and click-to-quick-add;
 * mobile: one duty cycle per screen behind day chips + snap scrolling — tap
 * opens bottom sheets, long-press (350 ms) lifts a block into the mobile
 * drag: 0.5 h snap with a live time badge, cross-day by dragging onto a day
 * chip, escape strip to cancel, drops through the same confirm/undo pipeline.
 */

const PXH = 24 // px per hour
const BODY_H = 24 * PXH

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// hour offsets from the seam for the axis + rules; midnight ticks get the accent
const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24]
const RULES = [3, 6, 9, 12, 15, 18, 21]
/** does this offset from the seam land on midnight? (with SEAM_HOUR = 0 the
 *  column edges themselves are midnight, so no rule is drawn mid-column) */
const isMidnight = (offset: number) => (SEAM_HOUR + offset) % 24 === 0

const px = (from: Date, to: Date) => ((to.getTime() - from.getTime()) / 3_600_000) * PXH
const HOUR_MS = 3_600_000

/**
 * Where a dragged block may START, in hours from the column seam.
 *
 * The START is the only thing a drag clamps: to the column, and to the 0.5 h
 * grid. It must NEVER be pulled back to make the block fit inside one day —
 * a 19:00 night watch simply crosses midnight and the grid splits it at the
 * seam. Clamping to `24 - durH` instead rewrote a 13 h watch's start on any
 * nudge, silently committing 19:00→08:00 as 11:00→00:00.
 *
 * This is the rule quickAddPick already documents; routing every drag site
 * through one helper is what makes drag and quick-add finally agree.
 */
const clampStart = (ts: number) => Math.max(0, Math.min(23.5, ts))

/** the dotted seam edge, shared by clipped blocks and by crossing drag ghosts */
const CUT_EDGE = '2px dotted color-mix(in srgb, var(--color-ink) 45%, transparent)'

/** stable identity for the "no ghosts" case — a fresh [] would defeat DayBody's memo */
const EMPTY_CLIPS: ClippedEvent[] = []

function tickLabel(offset: number): string {
  return `${String((SEAM_HOUR + offset) % 24).padStart(2, '0')}:00`
}

/** breathing room between a popover and the edges of the clipping grid box */
const POP_GAP = 4

/**
 * Pin a popover under the click without letting it fall out of the grid box.
 *
 * The box CLIPS (`overflow-hidden`), and a popover's height is content-driven
 * — six templates, or the taller custom form. A hardcoded "assume it is 236px
 * tall" clamp is therefore a guess that is wrong by however much the content
 * actually measures, and clicking low in the day pushed the real bottom (the
 * last templates, or the custom form's Book button) outside the box, where it
 * was silently cut off. Measure the panel instead, and re-measure when it
 * grows — switching to the custom form changes the height under the same click.
 *
 * Deliberately no dep list: the height only ever changes through a render (a
 * different template list, the custom form), so every render re-measures. The
 * equality guard is what keeps that from looping. A ResizeObserver would be
 * the tidier instrument but it is not one this project can verify — it never
 * fires in the harness browser, so it would be an untested claim.
 */
function usePinnedTop(anchorY: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(POP_GAP)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = Math.max(POP_GAP, Math.min(anchorY, BODY_H - el.offsetHeight - POP_GAP))
    setTop((t) => (Math.abs(t - next) < 0.5 ? t : next))
  })
  return [ref, top] as const
}

/** left of the column for the last three days, right of it otherwise. Anchored
 *  by the panel's near edge, so a panel that changes width (quick-add opening
 *  the custom form) stays put instead of sliding over the column it belongs to. */
function popoverSide(col: number): React.CSSProperties {
  return col < 4
    ? { left: `calc(${col + 1} * 100% / 7 + 6px)` }
    : { right: `calc(${7 - col} * 100% / 7 + 6px)` }
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

/** a live drag on a block's end edge — the block itself is the preview */
interface ResizeState {
  id: string
  /** the event's own start, so the preview needs no lookup per frame */
  startMs: number
  /** the end under the pointer, snapped to the half hour */
  endMs: number
  valid: boolean
}

/** the drag/resize snap, and the bounds a resize may not cross */
const SNAP_MS = HOUR_MS / 2
const MIN_DUR_H = 0.5
const MAX_DUR_H = 24

interface MoveConfirm {
  id: string
  start: Date
  durH: number
  title: string
  body: string
}

/** the lifted block on mobile — one visible column, chips as day targets */
interface MobileDrag {
  id: string
  title: string
  kind: EventKind
  tc: number
  ts: number
  durH: number
  valid: boolean
  fromCol: number
  /** pointer is in the RELEASE TO CANCEL strip */
  escape: boolean
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

  const isMobile = useIsMobile()
  const [popover, setPopover] = useState<Popover | null>(null)
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  /** desktop: a live drag on a block's end edge */
  const [resize, setResize] = useState<ResizeState | null>(null)
  const [confirm, setConfirm] = useState<MoveConfirm | null>(null)
  const [toast, setToast] = useState<{ msg: string; undo: boolean } | null>(null)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  /** mobile MOVE flow: the event awaiting a tapped destination */
  const [placing, setPlacing] = useState<CalendarEvent | null>(null)
  /** mobile edit sheet */
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  /** desktop: the empty half-hour under the cursor — affordance only */
  const [hoverSlot, setHoverSlot] = useState<{ col: number; ts: number } | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)
  /** the mobile branch's visible day, reported upward so the shared quick-add
   *  mailbox can target it without lifting its scroll state into the shell */
  const mobileColRef = useRef(0)
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickUntil = useRef(0)

  /* Escape closes the transient desktop surfaces. The mobile branch gets this
     free from the Sheet primitive; the popovers are plain absolute panels, so
     they need their own — matching Sheet's handling rather than inventing a
     second convention. The editor is a Sheet and closes itself. */
  useEffect(() => {
    if (!popover && !quickAdd && !placing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPopover(null)
      setQuickAdd(null)
      setPlacing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popover, quickAdd, placing])

  /* Escape's pointer twin. Deliberately NOT a full-viewport scrim like Sheet's:
     an invisible layer over live chrome would swallow the first press on any
     control while a popover is open — the app would look interactive and not
     be. Dismiss on a press outside the panel instead, and let the press reach
     whatever it landed on. */
  useEffect(() => {
    // DESKTOP ONLY. On mobile these same two states drive Sheets, which own
    // their own dismissal — and a Sheet's surface carries no popover marker,
    // so this listener treated every tap inside it as "outside".
    //
    // What that did on a phone: tapping the scrim ran pointerdown first and
    // closed the sheet, then the click landed on the column now underneath and
    // opened it straight back up — the thing could not be dismissed. Tapping a
    // template was worse: the sheet unmounted on pointerdown, so the click
    // never reached the button and nothing was ever booked.
    if (isMobile) return
    if (!popover && !quickAdd) return
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[data-manor-popover]')) return
      setPopover(null)
      setQuickAdd(null)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [popover, quickAdd, isMobile])

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
  /* A resize in flight, re-clipped through the very same pipeline as committed
     events — so the block being stretched crosses the seam, grows its dotted
     tail into tomorrow and re-rounds its corners live, instead of a separate
     preview rectangle that would have to reimplement all of that. Columns the
     resized event does not touch keep their ARRAY IDENTITY, so their DayBody
     stays memoized and only the one or two columns that changed re-render. */
  const liveClipsByCol = useMemo(() => {
    if (!resize) return clipsByCol
    const src = events.find((e) => e.id === resize.id)
    if (!src) return clipsByCol
    const draft: CalendarEvent = { ...src, end: new Date(resize.endMs).toISOString() }
    return columns.map((win, i) => {
      const before = clipsByCol[i]
      const rest = before.filter((c) => c.event.id !== resize.id)
      const next = clipToWindow(draft, win.start, win.end)
      if (rest.length === before.length && !next) return before
      return next ? [...rest, next] : rest
    })
  }, [clipsByCol, columns, events, resize])

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

  // training blocks sitting hard by a watch carry a computed ▲ — never stored
  const warnIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of events) {
      if (e.kind !== 'training' || e.allDay) continue
      if (nearWatch(events, new Date(e.start), new Date(e.end), e.id)) ids.add(e.id)
    }
    return ids
  }, [events])

  const openPopover = (event: CalendarEvent, col: number, y: number) => {
    if (Date.now() < suppressClickUntil.current) return
    setQuickAdd(null)
    setPopover((p) => (p?.event.id === event.id ? null : { event, col, y }))
  }

  /** is [start, end) free of every timed event but `ignoreId`? */
  const rangeFree = (ignoreId: string | null, start: Date, end: Date): boolean =>
    !events.some(
      (e) =>
        !e.allDay &&
        e.id !== ignoreId &&
        overlaps(new Date(e.start), new Date(e.end), start, end),
    )

  /** is a [tc, ts, ts+durH) slot free of every other timed event? */
  const slotFree = (ignoreId: string | null, tc: number, ts: number, durH: number): boolean => {
    const start = new Date(columns[tc].start.getTime() + ts * HOUR_MS)
    return rangeFree(ignoreId, start, new Date(start.getTime() + durH * HOUR_MS))
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
      butler(voice.manor.movedTo(hhmm(start)), true)
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

  const finishDrag = (d: Pick<DragState, 'id' | 'tc' | 'ts' | 'durH' | 'valid' | 'fromCol'>) => {
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
    const newEnd = new Date(newStart.getTime() + d.durH * HOUR_MS)
    // a training block landing hard by a watch earns a word first (drag
    // contract row 7); appended to the cross-day confirm when both apply
    const nw = !sandbox && e.kind === 'training' ? nearWatch(events, newStart, newEnd, e.id) : null
    if (d.tc !== d.fromCol && !sandbox) {
      const s = new Date(e.start)
      const en = new Date(e.end)
      setConfirm({
        id: d.id,
        start: newStart,
        durH: d.durH,
        title: voice.manor.moveTitle,
        body:
          voice.manor.moveBody({
            title: e.title,
            from: `${WD[s.getDay()]} ${hhmm(s)} → ${hhmm(en)}`,
            to: `${WD[newStart.getDay()]} ${hhmm(newStart)} → ${hhmm(newEnd)}`,
          }) + (nw ? ` ▲ ${voice.manor.nearWatchLine(nw)}` : ''),
      })
      return
    }
    if (nw) {
      setConfirm({
        id: d.id,
        start: newStart,
        durH: d.durH,
        title: voice.manor.nearWatchTitle,
        body: `${voice.manor.nearWatchBody} ${voice.manor.nearWatchLine(nw)}`,
      })
      return
    }
    applyMove(d.id, newStart, d.durH)
  }

  /* ----------------------------------------------------------- drag start */

  const onBlockPointerDown = (e: CalendarEvent, ev: React.PointerEvent, grabCol: number) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const s = new Date(e.start)
    const fromCol = columns.findIndex((w) => s >= w.start && s < w.end)
    if (fromCol < 0) {
      // last week's overnight tail: it renders here but is anchored outside the
      // viewed window, so there is no column to drag it from. Say so — silence
      // reads as breakage (M-02).
      butler(voice.manor.anchoredEarlier)
      return
    }
    /* How far into the EVENT the grab landed, measured against the column the
       pointer is actually in — not against the column the event starts in.
       Those differ for the second half of a night watch: grabbing its 02:00
       tail is 7 h into a 19:00 event, and the old sum called it −17 h, which
       the start clamp then pinned at midnight. That is why a watch grabbed by
       its tail refused to move while the same watch grabbed by its head moved
       fine — the gesture was computing a start it could never reach. */
    const grabMs =
      columns[grabCol].start.getTime() +
      ((ev.clientY - rect.top) / PXH) * HOUR_MS -
      s.getTime()
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
      const hoverCol = Math.max(0, Math.min(6, Math.floor(x / colW)))
      // the instant under the pointer, less where inside the block it was held
      const raw = columns[hoverCol].start.getTime() + (y / PXH) * HOUR_MS - grabMs
      // The start can land in a different column than the pointer — dragging a
      // watch by its tail puts the start on the day before — so ask which
      // column owns it rather than assuming the one under the cursor. Kept
      // inside the viewed week: a drag may not post an event off-screen.
      const first = columns[0].start.getTime()
      const last = columns[6].start.getTime() + 23.5 * HOUR_MS
      const startMs = Math.max(first, Math.min(Math.round(raw / SNAP_MS) * SNAP_MS, last))
      let tc = columns.findIndex(
        (w) => startMs >= w.start.getTime() && startMs < w.end.getTime(),
      )
      if (tc < 0) tc = startMs < first ? 0 : 6
      const ts = clampStart((startMs - columns[tc].start.getTime()) / HOUR_MS)
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

  /* --------------------------------------------------- resize (end edge) */

  /**
   * Drag the grip at a block's end edge to change how long it runs. Unlike a
   * move this is a purely VERTICAL gesture read against the column the grip
   * lives in — so a wobble sideways never rewrites which day the block is on,
   * and pulling past the bottom of the column simply lets the block cross
   * midnight, which is the one thing this calendar has always allowed.
   *
   * The block IS the preview: the live end is clipped through the same
   * pipeline as committed events (see `liveClipsByCol`), so a block dragged
   * past the seam grows its dotted tail into tomorrow while the pointer is
   * still down. Occupancy is judged but never enforced mid-drag — the
   * overlapping end shows in danger and is refused on release, the same
   * contract a move already has.
   */
  const onResizeStart = (e: CalendarEvent, gripCol: number, ev: React.PointerEvent) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return
    const box = boxRef.current
    if (!box) return
    ev.preventDefault()
    const rect = box.getBoundingClientRect()
    const startMs = new Date(e.start).getTime()
    const originalEnd = new Date(e.end).getTime()
    const colStart = columns[gripCol].start.getTime()
    const startY = ev.clientY
    let moved = false
    let raf = 0
    let pendingY = 0

    const apply = () => {
      raf = 0
      const raw = colStart + ((pendingY - rect.top) / PXH) * HOUR_MS
      const endMs = Math.max(
        startMs + MIN_DUR_H * HOUR_MS,
        Math.min(Math.round(raw / SNAP_MS) * SNAP_MS, startMs + MAX_DUR_H * HOUR_MS),
      )
      const prev = resizeRef.current
      if (prev && prev.endMs === endMs) return // still the same half hour
      const next: ResizeState = {
        id: e.id,
        startMs,
        endMs,
        valid: rangeFree(e.id, new Date(startMs), new Date(endMs)),
      }
      resizeRef.current = next
      setResize(next)
    }

    const mm = (m: PointerEvent) => {
      if (!moved && Math.abs(m.clientY - startY) < 3) return
      if (!moved) {
        moved = true
        setPopover(null)
        setQuickAdd(null)
      }
      pendingY = m.clientY
      if (!raf) raf = requestAnimationFrame(apply)
      m.preventDefault()
    }
    const stop = (commit: boolean) => {
      window.removeEventListener('pointermove', mm)
      window.removeEventListener('pointerup', mu)
      window.removeEventListener('keydown', onKey)
      if (raf) {
        cancelAnimationFrame(raf)
        if (commit) apply() // flush the last frame so the release lands where the pointer is
      }
      const r = resizeRef.current
      resizeRef.current = null
      setResize(null)
      if (!moved) return
      suppressClickUntil.current = Date.now() + 250
      if (commit && r) finishResize(r, originalEnd)
      else if (!commit) butler(voice.manor.asYouWere)
    }
    const mu = () => stop(true)
    // Escape abandons the drag with the block exactly as it was — the same
    // out the confirm dialog offers, for a gesture that has no dialog.
    const onKey = (k: KeyboardEvent) => {
      if (k.key === 'Escape') stop(false)
    }
    window.addEventListener('pointermove', mm)
    window.addEventListener('pointerup', mu)
    window.addEventListener('keydown', onKey)
  }

  const finishResize = (r: ResizeState, originalEnd: number) => {
    if (r.endMs === originalEnd) return
    if (!r.valid) {
      butler(voice.manor.occupied)
      return
    }
    const e = events.find((x) => x.id === r.id)
    if (!e) return
    updateEvent(r.id, { end: new Date(r.endMs).toISOString() })
    if (!sandbox) {
      setLastAction({ type: 'move', id: r.id, prev: { start: e.start, end: e.end } })
      butler(
        voice.manor.resized({
          hours: ((r.endMs - r.startMs) / HOUR_MS).toFixed(1),
          longer: r.endMs > originalEnd,
        }),
        true,
      )
    }
  }

  /* Stable identities for everything handed to a memoized child: the handlers
     themselves are re-created each render (they close over `events`), so route
     them through a ref — the children then never re-render during a drag. */
  const latest = useRef({ onBlockPointerDown, openPopover, onResizeStart })
  latest.current = { onBlockPointerDown, openPopover, onResizeStart }
  const handleBlockPointerDown = useCallback(
    (e: CalendarEvent, ev: React.PointerEvent, col: number) =>
      latest.current.onBlockPointerDown(e, ev, col),
    [],
  )
  const handleResizeStart = useCallback(
    (e: CalendarEvent, col: number, ev: React.PointerEvent) =>
      latest.current.onResizeStart(e, col, ev),
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
    // mobile MOVE flow: the next tapped slot is the destination
    if (placing) {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
      let ts = Math.floor(((ev.clientY - rect.top) / PXH) * 2) / 2
      const durH = hoursOf(placing)
      ts = clampStart(ts)
      const fromCol = columns.findIndex((w) => {
        const s = new Date(placing.start)
        return s >= w.start && s < w.end
      })
      setPlacing(null)
      finishDrag({
        id: placing.id,
        tc: col,
        ts,
        durH,
        valid: slotFree(placing.id, col, ts, durH),
        fromCol,
      })
      return
    }
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

  /** the tab bar's + : quick-add on `col` at the next free half-hour (today)
   *  or a civilised default hour — the sheet's footer flags an occupied slot */
  const openQuickAddAt = (col: number) => {
    const win = columns[col]
    const isToday = now >= win.start.getTime() && now < win.end.getTime()
    let base = isToday ? Math.ceil(((now - win.start.getTime()) / HOUR_MS) * 2) / 2 : 9
    base = Math.max(0, Math.min(23.5, base))
    let ts = base
    for (let t = base; t <= 23.5; t += 0.5) {
      if (slotFree(null, col, t, 0.5)) {
        ts = t
        break
      }
    }
    setPopover(null)
    setQuickAdd({ col, ts, y: ts * PXH })
  }

  /* The + is a one-shot mailbox: the tab bar on mobile, QUICK ADD in the nav
     row on desktop. Consumed HERE rather than inside MobileWeek — which is
     where it used to live, so a desktop press reached nothing. Mobile keeps
     targeting the day on screen; desktop targets today when the viewed week
     contains it, else the first column. */
  const quickAddRequested = useManorUi((s) => s.quickAddRequested)
  useEffect(() => {
    if (!quickAddRequested) return
    const todayIdx = columns.findIndex((w) => now >= w.start.getTime() && now < w.end.getTime())
    openQuickAddAt(isMobile ? mobileColRef.current : todayIdx >= 0 ? todayIdx : 0)
    useManorUi.getState().clearQuickAddRequest()
  }, [quickAddRequested])

  /** the mobile edit sheet's save — false = destination occupied, sheet stays */
  const saveEdit = (id: string, title: string, start: Date, durH: number): boolean => {
    const end = new Date(start.getTime() + durH * HOUR_MS)
    const clash = events.some(
      (e) =>
        !e.allDay && e.id !== id && overlaps(new Date(e.start), new Date(e.end), start, end),
    )
    if (clash) {
      butler(voice.manor.occupied)
      return false
    }
    const prev = events.find((e) => e.id === id)
    if (!prev) return false
    const timeChanged =
      new Date(prev.start).getTime() !== start.getTime() || hoursOf(prev) !== durH
    updateEvent(id, { title, start: start.toISOString(), end: end.toISOString() })
    if (!sandbox) butler(timeChanged ? voice.manor.movedTo(hhmm(start)) : voice.manor.onTheBooks)
    return true
  }

  const quickAddPick = (tpl: { kind: EventKind; title: string; hours: number }) => {
    if (!quickAdd) return
    // no fit-the-column clamp: a 19:00 night watch or a 23:30 sleep simply
    // crosses midnight — natural data; the grid splits it at the seam
    const ts = quickAdd.ts
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
        {/* the key to the strain bars below and the seam's dotted edges —
            without it they are unexplained colour, and red reads as an error */}
        <div className="mb-2 pl-12">
          <ManorLegend variant="week" />
        </div>
        <div className="flex pl-12">
          {columns.map((win, i) => (
            <DayHeader
              key={i}
              win={win}
              markers={markersByCol[i]}
              strain={strain?.[i]}
              now={now}
              booked={bookedHours(clipsByCol[i])}
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
                <div
                  key={i}
                  className="relative min-w-0 flex-1"
                  onClick={(ev) => onColumnClick(i, ev)}
                  onMouseMove={(ev) => {
                    // affordance only — click-to-quick-add already works. Stay
                    // quiet over a block, mid-drag, or under an open popover.
                    if (drag || resize || popover || quickAdd || placing)
                      return setHoverSlot(null)
                    if ((ev.target as HTMLElement).closest('[data-event-block]'))
                      return setHoverSlot(null)
                    const r = ev.currentTarget.getBoundingClientRect()
                    const ts = clampStart(Math.floor(((ev.clientY - r.top) / PXH) * 2) / 2)
                    setHoverSlot((h) => (h && h.col === i && h.ts === ts ? h : { col: i, ts }))
                  }}
                  onMouseLeave={() => setHoverSlot(null)}
                >
                  {hoverSlot?.col === i && (
                    <div
                      className="pointer-events-none absolute inset-x-[3px] z-[1] flex items-center gap-1 rounded-[6px] px-1.5"
                      style={{
                        top: hoverSlot.ts * PXH + 1,
                        height: 0.5 * PXH - 2,
                        border: '1px dashed color-mix(in srgb, var(--color-accent) 45%, transparent)',
                        background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
                        color: 'var(--color-accent)',
                      }}
                    >
                      <span className="text-[11px] font-semibold leading-none">+</span>
                      <span className="text-[9.5px] leading-none [font-variant-numeric:tabular-nums]">
                        {hhmm(new Date(win.start.getTime() + hoverSlot.ts * HOUR_MS))}
                      </span>
                    </div>
                  )}
                  <DayBody
                    col={i}
                    win={win}
                    clips={liveClipsByCol[i]}
                    ghostClips={ghostsByCol[i]}
                    changedIds={changedIds}
                    warnIds={warnIds}
                    now={now}
                    divider={i > 0}
                    selectedId={popover?.event.id}
                    dragId={drag?.id}
                    clashingId={resize && !resize.valid ? resize.id : undefined}
                    onEventClick={handleEventClick}
                    onEventPointerDown={handleBlockPointerDown}
                    onEventResizeStart={handleResizeStart}
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
                onEdit={() => {
                  setEditing(popover.event)
                  setPopover(null)
                }}
                style={popoverSide(popover.col)}
              />
            )}
            {quickAdd && (
              <QuickAddPopover
                quickAdd={quickAdd}
                columns={columns}
                onPick={quickAddPick}
                onClose={() => setQuickAdd(null)}
                fits={(h) => slotFree(null, quickAdd.col, quickAdd.ts, h)}
                style={popoverSide(quickAdd.col)}
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
        warnIds={warnIds}
        markersByCol={markersByCol}
        strain={strain}
        now={now}
        popover={popover}
        onEventClick={handleEventClick}
        closePopover={() => setPopover(null)}
        onColumnClick={onColumnClick}
        activeColRef={mobileColRef}
        slotFree={slotFree}
        onFinishDrag={finishDrag}
        suppressClicks={() => {
          suppressClickUntil.current = Date.now() + 250
        }}
        placing={placing}
        onCancelPlace={() => setPlacing(null)}
      />

      {/* mobile bottom sheets — mounted only below md so the Sheet scroll
          lock never fires for a desktop popover sharing the same state */}
      {isMobile && (
        <>
          <MobileQuickAddSheet
            open={quickAdd !== null}
            when={
              quickAdd
                ? new Date(columns[quickAdd.col].start.getTime() + quickAdd.ts * HOUR_MS)
                : null
            }
            fits={(h) => (quickAdd ? slotFree(null, quickAdd.col, quickAdd.ts, h) : true)}
            onPick={quickAddPick}
            onClose={() => setQuickAdd(null)}
          />
          <MobileEventSheet
            open={popover !== null}
            event={popover?.event ?? null}
            hotNames={popover ? (strain?.[popover.col]?.hot.map((h) => h.label) ?? []) : []}
            near={
              popover && popover.event.kind === 'training'
                ? nearWatch(
                    events,
                    new Date(popover.event.start),
                    new Date(popover.event.end),
                    popover.event.id,
                  )
                : null
            }
            onClose={() => setPopover(null)}
            onDelete={() => popover && removeEvent(popover.event.id)}
            onMove={() => {
              if (!popover) return
              setPlacing(popover.event)
              setPopover(null)
            }}
            onEdit={() => {
              if (!popover) return
              setEditing(popover.event)
              setPopover(null)
            }}
          />
        </>
      )}

      {/* Both platforms', unlike the sheets above: `editing` is not shared with
          any desktop popover, so mounting it everywhere double-renders nothing
          — and Sheet already gives desktop a centered modal with Escape and a
          dismissing scrim. The desktop popover's Edit action opens this. */}
      <EventEditSheet
        open={editing !== null}
        event={editing}
        onSave={saveEdit}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? voice.manor.moveTitle}
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
        <div className="menu-panel fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3.5 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out] md:bottom-6">
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

/** horizontal hour rules (midnight is the column edge, never mid-column) */
const Rules = memo(function Rules() {
  return (
    <>
      {RULES.map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute left-0 right-0 z-[1]"
          style={{
            top: h * PXH,
            borderTop: '1px solid color-mix(in srgb, var(--color-line) 60%, transparent)',
          }}
        />
      ))}
    </>
  )
})

/**
 * The hour rail. It takes no offset and never has: it is always a flex sibling
 * of the box holding the column bodies, so the two share a top by construction
 * and a label cannot drift from the block it describes.
 *
 * Mobile used to nest each day's header INSIDE its scrolled column, which put
 * the bodies a header's height below the rail's own top and needed a constant
 * to bridge the gap. Any change to that header's padding silently re-opened a
 * ~1.4 h gap between every label and its block. The header now lives above the
 * box on both layouts and the constant is gone.
 */
const TickAxis = memo(function TickAxis() {
  return (
    // The transparent top border is not decoration: the grid box beside it has
    // a 1px border, so its column bodies begin one pixel lower than the flex
    // row they share. Carrying the same border puts the rail in the columns'
    // coordinate space instead of the row's, and is why no offset is needed.
    <div
      className="relative w-12 flex-none"
      style={{ height: BODY_H, borderTop: '1px solid transparent' }}
    >
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

/**
 * Hours a day has already been spoken for, counted as the day actually holds
 * them: a night watch running past midnight gives each date its own share
 * rather than billing both for the whole thing.
 *
 * Sleep is excluded. It is pencilled by the estate rather than committed by
 * the user, and counting it made almost every day read as twenty hours spent.
 */
function bookedHours(clips: ClippedEvent[]): number {
  return clips.reduce(
    (t, c) =>
      c.event.kind === 'marker' || c.event.kind === 'sleep'
        ? t
        : t + (c.end.getTime() - c.start.getTime()) / 3_600_000,
    0,
  )
}

const DayHeader = memo(function DayHeader({
  win,
  markers,
  strain,
  now,
  booked = 0,
}: {
  win: ColumnWindow
  markers: CalendarEvent[]
  strain?: DayStrain
  now: number
  booked?: number
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
        {booked > 0 && (
          <span className="ml-auto text-[10px] text-ink-faint [font-variant-numeric:tabular-nums]">
            {booked.toFixed(1)} h
          </span>
        )}
      </div>
      {strain && (
        <div className="mt-1.5">
          <StrainBar day={strain} />
        </div>
      )}
      {markers.map((m) => {
        const mm = markerMeta(m)
        return (
          <span
            key={m.id}
            className="mt-1 inline-block rounded-[5px] px-1.5 py-px text-[10px] tracking-[0.08em]"
            style={{
              color: mm.color,
              border: `1px solid color-mix(in srgb, ${mm.color} 55%, transparent)`,
              background: `color-mix(in srgb, ${mm.color} 10%, transparent)`,
            }}
          >
            {mm.glyph ? `${mm.glyph} ` : ''}
            {m.title}
          </span>
        )
      })}
    </div>
  )
})

const DayBody = memo(function DayBody({
  col,
  win,
  clips,
  ghostClips = EMPTY_CLIPS,
  changedIds,
  warnIds,
  now,
  divider,
  selectedId,
  dragId,
  clashingId,
  onEventClick,
  onEventPointerDown,
  onEventResizeStart,
  blockTouchAction,
}: {
  col: number
  win: ColumnWindow
  clips: ClippedEvent[]
  ghostClips?: ClippedEvent[]
  changedIds?: ReadonlySet<string>
  warnIds?: ReadonlySet<string>
  now: number
  divider: boolean
  selectedId?: string
  dragId?: string
  /** the block being resized onto an occupied hour — drawn in danger */
  clashingId?: string
  onEventClick: (col: number, e: CalendarEvent, y: number) => void
  onEventPointerDown?: (e: CalendarEvent, ev: React.PointerEvent, col: number) => void
  /** desktop only: the grip on a block's end edge */
  onEventResizeStart?: (e: CalendarEvent, col: number, ev: React.PointerEvent) => void
  /** 'pan-y' on mobile: scroll wins until the long-press lifts the block */
  blockTouchAction?: 'none' | 'pan-y'
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
          warn={warnIds?.has(c.event.id) ?? false}
          dimmed={dragId === c.event.id}
          clashing={clashingId === c.event.id}
          onClick={onEventClick}
          onPointerDown={onEventPointerDown}
          onResizeStart={onEventResizeStart}
          blockTouchAction={blockTouchAction}
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
  warn = false,
  dimmed,
  clashing = false,
  onClick,
  onPointerDown,
  onResizeStart,
  blockTouchAction = 'none',
}: {
  col: number
  clip: ClippedEvent
  win: ColumnWindow
  selected: boolean
  changed?: boolean
  /** training booked hard by a watch — the computed ▲ */
  warn?: boolean
  dimmed: boolean
  /** mid-resize, over an hour that is already taken */
  clashing?: boolean
  onClick: (col: number, e: CalendarEvent, y: number) => void
  onPointerDown?: (e: CalendarEvent, ev: React.PointerEvent, col: number) => void
  onResizeStart?: (e: CalendarEvent, col: number, ev: React.PointerEvent) => void
  blockTouchAction?: 'none' | 'pan-y'
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
  // Under ~45 minutes there is no room for both, and a squeezed time range
  // wins the space from the one thing that says what the block IS.
  const tooShortForTime = visibleHours < 0.75
  /* Under an hour the block is 24 px or less, and the ordinary padded line
     (5 px of padding + a 14.4 px line) simply does not fit inside it — the
     title was drawn below the block's own height and then clipped away by
     `overflow-hidden`, so a half-hour block rendered as an empty colour chip.
     Short blocks get their own line instead: no vertical padding, a smaller
     face, centred in whatever height there is. */
  const tiny = visibleHours < 1
  // the end zone has to leave something to click for the popover
  const gripH = heightPx >= 20 ? 8 : 4
  const timeText = `${hhmm(new Date(e.start))} → ${hhmm(new Date(e.end))}`

  /* The end zone is measured on the BLOCK, not delegated to a child element:
     the button's own 1px bottom border and its 1px hover lift both sit outside
     any child's box, so a child hit area loses exactly the last pixels — the
     ones the pointer aims at. The grip below is therefore decoration only
     (`pointer-events-none`) and this decides what the press means.
     Only the clip HOLDING the event's end may resize: the half of a night
     watch cut at the seam ends at midnight because the column does, and
     dragging that edge would be dragging a rendering artefact. */
  const [nearEnd, setNearEnd] = useState(false)
  const resizable = !!onResizeStart && !clip.continuesAfter
  const overEnd = (ev: React.PointerEvent) =>
    (ev.currentTarget as HTMLElement).getBoundingClientRect().bottom - ev.clientY <= gripH + 2
  return (
    <button
      type="button"
      data-event-block
      // the visible text composes title + time with only a margin between
      // them, so the accessible name and any copy/paste read "Linear
      // Algebra15:00 → 16:30". Spell it properly here.
      aria-label={`${e.title}, ${timeText}, ${fullHours.toFixed(1)} hours`}
      title={resizable && nearEnd ? voice.manor.resizeHandle : undefined}
      onClick={(ev) => onClick(col, e, (ev.currentTarget as HTMLElement).offsetTop)}
      onPointerDown={
        onPointerDown || resizable
          ? (ev) => {
              if (resizable && overEnd(ev)) return onResizeStart?.(e, col, ev)
              onPointerDown?.(e, ev, col)
            }
          : undefined
      }
      onPointerMove={
        resizable
          ? (ev) => {
              const n = overEnd(ev)
              setNearEnd((prev) => (prev === n ? prev : n))
            }
          : undefined
      }
      onPointerLeave={resizable ? () => setNearEnd(false) : undefined}
      className={[
        'booked booked-interactive group absolute left-[3px] right-[3px] z-[2] select-none overflow-hidden rounded-[7px] p-0 text-left',
        isRest && 'booked-hatch',
        // the second half of a block cut by midnight is the quieter one — it
        // already happened, and two equally loud halves read as two events
        clip.continuesBefore && 'booked-cut-before booked-dim',
        clip.continuesAfter && 'booked-cut-after',
        selected && 'booked-glow',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--booked-accent' as string]: meta.color,
        top: topPx + 1,
        height: Math.max(heightPx - 2, 12),
        cursor: resizable && nearEnd ? 'ns-resize' : onPointerDown ? 'grab' : 'pointer',
        touchAction: onPointerDown ? blockTouchAction : undefined,
        WebkitTouchCallout: 'none',
        opacity: dimmed ? 0.3 : 1,
        borderTopLeftRadius: clip.continuesBefore ? 0 : undefined,
        borderTopRightRadius: clip.continuesBefore ? 0 : undefined,
        borderBottomLeftRadius: clip.continuesAfter ? 0 : undefined,
        borderBottomRightRadius: clip.continuesAfter ? 0 : undefined,
        outline: clashing
          ? '1.5px solid var(--color-danger)'
          : selected
            ? `1.5px solid ${meta.color}`
            : changed
              ? '1.5px solid var(--color-accent)'
              : 'none',
        outlineOffset: 1.5,
      }}
    >
      {warn && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1 z-[1] text-[9px] leading-none"
          style={{ color: 'var(--color-danger)' }}
        >
          ▲
        </span>
      )}
      <span
        className={tiny ? 'flex h-full items-center px-1.5' : 'block px-2 py-[5px]'}
        style={tiny ? { minWidth: 0 } : undefined}
      >
        <span
          className={
            tiny
              ? 'block min-w-0 text-[10px] font-semibold leading-none'
              : 'block text-xs font-semibold leading-[1.2]'
          }
          style={{
            whiteSpace: twoLine ? 'normal' : 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {e.title}
          {!twoLine && !tooShortForTime && (
            <>
              {/* a real space, not just a margin — this pair is inline, so a
                  margin alone makes the copied text read "Algebra15:00" */}{' '}
              <span
                className={`font-normal text-ink-dim [font-variant-numeric:tabular-nums] ${
                  tiny ? 'text-[9.5px]' : 'text-[10.5px]'
                }`}
              >
                {timeText}
              </span>
            </>
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
      {/* the grip: the visible half of the end zone above. Invisible until the
          block is hovered, so a week of blocks does not read as a week of
          handles, and brighter once the pointer is actually on the edge. */}
      {resizable && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex items-end justify-center opacity-0 transition-opacity group-hover:opacity-100"
          style={{ height: gripH }}
        >
          <span
            className="mb-[1.5px] block h-[2px] w-6 rounded-full transition-opacity"
            style={{ background: 'currentColor', opacity: nearEnd ? 1 : 0.5 }}
          />
        </span>
      )}
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
  // A drag no longer shrinks to fit the day, so a crossing block's ghost would
  // overflow the column box. Clip it at the seam and cut the edge the way a
  // dropped block will actually be drawn — the ghost shows what it becomes.
  const crosses = drag.ts + drag.durH > 24
  const visibleH = Math.min(drag.durH, 24 - drag.ts)
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[6] rounded-[7px] px-2 py-[5px]"
      style={{
        width: drag.colW - 6,
        height: Math.max(visibleH * PXH - 2, 12),
        transform: `translate3d(${drag.tc * drag.colW + 3}px, ${drag.ts * PXH + 1}px, 0) scale(1.02)`,
        willChange: 'transform',
        overflow: 'hidden',
        // per-side longhands, not the `border` shorthand: React warns about (and
        // unreliably applies) a shorthand mixed with borderBottom on rerender
        borderTop: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderLeft: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderRight: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderBottom: crosses
          ? CUT_EDGE
          : `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderBottomLeftRadius: crosses ? 0 : undefined,
        borderBottomRightRadius: crosses ? 0 : undefined,
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
  onEdit,
  style,
}: {
  popover: Popover
  onClose: () => void
  onDelete: () => void
  onEdit: () => void
  style: React.CSSProperties
}) {
  const e = popover.event
  const meta = eventMeta(e)
  const s = new Date(e.start)
  const en = new Date(e.end)
  const cross = localDayKey(s) !== localDayKey(en)
  const [ref, top] = usePinnedTop(popover.y)
  return (
    <div
      ref={ref}
      data-manor-popover
      className="menu-panel absolute z-[11] w-[236px] animate-[fade-in_160ms_ease-out] p-4"
      style={{ ...style, top, maxHeight: BODY_H - 2 * POP_GAP, overflowY: 'auto' }}
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
        onClick={onEdit}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[11.5px] font-semibold tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-ink"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {voice.manor.eventSheet.edit}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11.5px] font-semibold tracking-[0.12em] text-danger transition-colors hover:bg-panel-2"
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
  fits,
  style,
}: {
  quickAdd: QuickAdd
  columns: ColumnWindow[]
  onPick: (tpl: { kind: EventKind; title: string; hours: number }) => void
  onClose: () => void
  /** would a block of `hours` fit the slot this popover opened on? */
  fits: (hours: number) => boolean
  style: React.CSSProperties
}) {
  const when = new Date(columns[quickAdd.col].start.getTime() + quickAdd.ts * HOUR_MS)
  const [custom, setCustom] = useState(false)
  const [ref, top] = usePinnedTop(quickAdd.y)
  return (
    <div
      ref={ref}
      data-manor-popover
      className={`menu-panel absolute z-[11] animate-[fade-in_160ms_ease-out] p-3.5 ${
        custom ? 'w-[264px]' : 'w-[212px]'
      }`}
      style={{ ...style, top, maxHeight: BODY_H - 2 * POP_GAP, overflowY: 'auto' }}
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
      {custom ? (
        <CustomEventForm fits={fits} onBook={onPick} onBack={() => setCustom(false)} />
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {voice.manor.templates.map((tpl) => {
            const meta = KIND_META[tpl.kind]
            // fit-checked against ITS OWN hours: the slot was found by hunting
            // for a free half-hour, so a 13 h template could be offered and
            // then bounce with "occupied, sir" after the tap
            const room = fits(tpl.hours)
            return (
              <button
                key={tpl.title}
                type="button"
                disabled={!room}
                title={room ? undefined : voice.manor.custom.wontFit}
                onClick={() => onPick(tpl)}
                className="card flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: undefined }}
                onMouseEnter={(e) =>
                  room && ((e.currentTarget as HTMLElement).style.borderColor = meta.color)
                }
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
          <button
            type="button"
            onClick={() => setCustom(true)}
            className="card flex w-full items-center gap-2 border-dashed px-2.5 py-2 text-left text-xs text-ink-dim transition-colors hover:text-ink"
          >
            {voice.manor.custom.row}
          </button>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- mobile */

const ESCAPE_H = 32
const LONG_PRESS_MS = 350
const PRE_LIFT_SLOP = 8
const EDGE_ZONE = 120
const EDGE_SPEED = 14

function MobileWeek({
  columns,
  clipsByCol,
  ghostsByCol,
  changedIds,
  warnIds,
  markersByCol,
  strain,
  now,
  popover,
  onEventClick,
  closePopover,
  onColumnClick,
  activeColRef,
  slotFree,
  onFinishDrag,
  suppressClicks,
  placing,
  onCancelPlace,
}: {
  columns: ColumnWindow[]
  clipsByCol: ClippedEvent[][]
  ghostsByCol: ClippedEvent[][]
  changedIds?: ReadonlySet<string>
  warnIds?: ReadonlySet<string>
  markersByCol: CalendarEvent[][]
  strain?: DayStrain[] | null
  now: number
  popover: Popover | null
  onEventClick: (col: number, e: CalendarEvent, y: number) => void
  closePopover: () => void
  onColumnClick: (col: number, ev: React.MouseEvent) => void
  /** written, not read: reports the visible day to WeekGrid's quick-add mailbox */
  activeColRef: React.MutableRefObject<number>
  slotFree: (ignoreId: string | null, tc: number, ts: number, durH: number) => boolean
  onFinishDrag: (d: {
    id: string
    tc: number
    ts: number
    durH: number
    valid: boolean
    fromCol: number
  }) => void
  suppressClicks: () => void
  placing: CalendarEvent | null
  onCancelPlace: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const colBodyRefs = useRef<(HTMLDivElement | null)[]>([])
  const todayIdx = columns.findIndex((w) => now >= w.start.getTime() && now < w.end.getTime())
  const [active, setActive] = useState(todayIdx >= 0 ? todayIdx : 0)
  const activeRef = useRef(active)
  activeRef.current = active
  // report the visible day upward: WeekGrid owns the quick-add mailbox now
  activeColRef.current = active

  const [mDrag, setMDrag] = useState<MobileDrag | null>(null)
  const mdRef = useRef<MobileDrag | null>(null)

  const goTo = (i: number, smooth = true) => {
    setActive(i)
    closePopover()
    const el = scrollRef.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }

  // position on mount (today's duty cycle) — deliberately not re-run on
  // `active` changes; goTo/onScroll own the position after mount
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = active * el.clientWidth
  }, [])

  const onScroll = () => {
    if (mdRef.current) return // programmatic swaps during a drag own the position
    const el = scrollRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== active) {
      setActive(Math.max(0, Math.min(6, i)))
      closePopover()
    }
  }

  /* ------------------------------------------- the mobile drag (long-press) */

  const onMobileBlockPointerDown = (e: CalendarEvent, ev: React.PointerEvent) => {
    if (placing) return
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const s = new Date(e.start)
    const fromCol = columns.findIndex((w) => s >= w.start && s < w.end)
    // only the block's home column lifts — a continuation tail in the next
    // column stays tap-only (MOVE in the sheet covers it)
    if (fromCol < 0 || fromCol !== activeRef.current) return

    const durH = hoursOf(e)
    const startOffsetH = (s.getTime() - columns[fromCol].start.getTime()) / HOUR_MS
    let lastX = ev.clientX
    let lastY = ev.clientY
    let lifted = false
    let grabH = 0
    let raf = 0
    let scrollRaf = 0
    let autoV = 0

    const tm = (t: TouchEvent) => {
      if (lifted) t.preventDefault() // the lift owns the gesture — no scroll
    }

    const apply = () => {
      raf = 0
      const cur = mdRef.current
      if (!cur) return
      let { tc, ts } = cur
      let escape = false

      // day chips are drop targets: entering one swaps the column beneath the finger
      let chipHit = -1
      for (let i = 0; i < 7; i++) {
        const r = chipRefs.current[i]?.getBoundingClientRect()
        if (r && lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom) {
          chipHit = i
          break
        }
      }
      if (chipHit >= 0) {
        if (chipHit !== tc) {
          tc = chipHit
          setActive(chipHit)
          const el = scrollRef.current
          if (el) el.scrollTo({ left: chipHit * el.clientWidth, behavior: 'auto' })
        }
      } else {
        const wrapRect = wrapRef.current?.getBoundingClientRect()
        if (wrapRect && lastY >= wrapRect.top && lastY <= wrapRect.top + ESCAPE_H) {
          escape = true
        }
        const bodyRect = colBodyRefs.current[tc]?.getBoundingClientRect()
        if (bodyRect && lastY > (wrapRect?.top ?? -Infinity) + ESCAPE_H) {
          ts = Math.round(((lastY - bodyRect.top) / PXH - grabH) * 2) / 2
          ts = clampStart(ts)
        }
      }

      // auto-scroll when the finger nears the viewport edges
      autoV =
        lastY < EDGE_ZONE
          ? -EDGE_SPEED * (1 - lastY / EDGE_ZONE)
          : lastY > window.innerHeight - EDGE_ZONE
            ? EDGE_SPEED * (1 - (window.innerHeight - lastY) / EDGE_ZONE)
            : 0

      if (cur.tc === tc && cur.ts === ts && cur.escape === escape) return
      const next: MobileDrag = {
        ...cur,
        tc,
        ts,
        escape,
        valid: slotFree(e.id, tc, ts, durH),
      }
      mdRef.current = next
      setMDrag(next)
    }

    const scrollLoop = () => {
      if (autoV !== 0) {
        window.scrollBy(0, autoV)
        if (!raf) raf = requestAnimationFrame(apply) // the grid moved under a still finger
      }
      scrollRaf = requestAnimationFrame(scrollLoop)
    }

    const lift = () => {
      lifted = true
      navigator.vibrate?.(10)
      closePopover()
      const bodyRect = colBodyRefs.current[fromCol]?.getBoundingClientRect()
      if (!bodyRect) return cleanup()
      grabH = (lastY - bodyRect.top) / PXH - startOffsetH
      const first: MobileDrag = {
        id: e.id,
        title: e.title,
        kind: e.kind,
        tc: fromCol,
        ts: Math.round(startOffsetH * 2) / 2,
        durH,
        valid: true,
        fromCol,
        escape: false,
      }
      mdRef.current = first
      setMDrag(first)
      window.addEventListener('touchmove', tm, { passive: false })
      scrollRaf = requestAnimationFrame(scrollLoop)
    }

    const lp = setTimeout(lift, LONG_PRESS_MS)

    const cleanup = () => {
      clearTimeout(lp)
      window.removeEventListener('pointermove', mm)
      window.removeEventListener('pointerup', mu)
      window.removeEventListener('pointercancel', pc)
      window.removeEventListener('touchmove', tm)
      if (raf) cancelAnimationFrame(raf)
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
    }

    const mm = (m: PointerEvent) => {
      lastX = m.clientX
      lastY = m.clientY
      if (!lifted) {
        // scroll is never hijacked before the lift: real movement cancels it
        if (Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY) > PRE_LIFT_SLOP) cleanup()
        return
      }
      m.preventDefault()
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const mu = () => {
      cleanup()
      if (!lifted) return // plain tap → the block's onClick opens the sheet
      if (raf) apply()
      suppressClicks()
      const d = mdRef.current
      mdRef.current = null
      setMDrag(null)
      if (!d) return
      if (d.escape) {
        navigator.vibrate?.(5)
        return
      }
      navigator.vibrate?.(8)
      onFinishDrag({ id: d.id, tc: d.tc, ts: d.ts, durH: d.durH, valid: d.valid, fromCol: d.fromCol })
    }
    const pc = () => {
      cleanup()
      mdRef.current = null
      setMDrag(null)
    }

    window.addEventListener('pointermove', mm)
    window.addEventListener('pointerup', mu)
    window.addEventListener('pointercancel', pc)
  }

  /* --------------------------------------------------------------- render */

  return (
    <div className="md:hidden">
      {placing && (
        <div
          className="mb-2.5 flex items-center gap-2.5 rounded-[10px] border border-dashed px-3.5 py-2 text-[12px]"
          style={{
            borderColor: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
          }}
        >
          <span
            className="h-1.5 w-1.5 flex-none animate-pulse rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
          {voice.manor.movePlace}
          <button
            type="button"
            onClick={onCancelPlace}
            aria-label="Cancel move"
            className="ml-auto p-1 text-[13px] text-ink-dim transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}
      {/* the key to the strain bars and the seam's dotted edges. It used to be
          desktop-only, which left the one layout with the least room to guess
          from explaining the least — red on a bar reads as an error. */}
      <div className="mb-2">
        <ManorLegend variant="week" />
      </div>
      <div className="flex gap-1.5">
        {columns.map((win, i) => {
          const isToday = localDayKey(win.day) === localDayKey(new Date(now))
          const on = i === active
          const armed = mDrag !== null && i === mDrag.tc
          const hasWatch = clipsByCol[i].some((c) => c.event.kind === 'shift')
          return (
            <button
              key={i}
              ref={(el) => {
                chipRefs.current[i] = el
              }}
              type="button"
              onClick={() => goTo(i)}
              /* a soft rectangle, not .chip: these carry three stacked lines,
                 and a pill radius turned each one into an ellipse with the
                 strain bar hanging out of its bottom edge */
              className="relative flex-1 overflow-hidden rounded-[10px] border py-1.5 text-center transition-colors"
              style={{
                borderColor: armed || on ? 'var(--color-accent)' : 'var(--color-line)',
                borderStyle: armed ? 'dashed' : 'solid',
                boxShadow: armed ? '0 0 0 3px var(--glow-accent)' : 'none',
                background:
                  armed || on
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
              {hasWatch && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 h-1 w-1 rounded-full"
                  style={{ background: 'var(--color-w-watch)' }}
                />
              )}
            </button>
          )
        })}
      </div>
      {/* The viewed day, named ONCE above the box rather than once inside each
          scrolled column. Keeping it out of the columns is what makes the rail
          and the bodies share a top — see TickAxis. */}
      <div className="mt-3 flex items-end">
        <div className="w-12 flex-none" aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 pb-1.5">
          <span
            className="font-display text-[13px] font-semibold tracking-[0.12em]"
            style={{
              color:
                localDayKey(columns[active].day) === localDayKey(new Date(now))
                  ? 'var(--color-accent)'
                  : 'var(--color-ink)',
            }}
          >
            {WD[columns[active].day.getDay()]} {columns[active].day.getDate()}
          </span>
          {markersByCol[active].map((m) => {
            const mm = markerMeta(m)
            return (
              <span key={m.id} className="truncate text-[10px]" style={{ color: mm.color }}>
                {mm.glyph ? `${mm.glyph} ` : ''}
                {m.title}
              </span>
            )
          })}
          {bookedHours(clipsByCol[active]) > 0 && (
            <span className="ml-auto flex-none text-[10px] text-ink-faint [font-variant-numeric:tabular-nums]">
              {bookedHours(clipsByCol[active]).toFixed(1)} h
            </span>
          )}
        </div>
      </div>
      <div className="flex">
        <TickAxis />
        <div ref={wrapRef} className="relative min-w-0 flex-1">
          {mDrag && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[7] flex items-center justify-center rounded-t-xl font-display text-[8.5px] font-semibold tracking-[0.2em]"
              style={{
                height: ESCAPE_H,
                color: 'var(--color-danger)',
                background: mDrag.escape
                  ? 'color-mix(in srgb, var(--color-danger) 18%, transparent)'
                  : 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
                borderBottom: '1px dashed color-mix(in srgb, var(--color-danger) 45%, transparent)',
              }}
            >
              {voice.manor.releaseCancel}
            </div>
          )}
          {mDrag && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[7] flex items-end justify-center rounded-b-xl"
              style={{ height: 40, background: 'linear-gradient(0deg, var(--glow-accent), transparent)' }}
            >
              <span className="pb-1 text-[12px] leading-none" style={{ color: 'var(--color-accent)' }}>
                ⌄
              </span>
            </div>
          )}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-xl border border-line"
            style={{ background: 'color-mix(in srgb, var(--color-panel) 55%, transparent)' }}
          >
            {columns.map((win, i) => (
              <div key={i} className="w-full flex-none snap-center">
                <div
                  ref={(el) => {
                    colBodyRefs.current[i] = el
                  }}
                  className="relative"
                  style={{ height: BODY_H }}
                  onClick={(ev) => onColumnClick(i, ev)}
                >
                  <Rules />
                  <DayBody
                    col={i}
                    win={win}
                    clips={clipsByCol[i]}
                    ghostClips={ghostsByCol[i]}
                    changedIds={changedIds}
                    warnIds={warnIds}
                    now={now}
                    divider={false}
                    selectedId={popover?.event.id}
                    dragId={mDrag?.id}
                    onEventClick={onEventClick}
                    onEventPointerDown={onMobileBlockPointerDown}
                    blockTouchAction="pan-y"
                  />
                  {mDrag && mDrag.tc === i && <MobileDragGhost drag={mDrag} columns={columns} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** the lifted block on mobile — compositor-only transform, badge riding on top */
function MobileDragGhost({ drag, columns }: { drag: MobileDrag; columns: ColumnWindow[] }) {
  const meta = KIND_META[drag.kind]
  const start = new Date(columns[drag.tc].start.getTime() + drag.ts * HOUR_MS)
  const end = new Date(start.getTime() + drag.durH * HOUR_MS)
  const badge = `${hhmm(start)} → ${hhmm(end)}`
  // same seam treatment as the desktop ghost — clipped at midnight, cut edge
  const crosses = drag.ts + drag.durH > 24
  const visibleH = Math.min(drag.durH, 24 - drag.ts)
  return (
    <div
      className="pointer-events-none absolute left-[3px] right-[3px] top-0 z-[6] rounded-[8px] px-2.5 py-1.5"
      style={{
        height: Math.max(visibleH * PXH - 2, 12),
        transform: `translate3d(0, ${drag.ts * PXH + 1}px, 0) scale(1.03)`,
        willChange: 'transform',
        borderTop: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderLeft: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderRight: `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderBottom: crosses
          ? CUT_EDGE
          : `1.5px solid ${drag.valid ? meta.color : 'var(--color-danger)'}`,
        borderBottomLeftRadius: crosses ? 0 : undefined,
        borderBottomRightRadius: crosses ? 0 : undefined,
        background: drag.valid
          ? `color-mix(in srgb, ${meta.color} 24%, var(--color-panel-2))`
          : 'color-mix(in srgb, var(--color-danger) 22%, var(--color-panel-2))',
        boxShadow: drag.valid
          ? '0 18px 44px rgb(0 0 0 / 0.6), 0 0 24px var(--glow-accent)'
          : '0 18px 44px rgb(0 0 0 / 0.6)',
        transition: 'transform 90ms ease-out',
      }}
    >
      <div
        className="absolute -top-3 right-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.04em] [font-variant-numeric:tabular-nums]"
        style={{
          background: drag.valid ? 'var(--color-accent)' : 'var(--color-danger)',
          color: 'var(--color-bg)',
          boxShadow: '0 0 14px var(--glow-accent)',
        }}
      >
        {badge}
      </div>
      <div className="text-xs font-semibold leading-[1.2]">{drag.title}</div>
      <div
        className="text-[11px] [font-variant-numeric:tabular-nums]"
        style={{ color: drag.valid ? 'var(--color-ink-dim)' : 'var(--color-danger)' }}
      >
        {drag.valid ? badge : voice.manor.occupiedShort}
      </div>
    </div>
  )
}
