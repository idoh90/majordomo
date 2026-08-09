import { useState } from 'react'
import type { SportId } from '../../types'
import { MUSCLES } from '../../data/muscles'
import { SPORT_IDS, SPORT_MAP } from '../../data/sports'
import { voice } from '../../../../core/voice'
import { CollapseChevron } from '../../../../core/ui/CollapseToggle'
import { SportIcon } from '../icons'

interface SportStepProps {
  value: SportId | null
  onChoose: (kind: SportId) => void
  onContinue: () => void
}

/**
 * The OTHER SPORT picker: a dropdown over the sport roster, then a preview of
 * what the choice loads on the body map. The menu expands in place (not an
 * overlay) — inside a scrolling sheet an absolutely-positioned panel gets
 * clipped or orphaned from its anchor, and in-flow it just grows the sheet.
 */
export function SportStep({ value, onChoose, onContinue }: SportStepProps) {
  const [open, setOpen] = useState(value === null)
  const picked = value ? SPORT_MAP[value] : null

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-dim">
        {voice.grounds.sport.pickerLabel}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="card flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:border-accent/40"
      >
        {picked && value ? (
          <>
            <SportIcon kind={value} size={18} className="shrink-0 text-accent" />
            <span className="font-display text-base font-bold tracking-wide text-ink">
              {picked.label}
            </span>
          </>
        ) : (
          <span className="text-sm text-ink-dim">{voice.grounds.sport.pickerPlaceholder}</span>
        )}
        <span className="ml-auto text-ink-faint">
          <CollapseChevron expanded={open} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={voice.grounds.sport.pickerLabel}
          // rows are 40px, so 16.25rem cuts the seventh row in half on purpose
          // — a list that ends flush on a full row reads as complete, and six
          // sports would pass for the whole roster
          className="menu-panel mt-1.5 max-h-[16.25rem] animate-[step-in_140ms_ease-out] overflow-y-auto"
        >
          {SPORT_IDS.map((id) => {
            const selected = id === value
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChoose(id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-panel-2 ${
                  selected ? 'text-accent' : 'text-ink'
                }`}
              >
                <SportIcon
                  kind={id}
                  size={17}
                  className={`shrink-0 ${selected ? 'text-accent' : 'text-ink-dim'}`}
                />
                {SPORT_MAP[id].label}
              </button>
            )
          })}
        </div>
      )}

      {picked && !open && (
        <div className="mt-4 animate-[step-in_180ms_ease-out]">
          <div className="flex flex-wrap items-center gap-1.5">
            {picked.primary.map((m) => (
              <span key={m} className="chip bg-accent px-2.5 py-0.5 text-xs font-semibold text-bg">
                {MUSCLES[m].label}
              </span>
            ))}
            {picked.secondary.map((m) => (
              <span key={m} className="chip border border-accent/60 px-2.5 py-0.5 text-xs text-accent">
                {MUSCLES[m].label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">{voice.grounds.sport.hitsNote}</p>
        </div>
      )}

      <button
        type="button"
        disabled={!value}
        onClick={onContinue}
        className="btn-cta mt-5 w-full py-3 text-base disabled:opacity-30"
      >
        Continue
      </button>
    </div>
  )
}
