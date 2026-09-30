/**
 * Finspace calculation layer — pure functions, no UI.
 *
 * Rules that matter:
 *  • Transfers and balance updates move money but are NEVER income or spending.
 *  • Every amount is stored in its account's currency; totals are shown in the base currency
 *    and only include currencies that have an exchange rate. Nothing is silently converted.
 *  • Investment P/L is money-weighted: end value − start value − money added + money taken out + dividends.
 */
import type { Account, AppData, Budget, Frequency, Goal, Holding, RecurringRule, Trade, Transaction } from './types'
import { addDays, addMonths, dayBefore, daysBetween, monthEnd, monthKey, monthStart, todayISO } from './format'
import { isLiability, isLiquid } from './meta'

const minDate = (a: string, b: string) => (a < b ? a : b)

// ─────────────────────────── Currency ───────────────────────────

/** Base-currency units per 1 unit of `ccy`, or null when no rate is known. */
export function fxRate(data: AppData, ccy: string): number | null {
  if (ccy === data.settings.currency) return 1
  const r = data.settings.fx[ccy]
  return r && r.rate > 0 ? r.rate : null
}

export function toBase(data: AppData, amount: number, ccy: string): number | null {
  const r = fxRate(data, ccy)
  return r === null ? null : amount * r
}

/** Currencies used by accounts that have no exchange rate — their amounts are left out of totals. */
export function missingRates(data: AppData) {
  return [...new Set(data.accounts.filter((a) => !a.archived && fxRate(data, a.currency) === null).map((a) => a.currency))]
}

function accountCurrencyMap(data: AppData) {
  const m = new Map<string, string>()
  for (const a of data.accounts) m.set(a.id, a.currency)
  return m
}

// ─────────────────────────── Accounts ───────────────────────────

/** Signed opening balance: assets positive, debts negative. */
export function openingSigned(a: Account) {
  return isLiability(a.kind) ? -a.openingBalance : a.openingBalance
}

/** How a transaction changes one account's balance, in that account's currency. */
export function txEffect(t: Transaction, accountId: string) {
  switch (t.type) {
    case 'income':
      return t.accountId === accountId ? t.amount : 0
    case 'expense':
      return t.accountId === accountId ? -t.amount : 0
    case 'adjustment':
      return t.accountId === accountId ? t.amount : 0
    case 'transfer':
      if (t.accountId === accountId) return -t.amount
      if (t.toAccountId === accountId) return t.toAmount ?? t.amount
      return 0
  }
}

/** Cash balance of an account (its own currency), including everything dated on or before `date`. */
export function cashBalanceAt(a: Account, txs: Transaction[], date = '9999-12-31') {
  let b = openingSigned(a)
  for (const t of txs) if (t.date <= date && (t.accountId === a.id || t.toAccountId === a.id)) b += txEffect(t, a.id)
  return Math.round(b * 100) / 100
}

/** Value of holdings linked to an account (base currency). */
export function linkedHoldingsValue(data: AppData, accountId: string, date = todayISO()) {
  let v = 0
  for (const h of data.holdings) if (h.accountId === accountId) v += holdingValueAt(h, data.trades, date)
  return v
}

/** Account value in base currency (cash converted + linked holdings). null when its currency has no rate. */
export function accountValueBase(data: AppData, a: Account, date = todayISO()): number | null {
  const cash = toBase(data, cashBalanceAt(a, data.transactions, date), a.currency)
  if (cash === null) return null
  return cash + linkedHoldingsValue(data, a.id, date)
}

/** Native balance per account (its own currency). */
export function balances(data: AppData, date?: string) {
  const out: Record<string, number> = {}
  for (const a of data.accounts) out[a.id] = cashBalanceAt(a, data.transactions, date)
  return out
}

export function lastActivity(data: AppData, accountId: string) {
  let last = data.accounts.find((a) => a.id === accountId)?.openingDate ?? ''
  for (const t of data.transactions) if ((t.accountId === accountId || t.toAccountId === accountId) && t.date > last && t.date <= todayISO()) last = t.date
  return last
}

export function flowsForAccount(txs: Transaction[], accountId: string, month: string) {
  let inflow = 0
  let outflow = 0
  for (const t of txs) {
    if (monthKey(t.date) !== month || t.type === 'adjustment') continue
    const e = txEffect(t, accountId)
    if (e > 0) inflow += e
    else outflow -= e
  }
  return { inflow, outflow }
}

// ─────────────────────────── Net worth ───────────────────────────

