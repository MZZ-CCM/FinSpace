import type { AppData, Transaction } from './types'

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',' || c === ';' || c === '\t') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows.map((r) => r.map((x) => x.trim()))
}

export type DateFormat = 'YMD' | 'DMY' | 'MDY'

export function parseDate(s: string, fmt: DateFormat): string | null {
  const parts = s.split(/[^0-9]+/).filter(Boolean).map(Number)
  if (parts.length < 3) return null
  let y: number, m: number, d: number
  if (fmt === 'YMD') [y, m, d] = parts
  else if (fmt === 'DMY') [d, m, y] = parts
  else [m, d, y] = parts
  if (y < 100) y += 2000
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function guessDateFormat(samples: string[]): DateFormat {
  if (samples.some((s) => /^\d{4}/.test(s))) return 'YMD'
  const firsts = samples.map((s) => Number(s.split(/[^0-9]/)[0]))
  if (firsts.some((n) => n > 12)) return 'DMY'
  const seconds = samples.map((s) => Number(s.split(/[^0-9]+/)[1]))
  if (seconds.some((n) => n > 12)) return 'MDY'
  return 'DMY'
}

export function parseAmount(s: string): number | null {
  if (!s) return null
  let t = s.replace(/[^0-9.,()\-−]/g, '')
  const neg = /^\(.*\)$/.test(t) || /[-−]/.test(t)
  t = t.replace(/[()\-−]/g, '')
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = parseFloat(t)
  if (isNaN(n)) return null
  return neg ? -n : n
}

/**
 * CSV cell escaping, including protection against formula injection (OWASP “CSV injection”):
 * text starting with = + - @ tab or CR is prefixed with ' so spreadsheet apps treat it as text.
 * Real numbers are left alone so negative amounts stay numeric.
 */
export function esc(v: string | number | undefined) {
  if (typeof v === 'number') return String(v)
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function transactionsToCSV(data: AppData, txs: Transaction[] = data.transactions) {
  const name = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? ''
  const ccy = (id?: string) => data.accounts.find((a) => a.id === id)?.currency ?? data.settings.currency
  const head = ['Date', 'Type', 'Payee', 'Category', 'Amount', 'Currency', 'Account', 'To account', 'Tags', 'Note']
  const lines = [...txs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => [t.date, t.type, t.payee, t.category, t.type === 'expense' ? -t.amount : t.amount, ccy(t.accountId), name(t.accountId), name(t.toAccountId), (t.tags ?? []).join(' '), t.note].map(esc).join(','))
  return [head.join(','), ...lines].join('\n')
}

export function download(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
