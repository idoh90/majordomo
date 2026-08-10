import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { localDayKey } from '../../core/dates'
import { Sheet } from '../../core/ui/Sheet'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { useEventsStore } from '../../core/events/store'
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
import { useWorkshopStore } from './store'
import type { BoardGroup } from './lib'
import type { BoardCard, CardType, Milestone, Thread, Venture } from './types'

/**
 * THE VENTURE BOARD — the pegboard. Cards hang on a fixed (col, row) grid;
 * threads route between them at right angles. The grid is the whole trick:
 * every position is arithmetic off the slot, so the threads never need to
 * chase a freeform canvas, and column i of the grid IS page i of the phone's
 * pager. Desktop drags cards between slots; the phone pages columns.
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

export function Board({
  venture,
  onBack,
  butler,
}: {
  venture: Venture
  onBack: () => void
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

  const [sheet, setSheet] = useState<'hang' | 'milestones' | null>(null)
  const [editCard, setEditCard] = useState<BoardCard | null>(null)
  /** where a press on bare board asked for the new card to go */
  const [placeAt, setPlaceAt] = useState<{ parentId?: string; index: number } | null>(null)

  const mine = cards.filter((c) => c.ventureId === venture.id)
  const groups = boardGroups(mine)
  const myThreads = threads.filter((t) => t.ventureId === venture.id)
  const stats = workshopStats(activeEvents, sessions, ventures, now, weekStart)
  const week = stats.perVenture[venture.id] ?? { fulfilledH: 0, bookedH: 0 }
  const lifetime = lifetimeHours(activeEvents, sessions, venture.id)
  const nextMs = nextMilestone(milestones, venture.id)
  const tasks = taskProgress(cards, venture.id)

  const openEdit = (card: BoardCard) => {
    setEditCard(card)
    setPlaceAt(null)
    setSheet('hang')
  }

  const openCreateAt = (parentId: string | undefined, index: number) => {
    setEditCard(null)
    setPlaceAt({ parentId, index })
    setSheet('hang')
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
          onClick={() => setSheet('milestones')}
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
        onClose={() => {
          setSheet(null)
          setEditCard(null)
          setPlaceAt(null)
        }}
        venture={venture}
        cards={mine}
        threads={myThreads}
        editing={editCard}
        placeAt={placeAt}
        butler={butler}
      />
      <MilestonesSheet
        open={sheet === 'milestones'}
        onClose={() => setSheet(null)}
        venture={venture}
        milestones={milestones.filter((m) => m.ventureId === venture.id)}
        now={now}
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
const VIEW_H = 560

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
  /** a press on bare board: hang something under this heading, at this place */
  onCreateAt: (parentId: string | undefined, index: number) => void
  butler: (msg: string) => void
}) {
  const viewRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const [twine, setTwine] = useState<TwineDrag | null>(null)
  const [pan, setPan] = useState<Pan | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })

  const { cols, w: boardW, h: boardH } = layout(groups, heights)
  const all = groups.flatMap((g) => (g.title ? [g.title, ...g.children] : g.children))

  // the twine is arithmetic off the layout, but a card's HEIGHT is its own —
  // one measure pass per commit keeps the stack and the twine honest
  useLayoutEffect(() => {
    const next: Record<string, number> = {}
    let changed = false
    for (const [id, el] of cardRefs.current) {
      next[id] = el.offsetHeight
      if (heights[id] !== next[id]) changed = true
    }
    if (changed || Object.keys(next).length !== Object.keys(heights).length) setHeights(next)
  })

  /** screen point → board units, undoing the pan and the zoom */
  const boardPoint = (e: { clientX: number; clientY: number }) => {
    const r = viewRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - r.left - view.x) / view.z,
      y: (e.clientY - r.top - view.y) / view.z,
    }
  }

  /** which column, and where in it, a point lands */
  const dropAt = (x: number, y: number) => {
    let ci = 0
    let best = Infinity
    cols.forEach((c, i) => {
      const d = Math.abs(x - (c.x + CARD_W / 2))
      if (d < best) {
        best = d
        ci = i
      }
    })
    const col = cols[ci]
    const parentId = groups[ci]?.title?.id
    // count the children whose middle sits above the drop point
    let index = 0
    for (const p of col.children) {
      if (p.card.id === drag?.id) continue
      if (y > p.y + p.h / 2) index++
    }
    return { ci, parentId, index }
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
      const t = dropAt(drag.x - drag.dx + CARD_W / 2, drag.y - drag.dy)
      if (card.type === 'title') store.moveTitle(card.id, t.ci)
      else store.placeCard(card.id, t.parentId, t.index)
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
    for (const col of cols) {
      for (const p of col.children) {
        if (x >= p.x && x <= p.x + CARD_W && y >= p.y && y <= p.y + p.h) return p.card
      }
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
    setPan({ sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false })
  }

  const surfaceMove = (e: React.PointerEvent) => {
    if (!pan) return
    const moved =
      pan.moved || Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > TAP_SLOP
    // the wall only follows the hand once the press has committed to being a
    // drag — otherwise a tap that wobbles by a pixel would nudge the board
    if (moved) {
      setView((v) => ({ ...v, x: pan.ox + (e.clientX - pan.sx), y: pan.oy + (e.clientY - pan.sy) }))
    }
    if (moved !== pan.moved) setPan({ ...pan, moved })
  }

  /**
   * A press on bare pegboard that never became a drag is an instruction to
   * hang something THERE: the column decides the heading, the height decides
   * the position, and the sheet opens already knowing both.
   */
  const surfaceUp = (e: React.PointerEvent) => {
    const p = pan
    setPan(null)
    // twine first: the eyelet stopped the press from ever becoming a pan, so
    // `p` is null here and the bare-board branch below would run regardless
    if (twineUp()) return
    if (!p || p.moved || drag) return
    const pt = boardPoint(e)
    const t = dropAt(pt.x, pt.y)
    onCreateAt(t.parentId, t.index)
  }

  /** zoom about a screen point, so the thing under the cursor stays under it */
  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    const r = viewRef.current?.getBoundingClientRect()
    setView((v) => {
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z * factor))
      if (!r) return { ...v, z }
      const px = (clientX ?? r.left + r.width / 2) - r.left
      const py = (clientY ?? r.top + r.height / 2) - r.top
      const k = z / v.z
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, z }
    })
  }

  // wheel-to-zoom is bound natively rather than through React: the passive
  // default on wheel listeners makes preventDefault a no-op, and without it
  // the page scrolls away underneath the board
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const target = drag?.moved ? dropAt(drag.x - drag.dx + CARD_W / 2, drag.y - drag.dy) : null
  const targetCol = target ? cols[target.ci] : null
  const targetY = targetCol
    ? (() => {
        const kids = targetCol.children.filter((p) => p.card.id !== drag?.id)
        const at = Math.min(target!.index, kids.length)
        return at < kids.length
          ? kids[at].y - CARD_GAP_Y / 2
          : (kids[kids.length - 1]?.y ?? targetCol.bottom - CARD_GAP_Y) +
            (kids[kids.length - 1]?.h ?? 0) +
            CARD_GAP_Y / 2
      })()
    : 0

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
        style={{ height: VIEW_H, cursor: pan?.moved ? 'grabbing' : 'grab', ...PEGBOARD_BG }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: boardW,
            height: boardH,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
            transition: pan || drag ? 'none' : 'transform 120ms ease-out',
          }}
        >
          <Threads
            placed={all.map((c) => ({ card: c, ...cardPos(cols, c.id) }))}
            threads={threads}
            w={boardW}
            h={boardH}
            hideFor={drag?.moved ? drag.id : null}
          />
          {/* the insertion line, drawn where the card would land */}
          {targetCol && drag && (
            <div
              aria-hidden
              className="absolute rounded-pill"
              style={{
                left: targetCol.x,
                top: Math.max(PAD_TOP, targetY),
                width: CARD_W,
                height: 3,
                background: COPPER,
                boxShadow: '0 0 8px var(--glow-workshop)',
              }}
            />
          )}
          {cols.map((col) =>
            col.title ? null : (
              <div
                key="loose-rail"
                aria-hidden
                className="absolute pb-1.5 font-display text-[10px] font-semibold tracking-[0.2em] text-ink-faint"
                style={{
                  left: col.x,
                  top: PAD_TOP,
                  width: CARD_W,
                  borderBottom: '2px solid var(--color-line)',
                }}
              >
                {voice.workshop.board.loose}
              </div>
            ),
          )}
          {cols.map((col, ci) =>
            [...(col.title ? [col.title] : []), ...col.children].map((p) => {
              const dragging = drag?.moved && drag.id === p.card.id
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
                  className="absolute touch-none"
                  style={{
                    left: dragging ? drag.x - drag.dx : p.x,
                    top: dragging ? drag.y - drag.dy : p.y,
                    width: CARD_W,
                    zIndex: dragging ? 30 : p.card.type === 'title' ? 2 : 1,
                    cursor: dragging ? 'grabbing' : 'grab',
                    opacity: dragging ? 0.9 : 1,
                    filter: dragging ? 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.45))' : undefined,
                    transition: dragging ? 'none' : 'left 180ms ease-out, top 180ms ease-out',
                  }}
                >
                  <CardFace
                    card={p.card}
                    groupIndex={ci}
                    now={now}
                    thread={
                      p.card.type === 'title'
                        ? undefined
                        : { role: twineRole(p.card.id), onPointerDown: twineDown(p.card) }
                    }
                  />
                </div>
              )
            }),
          )}

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
                const a = cardPos(cols, twine.from)
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
            zoom={view.z}
            onIn={() => zoomAt(1.15)}
            onOut={() => zoomAt(1 / 1.15)}
            onReset={() => setView({ x: 0, y: 0, z: 1 })}
          />
        </div>

        {/* a press and a drag on the same surface do different things, and
            neither leaves a mark — so the board says so, once, quietly */}
        <div className="pointer-events-none absolute bottom-3 left-4 max-w-[60%] text-[10.5px] italic leading-snug text-ink-faint">
          {voice.workshop.board.pressHint}
          <br />
          {voice.workshop.board.threadHint}
        </div>
      </div>
    </div>
  )
}

