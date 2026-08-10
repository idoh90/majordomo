import { useEffect, useRef, useState } from 'react'
import { addDays, atHour, startOfWeek } from '../../core/dates'
import { hoursOf, rangeFree } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import type { CalendarEvent } from '../../core/events/types'
import { useShellStore } from '../../core/store/shell'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { Hinted } from '../../core/ui/Hint'
import { Sheet } from '../../core/ui/Sheet'
import { useNow } from '../../core/useNow'
import { voice } from '../../core/voice'
import { WorkshopBriefing } from './Briefing'
import { Board } from './Board'
import { BenchControl } from './bench'
import {
  COPPER,
  DayStrip,
  PEGBOARD_BG,
  SheetActions,
  SheetLabel,
  StatusPill,
  Stepper,
  VentureChips,
  fdate,
  hhmm,
  todayStripIndex,
} from './bits'
import {
  awaitingReport,
  daysSinceTouched,
  daysUntil,
  lifetimeHours,
  metaOf,
  milestoneProgress,
  nextMilestone,
  pendingMilestones,
  projRef,
  reconcileMarkers,
  ventureOfEvent,
  workshopStats,
} from './lib'
import { useWorkshopStore } from './store'
import { useWorkshopUi } from './uiStore'
import type { Milestone, SessionMeta, Venture } from './types'

const MAX_RINGS = 8
const RING_C = 2 * Math.PI * 38

const MO_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** The Workshop — ventures with bench hours, milestones, and a pegboard each. */
export function WorkshopScreen() {
  const activeEvents = useEventsStore((s) => (s.sandbox ? s.sandbox.events : s.events))
  const ventures = useWorkshopStore((s) => s.ventures)
  const sessions = useWorkshopStore((s) => s.sessions)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  // DEV: ?board or ?board=<ventureId> lands straight on a venture's pegboard
  const [boardFor, setBoardFor] = useState<string | null>(() => {
    if (!import.meta.env.DEV) return null
    const p = new URLSearchParams(window.location.search)
    if (!p.has('board')) return null
    const wanted = p.get('board')
    const vs = useWorkshopStore.getState().ventures.filter((v) => !v.archived)
    return vs.find((v) => v.id === wanted)?.id ?? vs[0]?.id ?? null
  })
  const [sheet, setSheet] = useState<'open' | 'book' | 'bench' | null>(null)
  const [editVenture, setEditVenture] = useState<Venture | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const butler = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 4_500)
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  // the tab bar's + posts a one-shot request through the mailbox
  const addSheetRequested = useWorkshopUi((s) => s.addSheetRequested)
  useEffect(() => {
    if (!addSheetRequested) return
    setSheet('book')
    useWorkshopUi.getState().clearAddSheetRequest()
  }, [addSheetRequested])

  // …and the bench chip posts the board it wants opened
  const boardRequested = useWorkshopUi((s) => s.boardRequested)
  useEffect(() => {
    if (!boardRequested) return
    setBoardFor(boardRequested)
    useWorkshopUi.getState().clearBoardRequest()
  }, [boardRequested])

  // upkeep on entry: heal markers, drop meta for events deleted Manor-side.
  // Both are sandbox-guarded (reconcileMarkers internally; prune here).
  useEffect(() => {
    const events = useEventsStore.getState()
    const ws = useWorkshopStore.getState()
    reconcileMarkers(ws.milestones, Date.now())
    if (!events.sandbox) ws.pruneSessions(events.events.map((e) => e.id))
  }, [])

  const active = ventures.filter((v) => !v.archived)
  const stats = workshopStats(activeEvents, sessions, ventures, now, weekStart)

  const board = boardFor ? (active.find((v) => v.id === boardFor) ?? null) : null

  // the board replaces the wing's furniture but keeps the sheets and the
  // toast mounted — the tab bar's + must reach BOOK BENCH TIME from either room
  const wing = board ? (
    <Board venture={board} onBack={() => setBoardFor(null)} butler={butler} />
  ) : (
    <div className="mt-4 flex flex-col gap-4">
      {active.length > 0 && <WorkshopBriefing />}

      {active.length === 0 ? (
        <EmptyWing
          onOpen={() => {
            setEditVenture(null)
            setSheet('open')
          }}
        />
      ) : (
        <>
          <BenchPanel
            ventures={active}
            stats={stats}
            butler={butler}
            onNeedVenture={() => setSheet('bench')}
          />
          <MattersPending
            events={activeEvents}
            sessions={sessions}
            ventures={ventures}
            now={now}
            onOpen={setBoardFor}
          />
          <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr]">
            <Desk
              events={activeEvents}
              ventures={active}
              sessions={sessions}
              weekWindow={[stats.weekStart, stats.weekEnd]}
              now={now}
              onBook={() => setSheet('book')}
              butler={butler}
            />
            <Shelf
              ventures={active}
              events={activeEvents}
              sessions={sessions}
              now={now}
              onOpenBoard={setBoardFor}
              onNew={() => {
                setEditVenture(null)
                setSheet('open')
              }}
              onRename={(v) => {
                setEditVenture(v)
                setSheet('open')
              }}
              butler={butler}
            />
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      {wing}

      <OpenVentureSheet
        open={sheet === 'open'}
        onClose={() => {
          setSheet(null)
          setEditVenture(null)
        }}
        editing={editVenture}
        butler={butler}
      />
      <BookBenchSheet
        open={sheet === 'book'}
        onClose={() => setSheet(null)}
        ventures={active}
        events={activeEvents}
        now={now}
        butler={butler}
      />
      <PickBenchSheet
        open={sheet === 'bench'}
        onClose={() => setSheet(null)}
        ventures={active.filter((v) => v.status !== 'shipped')}
        butler={butler}
      />

      {toast && <Toast msg={toast} />}
    </>
  )
}

