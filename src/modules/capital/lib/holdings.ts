import type { Holding, Quote } from '../types'
import type { Candle } from './prices'

export type Prices = Record<string, Quote>
export type Fx = Record<string, number>
export type History = Record<string, Candle[]>

export function quoteFor(h: Holding, prices: Prices): Quote | undefined {
  return prices[h.symbol.trim().toUpperCase()]
}

/** currency → ILS rate; 1 when the rate is missing (see missingFxCurrencies). */
function rateFor(currency: string, fx: Fx): number {
  return fx[currency.toUpperCase()] ?? 1
}

/**
 * Non-₪ currencies in use (holding or quote side) with no cached FX rate —
 * their values render UNCONVERTED (rate 1), so the UI must say so.
 */
export function missingFxCurrencies(holdings: Holding[], prices: Prices, fx: Fx): string[] {
  const need = new Set<string>()
  for (const h of holdings) {
    need.add(h.currency.toUpperCase())
    const q = quoteFor(h, prices)
    if (q) need.add(q.currency.toUpperCase())
  }
  return [...need].filter((c) => c !== 'ILS' && fx[c] == null).sort()
}

/** Cost basis in ₪ (independent of any live quote). */
export function costValueILS(h: Holding, fx: Fx): number {
  return h.shares * h.costBasis * rateFor(h.currency, fx)
}

/** The price is denominated in the QUOTE's currency — the holding's declared
 *  currency only covers the cost basis (and pre-quote fallbacks). */
function priceCurrency(h: Holding, q: Quote): string {
  return q.currency || h.currency
}

/** Live market value in ₪, or null when no quote is cached yet. */
export function marketValueILS(h: Holding, prices: Prices, fx: Fx): number | null {
  const q = quoteFor(h, prices)
  if (!q) return null
  return h.shares * q.price * rateFor(priceCurrency(h, q), fx)
}

/** Today's move in ₪, or null without a quote. */
export function dayChangeILS(h: Holding, prices: Prices, fx: Fx): number | null {
  const q = quoteFor(h, prices)
  if (!q) return null
  return h.shares * (q.price - q.prevClose) * rateFor(priceCurrency(h, q), fx)
}

export interface HoldingRow {
  holding: Holding
  quote: Quote | undefined
  marketValue: number // ₪; falls back to cost when no quote
  costValue: number // ₪
  unrealized: number // ₪
  unrealizedPct: number | null
  dayChange: number // ₪
  dayChangePct: number | null
  priced: boolean // true when a live quote drove marketValue
  /** set when the value's currency has NO ₪ rate — the numbers above are in
   *  THIS currency, not ₪, and the UI must label them as such */
  unconvertedCurrency: string | null
}

export function holdingRow(h: Holding, prices: Prices, fx: Fx): HoldingRow {
  const q = quoteFor(h, prices)
  const cost = costValueILS(h, fx)
  const mvLive = marketValueILS(h, prices, fx)
  const marketValue = mvLive ?? cost
  const unrealized = marketValue - cost
  const day = dayChangeILS(h, prices, fx) ?? 0
  const valueCurrency = (q ? priceCurrency(h, q) : h.currency).toUpperCase()
  return {
    holding: h,
    quote: q,
    marketValue,
    costValue: cost,
    unrealized,
    unrealizedPct: cost !== 0 ? unrealized / cost : null,
    dayChange: day,
    dayChangePct: q ? q.price / q.prevClose - 1 : null,
    priced: mvLive != null,
    unconvertedCurrency: valueCurrency !== 'ILS' && fx[valueCurrency] == null ? valueCurrency : null,
  }
}

export function holdingsFor(accountId: string, holdings: Holding[]): Holding[] {
  return holdings.filter((h) => h.accountId === accountId)
}

/**
 * Current value of an account: Σ live market value when it has holdings, else the
 * manual `fallbackBalance` (its latest snapshot balance).
 */
export function accountLiveValue(
  accountId: string,
  holdings: Holding[],
  prices: Prices,
  fx: Fx,
  fallbackBalance: number,
): number {
  const hs = holdingsFor(accountId, holdings)
  if (hs.length === 0) return fallbackBalance
  let total = 0
  for (const h of hs) total += marketValueILS(h, prices, fx) ?? costValueILS(h, fx)
  return total
}

export function isPriced(accountId: string, holdings: Holding[]): boolean {
  return holdings.some((h) => h.accountId === accountId)
}

export interface PortfolioTotals {
  marketValue: number
  costValue: number
  unrealized: number
  unrealizedPct: number | null
  dayChange: number
}

export function portfolioTotals(rows: HoldingRow[]): PortfolioTotals {
  const marketValue = rows.reduce((s, r) => s + r.marketValue, 0)
  const costValue = rows.reduce((s, r) => s + r.costValue, 0)
  const unrealized = marketValue - costValue
  const dayChange = rows.reduce((s, r) => s + r.dayChange, 0)
  return {
    marketValue,
    costValue,
    unrealized,
    unrealizedPct: costValue !== 0 ? unrealized / costValue : null,
    dayChange,
  }
}

/* ---------------------------------- 10-day P/L (from daily close history) --- */

export interface DailyPL {
  date: string
  pl: number // ₪
}
export interface TenDayPL {
  days: DailyPL[]
  total: number
  totalPct: number | null
  hasData: boolean
}

/**
 * Portfolio ₪ P/L for each of the last ~10 trading days, from cached daily
 * closes. Days missing a close for some symbol carry that symbol's last known
 * close forward. FX uses current rates (a small approximation over 10 days).
 */
export function tenDayPL(holdings: Holding[], history: History, fx: Fx): TenDayPL {
  // per-symbol date→close, and the union of all dates
  const priced = holdings.filter((h) => (history[h.symbol.trim().toUpperCase()]?.length ?? 0) >= 2)
  if (priced.length === 0) return { days: [], total: 0, totalPct: null, hasData: false }

  const maps = new Map<string, Map<string, number>>()
  const allDates = new Set<string>()
  for (const h of priced) {
    const sym = h.symbol.trim().toUpperCase()
    if (!maps.has(sym)) {
      const m = new Map<string, number>()
      for (const c of history[sym]) {
        m.set(c.date, c.close)
        allDates.add(c.date)
      }
      maps.set(sym, m)
    }
  }
  const dates = [...allDates].sort().slice(-11) // 11 closes → 10 daily deltas
  if (dates.length < 2) return { days: [], total: 0, totalPct: null, hasData: false }

  // portfolio ₪ value at each date (carry each symbol's last close forward)
  const lastClose = new Map<string, number>()
  const values = dates.map((d) => {
    let v = 0
    for (const h of priced) {
      const sym = h.symbol.trim().toUpperCase()
      const close = maps.get(sym)!.get(d) ?? lastClose.get(sym)
      if (close != null) {
        lastClose.set(sym, close)
        v += h.shares * close * rateFor(h.currency, fx)
      }
    }
    return v
  })

  const days: DailyPL[] = []
  for (let i = 1; i < dates.length; i++) days.push({ date: dates[i], pl: values[i] - values[i - 1] })
  const total = values[values.length - 1] - values[0]
  return { days, total, totalPct: values[0] !== 0 ? total / values[0] : null, hasData: true }
}
