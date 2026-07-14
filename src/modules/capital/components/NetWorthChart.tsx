import { useMemo, useState } from 'react'
import { SegmentedControl } from '../../../core/ui/SegmentedControl'
import type { NetWorthPoint } from '../lib/networth'
import { formatCompact } from '../lib/money'
import { Amount } from './Amount'

type Range = 'all' | '1y' | '6m' | '3m'
const RANGE_MONTHS: Record<Range, number | null> = { all: null, '1y': 12, '6m': 6, '3m': 3 }

const W = 600
const H = 180
const PAD = 16

export function NetWorthChart({
  series,
  liveValue,
  onHistory,
}: {
  series: NetWorthPoint[]
  liveValue?: number
  onHistory?: () => void
}) {
  const [range, setRange] = useState<Range>('all')

  // when holdings drive a live "now" value, append it so the line ends where the Vault reads
  const full = useMemo(() => {
    if (liveValue == null) return series
    return [...series, { id: 'live', takenAt: new Date().toISOString(), value: liveValue }]
  }, [series, liveValue])

  const pts = useMemo(() => {
    const months = RANGE_MONTHS[range]
    if (months == null) return full
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const filtered = full.filter((p) => new Date(p.takenAt) >= cutoff)
    // keep at least the last two points so short histories still draw a line
    return filtered.length >= 2 ? filtered : full.slice(-2)
  }, [full, range])

  const geometry = useMemo(() => {
    if (pts.length < 2) return null
    const values = pts.map((p) => p.value)
    const vMin = Math.min(...values)
    const vMax = Math.max(...values)
    const span = vMax - vMin || Math.abs(vMax) || 1
    const tMin = new Date(pts[0].takenAt).getTime()
    const tMax = new Date(pts[pts.length - 1].takenAt).getTime()
    const tSpan = tMax - tMin || 1
    const x = (iso: string) => ((new Date(iso).getTime() - tMin) / tSpan) * W
    const y = (v: number) => PAD + (1 - (v - vMin) / span) * (H - PAD * 2)
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.takenAt).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
    const area = `${line} L${W} ${H} L0 ${H} Z`
    const last = pts[pts.length - 1]
    return { vMin, vMax, x, y, line, area, lastX: x(last.takenAt), lastY: y(last.value) }
  }, [pts])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="card-title">Net worth · trend</h3>
        <div className="flex items-center gap-2.5">
          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              className="text-sm text-accent transition-opacity hover:opacity-80"
            >
              History
            </button>
          )}
          <SegmentedControl
            value={range}
            onChange={setRange}
            options={[
              { value: 'all', label: 'All' },
              { value: '1y', label: '1Y' },
              { value: '6m', label: '6M' },
              { value: '3m', label: '3M' },
            ]}
          />
        </div>
      </div>

      {geometry ? (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            preserveAspectRatio="none"
            className="text-accent"
            role="img"
            aria-label="Net worth over time"
          >
            <defs>
              <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geometry.area} fill="url(#nw-fill)" />
            <path
              d={geometry.line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={geometry.lastX} cy={geometry.lastY} r="3.5" fill="currentColor" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* y-range labels */}
          <div className="pointer-events-none absolute right-1 top-0 text-[10px] tabular-nums text-ink-faint">
            {formatCompact(geometry.vMax)}
          </div>
          <div className="pointer-events-none absolute bottom-5 right-1 text-[10px] tabular-nums text-ink-faint">
            {formatCompact(geometry.vMin)}
          </div>

          <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-[10px] text-ink-faint">
            <span>{fmtDate(pts[0].takenAt)}</span>
            <span className="text-ink-dim">
              <Amount value={pts[pts.length - 1].value} kind="compact" />
            </span>
            <span>{fmtDate(pts[pts.length - 1].takenAt)}</span>
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-ink-faint">
          Log at least two snapshots to see the trend.
        </p>
      )}
    </div>
  )
}
