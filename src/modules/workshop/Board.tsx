import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, localDayKey, startOfLocalDay } from '../../core/dates'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { Sheet } from '../../core/ui/Sheet'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { useEventsStore } from '../../core/events/store'
import { track } from '../../core/telemetry'
import { voice } from '../../core/voice'
import { BenchControl } from './bench'
import {
  COPPER,
  PEGBOARD_BG,
  SheetActions,
  SheetLabel,
  StatusPill,
  Stepper,
  fdate,
  fdatem,
  hhmm,
} from './bits'
import {
  boardGroups,
  dayKeyToDate,
  daysUntil,
  dueRead,
  lifetimeHours,
  nextMilestone,
  pendingMilestones,
  taskProgress,
  workshopStats,
} from './lib'
import { ShareSheet, crewsAvailable } from './ShareSheet'
import { useWorkshopStore } from './store'
import { safeHref } from './url'
import type { BoardGroup } from './lib'
import type { BoardCard, CardType, Milestone, Thread, Venture } from './types'

/**
 * THE VENTURE BOARD — the pegboard. On DESKTOP it is a freeform wall: every
 * card can be dragged anywhere and remembers its spot (`fx`/`fy`); the old
 * column layout survives only as the DEFAULT, so a card that has never been
 * touched sits exactly where the grid would have put it and an old board
 * opens unchanged. Threads still route at right angles — they just route
 * from wherever the cards actually are — and a card's tie to its heading is
 * drawn as a faint stitched line, so the organisation stays visible however
 * far the wall is scattered.
 *
 * The PHONE keeps the grouped column pager: freeform positions are a desktop
 * reading, and the same `parentId`/`row` order both surfaces already share
 * is what the phone pages. The one bridge back: dragging a HEADING re-ranks
 * `col` by where the headings stand, so the phone's page order follows the
 * desktop's left-to-right arrangement.
 */

const CARD_W = 240
const COL_GAP = 44
const PAD_X = 36
const PAD_TOP = 40
const PAD_BOTTOM = 60
/** gap between two cards in the same column, and under a heading */
const CARD_GAP_Y = 16
const TITLE_GAP_Y = 12
/** stand-in height until a card has been measured */
const FALLBACK_H = 92
/** the UNFILED rail, which stands in for a heading on the loose column */
const LOOSE_RAIL_H = 26

const RING_MINI_C = 2 * Math.PI * 11

/**
 * Where a new card was asked for. The desktop press hands over a freeform
 * spot (`at`); the phone's column-foot button hands over a heading and a
 * position in it (`parentId`/`index`). Both may be absent — the chrome's
 * HANG A CARD button knows nothing, and the card falls to its defaults.
 */
interface PlaceSpot {
  parentId?: string
  index?: number
  at?: { x: number; y: number }
}

