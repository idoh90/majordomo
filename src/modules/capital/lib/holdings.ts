import type { Holding, Quote } from '../types'
import { listingKey, type Candle } from './prices'

export type Prices = Record<string, Quote>
export type Fx = Record<string, number>
export type History = Record<string, Candle[]>

/** Both caches are keyed by LISTING, not ticker — see prices.ts listingKey. */
export function cacheKey(h: Holding): string {
  return listingKey(h.symbol, h.exchange)
}

export function quoteFor(h: Holding, prices: Prices): Quote | undefined {
  return prices[cacheKey(h)]
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
 *
 * STRICT, like the snapshot stamp: the live sum only counts when EVERY holding
 * has a quote and a ₪ rate. It used to fall back per-holding to cost basis at
 * rate 1, which let unconverted USD masquerade as ₪ in the Vault, the accounts
 * list and the allocation bars (only the portfolio board labelled it). A number
 * the UI can't label must be the last truthful one instead — the snapshot
 * balance. Callers say so via `accountDegradedCurrencies` / `liveNetWorth`.
 */
export function accountLiveValue(
  accountId: string,
  holdings: Holding[],
  prices: Prices,
  fx: Fx,
  fallbackBalance: number,
): number {
  if (holdingsFor(accountId, holdings).length === 0) return fallbackBalance
  return accountLiveValueILSStrict(accountId, holdings, prices, fx) ?? fallbackBalance
}

export function isPriced(accountId: string, holdings: Holding[]): boolean {
  return holdings.some((h) => h.accountId === accountId)
}

/**
 * Live ₪ value of a priced account, or null the moment ANY of its holdings
 * lacks a cached quote or a ₪ rate. The loose `accountLiveValue` is fine for
 * a screen that can label itself ("unconverted", "fx missing") — but a value
 * being STAMPED INTO HISTORY must never quietly be cost basis or a rate-1
 * currency mixup. Null means: don't stamp, keep the last truthful number.
 */
export function accountLiveValueILSStrict(
  accountId: string,
  holdings: Holding[],
  prices: Prices,
  fx: Fx,
): number | null {
  const hs = holdingsFor(accountId, holdings)
  if (hs.length === 0) return null
  let total = 0
  for (const h of hs) {
    const q = quoteFor(h, prices)
    if (!q) return null
    const cur = priceCurrency(h, q).toUpperCase()
    if (cur !== 'ILS' && fx[cur] == null) return null
    total += h.shares * q.price * rateFor(cur, fx)
  }
  return total
}

/**
 * Currencies keeping this account off a live ₪ value — a holding with no cached
 * quote (its declared currency), or a quote whose currency has no ₪ rate. Empty
 * means the account values live; non-empty means it is showing its last saved
 * balance, and the UI owes the user that sentence.
 */
export function accountDegradedCurrencies(
  accountId: string,
  holdings: Holding[],
  prices: Prices,
  fx: Fx,
): string[] {
  const blocked = new Set<string>()
  for (const h of holdingsFor(accountId, holdings)) {
    const q = quoteFor(h, prices)
    if (!q) {
      blocked.add(h.currency.toUpperCase())
      continue
    }
    const cur = priceCurrency(h, q).toUpperCase()
    if (cur !== 'ILS' && fx[cur] == null) blocked.add(cur)
  }
  return [...blocked].sort()
}

/** A priced account that can't be valued live right now — see above. */
export function isDegraded(accountId: string, holdings: Holding[], prices: Prices, fx: Fx): boolean {
  return accountDegradedCurrencies(accountId, holdings, prices, fx).length > 0
}

export interface PortfolioTotals {
  marketValue: number
  costValue: number
  unrealized: number
  unrealizedPct: number | null
  dayChange: number
  /** currencies whose rows could NOT be converted to ₪ and are therefore left
   *  out of every figure above — non-empty means the totals are partial and
   *  callers must say so instead of printing a ₪ sign over them */
  unconverted: string[]
}

/**
 * Σ over the rows that are actually in ₪. A row the board renders in its own
 * currency (no ₪ rate) is honest BECAUSE the row names its currency — a single
 * summed figure can't, and adding francs to shekels under a ₪ sign is exactly
 * the rate-1 masquerade the strict live rule exists to stop.
 */
export function portfolioTotals(rows: HoldingRow[]): PortfolioTotals {
  const conv = rows.filter((r) => r.unconvertedCurrency == null)
  const marketValue = conv.reduce((s, r) => s + r.marketValue, 0)
  const costValue = conv.reduce((s, r) => s + r.costValue, 0)
  const unrealized = marketValue - costValue
  const dayChange = conv.reduce((s, r) => s + r.dayChange, 0)
  return {
    marketValue,
    costValue,
    unrealized,
    unrealizedPct: costValue !== 0 ? unrealized / costValue : null,
    dayChange,
    unconverted: [...new Set(rows.flatMap((r) => (r.unconvertedCurrency ? [r.unconvertedCurrency] : [])))].sort(),
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
  /** positions the window actually covers, and how many there are in total —
   *  a rate-limited refresh leaves some symbols with no candles, and a figure
   *  drawn from six of ten positions must not be presented as the portfolio's */
  covered: number
  positions: number
}

const EMPTY: TenDayPL = { days: [], total: 0, totalPct: null, hasData: false, covered: 0, positions: 0 }

/**
 * Portfolio ₪ P/L for each of the last ~10 trading days, from cached daily
 * closes. Days missing a close for some symbol carry that symbol's last known
 * close forward — and, crucially, BACKWARD too: a symbol whose history starts
 * mid-window used to contribute ₪0 until its first candle and then appear all
 * at once, printing its entire position value as a single day's profit. It
 * holds its earliest close flat instead, so it contributes no movement over
 * the stretch it has no data for, which is the truth.
 *
 * FX uses current rates (a small approximation over 10 days) and the QUOTE's
 * currency, matching marketValueILS — converting at the holding's declared
 * currency put this card and the portfolio board on different rates for the
 * same position.
 */
export function tenDayPL(holdings: Holding[], history: History, fx: Fx, prices: Prices = {}): TenDayPL {
  // per-listing date→close, and the union of all dates
  const priced = holdings.filter((h) => (history[cacheKey(h)]?.length ?? 0) >= 2)
  if (priced.length === 0) return { ...EMPTY, positions: holdings.length }

  const maps = new Map<string, Map<string, number>>()
  const allDates = new Set<string>()
  for (const h of priced) {
    const key = cacheKey(h)
    if (!maps.has(key)) {
      const m = new Map<string, number>()
      for (const c of history[key]) {
        m.set(c.date, c.close)
        allDates.add(c.date)
      }
      maps.set(key, m)
    }
  }
  const dates = [...allDates].sort().slice(-11) // 11 closes → 10 daily deltas
  if (dates.length < 2) return { ...EMPTY, positions: holdings.length }

  // seed every listing with its EARLIEST cached close (history is oldest-first,
  // so Map insertion order gives it) — this is the backward carry
  const lastClose = new Map<string, number>()
  for (const [key, m] of maps) {
    const first = m.values().next().value
    if (first != null) lastClose.set(key, first)
  }

  // the rate is per listing, resolved once — not once per date
  const rates = new Map<string, number>()
  for (const h of priced) {
    const key = cacheKey(h)
    if (rates.has(key)) continue
    const q = prices[key]
    rates.set(key, rateFor(q ? q.currency || h.currency : h.currency, fx))
  }

  // portfolio ₪ value at each date
  const values = dates.map((d) => {
    let v = 0
    for (const h of priced) {
      const key = cacheKey(h)
      const close = maps.get(key)!.get(d) ?? lastClose.get(key)
      if (close != null) {
        lastClose.set(key, close)
        v += h.shares * close * (rates.get(key) ?? 1)
      }
    }
    return v
  })

  const days: DailyPL[] = []
  for (let i = 1; i < dates.length; i++) days.push({ date: dates[i], pl: values[i] - values[i - 1] })
  const total = values[values.length - 1] - values[0]
  return {
    days,
    total,
    totalPct: values[0] !== 0 ? total / values[0] : null,
    hasData: true,
    covered: priced.length,
    positions: holdings.length,
  }
}
