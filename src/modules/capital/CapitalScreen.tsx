import { useEffect, useMemo, useState } from 'react'
import { useNow } from '../../core/useNow'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { useCapitalStore } from './store'
import { LedgerBriefing } from './Briefing'
import { reconcilePaydayMarkers } from './lib/payday'
import { useCapitalUi } from './uiStore'
import type { Account, Holding, Snapshot, SpendItem } from './types'
import { Amount } from './components/Amount'
import { monthKey, spendBreakdown } from './lib/budget'
import { displayDelta, latestSnapshot, liveNetWorth, netWorthOf, netWorthSeries } from './lib/networth'
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
  const autoRefreshPrices = useCapitalStore((s) => s.autoRefreshPrices)
  const paydayDay = useCapitalStore((s) => s.paydayDay)
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
  const [addChooserOpen, setAddChooserOpen] = useState(false)

  // refresh quotes once when the console opens (store no-ops without
  // key/holdings; user-gated — the manual button always works)
  useEffect(() => {
    if (autoRefreshPrices) void refreshPrices()
  }, [refreshPrices, autoRefreshPrices])

  // payday marker heal pass on wing mount (Study's dual-mount precedent)
  useEffect(() => {
    reconcilePaydayMarkers(paydayDay, Date.now())
  }, [paydayDay])

  // the tab bar's + posts a one-shot request through the mailbox
  const addSheetRequested = useCapitalUi((s) => s.addSheetRequested)
  useEffect(() => {
    if (!addSheetRequested) return
    setAddChooserOpen(true)
    useCapitalUi.getState().clearAddSheetRequest()
  }, [addSheetRequested])

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

    // null when there's nothing to compare — the Vault then drops the row
    const delta = displayDelta({
      live,
      series,
      latest,
      snapshotNetWorth: snapshotNW,
      hasHoldings: holdings.length > 0,
    })

    return { latest, series, live, delta }
  }, [snapshots, accounts, holdings, prices, fx])

  const breakdown = spendBreakdown(monthKey(new Date(now)), spends, recurring, spendItems)
  const hasData = derived.latest != null || holdings.length > 0
  const hasHoldings = holdings.length > 0

  return (
    <>
      <LedgerBriefing className="mt-4" />
      <div className="mt-4 mb-4 flex items-center justify-end gap-2">
        <button
          type="button"
          aria-pressed={blurAmounts}
          onClick={toggleBlur}
          className="chip inline-flex items-center gap-1.5 rounded-pill border border-line bg-panel px-3 py-2 text-[9.5px] tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
        >
          <EyeIcon off={blurAmounts} />
          {blurAmounts ? voice.capital.reveal : voice.capital.hide}
        </button>
        <button
          type="button"
          aria-label="Live-price settings"
          onClick={() => setSettingsOpen(true)}
          className="chip border border-line bg-panel p-2.5 text-ink-dim transition-colors hover:text-ink"
        >
          <GearIcon />
        </button>
        <button type="button" onClick={() => setSpendOpen(true)} className="btn-soft hidden px-4 py-2 text-sm md:inline-flex">
          Update spend
        </button>
        <button type="button" onClick={() => setSnapOpen(true)} className="btn-cta hidden items-center gap-2 px-4 py-2 text-sm md:inline-flex">
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
        degraded={derived.live.degraded}
        chart={
          <NetWorthChart
            variant="bare"
            series={derived.series}
            liveValue={hasHoldings ? derived.live.netWorth : undefined}
            onHistory={() => setHistoryOpen(true)}
          />
        }
      />

      {/* Everything below the hero simply stacks until there is room for two
          columns. It used to swipe horizontally below md — snap pages with no
          indicator and no affordance, so three of the four boards were
          invisible unless you happened to drag the one you could see. */}
      <main className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <Allocation slices={derived.live.slices} liabilities={derived.live.liabilities} />
          <PortfolioBoard
            onAddHolding={openAddHolding}
            onEditHolding={openEditHolding}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SpendCard
            breakdown={breakdown}
            budget={monthlyBudget}
            now={new Date(now)}
            onEdit={() => setSpendOpen(true)}
            onHistory={() => setSpendOpen(true)}
          />
          <AccountsPanel
            accounts={accounts}
            latest={derived.latest}
            holdings={holdings}
            prices={prices}
            fx={fx}
            onEdit={openEditAccount}
            onAdd={openAddAccount}
          />
          <TenDayPL />
        </div>
      </main>

      <RecentEntries items={spendItems} />

      {/* the tab bar's + — two primary verbs, thumb-sized */}
      <Sheet open={addChooserOpen} onClose={() => setAddChooserOpen(false)}>
        <div className="flex flex-col gap-2 pb-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setAddChooserOpen(false)
              setSnapOpen(true)
            }}
            className="card flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-semibold transition-colors hover:border-accent"
          >
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: 'var(--color-w-ledger)' }}
            />
            {voice.capital.addBalances}
          </button>
          <button
            type="button"
            onClick={() => {
              setAddChooserOpen(false)
              setSpendOpen(true)
            }}
            className="card flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-semibold transition-colors hover:border-accent"
          >
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: 'var(--color-danger)' }}
            />
            {voice.capital.addSpend}
          </button>
        </div>
      </Sheet>

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

/** the last few one-off spends — the mobile design's RECENT ENTRIES */
function RecentEntries({ items }: { items: SpendItem[] }) {
  const recent = [...items]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
  if (recent.length === 0) return null
  return (
    <section className="panel mt-4 px-4 pb-4 pt-3 md:hidden">
      <h2 className="card-title">{voice.capital.recentEntries}</h2>
      <div className="mt-2 flex flex-col gap-1.5">
        {recent.map((it) => {
          const d = new Date(it.date)
          return (
            <div key={it.id} className="card flex items-baseline gap-2.5 px-3.5 py-2.5">
              <span className="text-[12.5px] font-semibold">{it.name}</span>
              <span className="text-[10.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                {d.getDate()}/{d.getMonth() + 1}
              </span>
              <Amount
                value={-it.amount}
                kind="delta"
                className="ml-auto text-[12.5px] [font-variant-numeric:tabular-nums]"
              />
            </div>
          )
        })}
      </div>
    </section>
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
