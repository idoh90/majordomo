import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { ConfirmDialog } from '../../../core/ui/ConfirmDialog'
import { useCapitalStore } from '../store'
import type { Holding } from '../types'
import { ASSET_CLASSES, formatILS } from '../lib/money'
import { latestSnapshot } from '../lib/networth'

interface HoldingSheetProps {
  open: boolean
  editing: Holding | null
  onClose: () => void
  onAddAccount: () => void
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS']

export function HoldingSheet({ open, editing, onClose, onAddAccount }: HoldingSheetProps) {
  const accounts = useCapitalStore((s) => s.accounts)
  const holdings = useCapitalStore((s) => s.holdings)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const addHolding = useCapitalStore((s) => s.addHolding)
  const updateHolding = useCapitalStore((s) => s.updateHolding)
  const deleteHolding = useCapitalStore((s) => s.deleteHolding)

  // holdings attach to non-liability accounts (investments, crypto, etc.)
  const eligible = useMemo(
    () => accounts.filter((a) => !ASSET_CLASSES[a.assetClass].liability),
    [accounts],
  )

  const [symbol, setSymbol] = useState('')
  const [exchange, setExchange] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [accountId, setAccountId] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Seed on OPEN only. Keyed on `eligible` too, adding an account from this
  // sheet's own "Add account" button reset every field the user had typed.
  useEffect(() => {
    if (!open) return
    setSymbol(editing?.symbol ?? '')
    setExchange(editing?.exchange ?? '')
    setCurrency(editing?.currency ?? 'USD')
    setShares(editing ? String(editing.shares) : '')
    setCostBasis(editing ? String(editing.costBasis) : '')
    setAccountId(editing?.accountId ?? '')
    setConfirming(false)
  }, [open, editing]) // `eligible` deliberately absent — see above

  // …but the account list is allowed to move under it: pick the first eligible
  // account whenever the current pick is gone (or was never made)
  useEffect(() => {
    if (!open) return
    setAccountId((id) => (eligible.some((a) => a.id === id) ? id : (eligible[0]?.id ?? '')))
  }, [open, eligible])

  const sharesNum = parseFloat(shares)
  const costNum = parseFloat(costBasis)
  const canSave =
    symbol.trim().length > 0 && accountId && Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(costNum)
  const isDirty =
    symbol !== (editing?.symbol ?? '') ||
    exchange !== (editing?.exchange ?? '') ||
    currency !== (editing?.currency ?? 'USD') ||
    shares !== (editing ? String(editing.shares) : '') ||
    costBasis !== (editing ? String(editing.costBasis) : '')

  const save = () => {
    if (!canSave) return
    const patch = {
      accountId,
      symbol: symbol.trim().toUpperCase(),
      exchange: exchange.trim() || undefined,
      currency,
      shares: sharesNum,
      costBasis: costNum,
    }
    if (editing) updateHolding(editing.id, patch)
    else addHolding(patch)
    // fetch the new symbol's quote + FX right away so the board never shows
    // an unconverted cost basis masquerading as ₪ (no-ops without a key)
    void useCapitalStore.getState().refreshPrices()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} dirty={isDirty}>
      <h2 className="mb-4 font-display text-xl font-bold tracking-wide">
        {editing ? 'Edit holding' : 'Add holding'}
      </h2>

      {eligible.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-ink-dim">Add an investment account first to hold positions in.</p>
          <button type="button" onClick={onAddAccount} className="btn-cta mt-3 px-4 py-2.5 text-sm">
            Add account
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol" value={symbol} onChange={(v) => setSymbol(v.toUpperCase())} placeholder="VOO" autoFocus />
            <Field label="Exchange" value={exchange} onChange={setExchange} placeholder="US · or LSE, XETR…" optional />
            <NumField label="Shares" value={shares} onChange={setShares} />
            <NumField label={`Cost / share (${currency})`} value={costBasis} onChange={setCostBasis} />
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Israeli kranot / TASE funds have no free price feed — track those as a{' '}
            <span className="text-ink-dim">TASE funds account balance</span> instead. Note TASE
            quotes prices in <span className="text-ink-dim">agorot</span> (₪ × 100); cost here
            must be in whole {currency}.
          </p>

          <label className="mb-1.5 mt-3 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            Currency
          </label>
          <div className="flex gap-1.5">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`card flex-1 py-2 text-sm transition-colors ${
                  currency === c ? 'border-accent bg-accent/10 text-accent' : 'text-ink-dim hover:text-ink'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <label className="mb-1.5 mt-3 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            Account
          </label>
          <div className="flex flex-col gap-1.5">
            {eligible.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                className={`card flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  accountId === a.id ? 'border-accent bg-accent/10 text-accent' : 'text-ink-dim hover:text-ink'
                }`}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_CLASSES[a.assetClass].color }} />
                {a.name}
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            {editing && (
              <button type="button" onClick={() => setConfirming(true)} className="btn-soft px-4 py-3 text-sm text-danger">
                Delete
              </button>
            )}
            <button type="button" disabled={!canSave} onClick={save} className="btn-cta flex-1 py-3 text-base disabled:opacity-30">
              {editing ? 'Save' : 'Add holding'}
            </button>
          </div>
        </>
      )}

      {editing && (
        <ConfirmDialog
          open={confirming}
          title="Delete holding?"
          message={deleteMessage(editing, holdings, snapshots, accounts)}
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            deleteHolding(editing.id)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

/**
 * Deleting an account's LAST holding un-prices it: the account's value falls
 * back to its latest snapshot balance — which was live-stamped while the
 * holding existed, so the net-worth total barely moves. Say so up front,
 * or the delete looks like it "didn't refresh".
 */
function deleteMessage(
  editing: Holding,
  holdings: Holding[],
  snapshots: Parameters<typeof latestSnapshot>[0],
  accounts: { id: string; name: string }[],
): string {
  const base = `Removes ${editing.symbol.toUpperCase()} from the portfolio.`
  const others = holdings.some((h) => h.accountId === editing.accountId && h.id !== editing.id)
  if (others) return base
  const fallback = latestSnapshot(snapshots)?.balances[editing.accountId] ?? 0
  if (fallback === 0) return base
  const name = accounts.find((a) => a.id === editing.accountId)?.name ?? 'The account'
  return `${base} ${name} then reads its saved balance (${formatILS(fallback)}) again — run "Update balances" and set it if that's stale.`
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  optional,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  optional?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal text-ink-faint/70">opt</span>}
      </label>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="card w-full px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
      />
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="card w-full px-3 py-2.5 font-display text-lg font-bold text-ink outline-none focus:border-accent/60"
      />
    </div>
  )
}