export function Board({
  venture,
  onBack,
  openRecord,
  onRecordOpened,
  butler,
}: {
  venture: Venture
  onBack: () => void
  /** a record the wing asked to open for amending — a MATTERS PENDING card,
   *  or a marker chip on the Manor. Cleared through `onRecordOpened` so a
   *  later visit does not reopen the same sheet. */
  openRecord?: { kind: 'milestone' | 'card'; id: string } | null
  onRecordOpened?: () => void
  butler: (msg: string) => void
}) {
  const activeEvents = useEventsStore((s) => (s.sandbox ? s.sandbox.events : s.events))
  const cards = useWorkshopStore((s) => s.cards)
  const threads = useWorkshopStore((s) => s.threads)
  const milestones = useWorkshopStore((s) => s.milestones)
  const sessions = useWorkshopStore((s) => s.sessions)
  const ventures = useWorkshopStore((s) => s.ventures)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const [sheet, setSheet] = useState<'hang' | 'milestones' | 'column' | 'crew' | null>(null)
  const [editCard, setEditCard] = useState<BoardCard | null>(null)
  /** the marker the milestones sheet should open on, when it was asked for */
  const [msOpenOn, setMsOpenOn] = useState<string | null>(null)
  /** where a press on bare board asked for the new card to go */
  const [placeAt, setPlaceAt] = useState<PlaceSpot | null>(null)
  /** the heading whose column list is open — or was, behind a card sheet */
  const [columnOf, setColumnOf] = useState<string | null>(null)
  /** a card reached FROM a column list goes back to it when it closes, so the
   *  list is a place you work from rather than a door that shuts behind you */
  const [backToColumn, setBackToColumn] = useState(false)

  const workEntries = useWorkshopStore((s) => s.workEntries)
  const members = useWorkshopStore((s) => s.members)
  const crewSize = venture.shareId ? (members[venture.shareId]?.length ?? 1) : 0
  const mine = cards.filter((c) => c.ventureId === venture.id)
  const groups = boardGroups(mine)
  const myThreads = threads.filter((t) => t.ventureId === venture.id)
  const stats = workshopStats(activeEvents, sessions, ventures, now, weekStart, workEntries)
  const week = stats.perVenture[venture.id] ?? { fulfilledH: 0, bookedH: 0 }
  const lifetime = lifetimeHours(activeEvents, sessions, venture, workEntries)
  const nextMs = nextMilestone(milestones, venture.id)
  const tasks = taskProgress(cards, venture.id)

  /**
   * Pressing a HEADING opens its column rather than its own edit sheet: what
   * a heading is for is the work under it, and the rename it used to open is
   * one button inside the list. Pressing anything else opens that card.
   */
  const openEdit = (card: BoardCard) => {
    if (card.type === 'title') {
      setColumnOf(card.id)
      setBackToColumn(false)
      setSheet('column')
      return
    }
    setEditCard(card)
    setPlaceAt(null)
    setBackToColumn(false)
    setSheet('hang')
  }

  const openCreateAt = (spot: PlaceSpot) => {
    setEditCard(null)
    setPlaceAt(spot)
    setBackToColumn(false)
    setSheet('hang')
  }

  /** from inside a column list: open one of its cards, and remember the way back */
  const openFromColumn = (card: BoardCard | null, spot: PlaceSpot | null) => {
    setEditCard(card)
    setPlaceAt(spot)
    setBackToColumn(true)
    setSheet('hang')
  }

  // the wing handed over a record to open. A milestone opens the milestones
  // sheet on it; a card opens its own sheet. Either way the request is handed
  // back as consumed, so returning to this board later opens nothing.
  useEffect(() => {
    if (!openRecord) return
    if (openRecord.kind === 'milestone') {
      setMsOpenOn(openRecord.id)
      setSheet('milestones')
    } else {
      const card = useWorkshopStore.getState().cards.find((c) => c.id === openRecord.id)
      if (card) openEdit(card)
    }
    onRecordOpened?.()
  }, [openRecord])

  const closeHangSheet = () => {
    setEditCard(null)
    setPlaceAt(null)
    // back to the column it was opened from, if that is where it came from
    setSheet(backToColumn && columnOf ? 'column' : null)
    setBackToColumn(false)
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* ------------------------------------------------ the board chrome */}
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="font-display text-[9.5px] font-semibold tracking-[0.16em] text-ink-faint transition-colors hover:text-ink"
        >
          ← {voice.workshop.board.back}
        </button>
        <span className="font-display text-[17px] font-bold uppercase tracking-[0.08em] sm:text-[19px]">
          {venture.name}
        </span>
        <StatusPill status={venture.status} />
        {/* the jobs lead the chrome; the odometer follows them */}
        {tasks.total > 0 && (
          <span className="flex items-baseline gap-2">
            <span
              className="stat-num font-display text-[22px] font-semibold leading-none [font-variant-numeric:tabular-nums]"
              style={{ color: COPPER }}
            >
              {voice.workshop.tasks.pct(tasks.pct)}
            </span>
            <span className="text-[10.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
              {voice.workshop.tasks.count(tasks)} {voice.workshop.tasks.label.toLowerCase()}
            </span>
          </span>
        )}
        <span className="flex flex-col">
          <span className="stat-num font-display text-[15px] font-semibold leading-none [font-variant-numeric:tabular-nums]">
            {lifetime.toFixed(1)} h
          </span>
          <span className="mt-0.5 text-[8px] tracking-[0.18em] text-ink-faint">
            {voice.workshop.odometer}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
            <circle cx="14" cy="14" r="11" fill="none" stroke="var(--color-panel-2)" strokeWidth="3.5" />
            {venture.goalH > 0 ? (
              <circle
                cx="14"
                cy="14"
                r="11"
                fill="none"
                stroke={COPPER}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(RING_MINI_C * Math.min(1, week.fulfilledH / venture.goalH)).toFixed(1)} ${RING_MINI_C.toFixed(1)}`}
                transform="rotate(-90 14 14)"
              />
            ) : (
              <circle cx="14" cy="14" r="11" fill="none" stroke={COPPER} strokeWidth="3.5" opacity="0.22" />
            )}
          </svg>
          <span className="text-[10px] leading-tight text-ink-dim [font-variant-numeric:tabular-nums]">
            {week.fulfilledH.toFixed(1)}
            {venture.goalH > 0 ? ` of ${venture.goalH.toFixed(1)} h` : ' h'}
            <br />
            <span className="text-[8px] tracking-[0.16em] text-ink-faint">/ WK</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setMsOpenOn(null)
            setSheet('milestones')
          }}
          className="rounded-pill border px-3 py-1.5 font-display text-[9.5px] font-semibold tracking-[0.13em] transition-colors hover:text-ink [font-variant-numeric:tabular-nums]"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-w-workshop) 35%, transparent)',
            color: nextMs && daysUntil(nextMs.on, now) < 0 ? 'var(--color-danger)' : 'var(--color-ink)',
          }}
        >
          {nextMs
            ? `${nextMs.title.toUpperCase()} · ${voice.workshop.countdown(daysUntil(nextMs.on, now)).toUpperCase()}`
            : voice.workshop.mattersPending}
        </button>
        {crewsAvailable() && (
          <button
            type="button"
            onClick={() => setSheet('crew')}
            className="rounded-pill border-[1.5px] px-4 py-2.5 font-display text-[12px] font-bold tracking-[0.14em] transition-colors [font-variant-numeric:tabular-nums]"
            style={{
              borderColor: venture.shareId
                ? 'color-mix(in srgb, var(--color-accent) 55%, transparent)'
                : 'color-mix(in srgb, var(--color-ink-faint) 45%, transparent)',
              color: venture.shareId ? 'var(--color-accent)' : 'var(--color-ink-dim)',
              background: venture.shareId
                ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                : undefined,
            }}
          >
            {venture.shareId
              ? voice.workshop.crew.crewButton(crewSize)
              : voice.workshop.crew.shareButton}
          </button>
        )}
        <span className="ml-auto flex items-center gap-2.5">
          <BenchControl
            compact
            onStart={() => {
              useWorkshopStore.getState().startBench(venture.id)
              butler(voice.workshop.toast.benchStart)
            }}
            onStopped={butler}
          />
          <button
            type="button"
            onClick={() => {
              setEditCard(null)
              setSheet('hang')
            }}
            className="btn-soft px-3.5 py-2 font-display text-[10.5px] font-bold tracking-[0.14em]"
          >
            {voice.workshop.board.hang}
          </button>
        </span>
      </div>

      {/* ------------------------------------------------ the pegboard */}
      {mine.length === 0 ? (
        <EmptyBoard onHang={() => setSheet('hang')} />
      ) : (
        <>
          <DesktopBoard
            ventureId={venture.id}
            groups={groups}
            threads={myThreads}
            now={now}
            onEdit={openEdit}
            onCreateAt={openCreateAt}
            butler={butler}
          />
          <MobileBoard
            ventureId={venture.id}
            groups={groups}
            threads={myThreads}
            now={now}
            onEdit={openEdit}
            onCreateAt={openCreateAt}
            butler={butler}
          />
        </>
      )}

      <HangCardSheet
        open={sheet === 'hang'}
        onClose={closeHangSheet}
        venture={venture}
        cards={mine}
        threads={myThreads}
        editing={editCard}
        placeAt={placeAt}
        butler={butler}
      />
      <ColumnSheet
        open={sheet === 'column'}
        onClose={() => {
          setSheet(null)
          setColumnOf(null)
        }}
        heading={mine.find((c) => c.id === columnOf && c.type === 'title') ?? null}
        rows={groups.find((g) => g.title?.id === columnOf)?.children ?? []}
        threads={myThreads}
        now={now}
        onOpenCard={(card) => openFromColumn(card, null)}
        onHangHere={(index) =>
          openFromColumn(null, { parentId: columnOf ?? undefined, index })
        }
        butler={butler}
      />
      <MilestonesSheet
        open={sheet === 'milestones'}
        onClose={() => {
          setSheet(null)
          setMsOpenOn(null)
        }}
        venture={venture}
        milestones={milestones.filter((m) => m.ventureId === venture.id)}
        openOn={msOpenOn}
        now={now}
        butler={butler}
      />
      <ShareSheet
        open={sheet === 'crew'}
        onClose={() => setSheet(null)}
        venture={venture}
        butler={butler}
      />
    </div>
  )
}

function EmptyBoard({ onHang }: { onHang: () => void }) {
  return (
    <div
      className="trough flex min-h-[300px] flex-col items-center justify-center gap-3.5 px-6 py-10"
      style={PEGBOARD_BG}
    >
      <button
        type="button"
        onClick={onHang}
        className="w-[200px] rounded-[2px] border-[1.5px] border-dashed border-line px-4 py-3.5 text-center font-display text-[10px] font-semibold tracking-[0.16em] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-dim"
      >
        {voice.workshop.board.hangFirst}
      </button>
      <span className="text-[12.5px] italic text-ink-dim">{voice.workshop.board.empty}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- desktop */

/** the wall is never smaller than this, so its frame is always in evidence */
const MIN_BOARD_W = 1180
const MIN_BOARD_H = 520

interface Placed {
  card: BoardCard
  x: number
  y: number
  h: number
}

interface PlacedColumn {
  x: number
  title: Placed | null
  children: Placed[]
  /** y of the first free space under the column */
  bottom: number
}

/**
 * Where everything sits. Columns are groups; a heading tops its column and its
 * work stacks beneath in order. Heights are MEASURED rather than assumed —
 * cards differ by hundreds of pixels once descriptions are on them, and a
 * fixed slot height either clipped the long ones or left craters under the
 * short ones.
 */
function layout(
  groups: BoardGroup[],
  heights: Record<string, number>,
): { cols: PlacedColumn[]; w: number; h: number } {
  const hOf = (c: BoardCard) => heights[c.id] ?? (c.type === 'title' ? 44 : FALLBACK_H)
  const cols: PlacedColumn[] = groups.map((g, i) => {
    const x = PAD_X + i * (CARD_W + COL_GAP)
    let y = PAD_TOP
    let title: Placed | null = null
    if (g.title) {
      title = { card: g.title, x, y, h: hOf(g.title) }
      y += title.h + TITLE_GAP_Y
    } else {
      // the loose column gets a rail of its own so its first card starts level
      // with everyone else's rather than floating a heading's height higher
      y += LOOSE_RAIL_H + TITLE_GAP_Y
    }
    const children: Placed[] = g.children.map((c) => {
      const p = { card: c, x, y, h: hOf(c) }
      y += p.h + CARD_GAP_Y
      return p
    })
    return { x, title, children, bottom: y }
  })
  const w = PAD_X * 2 + Math.max(1, cols.length) * CARD_W + Math.max(0, cols.length - 1) * COL_GAP
  const h = Math.max(...cols.map((c) => c.bottom), PAD_TOP + FALLBACK_H) + PAD_BOTTOM
  return { cols, w, h }
}

/**
 * Where everything sits on the desktop wall. The column layout above is
 * computed first and serves as the DEFAULT: a card that has never been
 * dragged sits exactly where the grid would have put it. A card that HAS
 * been dragged sits at its own (fx, fy) — the columns are the starting
 * arrangement, not a law. The board's extent grows to hold the farthest
 * card, so nothing placed can ever leave the SVG the twine is drawn in.
 */
function freeLayout(
  groups: BoardGroup[],
  heights: Record<string, number>,
  /** the card being dragged RIGHT NOW, so the wall grows under the hand
   *  rather than after the drop — an edge that moves only once the card is
   *  released is exactly what made the bounds feel like a wall to hit */
  inFlight?: { x: number; y: number; h: number },
): { placed: Placed[]; w: number; h: number } {
  const { cols, w, h } = layout(groups, heights)
  const placed: Placed[] = []
  for (const col of cols) {
    for (const p of [...(col.title ? [col.title] : []), ...col.children]) {
      placed.push({ card: p.card, x: p.card.fx ?? p.x, y: p.card.fy ?? p.y, h: p.h })
    }
  }
  // never smaller than the window it is seen through, or the frame would
  // start out cropped and the wall would look like it had no edges at all
  let W = Math.max(w, MIN_BOARD_W)
  let H = Math.max(h, MIN_BOARD_H)
  const grow = (x: number, y: number, ch: number) => {
    W = Math.max(W, x + CARD_W + PAD_X)
    H = Math.max(H, y + ch + PAD_BOTTOM)
  }
  for (const p of placed) grow(p.x, p.y, p.h)
  if (inFlight) grow(inFlight.x, inFlight.y, inFlight.h)
  return { placed, w: W, h: H }
}

/**
 * Run or cut the twine between two cards. The one write behind every thread
 * gesture — the desktop drag and the phone's two taps both come through here,
 * so they can never disagree about what landing on an ALREADY threaded card
 * means. It means take it down: the gesture is its own undo.
 */
function runThread(
  ventureId: string,
  threads: Thread[],
  from: string,
  to: string,
  butler: (msg: string) => void,
): void {
  if (from === to) {
    butler(voice.workshop.toast.threadSelf)
    return
  }
  const store = useWorkshopStore.getState()
  const existing = threads.find(
    (t) => (t.from === from && t.to === to) || (t.from === to && t.to === from),
  )
  if (existing) {
    store.deleteThread(existing.id)
    butler(voice.workshop.toast.threadCut)
  } else {
    store.addThread(ventureId, from, to)
    butler(voice.workshop.toast.threaded)
  }
}

/** is there already twine between these two? — drives the cut/hang affordance */
const threadedPair = (threads: Thread[], a: string, b: string) =>
  threads.some((t) => (t.from === a && t.to === b) || (t.from === b && t.to === a))

interface Drag {
  id: string
  /** pointer offset inside the card, in board units */
  dx: number
  dy: number
  x: number
  y: number
  moved: boolean
}

/** a length of twine in flight, from a card's eyelet to wherever the hand is */
interface TwineDrag {
  from: string
  /** pointer position, in board units */
  x: number
  y: number
  /** the card under the pointer, if it is a legal other end */
  over: string | null
}

interface Pan {
  /** pointer position where the pan began, in SCREEN units */
  sx: number
  sy: number
  /** the offset at that moment */
  ox: number
  oy: number
  /** the press has travelled far enough to be a pan rather than a tap */
  moved: boolean
}

/** how far a press may travel and still count as a press, not a drag */
const TAP_SLOP = 6

const ZOOM_MIN = 0.4
const ZOOM_MAX = 1.6
/**
 * How hard one wheel notch bites: the scale step is `exp(-delta * this)`, so a
 * mouse notch (~100px of delta) is about 16%, while a trackpad's stream of
 * two-pixel deltas stays a smooth crawl rather than sixty 16% jumps.
 */
const ZOOM_WHEEL = 0.0015
/** …and no single event may scale by more than this, whatever it reports */
const ZOOM_WHEEL_MAX = 1.35
const VIEW_H = 560
/** how far past its own edge the wall may be pulled before it stops */
const PAN_SLACK = 80

/**
 * Two fingers on the board mean the BOARD, not the page.
 *
 * `core/ui/zoomLock` refuses the browser's pinch app-wide, this surface
 * included — the app is an instrument, and a scaled viewport is a state a
 * home-screen install cannot get out of. Cancelling a default never stops the
 * event being delivered, though, so the same two fingers still arrive here and
 * scale the WALL instead. This is the one place in the app that pinches.
 *
 * Bound natively rather than through React, for the same reason the wheel
 * handler below is: React's root touch listeners are passive, so a
 * `preventDefault` through `onTouchMove` is a no-op and the page pans away
 * underneath the gesture.
 *
 * Reports the ratio since the last MOVE, not since the pinch began, so the
 * caller stays a plain multiply against whatever zoom it already had — plus
 * the midpoint, so the card between the fingers stays between them.
 */
function usePinch(
  ref: React.RefObject<HTMLElement | null>,
  onPinch: (factor: number, cx: number, cy: number) => void,
  onStart?: () => void,
) {
  const pinch = useRef(onPinch)
  pinch.current = onPinch
  const start = useRef(onStart)
  start.current = onStart

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const spread = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    let last = 0

    const down = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      last = spread(e.touches)
      start.current?.()
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !last) return
      if (e.cancelable) e.preventDefault()
      const d = spread(e.touches)
      // a fingertip wanders a pixel while the hand is still: under that, the
      // gesture is a two-finger hold, not a pinch
      if (Math.abs(d - last) < 1) return
      const t = e.touches
      pinch.current(
        d / last,
        (t[0].clientX + t[1].clientX) / 2,
        (t[0].clientY + t[1].clientY) / 2,
      )
      last = d
    }
    const up = (e: TouchEvent) => {
      if (e.touches.length < 2) last = 0
    }

    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', up)
    el.addEventListener('touchcancel', up)
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', up)
    }
  }, [ref])
}

function DesktopBoard({
  ventureId,
  groups,
  threads,
  now,
  onEdit,
  onCreateAt,
  butler,
}: {
  ventureId: string
  groups: BoardGroup[]
  threads: Thread[]
  now: number
  onEdit: (card: BoardCard) => void
  /** a press on bare board: hang something at that spot on the wall */
  onCreateAt: (spot: PlaceSpot) => void
  butler: (msg: string) => void
}) {
  const viewRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const [twine, setTwine] = useState<TwineDrag | null>(null)
  const [pan, setPan] = useState<Pan | null>(null)
  /**
   * The view — where the wall sits and how far in we are.
   *
   * A REF, not state, and written straight to the wall's transform inside a
   * rAF. It used to be state, which meant every wheel notch and every pan
   * frame re-ran the layout, re-rendered every card, rebuilt the twine and
   * re-measured every height. The wall is one composited element; moving it
   * should cost one style write, not a render of the whole workshop.
   */
  const view = useRef({ x: 0, y: 0, z: 1 })
  const wallRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef<number | null>(null)
  /** whether the next paint should ease — true for a button, never for a hand */
  const eased = useRef(false)
  /** the zoom READOUT: settled after the gesture, never once per notch */
  const [zoomShown, setZoomShown] = useState(1)
  const zoomSettle = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** the card under the mouse — feeds the glow and the marching twine */
  const [hover, setHover] = useState<string | null>(null)

  const { placed, w: boardW, h: boardH } = freeLayout(
    groups,
    heights,
    drag?.moved
      ? {
          x: drag.x - drag.dx,
          y: drag.y - drag.dy,
          h: heights[drag.id] ?? FALLBACK_H,
        }
      : undefined,
  )
  const byId = new Map(placed.map((p) => [p.card.id, p]))
  // the "01" numerals on the rails follow the phone's page order, not x —
  // a heading dragged about keeps its number until its RANK actually changes
  const titleIndex = new Map(groups.map((g, i) => [g.title?.id, i]))

  /**
   * The twine is arithmetic off the layout, but a card's HEIGHT is its own,
   * so it has to be measured. Keyed to what can actually CHANGE a height —
   * the cards and their text — and deliberately not run on every commit: an
   * ungated pass reads offsetHeight for every card, and reading a laid-out
   * dimension forces the browser to flush layout there and then. Once per
   * pan frame, per card, that is the whole reason the wall used to drag.
   * Width is fixed and the zoom is a transform, so neither moves a height.
   */
  const measureKey = placed
    .map((p) => `${p.card.id}:${p.card.type}:${p.card.title}:${p.card.body ?? ''}:${p.card.url ?? ''}:${p.card.dueAt ?? ''}`)
    .join('|')

  useLayoutEffect(() => {
    const measure = () => {
      const next: Record<string, number> = {}
      for (const [id, el] of cardRefs.current) next[id] = el.offsetHeight
      setHeights((prev) => {
        const keys = Object.keys(next)
        if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) {
          return prev
        }
        return next
      })
    }
    measure()
    // a face that lands before its typeface does measures short — one more
    // pass when the fonts settle, and never again
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    return () => {
      cancelled = true
    }
  }, [measureKey])

  /** screen point → board units, undoing the pan and the zoom */
  const boardPoint = (e: { clientX: number; clientY: number }) => {
    const r = viewRef.current!.getBoundingClientRect()
    const v = view.current
    return {
      x: (e.clientX - r.left - v.x) / v.z,
      y: (e.clientY - r.top - v.y) / v.z,
    }
  }

  /* ------------------------------------------------------------ card drag */

  const cardDown = (card: BoardCard, p: Placed) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    if (e.button !== 0) return
    e.stopPropagation() // a card drag is never also a pan
    const pt = boardPoint(e)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // a capture that cannot be taken only means the drag ends on pointer-out
    }
    setDrag({ id: card.id, dx: pt.x - p.x, dy: pt.y - p.y, x: pt.x, y: pt.y, moved: false })
  }

  const cardMove = (e: React.PointerEvent) => {
    if (!drag) return
    const pt = boardPoint(e)
    const moved = drag.moved || Math.hypot(pt.x - drag.x, pt.y - drag.y) > 6
    setDrag({ ...drag, x: pt.x, y: pt.y, moved })
  }

  const cardUp = (card: BoardCard) => () => {
    if (!drag || drag.id !== card.id) return
    if (drag.moved) {
      const store = useWorkshopStore.getState()
      // the drop point IS the position — clamped only at the top-left, since
      // the board can grow rightward and downward but the SVG cannot go
      // negative, and a card at (-300, y) would shed its own twine
      const x = Math.max(8, drag.x - drag.dx)
      const y = Math.max(8, drag.y - drag.dy)
      store.updateCard(card.id, { fx: x, fy: y })
      if (card.type === 'title') {
        // the phone pages headings in `col` order — re-rank by where the
        // headings now stand, so the wall's left-to-right IS the page order.
        // Inductively sound: every x change comes through this drop, so the
        // others' col order already matches their x order.
        const index = placed.filter(
          (p) => p.card.type === 'title' && p.card.id !== card.id && p.x < x,
        ).length
        store.moveTitle(card.id, index)
      }
    } else {
      onEdit(card)
    }
    setDrag(null)
  }

  /* ---------------------------------------------------------- thread drag
   * A second gesture on the same surface, told apart by where it STARTS: the
   * eyelet runs twine, the face moves the card, bare board pans the wall.
   * The eyelet keeps the pointer capture, but capture still bubbles through
   * the React tree, so the surface below goes on hearing move and up.
   */

  /** the card whose face covers a board point — headings excluded, as in the
   *  sheet's picker: a heading is a rail, and twine to a rail says nothing */
  const cardAt = (x: number, y: number): BoardCard | null => {
    for (const p of placed) {
      if (p.card.type === 'title') continue
      if (x >= p.x && x <= p.x + CARD_W && y >= p.y && y <= p.y + p.h) return p.card
    }
    return null
  }

  const twineDown = (card: BoardCard) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation() // never also a card drag, never also a pan
    const pt = boardPoint(e)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // as with the card drag: without capture the gesture ends on pointer-out
    }
    setTwine({ from: card.id, x: pt.x, y: pt.y, over: null })
  }

  const twineMove = (e: React.PointerEvent) => {
    if (!twine) return
    const pt = boardPoint(e)
    const hit = cardAt(pt.x, pt.y)
    setTwine({ ...twine, x: pt.x, y: pt.y, over: hit && hit.id !== twine.from ? hit.id : null })
  }

  /** returns true when the press was a thread gesture and is now spent */
  const twineUp = (): boolean => {
    if (!twine) return false
    if (twine.over) runThread(ventureId, threads, twine.from, twine.over, butler)
    setTwine(null)
    return true
  }

  const twineRole = (id: string): ThreadRole => {
    if (!twine) return 'idle'
    if (twine.from === id) return 'source'
    if (twine.over !== id) return 'idle'
    return threadedPair(threads, twine.from, id) ? 'cut' : 'target'
  }

  /* ------------------------------------------------------------ pan + zoom */

  const surfaceDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* see above */
    }
    setPan({ sx: e.clientX, sy: e.clientY, ox: view.current.x, oy: view.current.y, moved: false })
  }

  const surfaceMove = (e: React.PointerEvent) => {
    if (!pan) return
    const moved =
      pan.moved || Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > TAP_SLOP
    // the wall only follows the hand once the press has committed to being a
    // drag — otherwise a tap that wobbles by a pixel would nudge the board
    if (moved) {
      eased.current = false
      moveTo(pan.ox + (e.clientX - pan.sx), pan.oy + (e.clientY - pan.sy), view.current.z)
    }
    if (moved !== pan.moved) setPan({ ...pan, moved })
  }

  /**
   * A press on bare pegboard that never became a drag is an instruction to
   * hang something THERE — the point itself is the position now, and the
   * sheet opens with the spot already known. Which heading it belongs to is
   * the sheet's question: on a freeform wall the nearest column no longer
   * says anything about intent.
   */
  const surfaceUp = (e: React.PointerEvent) => {
    const p = pan
    setPan(null)
    // twine first: the eyelet stopped the press from ever becoming a pan, so
    // `p` is null here and the bare-board branch below would run regardless
    if (twineUp()) return
    if (!p || p.moved || drag) return
    const pt = boardPoint(e)
    // centre the card on the press, and keep it out of the negative quadrant
    onCreateAt({ at: { x: Math.max(8, pt.x - CARD_W / 2), y: Math.max(8, pt.y) } })
  }

  /**
   * Keep the wall reachable. Panning was unbounded, so a firm flick could
   * post the whole board off into space with no way back but the reset
   * button. Bounded, "the wall has run out" also becomes a fact the wheel
   * can act on — see below.
   */
  const clampView = (v: { x: number; y: number; z: number }) => {
    const el = viewRef.current
    if (!el) return v
    const vw = el.clientWidth
    const vh = el.clientHeight
    const ww = boardW * v.z
    const wh = boardH * v.z
    const span = (viewport: number, wall: number, at: number) =>
      Math.min(Math.max(0, viewport - wall) + PAN_SLACK, Math.max(Math.min(0, viewport - wall) - PAN_SLACK, at))
    return { x: span(vw, ww, v.x), y: span(vh, wh, v.y), z: v.z }
  }

  /** one style write, on the next frame, however many times we were asked */
  const paint = () => {
    frame.current = null
    const el = wallRef.current
    if (!el) return
    const v = view.current
    el.style.transition = eased.current ? 'transform 140ms ease-out' : 'none'
    el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`
  }

  const schedule = () => {
    if (frame.current === null) frame.current = requestAnimationFrame(paint)
  }

  /** move the wall; returns how far it ACTUALLY went, which may be nothing */
  const moveTo = (x: number, y: number, z: number) => {
    const before = view.current
    const next = clampView({ x, y, z })
    view.current = next
    schedule()
    return { dx: next.x - before.x, dy: next.y - before.y }
  }

  /**
   * Zoom about a screen point, so the thing under the cursor stays under it.
   * Reports whether the wall ACTUALLY scaled — at either stop it did not, and
   * the wheel handler hands the gesture back to the page rather than eating it.
   */
  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const v = view.current
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z * factor))
    if (z === v.z) return false
    const r = viewRef.current?.getBoundingClientRect()
    const px = r ? (clientX ?? r.left + r.width / 2) - r.left : 0
    const py = r ? (clientY ?? r.top + r.height / 2) - r.top : 0
    const k = z / v.z
    moveTo(px - (px - v.x) * k, py - (py - v.y) * k, z)
    if (zoomSettle.current) clearTimeout(zoomSettle.current)
    zoomSettle.current = setTimeout(() => setZoomShown(view.current.z), 140)
    return true
  }

  /**
   * The wheel ZOOMS the wall, about the cursor — the canvas convention, and
   * the thing a mouse in front of a pegboard is actually for. The wall is
   * still moved by DRAGGING it, which is how it was always moved.
   *
   * Two rules keep this from becoming the trap the old scroll-the-wall wheel
   * was written to escape:
   *
   *  - the listener is on the board's own viewport, so it is the only surface
   *    in the app a wheel scales. Everywhere else the wheel is the page's, and
   *    the document-level refusal in `core/ui/zoomLock` (a TOUCH gesture, not
   *    this one) is untouched by any of it;
   *  - at either zoom stop the event is handed BACK — no preventDefault — so
   *    a wheel over a fixed-height board that has nothing left to give scrolls
   *    the page, exactly as it would over any other panel.
   *
   * Shift is the escape hatch that keeps the wheel able to MOVE the wall, for
   * a trackpad that cannot notch and a hand that would rather not drag.
   * Ctrl/⌘ + wheel is still a zoom and is still always swallowed, so the
   * browser's own zoom cannot fire over the board.
   *
   * Bound natively rather than through React: React's listeners are passive,
   * so preventDefault through onWheel is a no-op.
   */
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      eased.current = false
      // lines and pages are wheel units too, and a mouse that reports them
      // would otherwise crawl a pixel at a time
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VIEW_H : 1

      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const v = view.current
        const { dx, dy } = moveTo(v.x - (e.deltaY || e.deltaX) * k, v.y, v.z)
        if (dx !== 0 || dy !== 0) e.preventDefault()
        return
      }

      const step = Math.exp(-e.deltaY * k * ZOOM_WHEEL)
      const scaled = zoomAt(
        Math.min(ZOOM_WHEEL_MAX, Math.max(1 / ZOOM_WHEEL_MAX, step)),
        e.clientX,
        e.clientY,
      )
      if (scaled || e.ctrlKey || e.metaKey) e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // the bounds move with the wall's extent, and the handler closes over them
  }, [boardW, boardH])

  // the wall grew, shrank, or this is the first paint — put it in bounds
  useLayoutEffect(() => {
    const v = view.current
    moveTo(v.x, v.y, v.z)
  }, [boardW, boardH])

  useEffect(
    () => () => {
      // Clearing the HANDLE matters as much as cancelling the frame: schedule()
      // treats a non-null handle as "a paint is already coming", so a stale one
      // left behind here wedges the wall forever. StrictMode's mount-unmount-
      // remount in development finds this instantly — which is how it was found.
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      if (zoomSettle.current) clearTimeout(zoomSettle.current)
      zoomSettle.current = null
    },
    [],
  )

  // a pinch abandons the pan the first finger started, so the wall doesn't
  // slide while it scales (and the press never lands as "hang a card here")
  usePinch(
    viewRef,
    (f, cx, cy) => {
      eased.current = false
      zoomAt(f, cx, cy)
    },
    () => setPan(null),
  )

  return (
    <div className="trough relative hidden select-none md:block">
      <div
        ref={viewRef}
        onPointerDown={surfaceDown}
        onPointerMove={(e) => {
          surfaceMove(e)
          cardMove(e)
          twineMove(e)
        }}
        onPointerUp={surfaceUp}
        onPointerCancel={() => {
          setPan(null)
          setTwine(null)
        }}
        className="relative overflow-hidden"
        // the perforation belongs to the BOARD, not to the window it is seen
        // through: pegboard everywhere meant the wall had no visible edge and
        // a card dragged past one simply went missing
        style={{ height: VIEW_H, cursor: pan?.moved ? 'grabbing' : 'grab' }}
      >
        <div
          ref={wallRef}
          className="absolute left-0 top-0 origin-top-left"
          // NO transform or transition here on purpose: both are written
          // imperatively (see paint), and a value React knows about is a
          // value React resets on the next unrelated render — which during a
          // card drag would snap the wall back mid-gesture.
          style={{
            width: boardW,
            height: boardH,
            willChange: 'transform',
            ...PEGBOARD_BG,
            // the wall itself, edges and all. It grows under the hand, so the
            // frame reads as the board making room rather than a limit hit.
            // backgroundColor, never the `background` shorthand — that would
            // reset the perforation's size and position spread just above.
            backgroundColor: 'color-mix(in srgb, var(--color-panel) 40%, var(--color-trough))',
            border: '1.5px solid color-mix(in srgb, var(--color-w-workshop) 30%, transparent)',
            borderRadius: 4,
            boxShadow: 'inset 0 0 40px rgb(0 0 0 / 0.28)',
          }}
        >
          {/* corner brackets — a frame alone reads as a panel; brackets read
              as the extent of a working surface, which is what this is */}
          {[
            { top: -1, left: -1, bt: true, bl: true },
            { top: -1, right: -1, bt: true, br: true },
            { bottom: -1, left: -1, bb: true, bl: true },
            { bottom: -1, right: -1, bb: true, br: true },
          ].map((c, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                top: c.top,
                left: c.left,
                right: c.right,
                bottom: c.bottom,
                width: 18,
                height: 18,
                borderTop: c.bt ? `2px solid ${COPPER}` : undefined,
                borderBottom: c.bb ? `2px solid ${COPPER}` : undefined,
                borderLeft: c.bl ? `2px solid ${COPPER}` : undefined,
                borderRight: c.br ? `2px solid ${COPPER}` : undefined,
                opacity: 0.75,
              }}
            />
          ))}
          <Threads
            placed={placed}
            threads={threads}
            w={boardW}
            h={boardH}
            hover={drag || twine ? null : hover}
            hideFor={drag?.moved ? drag.id : null}
          />
          {placed.map((p) => {
            const dragging = drag?.moved && drag.id === p.card.id
            const hovered = hover === p.card.id && !dragging && !pan?.moved
            return (
              <div
                key={p.card.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(p.card.id, el)
                  else cardRefs.current.delete(p.card.id)
                }}
                onPointerDown={cardDown(p.card, p)}
                onPointerUp={cardUp(p.card)}
                onPointerCancel={() => setDrag(null)}
                // mouse only: on a touch screen "hover" is just a stale tap
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setHover(p.card.id)
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse')
                    setHover((h) => (h === p.card.id ? null : h))
                }}
                className="absolute touch-none"
                style={{
                  left: dragging ? drag.x - drag.dx : p.x,
                  top: dragging ? drag.y - drag.dy : p.y,
                  width: CARD_W,
                  zIndex: dragging ? 30 : hovered ? 4 : p.card.type === 'title' ? 2 : 1,
                  cursor: dragging ? 'grabbing' : 'grab',
                  opacity: dragging ? 0.9 : 1,
                  filter: dragging
                    ? 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.45))'
                    : hovered
                      ? 'drop-shadow(0 0 9px var(--glow-workshop))'
                      : undefined,
                  transition: dragging
                    ? 'none'
                    : 'left 180ms ease-out, top 180ms ease-out, filter 160ms ease-out',
                }}
              >
                <CardFace
                  card={p.card}
                  groupIndex={titleIndex.get(p.card.id) ?? 0}
                  now={now}
                  thread={
                    p.card.type === 'title'
                      ? undefined
                      : { role: twineRole(p.card.id), onPointerDown: twineDown(p.card) }
                  }
                />
              </div>
            )
          })}

          {/* the twine in flight — a straight pull from the eyelet to the hand.
              Right angles are what a HUNG thread looks like; a taut line is
              what one being run looks like, and the difference is the point. */}
          {twine && (
            <svg
              width={boardW}
              height={boardH}
              viewBox={`0 0 ${boardW} ${boardH}`}
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: 40 }}
              fill="none"
              aria-hidden
            >
              {(() => {
                const a = byId.get(twine.from)
                if (!a) return null
                return (
                  <>
                    <path
                      d={`M${a.x} ${a.y + a.h / 2} L${twine.x} ${twine.y}`}
                      stroke={twine.over && threadedPair(threads, twine.from, twine.over)
                        ? 'var(--color-danger)'
                        : COPPER}
                      strokeWidth="2"
                      strokeDasharray="7 5"
                      strokeOpacity="0.85"
                    />
                    <rect x={twine.x - 3.5} y={twine.y - 3.5} width="7" height="7" fill={COPPER} />
                  </>
                )
              })()}
            </svg>
          )}
        </div>

        <div className="absolute right-3 top-3">
          <ZoomControls
            zoom={zoomShown}
            onIn={() => {
              eased.current = true
              zoomAt(1.15)
            }}
            onOut={() => {
              eased.current = true
              zoomAt(1 / 1.15)
            }}
            onReset={() => {
              eased.current = true
              moveTo(0, 0, 1)
              setZoomShown(1)
            }}
          />
        </div>

        {/* a press and a drag on the same surface do different things, and
            neither leaves a mark — so the board says so, once, quietly */}
        <div className="pointer-events-none absolute bottom-3 left-4 max-w-[60%] text-[10.5px] italic leading-snug text-ink-faint">
          {voice.workshop.board.pressHint}
          <br />
          {voice.workshop.board.threadHint}
          <br />
          {voice.workshop.board.headingHint}
        </div>
      </div>
    </div>
  )
}

