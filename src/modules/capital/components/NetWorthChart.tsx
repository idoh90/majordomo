import { useMemo, useState } from 'react'
import { SegmentedControl } from '../../../core/ui/SegmentedControl'
import { voice } from '../../../core/voice'
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

  // strictly what the selected range holds. It used to fall back to
  // full.slice(-2), which drew points from OUTSIDE the range under a '3M' pill —
  // an honest empty state beats a chart that quietly answers a different question.
  const pts = useMemo(() => {
    const months = RANGE_MONTHS[range]
    if (months == null) return full
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    return full.filter((p) => new Date(p.takenAt) >= cutoff)
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

  // the whole history could draw, but the chosen window can't
  const rangeIsEmpty = range !== 'all' && full.length >= 2

  // "Mar '26", never "Mar 26" — a bare 2-digit year reads as a day of the month
  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear() % 100).padStart(2, '0')}`
  }

  return (
    <div className="panel p-4">
      {/* below md the controls take their own row — 'NET WORTH · TREND' plus a
          4-pill control does not fit 390px and the title wraps a word per line */}
      <div className="mb-3 flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
        <h3 className="card-title">Net worth · trend</h3>
        <div className="flex w-full items-center justify-between gap-2.5 md:w-auto md:justify-end">
          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              className="text-sm text-accent transition-opacity hover:opacity-80"
            >
              History
            </button>
          )}
          {/* fewer than two points draws nothing at any range — the tabs were
              rendering live beside a chart saying there was nothing to draw */}
          <SegmentedControl
            value={range}
            onChange={setRange}
            disabled={full.length < 2}
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
          {/* leading-none: the svg is inline, and its baseline gap would put the
              percentage-positioned marker below its own coordinate space */}
          <div className="relative leading-none">
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
            </svg>
            {/* the endpoint marker is HTML, not <circle>: preserveAspectRatio="none"
                squashes an SVG dot into an ellipse, and at x=W half of it falls
                outside the viewBox. Percentage-positioned it stays round and whole
                (its 4px overhang lands inside the panel's own padding). */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{
                left: `${(geometry.lastX / W) * 100}%`,
                top: `${(geometry.lastY / H) * 100}%`,
              }}
            />
          </div>

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
      ) : rangeIsEmpty ? (
        // the range, not the history, is what's short — keep the pill honest and
        // offer the way out instead of silently widening the window
        <div className="py-8 text-center">
          <p className="text-sm text-ink-faint">{voice.capital.trend.rangeEmpty(RANGE_MONTHS[range] ?? 0)}</p>
          <button
            type="button"
            onClick={() => setRange('all')}
            className="mt-2 text-sm text-accent transition-opacity hover:opacity-80"
          >
            {voice.capital.trend.showAll}
          </button>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-ink-faint">
          Log at least two snapshots to see the trend.
        </p>
      )}
    </div>
  )
}
