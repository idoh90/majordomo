import { monthLabel, spendPace, type SpendBreakdown } from '../lib/budget'
import { voice } from '../../../core/voice'
import { Amount } from './Amount'

interface SpendCardProps {
  /** fixed / variable / total — the card needs the split, not just the sum */
  breakdown: SpendBreakdown
  budget: number
  now: Date
  onEdit: () => void
  /** opens the same sheet — its month pager IS the spending history */
  onHistory?: () => void
}

/** This month's spend vs budget — factual only (no projection). */
export function SpendCard({ breakdown, budget, now, onEdit, onHistory }: SpendCardProps) {
  const hasBudget = budget > 0
  const spent = breakdown.total
  const pace = spendPace(breakdown, budget, now)
  // clamped at BOTH ends: refunds can put a month's spend below zero, and an
  // unclamped negative width is invalid CSS — the bar would render full
  const pct = hasBudget ? Math.min(1, Math.max(0, pace.usedFraction)) : 0
  const over = hasBudget && spent > budget
  const barColor = over ? 'var(--color-danger)' : 'var(--color-accent)'
  const { dayOfMonth, daysInMonth } = pace
  // The fixed slice, drawn muted at the bar's left: it was committed the moment
  // the month opened, so seeing it as a distinct block is the whole point — it
  // is not spending that got ahead of itself. Never wider than the bar itself,
  // which keeps it honest when a refund pulls the total back under it.
  const fixedPct = Math.min(pct, hasBudget ? Math.max(0, pace.fixedFraction) : 0)
  const showSplit = hasBudget && breakdown.fixed > 0

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="card-title">Spending · {monthLabel(now)}</h3>
        <div className="flex items-center gap-2.5">
          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] text-sm text-ink-dim transition-colors hover:text-ink"
            >
              {voice.capital.spend.history}
            </button>
          )}
          <button type="button" onClick={onEdit} className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] text-sm text-accent transition-opacity hover:opacity-80">
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

          {/* The pace marker: where the budget OUGHT to have got to by now —
              all of the fixed costs, which the month commits on its first
              instant, plus the elapsed share of whatever is left over for
              variable spending. Comparing the bar against the tick is the
              whole judgement; no projection is made, and none should be.
              budgetPace() was retired precisely because scaling fixed costs
              with the calendar told people they were overspending on the 2nd
              of every month — and marking the tick at the bare day fraction
              was the same lie told the other way round, since it asked rent to
              have been paid in thirty-first parts. */}
          <div className="relative mt-3 h-2 w-full rounded-pill bg-panel-3">
            <div className="h-full overflow-hidden rounded-pill">
              <div
                className="h-full rounded-pill transition-[width]"
                style={{ width: `${pct * 100}%`, background: barColor }}
              />
              {fixedPct > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-l-pill transition-[width]"
                  style={{
                    width: `${fixedPct * 100}%`,
                    background: `color-mix(in srgb, ${barColor} 42%, var(--color-panel-3))`,
                  }}
                />
              )}
            </div>
            <span
              aria-hidden
              className="absolute -top-0.5 h-3 w-px"
              style={{
                left: `${pace.expectedFraction * 100}%`,
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
                    ['--chip-accent' as string]: pace.underPace
                      ? 'var(--color-positive)'
                      : 'var(--color-ember)',
                    color: pace.underPace ? 'var(--color-positive)' : 'var(--color-ember)',
                  }}
                >
                  {pace.underPace ? voice.capital.spend.underPace : voice.capital.spend.overPace}
                </span>
              )}
            </span>
            <span className={over ? 'text-danger' : 'text-ink-dim'}>
              <Amount value={over ? spent - budget : budget - spent} />
              {over ? ' over budget' : ' left'}
            </span>
          </div>

          {/* names the two blocks of the bar in the order they're drawn, so the
              muted slice isn't a mystery */}
          {showSplit && (
            <p className="mt-1.5 text-[11px] text-ink-faint">
              <Amount value={breakdown.fixed} /> {voice.capital.spend.fixedWord} ·{' '}
              <Amount value={breakdown.variable} />{' '}
              {voice.capital.spend.variableOverDays(dayOfMonth)}
            </p>
          )}
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
