/* Reads bank statements in the common formats banks offer — CSV/TSV, Excel (.xlsx),
   OFX/QFX (Money, Quicken), QIF and PDF — into rows the import screen can map.
   Everything happens on the device; the file is never uploaded. */

import { parseAmount, parseCSV } from './csv'

export type StatementKind = 'csv' | 'xlsx' | 'ofx' | 'qif' | 'pdf'
export type ColumnMap = { date: number; payee: number; amount: number; debit: number; credit: number; category: number; balance: number }
export interface Statement {
  kind: StatementKind
  rows: string[][]
  /** Set when the format is structured, so the columns don't need guessing. Dates are then ISO (YYYY-MM-DD). */
  map?: ColumnMap
  note?: string
}

export const STATEMENT_ACCEPT = '.csv,.tsv,.txt,.xlsx,.ofx,.qfx,.qif,.pdf,text/csv,text/tab-separated-values,application/pdf,application/x-ofx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024

const NONE: ColumnMap = { date: -1, payee: -1, amount: -1, debit: -1, credit: -1, category: -1, balance: -1 }
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null)

export class StatementError extends Error {}

export async function readStatement(file: File): Promise<Statement> {
  if (file.size > MAX_STATEMENT_BYTES) throw new StatementError('That file is over 10 MB. Export a shorter date range and try again.')
  const name = file.name.toLowerCase()
  const ext = name.slice(name.lastIndexOf('.') + 1)
  if (ext === 'pdf' || file.type === 'application/pdf') return readPdf(file)
  if (ext === 'xlsx') return readXlsx(file)
  if (ext === 'xls' || ext === 'numbers') throw new StatementError('This is an older spreadsheet format. Open it and save it as .xlsx or .csv, then import that.')
  const text = await file.text()
  if (ext === 'ofx' || ext === 'qfx' || /<OFX>/i.test(text.slice(0, 4000))) return statementFromTxs('ofx', parseOFX(text))
  if (ext === 'qif' || /^\s*!Type:/i.test(text)) return statementFromTxs('qif', parseQIF(text))
  const rows = parseCSV(text)
  if (!rows.length) throw new StatementError('That file looks empty. Export the statement from your bank again and try once more.')
  return { kind: 'csv', rows }
}

/* ─────────── Structured formats ─────────── */

export interface RawTx { date: string; payee: string; amount: number; category?: string; balance?: number }

function statementFromTxs(kind: StatementKind, txs: RawTx[], note?: string): Statement {
  if (!txs.length) throw new StatementError('No transactions were found in that file. Check it’s a statement for the right dates.')
  const hasCat = txs.some((t) => t.category)
  const hasBal = txs.some((t) => t.balance !== undefined)
  const header = ['Date', 'Description', 'Amount', ...(hasCat ? ['Category'] : []), ...(hasBal ? ['Balance'] : [])]
  const rows = txs.map((t) => [t.date, t.payee, t.amount.toFixed(2), ...(hasCat ? [t.category ?? ''] : []), ...(hasBal ? [t.balance === undefined ? '' : t.balance.toFixed(2)] : [])])
  return {
    kind, note,
    rows: [header, ...rows],
    map: { ...NONE, date: 0, payee: 1, amount: 2, category: hasCat ? 3 : -1, balance: hasBal ? (hasCat ? 4 : 3) : -1 },
  }
}

/** OFX / QFX (SGML or XML). Leaf tags may be unclosed in the SGML flavour. */
export function parseOFX(text: string): RawTx[] {
  const tag = (block: string, t: string) => block.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? ''
  const ofxDate = (s: string) => (/^\d{8}/.test(s) ? iso(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)) : null)
  const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
  const txs: RawTx[] = []
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const b = m[1]
    const date = ofxDate(tag(b, 'DTPOSTED'))
    const amount = Number(tag(b, 'TRNAMT').replace(',', '.'))
    if (!date || !isFinite(amount)) continue
    const payee = unescape(tag(b, 'NAME') || tag(b, 'PAYEE') || tag(b, 'MEMO'))
    txs.push({ date, payee, amount })
  }
  txs.sort((a, b) => a.date.localeCompare(b.date))
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i)?.[1]
  if (ledger && txs.length) {
    const bal = Number(tag(ledger, 'BALAMT').replace(',', '.'))
    const asOf = ofxDate(tag(ledger, 'DTASOF'))
    if (isFinite(bal) && (!asOf || asOf >= txs[txs.length - 1].date)) txs[txs.length - 1].balance = bal
  }
  return txs
}