/** the zoom trio. Positioned by its caller — the desktop board and the phone
 *  hang it in different corners, and a self-positioning control cannot be
 *  reused without one of them fighting it. Buttons are thumb-sized below md. */
function ZoomControls({
  zoom,
  onIn,
  onOut,
  onReset,
}: {
  zoom: number
  onIn: () => void
  onOut: () => void
  onReset: () => void
}) {
  const btn =
    'flex h-10 w-10 items-center justify-center border border-line bg-panel text-[17px] leading-none text-ink-dim transition-colors hover:text-ink md:h-8 md:w-8 md:text-[15px]'
  return (
    <div
      className="flex items-center gap-1 rounded-[10px] p-1"
      style={{ background: 'color-mix(in srgb, var(--color-panel) 88%, transparent)' }}
      // the controls are chrome, not canvas: a press here must not pan the
      // board underneath, nor count as a press on bare pegboard
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <button type="button" aria-label={voice.workshop.board.zoomOut} onClick={onOut} className={`${btn} rounded-l-[8px]`}>
        −
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label={voice.workshop.board.zoomReset}
        className="min-h-10 min-w-[48px] px-1 text-center font-display text-[11px] font-semibold tracking-[0.1em] text-ink-dim transition-colors hover:text-ink md:min-h-0 md:text-[10.5px] [font-variant-numeric:tabular-nums]"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label={voice.workshop.board.zoomIn} onClick={onIn} className={`${btn} rounded-r-[8px]`}>
        +
      </button>
    </div>
  )
}

