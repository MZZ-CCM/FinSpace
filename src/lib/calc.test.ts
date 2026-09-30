import { describe, expect, it } from 'vitest'
import type { Account, AppData, Holding, RecurringRule, Trade, Transaction } from './types'
import { EMPTY, migrate } from './migrate'
import {
  accountValueBase, advance, budgetUsage, cashBalanceAt, flowBetween, goalProgress, healthMetrics, materializeRecurring,
  missingRates, monthFlow, overallBudgetUsage, netInvested, periodReturn, portfolioReturn, position, positionAt, rangeDates, upcoming,
} from './calc'
import { guessDateFormat, parseAmount, parseCSV, parseDate } from './csv'
import { reducer } from './store'

let n = 0
const id = () => `id${++n}`
const acc = (p: Partial<Account>): Account => ({ id: id(), name: 'A', kind: 'checking', currency: 'GBP', skin: 'obsidian', openingBalance: 0, openingDate: '2026-01-01', ...p })
const tx = (p: Partial<Transaction>): Transaction => ({ id: id(), type: 'expense', amount: 0, date: '2026-03-10', accountId: '', category: 'Other', payee: 'x', ...p })
const data = (p: Partial<AppData>): AppData => ({ ...EMPTY, ...p, settings: { ...EMPTY.settings, currency: 'GBP', ...(p.settings ?? {}) } })
const fmt = { money: (x: number) => x.toFixed(2), pct: (x: number) => (x * 100).toFixed(1) + '%' }

describe('account balances', () => {
  it('applies income, expenses and adjustments', () => {
    const a = acc({ openingBalance: 1000 })
    const txs = [tx({ type: 'income', amount: 500, accountId: a.id }), tx({ type: 'expense', amount: 200, accountId: a.id }), tx({ type: 'adjustment', amount: -50, accountId: a.id })]
    expect(cashBalanceAt(a, txs)).toBe(1250)
  })

  it('treats credit cards as debt: spending increases what you owe, repayments reduce it', () => {
    const card = acc({ kind: 'credit', openingBalance: 300 })
    const cur = acc({ openingBalance: 1000 })
    const txs = [tx({ type: 'expense', amount: 100, accountId: card.id }), tx({ type: 'transfer', amount: 250, accountId: cur.id, toAccountId: card.id })]
    expect(cashBalanceAt(card, txs)).toBe(-150)
    expect(cashBalanceAt(cur, txs)).toBe(750)
  })

  it('ignores transactions after the date asked for', () => {
    const a = acc({ openingBalance: 100 })
    expect(cashBalanceAt(a, [tx({ type: 'income', amount: 50, accountId: a.id, date: '2026-05-01' })], '2026-04-30')).toBe(100)
  })
})

describe('transfers are never income or spending', () => {
  it('excludes transfers and adjustments from cash flow', () => {
    const a = acc({ openingBalance: 1000 })
    const b = acc({ kind: 'savings' })
    const d = data({
      accounts: [a, b],
      transactions: [
        tx({ type: 'income', amount: 3000, accountId: a.id }),
        tx({ type: 'expense', amount: 800, accountId: a.id }),
        tx({ type: 'transfer', amount: 500, accountId: a.id, toAccountId: b.id }),
        tx({ type: 'adjustment', amount: 99, accountId: b.id }),
      ],
    })
    expect(monthFlow(d, '2026-03')).toMatchObject({ income: 3000, expense: 800, net: 2200 })
  })

  it('does not change net worth when moving money between your accounts', () => {
    const a = acc({ openingBalance: 1000 })
    const b = acc({ kind: 'savings', openingBalance: 0 })
    const before = positionAt(data({ accounts: [a, b] }), '2026-12-31').net
    const after = positionAt(data({ accounts: [a, b], transactions: [tx({ type: 'transfer', amount: 400, accountId: a.id, toAccountId: b.id })] }), '2026-12-31').net
    expect(after).toBe(before)
  })
})

describe('net worth', () => {
  it('splits assets and liabilities', () => {
    const d = data({ accounts: [acc({ openingBalance: 2000 }), acc({ kind: 'credit', openingBalance: 500 }), acc({ kind: 'loan', openingBalance: 10000 }), acc({ kind: 'pension', openingBalance: 30000 })] })
    const p = positionAt(d, '2026-06-01')
    expect(p.assets).toBe(32000)
    expect(p.liabilities).toBe(10500)
    expect(p.net).toBe(21500)
    expect(p.cash).toBe(2000)
    expect(p.invested).toBe(30000)
  })

  it('counts holdings linked to an account once, inside that account', () => {
    const isa = acc({ kind: 'isa', openingBalance: 100 })
    const h: Holding = { id: 'h', symbol: 'X', name: 'X', assetType: 'etf', accountId: isa.id, prices: [{ date: '2026-02-01', price: 20 }] }
    const trades: Trade[] = [{ id: 't', holdingId: 'h', kind: 'buy', date: '2026-01-15', shares: 10, price: 10, fees: 0 }]
    const d = data({ accounts: [isa], holdings: [h], trades })
    expect(accountValueBase(d, isa, '2026-03-01')).toBe(300)
    expect(positionAt(d, '2026-03-01').assets).toBe(300)
  })
})

