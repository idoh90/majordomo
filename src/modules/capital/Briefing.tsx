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
  const series = netWorthSeries(snapshots, accounts)
  const delta = displayDelta({
    live,
    series,
    latest,
    snapshotNetWorth: latest ? netWorthOf(latest, accounts) : 0,
    hasHoldings: holdings.length > 0,
  })
  // The delta's basis is where it STARTS. With holdings that's the last
  // snapshot (live has moved since); without, it's the one BEFORE the last —
  // naming the last there had the sentence claim a gain since the very figure
  // it had just quoted. The year has to be checked too, or a comparison eleven
  // months old prints as "since September".
  const basisAt = holdings.length > 0 ? latest?.takenAt : series[series.length - 2]?.takenAt
  const basisDate = basisAt ? new Date(basisAt) : null
  const basisIsOtherMonth =
    basisDate != null &&
    (basisDate.getFullYear() !== nowDate.getFullYear() || basisDate.getMonth() !== nowDate.getMonth())

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
          basis: basisIsOtherMonth
            ? basisDate!.toLocaleDateString('en-US', {
                month: 'long',
                ...(basisDate!.getFullYear() !== nowDate.getFullYear() ? { year: 'numeric' } : {}),
              })
            : holdings.length > 0
              ? 'the last snapshot'
              : 'the previous snapshot',
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
    // gated on the figure printed, not the month's total: a refund early in the
    // month is divided by a tiny day count and swamps the fixed term, so a
    // spent-above-zero month happily printed "runs at -₪82 a day"
    perDay: pace.perDay > 0 ? formatILS(Math.round(pace.perDay)) : null,
    fixed: breakdown.fixed > 0 ? formatILS(breakdown.fixed) : null,
    underPace: pace.underPace,
    // dropped entirely when some row has no ₪ rate: the totals then cover only
    // the converted rows, and this panel has nowhere to say so
    portfolio:
      holdings.length > 0 && port.unconverted.length === 0
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
