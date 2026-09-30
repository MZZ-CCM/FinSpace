/**
 * Finspace data model (v2).
 * Manual data is the source of truth; market data and exchange rates are optional enrichment.
 */

export type AccountKind =
  | 'checking'
  | 'savings'
  | 'debit'
  | 'credit'
  | 'loan'
  | 'cash'
  | 'investment'
  | 'isa'
  | 'pension'
  | 'business'
  | 'other'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  institution?: string
  last4?: string
  /** ISO 4217 code. Amounts on this account's transactions are in this currency. */
  currency: string
  /** Key into CARD_SKINS */
  skin: string
  /** Balance on openingDate. Liabilities (credit, loan): amount owed as a positive number. */
  openingBalance: number
  openingDate: string
  creditLimit?: number
  notes?: string
  archived?: boolean
}

/**
 * income/expense: real money in/out of your finances.
 * transfer: money moving between your own accounts — never counted as income or spending.
 * adjustment: a balance correction or valuation change (e.g. pension value update) — signed amount, not income/spending.
 */
export type TxType = 'income' | 'expense' | 'transfer' | 'adjustment'

export interface Transaction {
  id: string
  type: TxType
  /** Positive for income/expense/transfer (type decides direction). Signed for adjustments. In the account's currency. */
  amount: number
  /** Transfers between accounts in different currencies: amount received, in the destination currency. */
  toAmount?: number
  date: string // YYYY-MM-DD
  accountId: string
  toAccountId?: string
  category: string
  payee: string
  note?: string
  tags?: string[]
  recurringId?: string
}

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringRule {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  accountId: string
  toAccountId?: string
  category: string
  payee: string
  tags?: string[]
  frequency: Frequency
  /** Next date a transaction should be created on. */
  nextDate: string
  endDate?: string
  active: boolean
}

export type AssetType = 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'other'

export interface Holding {
  id: string
  symbol: string
  name: string
  assetType: AssetType
  /** Optional: which investment/ISA/pension account holds it. Its value then counts towards that account. */
  accountId?: string
  /** CoinGecko coin id (e.g. "bitcoin") for free, keyless crypto quotes. */
  coingeckoId?: string
  notes?: string
  prices: PricePoint[]
}

export interface PricePoint {
  date: string
  price: number
  source?: 'manual' | 'finnhub' | 'coingecko' | 'coinbase'
  /** ISO timestamp when fetched from a market-data provider. */
  fetchedAt?: string
}

export type TradeKind = 'buy' | 'sell' | 'dividend'

export interface Trade {
  id: string
  holdingId: string
  kind: TradeKind
  date: string
  /** buy/sell only */
  shares: number
  /** buy/sell: price per share. dividend: total cash received. */
  price: number
  fees: number
}

export interface Budget {
  category: string
  limit: number
  period: 'monthly' | 'yearly'
}

export interface GoalContribution {
  id: string
  date: string
  amount: number
  note?: string
}

export interface Goal {
  id: string
  name: string
  emoji: string
  target: number
  targetDate?: string
  /** When linked, progress = that account's balance. Otherwise progress = sum of contributions. */
  accountId?: string
  contributions: GoalContribution[]
  createdAt: string
  archived?: boolean
}

export interface CustomCategory {
  name: string
  emoji: string
  kind: 'expense' | 'income'
}

export interface FxRate {
  /** Units of base currency per 1 unit of this currency. */
  rate: number
  date: string
  source: 'manual' | 'frankfurter'
}

export type WidgetId = 'kpis' | 'cashflow' | 'spending' | 'cards' | 'goals' | 'upcoming' | 'insights' | 'recent'

export interface Settings {
  name: string
  /** Display/base currency. */
  currency: string
  theme: 'dark' | 'light' | 'system'
  onboarded: boolean
  sampleData: boolean
  customCategories: CustomCategory[]
  fx: Record<string, FxRate>
  hiddenWidgets: WidgetId[]
  /** One monthly limit for all spending, in the base currency. Optional; works alongside category budgets. */
  overallBudget?: number
  /** Where data lives: your encrypted Finspace account (default) or this device only. */
  storage?: 'cloud' | 'local'
  /** Minutes of inactivity before an encrypted app locks itself. 0 = never. */
  autoLockMinutes?: number
  /** Opt-in browser notifications. */
  notify?: { recurring: boolean; budgets: boolean; goals: boolean; monthly: boolean }
  /** Last time each notification was sent, to avoid repeats. */
  notified?: Record<string, string>
  privacy: boolean
  lastVisit?: { at: string; netWorth: number }
}

export interface AppData {
  version: 2
  accounts: Account[]
  transactions: Transaction[]
  recurring: RecurringRule[]
  holdings: Holding[]
  trades: Trade[]
  budgets: Budget[]
  goals: Goal[]
  settings: Settings
}