describe('currencies', () => {
  it('leaves out accounts with no exchange rate instead of guessing', () => {
    const usd = acc({ currency: 'USD', openingBalance: 1000 })
    const d = data({ accounts: [acc({ openingBalance: 500 }), usd] })
    expect(missingRates(d)).toEqual(['USD'])
    expect(positionAt(d).net).toBe(500)
  })

  it('converts with the stored rate', () => {
    const usd = acc({ currency: 'USD', openingBalance: 1000 })
    const d = data({ accounts: [usd], settings: { ...EMPTY.settings, currency: 'GBP', fx: { USD: { rate: 0.75, date: '2026-09-01', source: 'manual' } } } })
    expect(positionAt(d).net).toBe(750)
    const d2 = { ...d, transactions: [tx({ type: 'expense', amount: 100, accountId: usd.id })] }
    expect(flowBetween(d2, '2026-03-01', '2026-03-31').expense).toBe(75)
  })

  it('handles cross-currency transfers using the amount received', () => {
    const gbp = acc({ openingBalance: 1000 })
    const eur = acc({ currency: 'EUR' })
    const t = tx({ type: 'transfer', amount: 100, toAmount: 117, accountId: gbp.id, toAccountId: eur.id })
    expect(cashBalanceAt(gbp, [t])).toBe(900)
    expect(cashBalanceAt(eur, [t])).toBe(117)
  })
})

describe('investments', () => {
  const h: Holding = { id: 'h', symbol: 'AAPL', name: 'Apple', assetType: 'stock', prices: [{ date: '2026-03-31', price: 120 }, { date: '2026-04-30', price: 150 }] }
  const trades: Trade[] = [
    { id: '1', holdingId: 'h', kind: 'buy', date: '2026-03-01', shares: 10, price: 100, fees: 5 },
    { id: '2', holdingId: 'h', kind: 'buy', date: '2026-03-15', shares: 10, price: 110, fees: 5 },
    { id: '3', holdingId: 'h', kind: 'sell', date: '2026-04-10', shares: 5, price: 140, fees: 0 },
    { id: '4', holdingId: 'h', kind: 'dividend', date: '2026-04-20', shares: 0, price: 12, fees: 0 },
  ]

  it('uses average cost for realised gains and remaining cost basis', () => {
    const p = position(h, trades, '2026-04', '2026-04-30')
    // avg cost = (1005 + 1105) / 20 = 105.5
    expect(p.shares).toBe(15)
    expect(p.avgCost).toBeCloseTo(105.5)
    expect(p.realized).toBeCloseTo(5 * (140 - 105.5))
    expect(p.dividends).toBe(12)
    expect(p.value).toBe(15 * 150)
    expect(p.unrealized).toBeCloseTo(15 * 150 - 15 * 105.5)
    expect(p.totalInvested).toBe(2110)
  })

  it('calculates monthly P/L as value change net of money added or taken out', () => {
    // April: start 20 × 120 = 2400, end 15 × 150 = 2250, sold 700, dividend 12 → 2250 − 2400 + 700 + 12 = 562
    expect(periodReturn(h, trades, '2026-04-01', '2026-04-30').pl).toBeCloseTo(562)
    // March: start 0, end 20 × 120 = 2400, bought 2110 → 290
    expect(periodReturn(h, trades, '2026-03-01', '2026-03-31').pl).toBeCloseTo(290)
    expect(portfolioReturn(data({ holdings: [h], trades }), '2026-03-01', '2026-04-30').pl).toBeCloseTo(852)
  })

  it('tracks net money invested', () => {
    expect(netInvested(data({ holdings: [h], trades }), '2026-03-01', '2026-04-30')).toBe(2110 - 700)
  })
})

