import type { NetWorthDelta } from '../lib/networth'
import { formatPercent } from '../lib/money'
import { Amount } from './Amount'

interface VaultProps {
  netWorth: number
  assets: number
  liabilities: number
  delta: NetWorthDelta
  hasData: boolean
}

/** The hero: total net worth, dramatic, with the move since last snapshot. */
export function Vault({ netWorth, assets, liabilities, delta, hasData }: VaultProps) {
  const up = delta.absolute >= 0
  const tone = up ? 'text-accent' : 'text-danger'

  return (
    <div className="panel relative overflow-hidden p-6 sm:p-8">
      {/* faint accent wash so the vault reads as the centerpiece */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="card-title">The Vault · Net worth</div>

      {hasData ? (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
            <Amount value={netWorth} className="stat-num font-display text-5xl leading-none text-ink sm:text-6xl" />
            <div className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
              <span aria-hidden className="text-base">{up ? '▲' : '▼'}</span>
              <Amount value={delta.absolute} kind="delta" />
              {delta.fraction !== null && (
                <span className="text-ink-faint">({formatPercent(delta.fraction)})</span>
              )}
              <span className="text-ink-faint">vs last</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-sm">
            <Figure label="Assets" value={assets} />
            <Figure label="Liabilities" value={liabilities} negative={liabilities > 0} />
          </div>
        </>
      ) : (
        <p className="mt-3 max-w-sm text-sm text-ink-dim">
          No balances yet. Add your accounts, then log a snapshot to start charting the cave's
          worth.
        </p>
      )}
    </div>
  )
}

function Figure({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className="mt-0.5">
        {negative && <span className="text-ink-faint">−</span>}
        <Amount value={value} kind="compact" className="stat-num text-lg text-ink" />
      </div>
    </div>
  )
}
