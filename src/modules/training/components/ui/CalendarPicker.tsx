import { useMemo, useState } from 'react'
import type { Workout } from '../../types'
import { localDayKey } from '../../../../core/dates'

interface CalendarPickerProps {
  /** ISO datetime of the currently chosen moment */
  value: string
  onChange: (iso: string) => void
  /** existing workouts — days that have any get amber dots */
  workouts: Workout[]
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * Dark in-app month calendar (Monday-start). Days with logged workouts show
 * up to three amber dots. A time row below the grid fine-tunes the moment.
 *
 * ONE RULE FOR DAYS AND TIMES: a workout cannot have happened in the future.
 * Future days are disabled, today's time input is capped at the current
 * minute, and anything that would still land ahead of now — a 23:59 pick at
 * 13:00, or yesterday-at-23:59 carried onto today by a day tap — clamps to
 * now. Otherwise a workout logged for tonight would count toward this week
 * and claim a block that has not happened yet.
 */
export function CalendarPicker({ value, onChange, workouts }: CalendarPickerProps) {
  const selected = new Date(value)
  const [viewYear, setViewYear] = useState(() => selected.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => selected.getMonth())
  const today = new Date()
  const todayKey = localDayKey(today)
  const selectedKey = localDayKey(selected)

  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of workouts) {
      const k = localDayKey(w.performedAt)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [workouts])

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7 // Monday start
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const atCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  /** never ahead of the present — resolved at interaction time, not render */
  const emit = (d: Date) => {
    const nowMs = Date.now()
    onChange(new Date(Math.min(d.getTime(), nowMs)).toISOString())
  }

  const pickDay = (day: number) => {
    emit(new Date(viewYear, viewMonth, day, selected.getHours(), selected.getMinutes()))
  }

  const setTime = (hhmm: string) => {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(selected)
    d.setHours(h, m, 0, 0)
    emit(d)
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => moveMonth(-1)}
          className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-3 hover:text-ink"
        >
          <Chevron dir="left" />
        </button>
        <span className="font-display text-sm font-bold uppercase tracking-[0.14em]">
          {monthTitle}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => moveMonth(1)}
          disabled={atCurrentMonth}
          className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-3 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="pb-1 font-display text-[10px] font-bold uppercase tracking-widest text-ink-faint"
          >
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`b-${i}`} />
          const key = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
          const isSelected = key === selectedKey
          const isToday = key === todayKey
          const isFuture = key > todayKey
          const dots = Math.min(countByDay.get(key) ?? 0, 3)
          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => pickDay(day)}
              aria-label={`Pick ${key}`}
              aria-pressed={isSelected}
              className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm tabular-nums transition-colors ${
                isSelected
                  ? 'bg-accent font-bold text-bg'
                  : isFuture
                    ? 'text-ink-faint/35'
                    : 'text-ink-dim hover:bg-panel-3 hover:text-ink'
              } ${isToday && !isSelected ? 'ring-1 ring-inset ring-accent/60' : ''}`}
            >
              <span className="leading-none">{day}</span>
              {dots > 0 && (
                <span className="mt-1 flex gap-0.5" aria-hidden>
                  {Array.from({ length: dots }, (_, d) => (
                    <span
                      key={d}
                      className={`h-1 w-1 rounded-full ${isSelected ? 'bg-bg' : 'bg-accent'}`}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-sm text-ink-dim">Time</span>
        <input
          type="time"
          value={`${pad2(selected.getHours())}:${pad2(selected.getMinutes())}`}
          // the day grid's rule, applied to the clock: no later than now
          max={selectedKey === todayKey ? `${pad2(today.getHours())}:${pad2(today.getMinutes())}` : undefined}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink outline-none [color-scheme:dark] focus:border-accent/60"
        />
      </div>
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      style={dir === 'right' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
