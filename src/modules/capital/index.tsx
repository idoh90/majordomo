import { useEffect } from 'react'
import type { ConsoleModule } from '../../core/module'
import { voice } from '../../core/voice'
import { useNow } from '../../core/useNow'
import { useCapitalStore } from './store'
import { reconcilePaydayMarkers } from './lib/payday'
import { monthKey, monthlySpent } from './lib/budget'
import { Amount } from './components/Amount'
import { CapitalScreen } from './CapitalScreen'

/** Menu-tile stat: month-to-date spend vs. budget. */
function Tile() {
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)
  const now = useNow()
  const spent = monthlySpent(monthKey(new Date(now)), spends, recurring, spendItems)

  return (
    <>
      <span className="stat-num text-2xl leading-tight text-ink">
        <Amount value={spent} kind="compact" />
        {monthlyBudget > 0 && (
          <span className="text-base text-ink-faint">
            {' / '}
            <Amount value={monthlyBudget} kind="compact" />
          </span>
        )}
      </span>
      <span className="block text-[11px] leading-tight text-ink-faint">spent this month</span>
    </>
  )
}

/** Marker heal pass — this mounts on the Manor, so payday chips stay true even
 *  if the Ledger is never opened (the Study's dual-mount precedent). */
function Upkeep() {
  const paydayDay = useCapitalStore((s) => s.paydayDay)

  useEffect(() => {
    reconcilePaydayMarkers(paydayDay, Date.now())
  }, [paydayDay])

  return null
}

function Icon() {
  // rising trend — net worth & markets
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 17l5-5 4 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 8h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const capitalConsole: ConsoleModule = {
  id: 'capital',
  name: voice.modules.capital.name,
  status: 'online',
  tagline: voice.modules.capital.tagline,
  Icon,
  Tile,
  Screen: CapitalScreen,
  Upkeep,
}
