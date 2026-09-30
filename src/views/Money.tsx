import { useEffect, useMemo, useState } from 'react'
import { CatGlyph, CatLabel } from '../components/glyphs'
import { Download, FileUp, Plus, Receipt, Repeat, Search, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI, type MoneyTab } from '../lib/ui'
import type { Transaction, TxType } from '../lib/types'
import { addMonths, dateLabel, money, monthEnd, monthKey, monthLabel, monthStart, pct, shortDate, todayISO } from '../lib/format'
import { ADJUSTMENT_CATEGORY, TRANSFER_CATEGORY, expenseCategories, freqLabel, incomeCategories } from '../lib/meta'
import { byCategory, flowBetween, flowSeries, largestTransactions, monthlyEquivalent, spendingVelocity, toBase, upcoming } from '../lib/calc'
import { download, transactionsToCSV } from '../lib/csv'
import { ChartFrame, Delta, Empty, HowCalculated, Tabs } from '../components/ui'
import { FlowBars } from '../components/charts'

export function TxList({ txs, grouped = true, selectable, selected, onToggle, accountId }: { txs: Transaction[]; grouped?: boolean; selectable?: boolean; selected?: Set<string>; onToggle?: (id: string) => void; accountId?: string }) {
  const { data } = useStore()
  const { open } = useUI()
  const accs = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])
  const accName = (id?: string) => accs.get(id ?? '')?.name ?? 'Deleted account'
  const base = data.settings.currency

  const row = (t: Transaction) => {
    const acc = accs.get(t.accountId)
    const ccy = acc?.currency ?? base
    let dir: 'in' | 'out' | 'xfer' = t.type === 'income' ? 'in' : t.type === 'expense' ? 'out' : 'xfer'
    let amount = t.amount
    let amountCcy = ccy
    if (t.type === 'transfer' && accountId) {
      dir = t.toAccountId === accountId ? 'in' : 'out'
      if (dir === 'in') { amount = t.toAmount ?? t.amount; amountCcy = accs.get(t.toAccountId ?? '')?.currency ?? ccy }
    }
    if (t.type === 'adjustment') { dir = t.amount >= 0 ? 'in' : 'out'; amount = Math.abs(t.amount) }
    const sign = dir === 'in' ? '+' : dir === 'out' ? '−' : ''
    const isSel = selected?.has(t.id)
    const future = t.date > todayISO()
    return (
      <div key={t.id} className={`tx-row ${isSel ? 'selected' : ''}`} style={{ gridTemplateColumns: selectable ? '20px 40px minmax(0,1fr) auto' : undefined, opacity: future ? 0.6 : 1 }}>
        {selectable && <input type="checkbox" className="tx-check" checked={!!isSel} onChange={() => onToggle?.(t.id)} aria-label={`Select ${t.payee}`} />}
        <span className="tx-ic" aria-hidden><CatGlyph name={t.category} /></span>
        <button className="tx-main" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' }} onClick={() => open({ kind: 'tx', tx: t })} aria-label={`Edit ${t.payee}, ${money(amount, { currency: amountCcy })}`}>
          <div className="tx-payee">{t.payee}{t.recurringId && <Repeat size={12} style={{ marginLeft: 6, verticalAlign: -1, color: 'var(--text-3)' }} aria-label="Repeating" />}</div>
          <div className="tx-meta">
            <span>{t.category}</span>
            <span aria-hidden>·</span>
            <span>{t.type === 'transfer' ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : accName(t.accountId)}</span>
            {!grouped && <><span aria-hidden>·</span><span>{dateLabel(t.date)}</span></>}
            {t.tags?.map((tag) => <span key={tag} className="pill" style={{ padding: '1px 6px' }}>#{tag}</span>)}
          </div>
        </button>
        <div className={`tx-amt num ${dir === 'in' && t.type === 'income' ? 'in' : t.type === 'transfer' && !accountId ? 'xfer' : t.type === 'adjustment' ? 'xfer' : ''}`}>
          {sign}{money(amount, { currency: amountCcy })}
          {amountCcy !== base && t.type !== 'transfer' && (() => { const b = toBase(data, amount, amountCcy); return b !== null ? <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>≈ {money(b)}</div> : null })()}
        </div>
      </div>
    )
  }

  if (!txs.length) return <p className="muted" style={{ padding: '8px 12px' }}>No transactions to show.</p>
  if (!grouped) return <div>{txs.map(row)}</div>

  const groups: { date: string; items: Transaction[] }[] = []
  for (const t of txs) {
    const g = groups[groups.length - 1]
    if (g && g.date === t.date) g.items.push(t)
    else groups.push({ date: t.date, items: [t] })
  }
  return (
    <div>
      {groups.map((g) => {
        let net = 0
        for (const t of g.items) {
          if (t.type !== 'income' && t.type !== 'expense') continue
          const v = toBase(data, t.amount, accs.get(t.accountId)?.currency ?? base) ?? 0
          net += t.type === 'income' ? v : -v
        }
        return (
          <div className="tx-group" key={g.date}>
            <div className="tx-day"><span>{dateLabel(g.date)}</span>{Math.abs(net) > 0.004 && <span className="num">{money(net, { sign: true })}</span>}</div>
            {g.items.map(row)}
          </div>
        )
      })}
    </div>
  )
}

export function Money() {
  const { route, go, open } = useUI()
  const { data } = useStore()
  const r = route.page === 'money' ? route : { tab: undefined }
  const tab: MoneyTab = r.tab ?? 'activity'
  const setTab = (t: MoneyTab) => go({ page: 'money', tab: t })
  return (
    <div className="page-enter">
      <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <Tabs<MoneyTab>
          label="Money sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'activity', label: 'Activity', count: data.transactions.length },
            { value: 'recurring', label: 'Recurring', count: data.recurring.filter((x) => x.active).length },
            { value: 'analysis', label: 'Analysis' },
          ]}
        />
        <div className="row no-print" style={{ marginBottom: 24 }}>
          {tab === 'recurring' ? <button className="btn btn-primary" onClick={() => open({ kind: 'recurring' })}><Plus size={16} /> Add repeating payment</button> : <button className="btn btn-primary" onClick={() => open({ kind: 'tx' })}><Plus size={16} /> Add transaction</button>}
        </div>
      </div>
      {tab === 'activity' && <Activity />}
      {tab === 'recurring' && <Recurring />}
      {tab === 'analysis' && <Analysis />}
    </div>
  )
}

