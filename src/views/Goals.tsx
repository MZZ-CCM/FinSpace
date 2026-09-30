import { useMemo } from 'react'
import { GoalGlyph } from '../components/glyphs'
import { ArrowLeft, Pencil, Plus, Target } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { dateLabel, money, monthLabel, todayISO } from '../lib/format'
import { goalProgress } from '../lib/calc'
import type { Goal } from '../lib/types'
import { AreaLine } from '../components/charts'
import { ChartFrame, Empty, HowCalculated, Progress } from '../components/ui'

export function Goals() {
  const { data } = useStore()
  const { route, open, go } = useUI()
  if (route.page === 'goals' && route.id) {
    const g = data.goals.find((x) => x.id === route.id)
    if (g) return <GoalDetail goal={g} />
  }
  if (!data.goals.length) {
    return (
      <div className="panel page-enter">
        <Empty icon={<Target size={28} />} title="Give your savings a purpose" body="Create a goal — an emergency fund, a house deposit, a holiday — and watch it fill up. Link it to a savings account or add money as you go." action={<button className="btn btn-primary" onClick={() => open({ kind: 'goal' })}><Plus size={16} /> Create a goal</button>} />
      </div>
    )
  }
  const total = data.goals.reduce((s, g) => s + goalProgress(data, g).current, 0)
  const target = data.goals.reduce((s, g) => s + g.target, 0)
  return (
    <div className="page-enter">
      <div className="toolbar">
        <span className="muted"><b className="num" style={{ color: 'var(--text-1)' }}>{money(total, { cents: false })}</b> saved of <b className="num" style={{ color: 'var(--text-1)' }}>{money(target, { cents: false })}</b> across {data.goals.length} goal{data.goals.length === 1 ? '' : 's'}</span>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => open({ kind: 'goal' })}><Plus size={16} /> Create a goal</button>
      </div>
      <div className="goals-grid stagger">
        {data.goals.map((g) => <GoalCard key={g.id} goal={g} onClick={() => go({ page: 'goals', id: g.id })} />)}
      </div>
    </div>
  )
}

function statusLine(p: ReturnType<typeof goalProgress>, g: Goal) {
  if (p.done) return '🎉 Reached!'
  if (p.perMonth !== null) return `${money(p.perMonth, { cents: false })}/month to reach it by ${monthLabel(g.targetDate!.slice(0, 7))}`
  if (g.targetDate) return `Target date ${dateLabel(g.targetDate)} has passed`
  return `${money(p.remaining, { cents: false })} to go`
}

function GoalCard({ goal, onClick }: { goal: Goal; onClick: () => void }) {
  const { data } = useStore()
  const p = goalProgress(data, goal)
  const acc = data.accounts.find((a) => a.id === goal.accountId)
  return (
    <button className="goal-card" onClick={onClick} aria-label={`${goal.name}: ${Math.round(p.ratio * 100)}% of ${money(goal.target)}`}>
      <div className="row" style={{ gap: 16 }}>
        <div className="goal-ring" style={{ '--p': Math.min(100, p.ratio * 100) } as React.CSSProperties} aria-hidden><GoalGlyph goal={goal} size={22} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '600 17px var(--display)' }}>{goal.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>{acc ? `Follows ${acc.name}` : `${goal.contributions.length} contribution${goal.contributions.length === 1 ? '' : 's'}`}</div>
        </div>
        <div className="num" style={{ marginLeft: 'auto', font: '600 22px var(--display)' }}>{Math.round(p.ratio * 100)}%</div>
      </div>
      <Progress ratio={p.ratio} label={`${goal.name} progress`} tone={p.done ? 'ok' : 'accent'} />
      <div className="between" style={{ fontSize: 13 }}>
        <span><b className="num">{money(p.current, { cents: false })}</b> <span className="muted">of {money(goal.target, { cents: false })}</span></span>
        <span className="muted">{statusLine(p, goal)}</span>
      </div>
    </button>
  )
}

