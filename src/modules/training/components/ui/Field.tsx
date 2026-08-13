/** Numeric entry with a unit tag — the run step's field, extracted when the
 *  effort step became its second consumer. String-valued: empty means "not
 *  recorded", exactly the run-fields convention. */
export function Field({
  label,
  unit,
  value,
  onChange,
  placeholder,
  step,
  max,
}: {
  label?: string
  unit: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  step: string
  /** the largest entry that could be real — a 75 in a seconds box is a
   *  mistyped minute, a 300 in a sets box is a mistyped something */
  max?: number
}) {
  return (
    <label className="flex-1">
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-dim">{label}</span>}
      <span className="card flex items-center gap-2 px-3.5 py-3 focus-within:border-accent/60">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max={max}
          step={step}
          value={value}
          placeholder={placeholder}
          // refuse an impossible entry outright rather than take it and drop it
          // at save (the old num() quietly discarded anything <= 0, losing the
          // run detail) — and never clamp, which stores a number nobody typed
          onChange={(e) => {
            const next = e.target.value
            if (next !== '' && Number(next) < 0) return
            if (next !== '' && max !== undefined && Number(next) > max) return
            onChange(next)
          }}
          className="stat-num w-full min-w-0 bg-transparent text-xl text-ink outline-none placeholder:text-ink-faint"
        />
        <span className="shrink-0 text-sm text-ink-faint">{unit}</span>
      </span>
    </label>
  )
}
