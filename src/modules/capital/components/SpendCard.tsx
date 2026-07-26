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
  const pct = hasBudget ? Math.min(1, spent / budget) : 0
  const over = hasBudget && spent > budget
  const barColor = over ? 'var(--color-danger)' : 'var(--color-accent)'
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

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

          <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-panel-3">
            <div className="h-full rounded-pill transition-[width]" style={{ width: `${pct * 100}%`, background: barColor }} />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-ink-faint">
              day {dayOfMonth}/{daysInMonth}
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
