import type { Account, AccountKind, AppData, AssetType, Budget, Frequency, Goal, Holding, RecurringRule, Settings, Trade, Transaction, TxType, WidgetId } from './types'

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  currency: 'GBP',
  theme: 'system',
  onboarded: false,
  sampleData: false,
  customCategories: [],
  fx: {},
  hiddenWidgets: [],
  privacy: false,
}

export const EMPTY: AppData = {
  version: 2,
  accounts: [],
  transactions: [],
  recurring: [],
  holdings: [],
  trades: [],
  budgets: [],
  goals: [],
  settings: DEFAULT_SETTINGS,
}

// ─────────────── strict field validators (untrusted input: backups, storage) ───────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any
const KINDS: AccountKind[] = ['checking', 'savings', 'debit', 'credit', 'loan', 'cash', 'investment', 'isa', 'pension', 'business', 'other']
const TX_TYPES: TxType[] = ['income', 'expense', 'transfer', 'adjustment']
const ASSETS: AssetType[] = ['stock', 'etf', 'fund', 'bond', 'crypto', 'other']
const FREQS: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']
const WIDGET_IDS: WidgetId[] = ['kpis', 'cashflow', 'spending', 'cards', 'goals', 'upcoming', 'insights', 'recent']
const MAX_ROWS = 250_000

const str = (x: Raw, max = 200) => (typeof x === 'string' ? x.slice(0, max) : '')
const optStr = (x: Raw, max = 200) => (typeof x === 'string' && x.length ? x.slice(0, max) : undefined)
const num = (x: Raw) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN)
const optNum = (x: Raw) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
const isDate = (x: Raw): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const ccy = (x: Raw, fallback: string) => (typeof x === 'string' && /^[A-Z]{3}$/.test(x) ? x : fallback)
const oneOf = <T extends string>(x: Raw, list: readonly T[], fallback?: T): T | undefined => (list.includes(x) ? x : fallback)
const arr = (x: Raw): Raw[] => (Array.isArray(x) ? x.slice(0, MAX_ROWS) : [])
const tags = (x: Raw) => {
  const t = arr(x).filter((s) => typeof s === 'string').map((s: string) => s.slice(0, 40)).slice(0, 20)
  return t.length ? t : undefined
}

function cleanSettings(raw: Raw): Settings {
  const r = raw && typeof raw === 'object' ? raw : {}
  const base = ccy(r.currency, DEFAULT_SETTINGS.currency)
  const fx: Settings['fx'] = {}
  if (r.fx && typeof r.fx === 'object') {
    for (const [k, v] of Object.entries(r.fx as Record<string, Raw>)) {
      if (!/^[A-Z]{3}$/.test(k) || !v || !(num(v.rate) > 0) || !isDate(v.date)) continue
      fx[k] = { rate: v.rate, date: v.date, source: v.source === 'frankfurter' ? 'frankfurter' : 'manual' }
    }
  }
  return {
    name: str(r.name, 60),
    currency: base,
    theme: oneOf(r.theme, ['dark', 'light', 'system'] as const, 'system')!,
    finnhubKey: optStr(r.finnhubKey, 100),
    onboarded: r.onboarded === true,
    sampleData: r.sampleData === true,
    customCategories: arr(r.customCategories)
      .filter((c) => c && typeof c.name === 'string' && c.name.trim())
      .map((c) => ({ name: str(c.name, 40).trim(), emoji: str(c.emoji, 8) || '🏷️', kind: c.kind === 'income' ? ('income' as const) : ('expense' as const) }))
      .slice(0, 100),
    fx,
    hiddenWidgets: arr(r.hiddenWidgets).filter((w) => WIDGET_IDS.includes(w)),
    privacy: r.privacy === true,
    overallBudget: num(r.overallBudget) > 0 ? r.overallBudget : undefined,
    storage: r.storage === 'local' ? 'local' : 'cloud',
    autoLockMinutes: [0, 1, 5, 15, 30, 60].includes(r.autoLockMinutes) ? r.autoLockMinutes : 5,
    notify: r.notify && typeof r.notify === 'object' ? { recurring: r.notify.recurring === true, budgets: r.notify.budgets === true, goals: r.notify.goals === true, monthly: r.notify.monthly === true } : undefined,
    notified: r.notified && typeof r.notified === 'object' ? Object.fromEntries(Object.entries(r.notified as Record<string, Raw>).filter(([k, v]) => typeof v === 'string' && k.length < 120).slice(0, 500)) as Record<string, string> : undefined,
    lastVisit: r.lastVisit && typeof r.lastVisit.at === 'string' && Number.isFinite(r.lastVisit.netWorth) ? { at: r.lastVisit.at.slice(0, 40), netWorth: r.lastVisit.netWorth } : undefined,
  }
}

