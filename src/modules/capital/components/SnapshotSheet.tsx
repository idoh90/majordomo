import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { localDayKey, relativeDayLabel } from '../../../core/dates'
import { makeId } from '../../../core/ids'
import { useCapitalStore } from '../store'
import type { Snapshot } from '../types'
import { latestSnapshot, netWorthOf } from '../lib/networth'
import { accountLiveValueILSStrict, isPriced } from '../lib/holdings'
import { ASSET_CLASSES } from '../lib/money'
import { track } from '../../../core/telemetry'
import { voice } from '../../../core/voice'
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
  const [showProblems, setShowProblems] = useState(false)

  // Prefill on OPEN only. It used to re-seed whenever `accounts` or `snapshots`
  // changed — and this sheet has a "+ Add account" button of its own, so adding
  // an account mid-entry silently reset every field to the previous snapshot's
  // numbers. Since a prefilled field looks normal, the next Save then stamped
  // last week's balances as today's point.
  useEffect(() => {
    if (!open) return
    const source = editing ?? latestSnapshot(snapshots)
    const seed: Record<string, string> = {}
    for (const a of accounts) {
      const v = source?.balances[a.id]
      seed[a.id] = v != null ? String(v) : ''
    }
    setBalances(seed)
    setShowProblems(false)
  }, [open, editing]) // `accounts`/`snapshots` deliberately absent — see above

  // an account added while the sheet is open gets a field; nothing else moves
  useEffect(() => {
    if (!open) return
    setBalances((b) => {
      const next = { ...b }
      for (const a of accounts) if (!(a.id in next)) next[a.id] = ''
      return next
    })
  }, [open, accounts])

  const parsed = useMemo(() => {
    const out: Record<string, number> = {}
    const held: Record<string, boolean> = {}
    const manual: Record<string, boolean> = {}
    const prev = latestSnapshot(snapshots)
    for (const a of accounts) {
      // live-stamp priced accounts only for NEW snapshots — editing an old
      // point must never overwrite history with today's market value.
      // STRICT: a missing quote or ₪ rate must not stamp cost basis or a
      // rate-1 currency mixup into history (updating only the cash used to
      // silently rewrite the portfolio stamp with garbage) — hold the last
      // saved value instead and say so.
      const live = !editing && isPriced(a.id, holdings)
        ? accountLiveValueILSStrict(a.id, holdings, prices, fx)
        : null
      const prior = prev?.balances[a.id]
      // …but "hold the last saved value" needs there to BE one. With no quote
      // and no prior snapshot the old code held ₪0 — a number nobody entered,
      // written permanently into history, with no field to correct it. Such an
      // account gets an ordinary input instead.
      if (!editing && isPriced(a.id, holdings) && (live != null || prior != null)) {
        held[a.id] = live == null
        out[a.id] = live ?? prior ?? 0
      } else {
        manual[a.id] = true
        const n = parseFloat(balances[a.id] ?? '')
        out[a.id] = Number.isFinite(n) ? n : 0
      }
    }
    return { out, held, manual }
  }, [balances, accounts, holdings, prices, fx, editing, snapshots])

  const stamped = parsed.out

  // differs-from-the-store, so a backdrop brush asks before binning a column of
  // retyped balances. Live-stamped rows are excluded — they have no input, and
  // a live figure differing from the stored one is not something the user typed.
  const isDirty = useMemo(() => {
    const source = editing ?? latestSnapshot(snapshots)
    return accounts.some((a) => {
      if (!parsed.manual[a.id]) return false
      const stored = source?.balances[a.id]
      return (balances[a.id] ?? '') !== (stored != null ? String(stored) : '')
    })
  }, [accounts, balances, editing, snapshots, parsed])

  // A debt row asks what is OWED — a magnitude. A bank app shows a mortgage as
  // −400,000 though, so that is what people type, and the app took it: the debt
  // was ADDED, and ₪50,000 in the bank beside a ₪400,000 mortgage read ₪450,000
  // in the biggest type on the screen. Refused, not silently flipped, for the
  // reason the budget refuses one: clamping is the same quiet rewrite, and this
  // row has to teach its convention once. The maths can no longer be fooled
  // either (netWorthContribution), so an estate that already holds one reads
  // right while this asks for it to be written the house's way.
  const badDebts = useMemo(
    () =>
      accounts
        .filter((a) => parsed.manual[a.id] && ASSET_CLASSES[a.assetClass].liability && stamped[a.id] < 0)
        .map((a) => a.id),
    [accounts, parsed, stamped],
  )

  const previewNetWorth = netWorthOf({ id: '', takenAt: '', balances: stamped }, accounts)

  const save = () => {
    if (badDebts.length > 0) {
      setShowProblems(true)
      return
    }
    // one snapshot per local day: saving again today revises today's point
    // instead of stacking a second one on the trend chart
    const latest = latestSnapshot(snapshots)
    const sameDay =
      !editing && latest && localDayKey(latest.takenAt) === localDayKey(new Date())
    const snap: Snapshot = editing
      ? { id: editing.id, takenAt: editing.takenAt, balances: stamped }
      : { id: sameDay ? latest.id : makeId(), takenAt: new Date().toISOString(), balances: stamped }
    saveSnapshot(snap)
    track('snapshot_saved')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} dirty={isDirty}>
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
              const liveStamped = !parsed.manual[a.id]
              const isHeld = liveStamped && parsed.held[a.id]
              // the debt row wears the minus itself, so the convention is
              // legible before a single digit is typed
              const isDebt = ASSET_CLASSES[a.assetClass].liability
              const marked = showProblems && badDebts.includes(a.id)
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_CLASSES[a.assetClass].color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {a.name}
                    {liveStamped &&
                      (isHeld ? (
                        <span
                          className="ml-1.5 cursor-help text-[11px] text-ink-faint"
                          title={voice.capital.stampHeldTitle}
                        >
                          {voice.capital.stampHeld}
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[11px] text-accent">
                          {voice.capital.stampLive}
                        </span>
                      ))}
                  </span>
                  {liveStamped ? (
                    <span className="w-32 py-2 pr-2.5 text-right font-display text-base font-bold text-ink-dim">
                      <Amount value={stamped[a.id]} kind="compact" />
                    </span>
                  ) : (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-faint">
                        {isDebt ? '−₪' : '₪'}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={isDebt ? 0 : undefined}
                        aria-invalid={marked || undefined}
                        value={balances[a.id] ?? ''}
                        onChange={(e) => setBalances((b) => ({ ...b, [a.id]: e.target.value }))}
                        className={`card w-32 py-2 ${isDebt ? 'pl-8' : 'pl-6'} pr-2.5 text-right font-display text-base font-bold text-ink outline-none focus:border-accent/60 ${
                          marked ? 'border-danger' : ''
                        }`}
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

          {showProblems && badDebts.length > 0 && (
            <p className="mt-3 text-[12px] leading-relaxed text-danger">
              {voice.capital.debtNoMinus}
            </p>
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
