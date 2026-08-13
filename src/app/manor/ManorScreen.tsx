import { useEffect, useMemo, useRef, useState } from 'react'
import { useShellStore } from '../../core/store/shell'
import { useNow } from '../../core/useNow'
import { useEventsStore } from '../../core/events/store'
import { eventsInRange, hoursByKind, seamStart, weekColumns } from '../../core/events/lib'
import { addDays, localDayKey } from '../../core/dates'
import { Collapsible } from '../../core/ui/Collapsible'
import { CollapseChevron } from '../../core/ui/CollapseToggle'
import { SegmentedControl } from '../../core/ui/SegmentedControl'
import { voice } from '../../core/voice'
import type { CalendarEvent, EventKind } from '../../core/events/types'
import { useWorkoutStore } from '../../modules/training/store'
import { CONSOLES } from '../consoles'
import { entryStage, useOnboarding } from '../onboarding/store'
import { TheBriefing } from './briefing/TheBriefing'
import { BriefingStrip } from './BriefingStrip'
import { KIND_META } from './kinds'
import { MonthView, monthCells, monthLabel } from './MonthView'
import { draftConflictLine } from './nearWatch'
import { dayStrains } from './strain'
import { useManorUi } from './uiStore'
import { WeekGrid } from './WeekGrid'

