import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { relativeDayLabel } from '../../../core/dates'
import { makeId } from '../../../core/ids'
import { useCapitalStore } from '../store'
import type { Snapshot } from '../types'
import { latestSnapshot, netWorthOf } from '../lib/networth'
import { accountLiveValue, isPriced } from '../lib/holdings'
import { ASSET_CLASSES } from '../lib/money'
import { Amount } from './Amount'

interface SnapshotSheetProps {
  open: boolean
  /** when set, edits that history entry in place (keeps its id + date) */
  editing?: Snapshot | null
  onClose: () => void
  onAddAccount: () => void
}

/** Enter current balances → appends a new point to the history/trend. In edit
 *  mode, revises an existing point instead (all fields manual). */
export function SnapshotSheet({ open, editing = null, onClose, onAddAccount }: SnapshotSheetProps) {
  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const saveSnapshot = useCapitalStore((s) => s.saveSnapshot)

  const [balances, setBalances] = useState<Record<string, string>>({})

  // prefill: the snapshot being edited, else the latest as a starting point
  useEffect(() => {
    if (!open) return
    const source = editing ?? latestSnapshot(snapshots)
    const seed: Record<string, string> = {}
    for (const a of accounts) {
      const v = source?.balances[a.id]
      seed[a.id] = v != null ? String(v) : ''
    }
    setBalances(seed)
  }, [open, editing, accounts, snapshots])

  const parsed = useMemo(() => {
    const out: Record<string, number> = {}
    for (const a of accounts) {
      // live-stamp priced accounts only for NEW snapshots — editing an old
      // point must never overwrite history with today's market value
      if (!editing && isPriced(a.id, holdings)) {
        out[a.id] = accountLiveValue(a.id, holdings, prices, fx, 0)
      } else {
        const n = parseFloat(balances[a.id] ?? '')
        out[a.id] = Number.isFinite(n) ? n : 0
      }
    }
    return out
  }, [balances, accounts, holdings, prices, fx, editing])

  const previewNetWorth = netWorthOf({ id: '', takenAt: '', balances: parsed }, accounts)

  const save = () => {
    const snap: Snapshot = editing
      ? { id: editing.id, takenAt: editing.takenAt, balances: parsed }
      : { id: makeId(), takenAt: new Date().toISOString(), balances: parsed }
    saveSnapshot(snap)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">
        {editing ? 'Edit snapshot' : 'Update balances'}
      </h2>
      <p className="mb-4 text-sm text-ink-dim">
        {editing
          ? `Revising the ${relativeDayLabel(editing.takenAt, new Date())} entry.`
          : 'Each save adds a new point to the history and trend chart.'}
      </p>

      {accounts.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-ink-dim">No accounts yet.</p>
          <button type="button" onClick={onAddAccount} className="btn-cta mt-3 px-4 py-2.5 text-sm">
            Add your first account
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => {
              const liveStamped = !editing && isPriced(a.id, holdings)
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_CLASSES[a.assetClass].color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {a.name}
                    {liveStamped && <span className="ml-1.5 text-[11px] text-accent">live</span>}
                  </span>
                  {liveStamped ? (
                    <span className="w-32 py-2 pr-2.5 text-right font-display text-base font-bold text-ink-dim">
                      <Amount value={parsed[a.id]} kind="compact" />
                    </span>
                  ) : (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₪</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={balances[a.id] ?? ''}
                        onChange={(e) => setBalances((b) => ({ ...b, [a.id]: e.target.value }))}
                        className="card w-32 py-2 pl-6 pr-2.5 text-right font-display text-base font-bold text-ink outline-none focus:border-accent/60"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!editing && (
            <button
              type="button"
              onClick={onAddAccount}
              className="mt-3 text-sm text-accent transition-opacity hover:opacity-80"
            >
              + Add account
            </button>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="text-sm text-ink-dim">Net worth</span>
            <Amount value={previewNetWorth} className="stat-num text-2xl text-ink" />
          </div>

          <button type="button" onClick={save} className="btn-cta mt-4 w-full py-3 text-base">
            {editing ? 'Save changes' : 'Save snapshot'}
          </button>
        </>
      )}
    </Sheet>
  )
}
