import { voice } from '../../core/voice'

/**
 * Form primitives shared by the Manor's editors — the event edit sheet and
 * quick-add's free-form row. Local to the Manor on purpose: core is extracted
 * on contact by a SECOND console, and no other wing books an hour yet.
 */

/** a −/value/+ row on the app's 0.5 h grid; the value is pre-formatted */
export function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string
  value: string
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="mt-3">
      <span className="text-[10px] tracking-[0.2em] text-ink-dim">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onDec}
          className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
          aria-label={`${label} down`}
        >
          −
        </button>
        <div className="card flex h-11 flex-1 items-center justify-center text-[13.5px] font-semibold [font-variant-numeric:tabular-nums]">
          {value}
        </div>
        <button
          type="button"
          onClick={onInc}
          className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
          aria-label={`${label} up`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** the labelled title input, so every editor spells it the same way */
export function TitleField({
  value,
  onChange,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[10px] tracking-[0.2em] text-ink-dim">
        {voice.manor.eventSheet.titleLabel}
      </span>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(ev) => onChange(ev.target.value)}
        className="card mt-1.5 h-11 w-full px-3.5 text-[13.5px] outline-none focus:border-accent"
      />
    </label>
  )
}
