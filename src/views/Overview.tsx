import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, CreditCard, Flame, PiggyBank, Plus, Receipt, Repeat, Settings2, Sparkles, Target, TrendingDown, TrendingUp, Trophy, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { addMonths, dayBefore, money, monthEnd, monthLabel, monthStart, pct, relativeDays, shortDate, sinceLabel, todayISO } from '../lib/format'
import { RANGES, flowSeries, goalProgress, missingRates, monthFlow, netWorthSeries, portfolioReturn, positionAt, spendByCategory, upcoming, type Range } from '../lib/calc'
import { buildInsights, type InsightIcon } from '../lib/insights'
import { categoryEmoji } from '../lib/meta'
import { AnimatedMoney, ChartFrame, Delta, Empty, HowCalculated, Progress } from '../components/ui'
import { AreaLine, FlowBars, RangeTabs } from '../components/charts'
import { CardDeck } from '../components/CardDeck'
import { TxList } from './Money'

const RANGE_KEY = 'finspace:nwRange'

export const INSIGHT_ICONS: Record<InsightIcon, JSX.Element> = {
  up: <TrendingUp size={18} />, down: <TrendingDown size={18} />, budget: <AlertTriangle size={18} />, card: <CreditCard size={18} />,
  trophy: <Trophy size={18} />, piggy: <PiggyBank size={18} />, repeat: <Repeat size={18} />, receipt: <Receipt size={18} />, chart: <TrendingUp size={18} />, streak: <Sparkles size={18} />,
}