function Toast({ msg }: { msg: string }) {
  return (
    <div className="menu-panel fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out] md:bottom-6">
      {msg}
    </div>
  )
}

/* ---------------------------------------------------------------- empty */

function EmptyWing({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="panel px-5 py-5 sm:px-6">
      <div
        className="trough flex flex-col items-center gap-4 px-6 py-12"
        style={PEGBOARD_BG}
      >
        <span className="text-[13px] italic text-ink-dim">{voice.workshop.emptyWing}</span>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-xl border px-5 py-2.5 font-display text-[11px] font-bold tracking-[0.16em] transition-[filter] hover:brightness-125"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-w-workshop) 50%, transparent)',
            color: COPPER,
          }}
        >
          {voice.workshop.openVenture}
        </button>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- bench hero */

function BenchPanel({
  ventures,
  stats,
  butler,
  onNeedVenture,
}: {
  ventures: Venture[]
  stats: ReturnType<typeof workshopStats>
  butler: (msg: string) => void
  onNeedVenture: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ringed = ventures.filter((v) => v.status !== 'shipped')
  const shown = expanded ? ringed : ringed.slice(0, MAX_RINGS)
  const hidden = ringed.length - shown.length

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <Hinted tip={voice.hints.workshop.bench}>
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="card-title">{voice.workshop.weekAtBench}</h2>
          <span className="ml-auto text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {voice.workshop.weekLine({
              from: fdate(stats.weekStart),
              to: fdate(new Date(stats.weekEnd.getTime() - 86_400_000)),
              fulfilled: stats.totalFulfilled,
              booked: stats.totalBooked,
            })}
          </span>
        </div>
      </Hinted>
      <div
        className="trough mt-4 flex flex-wrap items-center gap-x-7 gap-y-4 overflow-x-auto px-5 pb-4 pt-4"
        style={PEGBOARD_BG}
      >
        {shown.map((v) => (
          <VentureRing key={v.id} venture={v} week={stats.perVenture[v.id]} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-center rounded-pill border border-line px-3.5 py-1.5 font-display text-[10px] font-semibold tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
          >
            {voice.workshop.more(hidden)}
          </button>
        )}
        <span className="ml-auto flex-none">
          <BenchControl onStart={onNeedVenture} onStopped={butler} />
        </span>
      </div>
    </section>
  )
}

