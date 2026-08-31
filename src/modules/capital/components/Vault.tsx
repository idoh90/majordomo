import type { NetWorthDelta } from '../lib/networth'
import { voice } from '../../../core/voice'
import { formatPercent } from '../lib/money'
import { Amount } from './Amount'
import { Hinted } from '../../../core/ui/Hint'

interface VaultProps {
  netWorth: number
  assets: number
  liabilities: number
  /** null when there is nothing to compare against — the row is then omitted
   *  rather than shown as a meaningless '▲ ₪0 vs last' */
  delta: NetWorthDelta | null
  hasData: boolean
  /** currencies awaiting a quote/₪ rate — those accounts read from their last
   *  saved balance, and the Vault says so rather than showing a live-looking total */
  degraded?: string[]
  /** the trend, hosted in the Vault's own recess */
  chart?: React.ReactNode
}

/**
 * The hero: total net worth, dramatic, with the move since last snapshot — and
 * the trend beneath it in a recess.
 *
 * The figure and its history used to be two panels that happened to sit near
 * each other, so the number the Vault shouted and the line the chart drew were
 * presented as separate facts. They are the same fact at two resolutions.
 */
export function Vault({
  netWorth,
  assets,
  liabilities,
  delta,
  hasData,
  degraded = [],
  chart,
}: VaultProps) {
  const up = (delta?.absolute ?? 0) >= 0
  const tone = up ? 'text-accent' : 'text-danger'

  return (
    <div
      className="panel panel-lit p-6 sm:p-8"
      style={{ ['--lit-accent' as string]: 'var(--color-w-ledger)' }}
    >
      <Hinted tip={voice.hints.capital.vault}>
        <div className="card-title">The Vault · Net worth</div>
      </Hinted>

      {hasData ? (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
            <Amount value={netWorth} className="stat-num font-display text-5xl leading-none text-ink sm:text-6xl" />
            {delta && (
              <div className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
                <span aria-hidden className="text-base">{up ? '▲' : '▼'}</span>
                <Amount value={delta.absolute} kind="delta" />
                {delta.fraction !== null && (
                  <span className="text-ink-faint">({formatPercent(delta.fraction)})</span>
                )}
                <span className="text-ink-faint">vs last</span>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-sm">
            <Figure label="Assets" value={assets} />
            <Figure label="Liabilities" value={liabilities} negative={liabilities > 0} />
          </div>

          {degraded.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              {voice.capital.liveDegraded(degraded)}
            </p>
          )}

          {chart && <div className="trough mt-5 px-3 pb-2 pt-3 sm:px-4">{chart}</div>}
        </>
      ) : (
        <p className="mt-3 max-w-sm text-sm text-ink-dim">{voice.capital.vaultEmpty}</p>
      )}
    </div>
  )
}

/** `negative` draws the minus itself, in the faint colour — so the figure beside
 *  it is a MAGNITUDE. Handing it a signed one printed "-₪400K" under LIABILITIES,
 *  a garble that looked like a font problem and was in fact the whole net worth
 *  being wrong by twice the mortgage. */
function Figure({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className="mt-0.5">
        {negative && <span className="text-ink-faint">−</span>}
        <Amount value={negative ? Math.abs(value) : value} kind="compact" className="stat-num text-lg text-ink" />
      </div>
    </div>
  )
}
