import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { makeId } from '../../core/ids'
import { localDayKey } from '../../core/dates'
import type { Account, Holding, Quote, RecurringExpense, Snapshot, SpendItem } from './types'
import { monthKey } from './lib/budget'
import { fetchFxToILS, fetchQuotes, fetchTimeSeries, type Candle } from './lib/prices'

interface CapitalState {
  accounts: Account[]
  snapshots: Snapshot[]
  /** live-priced positions (Phase 2); belong to investment accounts via accountId */
  holdings: Holding[]
  /** ₪ spend target for a calendar month */
  monthlyBudget: number
  /** 'YYYY-MM' → quick overwrite total (used only when nothing is itemized) */
  spends: Record<string, number>
  /** one-off spend line items (itemized mode) */
  spendItems: SpendItem[]
  /** fixed monthly expenses (rent, subscriptions) */
  recurring: RecurringExpense[]
  /** hide amounts behind a blur until hover (shoulder-surfing guard) */
  blurAmounts: boolean

  /* Twelve Data — user's own free read-only key, stored locally, never in git */
  apiKey: string
  /** UPPERCASE symbol → last quote (cache, so prices show while refetching) */
  prices: Record<string, Quote>
  /** UPPERCASE symbol → recent daily closes, oldest-first (for 10-day P/L) */
  history: Record<string, Candle[]>
  /** currency → ILS rate */
  fx: Record<string, number>
  pricesUpdatedAt: string | null
  pricesError: string | null
  pricesLoading: boolean

  addAccount: (name: string, assetClass: Account['assetClass']) => string
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => void
  deleteAccount: (id: string) => void
  addHolding: (h: Omit<Holding, 'id'>) => void
  updateHolding: (id: string, patch: Partial<Omit<Holding, 'id'>>) => void
  deleteHolding: (id: string) => void
  /** create or replace a snapshot (upsert by id) */
  saveSnapshot: (snapshot: Snapshot) => void
  deleteSnapshot: (id: string) => void
  setMonthlyBudget: (amount: number) => void
  setSpend: (month: string, amount: number) => void
  /** replace all recurring expenses (the sheet commits its draft wholesale) */
  setRecurring: (list: RecurringExpense[]) => void
  /** replace this month's one-off items, keeping every other month intact */
  setMonthItems: (month: string, items: SpendItem[]) => void
  toggleBlur: () => void
  setApiKey: (key: string) => void
  /** fetch quotes + FX for all holdings; no-op without a key or holdings */
  refreshPrices: () => Promise<void>
}

const byDateAsc = (a: Snapshot, b: Snapshot) => a.takenAt.localeCompare(b.takenAt)

