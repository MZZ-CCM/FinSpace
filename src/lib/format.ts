let currency = 'GBP'
let privacy = false
let fmtCache: Record<string, Intl.NumberFormat> = {}

export function setCurrency(c: string) {
  if (c !== currency) {
    currency = c
    fmtCache = {}
  }
}
export const getCurrency = () => currency
/** Privacy mode masks every amount on screen (for use in public places). */
export function setPrivacy(p: boolean) {
  privacy = p
}
export const isPrivate = () => privacy
const MASK = '••••'

function nf(key: string, opts: Intl.NumberFormatOptions) {
  return (fmtCache[key] ??= new Intl.NumberFormat(undefined, opts))
}

/** £1,234.56 — pass `currency` to show an amount in its original currency. */
export function money(n: number, opts: { sign?: boolean; cents?: boolean; currency?: string; reveal?: boolean } = {}) {
  const cents = opts.cents ?? true
  const ccy = opts.currency ?? currency
  if (privacy && !opts.reveal) return `${currencySymbol(ccy)}${MASK}`
  const f = nf(`m${cents}${ccy}`, {
    style: 'currency',
    currency: ccy,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
  const s = f.format(Math.abs(n))
  if (n < 0) return `−${s}`
  if (opts.sign && n > 0) return `+${s}`
  return s
}

/** $12.4k — for axes and tight spaces */
export function moneyCompact(n: number) {
  if (privacy) return `${currencySymbol()}${MASK}`
  const f = nf('mc', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
  const s = f.format(Math.abs(n))
  return n < 0 ? `−${s}` : s
}

export function pct(n: number, opts: { sign?: boolean } = {}) {
  if (!isFinite(n)) return '—'
  const s = nf('p', { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(n))
  if (n < 0) return `−${s}`
  if (opts.sign && n > 0) return `+${s}`
  return s
}

export function num(n: number, max = 4) {
  return nf(`n${max}`, { maximumFractionDigits: max }).format(n)
}

export function currencySymbol(ccy = currency) {
  const parts = nf('sym' + ccy, { style: 'currency', currency: ccy }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? ccy
}

// ---- dates (all local, YYYY-MM-DD strings) ----
export function todayISO() {
  return toISO(new Date())
}
export function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** "2026-09" */
export const monthKey = (iso: string) => iso.slice(0, 7)
export function monthStart(key: string) {
  return `${key}-01`
}
export function monthEnd(key: string) {
  const [y, m] = key.split('-').map(Number)
  return toISO(new Date(y, m, 0))
}
export function addMonths(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return toISO(d).slice(0, 7)
}
export function dayBefore(iso: string) {
  const d = parseISO(iso)
  d.setDate(d.getDate() - 1)
  return toISO(d)
}
export function monthLabel(key: string, style: 'long' | 'short' = 'long') {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
  })
}
export function dateLabel(iso: string) {
  const today = todayISO()
  if (iso === today) return 'Today'
  if (iso === dayBefore(today)) return 'Yesterday'
  const d = parseISO(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
}
export function shortDate(iso: string) {
  return parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function addDays(iso: string, n: number) {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export function daysBetween(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5)
}
export function relativeDays(iso: string) {
  const n = daysBetween(todayISO(), iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}
export function sinceLabel(isoTimestamp: string) {
  const ms = Date.now() - new Date(isoTimestamp).getTime()
  const h = ms / 36e5
  if (h < 1) return 'less than an hour ago'
  if (h < 24) return `${Math.floor(h)} hour${Math.floor(h) === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** Today as a heading, e.g. "Wednesday 30 September". */
export function todayTitle() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Human name for a price source. */
export const sourceName = (s?: string) => (s === 'finnhub' ? 'Finnhub' : s === 'coingecko' ? 'CoinGecko' : s === 'coinbase' ? 'Coinbase' : 'you')