/**
 * A right-angle route between two boxes, oriented a → b. Freeform positions
 * mean any pair of boxes anywhere, so the route picks its plane by the
 * DOMINANT axis: mostly-sideways pairs leave through the facing side edges,
 * mostly-vertical pairs through top/bottom, with one elbow midway. The
 * orientation matters beyond geometry — the marching-dot animation runs
 * toward the path's END, so callers put the destination second.
 */
function route(
  a: { x: number; y: number; h: number },
  b: { x: number; y: number; h: number },
): { d: string; corners: [number, number][] } {
  const acx = a.x + CARD_W / 2
  const acy = a.y + a.h / 2
  const bcx = b.x + CARD_W / 2
  const bcy = b.y + b.h / 2
  const dx = bcx - acx
  const dy = bcy - acy
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = dx >= 0 ? a.x + CARD_W : a.x
    const ex = dx >= 0 ? b.x : b.x + CARD_W
    if (Math.abs(acy - bcy) < 1) return { d: `M${sx} ${acy} H${ex}`, corners: [] }
    const midX = (sx + ex) / 2
    return {
      d: `M${sx} ${acy} H${midX} V${bcy} H${ex}`,
      corners: [
        [midX, acy],
        [midX, bcy],
      ],
    }
  }
  const sy = dy >= 0 ? a.y + a.h : a.y
  const ey = dy >= 0 ? b.y : b.y + b.h
  if (Math.abs(acx - bcx) < 1) return { d: `M${acx} ${sy} V${ey}`, corners: [] }
  const midY = (sy + ey) / 2
  return {
    d: `M${acx} ${sy} V${midY} H${bcx} V${ey}`,
    corners: [
      [acx, midY],
      [bcx, midY],
    ],
  }
}