export interface Position0 {
  assets: number
  liabilities: number
  net: number
  cash: number
  invested: number
}

export function positionAt(data: AppData, date = todayISO()): Position0 {
  let assets = 0
  let liabilities = 0
  let cash = 0
  let invested = 0
  for (const a of data.accounts) {
    const v = accountValueBase(data, a, date)
    if (v === null) continue
    if (isLiability(a.kind)) liabilities -= v
    else {
      assets += v
      if (isLiquid(a.kind)) cash += v
      else invested += v
    }
  }
  for (const h of data.holdings) {
    if (h.accountId && data.accounts.some((a) => a.id === h.accountId)) continue
    const v = holdingValueAt(h, data.trades, date)
    assets += v
    invested += v
  }
  return { assets, liabilities, net: assets - liabilities, cash, invested }
}

export const netWorthAt = (data: AppData, date: string) => positionAt(data, date).net

export type Range = '7d' | '1m' | '3m' | '6m' | '1y' | '5y' | 'all'
export const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'All' },
]

export function earliestDate(data: AppData) {
  let d = todayISO()
  for (const a of data.accounts) if (a.openingDate < d) d = a.openingDate
  for (const t of data.transactions) if (t.date < d) d = t.date
  for (const t of data.trades) if (t.date < d) d = t.date
  return d
}

/** Sample dates for a time range, ending today. */
export function rangeDates(range: Range, earliest: string, today = todayISO()): string[] {
  const out: string[] = []
  const daily = (n: number) => { for (let i = n; i >= 0; i--) out.push(addDays(today, -i)) }
  const weekly = (weeks: number) => { for (let i = weeks; i >= 0; i--) out.push(addDays(today, -i * 7)) }
  const monthly = (months: number, step = 1) => {
    const cur = today.slice(0, 7)
    for (let i = months; i > 0; i -= step) out.push(monthEnd(addMonths(cur, -i)))
    out.push(today)
  }
  switch (range) {
    case '7d': daily(7); break
    case '1m': daily(30); break
    case '3m': weekly(13); break
    case '6m': weekly(26); break
    case '1y': monthly(12); break
    case '5y': monthly(60); break
    case 'all': {
      const months = Math.max(1, Math.ceil(daysBetween(earliest, today) / 30.44))
      if (months <= 2) daily(Math.max(7, daysBetween(earliest, today)))
      else monthly(months, months > 72 ? 3 : 1)
      break
    }
  }
  return out
}

export function netWorthSeries(data: AppData, range: Range) {
  const dates = rangeDates(range, earliestDate(data))
  return dates.map((d) => ({ date: d, ...positionAt(data, d) }))
}

// ─────────────────────────── Cash flow ───────────────────────────

export interface Flow {
  income: number
  expense: number
  net: number
}

/** Income and spending (base currency) for transactions in [from, to]. Transfers & balance updates excluded. */
export function flowBetween(data: AppData, from: string, to: string, accountId?: string): Flow {
  const ccy = accountCurrencyMap(data)
  let income = 0
  let expense = 0
  for (const t of data.transactions) {
    if (t.date < from || t.date > to) continue
    if (accountId && t.accountId !== accountId) continue
    if (t.type !== 'income' && t.type !== 'expense') continue
    const v = toBase(data, t.amount, ccy.get(t.accountId) ?? data.settings.currency)
    if (v === null) continue
    if (t.type === 'income') income += v
    else expense += v
  }
  return { income, expense, net: income - expense }
}

export interface MonthFlow extends Flow {
  month: string
}

export function monthFlow(data: AppData, month: string, accountId?: string): MonthFlow {
  return { month, ...flowBetween(data, monthStart(month), monthEnd(month), accountId) }
}

export function flowSeries(data: AppData, endMonth: string, count: number, accountId?: string): MonthFlow[] {
  const out: MonthFlow[] = []
  for (let i = count - 1; i >= 0; i--) out.push(monthFlow(data, addMonths(endMonth, -i), accountId))
  return out
}

export function byCategory(data: AppData, type: 'income' | 'expense', from: string, to: string) {
  const ccy = accountCurrencyMap(data)
  const map = new Map<string, number>()
  for (const t of data.transactions) {
    if (t.type !== type || t.date < from || t.date > to) continue
    const v = toBase(data, t.amount, ccy.get(t.accountId) ?? data.settings.currency)
    if (v === null) continue
    map.set(t.category, (map.get(t.category) ?? 0) + v)
  }
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}

