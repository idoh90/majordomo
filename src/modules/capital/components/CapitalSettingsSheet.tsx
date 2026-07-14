import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { useCapitalStore } from '../store'

interface CapitalSettingsSheetProps {
  open: boolean
  onClose: () => void
}

/** Twelve Data API key entry. The key is stored in localStorage (batman-capital),
 *  used only to fetch quotes — it grants no account access. */
export function CapitalSettingsSheet({ open, onClose }: CapitalSettingsSheetProps) {
  const apiKey = useCapitalStore((s) => s.apiKey)
  const setApiKey = useCapitalStore((s) => s.setApiKey)
  const refreshPrices = useCapitalStore((s) => s.refreshPrices)
  const updatedAt = useCapitalStore((s) => s.pricesUpdatedAt)

  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(apiKey)
      setReveal(false)
    }
  }, [open, apiKey])

  const save = () => {
    setApiKey(draft)
    if (draft.trim()) void refreshPrices()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">Live prices</h2>
      <p className="mb-4 text-sm text-ink-dim">
        Paste a free{' '}
        <span className="text-ink">Twelve Data</span> API key to fetch quotes for your holdings.
        Stored on this device only; it grants no access to any account.
      </p>

      <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        API key
      </label>
      <div className="relative">
        <input
          type={reveal ? 'text' : 'password'}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="your Twelve Data key"
          className="card w-full py-2.5 pl-3 pr-16 font-mono text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-wide text-ink-faint hover:text-ink"
        >
          {reveal ? 'hide' : 'show'}
        </button>
      </div>

      {updatedAt && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Last fetched {new Date(updatedAt).toLocaleString()}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <a
          href="https://twelvedata.com/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-soft px-4 py-3 text-center text-sm"
        >
          Get a free key
        </a>
        <button type="button" onClick={save} className="btn-cta flex-1 py-3 text-base">
          Save &amp; fetch
        </button>
      </div>
    </Sheet>
  )
}
