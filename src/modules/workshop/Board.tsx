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
  TaskProgressBar,
  fdate,
} from './bits'
import {
  BOARD_COLS,
  boardColumns,
  dayKeyToDate,
  daysUntil,
  lifetimeHours,
  nextMilestone,
  pendingMilestones,
  taskProgress,
  workshopStats,
} from './lib'
import { useWorkshopStore } from './store'
import type { BoardCard, CardType, Milestone, Venture } from './types'

/**
 * THE VENTURE BOARD — the pegboard. Cards hang on a fixed (col, row) grid;
 * threads route between them at right angles. The grid is the whole trick:
 * every position is arithmetic off the slot, so the threads never need to
 * chase a freeform canvas, and column i of the grid IS page i of the phone's
 * pager. Desktop drags cards between slots; the phone pages columns.
 */

const CARD_W = 240
const COL_GAP = 44
const SLOT_H = 190
const PAD_X = 36
const PAD_TOP = 46
const PAD_BOTTOM = 30

const colX = (col: number) => PAD_X + col * (CARD_W + COL_GAP)
const rowY = (row: number) => PAD_TOP + row * SLOT_H

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

  const mine = cards.filter((c) => c.ventureId === venture.id)
  const myThreads = threads.filter((t) => t.ventureId === venture.id)
  const stats = workshopStats(activeEvents, sessions, ventures, now, weekStart)
  const week = stats.perVenture[venture.id] ?? { fulfilledH: 0, bookedH: 0 }
  const lifetime = lifetimeHours(activeEvents, sessions, venture.id)
  const nextMs = nextMilestone(milestones, venture.id)
  const tasks = taskProgress(cards, venture.id)

  const openEdit = (card: BoardCard) => {
    setEditCard(card)
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
        <span className="flex flex-col">
          <span className="stat-num font-display text-[15px] font-semibold leading-none [font-variant-numeric:tabular-nums]">
            {lifetime.toFixed(1)} h
          </span>
          <span className="mt-0.5 text-[8px] tracking-[0.18em] text-ink-faint">
            {voice.workshop.odometer}
          </span>
        </span>
        <TaskProgressBar progress={tasks} className="w-[132px] flex-none" />
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
          <DesktopBoard cards={mine} threads={myThreads} onEdit={openEdit} />
          <MobileBoard cards={mine} threads={myThreads} onEdit={openEdit} />
        </>
      )}

      <HangCardSheet
        open={sheet === 'hang'}
        onClose={() => {
          setSheet(null)
          setEditCard(null)
        }}
        venture={venture}
        cards={mine}
        threads={myThreads}
        editing={editCard}
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

interface Drag {
  id: string
  /** pointer offset inside the card */
  dx: number
  dy: number
  /** current pointer position relative to the board */
  x: number
  y: number
  moved: boolean
}

