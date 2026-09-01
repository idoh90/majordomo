import { useEffect, useMemo, useState } from 'react'
import { addDays, localDayKey, startOfLocalDay } from '../../../core/dates'
import { useEventsStore } from '../../../core/events/store'
import { fmtHM, nightlySeries, nightOf, sleepStats } from '../../../core/sleep/lib'
import { useSleepStore } from '../../../core/sleep/store'
import { useSleepStats } from '../../../core/sleep/useSleep'
import { useNow } from '../../../core/useNow'
import { ConfirmDialog } from '../../../core/ui/ConfirmDialog'
import { Sheet } from '../../../core/ui/Sheet'
import { voice } from '../../../core/voice'
import { track } from '../../../core/telemetry'
import { NightLedger } from './NightLedger'
import { nightClashes, nightWindow, removeNight, writeNight } from './write'

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const STEP = 15

/** the shape a fresh estate is offered before it has habits of its own */
const FALLBACK = { bedHHMM: 23 * 60 + 30, wakeHHMM: 7 * 60 + 30 }

const hhmm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const parseHHMM = (v: string): number | null => {
  const [h, m] = v.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

const wrap = (min: number): number => ((min % 1440) + 1440) % 1440

/**
 * THE NIGHT — writing one down.
 *
 * Two clock times and a morning. Everything else on this sheet is optional and
 * says so, because the system's entire claim is that two clock times is enough
 * to be worth doing; a form that demanded a rating would be a form nobody
 * fills in at seven in the morning.
 *
 * The morning is the unit, not the evening: the pager walks mornings, the
 * bedtime's DATE is derived from the two clocks (see write.ts), and there is
 * therefore no way to type a night of negative or twenty-six hours.
 */
export function NightSheet({
  open,
  initialDay,
  onClose,
}: {
  open: boolean
  /** the morning to open on */
  initialDay: Date
  onClose: () => void
}) {
  const now = useNow()
  const events = useEventsStore((s) => s.events)
  const notes = useSleepStore((s) => s.notes)
  const stats = useSleepStats()
  const V = voice.night

  const today = startOfLocalDay(new Date(now))
  const [morning, setMorning] = useState(() => startOfLocalDay(initialDay))
  const [bedHHMM, setBed] = useState(FALLBACK.bedHHMM)
  const [wakeHHMM, setWake] = useState(FALLBACK.wakeHHMM)
  const [rest, setRest] = useState<number | null>(null)
  const [awakeMin, setAwake] = useState(0)
  const [touched, setTouched] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const existing = useMemo(
    () => nightOf(events, notes, morning),
    [events, notes, morning],
  )
  const morningKey = localDayKey(morning)

  // seed the form whenever the sheet opens or the morning moves. Deliberately
  // NOT keyed on `existing`: it is derived from the events store, so keying on
  // it would reset the form under the reader's hand the instant they saved.
  useEffect(() => {
    if (!open) return
    const ev = useEventsStore.getState().events
    const nt = useSleepStore.getState().notes
    const row = nightOf(ev, nt, morning)
    if (row) {
      setBed(row.bed.getHours() * 60 + row.bed.getMinutes())
      setWake(row.wake.getHours() * 60 + row.wake.getMinutes())
      setRest(row.rest === null ? null : Math.round(row.rest))
      setAwake(useSleepStore.getState().notes[row.eventId]?.awakeMin ?? 0)
    } else {
      // the shape you usually keep, so the fast path is one press. Falls back
      // to a plain night rather than to nothing: an empty pair of clocks is a
      // form, and the offer here is meant to be an answer.
      const usual = sleepStats(ev, nt, Date.now(), useSleepStore.getState().targetH).usual
      setBed(usual ? wrap(usual.bedMin) : FALLBACK.bedHHMM)
      setWake(usual ? wrap(usual.wakeMin) : FALLBACK.wakeHHMM)
      setRest(null)
      setAwake(0)
    }
    setTouched(false)
    // Deps are `open` and the morning ALONE, on purpose, and this project's
    // ESLint carries import-boundary rules only — so nothing warns about it
    // and the reasoning has to live here. Everything the seed reads is pulled
    // through getState() rather than closed over, precisely so it CANNOT
    // re-run: the median shape moving as the reader edits, or the store write
    // from the save they just pressed, would reset the form under their hands.
  }, [open, morningKey])

  const points = useMemo(
    () => nightlySeries(events, notes, now, stats.windowNights),
    [events, notes, now, stats.windowNights],
  )

  const win = nightWindow(morning, bedHHMM, wakeHHMM)
  const hours = (win.end.getTime() - win.start.getTime()) / 3_600_000
  const netHours = Math.max(0, hours - awakeMin / 60)
  const crosses = win.start.getDate() !== win.end.getDate()
  const clashes = nightClashes(events, win.start, win.end, existing?.eventId)
  const tooLong = hours > 18
  /* Two identical clocks are not a night, they are an unfinished thought.
     The bedtime's DAY is derived from the pair (write.ts), so equal times
     resolve to "the day before" and produce a twenty-four-hour night — which
     is saveable in one press and occupies the whole day on the week. Refuse
     it and say why, rather than writing down a nonsense record because the
     arithmetic happened to have an answer. */
  const impossible = bedHHMM === wakeHHMM

  const bump = (set: (f: (v: number) => number) => void, delta: number) => {
    set((v) => wrap(v + delta))
    setTouched(true)
  }

  const dirty = existing
    ? bedHHMM !== existing.bed.getHours() * 60 + existing.bed.getMinutes() ||
      wakeHHMM !== existing.wake.getHours() * 60 + existing.wake.getMinutes() ||
      rest !== (existing.rest === null ? null : Math.round(existing.rest)) ||
      awakeMin !== (notes[existing.eventId]?.awakeMin ?? 0)
    : // a prefilled form nobody has touched holds no work to lose, so the
      // discard guard waits for the first edit — Sheet's `dirty` means "there
      // is something here worth keeping", and an untouched suggestion is not
      touched

  const save = () => {
    if (impossible) return
    writeNight({ morning, bedHHMM, wakeHHMM, rest, awakeMin, existing })
    // a submit handler, never a store action: the heal passes and the demo
    // fixtures drive the same store and must not read as somebody sleeping
    track('sleep_logged')
    onClose()
  }

  const canGoLater = morning.getTime() < today.getTime()
  const title = existing
    ? existing.pencilled
      ? V.sheet.confirmTitle
      : V.sheet.editTitle
    : V.sheet.logTitle

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <div className="pb-1">
        <div className="flex items-baseline gap-2.5 pt-1">
          <span
            className="font-display text-xs font-semibold tracking-[0.24em]"
            style={{ color: 'var(--color-w-sleep)' }}
          >
            {V.name}
          </span>
          <span className="text-[11px] tracking-[0.14em] text-ink-dim">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={voice.settings.close}
            className="ml-auto p-1 text-[14px] text-ink-dim transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* ------------------------------------------------------- which */}
        <div className="mt-3">
          <span className="text-[10px] tracking-[0.2em] text-ink-dim">
            {V.sheet.whichLabel}
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              aria-label={V.sheet.prev}
              onClick={() => setMorning((d) => addDays(d, -1))}
              className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
            >
              ‹
            </button>
            <div className="card flex h-11 flex-1 items-center justify-center gap-2 text-[13.5px] font-semibold [font-variant-numeric:tabular-nums]">
              {WD[morning.getDay()]} {morning.getDate()} {MO[morning.getMonth()]}
              {morningKey === localDayKey(today) && (
                <span className="text-[10px] font-normal tracking-[0.14em] text-ink-faint">
                  {V.sheet.thisMorning}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={V.sheet.next}
              disabled={!canGoLater}
              onClick={() => setMorning((d) => addDays(d, 1))}
              className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------- clocks */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <ClockField
            label={V.sheet.bedLabel}
            value={bedHHMM}
            tag={crosses ? V.sheet.dayBefore : null}
            onChange={(v) => {
              setBed(v)
              setTouched(true)
            }}
            onBump={(d) => bump(setBed, d)}
          />
          <ClockField
            label={V.sheet.wakeLabel}
            value={wakeHHMM}
            tag={null}
            onChange={(v) => {
              setWake(v)
              setTouched(true)
            }}
            onBump={(d) => bump(setWake, d)}
          />
        </div>

        {/* The two clocks above are NATIVE time inputs, which is the right
            control (an OS wheel on a phone, a typable field on a desktop) and
            the one thing about them we do not get to choose: they render in
            the browser's own locale, so a 23:45 bedtime reads "11:45 PM" for
            most people while every other hour in this app is 24-hour. Rather
            than rebuild the picker, the summary restates the pair in the
            house's own format — which is also the confirmation line a form
            about two times ought to have had anyway. */}
        <div className="mt-2.5 flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-1 rounded-[10px] border border-line px-3 py-2">
          <span className="text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {hhmm(bedHHMM)} → {hhmm(wakeHHMM)}
          </span>
          <span className="stat-num text-[19px] leading-none text-ink">
            {impossible ? '—' : fmtHM(netHours)}
          </span>
          {!impossible && (
            <span className="text-[11px] text-ink-dim">
              {V.sheet.slept({ crossesMidnight: crosses, inBedH: hours, awakeMin })}
            </span>
          )}
        </div>
        {impossible ? (
          <div className="mt-1.5 text-[11px] italic" style={{ color: 'var(--color-danger)' }}>
            {V.sheet.impossible}
          </div>
        ) : (
          tooLong && (
            <div className="mt-1.5 text-[11px] italic text-ink-dim">{V.sheet.tooLong}</div>
          )
        )}
        {clashes && (
          <div className="mt-1.5 text-[11px] italic text-ink-dim">{V.sheet.occupied}</div>
        )}
        {existing?.pencilled && (
          <div className="mt-1.5 text-[11px] italic" style={{ color: 'var(--color-w-sleep)' }}>
            {V.sheet.pencilNote}
          </div>
        )}

        {/* --------------------------------------------------------- rest */}
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] tracking-[0.2em] text-ink-dim">{V.sheet.restLabel}</span>
            <span className="text-[10px] italic text-ink-faint">{V.sheet.restNote}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {V.sheet.restWords.map((wtext, i) => {
              const val = i + 1
              const on = rest === val
              return (
                <button
                  key={wtext}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setRest(on ? null : val)
                    setTouched(true)
                  }}
                  className="chip min-h-9 px-2.5 py-1 text-[10.5px] tracking-[0.08em] transition-colors"
                  style={{
                    borderColor: on ? 'var(--color-w-sleep)' : 'var(--color-line)',
                    background: on
                      ? 'color-mix(in srgb, var(--color-w-sleep) 14%, transparent)'
                      : 'transparent',
                    color: on ? 'var(--color-ink)' : 'var(--color-ink-dim)',
                  }}
                >
                  {wtext}
                </button>
              )
            })}
          </div>
        </div>

        {/* -------------------------------------------------------- awake */}
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] tracking-[0.2em] text-ink-dim">{V.sheet.awakeLabel}</span>
            <span className="text-[10px] italic text-ink-faint">{V.sheet.awakeNote}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              aria-label={`${V.sheet.awakeLabel} down`}
              onClick={() => {
                setAwake((m) => Math.max(0, m - 5))
                setTouched(true)
              }}
              className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
            >
              −
            </button>
            <div className="card flex h-11 flex-1 items-center justify-center text-[13.5px] font-semibold [font-variant-numeric:tabular-nums]">
              {awakeMin === 0 ? '—' : `${awakeMin} m`}
            </div>
            <button
              type="button"
              aria-label={`${V.sheet.awakeLabel} up`}
              onClick={() => {
                setAwake((m) => Math.min(600, m + 5))
                setTouched(true)
              }}
              className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
            >
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={impossible}
          className="btn-cta mt-4 h-12 w-full font-display text-[13.5px] font-semibold tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: 'var(--color-w-sleep)',
            color: 'var(--color-bg)',
            boxShadow: 'none',
          }}
        >
          {existing?.pencilled ? V.sheet.confirm : V.sheet.save}
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="mt-2 w-full py-2 text-[11.5px] text-ink-faint transition-colors hover:text-danger"
          >
            {V.sheet.remove}
          </button>
        )}

        <NightLedger points={points} stats={stats} activeKey={morningKey} />
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title={V.sheet.removeConfirm.title}
        message={V.sheet.removeConfirm.body}
        confirmLabel={V.sheet.removeConfirm.confirm}
        onConfirm={() => {
          if (existing) removeNight(existing)
          setConfirmRemove(false)
          onClose()
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </Sheet>
  )
}

