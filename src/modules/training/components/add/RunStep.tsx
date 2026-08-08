import { SegmentedControl } from '../../../../core/ui/SegmentedControl'
import { voice } from '../../../../core/voice'
import { formatClock, formatKm, WALKING_PACE_MIN_PER_KM } from '../../lib/runs'

/** a clock can be typed outright, or arrived at through a pace */
export type RunEntry = 'time' | 'pace'

/** every run field the draft carries, all kept as strings — empty = not recorded */
export interface RunFields {
  distanceKm: string
  durationMin: string
  durationSec: string
  paceMin: string
  paceSec: string
  entry: RunEntry
}

export const EMPTY_RUN_FIELDS: RunFields = {
  distanceKm: '',
  durationMin: '',
  durationSec: '',
  paceMin: '',
  paceSec: '',
  entry: 'time',
}

/** a minute box and a second box read as one clock — 0 when neither was typed */
export function clockSeconds(min: string, sec: string): number {
  const m = Number(min)
  const s = Number(sec)
  const total = (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0)
  return total > 0 ? total : 0
}

/** the reverse, for prefilling the other entry when the user switches */
export function splitClock(totalSec: number): { min: string; sec: string } {
  const s = Math.round(totalSec)
  return { min: String(Math.floor(s / 60)), sec: String(s % 60).padStart(2, '0') }
}

/**
 * The seconds a run took, as the ACTIVE entry states it. In pace mode a time
 * only exists once there is a distance to multiply — no distance, no time, and
 * the read-out says so rather than banking a silent zero.
 */
export function runFieldSeconds(f: RunFields): number {
  if (f.entry === 'time') return clockSeconds(f.durationMin, f.durationSec)
  const pace = clockSeconds(f.paceMin, f.paceSec)
  const km = Number(f.distanceKm)
  return pace > 0 && Number.isFinite(km) && km > 0 ? Math.round(pace * km) : 0
}

interface RunStepProps {
  fields: RunFields
  onChange: (patch: Partial<RunFields>) => void
  onContinue: () => void
}

/** Run detail — every field optional; effort still drives the strain model. */
export function RunStep({ fields, onChange, onContinue }: RunStepProps) {
  const km = Number(fields.distanceKm)
  const dist = Number.isFinite(km) && km > 0 ? km : 0
  const seconds = runFieldSeconds(fields)
  const paceSec = dist > 0 && seconds > 0 ? seconds / dist : 0

  const readout = (() => {
    if (fields.entry === 'pace') {
      const typedPace = clockSeconds(fields.paceMin, fields.paceSec)
      if (typedPace > 0 && dist === 0) return voice.grounds.runNeedsDistance
      if (typedPace > 0 && typedPace / 60 > WALKING_PACE_MIN_PER_KM)
        return voice.grounds.runPaceWalking
      if (seconds > 0)
        return voice.grounds.runTotal({ time: formatClock(seconds), km: formatKm(dist) })
      return voice.grounds.runOptional
    }
    if (!paceSec) return voice.grounds.runOptional
    if (paceSec / 60 > WALKING_PACE_MIN_PER_KM) return voice.grounds.runPaceWalking
    return voice.grounds.runPace({ pace: formatClock(paceSec) })
  })()

  /** switching entry carries the value across, so the two never disagree */
  const switchEntry = (entry: RunEntry) => {
    if (entry === fields.entry) return
    if (entry === 'pace') {
      const typed = clockSeconds(fields.durationMin, fields.durationSec)
      if (typed > 0 && dist > 0) {
        const { min, sec } = splitClock(typed / dist)
        onChange({ entry, paceMin: min, paceSec: sec })
        return
      }
      onChange({ entry })
      return
    }
    const total = runFieldSeconds({ ...fields, entry: 'pace' })
    if (total > 0) {
      const { min, sec } = splitClock(total)
      onChange({ entry, durationMin: min, durationSec: sec })
      return
    }
    onChange({ entry })
  }

  return (
    <div>
      <Field
        label="Distance"
        unit="km"
        value={fields.distanceKm}
        onChange={(v) => onChange({ distanceKm: v })}
        placeholder="8"
        step="0.1"
      />

      <SegmentedControl
        className="mt-4"
        value={fields.entry}
        onChange={switchEntry}
        options={[
          { value: 'time', label: voice.grounds.runEntryTime },
          { value: 'pace', label: voice.grounds.runEntryPace },
        ]}
      />

      <div className="mt-3">
        <span className="mb-1.5 block text-sm font-medium text-ink-dim">
          {fields.entry === 'time' ? voice.grounds.runDurationLabel : voice.grounds.runPaceLabel}
          {fields.entry === 'pace' && (
            <span className="ml-1 text-ink-faint">{voice.grounds.runUnitPerKm}</span>
          )}
        </span>
        <div className="flex gap-3">
          {fields.entry === 'time' ? (
            <>
              <Field
                unit={voice.grounds.runUnitMin}
                value={fields.durationMin}
                onChange={(v) => onChange({ durationMin: v })}
                placeholder="44"
                step="1"
              />
              <Field
                unit={voice.grounds.runUnitSec}
                value={fields.durationSec}
                onChange={(v) => onChange({ durationSec: v })}
                placeholder="00"
                step="1"
                max={59}
              />
            </>
          ) : (
            <>
              <Field
                unit={voice.grounds.runUnitMin}
                value={fields.paceMin}
                onChange={(v) => onChange({ paceMin: v })}
                placeholder="5"
                step="1"
              />
              <Field
                unit={voice.grounds.runUnitSec}
                value={fields.paceSec}
                onChange={(v) => onChange({ paceSec: v })}
                placeholder="30"
                step="1"
                max={59}
              />
            </>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-faint">{readout}</p>

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
  max,
}: {
  label?: string
  unit: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  step: string
  /** seconds boxes stop at 59 — a 75 is a mistyped minute, not 75 seconds */
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
