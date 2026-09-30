import { Pencil, Plus, Target } from 'lucide-react'
import { CatGlyph, CatLabel } from '../components/glyphs'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { addMonths, money, monthEnd, monthLabel, todayISO } from '../lib/format'
import { budgetUsage, overallBudgetUsage, spendByCategory } from '../lib/calc'
import type { Budget } from '../lib/types'
import { Empty, HowCalculated, MonthSwitch } from '../components/ui'

export function Budgets() {
  const { data } = useStore()
  const { month, setMonth, open, go } = useUI()
  const today = todayISO()
  const days = Number(monthEnd(month).slice(8))
  const isCurrent = month === today.slice(0, 7)
  const elapsed = isCurrent ? Number(today.slice(8)) : month < today.slice(0, 7) ? days : 0
  const pace = elapsed / days
  // yearly pace: share of the year gone
  const yearPace = month.slice(0, 4) === today.slice(0, 4) ? (Number(today.slice(5, 7)) - 1 + Number(today.slice(8)) / 30.44) / 12 : month.slice(0, 4) < today.slice(0, 4) ? 1 : 0

  const overall = overallBudgetUsage(data, month)

  if (!data.budgets.length && !overall) {
    return (
      <div className="panel page-enter">
        <Empty icon={<Target size={28} />} title="Budgets are optional — set one when it helps" body="Set one overall limit for everything you spend in a month, or limits for individual categories — or both. Finspace shows how you’re pacing and gives you a gentle heads-up as you get close."
          action={<div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => open({ kind: 'overallBudget' })}><Plus size={16} /> Set an overall budget</button><button className="btn" onClick={() => open({ kind: 'budget' })}>Budget a category</button></div>} />
      </div>
    )
  }

  const monthly = data.budgets.filter((b) => b.period === 'monthly')
  const yearly = data.budgets.filter((b) => b.period === 'yearly')
  const totalLimit = monthly.reduce((s, b) => s + b.limit, 0)
  const totalSpent = monthly.reduce((s, b) => s + budgetUsage(data, b, month).spent, 0)
  const spend = spendByCategory(data, month)
  const unbudgeted = spend.filter((s) => !data.budgets.some((b) => b.category === s.category))
  const forecast = isCurrent && elapsed > 3 ? totalSpent / pace : null
  const history = [3, 2, 1].map((i) => addMonths(month, -i))

  const row = (b: Budget, i: number) => {
    const u = budgetUsage(data, b, month)
    const p = b.period === 'yearly' ? yearPace : pace
    const current = b.period === 'yearly' ? month.slice(0, 4) === today.slice(0, 4) : isCurrent
    const status = u.ratio > 1 ? 'over' : current && u.ratio > p * 1.1 && u.ratio > 0.5 ? 'warn' : 'ok'
    const label = u.ratio > 1 ? `${money(u.spent - b.limit, { cents: false })} over` : u.ratio >= 0.8 ? `You’ve used ${Math.round(u.ratio * 100)}% · ${money(u.remaining, { cents: false })} left` : `${money(u.remaining, { cents: false })} left`
    return (
      <button key={b.category} className="barlist-row" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' }} onClick={() => open({ kind: 'budget', category: b.category })} aria-label={`${b.category}: ${money(u.spent)} of ${money(b.limit)}. ${label}. Edit budget.`}>
        <span className="name"><span className="cat-glyph"><CatGlyph name={b.category} size={14} /></span><span>{b.category}</span></span>
        <span className="amt num">{money(u.spent, { cents: false })} <small>of {money(b.limit, { cents: false })}</small></span>
        <span className="track" style={{ height: 8 }}>
          <i className={status} style={{ width: `${Math.min(100, u.ratio * 100)}%`, animationDelay: `${i * 50}ms` }} />
          {current && <span className="marker" style={{ left: `${p * 100}%` }} />}
        </span>
        <span style={{ gridColumn: '1 / -1', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span className={status === 'over' ? 'neg' : 'muted'}>{status === 'over' ? '▲ ' : status === 'warn' ? '● Ahead of pace · ' : ''}{label}</span>
          {b.period === 'monthly' && <span className="muted num hide-sm">{history.map((m) => `${monthLabel(m, 'short')} ${money(budgetUsage(data, b, m).spent, { cents: false })}`).join(' · ')}</span>}
        </span>
      </button>
    )
  }

  return (
    <div className="page-enter">
      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} />
        <div className="row" style={{ marginLeft: 'auto' }}>
          {!overall && <button className="btn" onClick={() => open({ kind: 'overallBudget' })}><Plus size={16} /> Overall budget</button>}
          <button className="btn btn-primary" onClick={() => open({ kind: 'budget' })}><Plus size={16} /> Category budget</button>
        </div>
      </div>
      <div className="dash stagger">
        {overall && (() => {
          const status = overall.ratio > 1 ? 'over' : isCurrent && overall.ratio > pace * 1.1 && overall.ratio > 0.5 ? 'warn' : 'ok'
          const fc = isCurrent && elapsed > 3 ? overall.spent / pace : null
          const daysLeft = days - elapsed
          return (
            <section className="hero span-12" aria-label="Overall budget">
              <div className="between">
                <div className="eyebrow row" style={{ gap: 4 }}>{monthLabel(month)} · overall budget <HowCalculated>Every money-out transaction this month, across all categories and accounts, compared with your overall monthly limit. Transfers between your own accounts and balance updates don’t count.</HowCalculated></div>
                <button className="btn btn-ghost btn-sm" onClick={() => open({ kind: 'overallBudget' })}><Pencil size={14} /> Edit</button>
              </div>
              <div className="hero-value num">{money(overall.spent)} <span className="muted" style={{ fontSize: '0.45em' }}>of {money(overall.limit)}</span></div>
              <div className="track" style={{ height: 12, marginTop: 8 }} role="progressbar" aria-label="Overall budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, overall.ratio) * 100)}>
                <i className={status} style={{ width: `${Math.min(100, overall.ratio * 100)}%` }} />
                {isCurrent && <span className="marker" style={{ left: `${pace * 100}%` }} title="Where you’d be if spending evenly" />}
              </div>
              <div className="hero-meta mt-16">
                {overall.remaining >= 0
                  ? <span><b style={{ color: 'var(--text-1)' }}>{money(overall.remaining)}</b> left{isCurrent && daysLeft > 0 && <> · about <b style={{ color: 'var(--text-1)' }}>{money(overall.remaining / daysLeft, { cents: false })}</b> a day for the next {daysLeft} days</>}</span>
                  : <span className="neg">▲ <b>{money(-overall.remaining)}</b> over your overall budget</span>}
                {fc !== null && <span>· At this pace: <b style={{ color: fc > overall.limit ? 'var(--loss)' : 'var(--text-1)' }}>{money(fc, { cents: false })}</b> by month end</span>}
              </div>
              <div className="hero-split">
                <div className="cell"><div className="eyebrow">In category budgets</div><div className="v num">{money(overall.allocated, { cents: false })}</div></div>
                <div className="cell"><div className="eyebrow">{overall.unallocated >= 0 ? 'Left for everything else' : 'Category budgets exceed overall by'}</div><div className={`v num ${overall.unallocated < 0 ? 'neg' : ''}`}>{money(Math.abs(overall.unallocated), { cents: false })}</div></div>
                <div className="cell"><div className="eyebrow">Last 3 months</div><div className="v num" style={{ fontSize: 15 }}>{history.map((m) => `${monthLabel(m, 'short')} ${money(overallBudgetUsage(data, m)!.spent, { cents: false })}`).join(' · ')}</div></div>
              </div>
            </section>
          )
        })()}

        {!overall && (
          <div className="since span-12" role="note">
            <Target size={18} style={{ color: 'var(--accent)' }} />
            <span className="grow">Want one number to stay under? Set an <b>overall budget</b> for all your spending this month.</span>
            <button className="btn btn-sm" onClick={() => open({ kind: 'overallBudget' })}>Set overall budget</button>
          </div>
        )}

        {monthly.length > 0 && !overall && (
          <section className="hero span-12">
            <div className="eyebrow">{monthLabel(month)} · category budgets combined</div>
            <div className="hero-value num">{money(totalSpent)} <span className="muted" style={{ fontSize: '0.45em' }}>of {money(totalLimit)}</span></div>
            <div className="track" style={{ height: 10, marginTop: 8 }}>
              <i className={totalSpent > totalLimit ? 'over' : totalSpent > totalLimit * pace * 1.1 && isCurrent ? 'warn' : 'ok'} style={{ width: `${Math.min(100, (totalSpent / totalLimit) * 100)}%` }} />
              {isCurrent && <span className="marker" style={{ left: `${pace * 100}%` }} title="Where you’d be if spending evenly" />}
            </div>
            <div className="hero-meta mt-16">
              {totalSpent <= totalLimit ? <span><b style={{ color: 'var(--text-1)' }}>{money(totalLimit - totalSpent)}</b> left{isCurrent && ` · ${days - elapsed} days to go`}</span> : <span className="neg"><b>{money(totalSpent - totalLimit)}</b> over budget</span>}
              {forecast !== null && <span>· At this pace: <b style={{ color: forecast > totalLimit ? 'var(--loss)' : 'var(--text-1)' }}>{money(forecast, { cents: false })}</b> by month end <HowCalculated>Budgeted spending so far ÷ days gone × days in the month. It assumes you keep spending at the same daily rate.</HowCalculated></span>}
            </div>
          </section>
        )}

        <section className="panel span-8">
          <div className="panel-head"><div><h2 className="panel-title">Category budgets</h2><div className="panel-sub">{isCurrent ? 'The white tick shows where you’d be spending evenly · last 3 months on the right' : 'Final figures for the month'}</div></div></div>
          {monthly.length ? <div className="barlist" style={{ gap: 20 }}>{[...monthly].sort((a, b) => budgetUsage(data, b, month).ratio - budgetUsage(data, a, month).ratio).map(row)}</div> : <p className="muted">No category budgets yet. <button className="link-btn" onClick={() => open({ kind: 'budget' })}>Budget a category</button> to see where the overall limit goes.</p>}
          {yearly.length > 0 && (
            <>
              <div className="divider" />
              <h2 className="panel-title mb-16">Yearly budgets · {month.slice(0, 4)}</h2>
              <div className="barlist" style={{ gap: 20 }}>{yearly.map(row)}</div>
            </>
          )}
        </section>

        <section className="panel span-4">
          <div className="panel-head"><div><h2 className="panel-title">Not budgeted</h2><div className="panel-sub">Spending with no limit set, {monthLabel(month, 'short')}</div></div></div>
          {unbudgeted.length ? (
            <div className="form-stack" style={{ gap: 12 }}>
              {unbudgeted.map((u) => (
                <div key={u.category} className="between">
                  <button className="link-btn" style={{ color: 'var(--text-1)' }} onClick={() => go({ page: 'money', category: u.category, month })}><CatLabel name={u.category} /></button>
                  <span className="row"><span className="num">{money(u.amount, { cents: false })}</span><button className="btn btn-sm btn-ghost" onClick={() => open({ kind: 'budget', category: u.category })} aria-label={`Set budget for ${u.category}`}>Set</button></span>
                </div>
              ))}
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>Every category you spent in has a budget.</p>}
        </section>
      </div>
    </div>
  )
}