/** a clock, native where the platform has one, with 15-minute nudges beside it */
function ClockField({
  label,
  value,
  tag,
  onChange,
  onBump,
}: {
  label: string
  value: number
  /** "the day before", when this clock lands on yesterday */
  tag: string | null
  onChange: (min: number) => void
  onBump: (delta: number) => void
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] tracking-[0.2em] text-ink-dim">{label}</span>
        {tag && (
          <span className="text-[9px] tracking-[0.1em] text-ink-faint">{tag}</span>
        )}
      </div>
      {/* the native control on purpose, exactly as quick-add's date field is:
          it is already a clock face on a phone and a typable field on a
          desktop, and it costs nothing to carry */}
      <input
        type="time"
        aria-label={label}
        value={hhmm(value)}
        onChange={(ev) => {
          const min = parseHHMM(ev.target.value)
          if (min !== null) onChange(min)
        }}
        className="card mt-1.5 h-11 w-full px-2.5 text-center text-[15px] font-semibold [font-variant-numeric:tabular-nums] outline-none focus:border-accent"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          aria-label={`${label} down`}
          onClick={() => onBump(-STEP)}
          className="card h-9 flex-1 text-[14px] leading-none transition-colors hover:border-accent"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`${label} up`}
          onClick={() => onBump(STEP)}
          className="card h-9 flex-1 text-[14px] leading-none transition-colors hover:border-accent"
        >
          +
        </button>
      </div>
    </div>
  )
}
