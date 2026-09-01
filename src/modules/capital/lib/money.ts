import type { AssetClass } from '../types'

// en-US (not he-IL) so the ₪ sits LEFT of the number with no RTL/bidi marks —
// he-IL currency scrambles word order when embedded in the LTR English UI.
const ILS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
})

const ILS_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'ILS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/**
 * Intl writes a hyphen-minus; every sign this app draws by hand — the faint '−'
 * before a debt, formatDelta's, formatPercent's — is a proper U+2212. A negative
 * total is an ordinary reading for anyone whose mortgage outweighs their
 * savings, and it must not look like a stray character beside the '−₪400K' on
 * the row below it. Leading sign only: there is nothing else in ₪ output to hit.
 */
function minus(s: string): string {
  return s.startsWith('-') ? `−${s.slice(1)}` : s
}

/** ₪482,000 */
export function formatILS(n: number): string {
  // Math.round(-0.4) is -0, which Intl faithfully prints as a signed zero.
  // NaN is deliberately NOT swallowed — a figure that cannot be computed should
  // read as broken, not as nothing owed.
  const r = Math.round(n)
  return minus(ILS.format(Object.is(r, -0) ? 0 : r))
}

/** ₪482K — for tight spots (tiles, axis labels) */
export function formatCompact(n: number): string {
  return minus(ILS_COMPACT.format(n).replace('ILS', '₪').replace('₪ ', '₪'))
}

/** signed, compact: +₪4.2K / −₪1.1K */
export function formatDelta(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${formatCompact(Math.abs(n))}`
}

export function formatPercent(fraction: number, digits = 1): string {
  const sign = fraction > 0 ? '+' : fraction < 0 ? '−' : ''
  return `${sign}${Math.abs(fraction * 100).toFixed(digits)}%`
}

export interface AssetClassMeta {
  label: string
  /** true for liabilities — subtracted from net worth, never part of allocation */
  liability?: boolean
  /** allocation swatch; fixed hex, legible on both dark and light skins */
  color: string
}

export const ASSET_CLASSES: Record<AssetClass, AssetClassMeta> = {
  cash: { label: 'Cash & bank', color: '#4ea1ff' },
  investment: { label: 'Investments', color: '#f5b301' },
  crypto: { label: 'Crypto', color: '#a06bff' },
  'tase-fund': { label: 'TASE funds', color: '#2fb8a6' },
  pension: { label: 'Pension & gemel', color: '#6fbf3b' },
  'real-estate': { label: 'Real estate', color: '#e8783f' },
  debt: { label: 'Debts', liability: true, color: '#e8481f' },
}

export const ASSET_CLASS_ORDER: AssetClass[] = [
  'cash',
  'investment',
  'crypto',
  'tase-fund',
  'pension',
  'real-estate',
  'debt',
]