const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** The Manor — home: the duty-cycle week (or month) over the events store. */
export function ManorScreen() {
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()
  const events = useEventsStore((s) => s.events)
  const sandbox = useEventsStore((s) => s.sandbox)

  // DEV: ?manor=month opens the month view (screenshot aid)
  const [mode, setMode] = useState<'week' | 'month'>(() =>
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('manor') === 'month'
      ? 'month'
      : 'week',
  )
  const [anchor, setAnchor] = useState(() => new Date())

  // The + (quick-add) is consumed inside the week grid, so make sure a grid
  // exists to consume it: month view flips to this week. An empty week no
  // longer needs pinning — the grid is now unconditional.
  const quickAddRequested = useManorUi((s) => s.quickAddRequested)
  useEffect(() => {
    if (!quickAddRequested) return
    setMode((m) => {
      if (m === 'month') setAnchor(new Date())
      return 'week'
    })
  }, [quickAddRequested])

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const butler = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 4_500)
  }
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  // nothing anywhere, and no interview running to explain the emptiness — the
  // Manor is then the only surface that can offer the way in
  const onboardStage = useOnboarding((s) => s.stage)
  const ghost = events.length === 0 && onboardStage === null

  const activeEvents = sandbox?.events ?? events
  const columns = useMemo(() => weekColumns(anchor, weekStart), [anchor, weekStart])
  const weekEvents = useMemo(
    () => eventsInRange(activeEvents, columns[0].start, columns[6].end),
    [activeEvents, columns],
  )
  const committedWeek = useMemo(
    () => eventsInRange(events, columns[0].start, columns[6].end),
    [events, columns],
  )
  const ghosts = useMemo(
    () =>
      sandbox
        ? committedWeek.filter((e) => sandbox.changed.includes(e.id) && !e.allDay)
        : [],
    [sandbox, committedWeek],
  )
  const changedIds = useMemo(() => new Set(sandbox?.changed ?? []), [sandbox])

  // Strain from the Grounds, drawn on the calendar. The engine scores any
  // instant, so days ahead read as forecast — soreness already owed, not yet
  // felt. Rounded to the hour so the minute tick doesn't re-run the model.
  const workouts = useWorkoutStore((s) => s.workouts)
  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const weekStrain = useMemo(
    () => (workouts.length ? dayStrains(workouts, columns, nowH) : null),
    [workouts, columns, nowH],
  )
  const monthStrain = useMemo(() => {
    if (mode !== 'month' || workouts.length === 0) return null
    const days = monthCells(anchor, weekStart)
    const scored = dayStrains(
      workouts,
      days.map((d) => ({ start: seamStart(d), end: seamStart(addDays(d, 1)) })),
      nowH,
    )
    return new Map(days.map((d, i) => [localDayKey(d), scored[i]]))
  }, [mode, anchor, weekStart, workouts, nowH])

  const nav = (dir: 1 | -1) =>
    setAnchor((a) =>
      mode === 'week'
        ? addDays(a, dir * 7)
        : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    )

  const first = columns[0].day
  const last = columns[6].day
  const weekLabel =
    first.getMonth() === last.getMonth()
      ? `${first.getDate()} – ${last.getDate()} ${MO[first.getMonth()]} ${first.getFullYear()}`
      : `${first.getDate()} ${MO[first.getMonth()]} – ${last.getDate()} ${MO[last.getMonth()]}`

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <NavButton label="Previous" onClick={() => nav(-1)}>
          ‹
        </NavButton>
        <div className="min-w-[170px] text-center font-display text-[17px] font-semibold tracking-[0.1em] [font-variant-numeric:tabular-nums]">
          {mode === 'week' ? weekLabel : monthLabel(anchor)}
        </div>
        <NavButton label="Next" onClick={() => nav(1)}>
          ›
        </NavButton>
        <button
          type="button"
          onClick={() => setAnchor(new Date())}
          className="h-11 rounded-lg border border-line px-3 text-[11px] tracking-[0.14em] text-ink-dim transition-colors hover:text-ink md:h-[30px]"
        >
          TODAY
        </button>
        {/* w-full below md takes the whole line, so Week/Month can afford a
            44px target instead of being squeezed in beside the pager */}
        <div className="w-full md:ml-1.5 md:w-auto">
          <SegmentedControl
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        {mode === 'week' && !sandbox && (
          <div className="ml-auto flex items-center gap-2.5">
            {/* desktop's twin of the mobile tab bar's + — the mailbox it presses
                is consumed in WeekGrid, so both branches now serve it */}
            <button
              type="button"
              onClick={() => useManorUi.getState().requestQuickAdd()}
              className="hidden h-8 items-center rounded-lg border border-line px-3.5 font-display text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim transition-colors hover:text-ink md:inline-flex"
            >
              + {voice.manor.quickAddLabel}
            </button>
            {/* an empty week can be rehearsed too: "next week from scratch" is a
                real use case, and the Difference panel starts at 0.0 → 0.0 */}
            <button
              type="button"
              onClick={() => useEventsStore.getState().enterSandbox()}
              className="h-11 rounded-lg border border-dashed px-4 font-display text-[12.5px] font-semibold tracking-[0.2em] transition-colors md:h-8"
              style={{
                borderColor: 'var(--color-accent)',
                color: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              }}
            >
              {voice.manor.whatIf.button}
            </button>
          </div>
        )}
      </div>

      {sandbox ? (
        <div
          className="mt-3.5 flex items-center gap-3 rounded-[10px] border border-dashed px-4 py-2.5 text-[13.5px]"
          style={{
            borderColor: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
          }}
        >
          <span
            className="h-2 w-2 flex-none animate-pulse rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
          {voice.manor.whatIf.banner}
        </div>
      ) : (
        <BriefingStrip
          weekEvents={weekEvents}
          offWeekLabel={
            now >= columns[0].start.getTime() && now < columns[6].end.getTime()
              ? null
              : weekLabel
          }
        />
      )}

      {mode === 'month' ? (
        <MonthView
          anchor={anchor}
          events={activeEvents}
          now={now}
          weekStart={weekStart}
          strain={monthStrain}
          onOpenDay={(day) => {
            setAnchor(day)
            setMode('week')
          }}
        />
      ) : (
        <div className="mt-4 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {/* An empty week keeps its structure: the grid IS the room, and
                the only way to build a week on desktop. The butler's line is
                demoted to a caption rather than replacing the calendar.

                A wholly empty ESTATE is a different claim from an empty week,
                and it is the one place the house has to offer a way in: the
                setup was waved off (or has never run) and there is no lit path
                anywhere. Note the condition is the whole store, not the viewed
                week — paging to a quiet fortnight must not summon a setup
                prompt at someone who is plainly already living here. */}
            {weekEvents.length === 0 && !sandbox && (
              ghost ? (
                <div className="mb-3 flex flex-col items-start gap-2">
                  <p className="text-[13px] text-ink-dim">{voice.onboarding.ghost.line}</p>
                  <button
                    type="button"
                    onClick={() => useOnboarding.getState().begin(entryStage())}
                    className="btn-soft px-4 py-2 text-[11.5px] tracking-[0.14em]"
                  >
                    {voice.onboarding.ghost.cta}
                  </button>
                </div>
              ) : (
                <p className="mb-2 text-[12.5px] text-ink-dim">{voice.manor.empty}</p>
              )
            )}
            <WeekGrid
              columns={columns}
              events={weekEvents}
              now={now}
              strain={weekStrain}
              sandbox={sandbox !== null}
              ghosts={ghosts}
              changedIds={changedIds}
              onJumpTo={setAnchor}
            />
          </div>
          {sandbox && (
            <DiffPanel
              committed={committedWeek}
              draft={weekEvents}
              changeCount={sandbox.changed.length}
            />
          )}
        </div>
      )}

      {/* room for the mobile diff drawer over the grid's last hours */}
      {sandbox && <div className="h-32 md:hidden" />}

      {/* Housekeeping each wing needs done wherever the Manor renders, whether
          or not that wing is ever opened. Renders nothing; it used to ride
          inside the briefing rows, which is a poor home for anything
          load-bearing. */}
      {CONSOLES.map((c) => c.Upkeep && <c.Upkeep key={c.id} />)}

      {/* THE BRIEFING — one written brief in the wings' own colours, four
          instruments the reader can swap, and the shelf of the rest. It reads
          every wing's figures through the same hooks their own panels use. */}
      <TheBriefing />

      {sandbox && (
        <div
          className="fixed bottom-6 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-3.5 rounded-xl border border-dashed px-4 py-2.5 md:flex"
          style={{
            borderColor: 'var(--color-accent)',
            background: 'var(--color-panel-3)',
            boxShadow: '0 12px 40px rgb(0 0 0 / 0.5), 0 0 24px var(--glow-accent)',
          }}
        >
          <span className="font-display text-[13px] font-semibold tracking-[0.22em] text-accent">
            WHAT-IF
          </span>
          <span className="text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
            {voice.manor.whatIf.changes(sandbox.changed.length)}
          </span>
          {/* the counter already said "no changes yet" while this rendered
              live — the state existed, it just wasn't wired to the button */}
          <button
            type="button"
            disabled={sandbox.changed.length === 0}
            onClick={() => {
              useEventsStore.getState().applySandbox()
              butler(voice.manor.whatIf.applied)
            }}
            className="btn-cta px-5 py-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {voice.manor.whatIf.apply}
          </button>
          <button
            type="button"
            onClick={() => {
              useEventsStore.getState().discardSandbox()
              butler(voice.manor.asYouWere)
            }}
            className="rounded-lg border border-line px-3.5 py-2 text-xs text-ink-dim transition-colors hover:text-ink"
          >
            {voice.manor.whatIf.discard}
          </button>
        </div>
      )}

      {/* mobile: THE DIFFERENCE as a drawer docked above the tab bar */}
      {sandbox && (
        <MobileDiffDrawer
          committed={committedWeek}
          draft={weekEvents}
          changeCount={sandbox.changed.length}
          onApply={() => {
            useEventsStore.getState().applySandbox()
            butler(voice.manor.whatIf.applied)
          }}
          onDiscard={() => {
            useEventsStore.getState().discardSandbox()
            butler(voice.manor.asYouWere)
          }}
        />
      )}

      {toast && (
        <div className="menu-panel fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out] md:bottom-6">
          {toast}
        </div>
      )}
    </>
  )
}