export function Overview() {
  const { data, since, dismissSince } = useStore()
  const { month, setMonth, go, open } = useUI()
  const today = todayISO()
  const prev = addMonths(month, -1)
  const hidden = new Set(data.settings.hiddenWidgets)
  const [range, setRangeState] = useState<Range>(() => {
    try { return (localStorage.getItem(RANGE_KEY) as Range) || '1y' } catch { return '1y' }
  })
  const setRange = (r: Range) => { setRangeState(r); try { localStorage.setItem(RANGE_KEY, r) } catch { /* ignore */ } }

  const pos = useMemo(() => positionAt(data, today), [data, today])
  const mtdBase = useMemo(() => positionAt(data, dayBefore(monthStart(today.slice(0, 7)))).net, [data, today])
  const ytdBase = useMemo(() => positionAt(data, dayBefore(`${today.slice(0, 4)}-01-01`)).net, [data, today])
  const series = useMemo(() => netWorthSeries(data, range), [data, range])
  const rangeChange = series.length ? series[series.length - 1].net - series[0].net : 0
  const flow = useMemo(() => monthFlow(data, month), [data, month])
  const flowPrev = useMemo(() => monthFlow(data, prev), [data, prev])
  const invest = useMemo(() => portfolioReturn(data, monthStart(month), month === today.slice(0, 7) ? today : monthEnd(month)), [data, month, today])
  const spend = useMemo(() => spendByCategory(data, month), [data, month])
  const flows = useMemo(() => flowSeries(data, month >= addMonths(today.slice(0, 7), -5) ? today.slice(0, 7) : addMonths(month, 5), 12), [data, month, today])
  const insights = useMemo(() => buildInsights(data, month, today).slice(0, 4), [data, month, today])
  const soon = useMemo(() => upcoming(data.recurring, 14, today).slice(0, 5), [data.recurring, today])
  const missing = missingRates(data)

  if (!data.accounts.length && !data.holdings.length) {
    return (
      <div className="panel page-enter">
        <Empty
          icon={<Sparkles size={28} />}
          title="Your money, all in one place"
          body="Start by adding an account — a bank account, credit card or cash. You enter the numbers; nothing connects to your bank."
          action={
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => open({ kind: 'account' })}><Plus size={16} /> Add an account</button>
              <button className="btn" onClick={() => open({ kind: 'holding' })}>Add an investment</button>
            </div>
          }
        />
      </div>
    )
  }

  const spendTotal = spend.reduce((s, c) => s + c.amount, 0)
  const savingsRate = flow.income > 0 ? flow.net / flow.income : 0
  const nwData = series.map((p) => ({
    key: p.date,
    label: range === '7d' || range === '1m' || range === '3m' || range === '6m' ? shortDate(p.date) : monthLabel(p.date.slice(0, 7), 'short') + (range === '5y' || range === 'all' ? ` ’${p.date.slice(2, 4)}` : ''),
    value: p.net,
    extra: [{ label: 'Assets', value: p.assets }, { label: 'Liabilities', value: -p.liabilities }],
  }))

  return (
    <div className="dash stagger">
      {since && (since.change !== 0 || since.recurringAdded > 0) && (
        <div className="since span-12" role="status">
          <Sparkles size={18} style={{ color: 'var(--accent)' }} />
          <span className="grow">
            <b>Since your last visit</b> {since.change !== 0 && <span className="muted">({sinceLabel(since.at)})</span>}
            {since.change !== 0 && <> · net worth <b className={`num ${since.change >= 0 ? 'pos' : 'neg'}`}>{money(since.change, { sign: true })}</b></>}
            {since.recurringAdded > 0 && <> · <button className="link-btn" onClick={() => go({ page: 'money', tab: 'recurring' })}>{since.recurringAdded} repeating payment{since.recurringAdded === 1 ? '' : 's'} added</button></>}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={dismissSince} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="since span-12" role="note">
          <AlertTriangle size={18} style={{ color: 'var(--warn)' }} />
          <span className="grow">Accounts in <b>{missing.join(', ')}</b> aren’t included in totals because there’s no exchange rate yet.</span>
          <button className="btn btn-sm" onClick={() => go({ page: 'settings' })}>Add a rate</button>
        </div>
      )}

      {/* ─── Net worth ─── */}
      <section className="hero span-12" aria-label="Net worth">
        <div className="hero-top">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow row" style={{ gap: 4 }}>Net worth <HowCalculated>Everything you own (accounts, investments, pensions) minus everything you owe (cards, loans), in {data.settings.currency}. Accounts in other currencies use the exchange rates in Settings.</HowCalculated></div>
            <div className="hero-value"><AnimatedMoney value={pos.net} split /></div>
            <div className="al-split">
              <span>Assets <b className="num">{money(pos.assets, { cents: false })}</b></span>
              <span>Liabilities <b className="num">{money(pos.liabilities, { cents: false })}</b></span>
            </div>
            <div className="hero-meta mt-16">
              <span className="row" style={{ gap: 6 }}><Delta value={pos.net - mtdBase} format="money" /> this month</span>
              <span className="row" style={{ gap: 6 }}><Delta value={pos.net - ytdBase} format="money" /> this year</span>
            </div>
          </div>
          <div style={{ flex: '1 1 380px', maxWidth: 620, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="between">
              <span className="muted" style={{ fontSize: 12 }}>{RANGES.find((r) => r.value === range)?.label} change <b className={`num ${rangeChange >= 0 ? 'pos' : 'neg'}`}>{money(rangeChange, { sign: true, cents: false })}</b></span>
              <RangeTabs label="Net worth period" value={range} options={RANGES} onChange={setRange} />
            </div>
            <AreaLine data={nwData} height={140} label="Net worth" compact />
          </div>
        </div>
        <div className="hero-split">
          <button className="cell" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => go({ page: 'accounts' })}>
            <div className="eyebrow">Cash & bank</div>
            <div className="v num">{money(pos.cash)}</div>
          </button>
          <button className="cell" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => go({ page: 'investments' })}>
            <div className="eyebrow">Investments & pensions</div>
            <div className="v num">{money(pos.invested)}</div>
          </button>
          <button className="cell" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => go({ page: 'accounts' })}>
            <div className="eyebrow">Owed on cards & loans</div>
            <div className="v num">{money(pos.liabilities)}</div>
          </button>
        </div>
      </section>

      <div className="span-12 between no-print" style={{ marginBottom: -8 }}>
        <h2 className="panel-title" style={{ fontSize: 17 }}>{monthLabel(month)}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => open({ kind: 'customize' })}><Settings2 size={14} /> Customise</button>
      </div>

      {!hidden.has('kpis') && (
        <section className="kpis span-12" aria-label={`${monthLabel(month)} summary`}>
          <Kpi dot="var(--in)" label="Money in" value={flow.income} change={rel(flow.income, flowPrev.income)} foot={`vs ${monthLabel(prev, 'short')}`} onClick={() => go({ page: 'money', type: 'income', month })} />
          <Kpi dot="var(--out)" label="Money out" value={flow.expense} change={rel(flow.expense, flowPrev.expense)} invert foot={`vs ${monthLabel(prev, 'short')}`} onClick={() => go({ page: 'money', type: 'expense', month })} />
          <div className="kpi">
            <div className="label"><PiggyBank size={15} /> Left over <HowCalculated>Money in − money out for the month. Transfers between your own accounts and balance updates aren’t counted.</HowCalculated></div>
            <div className={`value num ${flow.net < 0 ? 'neg' : ''}`}><AnimatedMoney value={flow.net} sign /></div>
            <div className="foot">{flow.income > 0 ? <>You kept <b style={{ color: 'var(--text-1)' }}>{pct(Math.max(-9.99, savingsRate))}</b> of what came in</> : 'No money in logged yet'}</div>
          </div>
          <button className="kpi" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => go({ page: 'investments' })}>
            <div className="label">{invest.pl >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} Investments this month</div>
            <div className={`value num ${invest.pl > 0 ? 'pos' : invest.pl < 0 ? 'neg' : ''}`}><AnimatedMoney value={invest.pl} sign /></div>
            <div className="foot">{data.holdings.length ? <><Delta value={invest.pct} /> incl. dividends</> : 'No investments yet'}</div>
          </button>
        </section>
      )}

      {!hidden.has('cashflow') && (
        <section className={`panel ${hidden.has('spending') ? 'span-12' : 'span-8'}`}>
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Money in vs money out</h2>
              <div className="panel-sub">12 months · click a month to focus it</div>
            </div>
            <div className="legend" style={{ marginRight: 80 }}>
              <span><i style={{ background: 'var(--in)' }} />Money in</span>
              <span><i style={{ background: 'var(--out)' }} />Money out</span>
            </div>
          </div>
          <ChartFrame
            caption="Money in and out by month"
            chart={<FlowBars data={flows} selected={month} onSelect={setMonth} />}
            table={{ head: ['Month', 'Money in', 'Money out', 'Left over'], rows: flows.map((f) => [monthLabel(f.month), money(f.income), money(f.expense), money(f.net, { sign: true })]) }}
          />
        </section>
      )}

      {!hidden.has('spending') && (
        <section className={`panel ${hidden.has('cashflow') ? 'span-12' : 'span-4'}`}>
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Where it went</h2>
              <div className="panel-sub">{monthLabel(month)} · {money(spendTotal)}</div>
            </div>
          </div>
          {spend.length ? (
            <div className="barlist">
              {spend.slice(0, 7).map((c, i) => (
                <button key={c.category} className="barlist-row" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => go({ page: 'money', category: c.category, month })}>
                  <span className="name"><span aria-hidden>{categoryEmoji(c.category)}</span><span>{c.category}</span></span>
                  <span className="amt num">{money(c.amount, { cents: false })}<small>{pct(c.amount / (spendTotal || 1))}</small></span>
                  <span className="track"><i style={{ width: `${(c.amount / spend[0].amount) * 100}%`, animationDelay: `${i * 50}ms` }} /></span>
                </button>
              ))}
              {spend.length > 7 && <button className="link-btn" onClick={() => go({ page: 'money', tab: 'analysis' })}>+{spend.length - 7} more categories <ArrowRight size={14} /></button>}
            </div>
          ) : (
            <Empty icon={<Flame size={24} />} title="No spending logged" body={`Nothing went out in ${monthLabel(month)} yet.`} action={<button className="btn btn-sm" onClick={() => open({ kind: 'tx' })}>Add money out</button>} />
          )}
        </section>
      )}

      {!hidden.has('cards') && (
        <section className="panel span-12">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Cards & accounts</h2>
              <div className="panel-sub">{data.accounts.length} account{data.accounts.length === 1 ? '' : 's'} · swipe, drag or use ← → to flip through</div>
            </div>
            <button className="link-btn" onClick={() => go({ page: 'accounts' })}>Manage accounts <ArrowRight size={14} /></button>
          </div>
          <CardDeck accounts={data.accounts.filter((a) => !a.archived)} onOpen={(a) => go({ page: 'accounts', id: a.id })} />
        </section>
      )}

      {!hidden.has('goals') && (
        <section className={`panel ${hidden.has('upcoming') ? 'span-12' : 'span-7'}`}>
          <div className="panel-head">
            <div><h2 className="panel-title">Goals</h2><div className="panel-sub">What you’re saving towards</div></div>
            <button className="link-btn" onClick={() => go({ page: 'goals' })}>All goals <ArrowRight size={14} /></button>
          </div>
          {data.goals.length ? (
            <div className="form-stack" style={{ gap: 16 }}>
              {data.goals.filter((g) => !g.archived).slice(0, 4).map((g) => {
                const p = goalProgress(data, g, today)
                return (
                  <button key={g.id} onClick={() => go({ page: 'goals', id: g.id })} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center', background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left' }}>
                    <span style={{ fontSize: 24 }} aria-hidden>{g.emoji}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="between" style={{ fontSize: 13 }}><b>{g.name}</b><span className="num muted">{money(p.current, { cents: false })} / {money(g.target, { cents: false })}</span></span>
                      <Progress ratio={p.ratio} label={`${g.name}: ${Math.round(p.ratio * 100)}%`} tone={p.done ? 'ok' : 'accent'} />
                    </span>
                    <span className="num" style={{ fontWeight: 600, fontSize: 13, minWidth: 44, textAlign: 'right' }}>{Math.round(p.ratio * 100)}%</span>
                  </button>
                )
              })}
            </div>
          ) : <Empty icon={<Target size={24} />} title="No goals yet" body="Saving for a holiday, a house or a rainy day? Track it here." action={<button className="btn btn-sm" onClick={() => open({ kind: 'goal' })}>Create a goal</button>} />}
        </section>
      )}

      {!hidden.has('upcoming') && (
        <section className={`panel ${hidden.has('goals') ? 'span-12' : 'span-5'}`}>
          <div className="panel-head">
            <div><h2 className="panel-title">Coming up</h2><div className="panel-sub">Repeating payments in the next 14 days</div></div>
            <button className="link-btn" onClick={() => go({ page: 'money', tab: 'recurring' })}>Manage <ArrowRight size={14} /></button>
          </div>
          {soon.length ? (
            <div className="form-stack" style={{ gap: 4 }}>
              {soon.map((u, i) => (
                <button key={u.rule.id + i} className="tx-row" onClick={() => open({ kind: 'recurring', rule: u.rule })}>
                  <span className="tx-ic" aria-hidden>{categoryEmoji(u.rule.category)}</span>
                  <span className="tx-main"><span className="tx-payee" style={{ display: 'block' }}>{u.rule.payee}</span><span className="tx-meta">{shortDate(u.date)} · {relativeDays(u.date)}</span></span>
                  <span className={`tx-amt num ${u.rule.type === 'income' ? 'in' : u.rule.type === 'transfer' ? 'xfer' : ''}`}>{u.rule.type === 'income' ? '+' : u.rule.type === 'expense' ? '−' : ''}{money(u.rule.amount, { currency: data.accounts.find((a) => a.id === u.rule.accountId)?.currency })}</span>
                </button>
              ))}
            </div>
          ) : <Empty icon={<CalendarClock size={24} />} title="Nothing due soon" body="Mark rent, salary or subscriptions as repeating and they’ll show here." />}
        </section>
      )}

      {!hidden.has('insights') && (
        <section className={`panel ${hidden.has('recent') ? 'span-12' : 'span-5'}`}>
          <div className="panel-head">
            <div><h2 className="panel-title">What stands out</h2><div className="panel-sub">From your own numbers, worked out on this device</div></div>
            <button className="link-btn" onClick={() => go({ page: 'insights' })}>More <ArrowRight size={14} /></button>
          </div>
          <div className="insights">
            {insights.length ? insights.map((i) => (
              <div className="insight" key={i.id}>
                <div className={`ic ${i.tone === 'neutral' ? '' : i.tone}`}>{INSIGHT_ICONS[i.icon]}</div>
                <div><b>{i.title}</b> <HowCalculated>{i.why}</HowCalculated><p>{i.body}</p></div>
              </div>
            )) : <p className="muted">Add a few weeks of transactions and patterns will show up here.</p>}
          </div>
        </section>
      )}

      {!hidden.has('recent') && (
        <section className={`panel ${hidden.has('insights') ? 'span-12' : 'span-7'}`}>
          <div className="panel-head">
            <div><h2 className="panel-title">Latest activity</h2><div className="panel-sub">Most recent 6 transactions</div></div>
            <button className="link-btn" onClick={() => go({ page: 'money' })}>See all <ArrowRight size={14} /></button>
          </div>
          <TxList txs={[...data.transactions].filter((t) => t.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 6)} grouped={false} />
        </section>
      )}
    </div>
  )
}

const rel = (a: number, b: number) => (b > 0 ? (a - b) / b : 0)

function Kpi({ dot, label, value, change, invert, foot, onClick }: { dot: string; label: string; value: number; change: number; invert?: boolean; foot: string; onClick?: () => void }) {
  return (
    <button className="kpi" style={{ textAlign: 'left', color: 'inherit' }} onClick={onClick}>
      <div className="label"><span className="dot" style={{ background: dot }} />{label}</div>
      <div className="value"><AnimatedMoney value={value} /></div>
      <div className="foot"><Delta value={change} invert={invert} /> {foot}</div>
    </button>
  )
}
