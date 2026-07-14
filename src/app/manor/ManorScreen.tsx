import { useMemo, useState } from 'react'
import { useShellStore } from '../../core/store/shell'
import { useNow } from '../../core/useNow'
import { useEventsStore } from '../../core/events/store'
import { eventsInRange, weekColumns } from '../../core/events/lib'
import { addDays } from '../../core/dates'
import { SegmentedControl } from '../../core/ui/SegmentedControl'
import { voice } from '../../core/voice'
import { CONSOLES } from '../consoles'
import { BriefingStrip } from './BriefingStrip'
import { MonthView, monthLabel } from './MonthView'
import { WeekGrid } from './WeekGrid'

const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** The Manor — home: the duty-cycle week (or month) over the events store. */
export function ManorScreen() {
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()
  const events = useEventsStore((s) => s.events)
  // DEV: ?manor=month opens the month view (screenshot aid)
  const [mode, setMode] = useState<'week' | 'month'>(() =>
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('manor') === 'month'
      ? 'month'
      : 'week',
  )
  const [anchor, setAnchor] = useState(() => new Date())

  const columns = useMemo(() => weekColumns(anchor, weekStart), [anchor, weekStart])
  const weekEvents = useMemo(
    () => eventsInRange(events, columns[0].start, columns[6].end),
    [events, columns],
  )

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
          className="h-[30px] rounded-lg border border-line px-3 text-[11px] tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
        >
          TODAY
        </button>
        <SegmentedControl
          className="ml-1.5"
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      <BriefingStrip weekEvents={weekEvents} />

      {mode === 'month' ? (
        <MonthView
          anchor={anchor}
          events={events}
          now={now}
          weekStart={weekStart}
          onOpenDay={(day) => {
            setAnchor(day)
            setMode('week')
          }}
        />
      ) : weekEvents.length === 0 ? (
        <EmptyWeek />
      ) : (
        <div className="mt-4">
          <WeekGrid columns={columns} events={weekEvents} now={now} />
        </div>
      )}

      {/* daily briefing — every wing contributes its own lines (this panel
          gets absorbed into the briefing strip as the wings come online) */}
      {CONSOLES.map((c) => c.Briefing && <c.Briefing key={c.id} />)}
    </>
  )
}

function EmptyWeek() {
  return (
    <div className="mt-4 rounded-[14px] border border-dashed border-line px-6 py-20 text-center"
      style={{ background: 'color-mix(in srgb, var(--color-panel) 50%, transparent)' }}
    >
      <div className="font-display text-[13px] font-semibold uppercase tracking-[0.32em] text-ink-dim">
        {voice.manor.name}
      </div>
      <p className="mt-3 text-[16.5px] text-ink">{voice.manor.empty}</p>
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
      className="h-[30px] w-[30px] rounded-lg border border-line bg-panel text-[15px] leading-none text-ink-dim transition-colors hover:text-ink"
    >
      {children}
    </button>
  )
}
