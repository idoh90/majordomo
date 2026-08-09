import type { CSSProperties } from 'react'
import { useShellStore } from '../../../../core/store/shell'
import { SKINS } from '../../../../core/ui/skins'
import { voice } from '../../../../core/voice'
import { useWorkoutStore } from '../../store'
import {
  clampPace,
  EASY_PACE_MAX,
  EASY_PACE_MIN,
  EASY_PACE_STEP,
  EFFORT_LIVE,
  PACE_MAX,
  PACE_MIN,
  pacePct,
  RUN_ZONES,
  runEffort,
  runZone,
  zoneEdges,
} from '../../lib/pace'
import { formatClock, formatKm } from '../../lib/runs'
import { strainToColor } from '../../lib/strainColor'

/** the slider's default resting pace — 5:30/km, mid-band */
export const DEFAULT_PACE = 330

/**
 * Every run field the draft carries. `heldSec` is a stored clock carried
 * VERBATIM from an edited run — the read-out keeps quoting it until the user
 * touches pace or distance, so opening a sheet and saving never quietly
 * requantizes a 44:37 into the slider's 44:40.
 */
export interface RunFields {
  distanceKm: string
  /** seconds per km, always somewhere on the band */
  paceSec: number
  heldSec: number
}

export const EMPTY_RUN_FIELDS: RunFields = { distanceKm: '', paceSec: DEFAULT_PACE, heldSec: 0 }

/** the seconds a run took, as the sheet states them: a held clock verbatim,
 *  otherwise pace × distance — no distance, no time */
export function runFieldSeconds(f: RunFields): number {
  if (f.heldSec > 0) return f.heldSec
  const km = Number(f.distanceKm)
  return Number.isFinite(km) && km > 0 ? Math.round(f.paceSec * km) : 0
}

/** the effort the prefill would hand the next step, or null while resting —
 *  a held clock means the run wasn't touched, and an untouched edit must
 *  never overwrite the effort the user actually recorded */
export function runEffortPrefill(easySec: number, f: RunFields): number | null {
  if (f.heldSec > 0) return null
  const km = Number(f.distanceKm)
  const dist = Number.isFinite(km) && km > 0 ? km : 0
  const eff = runEffort(easySec, dist, f.paceSec)
  return eff > EFFORT_LIVE ? Math.round(Math.max(1, eff)) : null
}

/** base opacity of each zone's stripe on the band, fastest first — the cool
 *  end is dimmer pigment, so it gets a little more of it */
const BAND_OPACITY = [0.28, 0.28, 0.28, 0.34, 0.4]

interface RunStepProps {
  fields: RunFields
  onChange: (patch: Partial<RunFields>) => void
  /** fires with the effort the pace earned, or null when nothing was earned */
  onContinue: (effortPrefill: number | null) => void
}

