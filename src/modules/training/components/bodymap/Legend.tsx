import { HEAT_STOPS, type HeatRamp } from '../../lib/strainColor'
import { BAND_MAX, VOLUME_STOPS } from '../../lib/volume'
import { voice } from '../../../../core/voice'

function gradientFor(stops: [number, string][], max: number): string {
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${(v / max) * 100}%`).join(', ')})`
}

export function Legend({ ramp = 'standard' }: { ramp?: HeatRamp }) {
  return (
    <div className="w-full max-w-[280px]">
      <div className="chip h-1.5" style={{ background: gradientFor(HEAT_STOPS[ramp], 10) }} />
      <div className="mt-1.5 flex justify-between font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        <span>Recovered</span>
        <span>Worked</span>
        <span>Fried</span>
      </div>
    </div>
  )
}

/**
 * The volume ramp, read left to right: starved → in range → at the ceiling.
 *
 * A four-swatch key would say what four flat colours meant, but the plates no
 * longer hold four colours — they hold a position on this gradient, so the key
 * has to be the gradient. The notches are the landmarks the bands are named
 * for; the labels sit in the band they name, sized to it, so the eye can see
 * that "in range" is most of the scale and the ceiling is a sliver at the end.
 */
const BANDS: { key: 'under' | 'optimal' | 'pushing' | 'over'; span: number }[] = [
  { key: 'under', span: 1 },
  { key: 'optimal', span: 1 },
  { key: 'pushing', span: 1 },
  { key: 'over', span: BAND_MAX - 3 },
]

export function VolumeLegend({ ramp = 'standard' }: { ramp?: HeatRamp }) {
  return (
    <div className="w-full max-w-[280px]">
      <div
        className="chip relative h-2 overflow-hidden"
        style={{ background: gradientFor(VOLUME_STOPS[ramp], BAND_MAX) }}
      >
        {/* the landmark notches — cut in the panel's own colour so they read as
            a break in the ramp on every skin rather than a colour of their own */}
        {[1, 2, 3].map((pos) => (
          <span
            key={pos}
            aria-hidden
            className="absolute inset-y-0 w-px"
            style={{
              left: `${(pos / BAND_MAX) * 100}%`,
              background: 'var(--panel-bg, var(--color-panel))',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {BANDS.map((b, i) => (
          <span
            key={b.key}
            className={`whitespace-nowrap ${i === BANDS.length - 1 ? 'text-right' : 'text-center'}`}
            style={{ flex: `${b.span} 1 0` }}
          >
            {voice.grounds.volumeLegend[b.key]}
          </span>
        ))}
      </div>
    </div>
  )
}
