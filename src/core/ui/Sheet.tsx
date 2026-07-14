import { useEffect, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
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
export function Sheet({ open, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    lockBodyScroll()
    return unlockBodyScroll
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="sheet-backdrop absolute inset-0 animate-[fade-in_200ms_ease-out] backdrop-blur-[2px]"
        onPointerDown={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-surface absolute inset-x-0 bottom-0 max-h-[92dvh] animate-[sheet-up_280ms_cubic-bezier(0.22,1,0.36,1)] overflow-y-auto rounded-t-3xl border-t px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[540px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:animate-[fade-in_180ms_ease-out] lg:rounded-2xl lg:border lg:px-7 lg:pb-7 lg:pt-5"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 rounded-full bg-panel-3 lg:hidden" />
        {children}
      </div>
    </div>
  )
}