export const spendByCategory = (data: AppData, month: string) => byCategory(data, 'expense', monthStart(month), monthEnd(month))

export function largestTransactions(data: AppData, type: 'income' | 'expense', from: string, to: string, n = 5) {
  const ccy = accountCurrencyMap(data)
  return data.transactions
    .filter((t) => t.type === type && t.date >= from && t.date <= to)
    .map((t) => ({ t, base: toBase(data, t.amount, ccy.get(t.accountId) ?? data.settings.currency) ?? 0 }))
    .sort((a, b) => b.base - a.base)
    .slice(0, n)
}

/**
 * Spending velocity: how much had been spent by day N of this month vs by the same day last month.
 */
export function spendingVelocity(data: AppData, today = todayISO()) {
  const m = today.slice(0, 7)
  const day = Number(today.slice(8))
  const prev = addMonths(m, -1)
  const prevLast = Number(monthEnd(prev).slice(8))
  const now = flowBetween(data, monthStart(m), today).expense
  const then = flowBetween(data, monthStart(prev), `${prev}-${String(Math.min(day, prevLast)).padStart(2, '0')}`).expense
  const days = Number(monthEnd(m).slice(8))
  return { now, then, perDay: now / day, projected: (now / day) * days, day }
}

// ─────────────────────────── Investments ───────────────────────────

export function tradesFor(trades: Trade[], holdingId: string) {
  return trades.filter((t) => t.holdingId === holdingId).sort((a, b) => a.date.localeCompare(b.date))
}

export function sharesAt(trades: Trade[], date: string) {
  let s = 0
  for (const t of trades) {
    if (t.date > date) continue
    if (t.kind === 'buy') s += t.shares
    else if (t.kind === 'sell') s -= t.shares
  }
  return Math.max(0, Math.round(s * 1e8) / 1e8)
}

/** Latest known price on or before `date`, using manual/fetched prices and trade prices as observations. */
export function priceAt(h: Holding, trades: Trade[], date: string): number | null {
  let bestDate = ''
  let best: number | null = null
  for (const t of trades) if (t.kind !== 'dividend' && t.holdingId === h.id && t.date <= date && t.date >= bestDate) { bestDate = t.date; best = t.price }
  for (const p of h.prices) if (p.date <= date && p.date >= bestDate) { bestDate = p.date; best = p.price }
  return best
}

export function holdingValueAt(h: Holding, allTrades: Trade[], date: string) {
  const tr = allTrades.filter((t) => t.holdingId === h.id)
  return sharesAt(tr, date) * (priceAt(h, tr, date) ?? 0)
}

