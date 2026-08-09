import { useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { BodyView, MuscleId } from '../../types'
import { MUSCLES } from '../../data/muscles'
import { BACK_PLATES, FRONT_PLATES, SILHOUETTE_HALF } from './paths'

const MIRROR = 'translate(200 0) scale(-1 1)'

/** Did this element take focus the keyboard way? `:focus-visible` is the
 *  browser's own answer; if it can't be asked, show the ring — a missing
 *  indicator is the worse failure. */
function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

interface BodySvgProps {
  view: BodyView
  /** fill color for a muscle plate (mode-specific) */
  colorFor: (m: MuscleId) => string
  /** glow opacity 0–1 for a muscle plate (0 = no glow) */
  glowFor: (m: MuscleId) => number
  selected: MuscleId | null
  onSelect: (m: MuscleId | null) => void
  /** optional pick overlay: rings a plate to say it is CHOSEN, independent of
   *  its fill (which always states strain). Two channels, because once the
   *  plates carry real strain a sore muscle and a picked one look alike. */
  markFor?: (m: MuscleId) => 'primary' | 'secondary' | null
  debugRainbow?: boolean
  className?: string
  /** a copy that is scenery (Ghost's floor reflection): no roles, no tab stops
   *  — a focusable element inside an aria-hidden wrapper is a trap */
  decorative?: boolean
}

export function BodySvg({
  view,
  colorFor,
  glowFor,
  selected,
  onSelect,
  markFor,
  debugRainbow,
  className,
  decorative = false,
}: BodySvgProps) {
  const plates = view === 'front' ? FRONT_PLATES : BACK_PLATES
  const [focused, setFocused] = useState<MuscleId | null>(null)
  // Hover is a MOUSE affordance and nothing else. A touch pointer also fires
  // enter/leave, and honouring it would leave a ring stranded on the last
  // plate a thumb crossed — so the pointer type is the gate, not a media query
  // (a hybrid laptop is both, per-event).
  const [hovered, setHovered] = useState<MuscleId | null>(null)

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

      {/* crisp muscle plates. The GROUP is the control, not each path: a
          mirrored pair is one muscle and must be one tab stop, announced once. */}
      {plates.map((p, i) => {
        const isSelected = selected === p.muscle
        // one ring, two ways in: keyboard focus and mouse hover
        const isRinged = focused === p.muscle || hovered === p.muscle
        const toggle = () => onSelect(isSelected ? null : p.muscle)
        const handleDown = (e: PointerEvent) => {
          e.stopPropagation()
          toggle()
        }
        // a <g role="button"> gets no free click from Enter/Space — wire it
        const handleKey = (e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault() // Space would otherwise scroll the page
          e.stopPropagation()
          toggle()
        }
        // a pick ring is the weakest claim on the outline — a live hover or
        // keyboard focus still wins it, since those track the pointer
        const mark = markFor?.(p.muscle) ?? null
        const shared = {
          fill: fillFor(p.muscle, i),
          stroke:
            isSelected || isRinged || mark
              ? 'var(--color-accent)'
              : 'var(--plate-stroke, rgb(10 11 14 / 0.55))',
          strokeWidth: isSelected
            ? 1.75
            : isRinged
              ? 2.25
              : mark === 'primary'
                ? 4
                : mark === 'secondary'
                  ? 3
                  : 0.75,
          // hover/focus reads as a dashed ring so it never masquerades as
          // selection; a SECONDARY pick is dashed for the same reason — it is
          // a lesser claim than the solid ring a primary gets
          strokeDasharray:
            isRinged && !isSelected ? '5 3' : mark === 'secondary' ? '10 7' : undefined,
          strokeLinejoin: 'round' as const,
          className: 'muscle-plate',
          style: { transition: 'fill 500ms ease' },
          onPointerDown: handleDown,
        }
        const control = decorative
          ? {}
          : {
              role: 'button',
              tabIndex: 0,
              'aria-label': MUSCLES[p.muscle].label,
              'aria-pressed': isSelected,
              onKeyDown: handleKey,
              // A press focuses the plate too, and a ring that outlives the tap
              // is what made this look like it needed two presses: press one
              // selected (solid ring), press two deselected and left the focus
              // ring behind. Only a KEYBOARD focus earns the indicator.
              onFocus: (e: FocusEvent<SVGGElement>) => {
                if (!isKeyboardFocus(e.currentTarget)) return
                setFocused(p.muscle)
              },
              onBlur: () => setFocused(null),
              onPointerEnter: (e: PointerEvent) => {
                if (e.pointerType === 'mouse') setHovered(p.muscle)
              },
              onPointerLeave: () => setHovered(null),
              style: { outline: 'none' }, // the dashed plate ring IS the indicator
            }
        return (
          <g key={p.muscle} {...control}>
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
