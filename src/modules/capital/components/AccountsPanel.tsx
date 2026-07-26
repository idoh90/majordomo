import type { Account, Holding, Snapshot } from '../types'
import { ASSET_CLASSES } from '../lib/money'
import { accountLiveValue, isDegraded, isPriced, type Fx, type Prices } from '../lib/holdings'
import { voice } from '../../../core/voice'
import { Amount } from './Amount'

interface AccountsPanelProps {
  accounts: Account[]
  latest: Snapshot | null
  holdings: Holding[]
  prices: Prices
  fx: Fx
  onEdit: (a: Account) => void
  onAdd: () => void
}

export function AccountsPanel({ accounts, latest, holdings, prices, fx, onEdit, onAdd }: AccountsPanelProps) {
  const valueOf = (a: Account) =>
    accountLiveValue(a.id, holdings, prices, fx, latest?.balances[a.id] ?? 0)
  const rows = [...accounts].sort((a, b) => valueOf(b) - valueOf(a))

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="card-title">Accounts</h3>
        <button type="button" onClick={onAdd} className="text-sm text-accent transition-opacity hover:opacity-80">
          + Add
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">No accounts yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((a) => {
            const val = valueOf(a)
            const isDebt = ASSET_CLASSES[a.assetClass].liability
            const priced = isPriced(a.id, holdings)
            // priced but unvaluable = showing the last snapshot balance, not a
            // live one; the same 'held' wording the snapshot stamp uses
            const held = priced && isDegraded(a.id, holdings, prices, fx)
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onEdit(a)}
                  className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-0 hover:bg-panel-2"
                >
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_CLASSES[a.assetClass].color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{a.name}</span>
                    <span className="block text-[11px] text-ink-faint">
                      {ASSET_CLASSES[a.assetClass].label}
                      {priced &&
                        (held ? (
                          <span className="cursor-help" title={voice.capital.stampHeldTitle}>
                            {' · '}
                            {voice.capital.stampHeld}
                          </span>
                        ) : (
                          <span className="text-accent"> · {voice.capital.stampLive}</span>
                        ))}
                    </span>
                  </span>
                  <span className={`tabular-nums ${isDebt ? 'text-danger' : 'text-ink'}`}>
                    {isDebt && <span className="text-ink-faint">−</span>}
                    <Amount value={val} kind="compact" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