/**
 * The twine layer: copper card-to-card threads, and a fainter stitched line
 * from every filed card up to its heading — on a freeform wall that tie is
 * no longer implied by geometry, so it has to be drawn to stay legible.
 *
 * Hovering a card sets the lines that touch it marching: dashes flow along
 * the path, and the paths are ORIENTED so the flow reads as direction —
 * a heading link always runs child → heading (the work points home), a
 * thread runs from the hovered card toward the far end.
 */
function Threads({
  placed,
  threads,
  w,
  h,
  hover,
  hideFor,
}: {
  placed: Placed[]
  threads: { id: string; from: string; to: string }[]
  w: number
  h: number
  hover: string | null
  hideFor: string | null
}) {
  const byId = new Map(placed.map((p) => [p.card.id, p]))
  const lines: { d: string; corners: [number, number][]; parent: boolean; flow: boolean }[] = []

  for (const t of threads) {
    let a = byId.get(t.from)
    let b = byId.get(t.to)
    if (!a || !b) continue
    if (hideFor && (a.card.id === hideFor || b.card.id === hideFor)) continue
    const flow = hover === a.card.id || hover === b.card.id
    // resting twine draws in reading order; hovered twine leads from the
    // card under the mouse, so its dots flow outward from the hand
    if (hover === b.card.id) [a, b] = [b, a]
    else if (!flow && (a.y > b.y || (a.y === b.y && a.x > b.x))) [a, b] = [b, a]
    lines.push({ ...route(a, b), parent: false, flow })
  }

  for (const p of placed) {
    if (p.card.type === 'title' || !p.card.parentId) continue
    const t = byId.get(p.card.parentId)
    if (!t) continue
    if (hideFor && (p.card.id === hideFor || t.card.id === hideFor)) continue
    // always child → heading, whichever end is hovered: dots run toward the
    // heading, because that is what the tie MEANS
    lines.push({
      ...route(p, t),
      parent: true,
      flow: hover === p.card.id || hover === t.card.id,
    })
  }

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0"
      fill="none"
      aria-hidden
    >
      {/* scoped here rather than in the app stylesheet: the march is this
          board's own hardware, and core must not know the workshop exists */}
      <style>{`@keyframes ws-march { to { stroke-dashoffset: -16; } }`}</style>
      {lines.map((l, i) => (
        <g key={i}>
          <path
            d={l.d}
            stroke={COPPER}
            strokeWidth={l.parent ? 1.5 : 2}
            strokeOpacity={l.flow ? 0.95 : l.parent ? 0.28 : 0.55}
            strokeDasharray={l.flow || l.parent ? '2 6' : undefined}
            strokeLinecap={l.flow || l.parent ? 'round' : undefined}
            style={l.flow ? { animation: 'ws-march 480ms linear infinite' } : undefined}
          />
          {/* junction hardware only on resting twine — marching dots passing
              through a fixed square read as a snag, not a joint */}
          {!l.flow &&
            !l.parent &&
            l.corners.map(([x, y], k) => (
              <rect key={k} x={x - 3} y={y - 3} width="6" height="6" fill={COPPER} />
            ))}
        </g>
      ))}
    </svg>
  )
}

/** how a card is taking part in a thread gesture right now */
type ThreadRole = 'idle' | 'source' | 'target' | 'cut'

interface ThreadHandle {
  role: ThreadRole
  /** desktop: the eyelet is dragged */
  onPointerDown?: (e: React.PointerEvent) => void
  /** phone: the eyelet is tapped to arm, then the other card is tapped */
  onClick?: (e: React.MouseEvent) => void
}

