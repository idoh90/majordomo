import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { ConfirmDialog } from '../../../core/ui/ConfirmDialog'
import { useCapitalStore } from '../store'
import type { Account, AssetClass } from '../types'
import { ASSET_CLASS_ORDER, ASSET_CLASSES } from '../lib/money'

interface AccountSheetProps {
  open: boolean
  /** null = add mode */
  editing: Account | null
  onClose: () => void
}

export function AccountSheet({ open, editing, onClose }: AccountSheetProps) {
  const addAccount = useCapitalStore((s) => s.addAccount)
  const updateAccount = useCapitalStore((s) => s.updateAccount)
  const deleteAccount = useCapitalStore((s) => s.deleteAccount)

  const [name, setName] = useState('')
  const [assetClass, setAssetClass] = useState<AssetClass>('cash')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setAssetClass(editing?.assetClass ?? 'cash')
    setConfirming(false)
  }, [open, editing])

  const canSave = name.trim().length > 0

  const save = () => {
    if (!canSave) return
    if (editing) updateAccount(editing.id, { name: name.trim(), assetClass })
    else addAccount(name.trim(), assetClass)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-4 font-display text-xl font-bold tracking-wide">
        {editing ? 'Edit account' : 'Add account'}
      </h2>

      <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        Name
      </label>
      <input
        type="text"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Bank Hapoalim, IBKR, Mortgage"
        className="card mb-4 w-full px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
      />

      <label className="mb-1.5 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        Type
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {ASSET_CLASS_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAssetClass(c)}
            className={`card flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
              assetClass === c ? 'border-accent bg-accent/10 text-accent' : 'text-ink-dim hover:text-ink'
            }`}
          >
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_CLASSES[c].color }} />
            {ASSET_CLASSES[c].label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {editing && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-soft px-4 py-3 text-sm text-danger"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          disabled={!canSave}
          onClick={save}
          className="btn-cta flex-1 py-3 text-base disabled:opacity-30"
        >
          {editing ? 'Save' : 'Add account'}
        </button>
      </div>

      {editing && (
        <ConfirmDialog
          open={confirming}
          title="Delete account?"
          message={`Removes "${editing.name}" and its balances from every snapshot. Past net-worth points will be recomputed.`}
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            deleteAccount(editing.id)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}
