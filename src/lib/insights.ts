/**
 * Descriptive insights computed only from the user's own data.
 * They describe what happened — they never recommend what to buy, sell or do with investments.
 */
import type { AppData } from './types'
import { addMonths, dayBefore, money, monthEnd, monthLabel, monthStart, pct, todayISO } from './format'
import { overallBudgetUsage, budgetUsage, byCategory, cashBalanceAt, flowBetween, largestTransactions, monthFlow, portfolioReturn, position } from './calc'
import { isLiability } from './meta'

export type InsightIcon = 'up' | 'down' | 'budget' | 'card' | 'trophy' | 'piggy' | 'repeat' | 'receipt' | 'chart' | 'streak'

export interface Insight {
  id: string
  tone: 'good' | 'bad' | 'neutral'
  icon: InsightIcon
  title: string
  body: string
  /** How the number was worked out. */
  why: string
}

export function buildInsights(data: AppData, month: string, today = todayISO()): Insight[] {
  const out: Insight[] = []
  const prev = addMonths(month, -1)
  const isCurrent = month === today.slice(0, 7)
  const cutoff = (m: string) => {
    // compare like with like: in the current month, only compare up to the same day
    if (!isCurrent) return monthEnd(m)
    const d = Math.min(Number(today.slice(8)), Number(monthEnd(m).slice(8)))
    return `${m}-${String(d).padStart(2, '0')}`
  }
  const now = flowBetween(data, monthStart(month), cutoff(month))
  const then = flowBetween(data, monthStart(prev), cutoff(prev))
  const ml = monthLabel(month, 'short')
  const pl = monthLabel(prev, 'short')
  const span = isCurrent ? `1–${Number(today.slice(8))} ${ml} vs the same days of ${pl}` : `${ml} vs ${pl}`

  // Total spending change
  if (then.expense > 0 && now.expense > 0) {
    const diff = now.expense - then.expense
    if (Math.abs(diff) >= 10) {
      out.push({
        id: 'spend-total', tone: diff < 0 ? 'good' : 'neutral', icon: diff < 0 ? 'down' : 'up',
        title: `Your spending is ${money(Math.abs(diff), { cents: false })} ${diff < 0 ? 'lower' : 'higher'} than last month`,
        body: `${money(now.expense, { cents: false })} so far vs ${money(then.expense, { cents: false })}.`,
        why: `Money out, ${span}. Transfers between your accounts aren’t counted.`,
      })
    }
  }

  // Biggest category mover
  const catsNow = byCategory(data, 'expense', monthStart(month), cutoff(month))
  const catsThen = byCategory(data, 'expense', monthStart(prev), cutoff(prev))
  let mover: { cat: string; diff: number; now: number; before: number } | null = null
  for (const c of catsNow) {
    const before = catsThen.find((p) => p.category === c.category)?.amount ?? 0
    const diff = c.amount - before
    if (before > 0 && (!mover || Math.abs(diff) > Math.abs(mover.diff))) mover = { cat: c.category, diff, now: c.amount, before }
  }
  if (mover && Math.abs(mover.diff) > 20) {
    out.push({
      id: 'mover', tone: mover.diff > 0 ? 'neutral' : 'good', icon: mover.diff > 0 ? 'up' : 'down',
      title: `${mover.cat} ${mover.diff > 0 ? 'up' : 'down'} ${money(Math.abs(mover.diff), { cents: false })}`,
      body: `${money(mover.now, { cents: false })} in ${ml} vs ${money(mover.before, { cents: false })} in ${pl}.`,
      why: `The category whose spending changed the most, ${span}.`,
    })
  }

  // Subscriptions
  const subs = byCategory(data, 'expense', monthStart(month), monthEnd(month)).find((c) => c.category === 'Subscriptions')?.amount ?? 0
  if (subs > 0) {
    const total = flowBetween(data, monthStart(month), monthEnd(month)).expense
    out.push({
      id: 'subs', tone: 'neutral', icon: 'repeat',
      title: `Subscriptions came to ${money(subs, { cents: false })}`,
      body: `That’s ${pct(subs / (total || 1))} of everything you spent in ${ml}.`,
      why: 'Sum of transactions in the Subscriptions category this month.',
    })
  }

  // Overall budget (calm wording)
  const ov = overallBudgetUsage(data, month)
  if (ov && ov.ratio >= 0.8) {
    out.push({
      id: 'budget-overall', tone: ov.ratio > 1 ? 'bad' : 'neutral', icon: 'budget',
      title: ov.ratio > 1 ? `Spending is ${money(ov.spent - ov.limit, { cents: false })} over your overall budget` : `You’ve used ${Math.round(ov.ratio * 100)}% of your overall budget`,
      body: `${money(ov.spent, { cents: false })} of ${money(ov.limit, { cents: false })} in ${ml}.`,
      why: 'All money out this month ÷ your overall monthly limit. Transfers aren’t counted.',
    })
  }

  // Budgets (calm wording)
  for (const b of data.budgets) {
    const u = budgetUsage(data, b, month)
    if (u.ratio >= 0.8) {
      out.push({
        id: 'budget-' + b.category, tone: u.ratio > 1 ? 'bad' : 'neutral', icon: 'budget',
        title: u.ratio > 1 ? `${b.category} is ${money(u.spent - b.limit, { cents: false })} over budget` : `You’ve used ${Math.round(u.ratio * 100)}% of your ${b.category.toLowerCase()} budget`,
        body: `${money(u.spent, { cents: false })} of ${money(b.limit, { cents: false })} ${b.period === 'yearly' ? 'this year' : `in ${ml}`}.`,
        why: `Spending in ${b.category} ÷ your ${b.period} limit.`,
      })
    }
  }

  // Savings streak
  const savers = data.accounts.filter((a) => a.kind === 'savings')
  if (savers.length) {
    let streak = 0
    for (let i = 0; i < 24; i++) {
      const m = addMonths(month, -i)
      const end = i === 0 && isCurrent ? today : monthEnd(m)
      const startBal = savers.reduce((s, a) => s + cashBalanceAt(a, data.transactions, monthStart(m) > a.openingDate ? dayBefore(monthStart(m)) : a.openingDate), 0)
      const endBal = savers.reduce((s, a) => s + cashBalanceAt(a, data.transactions, end), 0)
      if (endBal > startBal) streak++
      else break
    }
    if (streak >= 2) {
      out.push({
        id: 'streak', tone: 'good', icon: 'streak',
        title: `Your savings have grown ${streak} months in a row`,
        body: `Savings accounts ended each month higher than they started.`,
        why: 'Month-start vs month-end balance of your savings accounts.',
      })
    }
  }

  // Credit utilisation
  for (const a of data.accounts) {
    if (a.kind !== 'credit' || !a.creditLimit || !isLiability(a.kind)) continue
    const owed = -cashBalanceAt(a, data.transactions, today)
    const u = owed / a.creditLimit
    if (u > 0.3) {
      out.push({
        id: 'util-' + a.id, tone: 'neutral', icon: 'card',
        title: `${a.name} is at ${Math.round(u * 100)}% of its limit`,
        body: `${money(owed, { cents: false, currency: a.currency })} owed of ${money(a.creditLimit, { cents: false, currency: a.currency })}.`,
        why: 'Amount owed today ÷ the credit limit you entered.',
      })
    }
  }

  // Portfolio
  if (data.holdings.length) {
    const r = portfolioReturn(data, monthStart(month), isCurrent ? today : monthEnd(month))
    if (Math.abs(r.pl) >= 1) {
      out.push({
        id: 'portfolio', tone: r.pl >= 0 ? 'good' : 'bad', icon: 'chart',
        title: `Your investments ${r.pl >= 0 ? 'increased' : 'decreased'} by ${money(Math.abs(r.pl), { cents: false })} this month`,
        body: `${pct(r.pct, { sign: true })} in ${ml}, including dividends and sales.`,
        why: 'End value − start value − money added + money taken out + dividends, across every holding.',
      })
    }
    const ps = data.holdings.map((h) => position(h, data.trades, month, today)).filter((p) => p.monthPL !== 0)
    if (ps.length > 1) {
      const best = ps.reduce((a, b) => (b.monthPL > a.monthPL ? b : a))
      if (best.monthPL > 0) out.push({ id: 'best', tone: 'good', icon: 'trophy', title: `${best.holding.symbol} added the most`, body: `${money(best.monthPL, { sign: true, cents: false })} (${pct(best.monthPct, { sign: true })}) in ${ml}.`, why: 'The holding with the largest gain this month.' })
    }
  }

  // Savings rate
  const f = monthFlow(data, month)
  if (f.income > 0) {
    const r = f.net / f.income
    out.push({
      id: 'rate', tone: r >= 0.2 ? 'good' : r < 0 ? 'bad' : 'neutral', icon: 'piggy',
      title: r >= 0 ? `You kept ${pct(r)} of what came in` : `${money(-f.net, { cents: false })} more went out than came in`,
      body: r >= 0 ? `${money(f.net, { cents: false })} left over in ${ml}.` : `Money out was higher than money in for ${ml}.`,
      why: '(Money in − money out) ÷ money in for the month.',
    })
  }

  // Largest purchase
  const big = largestTransactions(data, 'expense', monthStart(month), monthEnd(month), 1)[0]
  if (big && big.base > 0) {
    out.push({ id: 'largest', tone: 'neutral', icon: 'receipt', title: `Largest purchase: ${big.t.payee}`, body: `${money(big.base, { cents: false })} on ${big.t.date.slice(8)} ${ml}.`, why: 'The single biggest money-out transaction this month.' })
  }

  return out
}