/** where a card ended up, for the twine */
function cardPos(cols: PlacedColumn[], id: string): { x: number; y: number; h: number } {
  for (const c of cols) {
    if (c.title?.card.id === id) return { x: c.title.x, y: c.title.y, h: c.title.h }
    const kid = c.children.find((p) => p.card.id === id)
    if (kid) return { x: kid.x, y: kid.y, h: kid.h }
  }
  return { x: 0, y: 0, h: 0 }
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

/** orthogonal copper twine + junction squares, all coordinates layout-derived */
function Threads({
  placed,
  threads,
  w,
  h,
  hideFor,
}: {
  placed: { card: BoardCard; x: number; y: number; h: number }[]
  threads: { id: string; from: string; to: string }[]
  w: number
  h: number
  hideFor: string | null
}) {
  const byId = new Map(placed.map((p) => [p.card.id, p]))
  const paths: { d: string; corners: [number, number][] }[] = []

  for (const t of threads) {
    let a = byId.get(t.from)
    let b = byId.get(t.to)
    if (!a || !b) continue
    if (hideFor && (a.card.id === hideFor || b.card.id === hideFor)) continue
    // draw top-to-bottom (reading order); level cards draw left-to-right
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) [a, b] = [b, a]
    const ax = a.x + CARD_W / 2
    const aBottom = a.y + a.h
    const bx = b.x + CARD_W / 2

    if (Math.abs(a.x - b.x) < 1) {
      paths.push({ d: `M${ax} ${aBottom} V${b.y}`, corners: [] })
    } else if (Math.abs(a.y - b.y) < 1) {
      const y = a.y + Math.min(a.h, b.h) / 2
      const left = Math.min(a.x, b.x) + CARD_W
      const right = Math.max(a.x, b.x)
      paths.push({ d: `M${left} ${y} H${right}`, corners: [] })
    } else {
      const yBand = Math.max(aBottom + CARD_GAP_Y / 2, b.y - CARD_GAP_Y / 2)
      paths.push({
        d: `M${ax} ${aBottom} V${yBand} H${bx} V${b.y}`,
        corners: [
          [ax, yBand],
          [bx, yBand],
        ],
      })
    }
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
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p.d} stroke={COPPER} strokeOpacity="0.55" strokeWidth="2" />
          {p.corners.map(([x, y], k) => (
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
      {!done && card.type === 'link' && card.url && (
        <a
          data-nodrag
          href={card.url}
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
 * board is exactly what a thumb swipes through. No pan and no zoom here —
 * paging is the phone's navigation, and a pinch-scaled wall on a 390 px screen
 * is a worse way to read the same cards.
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
  onCreateAt: (parentId: string | undefined, index: number) => void
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
              <div className="mb-4">
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
              onClick={() => onCreateAt(g.title?.id, g.children.length)}
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
  placeAt: { parentId?: string; index: number } | null
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

  // (re)seed on open — a fresh hang or the tapped card's current state
  useEffect(() => {
    if (!open) return
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
      })
      // a card asked for at a spot lands AT that spot, not at the foot of the
      // column — the press said where, and addCard only ever appends
      if (placeAt && type !== 'title' && (under ?? undefined) === placeAt.parentId) {
        store.placeCard(made.id, under, placeAt.index)
      }
      butler(type === 'title' ? voice.workshop.toast.titleHung : voice.workshop.toast.cardHung)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.workshop.board.hang.replace(/^\+\s*/, '')}</h2>
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
      {editing && (
        <button
          type="button"
          onClick={() => {
            useWorkshopStore.getState().deleteCard(editing.id)
            butler(voice.workshop.toast.cardGone)
            onClose()
          }}
          className="mt-4 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-danger"
        >
          {voice.workshop.toast.cardGone.toUpperCase()}
        </button>
      )}
      <SheetActions
        cta={editing ? voice.workshop.sheet.ctaSaveCard : voice.workshop.sheet.ctaHang}
        onCancel={onClose}
        onSave={save}
      />
    </Sheet>
  )
}

function MilestonesSheet({
  open,
  onClose,
  venture,
  milestones,
  now,
  butler,
}: {
  open: boolean
  onClose: () => void
  venture: Venture
  milestones: Milestone[]
  now: number
  butler: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [onDays, setOnDays] = useState(14)

  const rows = [...pendingMilestones(milestones), ...milestones.filter((m) => m.done)]
  const day = new Date(now + onDays * 86_400_000)

  const add = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      butler(voice.workshop.toast.titleFirst)
      return
    }
    useWorkshopStore.getState().addMilestone(venture.id, trimmed, localDayKey(day))
    butler(voice.workshop.toast.msAdded)
    setTitle('')
    setOnDays(14)
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.workshop.milestonesTitle(venture.name.toUpperCase())}</h2>
      <div className="mt-2 flex flex-col">
        {rows.length === 0 && (
          <div className="py-2.5 text-[13px] italic text-ink-dim">{voice.workshop.noMilestones}</div>
        )}
        {rows.map((m, i) => {
          const days = daysUntil(m.on, now)
          const nextOne = !m.done && i === 0
          return (
            <div key={m.id} className="flex items-baseline gap-2.5 border-b border-line py-2.5 last:border-b-0">
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
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                style={{
                  color: m.done ? 'var(--color-ink-faint)' : 'var(--color-ink)',
                  textDecoration: m.done ? 'line-through' : 'none',
                }}
              >
                {m.title}
              </span>
              <span
                className="flex-none text-[11.5px] [font-variant-numeric:tabular-nums]"
                style={{
                  color: !m.done && days < 0 ? 'var(--color-danger)' : 'var(--color-ink-dim)',
                }}
              >
                {fdate(dayKeyToDate(m.on))}
                {!m.done && ` · ${voice.workshop.countdown(days)}`}
              </span>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => {
                  useWorkshopStore.getState().deleteMilestone(m.id)
                  butler(voice.workshop.toast.msGone)
                }}
                className="relative flex-none text-[13px] text-ink-faint transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:text-danger"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <SheetLabel>{voice.workshop.addMs}</SheetLabel>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={voice.workshop.sheet.msPlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetLabel>{voice.workshop.sheet.theDay}</SheetLabel>
      <Stepper
        label={`${voice.workshop.countdown(onDays)} — ${fdate(day)}`}
        minWidth={170}
        onDec={() => setOnDays((d) => Math.max(1, d - 1))}
        onInc={() => setOnDays((d) => Math.min(180, d + 1))}
      />
      <div className="mt-3.5 text-xs italic text-ink-dim">{voice.workshop.sheet.msHint}</div>
      <SheetActions cta={voice.workshop.sheet.ctaMs} onCancel={onClose} onSave={add} />
    </Sheet>
  )
}