/** Run detail, 1c: distance, then a pace on a band of the user's own zones. */
export function RunStep({ fields, onChange, onContinue }: RunStepProps) {
  const easy = useWorkoutStore((s) => s.profile.easyPaceSec)
  const setProfile = useWorkoutStore((s) => s.setProfile)
  const ramp = SKINS[useShellStore((s) => s.skin)].heatRamp

  const km = Number(fields.distanceKm)
  const dist = Number.isFinite(km) && km > 0 ? km : 0
  const pace = fields.paceSec
  const seconds = runFieldSeconds(fields)
  const eff = runEffort(easy, dist, pace)
  const live = eff > EFFORT_LIVE
  const zone = runZone(easy, pace)
  const zoneColor = strainToColor(zone.strain, ramp)
  const heat = live ? strainToColor(Math.max(eff, 1.2), ramp) : 'var(--color-accent)'
  const prefill = runEffortPrefill(easy, fields)

  /** typing a distance under a clock that never had one turns the clock into
   *  a pace; any other touch of distance or pace lets go of the held clock */
  const setDistance = (v: string) => {
    const n = Number(v)
    const newDist = Number.isFinite(n) && n > 0 ? n : 0
    if (fields.heldSec > 0 && dist === 0 && newDist > 0) {
      onChange({
        distanceKm: v,
        paceSec: clampPace(Math.round(fields.heldSec / newDist)),
        heldSec: 0,
      })
      return
    }
    onChange({ distanceKm: v, heldSec: 0 })
  }
  const setPace = (p: number) => onChange({ paceSec: clampPace(p), heldSec: 0 })
  const setEasy = (delta: number) =>
    setProfile({
      easyPaceSec: Math.min(EASY_PACE_MAX, Math.max(EASY_PACE_MIN, easy + delta)),
    })

  // the band's zone stripes: [fast edge, slow edge] in band percent, per zone
  const edges = [PACE_MIN, ...zoneEdges(easy), PACE_MAX]
  const zi = RUN_ZONES.indexOf(zone)
  const activeLeft = pacePct(Math.max(PACE_MIN, edges[zi]))
  const activeWidth = Math.max(0, pacePct(Math.min(PACE_MAX, edges[zi + 1])) - activeLeft)

  const readout =
    seconds > 0 && dist > 0
      ? voice.grounds.runTotal({ time: formatClock(seconds), km: formatKm(dist) })
      : fields.heldSec > 0
        ? voice.grounds.runHeldTime({ time: formatClock(fields.heldSec) })
        : voice.grounds.runNeedsDistance

  return (
    <div
      style={
        {
          '--heat': heat,
          '--heat-soft': `color-mix(in srgb, ${heat} ${live ? 16 : 8}%, transparent)`,
          '--heat-line': live
            ? `color-mix(in srgb, ${heat} 50%, var(--color-line))`
            : 'var(--color-line)',
          '--zc': zoneColor,
        } as CSSProperties
      }
    >
      <Field
        label="Distance"
        unit="km"
        value={fields.distanceKm}
        onChange={setDistance}
        placeholder="8"
        step="0.1"
      />

      <div className="mb-0.5 mt-[18px] flex items-center justify-between">
        <span className="text-sm font-medium text-ink-dim">
          {voice.grounds.runPaceLabel}{' '}
          <span className="text-ink-faint">{voice.grounds.runUnitPerKm}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-display text-[11px] font-semibold tracking-[0.14em] text-ink-faint">
            {voice.grounds.runEasyLabel}
          </span>
          <button
            type="button"
            aria-label={voice.grounds.runEasyFasterAria}
            onClick={() => setEasy(-EASY_PACE_STEP)}
            className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-lg border border-line bg-panel-2 text-[13px] text-ink-dim"
          >
            −
          </button>
          <span className="stat-num min-w-8 text-center text-[13px] text-ink-dim">
            {formatClock(easy)}
          </span>
          <button
            type="button"
            aria-label={voice.grounds.runEasySlowerAria}
            onClick={() => setEasy(EASY_PACE_STEP)}
            className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-lg border border-line bg-panel-2 text-[13px] text-ink-dim"
          >
            +
          </button>
        </span>
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="stat-num text-4xl leading-none transition-colors duration-300"
          style={{ color: 'var(--heat)' }}
        >
          {formatClock(pace)}
        </span>
        <span className="text-[13px] text-ink-faint">{voice.grounds.runUnitPerKm}</span>
        <span
          className="ml-auto inline-flex rounded-pill border px-2.5 py-[3px] font-display text-[11px] font-bold tracking-[0.1em] transition-colors duration-300"
          style={{
            background: 'var(--heat-soft)',
            borderColor: 'var(--heat-line)',
            color: 'var(--zc)',
          }}
        >
          {voice.grounds.runZoneNames[zone.id]}
        </span>
      </div>

      <div className="relative mt-1.5 h-[46px] select-none">
        <div className="pointer-events-none absolute inset-x-[13px] top-1/2 h-2.5 -translate-y-1/2">
          <div className="absolute inset-0 rounded-pill border border-line bg-bg" />
          {RUN_ZONES.map((z, i) => {
            const left = pacePct(Math.max(PACE_MIN, edges[i]))
            const width = Math.max(0, pacePct(Math.min(PACE_MAX, edges[i + 1])) - left)
            return (
              <div
                key={z.id}
                className={`absolute inset-y-[2px] ${i === 0 ? 'rounded-l-pill' : ''} ${
                  i === RUN_ZONES.length - 1 ? 'rounded-r-pill' : ''
                }`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: strainToColor(z.strain, ramp),
                  opacity: BAND_OPACITY[i],
                }}
              />
            )
          })}
          <div
            className="absolute inset-y-[2px] rounded-pill opacity-90 transition-all duration-300"
            style={{
              left: `${activeLeft}%`,
              width: `${activeWidth}%`,
              background: 'var(--zc)',
              boxShadow: '0 0 14px var(--heat-soft)',
            }}
          />
          <div
            className="absolute top-1/2 h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-panel transition-colors duration-300"
            style={{
              left: `${pacePct(pace)}%`,
              borderColor: 'var(--heat)',
              boxShadow: `0 0 18px -2px color-mix(in srgb, var(--heat) ${live ? 45 : 30}%, transparent), 0 0 42px -8px color-mix(in srgb, var(--heat) 25%, transparent)`,
            }}
          >
            <div
              className="absolute inset-1.5 rounded-full transition-colors duration-300"
              style={{ background: 'var(--heat)' }}
            />
          </div>
        </div>
        <input
          type="range"
          min={PACE_MIN}
          max={PACE_MAX}
          step={5}
          value={pace}
          onChange={(e) => setPace(Number(e.target.value))}
          aria-label={voice.grounds.runPaceLabel}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="mt-0.5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setPace(pace - 1)}
          className="flex h-[30px] w-[34px] cursor-pointer items-center justify-center rounded-lg border border-line bg-panel-2 text-sm text-ink-dim"
        >
          {voice.grounds.runFineFaster}
        </button>
        <span className="flex-1 text-center text-[11px] tracking-[0.05em] text-ink-faint">
          {voice.grounds.runSliderHint}
        </span>
        <button
          type="button"
          onClick={() => setPace(pace + 1)}
          className="flex h-[30px] w-[34px] cursor-pointer items-center justify-center rounded-lg border border-line bg-panel-2 text-sm text-ink-dim"
        >
          {voice.grounds.runFineSlower}
        </button>
      </div>

      <div
        aria-hidden
        className="mt-3 h-[26px] overflow-hidden"
        style={{ transform: `scaleY(${(0.5 + 0.05 * eff).toFixed(2)})`, transformOrigin: 'center' }}
      >
        <svg
          width="200%"
          height="100%"
          viewBox="0 0 240 28"
          preserveAspectRatio="none"
          className="block"
          style={{ animation: `run-pulse ${(2.4 - 0.19 * eff).toFixed(2)}s linear infinite` }}
        >
          <path
            d="M0 14 H22 L28 6 L34 22 L40 14 H70 L75 11 L79 14 H120"
            stroke="var(--heat)"
            strokeWidth="2"
            fill="none"
            opacity="0.9"
          />
          <path
            d="M0 14 H22 L28 6 L34 22 L40 14 H70 L75 11 L79 14 H120"
            stroke="var(--heat)"
            strokeWidth="2"
            fill="none"
            opacity="0.9"
            transform="translate(120 0)"
          />
        </svg>
      </div>

      <p className="mt-2.5 text-xs text-ink-faint">{readout}</p>

      <div className="mt-2 flex items-center gap-[7px]">
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: 'var(--heat)', boxShadow: '0 0 8px var(--heat-soft)' }}
        />
        <span className="text-xs text-ink-dim">
          {prefill !== null
            ? voice.grounds.runEffortPrefill({ n: prefill })
            : voice.grounds.runEffortIdle}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onContinue(prefill)}
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
