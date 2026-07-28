/**
 * A 58×20 line, hand-rolled like every other chart in the estate.
 *
 * Draws nothing rather than something meaningless: one point is not a trend,
 * and a flat line across a row of zeroes would claim a history the estate does
 * not have. The caller renders whatever belongs in the gap.
 */
export function Sparkline({
  series,
  color,
  width = 58,
  height = 20,
}: {
  series: number[]
  color: string
  width?: number
  height?: number
}) {
  const pts = series.filter((n) => Number.isFinite(n))
  if (pts.length < 2 || pts.every((n) => n === pts[0])) return null

  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const pad = 2
  const x = (k: number) => (k / (pts.length - 1)) * (width - pad * 2) + pad
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
  const d = pts.map((v, k) => `${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="flex-none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="1.8" fill={color} />
    </svg>
  )
}