export function lastPricePoint(h: Holding, trades: Trade[]) {
  const obs = [
    ...h.prices.map((p) => ({ date: p.date, price: p.price, source: p.source ?? 'manual', fetchedAt: p.fetchedAt })),
    ...trades.filter((t) => t.kind !== 'dividend' && t.holdingId === h.id).map((t) => ({ date: t.date, price: t.price, source: 'trade' as const, fetchedAt: undefined })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  return obs[obs.length - 1] ?? null
}

export interface Position {
  holding: Holding
  shares: number
  avgCost: number
  costBasis: number
  price: number
  value: number
  unrealized: number
  unrealizedPct: number
  realized: number
  dividends: number
  totalInvested: number
  totalReturn: number
  monthPL: number
  monthPct: number
}

/** Average-cost position stats as of today, with P/L for `month`. */
export function position(h: Holding, allTrades: Trade[], month: string, today = todayISO()): Position {
  const trades = tradesFor(allTrades, h.id)
  let shares = 0
  let cost = 0
  let realized = 0
  let dividends = 0
  let totalInvested = 0
  for (const t of trades) {
    if (t.date > today) continue
    if (t.kind === 'buy') {
      shares += t.shares
      cost += t.shares * t.price + t.fees
      totalInvested += t.shares * t.price + t.fees
    } else if (t.kind === 'sell') {
      const avg = shares > 0 ? cost / shares : 0
      const q = Math.min(t.shares, shares)
      realized += q * (t.price - avg) - t.fees
      cost -= q * avg
      shares -= q
    } else dividends += t.price
  }
  if (shares < 1e-9) { shares = 0; cost = 0 }
  const price = priceAt(h, trades, today) ?? 0
  const value = shares * price
  const unrealized = value - cost
  const { pl, pct } = periodReturn(h, trades, monthStart(month), minDate(monthEnd(month), today))
  return {
    holding: h,
    shares,
    avgCost: shares > 0 ? cost / shares : 0,
    costBasis: cost,
    price,
    value,
    unrealized,
    unrealizedPct: cost > 0 ? unrealized / cost : 0,
    realized,
    dividends,
    totalInvested,
    totalReturn: unrealized + realized + dividends,
    monthPL: pl,
    monthPct: pct,
  }
}

/** Money-weighted P/L between start and end (inclusive). */
export function periodReturn(h: Holding, trades: Trade[], start: string, end: string) {
  const own = trades.filter((t) => t.holdingId === h.id)
  const before = dayBefore(start)
  const v0 = sharesAt(own, before) * (priceAt(h, own, before) ?? 0)
  const v1 = sharesAt(own, end) * (priceAt(h, own, end) ?? 0)
  let buys = 0
  let sells = 0
  let divs = 0
  for (const t of own) {
    if (t.date < start || t.date > end) continue
    if (t.kind === 'buy') buys += t.shares * t.price + t.fees
    else if (t.kind === 'sell') sells += t.shares * t.price - t.fees
    else divs += t.price
  }
  const pl = v1 - v0 - buys + sells + divs
  const base = v0 + buys
  return { pl, pct: base > 0 ? pl / base : 0 }
}

export function portfolioReturn(data: AppData, start: string, end: string) {
  let pl = 0
  let base = 0
  for (const h of data.holdings) {
    const own = tradesFor(data.trades, h.id)
    const r = periodReturn(h, own, start, end)
    pl += r.pl
    const before = dayBefore(start)
    base += sharesAt(own, before) * (priceAt(h, own, before) ?? 0)
    for (const t of own) if (t.kind === 'buy' && t.date >= start && t.date <= end) base += t.shares * t.price + t.fees
  }
  return { pl, pct: base > 0 ? pl / base : 0 }
}

export function portfolioValueAt(data: AppData, date: string) {
  let v = 0
  for (const h of data.holdings) v += holdingValueAt(h, data.trades, date)
  return v
}

/** Net new money put into investments (buys − sells) in [from, to]. */
export function netInvested(data: AppData, from: string, to: string) {
  let v = 0
  for (const t of data.trades) {
    if (t.date < from || t.date > to) continue
    if (t.kind === 'buy') v += t.shares * t.price + t.fees
    else if (t.kind === 'sell') v -= t.shares * t.price - t.fees
  }
  return v
}

export function portfolioMonthSeries(data: AppData, endMonth: string, count: number) {
  const today = todayISO()
  const out: { month: string; pl: number; value: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i)
    const end = minDate(monthEnd(m), today)
    out.push({ month: m, pl: portfolioReturn(data, monthStart(m), end).pl, value: portfolioValueAt(data, end) })
  }
  return out
}

/** Monthly return % per holding — for the gain/loss heatmap. */
export function holdingMonthGrid(data: AppData, endMonth: string, count: number) {
  const today = todayISO()
  const months = Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1))
  return data.holdings.map((h) => {
    const own = tradesFor(data.trades, h.id)
    return {
      holding: h,
      cells: months.map((m) => {
        const end = minDate(monthEnd(m), today)
        const held = sharesAt(own, end) > 0 || sharesAt(own, dayBefore(monthStart(m))) > 0
        const r = periodReturn(h, own, monthStart(m), end)
        return { month: m, held, ...r }
      }),
    }
  })
}

// ─────────────────────────── Recurring ───────────────────────────

export function advance(date: string, f: Frequency) {
  switch (f) {
    case 'weekly': return addDays(date, 7)
    case 'fortnightly': return addDays(date, 14)
    case 'monthly': return sameDayNextMonths(date, 1)
    case 'quarterly': return sameDayNextMonths(date, 3)
    case 'yearly': return sameDayNextMonths(date, 12)
  }
}

