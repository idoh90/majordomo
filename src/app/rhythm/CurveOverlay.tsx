import { memo, useMemo } from 'react'
import { sampleCurve } from './curve'
import { useRhythmStore } from './store'

/**
 * The day curve painted behind a day column: a faint ridge from the column's
 * left edge, time running down, energy running right (v = 10 spans the full
 * column width — the faintness carries the subtlety, not a compressed scale).
 *
 * viewBox rows are quarter-hours (0–96), so the geometry needs neither PXH
 * nor BODY_H and one path string serves all seven columns. Reference data
 * sits UNDER everything: inserted as the column's first child, below the
 * hour rules, the event blocks and the now-line, and pointer-events-none so
 * quick-add clicks and drags land exactly where they always did.
 *
 * A null curve is dormant — no element at all, and the legend entry that
 * explains this color is gated on the same condition.
 */
export const CurveOverlay = memo(function CurveOverlay() {
  const curve = useRhythmStore((s) => s.curve)
  const geom = useMemo(() => {
    if (!curve) return null
    const samples = sampleCurve(curve, 15) // one row per quarter hour, 0..96
    const line = samples
      .map((v, row) => `${row ? 'L' : 'M'}${((v / 10) * 100).toFixed(2)} ${row}`)
      .join(' ')
    return { line, area: `${line} L0 96 L0 0 Z` }
  }, [curve])
  if (!geom) return null
  return (
    <svg
      viewBox="0 0 100 96"
      preserveAspectRatio="none"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full text-accent"
    >
      <path d={geom.area} fill="currentColor" opacity={0.08} />
      <path
        d={geom.line}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
})
