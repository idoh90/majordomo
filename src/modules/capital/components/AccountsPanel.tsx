import type { Account, Holding, Snapshot } from '../types'
import { ASSET_CLASSES } from '../lib/money'
import { accountLiveValue, isDegraded, isPriced, type Fx, type Prices } from '../lib/holdings'
import { accountFigure } from '../lib/networth'
import { voice } from '../../../core/voice'
import { Amount } from './Amount'
import { Hinted } from '../../../core/ui/Hint'

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
  // the figure the row prints: a debt's magnitude, since the row draws its own
  // faint '−' in front. Feeding it the raw balance printed "−-₪400K" in two
  // different minus glyphs for anyone who typed the mortgage the way their bank
  // app shows it — which read as a rendering glitch rather than as the ₪800,000
  // error it stood for. Sorting on it too, so a debt sits where the same debt
  // typed the other way would.
  const valueOf = (a: Account) =>
    accountFigure(a.assetClass, accountLiveValue(a.id, holdings, prices, fx, latest?.balances[a.id] ?? 0))
  const rows = [...accounts].sort((a, b) => valueOf(b) - valueOf(a))

  return (
    <div className="panel p-4">
      <Hinted tip={voice.hints.capital.accounts}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="card-title">Accounts</h3>
        <button type="button" onClick={onAdd} className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] text-sm text-accent transition-opacity hover:opacity-80">
          + Add
        </button>
      </div>
      </Hinted>

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
