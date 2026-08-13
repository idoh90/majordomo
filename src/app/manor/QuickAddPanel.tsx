import { useMemo, useState } from 'react'
import { seamStart, type ColumnWindow } from '../../core/events/lib'
import { addDays, localDayKey, startOfLocalDay } from '../../core/dates'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { useWorkshopStore } from '../../modules/workshop/store'
import { BenchForm, CustomEventForm, Stepper, type QuickAddPick } from './fields'
import { KIND_META, hhmm } from './kinds'

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const HOUR_MS = 3_600_000

/** whole local days from `from` to `to`. Rounded, not truncated: a DST week
 *  is 23 or 25 hours long, and integer division would lose a day at the edge. */
const dayDiff = (from: Date, to: Date) =>
  Math.round(
    (startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / (24 * HOUR_MS),
  )

/**
 * QUICK ADD, asked rather than guessed.
 *
 * The nav-row button (and the mobile bar's +) used to hunt for the next free
 * half-hour on some column and drop the template menu there — so pressing it
 * booked an hour at a time nobody had chosen, and the only way to see WHERE
 * it had landed was to find the block afterwards. This panel asks first: the
 * day, the hour, then the activity. The slot the house would have picked is
 * still the starting position, so the fast path costs one extra glance, not
 * an extra decision.
 *
 * The day is a DATE, not a column: the seven chips are the fast path for the
 * week in front of you, the date field reaches any day of any week, and the
 * chips follow whatever the field lands on. Booking outside the week on screen
 * is the point of the field, so the calendar goes there afterwards rather than
 * leaving the new block somewhere the reader has to go hunting for.
 *
 * The in-grid popover is untouched: a click on a column already said where.
 */
export function QuickAddPanel({
  columns,
  initialCol,
  initialTs,
  now,
  rangeFree,
  onBook,
  onClose,
}: {
  /** the week on screen: the chip strip's origin, and the test for "did we
   *  leave it?" — never a limit on what can be booked */
  columns: ColumnWindow[]
  /** the day the panel opens on, as a column of that week */
  initialCol: number
  /** hours from that day's seam, snapped to the 0.5 h grid */
  initialTs: number
  now: number
  /** would a block of `hours` starting at `start` clear every other block in
   *  the WHOLE estate? (the grid only holds one week; this panel does not) */
  rangeFree: (start: Date, hours: number) => boolean
  onBook: (start: Date, pick: QuickAddPick) => void
  onClose: () => void
}) {
  // seeded once per opening: the parent mounts this panel on the press and
  // unmounts it on the close, so there is no stale draft to re-seed
  const [day, setDay] = useState(() => startOfLocalDay(columns[initialCol].day))
  const [ts, setTs] = useState(initialTs)
  const [screen, setScreen] = useState<'templates' | 'custom' | 'bench'>('templates')

  // the shelf, minus what is finished — see MobileQuickAddSheet for why this
  // is filtered in a memo and never in the selector
  const allVentures = useWorkshopStore((s) => s.ventures)
  const ventures = useMemo(
    () => allVentures.filter((v) => !v.archived && v.status !== 'shipped'),
    [allVentures],
  )

  // The strip is DERIVED from the chosen day, never stored: pick 4 September
  // in the date field and the seven chips are that week, with the 4th lit. One
  // source of truth for "which day", so the two controls cannot disagree.
  const delta = dayDiff(columns[0].day, day)
  const weekOffset = Math.floor(delta / 7)
  const picked = delta - weekOffset * 7
  const stripDays = columns.map((c) => addDays(c.day, weekOffset * 7))
  const onScreen = weekOffset === 0

  const when = new Date(seamStart(day).getTime() + ts * HOUR_MS)
  // every fit check reads the CHOSEN instant, so moving the day or the hour
  // re-dims the templates under your hand instead of after the tap
  const fits = (hours: number) => rangeFree(when, hours)
  const free = fits(0.5)

  return (
    <Sheet open onClose={onClose}>
      <div className="pb-1">
        <div className="flex items-baseline gap-2.5 pt-1">
          <span className="font-display text-xs font-semibold tracking-[0.24em] text-ink-dim">
            {voice.manor.quickAddTitle}
          </span>
          <span className="text-[13px] font-bold [font-variant-numeric:tabular-nums]">
            {WD[when.getDay()]} {when.getDate()} {MO[when.getMonth()]} · {hhmm(when)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1 text-[14px] text-ink-dim transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* ------------------------------------------------------ where */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] tracking-[0.2em] text-ink-dim">
            {voice.manor.quickAdd.dayLabel}
          </span>
          {/* the native control on purpose: it is the one date picker that is
              already a calendar on a desktop and an OS wheel on a phone, and
              it costs nothing to carry */}
          <input
            type="date"
            aria-label={voice.manor.quickAdd.dateLabel}
            value={localDayKey(day)}
            onChange={(ev) => {
              const [y, m, d] = ev.target.value.split('-').map(Number)
              if (!y || !m || !d) return
              setDay(new Date(y, m - 1, d))
            }}
            className="card ml-auto h-8 px-2.5 text-[12px] [font-variant-numeric:tabular-nums] outline-none focus:border-accent"
          />
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {stripDays.map((d, i) => {
            const on = i === picked
            const isToday = onScreen && now >= columns[i].start.getTime() && now < columns[i].end.getTime()
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                onClick={() => setDay(startOfLocalDay(d))}
                className="chip flex h-11 flex-col items-center justify-center gap-0.5 px-0 text-[9.5px] tracking-[0.08em] transition-colors"
                style={{
                  borderColor: on ? 'var(--color-accent)' : 'var(--color-line)',
                  background: on
                    ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                    : 'transparent',
                  color: on || isToday ? 'var(--color-ink)' : 'var(--color-ink-dim)',
                }}
              >
                <span>{WD[d.getDay()]}</span>
                <span className="text-[12px] font-semibold [font-variant-numeric:tabular-nums]">
                  {d.getDate()}
                </span>
              </button>
            )
          })}
        </div>
        {!onScreen && (
          <div className="mt-1.5 text-[11px] italic text-ink-dim">
            {voice.manor.quickAdd.otherWeek}
          </div>
        )}
        <Stepper
          label={voice.manor.eventSheet.startLabel}
          value={hhmm(when)}
          // clamped to the day exactly as a drag is: the START is the only
          // thing pinned to it — a block that runs past midnight simply
          // crosses the seam, and the grid splits it there
          onDec={() => setTs((t) => Math.max(0, t - 0.5))}
          onInc={() => setTs((t) => Math.min(23.5, t + 0.5))}
        />

        {/* ------------------------------------------------------- what */}
        <div className="mt-4 text-[10px] tracking-[0.2em] text-ink-dim">
          {voice.manor.quickAdd.whatLabel}
        </div>
        {screen === 'custom' ? (
          <CustomEventForm
            fits={fits}
            onBook={(pick) => onBook(when, pick)}
            onBack={() => setScreen('templates')}
          />
        ) : screen === 'bench' ? (
          <BenchForm
            ventures={ventures}
            fits={fits}
            onBook={(pick) => onBook(when, pick)}
            onBack={() => setScreen('templates')}
          />
        ) : (
          <>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {voice.manor.templates.map((tpl) => {
                const meta = KIND_META[tpl.kind]
                // fit-checked against ITS OWN hours, so a 13 h watch offered on
                // a busy evening cannot be tapped and then bounce as occupied
                const room = fits(tpl.hours)
                return (
                  <button
                    key={tpl.title}
                    type="button"
                    disabled={!room}
                    title={room ? undefined : voice.manor.custom.wontFit}
                    onClick={() => onBook(when, tpl)}
                    className="card flex h-[46px] w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span
                      className="h-2 w-2 flex-none rounded-full"
                      style={{ background: meta.color }}
                    />
                    {tpl.title}
                    <span className="ml-auto text-[11px] font-normal text-ink-dim [font-variant-numeric:tabular-nums]">
                      {room ? `${tpl.hours.toFixed(1)} h` : voice.manor.custom.wontFit}
                    </span>
                  </button>
                )
              })}
              {ventures.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScreen('bench')}
                  className="card flex h-[46px] w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-semibold transition-colors"
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: 'var(--color-w-workshop)' }}
                  />
                  {voice.manor.bench.row}
                </button>
              )}
              <button
                type="button"
                onClick={() => setScreen('custom')}
                className="card flex h-[46px] w-full items-center gap-2.5 border-dashed px-3.5 text-left text-[13px] font-semibold text-ink-dim transition-colors"
              >
                {voice.manor.custom.row}
              </button>
            </div>
            <div
              className="mt-2.5 text-[11px] italic"
              style={{ color: free ? 'var(--color-ink-dim)' : 'var(--color-danger)' }}
            >
              {free ? voice.manor.slotClear : voice.manor.occupied}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
