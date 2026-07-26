import { useEffect, useState, type ReactNode } from 'react'
import { voice } from '../voice'
import { ConfirmDialog } from './ConfirmDialog'

interface SheetProps {
  open: boolean
  onClose: () => void
  /** true while the sheet holds work the store doesn't have yet — a backdrop
   *  click or Esc then asks before throwing it away (Save is unaffected) */
  dirty?: boolean
  children: ReactNode
}

// Body scroll lock refcounted across ALL Sheet instances. A per-sheet
// save/restore breaks when sheets nest (e.g. snapshot → add-account): React
// runs every cleanup before every setup on a commit, so a sheet can capture
// 'hidden' as the value to "restore" and wedge scrolling after all close.
let scrollLocks = 0
function lockBodyScroll() {
  if (++scrollLocks === 1) document.body.style.overflow = 'hidden'
}
function unlockBodyScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = ''
}

/** Bottom sheet on mobile, centered modal on desktop. */
export function Sheet({ open, onClose, dirty = false, children }: SheetProps) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    lockBodyScroll()
    return unlockBodyScroll
  }, [open])

  // a stale confirm must never greet the next opening
  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // the confirm owns Esc while it's up: dismiss it, keep the draft
      if (confirming) setConfirming(false)
      else if (dirty) setConfirming(true)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dirty, confirming])

  if (!open) return null
  const requestClose = () => (dirty ? setConfirming(true) : onClose())
  return (
    <div className="fixed inset-0 z-50">
      {/* onClick, NOT onPointerDown: a press that starts on the backdrop and
          ends on the surface (a slip, or a drag out of an input) must not count
          as a dismissal — and a half-typed sheet must not vanish under a thumb.
          cursor-pointer is not decoration: iOS Safari only delivers click on a
          non-interactive element that looks clickable. */}
      <div
        className="sheet-backdrop absolute inset-0 animate-[fade-in_200ms_ease-out] backdrop-blur-[2px] cursor-pointer"
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-surface absolute inset-x-0 bottom-0 max-h-[92dvh] animate-[sheet-up_280ms_cubic-bezier(0.22,1,0.36,1)] overflow-y-auto rounded-t-3xl border-t px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 md:inset-auto md:left-1/2 md:top-1/2 md:w-[540px] md:-translate-x-1/2 md:-translate-y-1/2 md:animate-[fade-in_180ms_ease-out] md:rounded-2xl md:border md:px-7 md:pb-7 md:pt-5"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 rounded-full bg-panel-3 md:hidden" />
        {children}
      </div>
      <ConfirmDialog
        open={confirming}
        title={voice.ui.discard.title}
        message={voice.ui.discard.body}
        confirmLabel={voice.ui.discard.confirm}
        onConfirm={() => {
          setConfirming(false)
          onClose()
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
