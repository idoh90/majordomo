import { useEffect, useRef, useState } from 'react'
import { addDays, localDayKey, startOfWeek } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { hoursOf } from '../../core/events/lib'
import { useNavStore } from '../../core/store/nav'
import { useShellStore } from '../../core/store/shell'
import { useNow } from '../../core/useNow'
import { voice } from '../../core/voice'
import {
  SHIFT_PRESETS,
  atHour,
  countdownLabel,
  hasShiftOnDay,
  rangeFree,
  watchStats,
  type ShiftKey,
} from './lib'

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** The Watch — post shifts, see the duty ring, count down to the next one. */
export function WatchScreen() {
  const events = useEventsStore((s) => s.events)
  const addEvent = useEventsStore((s) => s.addEvent)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()
  const stats = watchStats(events, now, weekStart)

  const [pickedDay, setPickedDay] = useState<number | null>(null)
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

  // the roster strip: this calendar week + the next
  const strip0 = startOfWeek(new Date(now), weekStart)
  const stripDays = Array.from({ length: 14 }, (_, i) => addDays(strip0, i))

  const post = (key: ShiftKey) => {
    if (pickedDay === null) return
    const day = stripDays[pickedDay]
    if (hasShiftOnDay(events, day)) {
      butler(voice.watch.duplicate)
      setPickedDay(null)
      return
    }
    const preset = SHIFT_PRESETS[key]
    addEvent({
      source: 'watch',
      kind: 'shift',
      title: key === 'day' ? `${voice.watch.dayShift} Watch` : `${voice.watch.nightShift} Watch`,
      start: atHour(day, preset.startHour).toISOString(),
      end: atHour(day, preset.endHour).toISOString(),
    })
    // sleep after nights is first-class: pencil the recovery block when free
    let pencilled = false
    if (key === 'night') {
      const sleepStart = atHour(addDays(day, 1), 9)
      const sleepEnd = atHour(addDays(day, 1), 15)
      if (rangeFree(events, sleepStart, sleepEnd)) {
        addEvent({
          source: 'watch',
          kind: 'sleep',
          title: 'Sleep',
          start: sleepStart.toISOString(),
          end: sleepEnd.toISOString(),
        })
        pencilled = true
      }
    }
    butler(pencilled ? voice.watch.postedWithSleep : voice.watch.posted)
    setPickedDay(null)
  }

  const ringC = 2 * Math.PI * 72
  const ringFrac = stats.expectedH > 0 ? Math.min(1, stats.doneH / stats.expectedH) : 0

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* ---------------------------------------------------- left rail */}
      <div className="flex flex-col gap-4">
        <div className="panel p-5 text-center">
          <div className="card-title justify-center">{voice.watch.onDuty}</div>
          <div className="relative mx-auto mt-4 h-[176px] w-[176px]">
            <svg width="176" height="176" viewBox="0 0 176 176" aria-hidden>
              <circle cx="88" cy="88" r="72" fill="none" stroke="var(--color-panel-2)" strokeWidth="10" />
              <circle
                cx="88"
                cy="88"
                r="72"
                fill="none"
                stroke="var(--color-w-watch)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${ringC * ringFrac} ${ringC}`}
                transform="rotate(-90 88 88)"
                style={{ filter: 'drop-shadow(0 0 6px var(--glow-accent))' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="stat-num font-display text-[34px] leading-none">
                {stats.doneH.toFixed(1)}
              </div>
              <div className="text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                of {stats.expectedH.toFixed(1)} h expected
              </div>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <div className="card-title">{voice.watch.nextWatch}</div>
          <div className="stat-num mt-2 font-display text-[30px] leading-none">
            {stats.next ? countdownLabel(stats.next, now) : '—'}
          </div>
          <div className="mt-1.5 text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {stats.next
              ? `${WD[new Date(stats.next.start).getDay()]} ${hhmm(new Date(stats.next.start))} → ${WD[new Date(stats.next.end).getDay()]} ${hhmm(new Date(stats.next.end))}`
              : voice.watch.noneAhead}
          </div>
        </div>

        <div className="rounded-[14px] border border-dashed border-line px-4 py-3.5 text-xs italic text-ink-dim">
          {voice.watch.note}
          <button
            type="button"
            onClick={() => useNavStore.getState().requestView('manor')}
            className="mt-2 block text-xs not-italic text-accent hover:underline"
          >
            {voice.watch.openManor}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- right rail */}
      <div className="flex flex-col gap-4">
        <div className="panel p-5">
          <div className="card-title">{voice.watch.post}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stripDays.map((day, i) => {
              const picked = pickedDay === i
              const has = hasShiftOnDay(events, day)
              const isToday = localDayKey(day) === localDayKey(new Date(now))
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPickedDay(picked ? null : i)}
                  className="w-[58px] rounded-[9px] border pb-1.5 pt-2 text-center transition-colors hover:border-accent"
                  style={{
                    borderColor: picked ? 'var(--color-accent)' : 'var(--color-line)',
                    background: picked
                      ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                      : 'var(--color-panel-2)',
                  }}
                >
                  <span
                    className="block text-[9px] tracking-[0.16em]"
                    style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-ink-dim)' }}
                  >
                    {WD[day.getDay()]}
                  </span>
                  <span className="block font-display text-base font-semibold [font-variant-numeric:tabular-nums]">
                    {day.getDate()}
                  </span>
                  <span className="block h-[5px]">
                    {has && (
                      <span
                        className="inline-block h-[5px] w-[5px] rounded-full"
                        style={{ background: 'var(--color-w-watch)' }}
                      />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {pickedDay !== null && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5 animate-[fade-in_160ms_ease-out]">
              <span className="text-[12.5px] text-ink-dim">
                {WD[stripDays[pickedDay].getDay()]} {stripDays[pickedDay].getDate()} —
              </span>
              <button
                type="button"
                onClick={() => post('day')}
                className="card px-4 py-2.5 text-[12.5px] [font-variant-numeric:tabular-nums] transition-colors hover:border-accent"
              >
                <b>{voice.watch.dayShift}</b> · 07:00 → 20:00
              </button>
              <button
                type="button"
                onClick={() => post('night')}
                className="card px-4 py-2.5 text-[12.5px] [font-variant-numeric:tabular-nums] transition-colors hover:border-accent"
              >
                <b>{voice.watch.nightShift}</b> · 19:00 → 08:00
              </button>
              <button
                type="button"
                onClick={() => setPickedDay(null)}
                className="text-xs text-ink-dim transition-colors hover:text-ink"
              >
                cancel
              </button>
            </div>
          )}
        </div>

        <div className="panel p-5">
          <div className="card-title">{voice.watch.weekList}</div>
          <div className="mt-2 flex flex-col">
            {stats.weekShifts.length === 0 && (
              <div className="py-2 text-sm text-ink-dim">{voice.watch.noneAhead}</div>
            )}
            {stats.weekShifts.map((e) => {
              const s = new Date(e.start)
              const en = new Date(e.end)
              const done = en.getTime() <= now
              const isNext = stats.next?.id === e.id
              const st = done
                ? voice.watch.status.logged
                : isNext
                  ? voice.watch.status.next
                  : voice.watch.status.ahead
              const stColor = done
                ? 'var(--color-positive)'
                : isNext
                  ? 'var(--color-accent)'
                  : 'var(--color-ink-dim)'
              return (
                <div
                  key={e.id}
                  className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="w-16 text-[12.5px] font-semibold [font-variant-numeric:tabular-nums]">
                    {WD[s.getDay()]} {s.getDate()}
                  </span>
                  <span className="text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                    {hhmm(s)} → {hhmm(en)}
                  </span>
                  <span className="ml-auto font-display text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
                    {hoursOf(e).toFixed(1)} h
                  </span>
                  <span
                    className="w-16 text-right text-[10px] tracking-[0.14em]"
                    style={{ color: stColor }}
                  >
                    {st}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {toast && (
        <div className="menu-panel fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out]">
          {toast}
        </div>
      )}
    </div>
  )
}
