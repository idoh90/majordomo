import { useMemo, useState } from 'react'
import type { Workout } from '../../types'
import { MUSCLES, PPL_LABELS } from '../../data/muscles'
import { localDayKey, relativeDayLabel, timeLabel } from '../../../../core/dates'
import { useShellStore } from '../../../../core/store/shell'

interface WorkoutCalendarProps {
  workouts: Workout[]
  now: number
  onOpen: (w: Workout) => void
}

const SUN_FIRST = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const pad2 = (n: number) => String(n).padStart(2, '0')

export function WorkoutCalendar({ workouts, now, onOpen }: WorkoutCalendarProps) {
  const weekStart = useShellStore((s) => s.weekStart)
  const weekdays = Array.from({ length: 7 }, (_, i) => SUN_FIRST[(i + weekStart) % 7])
  const byDay = useMemo(() => {
    const map = new Map<string, Workout[]>()
    for (const w of workouts) {
      const k = localDayKey(w.performedAt)
      const list = map.get(k)
      if (list) list.push(w)
      else map.set(k, [w])
    }
    return map
  }, [workouts])

  // start focused on the most recent workout (or today)
  const anchor = workouts[0] ? new Date(workouts[0].performedAt) : new Date(now)
  const [viewYear, setViewYear] = useState(anchor.getFullYear())
  const [viewMonth, setViewMonth] = useState(anchor.getMonth())
  const [selectedKey, setSelectedKey] = useState<string>(localDayKey(anchor))

  const today = new Date(now)
  const todayKey = localDayKey(today)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() - weekStart + 7) % 7
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const atCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const selectedWorkouts = byDay.get(selectedKey) ?? []

  return (
    <section className="panel px-4 pb-4 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="card-title">Calendar</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => moveMonth(-1)}
            className="relative after:absolute after:-inset-2 after:content-[''] rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <Chevron dir="left" />
          </button>
          <span className="min-w-[7.5rem] text-center font-display text-xs font-bold uppercase tracking-[0.12em]">
            {monthTitle}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => moveMonth(1)}
            disabled={atCurrentMonth}
            className="relative after:absolute after:-inset-2 after:content-[''] rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {weekdays.map((d, i) => (
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
          const count = Math.min(byDay.get(key)?.length ?? 0, 3)
          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => setSelectedKey(key)}
              aria-label={`${key}${count ? `, ${byDay.get(key)!.length} workout(s)` : ''}`}
              aria-pressed={isSelected}
              className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm tabular-nums transition-colors ${
                isSelected
                  ? 'bg-accent font-bold text-bg'
                  : isFuture
                    ? 'text-ink-faint/35'
                    : 'text-ink-dim hover:bg-panel-2 hover:text-ink'
              } ${isToday && !isSelected ? 'ring-1 ring-inset ring-accent/60' : ''}`}
            >
              <span className="leading-none">{day}</span>
              {count > 0 && (
                <span className="mt-1 flex gap-0.5" aria-hidden>
                  {Array.from({ length: count }, (_, d) => (
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

      <div className="mt-3 border-t border-line pt-3">
        <h3 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">
          {relativeDayLabel(`${selectedKey}T12:00:00`, today)}
        </h3>
        {/* plain label, not .card-title — skins number/decorate section titles only */}
        {selectedWorkouts.length === 0 ? (
          <p className="py-1 text-sm text-ink-faint">No workouts this day.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedWorkouts.map((w) => (
              <CalendarRow key={w.id} workout={w} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function CalendarRow({ workout, onOpen }: { workout: Workout; onOpen: (w: Workout) => void }) {
  const muscles = workout.primary.slice(0, 2).map((m) => MUSCLES[m].label)
  const extra = workout.primary.length + workout.secondary.length - muscles.length
  return (
    <button
      type="button"
      onClick={() => onOpen(workout)}
      className="card flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:border-accent/40"
    >
      <span className="flex min-w-0 items-center gap-2">
        {workout.ppl && (
          <span className="rounded-md border border-accent/60 px-1.5 py-px font-display text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
            {PPL_LABELS[workout.ppl]}
          </span>
        )}
        <span className="truncate text-sm text-ink">
          {muscles.join(', ')}
          {extra > 0 && <span className="text-ink-faint"> +{extra}</span>}
        </span>
      </span>
      <span className="shrink-0 text-xs text-ink-faint">{timeLabel(workout.performedAt)}</span>
    </button>
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
