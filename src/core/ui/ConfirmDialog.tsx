interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      {/* onClick, not onPointerDown — same rule as Sheet: a drag that ends on
          the scrim is not a dismissal */}
      <div
        className="sheet-backdrop absolute inset-0 animate-[fade-in_150ms_ease-out] backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="sheet-surface relative w-full max-w-xs animate-[step-in_180ms_ease-out] rounded-2xl border p-5"
      >
        <h3 className="font-display text-lg font-bold tracking-wide">{title}</h3>
        {message && <p className="mt-1 text-sm text-ink-dim">{message}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-soft flex-1 py-2.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-cta flex-1 py-2.5 text-sm"
            style={{ '--cta-bg': 'var(--color-danger)', '--cta-fg': '#fff' } as React.CSSProperties}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
