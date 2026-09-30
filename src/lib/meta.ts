import type { AccountKind, AssetType, CustomCategory, Frequency, WidgetId } from './types'

export interface CategoryMeta {
  name: string
  emoji: string
  custom?: boolean
}

export const EXPENSE_CATEGORIES: CategoryMeta[] = [
  { name: 'Housing', emoji: '🏠' },
  { name: 'Bills & utilities', emoji: '💡' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Transport', emoji: '🚇' },
  { name: 'Dining', emoji: '🍜' },
  { name: 'Entertainment', emoji: '🎬' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Travel', emoji: '✈️' },
  { name: 'Subscriptions', emoji: '🔁' },
  { name: 'Health', emoji: '🩺' },
  { name: 'Education', emoji: '📚' },
  { name: 'Insurance', emoji: '🛡️' },
  { name: 'Debt repayment', emoji: '🧾' },
  { name: 'Gifts & giving', emoji: '🎁' },
  { name: 'Fees & interest', emoji: '🏦' },
  { name: 'Other', emoji: '•' },
]

export const INCOME_CATEGORIES: CategoryMeta[] = [
  { name: 'Salary', emoji: '💼' },
  { name: 'Freelance', emoji: '🧑‍💻' },
  { name: 'Business income', emoji: '🏢' },
  { name: 'Dividends', emoji: '📈' },
  { name: 'Interest', emoji: '🪙' },
  { name: 'Rental income', emoji: '🔑' },
  { name: 'Government payments', emoji: '🏛️' },
  { name: 'Refund', emoji: '↩️' },
  { name: 'Gift received', emoji: '🎉' },
  { name: 'Other income', emoji: '➕' },
]

export const TRANSFER_CATEGORY = 'Transfer'
export const ADJUSTMENT_CATEGORY = 'Balance update'

export function expenseCategories(custom: CustomCategory[] = []): CategoryMeta[] {
  return [...EXPENSE_CATEGORIES.slice(0, -1), ...custom.filter((c) => c.kind === 'expense').map((c) => ({ ...c, custom: true })), EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]]
}
export function incomeCategories(custom: CustomCategory[] = []): CategoryMeta[] {
  return [...INCOME_CATEGORIES.slice(0, -1), ...custom.filter((c) => c.kind === 'income').map((c) => ({ ...c, custom: true })), INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1]]
}

let customCache: CustomCategory[] = []
/** Called by the store so emoji lookups include user categories. */
export function registerCustomCategories(c: CustomCategory[]) {
  customCache = c
}
export function categoryEmoji(name: string) {
  if (name === TRANSFER_CATEGORY) return '⇄'
  if (name === ADJUSTMENT_CATEGORY) return '⟳'
  return [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customCache].find((c) => c.name === name)?.emoji ?? '•'
}

export type AccountGroup = 'cash' | 'invest' | 'liability'

export const ACCOUNT_KINDS: { value: AccountKind; label: string; hint: string; group: AccountGroup; tag: string }[] = [
  { value: 'checking', label: 'Current account', hint: 'Everyday spending', group: 'cash', tag: 'Current' },
  { value: 'savings', label: 'Savings account', hint: 'Money set aside', group: 'cash', tag: 'Savings' },
  { value: 'debit', label: 'Debit card / e-money', hint: 'Prepaid or card-only account', group: 'cash', tag: 'Debit' },
  { value: 'business', label: 'Business account', hint: 'Your business money', group: 'cash', tag: 'Business' },
  { value: 'cash', label: 'Cash', hint: 'Wallet or cash at home', group: 'cash', tag: 'Cash' },
  { value: 'investment', label: 'Investment account', hint: 'Brokerage / trading', group: 'invest', tag: 'Invest' },
  { value: 'isa', label: 'ISA', hint: 'Tax-free savings or investments', group: 'invest', tag: 'ISA' },
  { value: 'pension', label: 'Pension', hint: 'Workplace or personal pension', group: 'invest', tag: 'Pension' },
  { value: 'credit', label: 'Credit card', hint: 'Tracks what you owe', group: 'liability', tag: 'Credit' },
  { value: 'loan', label: 'Loan or mortgage', hint: 'Tracks what you owe', group: 'liability', tag: 'Loan' },
  { value: 'other', label: 'Other', hint: 'Anything else you own', group: 'cash', tag: 'Account' },
]
const kindMeta = (k: AccountKind) => ACCOUNT_KINDS.find((a) => a.value === k) ?? ACCOUNT_KINDS[ACCOUNT_KINDS.length - 1]
export const kindLabel = (k: AccountKind) => kindMeta(k).label
export const kindTag = (k: AccountKind) => kindMeta(k).tag
export const kindGroup = (k: AccountKind) => kindMeta(k).group
export const isLiability = (k: AccountKind) => kindGroup(k) === 'liability'
/** Money you could reach quickly — used for emergency-fund coverage. */
export const isLiquid = (k: AccountKind) => ['checking', 'savings', 'debit', 'cash', 'business'].includes(k)

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'fund', label: 'Fund' },
  { value: 'bond', label: 'Bond' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
]

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
]
export const freqLabel = (f: Frequency) => FREQUENCIES.find((x) => x.value === f)?.label ?? f

export const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'kpis', label: 'This month in numbers' },
  { id: 'cashflow', label: 'Money in vs money out' },
  { id: 'spending', label: 'Where it went' },
  { id: 'cards', label: 'Cards & accounts' },
  { id: 'goals', label: 'Goals' },
  { id: 'upcoming', label: 'Coming up' },
  { id: 'insights', label: 'What stands out' },
  { id: 'recent', label: 'Latest activity' },
]

/** Card skins: two gradient stops + a glow. Text on all skins is white; every skin keeps ≥4.5:1 at the text zone. */
export const CARD_SKINS: Record<string, { label: string; a: string; b: string; glow: string }> = {
  obsidian: { label: 'Obsidian', a: '#1c2231', b: '#07090f', glow: '#d4b26a' },
  sapphire: { label: 'Sapphire', a: '#1d3f8a', b: '#0a1733', glow: '#5b8def' },
  champagne: { label: 'Champagne', a: '#8c6a2f', b: '#2e220e', glow: '#e6c98a' },
  emerald: { label: 'Emerald', a: '#0f5c46', b: '#062019', glow: '#34c79a' },
  platinum: { label: 'Platinum', a: '#5b6576', b: '#232833', glow: '#cfd6e2' },
  oxblood: { label: 'Oxblood', a: '#6e1f2b', b: '#240a10', glow: '#f0616d' },
  midnight: { label: 'Midnight', a: '#172554', b: '#050a1c', glow: '#818cf8' },
  titanium: { label: 'Titanium', a: '#3d4450', b: '#101318', glow: '#9aa6ba' },
}
export const SKIN_KEYS = Object.keys(CARD_SKINS)

export const CURRENCIES = ['GBP', 'USD', 'EUR', 'CHF', 'CAD', 'AUD', 'NZD', 'JPY', 'INR', 'ZAR', 'NGN', 'KES', 'BWP', 'ZMW', 'SEK', 'NOK', 'DKK', 'PLN', 'SGD', 'HKD', 'AED']

export const GOAL_PRESETS = [
  { name: 'Emergency fund', emoji: '🛟' },
  { name: 'House deposit', emoji: '🏡' },
  { name: 'Holiday', emoji: '🏝️' },
  { name: 'New car', emoji: '🚗' },
  { name: 'Investment target', emoji: '📈' },
  { name: 'Pay off debt', emoji: '✂️' },
  { name: 'General savings', emoji: '💰' },
]
