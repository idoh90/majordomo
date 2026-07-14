/** Asset/liability classes tracked in the net-worth picture. `debt` subtracts. */
export type AssetClass =
  | 'cash'
  | 'investment'
  | 'crypto'
  | 'tase-fund'
  | 'pension'
  | 'real-estate'
  | 'debt'

export interface Account {
  id: string
  name: string
  assetClass: AssetClass
}

/**
 * A dated capture of every account's balance. The most recent snapshot IS the
 * current state — there is no separate "current balance" to keep in sync. Net
 * worth of a snapshot = Σ assets − Σ debts. Balances are stored as positive
 * magnitudes; the `debt` class is subtracted at compute time.
 */
export interface Snapshot {
  id: string
  /** ISO datetime; bucketed in local time like everything else in the app */
  takenAt: string
  balances: Record<string, number>
}

/**
 * A live-priced position inside an investment-class account. `costBasis` and the
 * fetched price are in the holding's native `currency`; net worth converts to ₪ via
 * `fx`. An account with ≥1 holding is "priced" — its current value = Σ market value,
 * overriding its manual snapshot balance for the live view (history still uses the
 * stamped snapshot).
 */
export interface Holding {
  id: string
  accountId: string
  symbol: string
  /** Twelve Data exchange qualifier (e.g. 'LSE'); omit for US listings */
  exchange?: string
  /** ISO 4217 the price + cost basis are quoted in (default USD) */
  currency: string
  shares: number
  /** per-share cost, in `currency` */
  costBasis: number
}

/** A cached market quote (native currency). */
export interface Quote {
  price: number
  prevClose: number
  currency: string
  name?: string
  marketOpen?: boolean
  /** ISO datetime the quote was fetched */
  at: string
}

/** A one-off spend logged against a month (e.g. "groceries ₪240"). */
export interface SpendItem {
  id: string
  name: string
  amount: number
  /** ISO datetime; bucketed to a month in local time */
  date: string
}

/** A fixed expense that recurs every month (rent, subscriptions). `active`
 *  lets you pause one without deleting it. */
export interface RecurringExpense {
  id: string
  name: string
  amount: number
  active: boolean
}

export interface CapitalExport {
  app: 'batman-capital'
  version: 1
  exportedAt: string
  accounts: Account[]
  snapshots: Snapshot[]
  monthlyBudget: number
  spends: Record<string, number>
}