/** one hung card: peg tabs, type label, state square, title, body/url */
function CardFace({
  card,
  groupIndex = 0,
  now,
  thread,
}: {
  card: BoardCard
  groupIndex?: number
  /** ticking now, for a deadline's reading — omitted where none is shown */
  now?: number
  thread?: ThreadHandle
}) {
  const done = card.type === 'task' && card.done
  const due = now != null ? dueRead(card, now) : null

  // A heading is not a card, it is a rail: no peg tabs, no state square, a
  // copper underline and the name in display type. Making it look like the
  // work under it would defeat the point of having it.
  if (card.type === 'title') {
    return (
      <div className="relative pb-1.5" style={{ borderBottom: `2px solid ${COPPER}` }}>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[8.5px] font-semibold tracking-[0.2em] text-ink-faint [font-variant-numeric:tabular-nums]">
            {String(groupIndex + 1).padStart(2, '0')}
          </span>
          <span className="truncate font-display text-[15px] font-bold uppercase tracking-[0.12em] text-ink">
            {card.title}
          </span>
        </div>
        {card.body && (
          <div className="mt-1 text-[11.5px] leading-snug text-ink-dim">{card.body}</div>
        )}
      </div>
    )
  }

  // the card owns the outline while a thread is being run to it: copper to
  // hang one, danger to cut the one that is already there
  const ring =
    thread?.role === 'target'
      ? { borderColor: COPPER, boxShadow: '0 0 0 2px var(--glow-workshop)' }
      : thread?.role === 'cut'
        ? { borderColor: 'var(--color-danger)', boxShadow: 'none' }
        : thread?.role === 'source'
          ? { borderColor: COPPER, boxShadow: 'none' }
          : {}

  return (
    <div
      className="relative rounded-[2px] border border-line px-3.5 py-3"
      style={{
        background: 'color-mix(in srgb, var(--color-panel) 82%, var(--color-bg))',
        opacity: done ? 0.45 : 1,
        ...ring,
      }}
    >
      <span
        aria-hidden
        className="absolute -top-[10px] left-[24%] h-[11px] w-[9px] rounded-[1px] border"
        style={{ background: 'var(--color-panel-3)', borderColor: 'var(--color-line)' }}
      />
      {/* THE EYELET — where twine is picked up. It sits half off the card's
          left edge, in the gutter the threads already run through, so it reads
          as hardware rather than as another control on the face. `data-nodrag`
          keeps a press here from also dragging the card. */}
      {thread && (
        <button
          type="button"
          data-nodrag
          aria-label={voice.workshop.board.threadFrom}
          onPointerDown={thread.onPointerDown}
          onClick={thread.onClick}
          className="absolute -left-[8px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border-2 transition-all after:absolute after:-inset-3 after:content-[''] hover:scale-110"
          style={{
            borderColor: COPPER,
            background:
              thread.role === 'source' ? COPPER : 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
            opacity: thread.role === 'idle' ? 0.6 : 1,
            cursor: 'crosshair',
          }}
        />
      )}
      <span
        aria-hidden
        className="absolute -top-[10px] right-[24%] h-[11px] w-[9px] rounded-[1px] border"
        style={{ background: 'var(--color-panel-3)', borderColor: 'var(--color-line)' }}
      />
      <div className="flex items-center gap-2">
        <span className="text-[8.5px] tracking-[0.2em] text-ink-faint">
          {voice.workshop.sheet.cardType[card.type]}
        </span>
        {card.type === 'task' ? (
          /* The one control on the wall people actually use, so it is a real
             box you can hit: 24 px of ink with a 48 px target around it, not
             the 9 px dot it was. `-inset-3` does the widening invisibly, which
             keeps the card's own geometry unchanged. */
          <button
            type="button"
            data-nodrag
            aria-label={voice.workshop.board.done}
            aria-pressed={!!card.done}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              // the mobile card is itself pressable — ticking must not also
              // open the editor behind it
              e.stopPropagation()
              navigator.vibrate?.(6)
              useWorkshopStore.getState().toggleCardDone(card.id)
            }}
            className="relative ml-auto flex h-6 w-6 flex-none items-center justify-center rounded-[4px] text-[13px] font-bold leading-none transition-colors after:absolute after:-inset-3 after:content-['']"
            style={{
              border: `1.5px solid ${COPPER}`,
              background: card.done ? COPPER : 'transparent',
              color: 'var(--color-bg)',
            }}
          >
            {card.done ? '✓' : ''}
          </button>
        ) : (
          <span
            aria-hidden
            className="ml-auto h-[9px] w-[9px]"
            style={{ border: `1.5px solid ${COPPER}` }}
          />
        )}
      </div>
      <div
        className="mt-1.5 text-[13.5px] font-semibold leading-snug"
        style={{ textDecoration: done ? 'line-through' : 'none' }}
      >
        {card.title}
      </div>
      {done && (
        <div className="mt-1 font-display text-[10px] font-semibold tracking-[0.2em] text-ink-faint">
          {voice.workshop.board.done}
        </div>
      )}
      {/* the promise, with its hour. A missed one turns danger and keeps
          saying so; a struck job shows nothing, because the deadline it was
          racing no longer has a claim on anyone. */}
      {!done && due && (
        <div
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-[3px] font-display text-[9.5px] font-semibold tracking-[0.12em] [font-variant-numeric:tabular-nums]"
          style={{
            borderColor: due.overdue
              ? 'color-mix(in srgb, var(--color-danger) 55%, transparent)'
              : 'color-mix(in srgb, var(--color-w-workshop) 40%, transparent)',
            color: due.overdue ? 'var(--color-danger)' : due.days <= 1 ? COPPER : 'var(--color-ink-dim)',
            background: due.overdue
              ? 'color-mix(in srgb, var(--color-danger) 10%, transparent)'
              : 'transparent',
          }}
        >
          {voice.workshop.due.chip({
            date: fdate(due.at),
            time: hhmm(due.at),
            days: due.days,
            overdue: due.overdue,
          })}
        </div>
      )}
      {/* a struck job hides its detail: the card has said the only thing that
          still matters about it, and the wall stays readable */}
      {!done && card.type !== 'link' && card.body && (
        <div className="mt-1 text-[12px] leading-[1.45] text-ink-dim [font-variant-numeric:tabular-nums]">
          {card.body}
        </div>
      )}
      {/* safeHref, not card.url: cards saved before the scheme was checked are
          still in the store, and this is the only place one is opened */}
      {!done && card.type === 'link' && card.url && safeHref(card.url) && (
        <a
          data-nodrag
          href={safeHref(card.url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-1 block truncate text-[11.5px]"
          style={{ color: COPPER }}
        >
          {card.url.replace(/^https?:\/\//, '')} ↗
        </a>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- mobile */

/**
 * The phone pages the wall one GROUP at a time: a heading and everything hung
 * under it is a single snap page, so the organisation the headings give the
 * board is exactly what a thumb swipes through. No pan here — paging is the
 * phone's navigation, and dragging a 390 px wall around would only fight it.
 * Zoom stays, because a dense column on a phone is the one thing worth
 * scaling: the trio, or a pinch, both feeding the same `z`.
 */
function MobileBoard({
  ventureId,
  groups,
  threads,
  now,
  onEdit,
  onCreateAt,
  butler,
}: {
  ventureId: string
  groups: BoardGroup[]
  threads: Thread[]
  now: number
  onEdit: (card: BoardCard) => void
  onCreateAt: (spot: PlaceSpot) => void
  butler: (msg: string) => void
}) {
  const [page, setPage] = useState(0)
  const [z, setZ] = useState(1)
  /**
   * The phone threads in TWO TAPS, not by dragging: a column here is a snap
   * page, so a drag either fights the pager or can only ever reach the cards
   * already on screen — and the pair worth threading is usually on two
   * different pages. Arming survives a swipe; a tap on the far card finishes.
   */
  const [armed, setArmed] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const linked = (a: BoardCard, b: BoardCard) => threadedPair(threads, a.id, b.id)

  const zoomBy = (f: number) => setZ((v) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v * f)))

  // the phone's pinch scales the column, never the page — the only two-finger
  // gesture the app still answers (core/ui/zoomLock refuses the rest)
  usePinch(scroller, (f) => zoomBy(f))

  /** a tap on a card: the far end of an armed thread, or the editor as usual */
  const tapCard = (card: BoardCard) => {
    if (!armed) {
      onEdit(card)
      return
    }
    if (armed !== card.id) {
      navigator.vibrate?.(6)
      runThread(ventureId, threads, armed, card.id, butler)
    }
    setArmed(null)
  }

  /**
   * A rail opens its column — EXCEPT while twine is armed, when it does
   * nothing at all. A heading is not a legal end for a thread (the desktop
   * hit-test excludes them for the same reason), so a tap there mid-pick is a
   * misfire against the scroll, and swallowing the armed state or sending the
   * user off into a sheet would both cost them the pick they were making.
   */
  const openHeading = (card: BoardCard) => {
    if (armed) return
    onEdit(card)
  }

  /**
   * Only two cards ever light up while armed: the one twine is coming FROM,
   * and any card a tap would CUT rather than join. Ringing every other card as
   * a target would be true and useless — while armed, every card is a target.
   */
  const mobileRole = (id: string): ThreadRole => {
    if (!armed) return 'idle'
    if (armed === id) return 'source'
    return threadedPair(threads, armed, id) ? 'cut' : 'idle'
  }

  return (
    <div className="trough relative md:hidden" style={PEGBOARD_BG}>
      {/* armed: the wall says what it is waiting for, and how to call it off.
          It sits at the TOP — the bottom already holds the pager dots and the
          zoom trio — and it takes its own height rather than floating over the
          page, because the thing it would cover is the column's own heading. */}
      {armed && (
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{
            background: 'color-mix(in srgb, var(--color-w-workshop) 16%, var(--color-panel))',
            borderBottom: `1.5px solid ${COPPER}`,
          }}
        >
          <span className="font-display text-[10.5px] font-semibold tracking-[0.12em] text-ink">
            {voice.workshop.board.threadPick}
          </span>
          <button
            type="button"
            onClick={() => setArmed(null)}
            className="ml-auto rounded-pill border px-3 py-1.5 font-display text-[9.5px] font-bold tracking-[0.14em] text-ink-dim"
            style={{ borderColor: 'var(--color-line)' }}
          >
            {voice.workshop.board.threadStop}
          </button>
        </div>
      )}
      {/* bottom-right, not top: it is where a thumb already is, and the top of
          every page belongs to that column's heading */}
      <div className="absolute bottom-2.5 right-2.5 z-10">
        <ZoomControls
          zoom={z}
          onIn={() => zoomBy(1.15)}
          onOut={() => zoomBy(1 / 1.15)}
          onReset={() => setZ(1)}
        />
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex snap-x snap-mandatory overflow-x-auto"
      >
        {groups.map((g, i) => (
          <div
            key={g.title?.id ?? 'loose'}
            className="w-full flex-none snap-center px-6 pb-12 pt-5"
            /* `zoom`, not `transform: scale`: zoom REFLOWS, so the page keeps
               its own height and the column goes on scrolling normally. A
               transform would paint a scaled copy over an unchanged box, and
               the bottom of a zoomed-in column would be unreachable. */
            style={{ zoom: z }}
          >
            {g.title ? (
              /* the rail opens its column here too — the phone's page already
                 IS that column, but the list is where it can be reordered,
                 struck through and weeded without opening a card each time */
              <div
                role="button"
                tabIndex={0}
                onClick={() => openHeading(g.title!)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openHeading(g.title!)
                  }
                }}
                className="mb-4 cursor-pointer text-left"
              >
                <CardFace card={g.title} groupIndex={i} />
              </div>
            ) : (
              <div className="mb-4 font-display text-[10px] font-semibold tracking-[0.2em] text-ink-faint">
                {voice.workshop.board.loose}
              </div>
            )}
            {g.children.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center text-[12px] italic text-ink-faint">
                {voice.workshop.board.empty}
              </div>
            ) : (
              g.children.map((c, k) => (
                <div key={c.id}>
                  {k > 0 && (
                    <svg
                      width="100%"
                      height="28"
                      className="block"
                      aria-hidden
                      style={{
                        visibility: linked(g.children[k - 1], c) ? 'visible' : 'hidden',
                      }}
                    >
                      <line
                        x1="50%"
                        y1="0"
                        x2="50%"
                        y2="28"
                        stroke={COPPER}
                        strokeOpacity="0.55"
                        strokeWidth="2"
                      />
                    </svg>
                  )}
                  {/* a div, not a button: a task card carries its own DONE
                      checkbox, and a button inside a button is invalid HTML —
                      the browser reparents it and the tick stops working */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => tapCard(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        tapCard(c)
                      }
                    }}
                    className={`block w-full cursor-pointer text-left ${k > 0 ? '' : 'mt-0'}`}
                    style={k > 0 ? undefined : { marginTop: 0 }}
                  >
                    <CardFace
                      card={c}
                      now={now}
                      thread={{
                        role: mobileRole(c.id),
                        onClick: (e) => {
                          // the eyelet arms and disarms; the card behind it
                          // must not open its editor under the tap
                          e.stopPropagation()
                          navigator.vibrate?.(6)
                          setArmed((a) => (a === c.id ? null : c.id))
                        },
                      }}
                    />
                  </div>
                  {k < g.children.length - 1 && !linked(c, g.children[k + 1]) && (
                    <div className="h-3" />
                  )}
                </div>
              ))
            )}
            {/* the phone's version of pressing bare board: an explicit target
                at the foot of the column, because an invisible tap zone on a
                touch screen is a thing nobody finds */}
            <button
              type="button"
              onClick={() => onCreateAt({ parentId: g.title?.id, index: g.children.length })}
              className="mt-3 w-full rounded-[2px] border-[1.5px] border-dashed border-line py-3 text-center font-display text-[9.5px] font-semibold tracking-[0.16em] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-dim"
            >
              {voice.workshop.board.hangHere}
            </button>
          </div>
        ))}
      </div>
      {/* the dots move left to make room for the zoom trio on the right */}
      <div className="pointer-events-none absolute bottom-5 left-5 flex items-center gap-2">
        {groups.map((g, i) => (
          <span
            key={g.title?.id ?? 'loose'}
            className="block"
            style={{
              width: 14,
              height: 5,
              background: i === page ? COPPER : 'var(--color-line)',
              // scale, not width — the active dot stretches without relayout
              transform: i === page ? 'none' : `scaleX(${5 / 14})`,
              transition: 'transform 160ms ease-out, background 160ms ease-out',
            }}
          />
        ))}
        <span className="ml-2 font-display text-[8.5px] font-semibold tracking-[0.18em] text-ink-faint [font-variant-numeric:tabular-nums]">
          {voice.workshop.board.colOf({ col: page + 1, total: groups.length })}
        </span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- sheets */

/** the one icon in the wing: a bin, so the destructive control is recognised
 *  before its label is read. Stroked in currentColor, like every other glyph. */
function TrashGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9a1 1 0 0 0 1 .95h4.6a1 1 0 0 0 1-.95L12 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * A deadline is edited as a DAY and an HOUR and stored as one instant. The
 * split is only the input's — two native pickers get the phone's own date and
 * time wheels for free, where one `datetime-local` gets a cramped hybrid.
 */
const dueParts = (iso?: string): { date: string; time: string } => {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  return { date: localDayKey(d), time: hhmm(d) }
}

/** the pair back into an instant — parsed as LOCAL time, never `new Date(str)` */
const dueInstant = (date: string, time: string): string | undefined => {
  if (!date) return undefined
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '18:00').split(':').map(Number)
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return undefined
  const at = new Date(y, m - 1, d, hh, mm, 0, 0)
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString()
}