export const useCapitalStore = create<CapitalState>()(
  persist(
    (set, get) => ({
      accounts: [],
      snapshots: [],
      holdings: [],
      monthlyBudget: 0,
      spends: {},
      spendItems: [],
      recurring: [],
      blurAmounts: false,
      apiKey: '',
      prices: {},
      history: {},
      fx: { ILS: 1 },
      pricesUpdatedAt: null,
      pricesError: null,
      pricesLoading: false,

      addAccount: (name, assetClass) => {
        const id = makeId()
        set((s) => ({ accounts: [...s.accounts, { id, name, assetClass }] }))
        return id
      },
      updateAccount: (id, patch) =>
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch, id } : a)),
        })),
      deleteAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          holdings: s.holdings.filter((h) => h.accountId !== id),
          // drop the deleted account's balances from every snapshot
          snapshots: s.snapshots.map((snap) => {
            if (!(id in snap.balances)) return snap
            const { [id]: _drop, ...rest } = snap.balances
            return { ...snap, balances: rest }
          }),
        })),
      addHolding: (h) => set((s) => ({ holdings: [...s.holdings, { ...h, id: makeId() }] })),
      updateHolding: (id, patch) =>
        set((s) => ({
          holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch, id } : h)),
        })),
      deleteHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),
      saveSnapshot: (snapshot) =>
        set((s) => {
          const rest = s.snapshots.filter((x) => x.id !== snapshot.id)
          return { snapshots: [...rest, snapshot].sort(byDateAsc) }
        }),
      deleteSnapshot: (id) => set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== id) })),
      setMonthlyBudget: (amount) => set({ monthlyBudget: Math.max(0, Math.round(amount)) }),
      setSpend: (month, amount) =>
        set((s) => ({ spends: { ...s.spends, [month]: Math.max(0, Math.round(amount)) } })),
      setRecurring: (list) => set({ recurring: list }),
      setMonthItems: (month, items) =>
        set((s) => ({
          spendItems: [
            ...s.spendItems.filter((i) => monthKey(new Date(i.date)) !== month),
            ...items,
          ],
        })),
      toggleBlur: () => set((s) => ({ blurAmounts: !s.blurAmounts })),
      setApiKey: (key) => set({ apiKey: key.trim() }),

      refreshPrices: async () => {
        const { apiKey, holdings, pricesLoading } = get()
        if (pricesLoading || !apiKey || holdings.length === 0) return
        set({ pricesLoading: true, pricesError: null })
        try {
          const { quotes, errors } = await fetchQuotes(holdings, apiKey)
          const currencies = [...new Set(Object.values(quotes).map((q) => q.currency))]
          const { fx, errors: fxErrors } = await fetchFxToILS(currencies, apiKey)
          const { history, errors: histErrors } = await fetchTimeSeries(holdings, apiKey)
          const problems = [...errors, ...fxErrors, ...histErrors]
          set((s) => ({
            prices: { ...s.prices, ...quotes },
            history: { ...s.history, ...history },
            fx: { ...s.fx, ...fx },
            pricesUpdatedAt: new Date().toISOString(),
            pricesError: problems.length ? problems.join(' · ') : null,
            pricesLoading: false,
          }))
        } catch (e) {
          set({ pricesLoading: false, pricesError: e instanceof Error ? e.message : 'fetch failed' })
        }
      },
    }),
    {
      name: 'batman-capital',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        accounts: s.accounts,
        snapshots: s.snapshots,
        holdings: s.holdings,
        monthlyBudget: s.monthlyBudget,
        spends: s.spends,
        spendItems: s.spendItems,
        recurring: s.recurring,
        blurAmounts: s.blurAmounts,
        apiKey: s.apiKey,
        prices: s.prices,
        history: s.history,
        fx: s.fx,
        pricesUpdatedAt: s.pricesUpdatedAt,
      }),
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__capital = useCapitalStore

  // ?demo seeds a fresh store with fixture accounts + a few months of snapshots
  // (screenshot/testing aid; mirrors the training console's ?demo)
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    useCapitalStore.getState().accounts.length === 0
  ) {
    const acct = (name: string, assetClass: Account['assetClass']): Account => ({
      id: makeId(),
      name,
      assetClass,
    })
    const checking = acct('Bank Hapoalim', 'cash')
    const emergency = acct('Emergency fund', 'cash')
    const brokerage = acct('IBKR — global ETFs', 'investment')
    const tase = acct('Kesem S&P 500 (TASE)', 'tase-fund')
    const pension = acct('Menorah pension', 'pension')
    const hishtalmut = acct('Altshuler hishtalmut', 'pension')
    const apartment = acct('Apartment (Haifa)', 'real-estate')
    const mortgage = acct('Mortgage', 'debt')
    const accounts = [checking, emergency, brokerage, tase, pension, hishtalmut, apartment, mortgage]

    // six ~monthly snapshots ending today, so the latest is genuinely current
    const now = new Date()
    const DAY = 86_400_000
    const snap = (m: number, balances: Record<string, number>): Snapshot => ({
      id: makeId(),
      takenAt: new Date(now.getTime() - m * 30 * DAY).toISOString(),
      balances,
    })
    const snapshots: Snapshot[] = [
      snap(5, { [checking.id]: 22000, [emergency.id]: 60000, [brokerage.id]: 142000, [tase.id]: 38000, [pension.id]: 210000, [hishtalmut.id]: 96000, [apartment.id]: 1450000, [mortgage.id]: 1498000 }),
      snap(4, { [checking.id]: 19500, [emergency.id]: 60000, [brokerage.id]: 149000, [tase.id]: 40500, [pension.id]: 214000, [hishtalmut.id]: 98500, [apartment.id]: 1450000, [mortgage.id]: 1490000 }),
      snap(3, { [checking.id]: 26000, [emergency.id]: 65000, [brokerage.id]: 151500, [tase.id]: 41000, [pension.id]: 219000, [hishtalmut.id]: 101000, [apartment.id]: 1480000, [mortgage.id]: 1482000 }),
      snap(2, { [checking.id]: 24000, [emergency.id]: 65000, [brokerage.id]: 158000, [tase.id]: 43500, [pension.id]: 223500, [hishtalmut.id]: 103500, [apartment.id]: 1480000, [mortgage.id]: 1474000 }),
      snap(1, { [checking.id]: 31000, [emergency.id]: 70000, [brokerage.id]: 163000, [tase.id]: 44000, [pension.id]: 228000, [hishtalmut.id]: 106000, [apartment.id]: 1480000, [mortgage.id]: 1466000 }),
      snap(0, { [checking.id]: 28500, [emergency.id]: 70000, [brokerage.id]: 171000, [tase.id]: 46500, [pension.id]: 232500, [hishtalmut.id]: 108500, [apartment.id]: 1510000, [mortgage.id]: 1458000 }),
    ]

    // two live-priced holdings in the brokerage account + cached quotes/FX so the
    // portfolio board renders offline (no key needed for screenshots)
    const holdings: Holding[] = [
      { id: makeId(), accountId: brokerage.id, symbol: 'VOO', currency: 'USD', shares: 55, costBasis: 420 },
      { id: makeId(), accountId: brokerage.id, symbol: 'VXUS', currency: 'USD', shares: 180, costBasis: 58 },
    ]
    const at = now.toISOString()
    const prices: Record<string, Quote> = {
      VOO: { price: 693.86, prevClose: 690.69, currency: 'USD', name: 'Vanguard S&P 500 ETF', marketOpen: false, at },
      VXUS: { price: 64.85, prevClose: 65.1, currency: 'USD', name: 'Vanguard Total Intl Stock ETF', marketOpen: false, at },
    }
    const candleDate = (k: number) => localDayKey(new Date(now.getTime() - (10 - k) * DAY))
    const series = (closes: number[]): Candle[] => closes.map((close, k) => ({ date: candleDate(k), close }))
    const history: Record<string, Candle[]> = {
      VOO: series([682.5, 685.2, 683.9, 687.1, 689.4, 688.0, 690.2, 691.5, 689.8, 690.69, 693.86]),
      VXUS: series([63.9, 64.2, 64.0, 64.5, 64.8, 64.6, 65.0, 65.3, 64.9, 65.1, 64.85]),
    }

    // itemized spending: recurring (₪5,400) + this month's one-off items (₪2,000)
    const recurring: RecurringExpense[] = [
      { id: makeId(), name: 'Rent', amount: 5200, active: true },
      { id: makeId(), name: 'Gym', amount: 200, active: true },
    ]
    const item = (name: string, amount: number, daysAgo: number): SpendItem => ({
      id: makeId(),
      name,
      amount,
      date: new Date(now.getTime() - daysAgo * DAY).toISOString(),
    })
    const spendItems: SpendItem[] = [
      item('Groceries', 1240, 1),
      item('Fuel', 430, 3),
      item('Dining out', 330, 5),
    ]

    useCapitalStore.setState({
      accounts,
      snapshots,
      holdings,
      monthlyBudget: 12000,
      recurring,
      spendItems,
      prices,
      history,
      fx: { ILS: 1, USD: 3.0233 },
      pricesUpdatedAt: at,
    })
  }
}