function VentureRing({ venture, week }: { venture: Venture; week?: { fulfilledH: number } }) {
  const fh = week?.fulfilledH ?? 0
  const goal = venture.goalH
  const frac = goal > 0 ? Math.min(1, fh / goal) : 0
  const noGoal = goal <= 0
  return (
    <div className="flex w-[104px] flex-none flex-col items-center gap-2 py-1">
      <div className="relative h-[96px] w-[96px]">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden>
          <circle cx="48" cy="48" r="38" fill="none" stroke="var(--color-panel-2)" strokeWidth="8" />
          <circle
            cx="48"
            cy="48"
            r="38"
            fill="none"
            stroke={COPPER}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(noGoal ? RING_C : RING_C * frac).toFixed(1)} ${RING_C.toFixed(1)}`}
            transform="rotate(-90 48 48)"
            opacity={noGoal ? 0.22 : 1}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="stat-num font-display text-[22px] font-semibold leading-none">
            {fh.toFixed(1)}
          </div>
          <div className="mt-0.5 text-[9px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {noGoal ? voice.workshop.ringNoGoal : voice.workshop.ringOfGoal(goal)}
          </div>
        </div>
      </div>
      <div className="max-w-full truncate text-center font-display text-[10px] font-semibold tracking-[0.14em] text-ink-dim">
        {venture.name.toUpperCase()}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- milestones */

function MattersPending({
  events,
  sessions,
  ventures,
  now,
  onOpen,
}: {
  events: CalendarEvent[]
  sessions: Record<string, SessionMeta>
  ventures: Venture[]
  now: number
  onOpen: (ventureId: string) => void
}) {
  const milestones = useWorkshopStore((s) => s.milestones)
  const live = new Set(ventures.filter((v) => !v.archived).map((v) => v.id))
  const pending = pendingMilestones(milestones).filter((m) => live.has(m.ventureId))
  const nameOf = (m: Milestone) => ventures.find((v) => v.id === m.ventureId)?.name ?? '—'

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <Hinted tip={voice.hints.workshop.pending}>
        <h2 className="card-title">{voice.workshop.mattersPending}</h2>
      </Hinted>
      {pending.length === 0 ? (
        <div className="mt-2 text-[13px] italic text-ink-dim">{voice.workshop.noMilestones}</div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3.5">
          {pending.map((m, i) => {
            const days = daysUntil(m.on, now)
            const overdue = days < 0
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.ventureId)}
                className="min-w-[230px] flex-1 rounded-xl border bg-panel-2 px-4 py-3.5 text-left"
                style={{
                  borderColor: overdue
                    ? 'color-mix(in srgb, var(--color-danger) 40%, transparent)'
                    : 'var(--color-line)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-1.5 w-1.5 rotate-45" style={{ background: COPPER }} />
                  <span className="font-display text-[13.5px] font-bold tracking-[0.1em]">
                    {nameOf(m).toUpperCase()}
                  </span>
                  <span className="text-[10px] tracking-[0.12em] text-ink-faint">
                    {m.title.toUpperCase()}
                  </span>
                </div>
                <div
                  className="stat-num mt-2 font-display text-[28px] font-semibold leading-none"
                  style={{
                    color: overdue ? 'var(--color-danger)' : i === 0 ? COPPER : 'var(--color-ink)',
                  }}
                >
                  {voice.workshop.countdown(days)}
                </div>
                <div className="mt-1.5 text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
                  {overdue
                    ? voice.workshop.overdueNote
                    : voice.workshop.hoursToward(milestoneProgress(m, events, sessions))}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- the desk */

function Desk({
  events,
  ventures,
  sessions,
  weekWindow,
  now,
  onBook,
  butler,
}: {
  events: CalendarEvent[]
  ventures: Venture[]
  sessions: Record<string, SessionMeta>
  weekWindow: [Date, Date]
  now: number
  onBook: () => void
  butler: (msg: string) => void
}) {
  const [partialFor, setPartialFor] = useState<string | null>(null)
  const [partialH, setPartialH] = useState(1)

  const nameOf = (e: CalendarEvent) => {
    const id = ventureOfEvent(e)
    return id ? (ventures.find((v) => v.id === id)?.name ?? e.title) : e.title
  }

  const awaiting = awaitingReport(events, sessions, now)
  const fulfill = (id: string, f: SessionMeta['fulfillment'], doneH?: number) => {
    useWorkshopStore.getState().fulfill(id, f, doneH)
    setPartialFor(null)
    butler(
      f === 'done'
        ? voice.workshop.toast.markedDone
        : f === 'skipped'
          ? voice.workshop.toast.struck
          : voice.workshop.toast.notedPartial(doneH ?? 0),
    )
  }
  const file = (e: CalendarEvent, ventureId: string) => {
    useEventsStore.getState().updateEvent(e.id, { sourceRef: projRef(ventureId) })
    useWorkshopStore.getState().setSessionMeta(e.id, { fulfillment: 'planned' })
    butler(voice.workshop.toast.filed)
  }

  const [w0, w1] = weekWindow
  const ledger = events
    .filter((e) => {
      if (e.kind !== 'workshop' || e.allDay) return false
      const s = new Date(e.start)
      return s >= w0 && s < w1
    })
    .sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-5">
        <Hinted tip={voice.hints.workshop.desk}>
          <h2 className="card-title">{voice.workshop.desk}</h2>
        </Hinted>
        <button
          type="button"
          onClick={onBook}
          className="btn-cta mt-3 w-full py-3 text-[13px] tracking-[0.16em]"
          style={{ background: COPPER, color: 'var(--color-bg)', boxShadow: 'none' }}
        >
          {voice.workshop.book}
        </button>

        <div className="card-title mt-5">{voice.workshop.awaiting}</div>
        {awaiting.length === 0 && (
          <div className="py-2.5 text-[13px] italic text-ink-dim">{voice.workshop.noAwaiting}</div>
        )}
        {awaiting.map((e) => {
          const s = new Date(e.start)
          const en = new Date(e.end)
          const unfiled = ventureOfEvent(e) === null
          const open = partialFor === e.id
          const maxP = Math.max(0.5, hoursOf(e) - 0.5)
          return (
            <div key={e.id} className="border-b border-line py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-[13px] font-semibold">{nameOf(e)}</span>
                <span className="text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
                  {fdate(s)} · {hhmm(s)} → {hhmm(en)}
                </span>
                <span className="ml-auto font-display text-sm font-semibold [font-variant-numeric:tabular-nums]">
                  {hoursOf(e).toFixed(1)} h
                </span>
              </div>
              {unfiled ? (
                <div className="mt-2">
                  <span className="font-display text-[9px] font-semibold tracking-[0.16em] text-ink-faint">
                    {voice.workshop.fileUnder}
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ventures.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => file(e, v.id)}
                        className="rounded-pill border border-line bg-panel-2 px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-[var(--color-w-workshop)] hover:text-ink"
                      >
                        {v.name.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <QueueAction
                      label={voice.workshop.done}
                      color="var(--color-positive)"
                      onClick={() => fulfill(e.id, 'done')}
                    />
                    <QueueAction
                      label={voice.workshop.partial}
                      color="var(--color-ember)"
                      onClick={() => {
                        setPartialFor(open ? null : e.id)
                        setPartialH(maxP)
                      }}
                    />
                    <QueueAction
                      label={voice.workshop.skipped}
                      color="var(--color-ink-faint)"
                      onClick={() => fulfill(e.id, 'skipped')}
                    />
                  </div>
                  {open && (
                    <div className="mt-2.5 flex items-center gap-2.5 animate-[fade-in_160ms_ease-out]">
                      <button
                        type="button"
                        onClick={() => setPartialH((h) => Math.max(0.5, h - 0.5))}
                        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink"
                      >
                        −
                      </button>
                      <span className="min-w-[44px] text-center font-display text-base font-semibold [font-variant-numeric:tabular-nums]">
                        {partialH.toFixed(1)} h
                      </span>
                      <button
                        type="button"
                        onClick={() => setPartialH((h) => Math.min(maxP, h + 0.5))}
                        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => fulfill(e.id, 'partial', partialH)}
                        className="btn-cta px-4 py-2 text-[11px] tracking-[0.14em]"
                        style={{ background: COPPER, color: 'var(--color-bg)', boxShadow: 'none' }}
                      >
                        {voice.workshop.logIt}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
        {awaiting.filter((e) => ventureOfEvent(e) !== null).length > 1 && (
          <button
            type="button"
            onClick={() => {
              for (const e of awaiting) {
                if (ventureOfEvent(e) !== null) useWorkshopStore.getState().fulfill(e.id, 'skipped')
              }
              setPartialFor(null)
              butler(voice.workshop.toast.restStruck)
            }}
            className="mt-2.5 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {voice.workshop.strikeRest}
          </button>
        )}
      </section>

      <section className="panel p-5">
        <Hinted tip={voice.hints.workshop.weekLedger}>
          <h2 className="card-title">{voice.workshop.weekLedger}</h2>
        </Hinted>
        <div className="mt-1.5 flex flex-col">
          {ledger.length === 0 && (
            <div className="py-2 text-[13px] text-ink-dim">{voice.workshop.noLedger}</div>
          )}
          {ledger.map((e) => {
            const s = new Date(e.start)
            const en = new Date(e.end)
            const meta = metaOf(sessions, e)
            const past = en.getTime() <= now
            const [st, stColor] =
              meta.fulfillment === 'done'
                ? [
                    meta.live ? voice.workshop.status.liveDone : voice.workshop.status.done,
                    'var(--color-positive)',
                  ]
                : meta.fulfillment === 'partial'
                  ? [voice.workshop.status.partial(meta.doneH ?? 0), 'var(--color-ember)']
                  : meta.fulfillment === 'skipped'
                    ? [voice.workshop.status.skipped, 'var(--color-ink-faint)']
                    : past
                      ? [voice.workshop.status.awaiting, COPPER]
                      : [voice.workshop.status.ahead, 'var(--color-ink-dim)']
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-baseline gap-2.5 border-b border-line py-2 last:border-b-0"
              >
                <span className="w-[52px] text-[12.5px] font-semibold [font-variant-numeric:tabular-nums]">
                  {fdate(s)}
                </span>
                <span className="text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                  {hhmm(s)} → {hhmm(en)}
                </span>
                <span className="text-[12.5px]">{nameOf(e)}</span>
                <span className="ml-auto font-display text-sm font-semibold [font-variant-numeric:tabular-nums]">
                  {hoursOf(e).toFixed(1)} h
                </span>
                <span
                  className="w-[88px] text-right font-display text-[9.5px] font-semibold tracking-[0.13em]"
                  style={{ color: stColor }}
                >
                  {st}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function QueueAction({
  label,
  color,
  onClick,
}: {
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill border bg-transparent px-3.5 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] transition-[filter] hover:brightness-125"
      style={{ borderColor: color, color }}
    >
      {label}
    </button>
  )
}

/* ---------------------------------------------------------------- the shelf */

function Shelf({
  ventures,
  events,
  sessions,
  now,
  onOpenBoard,
  onNew,
  onRename,
  butler,
}: {
  ventures: Venture[]
  events: CalendarEvent[]
  sessions: Record<string, SessionMeta>
  now: number
  onOpenBoard: (id: string) => void
  onNew: () => void
  onRename: (v: Venture) => void
  butler: (msg: string) => void
}) {
  const milestones = useWorkshopStore((s) => s.milestones)
  const [confirmArchive, setConfirmArchive] = useState<Venture | null>(null)
  const shipped = ventures.filter((v) => v.status === 'shipped').length

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <Hinted tip={voice.hints.workshop.shelf}>
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="card-title">{voice.workshop.shelf}</h2>
          <span className="ml-auto text-[10.5px] tracking-[0.08em] text-ink-faint [font-variant-numeric:tabular-nums]">
            {voice.workshop.shelfCount({ total: ventures.length, shipped })}
          </span>
        </div>
      </Hinted>
      <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
        {ventures.map((v) => (
          <ShelfCard
            key={v.id}
            venture={v}
            ms={nextMilestone(milestones, v.id)}
            events={events}
            sessions={sessions}
            now={now}
            onOpen={() => onOpenBoard(v.id)}
            onRename={() => onRename(v)}
            onArchive={() => setConfirmArchive(v)}
            butler={butler}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="mt-3.5 w-full rounded-xl border-[1.5px] border-dashed border-line px-4 py-3 text-center font-display text-[10.5px] font-semibold tracking-[0.16em] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-dim"
      >
        {voice.workshop.openVenture}
      </button>

      <ConfirmDialog
        open={confirmArchive !== null}
        title={voice.workshop.archiveTitle}
        message={confirmArchive ? voice.workshop.archiveBody(confirmArchive.name) : ''}
        confirmLabel={voice.workshop.archiveYes}
        onConfirm={() => {
          if (confirmArchive) {
            useWorkshopStore.getState().archiveVenture(confirmArchive.id)
            butler(voice.workshop.toast.archived)
          }
          setConfirmArchive(null)
        }}
        onCancel={() => setConfirmArchive(null)}
      />
    </section>
  )
}

function ShelfCard({
  venture,
  ms,
  events,
  sessions,
  now,
  onOpen,
  onRename,
  onArchive,
  butler,
}: {
  venture: Venture
  ms: Milestone | null
  events: CalendarEvent[]
  sessions: Record<string, SessionMeta>
  now: number
  onOpen: () => void
  onRename: () => void
  onArchive: () => void
  butler: (msg: string) => void
}) {
  const lifetime = lifetimeHours(events, sessions, venture.id)
  const quiet = daysSinceTouched(events, sessions, venture.id, now)
  const shippedMonth = venture.shippedAt
    ? MO_LONG[new Date(venture.shippedAt).getMonth()]
    : null
  const dim = venture.status === 'shipped' || venture.status === 'shelved'
  const t = voice.workshop.touched

  const touchedLine =
    venture.status === 'shipped'
      ? shippedMonth
        ? t.shippedIn(shippedMonth)
        : t.shippedLine
      : quiet === null
        ? t.never
        : quiet === 0
          ? t.today
          : quiet >= 7
            ? t.quietLong(quiet)
            : t.days(quiet)

  const act = (label: string, fn: () => void) => (
    <button
      key={label}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        fn()
      }}
      className="font-display text-[8.5px] font-semibold tracking-[0.16em] text-ink-faint transition-colors hover:text-ink"
    >
      {label}
    </button>
  )

  const set = (status: Venture['status'], toast: string) => () => {
    useWorkshopStore.getState().setStatus(venture.id, status)
    butler(toast)
  }
  const tt = voice.workshop.toast

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="cursor-pointer rounded-xl border border-line bg-panel-2 px-4 py-3.5 text-left transition-colors hover:border-[var(--color-w-workshop)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="font-display text-[15px] font-bold tracking-[0.08em]"
          style={{ color: dim ? 'var(--color-ink-dim)' : 'var(--color-ink)' }}
        >
          {venture.name.toUpperCase()}
        </span>
        <StatusPill status={venture.status} />
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span
          className="stat-num font-display text-[24px] font-semibold leading-none [font-variant-numeric:tabular-nums]"
          style={{ color: dim ? 'var(--color-ink-dim)' : 'var(--color-ink)' }}
        >
          {lifetime.toFixed(1)} h
        </span>
        <span className="text-[8.5px] tracking-[0.18em] text-ink-faint">
          {voice.workshop.lifetime}
        </span>
      </div>
      {venture.status === 'shipped' ? (
        <div className="mt-2 text-[11.5px] italic text-ink-dim">{t.shippedLine}</div>
      ) : ms ? (
        <div
          className="mt-2 text-[11.5px] [font-variant-numeric:tabular-nums]"
          style={{
            color: daysUntil(ms.on, now) < 0 ? 'var(--color-danger)' : 'var(--color-ink-dim)',
          }}
        >
          ◇ {ms.title.toUpperCase()} · {voice.workshop.countdown(daysUntil(ms.on, now))}
        </div>
      ) : null}
      <div className="mt-1 text-[11.5px] text-ink-dim">{touchedLine}</div>
      <div className="mt-2.5 flex gap-3">
        {act(voice.workshop.rename, onRename)}
        {(venture.status === 'spark' || venture.status === 'building') &&
          act(voice.workshop.ship, set('shipped', tt.shipped))}
        {(venture.status === 'spark' || venture.status === 'building') &&
          act(voice.workshop.shelve, set('shelved', tt.shelved))}
        {venture.status === 'shelved' && act(voice.workshop.reopen, set('building', tt.reopened))}
        {(venture.status === 'shipped' || venture.status === 'shelved') &&
          act(voice.workshop.archive, onArchive)}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- sheets */

function OpenVentureSheet({
  open,
  onClose,
  editing,
  butler,
}: {
  open: boolean
  onClose: () => void
  editing: Venture | null
  butler: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState(4)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setGoal(editing?.goalH ?? 4)
  }, [open, editing])

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      butler(voice.workshop.toast.nameFirst)
      return
    }
    if (editing) {
      useWorkshopStore.getState().updateVenture(editing.id, { name: trimmed, goalH: goal })
      butler(voice.workshop.toast.renamed)
    } else {
      useWorkshopStore.getState().addVenture(trimmed, goal)
      butler(voice.workshop.toast.opened)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">
        {editing ? editing.name.toUpperCase() : voice.workshop.openVenture.replace(/^\+\s*/, '')}
      </h2>
      <SheetLabel>{voice.workshop.sheet.name}</SheetLabel>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={voice.workshop.sheet.namePlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetLabel>{voice.workshop.sheet.weeklyGoal}</SheetLabel>
      <Stepper
        label={`${goal.toFixed(1)} h / wk`}
        onDec={() => setGoal((g) => Math.max(0, g - 0.5))}
        onInc={() => setGoal((g) => Math.min(40, g + 0.5))}
      />
      <div className="mt-3.5 text-xs italic text-ink-dim">{voice.workshop.sheet.goalZeroHint}</div>
      <SheetActions
        cta={editing ? voice.workshop.sheet.ctaRename : voice.workshop.sheet.ctaOpen}
        onCancel={onClose}
        onSave={save}
      />
    </Sheet>
  )
}

function BookBenchSheet({
  open,
  onClose,
  ventures,
  events,
  now,
  butler,
}: {
  open: boolean
  onClose: () => void
  ventures: Venture[]
  events: CalendarEvent[]
  now: number
  butler: (msg: string) => void
}) {
  const [ventureId, setVentureId] = useState('')
  const [dayIdx, setDayIdx] = useState<number | null>(null)
  const [startH, setStartH] = useState(19)
  const [dur, setDur] = useState(1.5)

  useEffect(() => {
    if (!open) return
    setVentureId((prev) => (ventures.some((v) => v.id === prev) ? prev : (ventures[0]?.id ?? '')))
    setDayIdx(todayStripIndex(now))
    setStartH(19)
    setDur(1.5)
  }, [open])

  const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
  const day = addDays(strip0, dayIdx ?? 0)
  const start = atHour(day, startH)
  const end = atHour(day, startH + dur)
  const past = end.getTime() <= now

  const save = () => {
    const venture = ventures.find((v) => v.id === ventureId)
    if (!venture || dayIdx === null) return
    if (!rangeFree(events, start, end)) {
      butler(voice.manor.occupied)
      return
    }
    const ev = useEventsStore.getState().addEvent({
      source: 'workshop',
      sourceRef: projRef(venture.id),
      kind: 'workshop',
      title: venture.name,
      start: start.toISOString(),
      end: end.toISOString(),
    })
    useWorkshopStore.getState().setSessionMeta(ev.id, {
      fulfillment: past ? 'done' : 'planned',
    })
    butler(past ? voice.workshop.toast.logged : voice.workshop.toast.onBooks)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.workshop.book}</h2>
      <SheetLabel>{voice.workshop.sheet.venture}</SheetLabel>
      <VentureChips ventures={ventures} value={ventureId} onPick={setVentureId} />
      <SheetLabel>{voice.workshop.sheet.day}</SheetLabel>
      <DayStrip now={now} picked={dayIdx} onPick={setDayIdx} />
      <div className="flex flex-wrap gap-x-6 gap-y-0">
        <div>
          <SheetLabel>{voice.workshop.sheet.start}</SheetLabel>
          <select
            value={startH}
            onChange={(e) => setStartH(Number(e.target.value))}
            className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink"
          >
            {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
        <div>
          <SheetLabel>{voice.workshop.sheet.duration}</SheetLabel>
          <Stepper
            label={`${dur.toFixed(1)} h`}
            minWidth={52}
            onDec={() => setDur((d) => Math.max(0.5, d - 0.5))}
            onInc={() => setDur((d) => Math.min(8, d + 0.5))}
          />
        </div>
      </div>
      <div className="mt-3.5 text-xs italic text-ink-dim">
        {past ? voice.workshop.sheet.bookHintPast : voice.workshop.sheet.bookHintFuture}
      </div>
      <SheetActions
        cta={past ? voice.workshop.sheet.ctaLog : voice.workshop.sheet.ctaBook}
        onCancel={onClose}
        onSave={save}
      />
    </Sheet>
  )
}

/** the wing-level TO THE BENCH: pick the venture, then the clock starts */
function PickBenchSheet({
  open,
  onClose,
  ventures,
  butler,
}: {
  open: boolean
  onClose: () => void
  ventures: Venture[]
  butler: (msg: string) => void
}) {
  const [ventureId, setVentureId] = useState('')

  useEffect(() => {
    if (!open) return
    setVentureId((prev) => (ventures.some((v) => v.id === prev) ? prev : (ventures[0]?.id ?? '')))
  }, [open])

  const start = () => {
    if (!ventureId) return
    useWorkshopStore.getState().startBench(ventureId)
    butler(voice.workshop.toast.benchStart)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.workshop.toTheBench}</h2>
      <SheetLabel>{voice.workshop.sheet.venture}</SheetLabel>
      <VentureChips ventures={ventures} value={ventureId} onPick={setVentureId} />
      <SheetActions cta={voice.workshop.toTheBench} onCancel={onClose} onSave={start} />
    </Sheet>
  )
}