function GoalDetail({ goal }: { goal: Goal }) {
  const { data } = useStore()
  const { open, go } = useUI()
  const p = goalProgress(data, goal)
  const acc = data.accounts.find((a) => a.id === goal.accountId)
  const history = useMemo(() => {
    let run = 0
    return [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date)).map((c) => { run += c.amount; return { key: c.id, label: dateLabel(c.date), value: run } })
  }, [goal.contributions])
  return (
    <div className="page-enter">
      <button className="link-btn mb-16" onClick={() => go({ page: 'goals' })}><ArrowLeft size={14} /> All goals</button>
      <div className="dash stagger">
        <section className="hero span-12">
          <div className="hero-top">
            <div className="row" style={{ gap: 24 }}>
              <div className="goal-ring" style={{ '--p': Math.min(100, p.ratio * 100), width: 104, height: 104, fontSize: 40 } as React.CSSProperties} aria-hidden><GoalGlyph goal={goal} size={34} /></div>
              <div>
                <div className="eyebrow">{goal.name}</div>
                <div className="hero-value num">{money(p.current, { cents: false })} <span className="muted" style={{ fontSize: '0.45em' }}>of {money(goal.target, { cents: false })}</span></div>
                <div className="hero-meta">{statusLine(p, goal)}{p.perMonth !== null && <HowCalculated>Amount still needed ({money(p.remaining, { cents: false })}) ÷ months until your target date ({p.monthsLeft!.toFixed(1)}).</HowCalculated>}</div>
              </div>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {!acc && <button className="btn btn-primary" onClick={() => open({ kind: 'contribute', goalId: goal.id })}><Plus size={16} /> Add money</button>}
              {acc && <button className="btn btn-primary" onClick={() => go({ page: 'accounts', id: acc.id })}>Open {acc.name}</button>}
              <button className="btn" onClick={() => open({ kind: 'goal', goal })}><Pencil size={14} /> Edit</button>
            </div>
          </div>
          <div className="mt-24"><Progress ratio={p.ratio} label="Goal progress" tone={p.done ? 'ok' : 'accent'} /></div>
        </section>
        {acc ? (
          <section className="panel span-12"><p className="muted" style={{ margin: 0 }}>This goal follows the balance of <b>{acc.name}</b>. Add money to that account (for example with a transfer) and the goal moves with it.</p></section>
        ) : (
          <>
            <section className="panel span-7">
              <div className="panel-head"><div><h2 className="panel-title">Progress over time</h2><div className="panel-sub">Running total of contributions</div></div></div>
              {history.length > 1 ? <ChartFrame caption="Goal progress" chart={<AreaLine data={history} height={220} label="Saved" />} table={{ head: ['Date', 'Saved'], rows: history.map((h) => [h.label, money(h.value)]) }} /> : <p className="muted">Add money a couple of times to see the trend.</p>}
            </section>
            <section className="panel span-5">
              <div className="panel-head"><div><h2 className="panel-title">Contributions</h2><div className="panel-sub">{goal.contributions.length} so far</div></div><button className="link-btn" onClick={() => open({ kind: 'contribute', goalId: goal.id })}>Manage</button></div>
              <div className="form-stack" style={{ gap: 10 }}>
                {[...goal.contributions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((c) => (
                  <div key={c.id} className="between" style={{ fontSize: 13 }}><span>{dateLabel(c.date)}{c.note ? <span className="muted"> · {c.note}</span> : null}</span><b className={`num ${c.amount >= 0 ? 'pos' : 'neg'}`}>{money(c.amount, { sign: true })}</b></div>
                ))}
                {!goal.contributions.length && <p className="muted" style={{ margin: 0 }}>Nothing added yet.</p>}
              </div>
            </section>
          </>
        )}
        {goal.targetDate && <p className="muted span-12" style={{ fontSize: 12 }}>Created {dateLabel(goal.createdAt)} · target {dateLabel(goal.targetDate)}{goal.targetDate < todayISO() ? ' (passed)' : ''}</p>}
      </div>
    </div>
  )
}