/** Keeps the original day where possible (31st → last day of shorter months). */
function sameDayNextMonths(date: string, n: number) {
  const day = Number(date.slice(8))
  const m = addMonths(date.slice(0, 7), n)
  const last = Number(monthEnd(m).slice(8))
  return `${m}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/** Creates any transactions that have come due. Returns new transactions and updated rules. */
export function materializeRecurring(rules: RecurringRule[], today = todayISO(), makeId: () => string) {
  const txs: Transaction[] = []
  const next = rules.map((r) => {
    if (!r.active) return r
    let d = r.nextDate
    let guard = 0
    while (d <= today && (!r.endDate || d <= r.endDate) && guard++ < 520) {
      txs.push({ id: makeId(), type: r.type, amount: r.amount, date: d, accountId: r.accountId, toAccountId: r.toAccountId, category: r.category, payee: r.payee, tags: r.tags, recurringId: r.id })
      d = advance(d, r.frequency)
    }
    return d === r.nextDate ? r : { ...r, nextDate: d, active: !r.endDate || d <= r.endDate }
  })
  return { txs, rules: next }
}

/** Upcoming occurrences in the next `days` days. */
export function upcoming(rules: RecurringRule[], days = 30, today = todayISO()) {
  const end = addDays(today, days)
  const out: { rule: RecurringRule; date: string }[] = []
  for (const r of rules) {
    if (!r.active) continue
    let d = r.nextDate
    let guard = 0
    while (d <= end && (!r.endDate || d <= r.endDate) && guard++ < 60) {
      if (d > today) out.push({ rule: r, date: d })
      d = advance(d, r.frequency)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Rough monthly cost of a rule, for "recurring costs per month". */
export function monthlyEquivalent(r: RecurringRule) {
  const f = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.frequency]
  return r.amount * f
}

// ─────────────────────────── Budgets & goals ───────────────────────────

export function budgetUsage(data: AppData, b: Budget, month: string) {
  const from = b.period === 'yearly' ? `${month.slice(0, 4)}-01-01` : monthStart(month)
  const to = b.period === 'yearly' ? `${month.slice(0, 4)}-12-31` : monthEnd(month)
  const spent = byCategory(data, 'expense', from, to).find((c) => c.category === b.category)?.amount ?? 0
  return { spent, remaining: b.limit - spent, ratio: b.limit > 0 ? spent / b.limit : 0 }
}

/** Overall monthly budget: every money-out transaction in the month, across all categories and accounts. */
export function overallBudgetUsage(data: AppData, month: string) {
  const limit = data.settings.overallBudget
  if (!limit || limit <= 0) return null
  const spent = flowBetween(data, monthStart(month), monthEnd(month)).expense
  const allocated = data.budgets.filter((b) => b.period === 'monthly').reduce((s, b) => s + b.limit, 0)
  return { limit, spent, remaining: limit - spent, ratio: spent / limit, allocated, unallocated: limit - allocated }
}

export function goalProgress(data: AppData, g: Goal, today = todayISO()) {
  const acc = g.accountId ? data.accounts.find((a) => a.id === g.accountId) : undefined
  const current = acc ? accountValueBase(data, acc, today) ?? 0 : g.contributions.reduce((s, c) => s + c.amount, 0)
  const ratio = g.target > 0 ? Math.max(0, current / g.target) : 0
  const remaining = Math.max(0, g.target - current)
  let perMonth: number | null = null
  let monthsLeft: number | null = null
  if (g.targetDate && g.targetDate > today) {
    monthsLeft = Math.max(1, daysBetween(today, g.targetDate) / 30.44)
    perMonth = remaining / monthsLeft
  }
  return { current, ratio, remaining, perMonth, monthsLeft, done: current >= g.target, linked: !!acc }
}

// ─────────────────────────── Financial health ───────────────────────────

export interface Metric {
  id: string
  label: string
  value: number | null
  display: string
  status: 'good' | 'ok' | 'watch' | 'none'
  statusLabel: string
  how: string
}

function cv(xs: number[]) {
  if (xs.length < 2) return null
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  if (mean <= 0) return null
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
  return sd / mean
}

/** Months used for averages: the last `n` complete months that have any activity. */
export function completeMonths(data: AppData, n: number, today = todayISO()) {
  const first = earliestDate(data).slice(0, 7)
  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    const m = addMonths(today.slice(0, 7), -i)
    if (m < first) break
    out.push(m)
  }
  return out.reverse()
}

export function healthMetrics(data: AppData, fmt: { money: (n: number) => string; pct: (n: number) => string }, today = todayISO()): Metric[] {
  const m3 = completeMonths(data, 3, today)
  const m6 = completeMonths(data, 6, today)
  const f3 = m3.map((m) => monthFlow(data, m))
  const f6 = m6.map((m) => monthFlow(data, m))
  const inc3 = f3.reduce((s, f) => s + f.income, 0)
  const exp3 = f3.reduce((s, f) => s + f.expense, 0)
  const avgExp = f3.length ? exp3 / f3.length : 0
  const avgNet = f3.length ? (inc3 - exp3) / f3.length : 0
  const pos = positionAt(data, today)
  const liquid = data.accounts.filter((a) => isLiquid(a.kind)).reduce((s, a) => s + (accountValueBase(data, a, today) ?? 0), 0)
  const n = f3.length
  const window = n ? `your last ${n} full month${n === 1 ? '' : 's'}` : 'full months'

  const savings = inc3 > 0 ? (inc3 - exp3) / inc3 : null
  const cover = avgExp > 0 ? liquid / avgExp : null
  const dta = pos.assets > 0 ? pos.liabilities / pos.assets : null
  const incCv = cv(f6.map((f) => f.income))
  const expCv = cv(f6.map((f) => f.expense))
  const investedShare = pos.assets > 0 ? pos.invested / pos.assets : null

  return [
    {
      id: 'savings', label: 'Savings rate', value: savings,
      display: savings === null ? '—' : fmt.pct(savings),
      status: savings === null ? 'none' : savings >= 0.2 ? 'good' : savings >= 0.05 ? 'ok' : 'watch',
      statusLabel: savings === null ? 'Needs a full month of income' : savings >= 0.2 ? '20% or more' : savings >= 0.05 ? 'Positive' : savings < 0 ? 'Spending more than income' : 'Under 5%',
      how: `(Money in − money out) ÷ money in, over ${window}. Transfers between your accounts aren’t counted.`,
    },
    {
      id: 'cashflow', label: 'Average monthly cash flow', value: n ? avgNet : null,
      display: n ? fmt.money(avgNet) : '—',
      status: !n ? 'none' : avgNet > 0 ? 'good' : 'watch',
      statusLabel: !n ? 'Needs a full month' : avgNet > 0 ? 'More in than out' : 'More out than in',
      how: `Average of (money in − money out) for ${window}.`,
    },
    {
      id: 'emergency', label: 'Emergency fund coverage', value: cover,
      display: cover === null ? '—' : `${cover.toFixed(1)} months`,
      status: cover === null ? 'none' : cover >= 6 ? 'good' : cover >= 3 ? 'ok' : 'watch',
      statusLabel: cover === null ? 'Needs spending history' : cover >= 6 ? '6+ months' : cover >= 3 ? '3–6 months' : 'Under 3 months',
      how: `Money in current, savings, debit, business and cash accounts (${fmt.money(liquid)}) ÷ average monthly spending over ${window} (${fmt.money(avgExp)}).`,
    },
    {
      id: 'dta', label: 'Debt to assets', value: dta,
      display: dta === null ? '—' : fmt.pct(dta),
      status: dta === null ? 'none' : dta <= 0.1 ? 'good' : dta <= 0.4 ? 'ok' : 'watch',
      statusLabel: dta === null ? 'Add an account' : dta <= 0.1 ? 'Low' : dta <= 0.4 ? 'Moderate' : 'High',
      how: `What you owe on cards and loans (${fmt.money(pos.liabilities)}) ÷ everything you own (${fmt.money(pos.assets)}).`,
    },
    {
      id: 'invested', label: 'Share of assets invested', value: investedShare,
      display: investedShare === null ? '—' : fmt.pct(investedShare),
      status: investedShare === null ? 'none' : 'ok',
      statusLabel: investedShare === null ? 'Add an account' : 'For information',
      how: `Investments, ISAs and pensions (${fmt.money(pos.invested)}) ÷ total assets. There’s no “right” number — it depends on your goals.`,
    },
    {
      id: 'income', label: 'Income stability', value: incCv,
      display: incCv === null ? '—' : incCv < 0.1 ? 'Steady' : incCv < 0.3 ? 'Some variation' : 'Variable',
      status: incCv === null ? 'none' : incCv < 0.1 ? 'good' : incCv < 0.3 ? 'ok' : 'watch',
      statusLabel: incCv === null ? 'Needs 2+ full months' : `Varies ±${fmt.pct(incCv)} month to month`,
      how: `How much your monthly income moves around (standard deviation ÷ average) over the last ${f6.length} full months.`,
    },
    {
      id: 'spending', label: 'Spending consistency', value: expCv,
      display: expCv === null ? '—' : expCv < 0.1 ? 'Very consistent' : expCv < 0.25 ? 'Fairly consistent' : 'Up and down',
      status: expCv === null ? 'none' : expCv < 0.25 ? 'good' : 'ok',
      statusLabel: expCv === null ? 'Needs 2+ full months' : `Varies ±${fmt.pct(expCv)} month to month`,
      how: `How much your monthly spending moves around (standard deviation ÷ average) over the last ${f6.length} full months.`,
    },
  ]
}
