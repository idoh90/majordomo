import type { ReactNode } from 'react'
import type { ConsoleModule } from '../../core/module'
import { voice } from '../../core/voice'
import { useNow } from '../../core/useNow'
import { useCapitalStore } from './store'
import { monthKey, monthlySpent } from './lib/budget'
import { formatILS, formatPercent } from './lib/money'
import { holdingRow, portfolioTotals } from './lib/holdings'
import { latestDelta, latestSnapshot, liveNetWorth, netWorthOf, netWorthSeries } from './lib/networth'
import { Amount } from './components/Amount'
import { CapitalScreen } from './CapitalScreen'

/** Menu-tile stat: month-to-date spend vs. budget. */
function Tile() {
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)
  const now = useNow()
  const spent = monthlySpent(monthKey(new Date(now)), spends, recurring, spendItems)

  return (
    <>
      <span className="stat-num text-2xl leading-tight text-ink">
        <Amount value={spent} kind="compact" />
        {monthlyBudget > 0 && (
          <span className="text-base text-ink-faint">
            {' / '}
            <Amount value={monthlyBudget} kind="compact" />
          </span>
        )}
      </span>
      <span className="block text-[11px] leading-tight text-ink-faint">spent this month</span>
    </>
  )
}

/** Briefing line — the ledger's contribution to the daily readout. */
function Briefing() {
  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)
  const now = useNow()

  const spent = monthlySpent(monthKey(new Date(now)), spends, recurring, spendItems)
  const latest = latestSnapshot(snapshots)
  const hasSpend = monthlyBudget > 0 || spent > 0
  const hasWorth = latest != null || holdings.length > 0

  if (!hasSpend && !hasWorth) return null

  const overBudget = monthlyBudget > 0 && spent > monthlyBudget
  const live = liveNetWorth(accounts, holdings, prices, fx, latest)
  const snapshotNW = latest ? netWorthOf(latest, accounts) : 0
  const delta =
    holdings.length > 0 && latest
      ? { absolute: live.netWorth - snapshotNW, fraction: snapshotNW !== 0 ? (live.netWorth - snapshotNW) / Math.abs(snapshotNW) : null }
      : latestDelta(netWorthSeries(snapshots, accounts))

  // portfolio snapshot stats — only when live-priced holdings exist
  const rows = holdings.map((h) => holdingRow(h, prices, fx))
  const port = portfolioTotals(rows)
  const dayPct = port.marketValue - port.dayChange !== 0 ? port.dayChange / (port.marketValue - port.dayChange) : null
  const topMover = [...rows].sort((a, b) => Math.abs(b.dayChange) - Math.abs(a.dayChange))[0]

  return (
    <section className="panel px-4 py-3.5 sm:px-5">
      <div className="mb-1.5">
        <h2 className="card-title">The Ledger</h2>
      </div>
      <p className="text-sm leading-relaxed text-ink-dim">
        {hasSpend && (
          <>
            <span className="text-ink">
              Spent <Amount value={spent} /> this month
            </span>
            {monthlyBudget > 0 && (
              <>
                {' of '}
                <Amount value={monthlyBudget} />
                {overBudget ? (
                  <span className="text-danger"> ({formatILS(spent - monthlyBudget)} over)</span>
                ) : (
                  <span className="text-ink-faint"> ({formatILS(monthlyBudget - spent)} left)</span>
                )}
              </>
            )}
            {'. '}
          </>
        )}
        {hasWorth && (
          <>
            Net worth <span className="text-ink"><Amount value={live.netWorth} kind="compact" /></span>
            {delta.fraction !== null && (
              <>
                {' '}
                <span className={delta.absolute >= 0 ? 'text-accent' : 'text-danger'}>
                  {delta.absolute >= 0 ? '▲' : '▼'} <Amount value={delta.absolute} kind="delta" />
                </span>{' '}
                since last snapshot
              </>
            )}
            {'.'}
          </>
        )}
      </p>

      {holdings.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-3 sm:grid-cols-4">
          <Stat label="Portfolio">
            <Amount value={port.marketValue} kind="compact" className="text-ink" />
          </Stat>
          <Stat label="Today">
            <span className={port.dayChange >= 0 ? 'text-accent' : 'text-danger'}>
              <Amount value={port.dayChange} kind="delta" />
              {dayPct !== null && <span className="ml-1 text-ink-faint">{formatPercent(dayPct)}</span>}
            </span>
          </Stat>
          <Stat label="Unrealized">
            <span className={port.unrealized >= 0 ? 'text-accent' : 'text-danger'}>
              <Amount value={port.unrealized} kind="delta" />
              {port.unrealizedPct !== null && (
                <span className="ml-1 text-ink-faint">{formatPercent(port.unrealizedPct)}</span>
              )}
            </span>
          </Stat>
          <Stat label={`${holdings.length} position${holdings.length === 1 ? '' : 's'}`}>
            {topMover ? (
              <span className="text-ink">
                {topMover.holding.symbol.toUpperCase()}
                {topMover.dayChangePct !== null && (
                  <span className={`ml-1 ${topMover.dayChange >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {formatPercent(topMover.dayChangePct)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </Stat>
        </div>
      )}
    </section>
  )
}

/** compact briefing stat: tiny label over a value */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className="stat-num mt-0.5 truncate text-sm">{children}</div>
    </div>
  )
}

function Icon() {
  // rising trend — net worth & markets
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 17l5-5 4 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 8h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const capitalConsole: ConsoleModule = {
  id: 'capital',
  name: voice.modules.capital.name,
  status: 'online',
  tagline: voice.modules.capital.tagline,
  Icon,
  Tile,
  Screen: CapitalScreen,
  Briefing,
}
