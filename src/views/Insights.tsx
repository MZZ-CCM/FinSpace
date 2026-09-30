import { useMemo, useState } from 'react'
import { Activity, HeartPulse } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { dateLabel, money, monthLabel, pct, todayISO } from '../lib/format'
import { healthMetrics } from '../lib/calc'
import { buildInsights } from '../lib/insights'
import { buildTimeline, EVENT_LABELS, type EventKind } from '../lib/timeline'
import { Empty, HowCalculated, MonthSwitch } from '../components/ui'
import { INSIGHT_ICONS } from './Overview'

const DOT: Record<EventKind, string> = {
  income: 'var(--in)', large: 'var(--out)', investment: 'var(--accent)', dividend: 'var(--gain)', repayment: 'var(--text-2)', goal: 'var(--accent)', portfolio: 'var(--in)', balance: 'var(--text-3)',
}

export function Insights() {
  const { data } = useStore()
  const { month, setMonth, open, go } = useUI()
  const today = todayISO()
  const metrics = useMemo(() => healthMetrics(data, { money: (n) => money(n, { cents: false }), pct: (n) => pct(n) }, today), [data, today])
  const insights = useMemo(() => buildInsights(data, month, today), [data, month, today])
  const events = useMemo(() => buildTimeline(data, today), [data, today])
  const kinds = useMemo(() => [...new Set(events.map((e) => e.kind))], [events])
  const [filter, setFilter] = useState<Set<EventKind>>(new Set())
  const [page, setPage] = useState(0)
  const PER = 10
  const shown = events.filter((e) => !filter.size || filter.has(e.kind))

  if (!data.accounts.length && !data.holdings.length) {
    return <div className="panel page-enter"><Empty icon={<HeartPulse size={28} />} title="Insights appear as you add data" body="Once you’ve added accounts and a month or so of transactions, you’ll see your savings rate, emergency-fund coverage, trends and a timeline of your financial life." action={<button className="btn btn-primary" onClick={() => open({ kind: 'account' })}>Add an account</button>} /></div>
  }

  const groups: { month: string; items: typeof shown }[] = []
  const pages = Math.max(1, Math.ceil(shown.length / PER))
  const pg = Math.min(page, pages - 1)
  const from = pg * PER
  const to = Math.min(shown.length, from + PER)
  for (const e of shown.slice(from, to)) {
    const m = e.date.slice(0, 7)
    const g = groups[groups.length - 1]
    if (g && g.month === m) g.items.push(e)
    else groups.push({ month: m, items: [e] })
  }

  return (
    <div className="page-enter dash">
      <section className="panel span-12">
        <div className="panel-head">
          <div><h2 className="panel-title">Financial health</h2><div className="panel-sub">Plain measures of where you stand. No scores — tap ⓘ to see exactly how each one is worked out.</div></div>
        </div>
        <div className="metrics">
          {metrics.map((m) => (
            <div key={m.id} className="metric">
              <div className="row" style={{ gap: 4, fontSize: 13, color: 'var(--text-2)' }}>{m.label} <HowCalculated>{m.how}</HowCalculated></div>
              <div className="v num">{m.display}</div>
              <div className="st"><i className={m.status} aria-hidden />{m.statusLabel}</div>
            </div>
          ))}
        </div>
        <p className="muted mt-16" style={{ fontSize: 12 }}>These describe your own numbers. They aren’t financial advice.</p>
      </section>

      <section className="panel span-5">
        <div className="panel-head">
          <div><h2 className="panel-title">What stands out</h2><div className="panel-sub">{monthLabel(month)}</div></div>
          <MonthSwitch month={month} onChange={setMonth} />
        </div>
        <div className="insights">
          {insights.length ? insights.map((i) => (
            <div className="insight" key={i.id}>
              <div className={`ic ${i.tone === 'neutral' ? '' : i.tone}`}>{INSIGHT_ICONS[i.icon]}</div>
              <div><b>{i.title}</b> <HowCalculated>{i.why}</HowCalculated><p>{i.body}</p></div>
            </div>
          )) : <p className="muted">Nothing notable for this month yet.</p>}
        </div>
      </section>

      <section className="panel span-7">
        <div className="panel-head">
          <div><h2 className="panel-title">Timeline</h2><div className="panel-sub">Salary, big purchases, investing, dividends, repayments and goal milestones</div></div>
        </div>
        <div className="chips mb-16" role="group" aria-label="Filter timeline">
          {kinds.map((k) => (
            <button key={k} className="chip" aria-pressed={filter.has(k)} onClick={() => { const n = new Set(filter); n.has(k) ? n.delete(k) : n.add(k); setFilter(n); setPage(0) }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[k] }} aria-hidden />{EVENT_LABELS[k]}
            </button>
          ))}
          {filter.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { setFilter(new Set()); setPage(0) }}>Show all</button>}
        </div>
        {shown.length ? (
          <div className="timeline">
            {groups.map((g) => (
              <div key={g.month}>
                <div className="tl-month">{monthLabel(g.month)}</div>
                {g.items.map((e) => (
                  <button key={e.id} className="tl-item" style={{ '--dot': DOT[e.kind] } as React.CSSProperties}
                    onClick={() => {
                      if (!e.ref) return
                      if (e.ref.type === 'tx') { const t = data.transactions.find((x) => x.id === e.ref!.id); if (t) open({ kind: 'tx', tx: t }) }
                      else if (e.ref.type === 'holding') go({ page: 'investments', id: e.ref.id })
                      else go({ page: 'goals', id: e.ref.id })
                    }}>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</b>
                      <span className="muted" style={{ fontSize: 12 }}>{dateLabel(e.date)} · {e.detail}</span>
                    </span>
                    {e.amount !== undefined && (e.kind === 'repayment' || e.kind === 'investment'
                      ? <span className="num muted" style={{ fontWeight: 600 }}>{money(Math.abs(e.amount), { cents: false })}</span>
                      : <span className={`num ${e.positive ? 'pos' : ''}`} style={{ fontWeight: 600 }}>{money(e.amount, { sign: true, cents: false })}</span>)}
                  </button>
                ))}
              </div>
            ))}
            <div className="between mt-16" style={{ marginLeft: -28 }}>
              <span className="muted num" style={{ fontSize: 13 }} aria-live="polite">{from + 1}–{to} of {shown.length}</span>
              <span className="row">
                <button className="btn btn-sm" onClick={() => setPage(pg - 1)} disabled={pg === 0} aria-label="Newer events">‹ Newer</button>
                <button className="btn btn-sm" onClick={() => setPage(pg + 1)} disabled={pg >= pages - 1} aria-label="Older events">Older ›</button>
              </span>
            </div>
          </div>
        ) : <Empty icon={<Activity size={22} />} title="No events yet" body="Salary, large purchases and investments will appear here as you add them." />}
      </section>
    </div>
  )
}
