import { useMemo } from 'react'
import { useCapitalStore } from '../store'
import { tenDayPL } from '../lib/holdings'
import { formatPercent } from '../lib/money'
import { Amount } from './Amount'

const H = 72 // chart height (px); baseline at the middle

/** Portfolio ₪ P/L for each of the last ~10 trading days — hand-rolled bars. */
export function TenDayPL() {
  const holdings = useCapitalStore((s) => s.holdings)
  const history = useCapitalStore((s) => s.history)
  const fx = useCapitalStore((s) => s.fx)

  const data = useMemo(() => tenDayPL(holdings, history, fx), [holdings, history, fx])
  if (!data.hasData) return null

  const maxAbs = Math.max(1, ...data.days.map((d) => Math.abs(d.pl)))
  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric' })

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="card-title">Last 10 days</h3>
        <span className={`text-sm font-semibold ${data.total >= 0 ? 'text-accent' : 'text-danger'}`}>
          <Amount value={data.total} kind="delta" />
          {data.totalPct !== null && (
            <span className="ml-1.5 text-xs font-normal text-ink-faint">{formatPercent(data.totalPct)}</span>
          )}
        </span>
      </div>

      <div className="relative flex items-stretch gap-1.5" style={{ height: H }}>
        {/* zero baseline */}
        <div className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: H / 2 }} />
        {data.days.map((d) => {
          const barH = (Math.abs(d.pl) / maxAbs) * (H / 2 - 2)
          const up = d.pl >= 0
          return (
            <div key={d.date} className="relative flex-1" title={`${d.date}: ${d.pl >= 0 ? '+' : ''}${Math.round(d.pl)} ₪`}>
              <div
                className={`absolute left-1/2 w-2 -translate-x-1/2 rounded-sm ${up ? 'bg-accent' : 'bg-danger'}`}
                style={up ? { bottom: H / 2, height: barH } : { top: H / 2, height: barH }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-[10px] text-ink-faint">
        <span>{label(data.days[0].date)}</span>
        <span>{label(data.days[data.days.length - 1].date)}</span>
      </div>
    </div>
  )
}