export interface MigrateReport {
  data: AppData
  /** Records dropped because they were malformed or referenced something missing. */
  dropped: number
}

/**
 * Upgrades any stored or imported dataset to the current version and validates every record.
 * Never throws; invalid records are dropped rather than trusted.
 */
export function migrateWithReport(raw: Raw): MigrateReport {
  if (!raw || typeof raw !== 'object') return { data: EMPTY, dropped: 0 }
  let dropped = 0
  const keep = <T,>(items: (T | null)[]) => {
    const ok = items.filter((x): x is T => x !== null)
    dropped += items.length - ok.length
    return ok
  }
  const settings = cleanSettings(raw.settings)
  const base = settings.currency

  const accounts = keep<Account>(arr(raw.accounts).map((a) => {
    if (!a || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string') return null
    const kind = oneOf(a.kind, KINDS)
    const opening = num(a.openingBalance ?? 0)
    if (!kind || Number.isNaN(opening)) return null
    return {
      id: str(a.id, 64), name: str(a.name, 80) || 'Account', kind, institution: optStr(a.institution, 80),
      last4: typeof a.last4 === 'string' && /^\d{4}$/.test(a.last4) ? a.last4 : undefined,
      currency: ccy(a.currency, base), skin: str(a.skin, 20) || 'obsidian', openingBalance: opening,
      openingDate: isDate(a.openingDate) ? a.openingDate : '2000-01-01', creditLimit: num(a.creditLimit) > 0 ? a.creditLimit : undefined,
      notes: optStr(a.notes, 500), archived: a.archived === true || undefined,
    }
  }))
  const accIds = new Set(accounts.map((a) => a.id))

  const transactions = keep<Transaction>(arr(raw.transactions).map((t) => {
    if (!t || typeof t.id !== 'string') return null
    const type = oneOf(t.type, TX_TYPES)
    const amount = num(t.amount)
    if (!type || Number.isNaN(amount) || !isDate(t.date) || !accIds.has(t.accountId)) return null
    if (type !== 'adjustment' && amount < 0) return null
    if (type === 'transfer' && !accIds.has(t.toAccountId)) return null
    const cat = str(t.category, 60)
    return {
      id: str(t.id, 64), type, amount, toAmount: type === 'transfer' && num(t.toAmount) > 0 ? t.toAmount : undefined, date: t.date,
      accountId: t.accountId, toAccountId: type === 'transfer' ? t.toAccountId : undefined,
      category: cat === 'Investment income' ? 'Dividends' : cat || 'Other', payee: str(t.payee, 120) || 'Untitled',
      note: optStr(t.note, 500), tags: tags(t.tags), recurringId: optStr(t.recurringId, 64),
    }
  }))

  const recurring = keep<RecurringRule>(arr(raw.recurring).map((r) => {
    const type = oneOf(r?.type, ['income', 'expense', 'transfer'] as const)
    const frequency = oneOf(r?.frequency, FREQS)
    if (!r || typeof r.id !== 'string' || !type || !frequency || !(num(r.amount) > 0) || !isDate(r.nextDate) || !accIds.has(r.accountId)) return null
    if (type === 'transfer' && !accIds.has(r.toAccountId)) return null
    return {
      id: str(r.id, 64), type, amount: r.amount, accountId: r.accountId, toAccountId: type === 'transfer' ? r.toAccountId : undefined,
      category: str(r.category, 60) || 'Other', payee: str(r.payee, 120) || 'Repeating payment', tags: tags(r.tags), frequency,
      nextDate: r.nextDate, endDate: isDate(r.endDate) ? r.endDate : undefined, active: r.active !== false,
    }
  }))

  const holdings = keep<Holding>(arr(raw.holdings).map((h) => {
    const assetType = oneOf(h?.assetType, ASSETS)
    if (!h || typeof h.id !== 'string' || typeof h.symbol !== 'string' || !h.symbol || !assetType) return null
    return {
      id: str(h.id, 64), symbol: str(h.symbol, 20).toUpperCase(), name: str(h.name, 120) || str(h.symbol, 20), assetType,
      accountId: accIds.has(h.accountId) ? h.accountId : undefined,
      coingeckoId: typeof h.coingeckoId === 'string' && /^[a-z0-9-]{1,80}$/.test(h.coingeckoId) ? h.coingeckoId : undefined,
      notes: optStr(h.notes, 500),
      prices: arr(h.prices).filter((p) => p && isDate(p.date) && num(p.price) >= 0).map((p) => ({
        date: p.date, price: p.price, source: oneOf(p.source, ['manual', 'finnhub', 'coingecko', 'coinbase'] as const, 'manual'), fetchedAt: optStr(p.fetchedAt, 40),
      })),
    }
  }))
  const holdIds = new Set(holdings.map((h) => h.id))

  const trades = keep<Trade>(arr(raw.trades).map((t) => {
    const kind = oneOf(t?.kind, ['buy', 'sell', 'dividend'] as const)
    if (!t || typeof t.id !== 'string' || !kind || !holdIds.has(t.holdingId) || !isDate(t.date)) return null
    const shares = kind === 'dividend' ? 0 : num(t.shares)
    const price = num(t.price)
    if (Number.isNaN(shares) || shares < 0 || !(price >= 0)) return null
    return { id: str(t.id, 64), holdingId: t.holdingId, kind, date: t.date, shares, price, fees: optNum(t.fees) && t.fees > 0 ? t.fees : 0 }
  }))

  const budgets = keep<Budget>(arr(raw.budgets).map((b) =>
    b && typeof b.category === 'string' && num(b.limit) > 0 ? { category: str(b.category, 60), limit: b.limit, period: b.period === 'yearly' ? 'yearly' : 'monthly' } : null,
  ))

  const goals = keep<Goal>(arr(raw.goals).map((g) => {
    if (!g || typeof g.id !== 'string' || typeof g.name !== 'string' || !(num(g.target) > 0)) return null
    return {
      id: str(g.id, 64), name: str(g.name, 80), emoji: str(g.emoji, 8) || '💰', target: g.target,
      targetDate: isDate(g.targetDate) ? g.targetDate : undefined, accountId: accIds.has(g.accountId) ? g.accountId : undefined,
      contributions: arr(g.contributions).filter((c) => c && typeof c.id === 'string' && isDate(c.date) && Number.isFinite(c.amount)).map((c) => ({ id: str(c.id, 64), date: c.date, amount: c.amount, note: optStr(c.note, 200) })),
      createdAt: isDate(g.createdAt) ? g.createdAt : '2000-01-01', archived: g.archived === true || undefined,
    }
  }))

  return { data: { version: 2, accounts, transactions, recurring, holdings, trades, budgets, goals, settings }, dropped }
}

export const migrate = (raw: Raw): AppData => migrateWithReport(raw).data

export function isBackup(x: unknown): boolean {
  const o = x as Record<string, unknown>
  return !!o && typeof o === 'object' && Array.isArray(o.accounts) && Array.isArray(o.transactions)
}
