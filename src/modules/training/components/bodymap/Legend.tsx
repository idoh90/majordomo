import { HEAT_STOPS, type HeatRamp } from '../../lib/strainColor'
import { VOLUME_COLORS, type VolumeStatus } from '../../lib/volume'

function gradientFor(ramp: HeatRamp): string {
  return `linear-gradient(90deg, ${HEAT_STOPS[ramp]
    .map(([v, c]) => `${c} ${v * 10}%`)
    .join(', ')})`
}

export function Legend({ ramp = 'standard' }: { ramp?: HeatRamp }) {
  return (
    <div className="w-full max-w-[280px]">
      <div className="chip h-1.5" style={{ background: gradientFor(ramp) }} />
      <div className="mt-1.5 flex justify-between font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        <span>Recovered</span>
        <span>Worked</span>
        <span>Fried</span>
      </div>
    </div>
  )
}

const VOLUME_LEGEND: { status: VolumeStatus; label: string }[] = [
  { status: 'under', label: 'Under' },
  { status: 'optimal', label: 'Optimal' },
  { status: 'pushing', label: 'Pushing' },
  { status: 'over', label: 'Over' },
]

export function VolumeLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {VOLUME_LEGEND.map((v) => (
        <span key={v.status} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: VOLUME_COLORS[v.status] }}
          />
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {v.label}
          </span>
        </span>
      ))}
    </div>
  )
}