const PAGE = 60

function Activity() {
  const { data, withUndo } = useStore()
  const { route, open, go } = useUI()
  const r = route.page === 'money' ? route : ({} as Extract<typeof route, { page: 'money' }>)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const type = r.type ?? ''
  const account = r.account ?? ''
  const category = r.category ?? ''
  const period = r.month ?? ''
  const tag = r.tag ?? ''
  const setFilter = (patch: Partial<{ type: string; account: string; category: string; month: string; tag: string }>) =>
    go({ page: 'money', type: ((patch.type ?? type) || undefined) as TxType | undefined, account: (patch.account ?? account) || undefined, category: (patch.category ?? category) || undefined, month: (patch.month ?? period) || undefined, tag: (patch.tag ?? tag) || undefined })

  useEffect(() => setLimit(PAGE), [q, type, period, account, category, tag])

  const months = useMemo(() => [...new Set(data.transactions.map((t) => monthKey(t.date)))].sort().reverse(), [data.transactions])
  const tags = useMemo(() => [...new Set(data.transactions.flatMap((t) => t.tags ?? []))].sort(), [data.transactions])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, '')
    return data.transactions
      .filter((t) => (!type || t.type === type) && (!account || t.accountId === account || t.toAccountId === account) && (!category || t.category === category) && (!period || monthKey(t.date) === period) && (!tag || t.tags?.includes(tag)))
      .filter((t) => !needle || t.payee.toLowerCase().includes(needle) || t.category.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle) || String(t.amount).includes(needle) || t.date.includes(needle) || (t.tags ?? []).some((x) => x.includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [data.transactions, q, type, account, category, period, tag])

  const totals = useMemo(() => {
    const ccy = new Map(data.accounts.map((a) => [a.id, a.currency]))
    let i = 0, o = 0
    for (const t of filtered) {
      const v = toBase(data, t.amount, ccy.get(t.accountId) ?? data.settings.currency) ?? 0
      if (t.type === 'income') i += v
      else if (t.type === 'expense') o += v
    }
    return { i, o }
  }, [filtered, data])

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const anyFilter = q || type || account || category || period || tag

  if (!data.transactions.length) {
    return (
      <div className="panel">
        <Empty
          icon={<Receipt size={28} />}
          title="Your money in and out will appear here"
          body="Log money in and money out by hand in seconds (press N), or import a CSV statement you downloaded from your bank."
          action={<div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => open({ kind: 'tx' })}><Plus size={16} /> Add a transaction</button><button className="btn" onClick={() => open({ kind: 'import' })}><FileUp size={16} /> Import CSV</button></div>}
        />
      </div>
    )
  }

  return (
    <>
      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi"><div className="label"><span className="dot" style={{ background: 'var(--in)' }} />Money in</div><div className="value num">{money(totals.i)}</div><div className="foot">{anyFilter ? 'Matching your filters' : 'All time'}</div></div>
        <div className="kpi"><div className="label"><span className="dot" style={{ background: 'var(--out)' }} />Money out</div><div className="value num">{money(totals.o)}</div><div className="foot">{anyFilter ? 'Matching your filters' : 'All time'}</div></div>
        <div className="kpi"><div className="label">Difference</div><div className={`value num ${totals.i - totals.o < 0 ? 'neg' : 'pos'}`}>{money(totals.i - totals.o, { sign: true })}</div><div className="foot">Transfers & balance updates not counted</div></div>
        <div className="kpi"><div className="label">Transactions</div><div className="value num">{filtered.length.toLocaleString()}</div><div className="foot">of {data.transactions.length.toLocaleString()} total</div></div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="search-input grow">
            <Search size={16} />
            <input className="input" placeholder="Search payee, category, #tag, note, amount or date" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
          </div>
          <select className="select" value={type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Type">
            <option value="">All types</option>
            <option value="expense">Money out</option>
            <option value="income">Money in</option>
            <option value="transfer">Transfers</option>
            <option value="adjustment">Balance updates</option>
          </select>
          <select className="select" value={account} onChange={(e) => setFilter({ account: e.target.value })} aria-label="Account">
            <option value="">All accounts</option>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select" value={category} onChange={(e) => setFilter({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            <optgroup label="Money out">{expenseCategories(data.settings.customCategories).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>
            <optgroup label="Money in">{incomeCategories(data.settings.customCategories).map((c) => <option key={c.name}>{c.name}</option>)}</optgroup>
            <option>{TRANSFER_CATEGORY}</option>
            <option>{ADJUSTMENT_CATEGORY}</option>
          </select>
          <select className="select" value={period} onChange={(e) => setFilter({ month: e.target.value })} aria-label="Month">
            <option value="">All time</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {tags.length > 0 && (
            <select className="select" value={tag} onChange={(e) => setFilter({ tag: e.target.value })} aria-label="Tag">
              <option value="">All tags</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
          {anyFilter && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); go({ page: 'money' }) }}><X size={14} /> Clear filters</button>}
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-sm" onClick={() => open({ kind: 'import' })}><FileUp size={14} /> Import</button>
            <button className="btn btn-sm" onClick={() => download(`finspace-transactions-${todayISO()}.csv`, transactionsToCSV(data, filtered), 'text/csv')} title={anyFilter ? 'Exports only what matches your filters' : 'Exports every transaction'}><Download size={14} /> Export{anyFilter ? ' filtered' : ''}</button>
          </div>
        </div>

        {filtered.length ? (
          <>
            <TxList txs={filtered.slice(0, limit)} selectable selected={selected} onToggle={toggle} accountId={account || undefined} />
            {filtered.length > limit && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button className="btn" onClick={() => setLimit(limit + PAGE * 2)}>Show more ({filtered.length - limit} left)</button>
              </div>
            )}
          </>
        ) : (
          <Empty icon={<Search size={24} />} title="Nothing matches" body="Try a different search or clear the filters." />
        )}
      </section>

      {selected.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <b>{selected.size} selected</b>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set(filtered.slice(0, limit).map((t) => t.id)))}>Select all shown</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn btn-sm btn-danger" onClick={() => { withUndo(`${selected.size} transaction${selected.size === 1 ? '' : 's'} deleted`, { type: 'deleteTxs', ids: [...selected] }); setSelected(new Set()) }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </>
  )
}

