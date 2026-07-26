import type { Account, AssetClass, Holding, Snapshot } from '../types'
import { ASSET_CLASSES } from './money'
import { accountDegradedCurrencies, accountLiveValue, type Fx, type Prices } from './holdings'

/** Net worth of one snapshot = Σ assets − Σ debts. */
export function netWorthOf(snapshot: Snapshot, accounts: Account[]): number {
  let total = 0
  for (const a of accounts) {
    const bal = snapshot.balances[a.id] ?? 0
    total += ASSET_CLASSES[a.assetClass].liability ? -bal : bal
  }
  return total
}

export function assetsOf(snapshot: Snapshot, accounts: Account[]): number {
  let total = 0
  for (const a of accounts) {
    if (ASSET_CLASSES[a.assetClass].liability) continue
    total += snapshot.balances[a.id] ?? 0
  }
  return total
}

export function liabilitiesOf(snapshot: Snapshot, accounts: Account[]): number {
  let total = 0
  for (const a of accounts) {
    if (ASSET_CLASSES[a.assetClass].liability) total += snapshot.balances[a.id] ?? 0
  }
  return total
}

/** Snapshots are stored oldest-first; the latest is the current state. */
export function latestSnapshot(snapshots: Snapshot[]): Snapshot | null {
  return snapshots.length ? snapshots[snapshots.length - 1] : null
}

export interface NetWorthPoint {
  id: string
  takenAt: string
  value: number
}

export function netWorthSeries(snapshots: Snapshot[], accounts: Account[]): NetWorthPoint[] {
  return snapshots.map((s) => ({ id: s.id, takenAt: s.takenAt, value: netWorthOf(s, accounts) }))
}

export interface NetWorthDelta {
  absolute: number
  /** fraction vs the comparison point; null when there's nothing to compare */
  fraction: number | null
}

/** Change from the previous snapshot to the latest one. */
export function latestDelta(series: NetWorthPoint[]): NetWorthDelta {
  if (series.length < 2) return { absolute: 0, fraction: null }
  const curr = series[series.length - 1].value
  const prev = series[series.length - 2].value
  const absolute = curr - prev
  return { absolute, fraction: prev !== 0 ? absolute / Math.abs(prev) : null }
}

export interface AllocationSlice {
  assetClass: AssetClass
  value: number
  fraction: number
}

/** Asset allocation of a snapshot (liabilities excluded), largest first. */
export function allocation(snapshot: Snapshot, accounts: Account[]): AllocationSlice[] {
  const totals = new Map<AssetClass, number>()
  for (const a of accounts) {
    if (ASSET_CLASSES[a.assetClass].liability) continue
    const bal = snapshot.balances[a.id] ?? 0
    if (bal !== 0) totals.set(a.assetClass, (totals.get(a.assetClass) ?? 0) + bal)
  }
  return allocationFromTotals(totals)
}

function allocationFromTotals(totals: Map<AssetClass, number>): AllocationSlice[] {
  const assets = [...totals.values()].reduce((s, v) => s + v, 0)
  return [...totals.entries()]
    .map(([assetClass, value]) => ({ assetClass, value, fraction: assets > 0 ? value / assets : 0 }))
    .sort((a, b) => b.value - a.value)
}

/* ---- live variants: holdings override manual balances for the current view ---- */

/** Current value of one account (Σ live market value if priced, else latest balance). */
export function liveAccountValue(
  account: Account,
  holdings: Holding[],
  prices: Prices,
  fx: Fx,
  latest: Snapshot | null,
): number {
  return accountLiveValue(account.id, holdings, prices, fx, latest?.balances[account.id] ?? 0)
}

export interface LiveNetWorth {
  netWorth: number
  assets: number
  liabilities: number
  slices: AllocationSlice[]
  /** currencies whose missing quote/₪ rate held priced accounts at their last
   *  saved balance — empty when every priced account valued live */
  degraded: string[]
}

export function liveNetWorth(
  accounts: Account[],
  holdings: Holding[],
  prices: Prices,
  fx: Fx,
  latest: Snapshot | null,
): LiveNetWorth {
  let assets = 0
  let liabilities = 0
  const totals = new Map<AssetClass, number>()
  const degraded = new Set<string>()
  for (const a of accounts) {
    const v = liveAccountValue(a, holdings, prices, fx, latest)
    for (const c of accountDegradedCurrencies(a.id, holdings, prices, fx)) degraded.add(c)
    if (ASSET_CLASSES[a.assetClass].liability) {
      liabilities += v
    } else {
      assets += v
      if (v !== 0) totals.set(a.assetClass, (totals.get(a.assetClass) ?? 0) + v)
    }
  }
  return {
    netWorth: assets - liabilities,
    assets,
    liabilities,
    slices: allocationFromTotals(totals),
    degraded: [...degraded].sort(),
  }
}

/**
 * The delta the Vault and the briefing print, or **null when there is nothing to
 * compare against** — the row is then omitted rather than printed as a
 * meaningless '▲ ₪0 vs last'. Two ways to have no basis:
 *   · no holdings and a single snapshot — there is no prior point;
 *   · holdings whose live side fell back to the latest snapshot (missing quote
 *     or ₪ rate), so the comparison is that snapshot against itself.
 * With holdings the delta is live-vs-last-snapshot (the market move since the
 * save); without, it's the Phase-1 last-vs-previous-snapshot move.
 */
export function displayDelta(opts: {
  live: LiveNetWorth
  series: NetWorthPoint[]
  latest: Snapshot | null
  snapshotNetWorth: number
  hasHoldings: boolean
}): NetWorthDelta | null {
  const { live, series, latest, snapshotNetWorth, hasHoldings } = opts
  if (hasHoldings && latest) {
    const absolute = live.netWorth - snapshotNetWorth
    if (absolute === 0 && live.degraded.length > 0) return null
    return { absolute, fraction: snapshotNetWorth !== 0 ? absolute / Math.abs(snapshotNetWorth) : null }
  }
  return series.length >= 2 ? latestDelta(series) : null
}
