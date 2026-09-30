/**
 * Fictional demo dataset. Every name, institution and number here is made up.
 */
import type { Account, AppData, Goal, Holding, RecurringRule, Trade, Transaction } from './types'
import { addMonths, monthEnd, todayISO, uid } from './format'
import { materializeRecurring } from './calc'

/** Deterministic PRNG so the sample looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildSample(base: AppData): AppData {
  const r = rng(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
  const between = (a: number, b: number) => Math.round((a + r() * (b - a)) * 100) / 100
  const today = todayISO()
  const thisMonth = today.slice(0, 7)
  const startMonth = addMonths(thisMonth, -17)
  const start = `${startMonth}-01`
  const ccy = base.settings.currency

  const accounts: Account[] = [
    { id: 'acc-main', name: 'Everyday', kind: 'checking', institution: 'Northwind Bank', last4: '4821', currency: ccy, skin: 'obsidian', openingBalance: 2350, openingDate: start },
    { id: 'acc-save', name: 'Rainy Day Fund', kind: 'savings', institution: 'Northwind Bank', last4: '9034', currency: ccy, skin: 'emerald', openingBalance: 5200, openingDate: start },
    { id: 'acc-cc', name: 'Travel Rewards', kind: 'credit', institution: 'Harbor Card', last4: '1177', currency: ccy, skin: 'champagne', openingBalance: 420, openingDate: start, creditLimit: 6000 },
    { id: 'acc-isa', name: 'Stocks & Shares ISA', kind: 'isa', institution: 'Meridian Invest', currency: ccy, skin: 'sapphire', openingBalance: 150, openingDate: start },
    { id: 'acc-broker', name: 'Brokerage', kind: 'investment', institution: 'Meridian Invest', currency: ccy, skin: 'midnight', openingBalance: 80, openingDate: start },
    { id: 'acc-pension', name: 'Workplace Pension', kind: 'pension', institution: 'Evergreen Pensions', currency: ccy, skin: 'titanium', openingBalance: 18400, openingDate: start, notes: 'Value updated from quarterly statements.' },
    { id: 'acc-usd', name: 'Dollar Wallet', kind: 'debit', institution: 'Globex Money', last4: '5510', currency: 'USD', skin: 'platinum', openingBalance: 640, openingDate: start },
    { id: 'acc-loan', name: 'Car Loan', kind: 'loan', institution: 'Northwind Bank', currency: ccy, skin: 'oxblood', openingBalance: 9800, openingDate: start },
    { id: 'acc-cash', name: 'Wallet', kind: 'cash', currency: ccy, skin: 'platinum', openingBalance: 80, openingDate: start },
  ]

  const rules: RecurringRule[] = [
    { id: 'rr-salary', type: 'income', amount: 4200, accountId: 'acc-main', category: 'Salary', payee: 'Acme Studio payroll', frequency: 'monthly', nextDate: `${startMonth}-25`, active: true },
    { id: 'rr-rent', type: 'expense', amount: 1350, accountId: 'acc-main', category: 'Housing', payee: 'Rent — Maple Court', frequency: 'monthly', nextDate: `${startMonth}-01`, active: true },
    { id: 'rr-net', type: 'expense', amount: 45, accountId: 'acc-main', category: 'Bills & utilities', payee: 'FiberNet Internet', frequency: 'monthly', nextDate: `${startMonth}-09`, active: true },
    { id: 'rr-stream', type: 'expense', amount: 15.99, accountId: 'acc-cc', category: 'Subscriptions', payee: 'Streamly', frequency: 'monthly', nextDate: `${startMonth}-03`, active: true },
    { id: 'rr-music', type: 'expense', amount: 10.99, accountId: 'acc-cc', category: 'Subscriptions', payee: 'Tunebox Music', frequency: 'monthly', nextDate: `${startMonth}-14`, active: true },
    { id: 'rr-cloud', type: 'expense', amount: 79.99, accountId: 'acc-cc', category: 'Subscriptions', payee: 'CloudVault (annual)', frequency: 'yearly', nextDate: `${addMonths(startMonth, 4)}-19`, active: true },
    { id: 'rr-gym', type: 'expense', amount: 35, accountId: 'acc-main', category: 'Health', payee: 'PulseFit Gym', frequency: 'monthly', nextDate: `${startMonth}-02`, active: true },
    { id: 'rr-ins', type: 'expense', amount: 38.5, accountId: 'acc-main', category: 'Insurance', payee: 'Shieldwell Contents Cover', frequency: 'monthly', nextDate: `${startMonth}-12`, active: true },
    { id: 'rr-save', type: 'transfer', amount: 400, accountId: 'acc-main', toAccountId: 'acc-save', category: 'Transfer', payee: 'Monthly savings', frequency: 'monthly', nextDate: `${startMonth}-26`, active: true },
    { id: 'rr-loan', type: 'transfer', amount: 310, accountId: 'acc-main', toAccountId: 'acc-loan', category: 'Transfer', payee: 'Car loan repayment', frequency: 'monthly', nextDate: `${startMonth}-05`, active: true },
    { id: 'rr-cash', type: 'transfer', amount: 100, accountId: 'acc-main', toAccountId: 'acc-cash', category: 'Transfer', payee: 'Cash withdrawal', frequency: 'monthly', nextDate: `${startMonth}-10`, active: true },
  ]
  const mat = materializeRecurring(rules, today, uid)
  const txs: Transaction[] = [...mat.txs]
  const add = (t: Omit<Transaction, 'id'>) => {
    if (t.date <= today) txs.push({ id: uid(), ...t })
  }
  const d = (m: string, day: number) => {
    const last = Number(monthEnd(m).slice(8))
    return `${m}-${String(Math.min(day, last)).padStart(2, '0')}`
  }

  for (let i = 0; i < 18; i++) {
    const m = addMonths(startMonth, i)
    if (r() > 0.45) add({ type: 'income', amount: between(300, 1200), date: d(m, 8 + Math.floor(r() * 12)), accountId: 'acc-main', category: 'Freelance', payee: pick(['Brightline Co.', 'Orbit Labs', 'Kestrel Media']), tags: ['side-work'] })
    add({ type: 'income', amount: between(8, 16), date: d(m, 28), accountId: 'acc-save', category: 'Interest', payee: 'Northwind Bank interest' })
    add({ type: 'expense', amount: between(95, 160), date: d(m, 6), accountId: 'acc-main', category: 'Bills & utilities', payee: 'City Power & Water' })
    for (let w = 0; w < 4; w++) add({ type: 'expense', amount: between(55, 125), date: d(m, 3 + w * 7), accountId: pick(['acc-main', 'acc-main', 'acc-cc']), category: 'Groceries', payee: pick(['FreshMart', 'Green Grocer', 'Corner Market']) })
    const dines = 3 + Math.floor(r() * 6)
    for (let k = 0; k < dines; k++) add({ type: 'expense', amount: between(12, 68), date: d(m, 1 + Math.floor(r() * 28)), accountId: pick(['acc-cc', 'acc-main', 'acc-cash']), category: 'Dining', payee: pick(['Noodle Bar', 'Luna Café', 'Taco Lab', 'The Olive Tree', 'Sushi Go']) })
    const rides = 2 + Math.floor(r() * 5)
    for (let k = 0; k < rides; k++) add({ type: 'expense', amount: between(4, 32), date: d(m, 1 + Math.floor(r() * 28)), accountId: pick(['acc-main', 'acc-cc']), category: 'Transport', payee: pick(['Metro card top-up', 'RideNow', 'Fuel Stop']) })
    const shops = 1 + Math.floor(r() * 3)
    for (let k = 0; k < shops; k++) add({ type: 'expense', amount: between(20, 240), date: d(m, 1 + Math.floor(r() * 28)), accountId: 'acc-cc', category: 'Shopping', payee: pick(['Northline Outfitters', 'Pixel Store', 'Home & Hearth', 'Bookish']) })
    if (r() > 0.6) add({ type: 'expense', amount: between(20, 90), date: d(m, 1 + Math.floor(r() * 28)), accountId: 'acc-cc', category: 'Entertainment', payee: pick(['Cinema Nova', 'Live at the Vault', 'Arcade 88']) })
    if (i % 5 === 3) {
      add({ type: 'expense', amount: between(380, 900), date: d(m, 12), accountId: 'acc-cc', category: 'Travel', payee: pick(['SkyHop Airlines', 'Stayfinder']), tags: ['holiday'] })
      add({ type: 'expense', amount: between(60, 220), date: d(m, 14), accountId: 'acc-usd', category: 'Dining', payee: pick(['Harbor Diner', 'Pier 9 Grill']), tags: ['holiday'] })
    }
    if (i % 6 === 2) add({ type: 'transfer', amount: 300, toAmount: between(372, 385), date: d(m, 11), accountId: 'acc-main', toAccountId: 'acc-usd', category: 'Transfer', payee: 'Top up Dollar Wallet' })
    add({ type: 'expense', amount: between(8, 40), date: d(m, 21), accountId: 'acc-usd', category: 'Subscriptions', payee: 'DevTools Pro' })
    add({ type: 'transfer', amount: between(420, 640), date: d(m, 20), accountId: 'acc-main', toAccountId: 'acc-cc', category: 'Transfer', payee: 'Card repayment' })
    if (i % 3 === 2) add({ type: 'adjustment', amount: Math.round(between(350, 1100)), date: monthEnd(m), accountId: 'acc-pension', category: 'Balance update', payee: 'Quarterly statement', note: 'Contributions and growth' })
    add({ type: 'expense', amount: between(18, 34), date: d(m, 5), accountId: 'acc-loan', category: 'Fees & interest', payee: 'Loan interest' })
  }

  // Investments — prices walk month to month
  const specs: { sym: string; name: string; type: Holding['assetType']; start: number; vol: number; drift: number; cg?: string; acc?: string }[] = [
    { sym: 'VWRL', name: 'Global All-World ETF (sample)', type: 'etf', start: 96, vol: 0.03, drift: 0.008, acc: 'acc-isa' },
    { sym: 'AAPL', name: 'Apple Inc.', type: 'stock', start: 170, vol: 0.06, drift: 0.008, acc: 'acc-isa' },
    { sym: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', start: 80, vol: 0.1, drift: 0.022, acc: 'acc-broker' },
    { sym: 'MSFT', name: 'Microsoft Corp.', type: 'stock', start: 320, vol: 0.05, drift: 0.006, acc: 'acc-broker' },
    { sym: 'GILT28', name: 'UK Gilt 2028 (sample)', type: 'bond', start: 97, vol: 0.006, drift: 0.002, acc: 'acc-isa' },
    { sym: 'BTC', name: 'Bitcoin', type: 'crypto', start: 48000, vol: 0.12, drift: 0.015, cg: 'bitcoin' },
  ]
  const holdings: Holding[] = []
  const trades: Trade[] = []
  for (const s of specs) {
    const h: Holding = { id: `h-${s.sym.toLowerCase()}`, symbol: s.sym, name: s.name, assetType: s.type, coingeckoId: s.cg, accountId: s.acc, prices: [] }
    let p = s.start
    for (let i = 0; i < 18; i++) {
      const m = addMonths(startMonth, i)
      p = p * (1 + s.drift + (r() - 0.5) * 2 * s.vol)
      const date = i === 17 ? today : monthEnd(m)
      h.prices.push({ date, price: Math.round(p * 100) / 100, source: 'manual' })
      if (i < 17) h.prices.push({ date: d(m, 15), price: Math.round(p * (1 + (r() - 0.5) * s.vol) * 100) / 100, source: 'manual' })
    }
    holdings.push(h)
  }
  const px = (sym: string, m: string) => {
    const h = holdings.find((x) => x.symbol === sym)!
    return h.prices.filter((p) => p.date <= d(m, 16)).slice(-1)[0]?.price ?? h.prices[0].price
  }
  const buy = (sym: string, mi: number, shares: number) => {
    const m = addMonths(startMonth, mi)
    trades.push({ id: uid(), holdingId: `h-${sym.toLowerCase()}`, kind: 'buy', date: d(m, 16), shares, price: px(sym, m), fees: 0 })
  }
  for (const mi of [0, 2, 4, 6, 8, 10, 12, 14, 16]) buy('VWRL', mi, 12)
  buy('AAPL', 1, 15); buy('AAPL', 9, 5)
  buy('NVDA', 3, 40)
  buy('MSFT', 5, 6)
  buy('GILT28', 7, 20)
  buy('BTC', 8, 0.05)
  {
    const m = addMonths(startMonth, 13)
    trades.push({ id: uid(), holdingId: 'h-nvda', kind: 'sell', date: d(m, 16), shares: 10, price: px('NVDA', m), fees: 0 })
  }
  for (const qi of [2, 5, 8, 11, 14, 17]) {
    const m = addMonths(startMonth, qi)
    const date = d(m, 18)
    if (date <= today) trades.push({ id: uid(), holdingId: 'h-vwrl', kind: 'dividend', date, shares: 0, price: Math.round(qi * 3.1 * 100) / 100, fees: 0 })
  }

  const goals: Goal[] = [
    { id: 'g-emergency', name: 'Emergency fund', emoji: '🛟', target: 15000, accountId: 'acc-save', contributions: [], createdAt: start },
    {
      id: 'g-holiday', name: 'Japan trip', emoji: '🏝️', target: 3200, targetDate: `${addMonths(thisMonth, 7)}-01`, createdAt: start,
      contributions: Array.from({ length: 10 }, (_, i) => ({ id: uid(), date: d(addMonths(thisMonth, i - 9), 27) > today ? today : d(addMonths(thisMonth, i - 9), 27), amount: 150 })),
    },
    {
      id: 'g-house', name: 'House deposit', emoji: '🏡', target: 30000, targetDate: `${Number(thisMonth.slice(0, 4)) + 3}-06-01`, createdAt: start,
      contributions: Array.from({ length: 14 }, (_, i) => ({ id: uid(), date: d(addMonths(thisMonth, i - 13), 27) > today ? today : d(addMonths(thisMonth, i - 13), 27), amount: i % 4 === 0 ? 900 : 450 })),
    },
  ]

  return {
    ...base,
    accounts,
    transactions: txs,
    recurring: mat.rules,
    holdings,
    trades,
    goals,
    budgets: [
      { category: 'Groceries', limit: 420, period: 'monthly' },
      { category: 'Dining', limit: 220, period: 'monthly' },
      { category: 'Shopping', limit: 250, period: 'monthly' },
      { category: 'Transport', limit: 90, period: 'monthly' },
      { category: 'Entertainment', limit: 80, period: 'monthly' },
      { category: 'Subscriptions', limit: 60, period: 'monthly' },
      { category: 'Travel', limit: 2500, period: 'yearly' },
    ],
    settings: {
      ...base.settings,
      sampleData: true,
      overallBudget: 3200,
      onboarded: true,
      // Illustrative manual rates for the demo only; other base currencies show the “add a rate” prompt instead of a guess.
      fx: { ...base.settings.fx, ...(ccy === 'GBP' ? { USD: { rate: 0.79, date: today, source: 'manual' as const } } : ccy === 'EUR' ? { USD: { rate: 0.92, date: today, source: 'manual' as const } } : {}) },
    },
  }
}