function Recurring() {
  const { data } = useStore()
  const { open } = useUI()
  const rules = [...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate.localeCompare(b.nextDate))
  const accs = new Map(data.accounts.map((a) => [a.id, a]))
  const monthly = (type: 'income' | 'expense') => data.recurring.filter((r) => r.active && r.type === type).reduce((s, r) => s + (toBase(data, monthlyEquivalent(r), accs.get(r.accountId)?.currency ?? data.settings.currency) ?? 0), 0)
  const next30 = upcoming(data.recurring, 30)

  if (!rules.length) {
    return (
      <div className="panel">
        <Empty icon={<Repeat size={28} />} title="Nothing repeats yet" body="Add rent, salary, subscriptions or savings transfers once — Finspace adds each one automatically when it’s due, so you don’t have to." action={<button className="btn btn-primary" onClick={() => open({ kind: 'recurring' })}><Plus size={16} /> Add repeating payment</button>} />
      </div>
    )
  }
  return (
    <div className="dash">
      <section className="kpis span-12">
        <div className="kpi"><div className="label"><span className="dot" style={{ background: 'var(--out)' }} />Repeating costs</div><div className="value num">{money(monthly('expense'))}</div><div className="foot">per month, on average <HowCalculated>Each active repeating payment converted to a monthly amount (weekly × 52 ÷ 12, yearly ÷ 12, and so on).</HowCalculated></div></div>
        <div className="kpi"><div className="label"><span className="dot" style={{ background: 'var(--in)' }} />Repeating income</div><div className="value num">{money(monthly('income'))}</div><div className="foot">per month, on average</div></div>
        <div className="kpi"><div className="label">Due in the next 30 days</div><div className="value num">{next30.length}</div><div className="foot">{money(next30.filter((u) => u.rule.type === 'expense').reduce((s, u) => s + u.rule.amount, 0), { cents: false })} going out</div></div>
        <div className="kpi"><div className="label">Active rules</div><div className="value num">{data.recurring.filter((r) => r.active).length}</div><div className="foot">{data.recurring.filter((r) => !r.active).length} paused</div></div>
      </section>
      <section className="panel span-12">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Payment</th><th className="hide-sm">How often</th><th className="hide-sm">Account</th><th>Next</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {rules.map((r) => {
                const a = accs.get(r.accountId)
                return (
                  <tr key={r.id} className="clickable" onClick={() => open({ kind: 'recurring', rule: r })} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td><div className="row"><span className="tx-ic" aria-hidden><CatGlyph name={r.category} /></span><div><div style={{ fontWeight: 600 }}>{r.payee}</div><div className="muted" style={{ fontSize: 12 }}>{r.type === 'transfer' ? `Transfer to ${accs.get(r.toAccountId ?? '')?.name ?? '—'}` : r.category}{!r.active && ' · paused'}</div></div></div></td>
                    <td className="hide-sm muted">{freqLabel(r.frequency)}</td>
                    <td className="hide-sm muted">{a?.name ?? '—'}</td>
                    <td>{r.active ? shortDate(r.nextDate) : '—'}</td>
                    <td className={`r num ${r.type === 'income' ? 'pos' : ''}`} style={{ fontWeight: 600 }}>{r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}{money(r.amount, { currency: a?.currency })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

type Period = '1' | '3' | '6' | '12' | 'ytd'
const PERIODS: { value: Period; label: string }[] = [
  { value: '1', label: 'This month' },
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: 'ytd', label: 'This year' },
]

function periodRange(p: Period, today = todayISO()) {
  const cur = today.slice(0, 7)
  if (p === 'ytd') {
    const from = `${today.slice(0, 4)}-01-01`
    const months = Number(today.slice(5, 7))
    return { from, to: today, months, prevFrom: `${Number(today.slice(0, 4)) - 1}-01-01`, prevTo: `${Number(today.slice(0, 4)) - 1}${today.slice(4)}` }
  }
  const n = Number(p)
  const from = monthStart(addMonths(cur, -(n - 1)))
  return { from, to: today, months: n, prevFrom: monthStart(addMonths(cur, -(2 * n - 1))), prevTo: monthEnd(addMonths(cur, -n)) }
}

function Analysis() {
  const { data } = useStore()
  const { go, open } = useUI()
  const [p, setP] = useState<Period>('3')
  const today = todayISO()
  const rng = periodRange(p, today)
  const flow = flowBetween(data, rng.from, rng.to)
  const prevFlow = flowBetween(data, rng.prevFrom, rng.prevTo)
  const spend = byCategory(data, 'expense', rng.from, rng.to)
  const spendPrev = byCategory(data, 'expense', rng.prevFrom, rng.prevTo)
  const income = byCategory(data, 'income', rng.from, rng.to)
  const bigOut = largestTransactions(data, 'expense', rng.from, rng.to, 6)
  const vel = spendingVelocity(data, today)
  const series = flowSeries(data, today.slice(0, 7), 12)
  const avgMonths = Math.max(1, rng.months)
  const accs = new Map(data.accounts.map((a) => [a.id, a]))
  const recurringOut = data.recurring.filter((r) => r.active && r.type === 'expense').map((r) => ({ r, monthly: toBase(data, monthlyEquivalent(r), accs.get(r.accountId)?.currency ?? data.settings.currency) ?? 0 })).sort((a, b) => b.monthly - a.monthly)

  if (!data.transactions.length) return <div className="panel"><Empty icon={<Receipt size={28} />} title="Nothing to analyse yet" body="Once you’ve logged some money in and out, trends and breakdowns appear here." action={<button className="btn btn-primary" onClick={() => open({ kind: 'tx' })}>Add a transaction</button>} /></div>

  return (
    <div className="dash">
      <div className="span-12 toolbar" style={{ marginBottom: 0 }}>
        <div className="segmented" role="group" aria-label="Period">
          {PERIODS.map((x) => <button key={x.value} aria-pressed={p === x.value} onClick={() => setP(x.value)}>{x.label}</button>)}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>Compared with the {p === 'ytd' ? 'same period last year' : 'previous ' + (p === '1' ? 'month' : `${p} months`)}</span>
      </div>
      <section className="kpis span-12">
        <div className="kpi"><div className="label"><span className="dot" style={{ background: 'var(--in)' }} />Money in</div><div className="value num">{money(flow.income)}</div><div className="foot"><Delta value={prevFlow.income > 0 ? (flow.income - prevFlow.income) / prevFlow.income : 0} /> · avg {money(flow.income / avgMonths, { cents: false })}/mo</div></div>
        <div className="kpi"><div className="label"><span className="dot" style={{ background: 'var(--out)' }} />Money out</div><div className="value num">{money(flow.expense)}</div><div className="foot"><Delta value={prevFlow.expense > 0 ? (flow.expense - prevFlow.expense) / prevFlow.expense : 0} invert /> · avg {money(flow.expense / avgMonths, { cents: false })}/mo</div></div>
        <div className="kpi"><div className="label">Left over</div><div className={`value num ${flow.net < 0 ? 'neg' : 'pos'}`}>{money(flow.net, { sign: true })}</div><div className="foot">{flow.income > 0 ? `${pct(flow.net / flow.income)} of money in` : '—'}</div></div>
        <div className="kpi">
          <div className="label">Spending pace <HowCalculated>How much you’ve spent by day {vel.day} of this month, compared with the same days last month. The projection assumes you keep spending at the same daily rate.</HowCalculated></div>
          <div className="value num">{money(vel.perDay, { cents: false })}<span className="muted" style={{ fontSize: 14 }}> /day</span></div>
          <div className="foot">{vel.then > 0 ? <><Delta value={(vel.now - vel.then) / vel.then} invert /> vs last month</> : null} · on track for {money(vel.projected, { cents: false })}</div>
        </div>
      </section>

      <section className="panel span-12">
        <div className="panel-head"><div><h2 className="panel-title">Cash-flow trend</h2><div className="panel-sub">Last 12 months</div></div><div className="legend" style={{ marginRight: 80 }}><span><i style={{ background: 'var(--in)' }} />Money in</span><span><i style={{ background: 'var(--out)' }} />Money out</span></div></div>
        <ChartFrame caption="Money in and out by month" chart={<FlowBars data={series} height={240} onSelect={(m) => go({ page: 'money', month: m })} />} table={{ head: ['Month', 'Money in', 'Money out', 'Left over'], rows: series.map((f) => [monthLabel(f.month), money(f.income), money(f.expense), money(f.net, { sign: true })]) }} />
      </section>

      <section className="panel span-7">
        <div className="panel-head"><div><h2 className="panel-title">Spending by category</h2><div className="panel-sub">{PERIODS.find((x) => x.value === p)?.label} · change vs previous</div></div></div>
        {spend.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Category</th><th className="r">Spent</th><th className="r hide-sm">Avg / month</th><th className="r">Change</th></tr></thead>
              <tbody>
                {spend.map((c) => {
                  const before = spendPrev.find((x) => x.category === c.category)?.amount ?? 0
                  return (
                    <tr key={c.category} className="clickable" onClick={() => go({ page: 'money', category: c.category })}>
                      <td><CatLabel name={c.category} /></td>
                      <td className="r num" style={{ fontWeight: 600 }}>{money(c.amount, { cents: false })}</td>
                      <td className="r num hide-sm muted">{money(c.amount / avgMonths, { cents: false })}</td>
                      <td className="r">{before > 0 ? <Delta value={(c.amount - before) / before} invert /> : <span className="pill">New</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No spending in this period.</p>}
      </section>

      <section className="panel span-5">
        <div className="panel-head"><div><h2 className="panel-title">Money in by source</h2><div className="panel-sub">{PERIODS.find((x) => x.value === p)?.label}</div></div></div>
        {income.length ? (
          <div className="barlist">
            {income.map((c, i) => (
              <div key={c.category} className="barlist-row">
                <span className="name"><span className="cat-glyph"><CatGlyph name={c.category} size={14} /></span><span>{c.category}</span></span>
                <span className="amt num">{money(c.amount, { cents: false })}<small>{pct(c.amount / (flow.income || 1))}</small></span>
                <span className="track"><i style={{ width: `${(c.amount / income[0].amount) * 100}%`, background: 'var(--in)', animationDelay: `${i * 50}ms` }} /></span>
              </div>
            ))}
          </div>
        ) : <p className="muted">No money in during this period.</p>}
      </section>

      <section className="panel span-6">
        <div className="panel-head"><div><h2 className="panel-title">Largest purchases</h2><div className="panel-sub">{PERIODS.find((x) => x.value === p)?.label}</div></div></div>
        {bigOut.length ? <TxList txs={bigOut.map((b) => b.t)} grouped={false} /> : <p className="muted">No spending in this period.</p>}
      </section>

      <section className="panel span-6">
        <div className="panel-head"><div><h2 className="panel-title">Repeating costs</h2><div className="panel-sub">Monthly equivalent of each active repeating payment</div></div><button className="link-btn" onClick={() => go({ page: 'money', tab: 'recurring' })}>Manage</button></div>
        {recurringOut.length ? (
          <div className="form-stack" style={{ gap: 10 }}>
            {recurringOut.slice(0, 8).map(({ r, monthly }) => (
              <button key={r.id} className="between" style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', fontSize: 13 }} onClick={() => open({ kind: 'recurring', rule: r })}>
                <span className="cat-label"><span className="cat-glyph"><CatGlyph name={r.category} size={14} /></span>{r.payee} <span className="muted">· {freqLabel(r.frequency).toLowerCase()}</span></span>
                <b className="num">{money(monthly)}/mo</b>
              </button>
            ))}
            <div className="divider" style={{ margin: '8px 0' }} />
            <div className="between"><b>Total</b><b className="num">{money(recurringOut.reduce((s, x) => s + x.monthly, 0))}/mo</b></div>
          </div>
        ) : <p className="muted">No repeating costs set up.</p>}
      </section>
    </div>
  )
}