describe('recurring transactions', () => {
  it('keeps month-end days sensible', () => {
    expect(advance('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advance('2026-01-15', 'fortnightly')).toBe('2026-01-29')
    expect(advance('2026-11-30', 'quarterly')).toBe('2027-02-28')
  })

  it('creates every missed occurrence and moves the next date on', () => {
    const r: RecurringRule = { id: 'r', type: 'expense', amount: 10, accountId: 'a', category: 'Subscriptions', payee: 'Stream', frequency: 'monthly', nextDate: '2026-01-05', active: true }
    const { txs, rules } = materializeRecurring([r], '2026-03-20', id)
    expect(txs.map((t) => t.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05'])
    expect(rules[0].nextDate).toBe('2026-04-05')
    expect(txs.every((t) => t.recurringId === 'r')).toBe(true)
  })

  it('stops at the end date and lists upcoming', () => {
    const r: RecurringRule = { id: 'r', type: 'income', amount: 10, accountId: 'a', category: 'Salary', payee: 'x', frequency: 'weekly', nextDate: '2026-01-01', endDate: '2026-01-15', active: true }
    expect(materializeRecurring([r], '2026-12-31', id).txs).toHaveLength(3)
    expect(upcoming([{ ...r, endDate: undefined }], 14, '2026-01-01').map((u) => u.date)).toEqual(['2026-01-08', '2026-01-15'])
  })
})

describe('budgets, goals and health', () => {
  const a = acc({ openingBalance: 6000 })
  const d = data({
    accounts: [a],
    transactions: [
      tx({ type: 'expense', amount: 150, accountId: a.id, category: 'Dining', date: '2026-03-02' }),
      tx({ type: 'expense', amount: 50, accountId: a.id, category: 'Dining', date: '2026-01-10' }),
      tx({ type: 'income', amount: 2000, accountId: a.id, category: 'Salary', date: '2026-03-01' }),
    ],
  })

  it('measures monthly and yearly budgets', () => {
    expect(budgetUsage(d, { category: 'Dining', limit: 200, period: 'monthly' }, '2026-03')).toMatchObject({ spent: 150, remaining: 50, ratio: 0.75 })
    expect(budgetUsage(d, { category: 'Dining', limit: 1000, period: 'yearly' }, '2026-03').spent).toBe(200)
  })

  it('measures an overall budget across every category, excluding transfers', () => {
    const b = acc({})
    const d2 = { ...d, accounts: [...d.accounts, b], budgets: [{ category: 'Dining', limit: 100, period: 'monthly' as const }], settings: { ...d.settings, overallBudget: 1000 }, transactions: [...d.transactions, tx({ type: 'transfer', amount: 500, accountId: a.id, toAccountId: b.id, date: '2026-03-05' })] }
    expect(overallBudgetUsage(d2, '2026-03')).toMatchObject({ limit: 1000, spent: 150, remaining: 850, allocated: 100, unallocated: 900 })
    expect(overallBudgetUsage(d, '2026-03')).toBeNull()
  })

  it('tracks goal progress from contributions or a linked account', () => {
    const g = { id: 'g', name: 'Trip', emoji: '🏝️', target: 1000, targetDate: '2026-12-31', contributions: [{ id: 'c', date: '2026-01-01', amount: 250 }], createdAt: '2026-01-01' }
    const p = goalProgress(d, g, '2026-07-01')
    expect(p.current).toBe(250)
    expect(p.ratio).toBe(0.25)
    expect(p.perMonth).toBeGreaterThan(0)
    expect(goalProgress(d, { ...g, accountId: a.id }, '2026-12-31').done).toBe(true)
  })

  it('explains every health metric', () => {
    const m = healthMetrics(d, fmt, '2026-04-15')
    expect(m.find((x) => x.id === 'savings')!.value).toBeCloseTo((2000 - 200) / 2000)
    expect(m.every((x) => x.how.length > 20)).toBe(true)
  })
})

describe('time ranges', () => {
  it('produces the right number of points', () => {
    expect(rangeDates('7d', '2020-01-01', '2026-09-30')).toHaveLength(8)
    expect(rangeDates('1y', '2020-01-01', '2026-09-30')).toHaveLength(13)
    expect(rangeDates('1y', '2020-01-01', '2026-09-30').slice(-1)[0]).toBe('2026-09-30')
  })
})

describe('store', () => {
  it('deleting an account removes its transactions and unlinks goals/holdings', () => {
    const a = acc({})
    const d = data({ accounts: [a], transactions: [tx({ accountId: a.id })], goals: [{ id: 'g', name: 'x', emoji: '', target: 1, contributions: [], createdAt: '', accountId: a.id }] })
    const r = reducer(d, { type: 'deleteAccount', id: a.id })
    expect(r.transactions).toHaveLength(0)
    expect(r.goals[0].accountId).toBeUndefined()
  })

  it('migrates v1 data', () => {
    const m = migrate({ version: 1, accounts: [{ id: 'a', name: 'A', kind: 'checking' }], transactions: [{ id: 't', type: 'income', amount: 5, date: '2026-01-01', accountId: 'a', payee: 'x', category: 'Investment income' }], budgets: [{ category: 'Dining', limit: 5 }], settings: { currency: 'EUR' } })
    expect(m.version).toBe(2)
    expect(m.accounts[0].currency).toBe('EUR')
    expect(m.transactions[0].category).toBe('Dividends')
    expect(m.budgets[0].period).toBe('monthly')
    expect(m.goals).toEqual([])
  })
})

describe('CSV import', () => {
  it('parses quoted fields, separators and amounts', () => {
    expect(parseCSV('Date,Desc,Amount\n2026-01-02,"Shop, Inc",-12.50\n')).toEqual([['Date', 'Desc', 'Amount'], ['2026-01-02', 'Shop, Inc', '-12.50']])
    expect(parseAmount('(1,234.50)')).toBe(-1234.5)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('£-3.00')).toBe(-3)
  })

  it('reads dates in the chosen format', () => {
    expect(parseDate('31/01/2026', 'DMY')).toBe('2026-01-31')
    expect(parseDate('01/31/26', 'MDY')).toBe('2026-01-31')
    expect(parseDate('13/13/2026', 'DMY')).toBeNull()
    expect(guessDateFormat(['25/03/2026'])).toBe('DMY')
  })
})
