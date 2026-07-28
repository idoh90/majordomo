import { useMemo } from 'react'
import { useCapitalStore } from '../store'
import type { Holding } from '../types'
import { holdingRow, missingFxCurrencies, portfolioTotals } from '../lib/holdings'
import { formatPercent } from '../lib/money'
import { voice } from '../../../core/voice'
import { Amount } from './Amount'

interface PortfolioBoardProps {
  onAddHolding: () => void
  onEditHolding: (h: Holding) => void
  onOpenSettings: () => void
}

export function PortfolioBoard({ onAddHolding, onEditHolding, onOpenSettings }: PortfolioBoardProps) {
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const apiKey = useCapitalStore((s) => s.apiKey)
  const updatedAt = useCapitalStore((s) => s.pricesUpdatedAt)
  const error = useCapitalStore((s) => s.pricesError)
  const loading = useCapitalStore((s) => s.pricesLoading)
  const refreshPrices = useCapitalStore((s) => s.refreshPrices)

  const rows = useMemo(
    () => holdings.map((h) => holdingRow(h, prices, fx)).sort((a, b) => b.marketValue - a.marketValue),
    [holdings, prices, fx],
  )
  const totals = useMemo(() => portfolioTotals(rows), [rows])
  const anyClosed = rows.some((r) => r.quote && r.quote.marketOpen === false)
  const missingFx = useMemo(() => missingFxCurrencies(holdings, prices, fx), [holdings, prices, fx])

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="card-title">Portfolio</h3>
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span>
            {loading
              ? 'Updating…'
              : error
                ? <span className="text-danger" title={error}>price error</span>
                : updatedAt
                  ? `updated ${agoLabel(updatedAt)}`
                  : 'not fetched'}
          </span>
          {apiKey ? (
            <button
              type="button"
              onClick={() => refreshPrices()}
              disabled={loading || holdings.length === 0}
              className="chip border border-line bg-panel p-1.5 text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
              aria-label="Refresh prices"
            >
              <RefreshIcon spinning={loading} />
            </button>
          ) : (
            <button type="button" onClick={onOpenSettings} className="text-accent hover:opacity-80">
              + API key
            </button>
          )}
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-ink-dim">No holdings yet.</p>
          <button type="button" onClick={onAddHolding} className="btn-cta mt-3 px-4 py-2.5 text-sm">
            Add a holding
          </button>
          {!apiKey && (
            <p className="mt-2 text-[11px] text-ink-faint">
              Live prices need a free{' '}
              <button type="button" onClick={onOpenSettings} className="text-accent hover:opacity-80">
                Twelve Data key
              </button>
              .
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Two lines each below md, the five-column table above it. The
              split used to sit at 420px while the board itself lived in a
              carousel page until 768px — so between those widths a five-column
              table rendered inside a horizontal scroller inside another
              horizontal scroller. The carousel is gone; the breakpoints agree. */}
          <div className="flex flex-col md:hidden">
            {rows.map((r) => (
              <button
                key={r.holding.id}
                type="button"
                onClick={() => onEditHolding(r.holding)}
                className="w-full border-t border-line py-2.5 pl-2.5 text-left"
                style={
                  r.priced
                    ? {
                        // the day's direction, stated as material rather than
                        // asking the eye to find a sign among five figures
                        borderLeft: `3px solid ${r.dayChange >= 0 ? 'var(--color-positive)' : 'var(--color-danger)'}`,
                        background: `linear-gradient(90deg, color-mix(in srgb, ${r.dayChange >= 0 ? 'var(--color-positive)' : 'var(--color-danger)'} 9%, transparent), transparent 55%)`,
                      }
                    : undefined
                }
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-ink">
                    {r.holding.symbol.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-ink-faint">{r.holding.shares}×</span>
                  {!r.priced && <span className="text-[10px] text-ink-faint">(no price)</span>}
                  <span className="ml-auto text-sm tabular-nums text-ink">
                    {r.unconvertedCurrency ? (
                      nativePrice(r.marketValue, r.unconvertedCurrency)
                    ) : (
                      <Amount value={r.marketValue} kind="compact" />
                    )}
                  </span>
                </span>
                <span className="mt-0.5 flex items-baseline gap-2 text-[11.5px] tabular-nums">
                  <span className="text-ink-dim">
                    {r.quote ? nativePrice(r.quote.price, r.quote.currency) : '—'}
                  </span>
                  <span className={sign(r.dayChange)}>
                    {r.quote ? (
                      <>
                        {r.unconvertedCurrency ? (
                          nativeDelta(r.dayChange, r.unconvertedCurrency)
                        ) : (
                          <Amount value={r.dayChange} kind="delta" />
                        )}
                        {r.dayChangePct != null && ` ${formatPercent(r.dayChangePct)}`}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className={`ml-auto ${sign(r.unrealized)}`}>
                    {r.unconvertedCurrency ? (
                      nativeDelta(r.unrealized, r.unconvertedCurrency)
                    ) : (
                      <Amount value={r.unrealized} kind="delta" />
                    )}
                  </span>
                </span>
              </button>
            ))}
            <div className="flex items-baseline gap-2 border-t border-line pt-2 text-[11.5px] font-semibold tabular-nums">
              <span className="text-ink-dim">Total</span>
              <span className={sign(totals.dayChange)}>
                <Amount value={totals.dayChange} kind="delta" />
              </span>
              <span className="ml-auto text-ink">
                <Amount value={totals.marketValue} kind="compact" />
              </span>
              <span className={sign(totals.unrealized)}>
                <Amount value={totals.unrealized} kind="delta" />
              </span>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  <th className="pb-1.5 font-medium">Symbol</th>
                  <th className="pb-1.5 text-right font-medium">Price</th>
                  <th className="pb-1.5 text-right font-medium">Day P/L</th>
                  <th className="pb-1.5 text-right font-medium">Value</th>
                  <th className="pb-1.5 text-right font-medium">Unreal. P/L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.holding.id}
                    onClick={() => onEditHolding(r.holding)}
                    className="cursor-pointer border-t border-line hover:bg-panel-2"
                  >
                    <td className="py-2">
                      <span className="font-semibold text-ink">{r.holding.symbol.toUpperCase()}</span>
                      <span className="ml-1.5 text-[11px] text-ink-faint">{r.holding.shares}×</span>
                      {!r.priced && <span className="ml-1 text-[10px] text-ink-faint">(no price)</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-dim">
                      {r.quote ? nativePrice(r.quote.price, r.quote.currency) : '—'}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${sign(r.dayChange)}`}>
                      {r.quote ? (
                        <>
                          {r.unconvertedCurrency ? (
                            nativeDelta(r.dayChange, r.unconvertedCurrency)
                          ) : (
                            <Amount value={r.dayChange} kind="delta" />
                          )}
                          {r.dayChangePct != null && (
                            <span className="block text-[10px] text-ink-faint">{formatPercent(r.dayChangePct)}</span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">
                      {/* no ₪ rate → keep the number honest: label it in its own currency */}
                      {r.unconvertedCurrency ? (
                        nativePrice(r.marketValue, r.unconvertedCurrency)
                      ) : (
                        <Amount value={r.marketValue} kind="compact" />
                      )}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${sign(r.unrealized)}`}>
                      {r.unconvertedCurrency ? (
                        nativeDelta(r.unrealized, r.unconvertedCurrency)
                      ) : (
                        <Amount value={r.unrealized} kind="delta" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <td className="pt-2 text-ink-dim">Total</td>
                  <td />
                  <td className={`pt-2 text-right tabular-nums ${sign(totals.dayChange)}`}>
                    <Amount value={totals.dayChange} kind="delta" />
                  </td>
                  <td className="pt-2 text-right tabular-nums text-ink">
                    <Amount value={totals.marketValue} kind="compact" />
                  </td>
                  <td className={`pt-2 text-right tabular-nums ${sign(totals.unrealized)}`}>
                    <Amount value={totals.unrealized} kind="delta" />
                    {totals.unrealizedPct != null && (
                      <span className="ml-1 text-[11px] font-normal text-ink-faint">
                        {formatPercent(totals.unrealizedPct)}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {missingFx.length > 0 && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-danger">
              {voice.capital.fxMissing(missingFx)}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onAddHolding}
              className="text-sm text-accent transition-opacity hover:opacity-80"
            >
              + Add holding
            </button>
            {anyClosed && <span className="text-[10px] text-ink-faint">Day P/L = last close</span>}
          </div>
        </>
      )}
    </div>
  )
}

function sign(n: number | null): string {
  if (n == null || n === 0) return 'text-ink-dim'
  return n > 0 ? 'text-accent' : 'text-danger'
}

function nativePrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(price)
  } catch {
    return price.toFixed(2)
  }
}

function nativeDelta(n: number, currency: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${nativePrice(Math.abs(n), currency)}`
}

function agoLabel(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className={spinning ? 'animate-spin' : ''}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