/** what a deadline defaults to: the next 18:00 that hasn't happened yet */
const nextEvening = (now: number): Date => {
  const d = new Date(now)
  d.setHours(18, 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d
}

/**
 * THE COLUMN — what a heading opens. A heading has no content of its own
 * worth a sheet; what it has is the work filed under it, and on a freeform
 * wall that work can be scattered anywhere. So pressing the rail lists it:
 * every card under this heading, in the order the phone pages them, each one
 * strikeable, reorderable, removable and openable from here.
 *
 * The order this list edits is `row`, which is the same order the phone's
 * column uses — so tidying a column here tidies it on the other surface too.
 */
function ColumnSheet({
  open,
  onClose,
  heading,
  rows,
  threads,
  now,
  onOpenCard,
  onHangHere,
  butler,
}: {
  open: boolean
  onClose: () => void
  heading: BoardCard | null
  rows: BoardCard[]
  /** the venture's twine, so the confirm can say what a delete would cut */
  threads: Thread[]
  now: number
  onOpenCard: (card: BoardCard) => void
  onHangHere: (index: number) => void
  butler: (msg: string) => void
}) {
  const [confirm, setConfirm] = useState<BoardCard | null>(null)
  if (!heading) return null
  const store = () => useWorkshopStore.getState()

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.workshop.board.columnTitle(heading.title.toUpperCase())}</h2>
      <div className="mt-1 text-[12px] text-ink-dim">
        {voice.workshop.board.columnCount(rows.length)}
      </div>

      <div className="mt-3 flex flex-col">
        {rows.length === 0 && (
          <div className="py-2.5 text-[13px] italic text-ink-dim">
            {voice.workshop.board.columnEmpty}
          </div>
        )}
        {rows.map((c, i) => {
          const due = dueRead(c, now)
          const done = c.type === 'task' && c.done
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 border-b border-line py-2 last:border-b-0"
            >
              {/* a job's tick lives on the row, so a column can be worked
                  through without opening a single card */}
              {c.type === 'task' ? (
                <button
                  type="button"
                  aria-label={voice.workshop.board.done}
                  aria-pressed={!!c.done}
                  onClick={() => {
                    navigator.vibrate?.(6)
                    store().toggleCardDone(c.id)
                  }}
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] text-[11px] font-bold leading-none"
                  style={{
                    border: `1.5px solid ${COPPER}`,
                    background: c.done ? COPPER : 'transparent',
                    color: 'var(--color-bg)',
                  }}
                >
                  {c.done ? '✓' : ''}
                </button>
              ) : (
                <span
                  aria-hidden
                  className="h-[8px] w-[8px] flex-none"
                  style={{ border: `1.5px solid ${COPPER}` }}
                />
              )}

              {/* the row itself is the door into the card */}
              <button
                type="button"
                onClick={() => onOpenCard(c)}
                className="flex min-w-0 flex-1 flex-col items-start text-left"
              >
                <span className="flex w-full items-baseline gap-2">
                  <span className="flex-none text-[8px] tracking-[0.2em] text-ink-faint">
                    {voice.workshop.sheet.cardType[c.type]}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                    style={{
                      color: done ? 'var(--color-ink-faint)' : 'var(--color-ink)',
                      textDecoration: done ? 'line-through' : 'none',
                    }}
                  >
                    {c.title}
                  </span>
                </span>
                {!done && due && (
                  <span
                    className="mt-0.5 text-[10px] font-semibold tracking-[0.1em] [font-variant-numeric:tabular-nums]"
                    style={{ color: due.overdue ? 'var(--color-danger)' : 'var(--color-ink-dim)' }}
                  >
                    {voice.workshop.due.chip({
                      date: fdate(due.at),
                      time: hhmm(due.at),
                      days: due.days,
                      overdue: due.overdue,
                    })}
                  </span>
                )}
              </button>

              {/* order is `row`, the same order the phone pages — the arrows
                  are the only way to set it now that the wall is freeform */}
              <button
                type="button"
                aria-label={voice.workshop.board.moveUp}
                disabled={i === 0}
                onClick={() => store().placeCard(c.id, heading.id, i - 1)}
                className="flex-none px-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={voice.workshop.board.moveDown}
                disabled={i === rows.length - 1}
                onClick={() => store().placeCard(c.id, heading.id, i + 1)}
                className="flex-none px-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink disabled:opacity-25"
              >
                ↓
              </button>
              {/* the same destruction as the card sheet's button, so it asks
                  the same question — a row here is a smaller target than that
                  one, not a lesser act */}
              <button
                type="button"
                aria-label={voice.workshop.board.takeDown}
                onClick={() => setConfirm(c)}
                className="relative flex-none text-ink-faint transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-danger"
              >
                <TrashGlyph />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => onHangHere(rows.length)}
        className="mt-3 w-full rounded-[2px] border-[1.5px] border-dashed border-line py-2.5 text-center font-display text-[9.5px] font-semibold tracking-[0.16em] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-dim"
      >
        {voice.workshop.board.hangHere}
      </button>

      <button
        type="button"
        onClick={() => onOpenCard(heading)}
        className="mt-4 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink"
      >
        {voice.workshop.board.editHeading}
      </button>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="btn-soft px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.14em]"
        >
          {voice.workshop.sheet.cancel}
        </button>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={voice.workshop.sheet.takeDownTitle}
        message={
          confirm
            ? voice.workshop.sheet.takeDownBody({
                title: confirm.title,
                threads: threads.filter((t) => t.from === confirm.id || t.to === confirm.id).length,
              })
            : undefined
        }
        confirmLabel={voice.workshop.sheet.takeDownYes}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          store().deleteCard(confirm!.id)
          butler(voice.workshop.toast.cardGone)
          setConfirm(null)
        }}
      />
    </Sheet>
  )
}

function HangCardSheet({
  open,
  onClose,
  venture,
  cards,
  threads,
  editing,
  placeAt,
  butler,
}: {
  open: boolean
  onClose: () => void
  venture: Venture
  cards: BoardCard[]
  threads: { id: string; from: string; to: string }[]
  editing: BoardCard | null
  /** set when the sheet was opened by pressing a spot on the board */
  placeAt: PlaceSpot | null
  butler: (msg: string) => void
}) {
  const [type, setType] = useState<CardType>('note')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [threadTo, setThreadTo] = useState('')
  const [parentId, setParentId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // (re)seed on open — a fresh hang or the tapped card's current state
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    setType(editing?.type ?? 'note')
    setTitle(editing?.title ?? '')
    setBody(editing?.body ?? '')
    setUrl(editing?.url ?? '')
    setThreadTo('')
    const due = dueParts(editing?.dueAt)
    setDueDate(due.date)
    setDueTime(due.time)
    // a press on the board already answered "under which heading"
    setParentId(editing?.parentId ?? placeAt?.parentId ?? '')
  }, [open, editing, placeAt])

  const titles = cards.filter((c) => c.type === 'title' && c.id !== editing?.id)
  const others = cards.filter((c) => c.id !== editing?.id && c.type !== 'title')
  const existing = editing
    ? threads.filter((t) => t.from === editing.id || t.to === editing.id)
    : []
  const nameOf = (id: string) => cards.find((c) => c.id === id)?.title ?? '—'

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      butler(voice.workshop.toast.titleFirst)
      return
    }
    const store = useWorkshopStore.getState()
    // a link carries an address, everything else carries prose — and the
    // unused half is cleared, so switching a card's type cannot leave the old
    // one's field behind to reappear if it is switched back
    // a deadline is a job's business only — retyping a task to a note takes
    // its chip off the Manor rather than leaving an orphan behind it
    const dueAt = type === 'task' ? dueInstant(dueDate, dueTime) : undefined
    const extra = {
      body: type === 'link' ? undefined : body.trim() || undefined,
      url: type === 'link' ? url.trim() || undefined : undefined,
      dueAt,
    }
    // a heading never hangs under anything — see BoardCard.parentId
    const under = type === 'title' ? undefined : parentId || undefined
    if (editing) {
      store.updateCard(editing.id, { type, title: trimmed, ...extra })
      // moving columns is a PLACEMENT, not a field edit: it has to renumber
      // the destination, which is what placeCard exists to do
      if (type !== 'title' && (editing.parentId ?? '') !== (under ?? '')) {
        store.placeCard(editing.id, under, Number.MAX_SAFE_INTEGER)
      }
      if (threadTo) store.addThread(venture.id, editing.id, threadTo)
      // the toast names the thing that CHANGED, deadline included — "Renamed"
      // over a card whose deadline was just cleared is a small lie
      butler(
        threadTo
          ? voice.workshop.toast.threaded
          : dueAt && !editing.dueAt
            ? voice.workshop.toast.dueSet
            : !dueAt && editing.dueAt
              ? voice.workshop.toast.dueCleared
              : voice.workshop.toast.renamed,
      )
    } else {
      const made = store.addCard(venture.id, type, trimmed, {
        ...extra,
        parentId: under,
        threadTo: threadTo || undefined,
        // the desktop press said WHERE on the wall — the card is born there
        at: placeAt?.at,
      })
      // the phone's column-foot button said where IN THE COLUMN instead —
      // the press said where, and addCard only ever appends
      if (
        placeAt?.index != null &&
        type !== 'title' &&
        (under ?? undefined) === placeAt.parentId
      ) {
        store.placeCard(made.id, under, placeAt.index)
      }
      track('card_added', { kind: type })
      butler(type === 'title' ? voice.workshop.toast.titleHung : voice.workshop.toast.cardHung)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      {/* the sheet has always said HANG A CARD, amending one included — and a
          chip on the Manor now walks people straight into it, where "hang a
          card" reads as an invitation to make a second one */}
      <h2 className="card-title">
        {editing ? voice.workshop.board.amend : voice.workshop.board.hang.replace(/^\+\s*/, '')}
      </h2>
      <div className="mt-4 inline-flex gap-1 rounded-pill border border-line bg-panel p-1">
        {(['title', 'note', 'task', 'link'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className="rounded-pill px-3.5 py-2 font-display text-[10px] font-bold tracking-[0.14em] transition-colors"
            style={
              type === t
                ? { background: COPPER, color: 'var(--color-bg)' }
                : { color: 'var(--color-ink-dim)' }
            }
          >
            {voice.workshop.sheet.cardType[t]}
          </button>
        ))}
      </div>
      <SheetLabel>{voice.workshop.sheet.title}</SheetLabel>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={voice.workshop.sheet.titlePlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      {/* the same field for both: a note's text and a job's description are
          the longer half of the card, and only the label differs */}
      {(type === 'note' || type === 'task') && (
        <>
          <SheetLabel>
            {type === 'task' ? voice.workshop.sheet.detail : voice.workshop.sheet.body}
          </SheetLabel>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              type === 'task'
                ? voice.workshop.sheet.detailPlaceholder
                : voice.workshop.sheet.bodyPlaceholder
            }
            rows={2}
            className="w-full resize-none rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
          />
        </>
      )}
      {/* ------------------------------------------------------- the deadline
          A job may or may not be a delivery, so the field is not there until
          it is asked for: a date input sitting empty on every card would
          suggest every job wants a day, and most do not. */}
      {type === 'task' && (
        <>
          <SheetLabel>{voice.workshop.due.label}</SheetLabel>
          {!dueDate ? (
            <button
              type="button"
              onClick={() => {
                const d = nextEvening(Date.now())
                setDueDate(localDayKey(d))
                setDueTime(hhmm(d))
              }}
              className="rounded-pill border px-3.5 py-2 font-display text-[10px] font-bold tracking-[0.14em] transition-colors"
              style={{ borderColor: COPPER, color: COPPER }}
            >
              {voice.workshop.due.set}
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-label={voice.workshop.due.dateLabel}
                  className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none [font-variant-numeric:tabular-nums]"
                />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  aria-label={voice.workshop.due.timeLabel}
                  className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none [font-variant-numeric:tabular-nums]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDueDate('')
                    setDueTime('')
                  }}
                  className="rounded-pill border border-line px-3 py-2 font-display text-[9.5px] font-semibold tracking-[0.14em] text-ink-faint transition-colors hover:text-danger"
                >
                  {voice.workshop.due.clear}
                </button>
              </div>
              <div className="mt-2 text-xs italic text-ink-dim">{voice.workshop.due.hint}</div>
            </>
          )}
        </>
      )}
      {type === 'link' && (
        <>
          <SheetLabel>{voice.workshop.sheet.url}</SheetLabel>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={voice.workshop.sheet.urlPlaceholder}
            inputMode="url"
            className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
          />
        </>
      )}
      {type !== 'title' && titles.length > 0 && (
        <>
          <SheetLabel>{voice.workshop.sheet.under}</SheetLabel>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: '', title: voice.workshop.sheet.underNone }, ...titles].map((t) => {
              const on = parentId === t.id
              return (
                <button
                  key={t.id || 'loose'}
                  type="button"
                  onClick={() => setParentId(t.id)}
                  className="rounded-pill border px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors"
                  style={{
                    borderColor: on ? COPPER : 'var(--color-line)',
                    background: on
                      ? 'color-mix(in srgb, var(--color-w-workshop) 12%, transparent)'
                      : 'var(--color-panel-2)',
                    color: on ? 'var(--color-ink)' : 'var(--color-ink-dim)',
                  }}
                >
                  {t.title}
                </button>
              )
            })}
          </div>
        </>
      )}
      {type !== 'title' && others.length > 0 && (
        <>
          <SheetLabel>{voice.workshop.sheet.threadTo}</SheetLabel>
          <select
            value={threadTo}
            onChange={(e) => setThreadTo(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink"
          >
            <option value="">{voice.workshop.sheet.noThread}</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </>
      )}
      {existing.length > 0 && editing && (
        <div className="mt-3 flex flex-col gap-1">
          {existing.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-[12px] text-ink-dim">
              <span aria-hidden className="h-[7px] w-[7px]" style={{ border: `1.5px solid ${COPPER}` }} />
              <span className="truncate">{nameOf(t.from === editing.id ? t.to : t.from)}</span>
              <button
                type="button"
                aria-label="Cut the thread"
                onClick={() => useWorkshopStore.getState().deleteThread(t.id)}
                className="relative ml-auto text-[13px] text-ink-faint transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Taking a card down was a 10 px line of faint text whose label was the
          TOAST — "TAKEN DOWN.", past tense, full stop — so it read as a status
          the sheet was reporting rather than a button. It is now a real
          bordered control saying what it will do, and because a control this
          size is easy to hit by accident and the delete cascades the card's
          twine with it, it asks first. */}
      {editing && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[10px] border py-3 font-display text-[11px] font-bold uppercase tracking-[0.14em] transition-colors"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          <TrashGlyph />
          {voice.workshop.sheet.takeDown}
        </button>
      )}
      <SheetActions
        cta={editing ? voice.workshop.sheet.ctaSaveCard : voice.workshop.sheet.ctaHang}
        onCancel={onClose}
        onSave={save}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={voice.workshop.sheet.takeDownTitle}
        message={
          editing
            ? voice.workshop.sheet.takeDownBody({ title: editing.title, threads: existing.length })
            : undefined
        }
        confirmLabel={voice.workshop.sheet.takeDownYes}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!editing) return
          setConfirmDelete(false)
          useWorkshopStore.getState().deleteCard(editing.id)
          butler(voice.workshop.toast.cardGone)
          onClose()
        }}
      />
    </Sheet>
  )
}

