import type { PointerEvent } from 'react'
import type { BodyView, MuscleId } from '../../types'
import { MUSCLES } from '../../data/muscles'
import { BACK_PLATES, FRONT_PLATES, SILHOUETTE_HALF } from './paths'

const MIRROR = 'translate(200 0) scale(-1 1)'

interface BodySvgProps {
  view: BodyView
  /** fill color for a muscle plate (mode-specific) */
  colorFor: (m: MuscleId) => string
  /** glow opacity 0–1 for a muscle plate (0 = no glow) */
  glowFor: (m: MuscleId) => number
  selected: MuscleId | null
  onSelect: (m: MuscleId | null) => void
  debugRainbow?: boolean
  className?: string
}

export function BodySvg({
  view,
  colorFor,
  glowFor,
  selected,
  onSelect,
  debugRainbow,
  className,
}: BodySvgProps) {
  const plates = view === 'front' ? FRONT_PLATES : BACK_PLATES

  const fillFor = (muscle: MuscleId, i: number) =>
    debugRainbow ? `hsl(${(i * 137.5) % 360} 75% 55%)` : colorFor(muscle)

  const hot = debugRainbow ? [] : plates.filter((p) => glowFor(p.muscle) > 0)

  return (
    <svg
      viewBox="0 0 200 440"
      className={className}
      role="img"
      aria-label={view === 'front' ? 'Front view muscle map' : 'Back view muscle map'}
      onPointerDown={() => onSelect(null)}
    >
      <defs>
        <filter id={`glow-${view}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* silhouette (two mirrored halves, seam invisible) — skin-tinted via CSS vars */}
      <g
        fill="var(--sil-fill, #111318)"
        stroke="var(--sil-stroke, #232833)"
        strokeWidth="1"
        strokeLinejoin="round"
      >
        <path d={SILHOUETTE_HALF} />
        <path d={SILHOUETTE_HALF} transform={MIRROR} />
      </g>

      {/* glow layer: blurred duplicates of hot muscles only, under the crisp plates */}
      {hot.length > 0 && (
        <g filter={`url(#glow-${view})`} pointerEvents="none">
          {hot.map((p) => (
            <g key={`glow-${p.muscle}`} fill={colorFor(p.muscle)} opacity={glowFor(p.muscle)}>
              <path d={p.d} />
              {p.mirror && <path d={p.d} transform={MIRROR} />}
            </g>
          ))}
        </g>
      )}

      {/* crisp muscle plates */}
      {plates.map((p, i) => {
        const isSelected = selected === p.muscle
        const handleDown = (e: PointerEvent) => {
          e.stopPropagation()
          onSelect(isSelected ? null : p.muscle)
        }
        const shared = {
          fill: fillFor(p.muscle, i),
          stroke: isSelected ? 'var(--color-accent)' : 'var(--plate-stroke, rgb(10 11 14 / 0.55))',
          strokeWidth: isSelected ? 1.75 : 0.75,
          strokeLinejoin: 'round' as const,
          className: 'muscle-plate',
          style: { transition: 'fill 500ms ease' },
          onPointerDown: handleDown,
        }
        return (
          <g key={p.muscle}>
            <path d={p.d} {...shared}>
              <title>{MUSCLES[p.muscle].label}</title>
            </path>
            {p.mirror && (
              <path d={p.d} transform={MIRROR} {...shared}>
                <title>{MUSCLES[p.muscle].label}</title>
              </path>
            )}
          </g>
        )
      })}
    </svg>
  )
}
