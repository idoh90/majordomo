import { useMemo } from 'react'
import type { Workout } from '../../types'
import { localDayKey } from '../../../../core/dates'
import { MonthGrid } from '../../../../core/ui/MonthGrid'

interface CalendarPickerProps {
  /** ISO datetime of the currently chosen moment */
  value: string
  onChange: (iso: string) => void
  /** existing workouts — days that have any get amber dots */
  workouts: Workout[]
}

/**
 * The Grounds' when-picker: the house month grid with a clock under it. Days
 * with logged workouts show up to three amber dots.
 *
 * ONE RULE FOR DAYS AND TIMES: a workout cannot have happened in the future.
 * That rule lives HERE, not in the grid — the grid is told `max = today` and
 * knows nothing about why. Today's time input is capped at the current minute,
 * and anything that would still land ahead of now — a 23:59 pick at 13:00, or
 * yesterday-at-23:59 carried onto today by a day tap — clamps to now.
 * Otherwise a workout logged for tonight would count toward this week and
 * claim a block that has not happened yet.
 */
export function CalendarPicker({ value, onChange, workouts }: CalendarPickerProps) {
  const selected = new Date(value)
  const today = new Date()
  const todayKey = localDayKey(today)

  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of workouts) {
      const k = localDayKey(w.performedAt)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [workouts])

  /** never ahead of the present — resolved at interaction time, not render */
  const emit = (d: Date) => {
    const nowMs = Date.now()
    onChange(new Date(Math.min(d.getTime(), nowMs)).toISOString())
  }

  const pickDay = (dayKey: string) => {
    const [y, m, d] = dayKey.split('-').map(Number)
    emit(new Date(y, m - 1, d, selected.getHours(), selected.getMinutes()))
  }

  const setTime = (hhmm: string) => {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(selected)
    d.setHours(h, m, 0, 0)
    emit(d)
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const selectedKey = localDayKey(selected)

  return (
    <div className="card p-3">
      <MonthGrid
        value={selectedKey}
        onPick={pickDay}
        max={todayKey}
        dotsFor={(k) => countByDay.get(k) ?? 0}
      />

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