function MilestonesSheet({
  open,
  onClose,
  venture,
  milestones,
  openOn,
  now,
  butler,
}: {
  open: boolean
  onClose: () => void
  venture: Venture
  milestones: Milestone[]
  /** a marker the wing asked to be opened for amending (a MATTERS PENDING
   *  card, or a chip on the Manor) */
  openOn?: string | null
  now: number
  butler: (msg: string) => void
}) {
  /**
   * The form below the list does double duty: with nothing selected it adds,
   * and with a marker selected it amends that one. Keeping it in the SAME
   * sheet rather than stacking a second one means the list stays on screen —
   * which is the point, since re-dating a marker is usually done by looking
   * at what sits either side of it.
   */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [onDays, setOnDays] = useState(14)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** the day the stepper counts FROM, frozen on open — `now` ticks, and a
   *  sheet left open across midnight must not walk a marker forward on save */
  const [from, setFrom] = useState(() => startOfLocalDay(new Date(now)).getTime())

  const editing = editingId ? (milestones.find((m) => m.id === editingId) ?? null) : null
  const seedTitle = editing?.title ?? ''
  const seedDays = editing ? daysUntil(editing.on, from) : 14

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setConfirmDelete(false)
      return
    }
    setFrom(startOfLocalDay(new Date(Date.now())).getTime())
    // `now` is read for the freeze, never watched — see `from` above
  }, [open])

  // the wing hands over a marker to open on; a request for one that is gone
  // is ignored, and the sheet is just a list again
  useEffect(() => {
    if (!open || !openOn) return
    setEditingId(milestones.some((m) => m.id === openOn) ? openOn : null)
  }, [open, openOn])

  // load whichever marker is selected into the form — and clear it back to a
  // fresh add when nothing is
  useEffect(() => {
    if (!open) return
    setTitle(seedTitle)
    setOnDays(seedDays)
    setConfirmDelete(false)
  }, [open, editingId, seedTitle, seedDays])

  const rows = [...pendingMilestones(milestones), ...milestones.filter((m) => m.done)]
  // "differs from the store", not "was touched" — the SpendSheet's rule
  const dirty = title !== seedTitle || onDays !== seedDays
  // amending has to REPRESENT the marker it opened on, so its range stretches
  // to hold one already overdue, or dated beyond the reach adding allows
  const minDays = editing ? Math.min(0, seedDays) : 1
  const maxDays = editing ? Math.max(180, seedDays) : 180
  const day = addDays(new Date(from), onDays)

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      butler(voice.workshop.toast.titleFirst)
      return
    }
    const store = useWorkshopStore.getState()
    if (editing) {
      // countFrom is left alone: moving the day must not reset the hours
      // already counted toward it
      store.updateMilestone(editing.id, { title: trimmed, on: localDayKey(day) })
      butler(voice.workshop.toast.msEdited)
      setEditingId(null)
      return
    }
    store.addMilestone(venture.id, trimmed, localDayKey(day))
    butler(voice.workshop.toast.msAdded)
    setTitle('')
    setOnDays(14)
  }

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <h2 className="card-title">{voice.workshop.milestonesTitle(venture.name.toUpperCase())}</h2>
      <div className="mt-2 flex flex-col">
        {rows.length === 0 && (
          <div className="py-2.5 text-[13px] italic text-ink-dim">{voice.workshop.noMilestones}</div>
        )}
        {rows.map((m, i) => {
          const days = daysUntil(m.on, now)
          const nextOne = !m.done && i === 0
          const on = m.id === editingId
          return (
            <div
              key={m.id}
              className="flex items-baseline gap-2.5 border-b border-line py-2.5 last:border-b-0"
            >
              <button
                type="button"
                aria-label={voice.workshop.done}
                aria-pressed={m.done}
                onClick={() => {
                  useWorkshopStore.getState().setMilestoneDone(m.id, !m.done)
                  butler(m.done ? voice.workshop.toast.msUndone : voice.workshop.toast.msDone)
                }}
                className="relative h-[8px] w-[8px] flex-none rotate-45 after:absolute after:-inset-3 after:content-['']"
                style={{
                  border: `1.5px solid ${m.done ? 'var(--color-ink-faint)' : COPPER}`,
                  background: m.done || nextOne ? (m.done ? 'var(--color-ink-faint)' : COPPER) : 'transparent',
                }}
              />
              <button
                type="button"
                aria-label={voice.workshop.editRow}
                aria-pressed={on}
                onClick={() => setEditingId(on ? null : m.id)}
                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold transition-colors"
                style={{
                  color: on ? COPPER : m.done ? 'var(--color-ink-faint)' : 'var(--color-ink)',
                  textDecoration: m.done ? 'line-through' : 'none',
                }}
              >
                {m.title}
              </button>
              <span
                className="flex-none text-[11.5px] [font-variant-numeric:tabular-nums]"
                style={{
                  color: !m.done && days < 0 ? 'var(--color-danger)' : 'var(--color-ink-dim)',
                }}
              >
                {fdate(dayKeyToDate(m.on))}
                {!m.done && ` · ${voice.workshop.countdown(days)}`}
              </span>
            </div>
          )
        })}
      </div>
      <SheetLabel>{editing ? voice.workshop.editMs : voice.workshop.addMs}</SheetLabel>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={voice.workshop.sheet.msPlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetLabel>{voice.workshop.sheet.theDay}</SheetLabel>
      <Stepper
        label={`${voice.workshop.countdown(onDays)} — ${fdatem(day)}`}
        minWidth={200}
        onDec={() => setOnDays((d) => Math.max(minDays, d - 1))}
        onInc={() => setOnDays((d) => Math.min(maxDays, d + 1))}
      />
      <div className="mt-3.5 text-xs italic text-ink-dim">
        {editing ? voice.workshop.sheet.msEditHint : voice.workshop.sheet.msHint}
      </div>
      {editing && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="mt-5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[10px] border py-3 font-display text-[11px] font-bold uppercase tracking-[0.14em] transition-colors"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-danger) 45%, transparent)',
            background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          <TrashGlyph />
          {voice.workshop.sheet.unmark}
        </button>
      )}
      <SheetActions
        cta={editing ? voice.workshop.sheet.ctaSaveMs : voice.workshop.sheet.ctaMs}
        // amending, CANCEL leaves the MARKER rather than the sheet: the list
        // is what you came for, and closing it out from under a correction is
        // the wrong half to throw away
        onCancel={editing ? () => setEditingId(null) : onClose}
        onSave={save}
        cancelLabel={editing ? voice.workshop.sheet.doneEditing : undefined}
      />
      <ConfirmDialog
        open={confirmDelete && !!editing}
        title={voice.workshop.sheet.unmarkTitle}
        message={editing ? voice.workshop.sheet.unmarkBody(editing.title) : undefined}
        confirmLabel={voice.workshop.sheet.unmarkYes}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!editing) return
          useWorkshopStore.getState().deleteMilestone(editing.id)
          setConfirmDelete(false)
          setEditingId(null)
          butler(voice.workshop.toast.msGone)
        }}
      />
    </Sheet>
  )
}
