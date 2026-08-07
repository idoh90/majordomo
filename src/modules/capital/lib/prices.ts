import type { Quote } from '../types'

// Twelve Data client. Runs from the browser (their API sends CORS headers). Free
// tier: 8 req/min, 800/day — we batch quotes into one call per exchange and fetch
// one FX rate per distinct currency, so a refresh is ~1–3 calls.

const BASE = 'https://api.twelvedata.com'

/**
 * Cache key for a LISTING, not a ticker. VOD is a $9 ADR on NASDAQ and a 7200p
 * line on the LSE; keyed by bare symbol they overwrite each other and one
 * position gets priced — and stamped into net worth — with the other's quote.
 * Exchange-less symbols keep the bare-symbol key, so US listings already in the
 * cache stay valid.
 */
export function listingKey(symbol: string, exchange?: string): string {
  const sym = symbol.trim().toUpperCase()
  const ex = exchange?.trim().toUpperCase()
  return ex ? `${ex}:${sym}` : sym
}

/** Some listings quote in fractional units — LSE in pence (GBp/GBX), TASE in
 *  agorot (ILA). Convert to the major unit so FX conversion stays sane. */
export function minorUnitDivisor(currency: string): number {
  const c = currency.toUpperCase()
  return c === 'GBX' || currency === 'GBp' || c === 'ILA' ? 100 : 1
}

function toMajorUnit(price: number, prevClose: number, currency: string) {
  const c = currency.toUpperCase()
  if (minorUnitDivisor(currency) === 100) {
    return { price: price / 100, prevClose: prevClose / 100, currency: c === 'ILA' ? 'ILS' : 'GBP' }
  }
  return { price, prevClose, currency }
}

export interface QuoteFetch {
  quotes: Record<string, Quote> // key = listingKey(symbol, exchange)
  errors: string[]
}

interface SymbolRef {
  symbol: string
  exchange?: string
}

export async function fetchQuotes(refs: SymbolRef[], apiKey: string): Promise<QuoteFetch> {
  const quotes: Record<string, Quote> = {}
  const errors: string[] = []

  // group by exchange — Twelve Data applies one `exchange` param to the whole batch
  const groups = new Map<string, string[]>()
  for (const r of refs) {
    const sym = r.symbol.trim().toUpperCase()
    if (!sym) continue
    const ex = r.exchange?.trim() ?? ''
    const arr = groups.get(ex) ?? []
    if (!arr.includes(sym)) arr.push(sym)
    groups.set(ex, arr)
  }

  const at = new Date().toISOString()

  for (const [ex, syms] of groups) {
    const params = new URLSearchParams({ symbol: syms.join(','), apikey: apiKey })
    if (ex) params.set('exchange', ex)

    let json: Record<string, unknown>
    try {
      const res = await fetch(`${BASE}/quote?${params.toString()}`)
      json = (await res.json()) as Record<string, unknown>
    } catch {
      errors.push(`${syms.join(', ')}: network error`)
      continue
    }

    // a top-level error object (bad key, rate limit) applies to the whole batch
    if ((json as { status?: string }).status === 'error') {
      errors.push(String((json as { message?: string }).message ?? 'request failed'))
      continue
    }

    // single symbol → the quote object directly; multiple → keyed by symbol
    const entries = (syms.length === 1 ? { [syms[0]]: json } : json) as Record<
      string,
      Record<string, unknown>
    >

    for (const sym of syms) {
      const q = entries[sym]
      if (!q || (q as { status?: string }).status === 'error' || (q as { code?: number }).code) {
        errors.push(`${sym}: ${(q as { message?: string })?.message ?? 'no data'}`)
        continue
      }
      const rawPrice = parseFloat(String(q.close))
      const rawPrev = parseFloat(String(q.previous_close))
      if (!Number.isFinite(rawPrice)) {
        errors.push(`${sym}: no price`)
        continue
      }
      const norm = toMajorUnit(
        rawPrice,
        Number.isFinite(rawPrev) ? rawPrev : rawPrice,
        String(q.currency ?? 'USD'),
      )
      quotes[listingKey(sym, ex)] = {
        price: norm.price,
        prevClose: norm.prevClose,
        currency: norm.currency,
        name: q.name ? String(q.name) : undefined,
        marketOpen: q.is_market_open === true,
        at,
      }
    }
  }

  return { quotes, errors }
}

