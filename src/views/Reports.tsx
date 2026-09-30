import { useMemo, useState } from 'react'
import { CatLabel } from '../components/glyphs'
import { Download, FileText, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { addMonths, dayBefore, money, monthEnd, monthLabel, monthStart, pct, todayISO } from '../lib/format'
import { byCategory, flowBetween, largestTransactions, netInvested, portfolioReturn, positionAt } from '../lib/calc'
import { download, transactionsToCSV } from '../lib/csv'
import { Delta, Empty, HowCalculated, MonthSwitch, Tabs } from '../components/ui'
import { FlowBars } from '../components/charts'

type Kind = 'month' | 'year' | 'range'

interface Snap {
  income: number
  expense: number
  invested: number
  net: number
  portfolio: number
  netWorth: number
}

function snapshot(data: ReturnType<typeof useStore>['data'], from: string, to: string): Snap {
  const today = todayISO()
  const end = to > today ? today : to
  const f = flowBetween(data, from, end)
  return {
    income: f.income,
    expense: f.expense,
    invested: netInvested(data, from, end),
    net: f.net,
    portfolio: portfolioReturn(data, from, end).pl,
    netWorth: positionAt(data, end).net - positionAt(data, dayBefore(from)).net,
  }
}

export function Reports() {
  const { data } = useStore()
  const { month, setMonth } = useUI()
  const [kind, setKind] = useState<Kind>('month')
  const today = todayISO()
  const [from, setFrom] = useState(monthStart(addMonths(today.slice(0, 7), -2)))
  const [to, setTo] = useState(today)
  const [year, setYear] = useState(Number(today.slice(0, 4)))

  if (!data.transactions.length && !data.holdings.length) {
    return <div className="panel page-enter"><Empty icon={<FileText size={28} />} title="Reports are built from your transactions" body="Once there’s some activity, you’ll get a monthly report, year-on-year comparison and custom date ranges — all printable and exportable." /></div>
  }

  return (
    <div className="page-enter">
      <div className="between no-print" style={{ flexWrap: 'wrap', gap: 12 }}>
        <Tabs<Kind> label="Report type" value={kind} onChange={setKind} options={[{ value: 'month', label: 'Monthly report' }, { value: 'year', label: 'Year on year' }, { value: 'range', label: 'Custom dates' }]} />
        <button className="btn" style={{ marginBottom: 24 }} onClick={() => window.print()}><Printer size={15} /> Print or save as PDF</button>
      </div>
      {kind === 'month' && <MonthReport month={month} setMonth={setMonth} />}
      {kind === 'year' && <YearReport year={year} setYear={setYear} />}
      {kind === 'range' && (
        <>
          <div className="toolbar no-print">
            <label className="row" style={{ fontSize: 13 }}>From <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || from)} style={{ width: 170 }} /></label>
            <label className="row" style={{ fontSize: 13 }}>To <input className="input" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value || to)} style={{ width: 170 }} /></label>
          </div>
          <RangeReport from={from} to={to} />
        </>
      )}
    </div>
  )
}

const ROWS: { key: keyof Snap; label: string; good: 'up' | 'down' | 'none'; how: string }[] = [
  { key: 'income', label: 'Money in', good: 'up', how: 'Income across all accounts. Transfers between your own accounts aren’t counted.' },
  { key: 'expense', label: 'Money out', good: 'down', how: 'Spending across all accounts. Transfers and balance updates aren’t counted.' },
  { key: 'net', label: 'Net cash flow', good: 'up', how: 'Money in − money out.' },
  { key: 'invested', label: 'Put into investments', good: 'none', how: 'Purchases minus sales of holdings in the period.' },
  { key: 'portfolio', label: 'Portfolio change', good: 'up', how: 'Investment gain or loss: end value − start value − money added + money taken out + dividends.' },
  { key: 'netWorth', label: 'Net worth change', good: 'up', how: 'Net worth at the end of the period minus net worth the day before it started. Includes balance updates such as pension valuations.' },
]

