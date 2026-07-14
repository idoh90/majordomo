import { useEffect, useMemo, useState } from 'react'
import { useNow } from '../../core/useNow'
import { useCapitalStore } from './store'
import type { Account, Holding, Snapshot } from './types'
import { monthKey, monthlySpent } from './lib/budget'
import { latestDelta, latestSnapshot, liveNetWorth, netWorthOf, netWorthSeries, type NetWorthDelta } from './lib/networth'
import { Vault } from './components/Vault'
import { NetWorthChart } from './components/NetWorthChart'
import { Allocation } from './components/Allocation'
import { AccountsPanel } from './components/AccountsPanel'
import { PortfolioBoard } from './components/PortfolioBoard'
import { TenDayPL } from './components/TenDayPL'
import { SpendCard } from './components/SpendCard'
import { SnapshotSheet } from './components/SnapshotSheet'
import { SnapshotHistorySheet } from './components/SnapshotHistorySheet'
import { SpendSheet } from './components/SpendSheet'
import { AccountSheet } from './components/AccountSheet'
import { HoldingSheet } from './components/HoldingSheet'
import { CapitalSettingsSheet } from './components/CapitalSettingsSheet'

export function CapitalScreen() {
  const accounts = useCapitalStore((s) => s.accounts)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const prices = useCapitalStore((s) => s.prices)
  const fx = useCapitalStore((s) => s.fx)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const blurAmounts = useCapitalStore((s) => s.blurAmounts)
  const toggleBlur = useCapitalStore((s) => s.toggleBlur)
  const refreshPrices = useCapitalStore((s) => s.refreshPrices)
  const now = useNow()

  const [snapOpen, setSnapOpen] = useState(false)
  const [snapEditing, setSnapEditing] = useState<Snapshot | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [spendOpen, setSpendOpen] = useState(false)
  const [accountEditing, setAccountEditing] = useState<Account | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [holdingEditing, setHoldingEditing] = useState<Holding | null>(null)
  const [holdingOpen, setHoldingOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // refresh quotes once when the console opens (store no-ops without key/holdings)
  useEffect(() => {
    void refreshPrices()
  }, [refreshPrices])

  const openAddAccount = () => {
    setAccountEditing(null)
    setAccountOpen(true)
  }
  const openEditAccount = (a: Account) => {
    setAccountEditing(a)
    setAccountOpen(true)
  }
  const openAddHolding = () => {
    setHoldingEditing(null)
    setHoldingOpen(true)
  }
  const openEditHolding = (h: Holding) => {
    setHoldingEditing(h)
    setHoldingOpen(true)
  }

  const derived = useMemo(() => {
    const latest = latestSnapshot(snapshots)
    const series = netWorthSeries(snapshots, accounts)
    const live = liveNetWorth(accounts, holdings, prices, fx, latest)
    const snapshotNW = latest ? netWorthOf(latest, accounts) : 0

    // with holdings, "delta" = live vs your last snapshot (market move since);
    // without, keep the Phase-1 last-vs-previous-snapshot delta
    let delta: NetWorthDelta
    if (holdings.length > 0 && latest) {
      const absolute = live.netWorth - snapshotNW
      delta = { absolute, fraction: snapshotNW !== 0 ? absolute / Math.abs(snapshotNW) : null }
    } else {
      delta = latestDelta(series)
    }

    return { latest, series, live, delta }
  }, [snapshots, accounts, holdings, prices, fx])

  const spent = monthlySpent(monthKey(new Date(now)), spends, recurring, spendItems)
  const hasData = derived.latest != null || holdings.length > 0
  const hasHoldings = holdings.length > 0

  return (
    <>
      <div className="mt-4 mb-4 flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label={blurAmounts ? 'Show amounts' : 'Hide amounts'}
          aria-pressed={blurAmounts}
          onClick={toggleBlur}
          className="chip border border-line bg-panel p-2.5 text-ink-dim transition-colors hover:text-ink"
        >
          <EyeIcon off={blurAmounts} />
        </button>
        <button
          type="button"
          aria-label="Live-price settings"
          onClick={() => setSettingsOpen(true)}
          className="chip border border-line bg-panel p-2.5 text-ink-dim transition-colors hover:text-ink"
        >
          <GearIcon />
        </button>
        <button type="button" onClick={() => setSpendOpen(true)} className="btn-soft hidden px-4 py-2 text-sm sm:inline-flex">
          Update spend
        </button>
        <button type="button" onClick={() => setSnapOpen(true)} className="btn-cta hidden items-center gap-2 px-4 py-2 text-sm sm:inline-flex">
          <PlusIcon />
          Update balances
        </button>
      </div>

      <Vault
        netWorth={derived.live.netWorth}
        assets={derived.live.assets}
        liabilities={derived.live.liabilities}
        delta={derived.delta}
        hasData={hasData}
      />

      <main className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <NetWorthChart
            series={derived.series}
            liveValue={hasHoldings ? derived.live.netWorth : undefined}
            onHistory={() => setHistoryOpen(true)}
          />
          <Allocation slices={derived.live.slices} liabilities={derived.live.liabilities} />
        </div>
        <div className="flex flex-col gap-4">
          <SpendCard spent={spent} budget={monthlyBudget} now={new Date(now)} onEdit={() => setSpendOpen(true)} />
          <AccountsPanel
            accounts={accounts}
            latest={derived.latest}
            holdings={holdings}
            prices={prices}
            fx={fx}
            onEdit={openEditAccount}
            onAdd={openAddAccount}
          />
        </div>
      </main>

      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-start">
        <PortfolioBoard
          onAddHolding={openAddHolding}
          onEditHolding={openEditHolding}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <TenDayPL />
      </div>

      {/* mobile FAB — primary action is logging a balance snapshot */}
      <button
        type="button"
        aria-label="Update balances"
        onClick={() => setSnapOpen(true)}
        className="btn-cta btn-log fixed right-5 z-40 flex h-14 w-14 items-center justify-center transition hover:brightness-110 active:scale-95 sm:hidden"
        style={{ bottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <PlusIcon large />
      </button>

      <SnapshotSheet
        open={snapOpen}
        editing={snapEditing}
        onClose={() => {
          setSnapOpen(false)
          setSnapEditing(null)
        }}
        onAddAccount={openAddAccount}
      />
      <SnapshotHistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onEdit={(s) => {
          // close the list first — sheets stack in JSX order, so the editor
          // would otherwise open underneath it
          setHistoryOpen(false)
          setSnapEditing(s)
          setSnapOpen(true)
        }}
      />
      <SpendSheet open={spendOpen} now={now} onClose={() => setSpendOpen(false)} />
      <AccountSheet open={accountOpen} editing={accountEditing} onClose={() => setAccountOpen(false)} />
      <HoldingSheet open={holdingOpen} editing={holdingEditing} onClose={() => setHoldingOpen(false)} onAddAccount={openAddAccount} />
      <CapitalSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

function PlusIcon({ large }: { large?: boolean }) {
  const size = large ? 26 : 16
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {off && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
