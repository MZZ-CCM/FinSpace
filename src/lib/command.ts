/**
 * Plain-English commands for the command palette, e.g.
 *   "add £45 groceries"   "spent 12.50 on lunch at Luna"   "income 2000 salary"
 *   "add 500 to savings"  "show spending this month"       "open investments"
 * Commands never change data directly — they open a pre-filled form the user confirms.
 */
import type { AppData, Transaction } from './types'
import type { Route } from './ui'
import { expenseCategories, incomeCategories } from './meta'
import { money, todayISO } from './format'

export type Intent =
  | { kind: 'tx'; label: string; defaults: Partial<Transaction> }
  | { kind: 'nav'; label: string; route: Route }

const SYNONYMS: Record<string, string> = {
  food: 'Groceries', grocery: 'Groceries', supermarket: 'Groceries',
  dinner: 'Dining', lunch: 'Dining', breakfast: 'Dining', coffee: 'Dining', restaurant: 'Dining', takeaway: 'Dining', drinks: 'Dining',
  uber: 'Transport', taxi: 'Transport', train: 'Transport', bus: 'Transport', fuel: 'Transport', petrol: 'Transport', gas: 'Transport', parking: 'Transport',
  rent: 'Housing', mortgage: 'Housing',
  netflix: 'Subscriptions', spotify: 'Subscriptions', subscription: 'Subscriptions',
  electric: 'Bills & utilities', electricity: 'Bills & utilities', water: 'Bills & utilities', internet: 'Bills & utilities', phone: 'Bills & utilities',
  gym: 'Health', doctor: 'Health', pharmacy: 'Health',
  flight: 'Travel', hotel: 'Travel', holiday: 'Travel',
  clothes: 'Shopping', amazon: 'Shopping',
  cinema: 'Entertainment', movie: 'Entertainment', concert: 'Entertainment',
  paycheck: 'Salary', wages: 'Salary', pay: 'Salary', dividend: 'Dividends', interest: 'Interest', rent_income: 'Rental income',
}

const PAGES: { words: string[]; label: string; route: Route }[] = [
  { words: ['overview', 'home', 'dashboard'], label: 'Overview', route: { page: 'overview' } },
  { words: ['accounts', 'cards', 'account'], label: 'Accounts & cards', route: { page: 'accounts' } },
  { words: ['transactions', 'money', 'activity'], label: 'Money', route: { page: 'money' } },
  { words: ['investments', 'portfolio', 'stocks', 'holdings'], label: 'Investments', route: { page: 'investments' } },
  { words: ['budgets', 'budget'], label: 'Budgets', route: { page: 'budgets' } },
  { words: ['goals', 'goal'], label: 'Goals', route: { page: 'goals' } },
  { words: ['insights', 'health', 'timeline'], label: 'Insights', route: { page: 'insights' } },
  { words: ['reports', 'report'], label: 'Reports', route: { page: 'reports' } },
  { words: ['settings', 'backup'], label: 'Settings', route: { page: 'settings' } },
]

const AMOUNT = /([£$€]\s?)?(\d[\d,]*(?:\.\d{1,2})?)\s?(k\b)?/i

