import { voice } from '../../../../core/voice'

/** past this many minutes per km it isn't a running pace any more */
const WALKING_PACE_MIN_PER_KM = 30

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
  // round to whole seconds FIRST, then split — rounding the remainder alone
  // prints 5:60 for a 5.999 pace
  const totalSec = Math.round(pace * 60)
  const paceClock = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
  const paceLine = !pace
    ? voice.grounds.runOptional
    : pace > WALKING_PACE_MIN_PER_KM
      ? voice.grounds.runPaceWalking
      : voice.grounds.runPace({ pace: paceClock })

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

      <p className="mt-2 text-xs text-ink-faint">{paceLine}</p>

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
          // refuse a negative outright rather than take it and drop it at save
          // (the old num() quietly discarded anything <= 0, losing the run detail)
          onChange={(e) => {
            const next = e.target.value
            if (next !== '' && Number(next) < 0) return
            onChange(next)
          }}
          className="stat-num w-full min-w-0 bg-transparent text-xl text-ink outline-none placeholder:text-ink-faint"
        />
        <span className="shrink-0 text-sm text-ink-faint">{unit}</span>
      </span>
    </label>
  )
}
