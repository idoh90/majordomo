import type { AllocationSlice } from '../lib/networth'
import { ASSET_CLASSES } from '../lib/money'
import { Amount } from './Amount'
import { Hinted } from '../../../core/ui/Hint'
import { voice } from '../../../core/voice'

interface AllocationProps {
  slices: AllocationSlice[]
  liabilities: number
}

/** Where the assets sit right now — stacked bar + legend. Liabilities shown apart. */
export function Allocation({ slices, liabilities }: AllocationProps) {
  if (!slices.length) return null

  return (
    <div className="panel p-4">
      <Hinted tip={voice.hints.capital.allocation}>
        <h3 className="card-title">Allocation</h3>
      </Hinted>

      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-pill bg-panel-3">
        {slices.map((s) => (
          // clamped: a negative fraction is invalid CSS, the declaration is
          // dropped, and the segment silently disappears instead of reading as
          // the debt it is. The legend row below still shows the signed value.
          <div
            key={s.assetClass}
            style={{
              width: `${Math.max(0, s.fraction) * 100}%`,
              background: ASSET_CLASSES[s.assetClass].color,
            }}
            title={`${ASSET_CLASSES[s.assetClass].label} · ${(s.fraction * 100).toFixed(0)}%`}
          />
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {slices.map((s) => (
          <li key={s.assetClass} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: ASSET_CLASSES[s.assetClass].color }}
            />
            <span className="text-ink-dim">{ASSET_CLASSES[s.assetClass].label}</span>
            <span className="ml-auto tabular-nums text-ink-faint">
              {(s.fraction * 100).toFixed(0)}%
            </span>
            <Amount value={s.value} kind="compact" className="w-20 text-right tabular-nums text-ink" />
          </li>
        ))}
        {liabilities > 0 && (
          <li className="flex items-center gap-2.5 border-t border-line pt-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: ASSET_CLASSES.debt.color }}
            />
            <span className="text-ink-dim">Liabilities</span>
            <span className="ml-auto text-ink-faint">−</span>
            <Amount value={liabilities} kind="compact" className="w-20 text-right tabular-nums text-ink" />
          </li>
        )}
      </ul>
    </div>
  )
}
