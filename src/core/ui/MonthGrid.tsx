import { useEffect, useState } from 'react'
import { localDayKey, type WeekStart } from '../dates'

/**
 * THE MONTH GRID — the one month calendar in the house.
 *
 * Speaks LOCAL DAY KEYS ('YYYY-MM-DD') at both ends: never a Date, never an
 * ISO instant. A month grid picks a square on a wall calendar, and the moment
 * inside that square is the caller's business — the Grounds keeps a clock
 * beside it, an examination has no time at all. Keys also compare as plain
 * strings, which is what keeps the bounds below a `<` instead of a timezone
 * essay.
 *
 * It holds NO POLICY about which days are pickable. `min`/`max` are the whole
 * vocabulary, and the two wings point them in opposite directions on purpose:
 * the Grounds cannot log a workout that has not happened yet (`max` = today),
 * the Study cannot sit an examination that already has (`min` = today). Bounds
 * also stop the month nav, so neither wing can wander into a decade it has no
 * business in.
 *
 * Spacing and material are the caller's, as everywhere else — this draws the
 * header and the squares, and nothing around them.
 */

const pad2 = (n: number) => String(n).padStart(2, '0')
/** indexed by getDay(); the header row rotates to weekStart, the letters don't move */
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const monthOf = (dayKey: string) => {
  const [y, m] = dayKey.split('-').map(Number)
  return { y, m: m - 1 }
}
/** months since year 0 — the one number that makes bounds a comparison */
const monthIndex = (dayKey: string) => {
  const { y, m } = monthOf(dayKey)
  return y * 12 + m
}

export function MonthGrid({
  value,
  onPick,
  min,
  max,
  dotsFor,
  weekStart = 1,
}: {
  /** the selected local day key */
  value: string
  onPick: (dayKey: string) => void
  /** inclusive bounds; days outside are disabled and the month nav stops there */
  min?: string
  max?: string
  /** up to three dots under a day — a count, clamped here */
  dotsFor?: (dayKey: string) => number
  /** 0 = Sunday, 1 = Monday (default) */
  weekStart?: WeekStart
}) {
  const [view, setView] = useState(() => monthOf(value))

  // follow the value when it lands outside the month on screen — a stepper
  // beside the grid, a clamp. The grid's own taps always land in the viewed
  // month, so this never fights the month the user navigated to.
  const valueMonth = value.slice(0, 7)
  useEffect(() => {
    const next = monthOf(`${valueMonth}-01`)
    setView((cur) => (cur.y === next.y && cur.m === next.m ? cur : next))
  }, [valueMonth])

  const todayKey = localDayKey(new Date())
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const leadingBlanks = (new Date(view.y, view.m, 1).getDay() - weekStart + 7) % 7
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const here = view.y * 12 + view.m
  const canPrev = min === undefined || here > monthIndex(min)
  const canNext = max === undefined || here < monthIndex(max)

  const moveMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  const heads = Array.from({ length: 7 }, (_, i) => LETTERS[(i + weekStart) % 7])
  const monthTitle = new Date(view.y, view.m, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => moveMonth(-1)}
          disabled={!canPrev}
          className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-3 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
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
          disabled={!canNext}
          className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-panel-3 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {heads.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="pb-1 font-display text-[10px] font-bold uppercase tracking-widest text-ink-faint"
          >
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`b-${i}`} />
          const key = `${view.y}-${pad2(view.m + 1)}-${pad2(day)}`
          const isSelected = key === value
          const isToday = key === todayKey
          const barred = (min !== undefined && key < min) || (max !== undefined && key > max)
          const dots = Math.min(dotsFor?.(key) ?? 0, 3)
          return (
            <button
              key={key}
              type="button"
              disabled={barred}
              onClick={() => onPick(key)}
              aria-label={`Pick ${key}`}
              aria-pressed={isSelected}
              className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm tabular-nums transition-colors ${
                isSelected
                  ? 'bg-accent font-bold text-bg'
                  : barred
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
    </>
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
