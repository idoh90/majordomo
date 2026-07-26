interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** the control has nothing to switch between — render it inert rather than
   *  live, so it stops promising a view its data cannot produce */
  disabled?: boolean
}

/** Skin-driven segmented control — material lives in `.seg`/`.seg-btn` CSS. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`seg ${className}`}
      role="tablist"
      style={disabled ? { opacity: 0.4 } : undefined}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          disabled={disabled}
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className="seg-btn disabled:cursor-not-allowed"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
