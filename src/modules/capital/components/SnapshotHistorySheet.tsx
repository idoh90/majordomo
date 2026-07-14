import { useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { ConfirmDialog } from '../../../core/ui/ConfirmDialog'
import { relativeDayLabel, timeLabel } from '../../../core/dates'
import { useCapitalStore } from '../store'
import type { Snapshot } from '../types'
import { netWorthOf } from '../lib/networth'
import { formatDelta } from '../lib/money'
import { Amount } from './Amount'

interface SnapshotHistorySheetProps {
  open: boolean
  onClose: () => void
  onEdit: (s: Snapshot) => void
}

/** Every saved balance snapshot — the list the trend chart draws from.
 *  Tap to edit, × to delete. Newest first. */
export function SnapshotHistorySheet({ open, onClose, onEdit }: SnapshotHistorySheetProps) {
  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const deleteSnapshot = useCapitalStore((s) => s.deleteSnapshot)
  const [deleting, setDeleting] = useState<Snapshot | null>(null)

  const rows = [...snapshots].reverse() // stored oldest-first
  const now = new Date()

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">Snapshot history</h2>
      <p className="mb-4 text-sm text-ink-dim">
        Every point on the trend chart. Tap one to edit its balances.
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">No snapshots yet.</p>
      ) : (
        <ul className="flex max-h-[55dvh] flex-col overflow-y-auto">
          {rows.map((s, i) => {
            const value = netWorthOf(s, accounts)
            const prev = rows[i + 1] // next in the list = previous in time
            const delta = prev ? value - netWorthOf(prev, accounts) : null
            return (
              <li key={s.id} className="flex items-center gap-2 border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => onEdit(s)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left hover:bg-panel-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {relativeDayLabel(s.takenAt, now)}
                      <span className="ml-1.5 text-xs text-ink-faint">{timeLabel(s.takenAt)}</span>
                    </span>
                    {delta !== null && delta !== 0 && (
                      <span className={`block text-[11px] ${delta > 0 ? 'text-accent' : 'text-danger'}`}>
                        {formatDelta(delta)} vs previous
                      </span>
                    )}
                  </span>
                  <Amount value={value} kind="compact" className="shrink-0 tabular-nums text-ink" />
                </button>
                <button
                  type="button"
                  aria-label="Delete snapshot"
                  onClick={() => setDeleting(s)}
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-panel-2 hover:text-danger"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete snapshot?"
        message={
          deleting
            ? `Removes the ${relativeDayLabel(deleting.takenAt, now)} point from the history and trend chart.`
            : undefined
        }
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteSnapshot(deleting.id)
          setDeleting(null)
        }}
      />
    </Sheet>
  )
}