export function parseCommand(input: string, data: AppData): Intent | null {
  const q = input.trim().toLowerCase()
  if (!q) return null
  const month = todayISO().slice(0, 7)

  // navigation / reporting
  const nav = q.match(/^(show|open|go to|view)\s+(.*)$/)
  if (nav) {
    const rest = nav[2]
    if (/spend|spent|expense|money out/.test(rest)) return { kind: 'nav', label: `Show money out${/this month/.test(rest) ? ' this month' : ''}`, route: { page: 'money', type: 'expense', month: /this month/.test(rest) ? month : undefined } }
    if (/income|earn|money in/.test(rest)) return { kind: 'nav', label: `Show money in${/this month/.test(rest) ? ' this month' : ''}`, route: { page: 'money', type: 'income', month: /this month/.test(rest) ? month : undefined } }
    const acc = data.accounts.find((a) => rest.includes(a.name.toLowerCase()))
    if (acc) return { kind: 'nav', label: `Open ${acc.name}`, route: { page: 'accounts', id: acc.id } }
    const h = data.holdings.find((x) => rest.split(/\s+/).includes(x.symbol.toLowerCase()))
    if (h) return { kind: 'nav', label: `Open ${h.symbol}`, route: { page: 'investments', id: h.id } }
    const p = PAGES.find((pg) => pg.words.some((w) => rest.includes(w)))
    if (p) return { kind: 'nav', label: `Open ${p.label}`, route: p.route }
    return null
  }

  const m = q.match(AMOUNT)
  if (!m) return null
  let amount = parseFloat(m[2].replace(/,/g, ''))
  if (m[3]) amount *= 1000
  if (!(amount > 0)) return null
  const words = q.replace(m[0], ' ').replace(/\s+/g, ' ').trim()

  // transfer: "add 500 to savings", "move 200 to isa", "pay 300 to credit card"
  const to = words.match(/\b(?:to|into)\s+(.+?)(?:\s+from\s+(.+))?$/)
  if (to && /^(add|move|transfer|put|pay|save)\b/.test(words)) {
    const target = findAccount(data, to[1])
    if (target) {
      const from = (to[2] && findAccount(data, to[2])) || data.accounts.find((a) => a.kind === 'checking' && a.id !== target.id) || data.accounts.find((a) => a.id !== target.id)
      return { kind: 'tx', label: `Move ${fmt(amount)} to ${target.name}${from ? ` from ${from.name}` : ''}`, defaults: { type: 'transfer', amount, toAccountId: target.id, accountId: from?.id, payee: /pay/.test(words) ? 'Card repayment' : `To ${target.name}` } }
    }
  }

  const isIncome = /\b(income|earned|received|got paid|salary|paid me|refund)\b/.test(words)
  const cats = isIncome ? incomeCategories(data.settings.customCategories) : expenseCategories(data.settings.customCategories)
  let category = cats.find((c) => words.includes(c.name.toLowerCase()) || words.split(/\s+/).includes(c.name.toLowerCase().split(' ')[0]))?.name
  if (!category) for (const w of words.split(/[^a-z]+/)) if (SYNONYMS[w] && cats.some((c) => c.name === SYNONYMS[w])) { category = SYNONYMS[w]; break }
  const at = words.match(/\b(?:at|from)\s+([a-z0-9&' .-]+)$/)
  const typedPayee = at ? at[1].trim() : undefined
  // reuse the exact spelling of a payee you've used before
  const known = typedPayee ? data.transactions.find((t) => t.payee.toLowerCase() === typedPayee.toLowerCase())?.payee : undefined
  const payee = known ?? (typedPayee ? titleCase(typedPayee) : undefined)
  const fromAcc = words.match(/\b(?:on|with|using)\s+(?:my\s+)?(.+?)(?:\s+at\s+|$)/)
  const account = fromAcc ? findAccount(data, fromAcc[1]) : undefined

  return {
    kind: 'tx',
    label: `${isIncome ? 'Add money in' : 'Add money out'}: ${fmt(amount)}${category ? ` · ${category}` : ''}${payee ? ` · ${payee}` : ''}`,
    defaults: { type: isIncome ? 'income' : 'expense', amount, category, payee, accountId: account?.id },
  }
}

function findAccount(data: AppData, s: string) {
  const t = s.trim().toLowerCase()
  return (
    data.accounts.find((a) => a.name.toLowerCase() === t) ??
    data.accounts.find((a) => a.name.toLowerCase().includes(t) || t.includes(a.name.toLowerCase())) ??
    data.accounts.find((a) => a.kind === (t.includes('saving') ? 'savings' : t.includes('card') || t.includes('credit') ? 'credit' : t.includes('isa') ? 'isa' : t.includes('pension') ? 'pension' : t.includes('cash') ? 'cash' : '__'))
  )
}

const titleCase = (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase())
const fmt = (n: number) => money(n, { cents: n % 1 !== 0, reveal: true })
