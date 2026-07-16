import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { voice } from '../../../core/voice'
import { useCapitalStore } from '../store'
import { reconcilePaydayMarkers } from '../lib/payday'

interface CapitalSettingsSheetProps {
  open: boolean
  onClose: () => void
}

/** The Ledger's settings: Twelve Data API key (stored in localStorage
 *  (majordomo-capital), used only to fetch quotes — it grants no account
 *  access), payday marker day, amount blur, and prices-on-open. */
export function CapitalSettingsSheet({ open, onClose }: CapitalSettingsSheetProps) {
  const apiKey = useCapitalStore((s) => s.apiKey)
  const setApiKey = useCapitalStore((s) => s.setApiKey)
  const refreshPrices = useCapitalStore((s) => s.refreshPrices)
  const updatedAt = useCapitalStore((s) => s.pricesUpdatedAt)
  const paydayDay = useCapitalStore((s) => s.paydayDay)
  const setPaydayDay = useCapitalStore((s) => s.setPaydayDay)
  const blurAmounts = useCapitalStore((s) => s.blurAmounts)
  const toggleBlur = useCapitalStore((s) => s.toggleBlur)
  const autoRefreshPrices = useCapitalStore((s) => s.autoRefreshPrices)
  const setAutoRefreshPrices = useCapitalStore((s) => s.setAutoRefreshPrices)

  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [paydayDraft, setPaydayDraft] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(apiKey)
      setReveal(false)
      setPaydayDraft(paydayDay > 0 ? String(paydayDay) : '')
    }
  }, [open, apiKey, paydayDay])

  const save = () => {
    setApiKey(draft)
    if (draft.trim()) void refreshPrices()
    const day = Math.round(Number(paydayDraft))
    const next = Number.isFinite(day) && day >= 1 && day <= 31 ? day : 0
    setPaydayDay(next)
    reconcilePaydayMarkers(next, Date.now())
    onClose()
  }

  const sectionTitle = 'mb-1 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint'

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-4 font-display text-xl font-bold tracking-wide">
        {voice.capital.settings.title}
      </h2>

      {/* ---- live prices (the original sheet) ---- */}
      <div className={sectionTitle}>API key</div>
      <p className="mb-2 text-sm text-ink-dim">
        Paste a free <span className="text-ink">Twelve Data</span> API key to fetch quotes for
        your holdings. Stored on this device only; it grants no access to any account.
      </p>
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

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <div className={sectionTitle}>{voice.capital.settings.autoRefreshLabel}</div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {voice.capital.settings.autoRefreshBlurb}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoRefreshPrices}
          onClick={() => setAutoRefreshPrices(!autoRefreshPrices)}
          className={`shrink-0 rounded-pill border px-3 py-1 text-xs transition-colors ${
            autoRefreshPrices
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line text-ink-dim hover:text-ink'
          }`}
        >
          {autoRefreshPrices ? 'On' : 'Off'}
        </button>
      </div>

      {/* ---- payday ---- */}
      <div className="mt-3 border-t border-line pt-3">
        <div className={sectionTitle}>{voice.capital.settings.paydayLabel}</div>
        <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
          {voice.capital.settings.paydayBlurb}
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={paydayDraft}
          onChange={(e) => setPaydayDraft(e.target.value)}
          placeholder={voice.capital.settings.paydayOff}
          className="card w-28 py-2 pl-3 pr-2 text-sm text-ink outline-none [font-variant-numeric:tabular-nums] placeholder:text-ink-faint focus:border-accent/60"
        />
      </div>

      {/* ---- privacy ---- */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <div className={sectionTitle}>{voice.capital.settings.privacyLabel}</div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {voice.capital.settings.privacyBlurb}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={blurAmounts}
          onClick={toggleBlur}
          className={`shrink-0 rounded-pill border px-3 py-1 text-xs transition-colors ${
            blurAmounts
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line text-ink-dim hover:text-ink'
          }`}
        >
          {blurAmounts ? 'On' : 'Off'}
        </button>
      </div>

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
          Save
        </button>
      </div>
    </Sheet>
  )
}
