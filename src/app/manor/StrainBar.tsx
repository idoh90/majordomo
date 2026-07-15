import { useShellStore } from '../../core/store/shell'
import { SKINS } from '../../core/ui/skins'
import { strainToColor } from '../../modules/training/lib/strainColor'
import { voice } from '../../core/voice'
import { HOT_CAP, type DayStrain } from './strain'

/**
 * The day's heat: a track filled by how many muscles are hot, painted with
 * those muscles' own strain colors (so the skin's heat ramp carries over from
 * the body map for free). Future days are the same bar at half strength — the
 * soreness is forecast, not yet earned.
 *
 * Renders as spans only: the month cells and the mobile day chips are
 * <button>s, whose content model is phrasing content.
 */
export function StrainBar({ day, height = 5 }: { day: DayStrain; height?: number }) {
  const ramp = SKINS[useShellStore((s) => s.skin)].heatRamp
  const shown = day.hot.slice(0, HOT_CAP)
  const colors = shown.map((h) => strainToColor(h.strain, ramp))

  return (
    <span
      title={voice.manor.strain.tooltip({
        names: day.hot.map((h) => h.label),
        forecast: day.forecast,
      })}
      className="block w-full overflow-hidden rounded-pill"
      style={{
        height,
        background: 'color-mix(in srgb, var(--color-line) 60%, transparent)',
      }}
    >
      <span
        className="block h-full rounded-pill"
        style={{
          width: `${(shown.length / HOT_CAP) * 100}%`,
          background:
            colors.length === 0
              ? 'transparent'
              : colors.length === 1
                ? colors[0]
                : `linear-gradient(90deg, ${colors.join(', ')})`,
          opacity: day.forecast ? 0.5 : 1,
          transition: 'width 220ms ease-out',
        }}
      />
    </span>
  )
}