function DesktopBoard({
  cards,
  threads,
  onEdit,
}: {
  cards: BoardCard[]
  threads: { id: string; from: string; to: string }[]
  onEdit: (card: BoardCard) => void
}) {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [drag, setDrag] = useState<Drag | null>(null)

  const maxRow = cards.reduce((m, c) => Math.max(m, c.row), 0)
  const boardW = PAD_X * 2 + BOARD_COLS * CARD_W + (BOARD_COLS - 1) * COL_GAP
  const boardH = rowY(maxRow) + SLOT_H + PAD_BOTTOM

  // threads are arithmetic off the slots, but a card's HEIGHT is its own —
  // one measure pass keeps the twine tied to real card bottoms
  useLayoutEffect(() => {
    const next: Record<string, number> = {}
    let changed = false
    for (const [id, el] of cardRefs.current) {
      next[id] = el.offsetHeight
      if (heights[id] !== next[id]) changed = true
    }
    if (changed || Object.keys(next).length !== Object.keys(heights).length) setHeights(next)
  })

  const slotOf = (x: number, y: number) => {
    const col = Math.max(
      0,
      Math.min(BOARD_COLS - 1, Math.round((x - PAD_X) / (CARD_W + COL_GAP))),
    )
    const row = Math.max(0, Math.min(maxRow + 1, Math.round((y - PAD_TOP) / SLOT_H)))
    return { col, row }
  }

  const boardPoint = (e: React.PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const down = (card: BoardCard) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    if (e.button !== 0) return
    const p = boardPoint(e)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // a capture that can't be taken only means the drag ends on pointer-out
    }
    setDrag({ id: card.id, dx: p.x - colX(card.col), dy: p.y - rowY(card.row), x: p.x, y: p.y, moved: false })
  }

  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const p = boardPoint(e)
    const moved = drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 6
    setDrag({ ...drag, x: p.x, y: p.y, moved: drag.moved || moved })
  }

  const up = (card: BoardCard) => () => {
    if (!drag || drag.id !== card.id) return
    if (drag.moved) {
      const s = slotOf(drag.x - drag.dx, drag.y - drag.dy)
      useWorkshopStore.getState().moveCard(card.id, s.col, s.row)
    } else {
      onEdit(card)
    }
    setDrag(null)
  }

  const target = drag?.moved ? slotOf(drag.x - drag.dx, drag.y - drag.dy) : null

  return (
    <div className="trough hidden overflow-x-auto md:block">
      <div
        ref={boardRef}
        className="relative"
        style={{ width: boardW, height: boardH, ...PEGBOARD_BG }}
      >
        <Threads cards={cards} threads={threads} heights={heights} w={boardW} h={boardH} hideFor={drag?.moved ? drag.id : null} />
        {target && (
          <div
            aria-hidden
            className="absolute rounded-[3px] border-[1.5px] border-dashed"
            style={{
              left: colX(target.col),
              top: rowY(target.row),
              width: CARD_W,
              height: 110,
              borderColor: 'color-mix(in srgb, var(--color-w-workshop) 55%, transparent)',
            }}
          />
        )}
        {cards.map((c) => {
          const dragging = drag?.moved && drag.id === c.id
          return (
            <div
              key={c.id}
              ref={(el) => {
                if (el) cardRefs.current.set(c.id, el)
                else cardRefs.current.delete(c.id)
              }}
              onPointerDown={down(c)}
              onPointerMove={move}
              onPointerUp={up(c)}
              onPointerCancel={() => setDrag(null)}
              className="absolute select-none touch-none"
              style={{
                left: dragging ? drag.x - drag.dx : colX(c.col),
                top: dragging ? drag.y - drag.dy : rowY(c.row),
                width: CARD_W,
                zIndex: dragging ? 30 : 1,
                cursor: dragging ? 'grabbing' : 'grab',
                filter: dragging ? 'drop-shadow(0 10px 18px rgb(0 0 0 / 0.45))' : undefined,
                transition: dragging ? 'none' : 'left 180ms ease-out, top 180ms ease-out',
              }}
            >
              <CardFace card={c} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** orthogonal copper twine + junction squares, all coordinates slot-derived */
function Threads({
  cards,
  threads,
  heights,
  w,
  h,
  hideFor,
}: {
  cards: BoardCard[]
  threads: { id: string; from: string; to: string }[]
  heights: Record<string, number>
  w: number
  h: number
  hideFor: string | null
}) {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const paths: { d: string; corners: [number, number][] }[] = []

  for (const t of threads) {
    let a = byId.get(t.from)
    let b = byId.get(t.to)
    if (!a || !b) continue
    if (hideFor && (a.id === hideFor || b.id === hideFor)) continue
    // draw top-to-bottom (reading order); same row draws left-to-right
    if (a.row > b.row || (a.row === b.row && a.col > b.col)) [a, b] = [b, a]
    const ha = heights[a.id] ?? 100
    const ax = colX(a.col) + CARD_W / 2
    const aBottom = rowY(a.row) + ha
    const bx = colX(b.col) + CARD_W / 2
    const bTop = rowY(b.row)

    if (a.col === b.col && a.row !== b.row) {
      paths.push({ d: `M${ax} ${aBottom} V${bTop}`, corners: [] })
    } else if (a.row === b.row) {
      const y = rowY(a.row) + 56
      const left = colX(a.col) + CARD_W
      const right = colX(b.col)
      paths.push({ d: `M${left} ${y} H${right}`, corners: [] })
    } else {
      const yBand = bTop - 34
      paths.push({
        d: `M${ax} ${aBottom} V${yBand} H${bx} V${bTop}`,
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

/** one hung card: peg tabs, type label, state square, title, body/url */
function CardFace({ card }: { card: BoardCard }) {
  const done = card.type === 'task' && card.done
  return (
    <div
      className="relative rounded-[2px] border border-line px-3.5 py-3"
      style={{
        background: 'color-mix(in srgb, var(--color-panel) 82%, var(--color-bg))',
        opacity: done ? 0.45 : 1,
      }}
    >
      <span
        aria-hidden
        className="absolute -top-[10px] left-[24%] h-[11px] w-[9px] rounded-[1px] border"
        style={{ background: 'var(--color-panel-3)', borderColor: 'var(--color-line)' }}
      />
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
          <button
            type="button"
            data-nodrag
            aria-label={voice.workshop.board.done}
            aria-pressed={!!card.done}
            onClick={(e) => {
              // the mobile card is itself pressable — ticking must not also
              // open the editor behind it
              e.stopPropagation()
              useWorkshopStore.getState().toggleCardDone(card.id)
            }}
            className="relative ml-auto h-[9px] w-[9px] after:absolute after:-inset-3 after:content-['']"
            style={{
              border: `1.5px solid ${COPPER}`,
              background: card.done ? COPPER : 'transparent',
            }}
          />
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
 * The phone's answer from the design session: the board pages COLUMN BY
 * COLUMN. Each grid column is one snap page, stacked top to bottom, with the
 * twine drawn between consecutive cards it actually connects.
 */
function MobileBoard({
  cards,
  threads,
  onEdit,
}: {
  cards: BoardCard[]
  threads: { id: string; from: string; to: string }[]
  onEdit: (card: BoardCard) => void
}) {
  const [page, setPage] = useState(0)
  const scroller = useRef<HTMLDivElement | null>(null)
  const cols = boardColumns(cards)
  const linked = (a: BoardCard, b: BoardCard) =>
    threads.some(
      (t) => (t.from === a.id && t.to === b.id) || (t.from === b.id && t.to === a.id),
    )

  return (
    <div className="trough relative md:hidden" style={PEGBOARD_BG}>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex snap-x snap-mandatory overflow-x-auto"
      >
        {cols.map((col, i) => (
          <div key={i} className="w-full flex-none snap-center px-6 pb-12 pt-5">
            {col.length === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center text-[12px] italic text-ink-faint">
                {voice.workshop.board.empty}
              </div>
            ) : (
              col.map((c, k) => (
                <div key={c.id}>
                  {k > 0 && (
                    <svg
                      width="100%"
                      height="40"
                      className="block"
                      aria-hidden
                      style={{
                        visibility: linked(col[k - 1], c) ? 'visible' : 'hidden',
                      }}
                    >
                      <line
                        x1="50%"
                        y1="0"
                        x2="50%"
                        y2="40"
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
                    onClick={() => onEdit(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onEdit(c)
                      }
                    }}
                    className="block w-full cursor-pointer text-left"
                  >
                    <CardFace card={c} />
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3.5 flex items-center justify-center gap-2">
        {cols.map((_, i) => (
          <span
            key={i}
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
          {voice.workshop.board.colOf({ col: page + 1, total: cols.length })}
        </span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- sheets */

function HangCardSheet({
  open,
  onClose,
  venture,
  cards,
  threads,
  editing,
  butler,
}: {
  open: boolean
  onClose: () => void
  venture: Venture
  cards: BoardCard[]
  threads: { id: string; from: string; to: string }[]
  editing: BoardCard | null
  butler: (msg: string) => void
}) {
  const [type, setType] = useState<CardType>('note')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [threadTo, setThreadTo] = useState('')

  // (re)seed on open — a fresh hang or the tapped card's current state
  useEffect(() => {
    if (!open) return
    setType(editing?.type ?? 'note')
    setTitle(editing?.title ?? '')
    setBody(editing?.body ?? '')
    setUrl(editing?.url ?? '')
    setThreadTo('')
  }, [open, editing])

  const others = cards.filter((c) => c.id !== editing?.id)
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
    const extra = {
      body: type === 'link' ? undefined : body.trim() || undefined,
      url: type === 'link' ? url.trim() || undefined : undefined,
    }
    if (editing) {
      store.updateCard(editing.id, { type, title: trimmed, ...extra })
      if (threadTo) store.addThread(venture.id, editing.id, threadTo)
      butler(threadTo ? voice.workshop.toast.threaded : voice.workshop.toast.renamed)
    } else {
      store.addCard(venture.id, type, trimmed, { ...extra, threadTo: threadTo || undefined })
      butler(voice.workshop.toast.cardHung)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.workshop.board.hang.replace(/^\+\s*/, '')}</h2>
      <div className="mt-4 inline-flex gap-1 rounded-pill border border-line bg-panel p-1">
        {(['note', 'task', 'link'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className="rounded-pill px-4 py-2 font-display text-[10px] font-bold tracking-[0.14em] transition-colors"
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
      {others.length > 0 && (
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