function Compare({ cols }: { cols: { label: string; snap: Snap }[] }) {
  const [a, b, c] = cols
  return (
    <div className="cmp" role="table">
      <div className="h" role="columnheader">&nbsp;</div>
      {cols.map((x) => <div key={x.label} className="h r" role="columnheader">{x.label}</div>)}
      {ROWS.map((r) => (
        <div key={r.key} style={{ display: 'contents' }} role="row">
          <div role="rowheader" className="row" style={{ gap: 4 }}>{r.label} <HowCalculated>{r.how}</HowCalculated></div>
          <div className="r num" style={{ fontWeight: 600 }}>{money(a.snap[r.key], { sign: r.key !== 'income' && r.key !== 'expense' && r.key !== 'invested', cents: false })}</div>
          {[b, c].filter(Boolean).map((x) => {
            const d = a.snap[r.key] - x.snap[r.key]
            return (
              <div key={x.label} className="r">
                <div className="num muted" style={{ fontSize: 13 }}>{money(x.snap[r.key], { cents: false })}</div>
                {r.good !== 'none' && Math.abs(d) >= 1 && <Delta value={d} format="money" invert={r.good === 'down'} />}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MonthReport({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { data } = useStore()
  const prev = addMonths(month, -1)
  const lastYear = addMonths(month, -12)
  const cur = useMemo(() => snapshot(data, monthStart(month), monthEnd(month)), [data, month])
  const p = useMemo(() => snapshot(data, monthStart(prev), monthEnd(prev)), [data, prev])
  const ly = useMemo(() => snapshot(data, monthStart(lastYear), monthEnd(lastYear)), [data, lastYear])
  const cats = byCategory(data, 'expense', monthStart(month), monthEnd(month))
  const catsPrev = byCategory(data, 'expense', monthStart(prev), monthEnd(prev))
  const big = largestTransactions(data, 'expense', monthStart(month), monthEnd(month), 5)
  const inc = byCategory(data, 'income', monthStart(month), monthEnd(month))

  return (
    <div className="dash">
      <div className="span-12 between"><h2 className="panel-title" style={{ fontSize: 20 }}>{monthLabel(month)} report</h2><span className="no-print"><MonthSwitch month={month} onChange={setMonth} /></span></div>
      <section className="report-grid span-12">
        {ROWS.map((r) => (
          <div key={r.key} className="kpi">
            <div className="label">{r.label}</div>
            <div className={`value num ${r.good !== 'none' && r.key !== 'income' && r.key !== 'expense' ? (cur[r.key] >= 0 ? 'pos' : 'neg') : ''}`}>{money(cur[r.key], { sign: r.good !== 'none' && r.key !== 'income' && r.key !== 'expense', cents: false })}</div>
            <div className="foot">{r.good !== 'none' && Math.abs(cur[r.key] - p[r.key]) >= 1 ? <><Delta value={cur[r.key] - p[r.key]} format="money" invert={r.good === 'down'} /> vs {monthLabel(prev, 'short')}</> : `vs ${monthLabel(prev, 'short')}: ${money(p[r.key], { cents: false })}`}</div>
          </div>
        ))}
      </section>
      <section className="panel span-12">
        <div className="panel-head"><div><h2 className="panel-title">Comparison</h2><div className="panel-sub">Each column shows that period’s figure, with a chip for how {monthLabel(month, 'short')} compares to it</div></div></div>
        <Compare cols={[{ label: monthLabel(month, 'short'), snap: cur }, { label: monthLabel(prev, 'short'), snap: p }, { label: monthLabel(lastYear), snap: ly }]} />
      </section>
      <section className="panel span-7">
        <div className="panel-head"><div><h2 className="panel-title">Spending by category</h2><div className="panel-sub">vs {monthLabel(prev, 'short')}</div></div></div>
        <table className="table">
          <thead><tr><th>Category</th><th className="r">{monthLabel(month, 'short')}</th><th className="r">Share</th><th className="r">Change</th></tr></thead>
          <tbody>
            {cats.map((c) => {
              const b = catsPrev.find((x) => x.category === c.category)?.amount ?? 0
              return <tr key={c.category}><td><CatLabel name={c.category} /></td><td className="r num" style={{ fontWeight: 600 }}>{money(c.amount, { cents: false })}</td><td className="r num muted">{pct(c.amount / (cur.expense || 1))}</td><td className="r">{b > 0 ? <Delta value={c.amount - b} format="money" invert /> : <span className="pill">New</span>}</td></tr>
            })}
            {!cats.length && <tr><td colSpan={4} className="muted">No spending this month.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="panel span-5">
        <div className="panel-head"><div><h2 className="panel-title">Money in</h2></div></div>
        <div className="form-stack" style={{ gap: 10 }}>
          {inc.map((c) => <div key={c.category} className="between" style={{ fontSize: 13 }}><CatLabel name={c.category} /><b className="num">{money(c.amount, { cents: false })}</b></div>)}
          {!inc.length && <p className="muted" style={{ margin: 0 }}>No money in this month.</p>}
        </div>
        <div className="divider" />
        <h2 className="panel-title mb-16">Largest purchases</h2>
        <div className="form-stack" style={{ gap: 10 }}>
          {big.map(({ t, base }) => <div key={t.id} className="between" style={{ fontSize: 13 }}><span>{t.payee} <span className="muted">· {t.date.slice(8)} {monthLabel(month, 'short')}</span></span><b className="num">{money(base, { cents: false })}</b></div>)}
          {!big.length && <p className="muted" style={{ margin: 0 }}>None.</p>}
        </div>
      </section>
    </div>
  )
}

function YearReport({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const { data } = useStore()
  const thisY = useMemo(() => Array.from({ length: 12 }, (_, i) => { const m = `${year}-${String(i + 1).padStart(2, '0')}`; return { month: m, ...flowBetween(data, monthStart(m), monthEnd(m)) } }), [data, year])
  const lastY = useMemo(() => Array.from({ length: 12 }, (_, i) => { const m = `${year - 1}-${String(i + 1).padStart(2, '0')}`; return { month: m, ...flowBetween(data, monthStart(m), monthEnd(m)) } }), [data, year])
  const today = todayISO()
  const cutoff = year === Number(today.slice(0, 4)) ? `${year - 1}${today.slice(4)}` : `${year - 1}-12-31`
  const a = snapshot(data, `${year}-01-01`, `${year}-12-31`)
  const b = snapshot(data, `${year - 1}-01-01`, cutoff)
  const bFull = snapshot(data, `${year - 1}-01-01`, `${year - 1}-12-31`)
  return (
    <div className="dash">
      <div className="span-12 between"><h2 className="panel-title" style={{ fontSize: 20 }}>{year} vs {year - 1}</h2>
        <span className="row no-print"><button className="btn btn-sm" onClick={() => setYear(year - 1)}>‹ {year - 1}</button>{year < Number(today.slice(0, 4)) && <button className="btn btn-sm" onClick={() => setYear(year + 1)}>{year + 1} ›</button>}</span>
      </div>
      <section className="panel span-12">
        <div className="panel-head"><div><h2 className="panel-title">Year to date comparison</h2><div className="panel-sub">{year === Number(today.slice(0, 4)) ? `1 Jan – today vs the same days of ${year - 1}` : 'Full years'}</div></div></div>
        <Compare cols={[{ label: String(year), snap: a }, { label: year === Number(today.slice(0, 4)) ? `${year - 1} same period` : String(year - 1), snap: b }, { label: `${year - 1} full year`, snap: bFull }]} />
      </section>
      <section className="panel span-6">
        <div className="panel-head"><div><h2 className="panel-title">{year} by month</h2></div></div>
        <FlowBars data={thisY} height={220} />
      </section>
      <section className="panel span-6">
        <div className="panel-head"><div><h2 className="panel-title">{year - 1} by month</h2></div></div>
        <FlowBars data={lastY} height={220} />
      </section>
      <section className="panel span-12">
        <table className="table">
          <thead><tr><th>Month</th><th className="r">In {year}</th><th className="r">In {year - 1}</th><th className="r">Out {year}</th><th className="r">Out {year - 1}</th><th className="r">Left over {year}</th></tr></thead>
          <tbody>{thisY.map((m, i) => <tr key={m.month}><td>{monthLabel(m.month, 'short')}</td><td className="r num">{money(m.income, { cents: false })}</td><td className="r num muted">{money(lastY[i].income, { cents: false })}</td><td className="r num">{money(m.expense, { cents: false })}</td><td className="r num muted">{money(lastY[i].expense, { cents: false })}</td><td className={`r num ${m.net >= 0 ? 'pos' : 'neg'}`}>{money(m.net, { sign: true, cents: false })}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  )
}

function RangeReport({ from, to }: { from: string; to: string }) {
  const { data } = useStore()
  const s = snapshot(data, from, to)
  const out = byCategory(data, 'expense', from, to)
  const inc = byCategory(data, 'income', from, to)
  const txs = data.transactions.filter((t) => t.date >= from && t.date <= to)
  return (
    <div className="dash">
      <section className="report-grid span-12">
        {ROWS.map((r) => (
          <div key={r.key} className="kpi"><div className="label">{r.label} <HowCalculated>{r.how}</HowCalculated></div><div className="value num">{money(s[r.key], { sign: r.key !== 'income' && r.key !== 'expense' && r.key !== 'invested', cents: false })}</div></div>
        ))}
      </section>
      <section className="panel span-6">
        <div className="panel-head"><div><h2 className="panel-title">Spending by category</h2></div></div>
        <div className="form-stack" style={{ gap: 10 }}>{out.map((c) => <div key={c.category} className="between" style={{ fontSize: 13 }}><CatLabel name={c.category} /><span className="num"><b>{money(c.amount, { cents: false })}</b> <span className="muted">{pct(c.amount / (s.expense || 1))}</span></span></div>)}</div>
      </section>
      <section className="panel span-6">
        <div className="panel-head"><div><h2 className="panel-title">Money in by source</h2></div></div>
        <div className="form-stack" style={{ gap: 10 }}>{inc.map((c) => <div key={c.category} className="between" style={{ fontSize: 13 }}><CatLabel name={c.category} /><b className="num">{money(c.amount, { cents: false })}</b></div>)}</div>
        <div className="divider" />
        <button className="btn no-print" onClick={() => download(`finspace-${from}-to-${to}.csv`, transactionsToCSV(data, txs), 'text/csv')}><Download size={15} /> Export {txs.length} transactions (CSV)</button>
      </section>
    </div>
  )
}