export interface Candle {
  date: string // 'YYYY-MM-DD'
  close: number
}

export interface TimeSeriesFetch {
  history: Record<string, Candle[]> // listingKey → oldest-first daily closes
  errors: string[]
}

/** Daily closes for the last `days` trading sessions per symbol (one call each). */
export async function fetchTimeSeries(
  refs: { symbol: string; exchange?: string }[],
  apiKey: string,
  days = 11,
): Promise<TimeSeriesFetch> {
  const history: Record<string, Candle[]> = {}
  const errors: string[] = []
  const seen = new Set<string>()

  for (const r of refs) {
    const sym = r.symbol.trim().toUpperCase()
    const key = listingKey(sym, r.exchange)
    if (!sym || seen.has(key)) continue
    seen.add(key)
    const params = new URLSearchParams({
      symbol: sym,
      interval: '1day',
      outputsize: String(days),
      apikey: apiKey,
    })
    if (r.exchange?.trim()) params.set('exchange', r.exchange.trim())
    try {
      const res = await fetch(`${BASE}/time_series?${params.toString()}`)
      const json = (await res.json()) as {
        status?: string
        message?: string
        meta?: { currency?: string }
        values?: unknown[]
      }
      if (json.status === 'error' || !Array.isArray(json.values)) {
        errors.push(`${sym}: ${json.message ?? 'no history'}`)
        continue
      }
      // the SAME normalization /quote applies: an LSE series comes back in
      // pence, a TASE one in agorot. Without this the closes are 100× the
      // quote they sit beside, and the 10-day P/L reads 100× the real move.
      const div = minorUnitDivisor(String(json.meta?.currency ?? ''))
      const candles = (json.values as { datetime: string; close: string }[])
        .map((v) => ({ date: v.datetime, close: parseFloat(v.close) / div }))
        .filter((c) => Number.isFinite(c.close))
        .reverse() // API returns newest-first; store oldest-first
      history[key] = candles
    } catch {
      errors.push(`${sym}: history network error`)
    }
  }
  return { history, errors }
}

export interface FxFetch {
  fx: Record<string, number> // currency → ILS
  errors: string[]
}

/**
 * Keyless FX fallback — ECB daily reference rates via frankfurter.dev (free,
 * CORS-open, no key). Used when there's no Twelve Data key, or its
 * /exchange_rate call left gaps. Daily granularity is plenty for converting
 * holdings to ₪.
 */
export async function fetchFxFallback(currencies: string[]): Promise<FxFetch> {
  const fx: Record<string, number> = {}
  const errors: string[] = []
  for (const cur of currencies) {
    const c = cur.toUpperCase()
    if (c === 'ILS' || fx[c] != null) continue
    try {
      const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${c}&symbols=ILS`)
      const json = (await res.json()) as { rates?: Record<string, number> }
      const rate = json.rates?.ILS
      if (typeof rate === 'number' && Number.isFinite(rate)) fx[c] = rate
      else errors.push(`${c}/ILS: no rate`)
    } catch {
      errors.push(`${c}/ILS: network error`)
    }
  }
  return { fx, errors }
}

export async function fetchFxToILS(currencies: string[], apiKey: string): Promise<FxFetch> {
  const fx: Record<string, number> = { ILS: 1 }
  const errors: string[] = []
  for (const cur of currencies) {
    const c = cur.toUpperCase()
    if (c === 'ILS' || fx[c]) continue
    const params = new URLSearchParams({ symbol: `${c}/ILS`, apikey: apiKey })
    try {
      const res = await fetch(`${BASE}/exchange_rate?${params.toString()}`)
      const json = (await res.json()) as { rate?: number; message?: string }
      const rate = typeof json.rate === 'number' ? json.rate : parseFloat(String(json.rate))
      if (Number.isFinite(rate)) fx[c] = rate
      else errors.push(`${c}/ILS: ${json.message ?? 'no rate'}`)
    } catch {
      errors.push(`${c}/ILS: network error`)
    }
  }
  return { fx, errors }
}
