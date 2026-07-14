interface RunStepProps {
  distanceKm: string
  durationMin: string
  onDistance: (v: string) => void
  onDuration: (v: string) => void
  onContinue: () => void
}

/** Run detail — both fields optional; effort still drives the strain model. */
export function RunStep({
  distanceKm,
  durationMin,
  onDistance,
  onDuration,
  onContinue,
}: RunStepProps) {
  const dist = Number(distanceKm)
  const mins = Number(durationMin)
  const pace = dist > 0 && mins > 0 ? mins / dist : 0
  const paceLabel = pace
    ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} /km`
    : null

  return (
    <div>
      <div className="flex gap-3">
        <Field
          label="Distance"
          unit="km"
          value={distanceKm}
          onChange={onDistance}
          placeholder="8"
          step="0.1"
        />
        <Field
          label="Duration"
          unit="min"
          value={durationMin}
          onChange={onDuration}
          placeholder="45"
          step="1"
        />
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        {paceLabel ? `That's ${paceLabel}.` : 'Both optional — effort is what drives the strain.'}
      </p>

      <button
        type="button"
        onClick={onContinue}
        className="btn-cta mt-6 w-full py-3.5 text-lg transition active:scale-[0.99]"
      >
        Continue
      </button>
    </div>
  )
}

function Field({
  label,
  unit,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  step: string
}) {
  return (
    <label className="flex-1">
      <span className="mb-1.5 block text-sm font-medium text-ink-dim">{label}</span>
      <span className="card flex items-center gap-2 px-3.5 py-3 focus-within:border-accent/60">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="stat-num w-full min-w-0 bg-transparent text-xl text-ink outline-none placeholder:text-ink-faint"
        />
        <span className="shrink-0 text-sm text-ink-faint">{unit}</span>
      </span>
    </label>
  )
}
