import { monthLabel } from '../lib/budget'
import { voice } from '../../../core/voice'
import { Amount } from './Amount'

interface SpendCardProps {
  spent: number
  budget: number
  now: Date
  onEdit: () => void
  /** opens the same sheet — its month pager IS the spending history */
  onHistory?: () => void
}

/** This month's spend vs budget — factual only (no projection). */
export function SpendCard({ spent, budget, now, onEdit, onHistory }: SpendCardProps) {
  const hasBudget = budget > 0
  // clamped at BOTH ends: refunds can put a month's spend below zero, and an
  // unclamped negative width is invalid CSS — the bar would render full
  const pct = hasBudget ? Math.min(1, Math.max(0, spent / budget)) : 0
  const over = hasBudget && spent > budget
  const barColor = over ? 'var(--color-danger)' : 'var(--color-accent)'
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  // how far through the month we are, against how far through the budget —
  // a comparison of two fractions, not a forecast of where either ends up
  const dayFraction = dayOfMonth / daysInMonth
  const underPace = hasBudget && spent / budget <= dayFraction

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="card-title">Spending · {monthLabel(now)}</h3>
        <div className="flex items-center gap-2.5">
          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              className="text-sm text-ink-dim transition-colors hover:text-ink"
            >
              {voice.capital.spend.history}
            </button>
          )}
          <button type="button" onClick={onEdit} className="text-sm text-accent transition-opacity hover:opacity-80">
            Update
          </button>
        </div>
      </div>

      {hasBudget ? (
        <>
          <div className="flex items-end gap-2">
            <Amount value={spent} className="stat-num text-3xl text-ink" />
            <span className="mb-1 text-sm text-ink-faint">
              / <Amount value={budget} />
            </span>
          </div>

          {/* The pace marker: where the month itself has got to. Comparing the
              bar against the tick is the whole judgement — no projection is
              made, and none should be. budgetPace() was retired precisely
              because scaling fixed costs with the calendar told people they
              were overspending on the 2nd of every month. */}
          <div className="relative mt-3 h-2 w-full rounded-pill bg-panel-3">
            <div className="h-full overflow-hidden rounded-pill">
              <div
                className="h-full rounded-pill transition-[width]"
                style={{ width: `${pct * 100}%`, background: barColor }}
              />
            </div>
            <span
              aria-hidden
              className="absolute -top-0.5 h-3 w-px"
              style={{
                left: `${dayFraction * 100}%`,
                background: 'color-mix(in srgb, var(--color-ink) 55%, transparent)',
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="text-ink-faint">
                day {dayOfMonth}/{daysInMonth}
              </span>
              {!over && (
                <span
                  className="chip-tint px-2 py-0.5 text-[9.5px] tracking-[0.12em]"
                  style={{
                    ['--chip-accent' as string]: underPace
                      ? 'var(--color-positive)'
                      : 'var(--color-ember)',
                    color: underPace ? 'var(--color-positive)' : 'var(--color-ember)',
                  }}
                >
                  {underPace ? voice.capital.spend.underPace : voice.capital.spend.overPace}
                </span>
              )}
            </span>
            <span className={over ? 'text-danger' : 'text-ink-dim'}>
              <Amount value={over ? spent - budget : budget - spent} />
              {over ? ' over budget' : ' left'}
            </span>
          </div>
        </>
      ) : (
        <div className="py-1">
          <p className="text-sm text-ink-dim">No budget set.</p>
          <button type="button" onClick={onEdit} className="btn-cta mt-3 px-4 py-2.5 text-sm">
            Set a monthly budget
          </button>
        </div>
      )}
    </div>
  )
}
