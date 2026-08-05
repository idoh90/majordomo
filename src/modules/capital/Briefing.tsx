import { useNow } from '../../core/useNow'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { CapitalBriefingFacts } from '../../core/voice/types'
import { monthKey, spendBreakdown, spendPace } from './lib/budget'
import { holdingRow, portfolioTotals } from './lib/holdings'
import { formatCompact, formatILS } from './lib/money'
import {
  displayDelta,
  latestSnapshot,
  liveNetWorth,
  netWorthOf,
  netWorthSeries,
} from './lib/networth'
import { useCapitalStore } from './store'

/**
 * The Ledger's briefing. Money is formatted here and handed to the voice pack
 * as text — the ₪ formatter is the wing's business and core has no idea what
 * currency the estate keeps.
 *
 * The delta clause is dropped entirely when displayDelta returns null, which
 * is the Vault's rule too: a lone snapshot has nothing to be compared with,
 * and "▲ ₪0 vs last" is a claim rather than a figure.
 */
export function LedgerBriefing({ className = '' }: { className?: string } = {}) {
  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)
  const blurAmounts = useCapitalStore((s) => s.blurAmounts)
  const now = useNow()

  const nowDate = new Date(now)
  const breakdown = spendBreakdown(monthKey(nowDate), spends, recurring, spendItems)
  const spent = breakdown.total
  const pace = spendPace(breakdown, monthlyBudget, nowDate)
  const latest = latestSnapshot(snapshots)
  const live = liveNetWorth(accounts, holdings, prices, fx, latest)
  const delta = displayDelta({
    live,
    series: netWorthSeries(snapshots, accounts),
    latest,
    snapshotNetWorth: latest ? netWorthOf(latest, accounts) : 0,
    hasHoldings: holdings.length > 0,
  })

  const rows = holdings.map((h) => holdingRow(h, prices, fx))
  const port = portfolioTotals(rows)

  const { dayOfMonth, daysInMonth } = pace
  const hasBudget = monthlyBudget > 0
  const over = hasBudget && spent > monthlyBudget

  const facts: CapitalBriefingFacts = {
    netWorth: formatILS(live.netWorth),
    // the magnitude only — the voice pack supplies the direction in words, and
    // formatDelta's own +/− on top of it produced "down +₪20.3K"
    delta: delta
      ? {
          amount: formatILS(Math.abs(delta.absolute)),
          up: delta.absolute >= 0,
          // naming the month is only informative once the month has turned;
          // "down since July" in July reads as a broken sentence
          basis:
            latest && new Date(latest.takenAt).getMonth() !== nowDate.getMonth()
              ? new Date(latest.takenAt).toLocaleDateString('en-US', { month: 'long' })
              : 'the last snapshot',
        }
      : null,
    spent: formatILS(spent),
    budget: formatILS(monthlyBudget),
    left: formatILS(Math.abs(monthlyBudget - spent)),
    over,
    hasBudget,
    dayOfMonth,
    daysInMonth,
    // factual: fixed costs spread flat over the month they buy, the variable
    // side over the days actually elapsed. No projection — budgetPace was
    // retired for scaling fixed costs with the calendar, and dividing rent by
    // the day of the month was the same distortion pointed the other way.
    perDay: spent > 0 ? formatILS(Math.round(pace.perDay)) : null,
    fixed: breakdown.fixed > 0 ? formatILS(breakdown.fixed) : null,
    underPace: pace.underPace,
    portfolio:
      holdings.length > 0
        ? {
            value: formatCompact(port.marketValue),
            dayPL: formatILS(Math.abs(port.dayChange)),
            dayUp: port.dayChange >= 0,
            unrealized: formatCompact(Math.abs(port.unrealized)),
            unrealUp: port.unrealized >= 0,
          }
        : null,
  }

  return (
    <BriefingPanel
      className={className}
      accent="var(--color-w-ledger)"
      scope={voice.modules.capital.name}
      chips={voice.capital.briefingPanel.chips(facts)}
      headline={voice.capital.briefingPanel.headline(facts)}
      detail={voice.capital.briefingPanel.detail(facts)}
      blurFigures={blurAmounts}
    />
  )
}