/** hours this week, before → after, by wing — shared by panel and drawer */
function DiffRows({ committed, draft }: { committed: CalendarEvent[]; draft: CalendarEvent[] }) {
  const before = hoursByKind(committed)
  const after = hoursByKind(draft)
  const ROWS: EventKind[] = ['shift', 'sleep', 'training', 'study']
  return (
    <div className="flex flex-col gap-2.5">
      {ROWS.map((kind) => {
        const meta = KIND_META[kind]
        const b = before[kind]
        const a = after[kind]
        return (
          <div key={kind} className="flex items-baseline gap-2 border-b border-line pb-2">
            <span
              className="h-[7px] w-[7px] flex-none self-center rounded-full"
              style={{ background: meta.color }}
            />
            <span className="text-[12.5px]">{meta.label}</span>
            <span className="ml-auto text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
              {b.toFixed(1)} →{' '}
              <span style={{ color: a === b ? 'var(--color-ink-dim)' : 'var(--color-accent)' }}>
                {a.toFixed(1)}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** the what-if scoreboard: the desktop side panel */
function DiffPanel({
  committed,
  draft,
  changeCount,
}: {
  committed: CalendarEvent[]
  draft: CalendarEvent[]
  changeCount: number
}) {
  const conflict = useMemo(() => draftConflictLine(draft), [draft])
  return (
    <div
      className="sticky top-4 hidden w-[238px] flex-none rounded-xl border border-dashed p-4 md:block"
      style={{
        borderColor: 'var(--color-accent)',
        background: 'var(--color-panel)',
      }}
    >
      <div className="font-display text-[13px] font-semibold tracking-[0.24em] text-accent">
        {voice.manor.whatIf.panelTitle}
      </div>
      <div className="mt-1 text-[11px] text-ink-dim">{voice.manor.whatIf.panelSub}</div>
      <div className="mt-3">
        <DiffRows committed={committed} draft={draft} />
      </div>
      {/* the same conflict the mobile drawer has always shown: the ▲ was on
          the block but never in the panel where the decision gets made */}
      {conflict && (
        <div
          className="mt-3 flex gap-1.5 text-[11.5px] leading-relaxed"
          style={{ color: 'var(--color-danger)' }}
        >
          <span aria-hidden className="flex-none">
            ▲
          </span>
          <span>{conflict}</span>
        </div>
      )}
      <div className="mt-3 text-xs italic text-ink-dim">
        {changeCount === 0 ? voice.manor.whatIf.noteClean : voice.manor.whatIf.noteDirty}
      </div>
    </div>
  )
}

/** the what-if scoreboard on mobile: a drawer docked above the tab bar —
 *  APPLY under the thumb, swipe-up (tap) for the full before → after */
function MobileDiffDrawer({
  committed,
  draft,
  changeCount,
  onApply,
  onDiscard,
}: {
  committed: CalendarEvent[]
  draft: CalendarEvent[]
  changeCount: number
  onApply: () => void
  onDiscard: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const conflict = useMemo(() => draftConflictLine(draft), [draft])
  return (
    <div
      className="fixed inset-x-0 z-30 md:hidden"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
    >
      <div
        className="mx-auto max-w-[560px] rounded-t-[18px] border border-b-0 border-dashed px-4 pb-3 pt-1.5"
        style={{
          borderColor: 'var(--color-accent)',
          background: 'var(--color-panel-3)',
          boxShadow: '0 -14px 40px rgb(0 0 0 / 0.45)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          className="group flex w-full flex-col items-center gap-1 pb-2"
        >
          <span
            className="h-1 w-9 rounded-full"
            style={{ background: 'color-mix(in srgb, var(--color-ink) 25%, transparent)' }}
          />
          <span className="flex w-full items-center gap-2">
            <span className="font-display text-[12px] font-semibold tracking-[0.22em] text-accent">
              {voice.manor.whatIf.panelTitle}
            </span>
            <span className="ml-auto text-[10.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
              {voice.manor.whatIf.changes(changeCount)}
            </span>
            {/* the panel is pinned to the bottom, so its detail opens UPWARD —
                the closed chevron has to point that way or it promises the
                opposite of what it does */}
            <CollapseChevron expanded={expanded} upward />
          </span>
        </button>
        <Collapsible open={expanded} innerClassName="pb-2.5">
          <div className="text-[10.5px] text-ink-dim">{voice.manor.whatIf.panelSub}</div>
          <div className="mt-2">
            <DiffRows committed={committed} draft={draft} />
          </div>
          {conflict && (
            <div className="mt-2 text-[10.5px] italic" style={{ color: 'var(--color-danger)' }}>
              ▲ {conflict}
            </div>
          )}
        </Collapsible>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={changeCount === 0}
            onClick={onApply}
            className="btn-cta h-11 flex-[1.4] font-display text-[13px] font-semibold tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {voice.manor.whatIf.apply}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="h-11 flex-1 rounded-lg border border-line text-xs text-ink-dim transition-colors hover:text-ink"
          >
            {voice.manor.whatIf.discard}
          </button>
        </div>
      </div>
    </div>
  )
}

function NavButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-11 w-11 rounded-lg border border-line bg-panel text-[15px] leading-none text-ink-dim transition-colors hover:text-ink md:h-[30px] md:w-[30px]"
    >
      {children}
    </button>
  )
}