/** QIF (Quicken Interchange Format). Dates are usually month-first; day-first is detected when obvious. */
export function parseQIF(text: string): RawTx[] {
  const recs: { d: string; t: string; p: string; m: string; l: string }[] = []
  let cur = { d: '', t: '', p: '', m: '', l: '' }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('!')) continue
    const code = line[0], val = line.slice(1).trim()
    if (code === '^') { if (cur.d) recs.push(cur); cur = { d: '', t: '', p: '', m: '', l: '' }; continue }
    if (code === 'D') cur.d = val
    else if (code === 'T' || (code === 'U' && !cur.t)) cur.t = val
    else if (code === 'P') cur.p = val
    else if (code === 'M') cur.m = val
    else if (code === 'L') cur.l = val.replace(/^\[|\]$/g, '')
  }
  if (cur.d) recs.push(cur)
  const parts = recs.map((r) => r.d.replace(/'/g, '/').split(/[^0-9]+/).filter(Boolean).map(Number))
  const dayFirst = parts.some((p) => p[0] > 12)
  const txs: RawTx[] = []
  recs.forEach((r, i) => {
    const p = parts[i]
    if (p.length < 3) return
    let y: number, mo: number, d: number
    if (p[0] > 31) [y, mo, d] = p
    else if (dayFirst) [d, mo, y] = p
    else [mo, d, y] = p
    if (y < 100) y += y < 70 ? 2000 : 1900
    const date = iso(y, mo, d)
    const amount = parseAmount(r.t)
    if (!date || amount === null) return
    txs.push({ date, payee: r.p || r.m, amount, category: r.l || undefined })
  })
  return txs
}

/* ─────────── Excel ─────────── */

async function readXlsx(file: File): Promise<Statement> {
  const { readSheet } = await import('read-excel-file/browser')
  let data: unknown[][]
  try { data = (await readSheet(file)) as unknown[][] } catch {
    throw new StatementError('That spreadsheet couldn’t be opened. Save it again as .xlsx or .csv and try once more.')
  }
  const rows = data
    .map((r) => r.map((c) => (c instanceof Date ? iso(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate()) ?? '' : c === null || c === undefined ? '' : String(c).trim())))
    .filter((r) => r.some((c) => c))
  if (!rows.length) throw new StatementError('That spreadsheet looks empty.')
  return { kind: 'xlsx', rows }
}

/* ─────────── PDF ─────────── */

export interface PdfToken { str: string; x: number; w: number }
export interface PdfLine { page: number; y: number; tokens: PdfToken[] }

async function readPdf(file: File): Promise<Statement> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, useSystemFonts: false, useWasm: false, enableXfa: false })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    void task.destroy()
    if ((e as Error).name === 'PasswordException') throw new StatementError('This PDF is password-protected. Open it, save or print a copy without a password, and import that.')
    throw new StatementError('That PDF couldn’t be opened. Download the statement again and try once more.')
  }
  const lines: PdfLine[] = []
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = (content.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((i) => i.str && i.str.trim() && i.transform)
      .map((i) => ({ str: i.str!.trim(), x: i.transform![4], y: i.transform![5], w: i.width ?? 0 }))
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    for (const it of items) {
      const line = lines.length && lines[lines.length - 1].page === p && Math.abs(lines[lines.length - 1].y - it.y) <= 3 ? lines[lines.length - 1] : null
      if (line) line.tokens.push({ str: it.str, x: it.x, w: it.w })
      else lines.push({ page: p, y: it.y, tokens: [{ str: it.str, x: it.x, w: it.w }] })
    }
    page.cleanup()
  }
  await task.destroy()
  for (const l of lines) l.tokens.sort((a, b) => a.x - b.x)
  if (!lines.length) throw new StatementError('This PDF has no readable text — it’s probably a scanned image. Download the statement as a PDF or CSV from online banking instead.')
  const txs = pdfLinesToTxs(lines)
  if (!txs.length) throw new StatementError('Finspace couldn’t find transactions in this PDF. If your bank offers CSV, OFX or Excel downloads, those import most reliably.')
  return statementFromTxs('pdf', txs, 'Read from a PDF — check the preview before importing.')
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DATE_RES: { re: RegExp; kind: 'num' | 'iso' | 'dmon' | 'mond' }[] = [
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})\b/, kind: 'iso' },
  { re: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/, kind: 'num' },
  { re: new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MON}(?:[\\s-]+(\\d{2,4}))?\\b`, 'i'), kind: 'dmon' },
  { re: new RegExp(`^${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?\\b`, 'i'), kind: 'mond' },
]
const AMOUNT_RE = /^[-−+]?\(?[£$€¥₹]?\s?[-−]?\d{1,3}(?:[,\s.']\d{3})*[.,]\d{2}\)?(?:\s?(?:CR|DR|OD|-))?$/i
const SKIP_RE = /brought forward|carried forward|opening balance|closing balance|balance b\/?f|balance c\/?f|previous balance|new balance|^total|subtotal/i

function monthIndex(s: string) { return MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1 }

interface DateHit { len: number; y?: number; m: number; d: number; num?: [number, number] }
function matchDate(text: string): DateHit | null {
  for (const { re, kind } of DATE_RES) {
    const m = text.match(re)
    if (!m) continue
    if (kind === 'iso') return { len: m[0].length, y: +m[1], m: +m[2], d: +m[3] }
    if (kind === 'num') { let y = +m[3]; if (y < 100) y += 2000; return { len: m[0].length, y, m: 0, d: 0, num: [+m[1], +m[2]] } }
    if (kind === 'dmon') return { len: m[0].length, d: +m[1], m: monthIndex(m[2]), y: m[3] ? (+m[3] < 100 ? +m[3] + 2000 : +m[3]) : undefined }
    return { len: m[0].length, m: monthIndex(m[1]), d: +m[2], y: m[3] ? +m[3] : undefined }
  }
  return null
}

function amountValue(s: string): number | null {
  const v = parseAmount(s.replace(/\s?(CR|DR|OD)$/i, ''))
  if (v === null) return null
  if (/(DR|OD)$/i.test(s) || /-$/.test(s)) return -Math.abs(v)
  if (/CR$/i.test(s)) return Math.abs(v)
  return v
}

type Col = 'out' | 'in' | 'amount' | 'balance'
const HEADER_WORDS: [RegExp, Col][] = [
  [/^(paid out|money out|withdrawals?|debits?|payments?( out)?|out|spent|charges?)$/i, 'out'],
  [/^(paid in|money in|deposits?|credits?|receipts?|in)$/i, 'in'],
  [/^(balance|running balance|balance \(.+\))$/i, 'balance'],
  [/^(amount|value|amount \(.+\))$/i, 'amount'],
]

/** Turns positioned PDF text lines into transactions. Exported for tests. */
export function pdfLinesToTxs(lines: PdfLine[]): RawTx[] {
  // 1 · Column positions from a header row such as "Date  Description  Paid out  Paid in  Balance"
  let cols: { col: Col; right: number; center: number }[] = []
  for (const l of lines) {
    const found = l.tokens.flatMap((t) => { const hit = HEADER_WORDS.find(([re]) => re.test(t.str)); return hit ? [{ col: hit[1], right: t.x + t.w, center: t.x + t.w / 2 }] : [] })
    if (found.length >= 2 && found.some((f) => f.col !== 'balance')) { cols = found; break }
  }
  const colFor = (t: PdfToken): Col | null => {
    if (!cols.length) return null
    const right = t.x + t.w, center = t.x + t.w / 2
    let best: Col | null = null, dist = Infinity
    for (const c of cols) { const d = Math.min(Math.abs(c.right - right), Math.abs(c.center - center)); if (d < dist) { dist = d; best = c.col } }
    return dist < 90 ? best : null
  }

  // 2 · Year for dates like "03 Feb" — taken from years printed on the statement
  const years = new Map<number, number>()
  for (const l of lines) for (const t of l.tokens) for (const m of t.str.matchAll(/\b(20\d{2})\b/g)) years.set(+m[1], (years.get(+m[1]) ?? 0) + 1)
  const yearList = [...years.entries()].sort((a, b) => b[1] - a[1]).map(([y]) => y)
  const numericPairs: [number, number][] = []

  // 3 · Transaction lines
  interface Pending { hit: DateHit | null; payee: string; amounts: { v: number; col: Col | null; raw: string }[]; page: number; y: number }
  const pend: Pending[] = []
  let lastHit: DateHit | null = null
  let openingBalance: number | null = null
  for (const l of lines) {
    const text = l.tokens.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim()
    const hit = matchDate(text)
    const amountTokens: { v: number; col: Col | null; raw: string }[] = []
    const words: string[] = []
    // tokens after the date: split each into amount / word pieces
    let consumed = 0
    for (const t of l.tokens) {
      const start = consumed
      consumed += t.str.length + 1
      if (hit && start < hit.len) { const rest = t.str.slice(Math.max(0, hit.len - start)).trim(); if (!rest) continue; if (AMOUNT_RE.test(rest)) { const v = amountValue(rest); if (v !== null) amountTokens.push({ v, col: colFor(t), raw: rest }) } else words.push(rest); continue }
      if (AMOUNT_RE.test(t.str)) { const v = amountValue(t.str); if (v !== null) { amountTokens.push({ v, col: colFor(t), raw: t.str }); continue } }
      if (/^(CR|DR|OD)$/i.test(t.str) && amountTokens.length) { const a = amountTokens[amountTokens.length - 1]; a.v = /CR/i.test(t.str) ? Math.abs(a.v) : -Math.abs(a.v); a.raw += ' ' + t.str; continue }
      words.push(t.str)
    }
    const payee = words.join(' ').replace(/\s+/g, ' ').trim()
    if (SKIP_RE.test(payee)) {
      const bal = amountTokens.find((a) => a.col === 'balance') ?? amountTokens[amountTokens.length - 1]
      if (bal && /brought forward|opening balance|previous balance|b\/?f/i.test(payee)) openingBalance = bal.v
      continue
    }
    if (hit) lastHit = hit
    if (!amountTokens.length) {
      // a wrapped description line belongs to the transaction just above it
      const prev = pend[pend.length - 1]
      if (!hit && prev && prev.page === l.page && prev.y - l.y < 24 && payee && payee.length < 80) prev.payee = `${prev.payee} ${payee}`.trim()
      continue
    }
    const useHit = hit ?? lastHit
    if (!useHit) continue
    if (!hit && !payee) continue
    if (useHit.num) numericPairs.push(useHit.num)
    pend.push({ hit: useHit, payee, amounts: amountTokens, page: l.page, y: l.y })
  }

  // 4 · Resolve numeric date order (day-first unless the statement proves otherwise)
  const monthFirst = !numericPairs.some((p) => p[0] > 12) && numericPairs.some((p) => p[1] > 12)
  const spansYearEnd = pend.some((p) => (p.hit?.m ?? 0) === 12) && pend.some((p) => (p.hit?.m ?? 0) === 1)
  let year = spansYearEnd ? Math.min(...(yearList.length ? yearList : [new Date().getFullYear()])) : yearList[0] ?? new Date().getFullYear()
  let lastMonth = 0

  const out: RawTx[] = []
  let prevBal = openingBalance
  for (let i = 0; i < pend.length; i++) {
    const p = pend[i]
    const h = p.hit!
    let m = h.m, d = h.d, y = h.y
    if (h.num) { [d, m] = monthFirst ? [h.num[1], h.num[0]] : h.num; y = h.y }
    if (y === undefined) { if (lastMonth && m < lastMonth - 6) year++; y = year } else year = y
    lastMonth = m
    const date = iso(y!, m, d)
    if (!date) continue

    // amount and running balance
    let amount: number | null = null
    let balance: number | undefined
    const byCol = (c: Col) => p.amounts.find((a) => a.col === c)
    if (cols.length && p.amounts.some((a) => a.col)) {
      const o = byCol('out'), inn = byCol('in'), a = byCol('amount'), b = byCol('balance')
      if (b) balance = b.v
      if (o) amount = -Math.abs(o.v)
      else if (inn) amount = Math.abs(inn.v)
      else if (a) amount = a.v
    }
    if (amount === null) {
      const vals = p.amounts
      if (vals.length >= 2) { balance = vals[vals.length - 1].v; amount = vals[vals.length - 2].v }
      else amount = vals[0].v
      const explicit = /^[-−(]|(CR|DR|OD|-)$/i.test(vals[vals.length >= 2 ? vals.length - 2 : 0].raw)
      if (!explicit) {
        // sign from how the running balance moved, when we can see it
        if (balance !== undefined && prevBal !== null && Math.abs(Math.abs(balance - prevBal) - Math.abs(amount)) < 0.011) amount = Math.sign(balance - prevBal) * Math.abs(amount)
        else amount = -Math.abs(amount) // one unsigned amount: most statement lines are spending
      }
    }
    if (balance !== undefined) prevBal = balance
    if (!amount) continue
    out.push({ date, payee: p.payee || 'Statement entry', amount: Math.round(amount * 100) / 100, balance })
  }
  return out
}
