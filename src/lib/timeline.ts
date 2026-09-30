import type { AppData } from './types'
import { addMonths, money, monthEnd, monthStart, todayISO } from './format'
import { portfolioReturn, toBase } from './calc'
import { isLiability } from './meta'

export type EventKind = 'income' | 'large' | 'investment' | 'dividend' | 'repayment' | 'goal' | 'portfolio' | 'balance'

export interface TimelineEvent {
  id: string
  date: string
  kind: EventKind
  title: string
  detail: string
  amount?: number
  positive?: boolean
  /** What to open when clicked */
  ref?: { type: 'tx' | 'holding' | 'goal'; id: string }
}

export const EVENT_LABELS: Record<EventKind, string> = {
  income: 'Money in',
  large: 'Large purchases',
  investment: 'Investing',
  dividend: 'Dividends',
  repayment: 'Card repayments',
  goal: 'Goals',
  portfolio: 'Portfolio months',
  balance: 'Balance updates',
}

/** Notable events, newest first. "Large" = over 3× your median purchase and at least 100. */
export function buildTimeline(data: AppData, today = todayISO()): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  const acc = new Map(data.accounts.map((a) => [a.id, a]))
  const base = (amt: number, accId: string) => toBase(data, amt, acc.get(accId)?.currency ?? data.settings.currency) ?? amt

  const exp = data.transactions.filter((t) => t.type === 'expense').map((t) => base(t.amount, t.accountId)).sort((a, b) => a - b)
  const median = exp.length ? exp[Math.floor(exp.length / 2)] : 0
  const threshold = Math.max(100, median * 3)

  for (const t of data.transactions) {
    if (t.date > today) continue
    const a = acc.get(t.accountId)
    const v = base(t.amount, t.accountId)
    if (t.type === 'income' && (t.category === 'Salary' || v >= threshold)) {
      ev.push({ id: t.id, date: t.date, kind: 'income', title: t.payee, detail: `${t.category} · ${a?.name ?? ''}`, amount: v, positive: true, ref: { type: 'tx', id: t.id } })
    } else if (t.type === 'income' && t.category === 'Dividends') {
      ev.push({ id: t.id, date: t.date, kind: 'dividend', title: t.payee, detail: 'Dividend', amount: v, positive: true, ref: { type: 'tx', id: t.id } })
    } else if (t.type === 'expense' && v >= threshold) {
      ev.push({ id: t.id, date: t.date, kind: 'large', title: t.payee, detail: `${t.category} · ${a?.name ?? ''}`, amount: -v, ref: { type: 'tx', id: t.id } })
    } else if (t.type === 'transfer' && t.toAccountId && isLiability(acc.get(t.toAccountId)?.kind ?? 'other')) {
      ev.push({ id: t.id, date: t.date, kind: 'repayment', title: `Paid ${acc.get(t.toAccountId)?.name ?? 'card'}`, detail: `From ${a?.name ?? ''}`, amount: base(t.amount, t.accountId), ref: { type: 'tx', id: t.id } })
    } else if (t.type === 'adjustment') {
      ev.push({ id: t.id, date: t.date, kind: 'balance', title: `${a?.name ?? 'Account'} updated`, detail: t.note ?? 'Balance update', amount: v, positive: v >= 0, ref: { type: 'tx', id: t.id } })
    }
  }

  for (const t of data.trades) {
    if (t.date > today) continue
    const h = data.holdings.find((x) => x.id === t.holdingId)
    if (!h) continue
    if (t.kind === 'dividend') ev.push({ id: t.id, date: t.date, kind: 'dividend', title: `${h.symbol} dividend`, detail: h.name, amount: t.price, positive: true, ref: { type: 'holding', id: h.id } })
    else ev.push({ id: t.id, date: t.date, kind: 'investment', title: `${t.kind === 'buy' ? 'Bought' : 'Sold'} ${h.symbol}`, detail: `${+t.shares.toFixed(6)} × ${money(t.price, { reveal: false })}`, amount: t.shares * t.price * (t.kind === 'buy' ? -1 : 1), ref: { type: 'holding', id: h.id } })
  }

  for (const g of data.goals) {
    for (const c of g.contributions) ev.push({ id: c.id, date: c.date, kind: 'goal', title: g.name, detail: c.note ?? 'Added to goal', amount: c.amount, positive: true, ref: { type: 'goal', id: g.id } })
  }

  if (data.holdings.length) {
    const cur = today.slice(0, 7)
    for (let i = 1; i <= 24; i++) {
      const m = addMonths(cur, -i)
      const r = portfolioReturn(data, monthStart(m), monthEnd(m))
      if (Math.abs(r.pl) >= 1) ev.push({ id: 'pf-' + m, date: monthEnd(m), kind: 'portfolio', title: `Portfolio ${r.pl >= 0 ? 'gained' : 'lost'} this month`, detail: `${(r.pct * 100).toFixed(1)}% including dividends`, amount: r.pl, positive: r.pl >= 0 })
    }
  }

  return ev.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
