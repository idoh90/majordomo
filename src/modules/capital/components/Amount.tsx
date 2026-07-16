import { useCapitalStore } from '../store'
import { formatCompact, formatDelta, formatILS } from '../lib/money'

interface AmountProps {
  value: number
  kind?: 'full' | 'compact' | 'delta'
  className?: string
}

/** Formatted ₪ amount that blurs (until hover) when the privacy toggle is on. */
export function Amount({ value, kind = 'full', className = '' }: AmountProps) {
  const blur = useCapitalStore((s) => s.blurAmounts)
  const text = kind === 'delta' ? formatDelta(value) : kind === 'compact' ? formatCompact(value) : formatILS(value)
  return (
    <span
      className={`[font-variant-numeric:tabular-nums] ${blur ? 'blur-[6px] transition-[filter] duration-150 hover:blur-none' : ''} ${className}`}
    >
      {text}
    </span>
  )
}
