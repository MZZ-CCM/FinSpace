import { useMemo } from 'react'
import { ArrowLeft, LineChart, Pencil, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { addMonths, dateLabel, money, monthLabel, num, pct, shortDate, sinceLabel, todayISO, sourceName } from '../lib/format'
import { holdingMonthGrid, lastPricePoint, portfolioMonthSeries, portfolioReturn, position, priceAt, tradesFor, type Position } from '../lib/calc'
import { ASSET_TYPES } from '../lib/meta'
import type { Holding } from '../lib/types'
import { AllocationBar, AreaLine, DivergingBars, Heatmap, PLBars, Sparkline } from '../components/charts'
import { AnimatedMoney, ChartFrame, Delta, Empty, HowCalculated, MonthSwitch, Signed } from '../components/ui'

export function Investments() {
  const { data } = useStore()
  const { route, open, go, month, setMonth } = useUI()
  const today = todayISO()

  const positions = useMemo(() => data.holdings.map((h) => position(h, data.trades, month, today)), [data.holdings, data.trades, month, today])
  const series = useMemo(() => portfolioMonthSeries(data, today.slice(0, 7), 12), [data, today])
  const ytd = useMemo(() => portfolioReturn(data, `${today.slice(0, 4)}-01-01`, today), [data, today])
  const grid = useMemo(() => holdingMonthGrid(data, today.slice(0, 7), 8), [data, today])

  if (route.page === 'investments' && route.id) {
    const h = data.holdings.find((x) => x.id === route.id)
    const p = positions.find((x) => x.holding.id === route.id)
    if (h && p) return <HoldingDetail holding={h} pos={p} />
  }

  if (!data.holdings.length) {
    return (
      <div className="panel page-enter">
        <Empty icon={<LineChart size={28} />} title="Your investment portfolio will appear here once you add your first holding" body="Add stocks, ETFs, funds, bonds or crypto. Log what you paid and update prices whenever you like — or just enter totals. You’ll see what you made or lost each month." action={<button className="btn btn-primary" onClick={() => open({ kind: 'holding' })}><Plus size={16} /> Add investment</button>} />
      </div>
    )
  }

  const held = positions.filter((p) => p.shares > 0)
  const value = held.reduce((s, p) => s + p.value, 0)
  const cost = held.reduce((s, p) => s + p.costBasis, 0)
  const monthPL = positions.reduce((s, p) => s + p.monthPL, 0)
  const unreal = value - cost
  const realized = positions.reduce((s, p) => s + p.realized, 0)
  const divs = positions.reduce((s, p) => s + p.dividends, 0)
  const totalIn = positions.reduce((s, p) => s + p.totalInvested, 0)
  const totalReturn = unreal + realized + divs
  const monthStartValue = value - monthPL
  const gainers = positions.filter((p) => p.monthPL > 0.004).sort((a, b) => b.monthPL - a.monthPL)
  const losers = positions.filter((p) => p.monthPL < -0.004).sort((a, b) => a.monthPL - b.monthPL)
  const made = gainers.reduce((s, p) => s + p.monthPL, 0)
  const lost = losers.reduce((s, p) => s + p.monthPL, 0)
  const alloc = [...held].sort((a, b) => b.value - a.value)
  const allocItems = alloc.length > 6 ? [...alloc.slice(0, 5).map((p) => ({ label: p.holding.symbol, value: p.value })), { label: 'Other', value: alloc.slice(5).reduce((s, p) => s + p.value, 0) }] : alloc.map((p) => ({ label: p.holding.symbol, value: p.value }))
  const byType = ASSET_TYPES.map((t) => ({ label: t.label, value: held.filter((p) => p.holding.assetType === t.value).reduce((s, p) => s + p.value, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  const valueSeries = series.map((s) => ({ key: s.month, label: monthLabel(s.month, 'short'), value: s.value }))

  return (
    <div className="page-enter">
      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} />
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={() => open({ kind: 'prices' })}><RefreshCw size={15} /> Update prices</button>
          <button className="btn btn-primary" onClick={() => open({ kind: 'holding' })}><Plus size={16} /> Add investment</button>
        </div>
      </div>

      <div className="dash stagger">
        <section className="kpis span-12">
          <div className="kpi">
            <div className="label">Portfolio value</div>
            <div className="value"><AnimatedMoney value={value} /></div>
            <div className="foot">{held.length} holding{held.length === 1 ? '' : 's'} · {money(cost, { cents: false })} still invested</div>
          </div>
          <div className="kpi" style={{ borderColor: monthPL >= 0 ? 'color-mix(in srgb, var(--gain) 30%, transparent)' : 'color-mix(in srgb, var(--loss) 30%, transparent)' }}>
            <div className="label">{monthPL >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} {monthPL >= 0 ? 'Made' : 'Lost'} in {monthLabel(month, 'short')} <HowCalculated>End value − start value − money you added + money you took out + dividends. So buying more doesn’t count as a gain.</HowCalculated></div>
            <div className={`value num ${monthPL >= 0 ? 'pos' : 'neg'}`}><AnimatedMoney value={monthPL} sign /></div>
            <div className="foot">{monthStartValue > 0 && <Delta value={monthPL / monthStartValue} />} incl. dividends & sales</div>
          </div>
          <div className="kpi">
            <div className="label">This year</div>
            <div className={`value num ${ytd.pl >= 0 ? 'pos' : 'neg'}`}>{money(ytd.pl, { sign: true })}</div>
            <div className="foot"><Delta value={ytd.pct} /> since 1 January</div>
          </div>
          <div className="kpi">
            <div className="label">Total return <HowCalculated>Paper gain on what you still hold ({money(unreal, { sign: true, cents: false })}) + gains locked in by selling ({money(realized, { sign: true, cents: false })}) + dividends ({money(divs, { cents: false })}). Percentage is against everything you’ve ever put in ({money(totalIn, { cents: false })}).</HowCalculated></div>
            <div className={`value num ${totalReturn >= 0 ? 'pos' : 'neg'}`}>{money(totalReturn, { sign: true })}</div>
            <div className="foot">{totalIn > 0 && <Delta value={totalReturn / totalIn} />} on {money(totalIn, { cents: false })} put in</div>
          </div>
        </section>

        <section className="panel span-6">
          <div className="panel-head"><div><h2 className="panel-title">Made this month</h2><div className="panel-sub">{monthLabel(month)}</div></div><span className="delta up num">▲ {money(made, { cents: false })}</span></div>
          <MoverList items={gainers} empty="Nothing gained value this month." />
        </section>
        <section className="panel span-6">
          <div className="panel-head"><div><h2 className="panel-title">Lost this month</h2><div className="panel-sub">{monthLabel(month)}</div></div><span className={`delta ${lost < 0 ? 'down' : 'flat'} num`}>{lost < 0 ? '▼ ' : ''}{money(Math.abs(lost), { cents: false })}</span></div>
          <MoverList items={losers} empty="Nothing lost value this month." />
        </section>

        <section className="panel span-6">
          <div className="panel-head"><div><h2 className="panel-title">Portfolio value</h2><div className="panel-sub">Month-end, last 12 months</div></div></div>
          <ChartFrame caption="Portfolio value by month" chart={<AreaLine data={valueSeries} height={220} label="Value" color="var(--in)" />} table={{ head: ['Month', 'Value'], rows: valueSeries.map((v) => [v.label, money(v.value)]) }} />
        </section>
        <section className="panel span-6">
          <div className="panel-head"><div><h2 className="panel-title">Gain or loss by month</h2><div className="panel-sub">Price moves, sales and dividends</div></div></div>
          <ChartFrame caption="Gain or loss by month" chart={<PLBars data={series} />} table={{ head: ['Month', 'Gain / loss'], rows: series.map((s) => [monthLabel(s.month), money(s.pl, { sign: true })]) }} />
        </section>

        <section className="panel span-7">
          <div className="panel-head"><div><h2 className="panel-title">What drove your returns</h2><div className="panel-sub">Total return from each holding since you bought it</div></div></div>
          <DivergingBars items={[...positions].sort((a, b) => b.totalReturn - a.totalReturn).map((p) => ({ id: p.holding.id, label: p.holding.symbol, value: p.totalReturn }))} onClick={(id) => go({ page: 'investments', id })} />
        </section>
        <section className="panel span-5">
          <div className="panel-head"><div><h2 className="panel-title">Allocation</h2><div className="panel-sub">Share of portfolio value</div></div></div>
          {allocItems.length ? <AllocationBar items={allocItems} /> : <p className="muted">No open positions.</p>}
          <div className="divider" />
          <div className="eyebrow mb-16">By asset type</div>
          <div className="form-stack" style={{ gap: 10 }}>
            {byType.map((t) => <div key={t.label} className="between" style={{ fontSize: 13 }}><span className="muted">{t.label}</span><span className="num">{money(t.value, { cents: false })} <span className="muted">· {pct(t.value / (value || 1))}</span></span></div>)}
          </div>
        </section>

        <section className="panel span-12">
          <div className="panel-head"><div><h2 className="panel-title">Monthly return heatmap</h2><div className="panel-sub">% gain or loss per holding per month · blue = gain, red = loss, number shows the size</div></div></div>
          <Heatmap rows={grid.map((g) => ({ id: g.holding.id, label: g.holding.symbol, cells: g.cells }))} months={grid[0]?.cells.map((c) => c.month) ?? []} onRow={(id) => go({ page: 'investments', id })} />
        </section>

        <section className="panel span-12">
          <div className="panel-head"><div><h2 className="panel-title">Holdings</h2><div className="panel-sub">Click a row for trades and price history</div></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Investment</th>
                  <th className="r hide-sm">Units</th>
                  <th className="r hide-sm">Avg cost</th>
                  <th className="r">Price</th>
                  <th className="r">Value</th>
                  <th className="r">{monthLabel(month, 'short')}</th>
                  <th className="r hide-sm">Total return</th>
                  <th className="hide-sm" aria-label="Trend" />
                </tr>
              </thead>
              <tbody>
                {[...positions].sort((a, b) => b.value - a.value).map((p) => {
                  const tr = tradesFor(data.trades, p.holding.id)
                  const last = lastPricePoint(p.holding, tr)
                  const trend = Array.from({ length: 12 }, (_, i) => priceAt(p.holding, tr, `${addMonths(today.slice(0, 7), i - 11)}-28`) ?? 0).filter(Boolean)
                  const stale = last && (Date.now() - new Date(last.date).getTime()) / 864e5 > 14
                  const acc = data.accounts.find((a) => a.id === p.holding.accountId)
                  return (
                    <tr key={p.holding.id} className="clickable" onClick={() => go({ page: 'investments', id: p.holding.id })} style={{ opacity: p.shares > 0 ? 1 : 0.55 }}>
                      <td>
                        <div className="row" style={{ gap: 12 }}>
                          <span className="symbol-badge">{p.holding.symbol.slice(0, 4)}</span>
                          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.holding.symbol}</div><div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{p.shares > 0 ? '' : 'Sold · '}{p.holding.name}{acc ? ` · ${acc.name}` : ''}</div></div>
                        </div>
                      </td>
                      <td className="r num hide-sm">{num(p.shares)}</td>
                      <td className="r num hide-sm">{money(p.avgCost)}</td>
                      <td className="r num">
                        {money(p.price)}
                        {last && <div className="muted" style={{ fontSize: 11, color: stale ? 'var(--warn)' : undefined }} title={last.fetchedAt ? `Fetched from ${sourceName(last.source)} ${sinceLabel(last.fetchedAt)}` : stale ? 'Price is over two weeks old' : 'Entered by you'}>{stale ? '⚠ ' : ''}{last.fetchedAt ? 'Live · ' : ''}{shortDate(last.date)}</div>}
                      </td>
                      <td className="r num" style={{ fontWeight: 600 }}>{money(p.value)}</td>
                      <td className="r"><Signed value={p.monthPL} /><div style={{ fontSize: 11 }} className="muted num">{pct(p.monthPct, { sign: true })}</div></td>
                      <td className="r hide-sm"><Signed value={p.totalReturn} /><div style={{ fontSize: 11 }} className="muted num">{p.totalInvested > 0 ? pct(p.totalReturn / p.totalInvested, { sign: true }) : '—'}</div></td>
                      <td className="hide-sm"><Sparkline values={trend} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted mt-16" style={{ fontSize: 12 }}>Prices are ones you entered unless marked “Live”. Market data is optional and never replaces what you type.</p>
        </section>
      </div>
    </div>
  )
}

function MoverList({ items, empty }: { items: Position[]; empty: string }) {
  const { go } = useUI()
  if (!items.length) return <p className="muted" style={{ margin: 0 }}>{empty}</p>
  const max = Math.max(...items.map((p) => Math.abs(p.monthPL)))
  return (
    <div className="barlist">
      {items.slice(0, 5).map((p, i) => (
        <button key={p.holding.id} className="barlist-row" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' }} onClick={() => go({ page: 'investments', id: p.holding.id })}>
          <span className="name"><b>{p.holding.symbol}</b><span className="muted">{p.holding.name}</span></span>
          <span className="amt"><Signed value={p.monthPL} /><small>{pct(p.monthPct, { sign: true })}</small></span>
          <span className="track"><i style={{ width: `${(Math.abs(p.monthPL) / max) * 100}%`, background: p.monthPL >= 0 ? 'var(--gain)' : 'var(--loss)', animationDelay: `${i * 60}ms` }} /></span>
        </button>
      ))}
    </div>
  )
}

function HoldingDetail({ holding, pos }: { holding: Holding; pos: Position }) {
  const { data } = useStore()
  const { open, go, month, setMonth } = useUI()
  const trades = tradesFor(data.trades, holding.id)
  const last = lastPricePoint(holding, trades)
  const acc = data.accounts.find((a) => a.id === holding.accountId)
  const history = useMemo(() => {
    const obs = [...holding.prices.map((p) => ({ date: p.date, price: p.price })), ...trades.filter((t) => t.kind !== 'dividend').map((t) => ({ date: t.date, price: t.price }))].sort((a, b) => a.date.localeCompare(b.date))
    const byDay = new Map<string, number>()
    for (const o of obs) byDay.set(o.date, o.price)
    return [...byDay.entries()].map(([d, v]) => ({ key: d, label: shortDate(d), value: v }))
  }, [holding.prices, trades])

  return (
    <div className="page-enter">
      <button className="link-btn mb-16" onClick={() => go({ page: 'investments' })}><ArrowLeft size={14} /> All investments</button>
      <div className="dash stagger">
        <section className="hero span-12">
          <div className="hero-top">
            <div>
              <div className="row"><span className="symbol-badge">{holding.symbol.slice(0, 4)}</span><div><div style={{ fontWeight: 600 }}>{holding.name}</div><div className="muted" style={{ fontSize: 12 }}>{ASSET_TYPES.find((t) => t.value === holding.assetType)?.label} · {num(pos.shares)} units{acc ? ` · in ${acc.name}` : ''}</div></div></div>
              <div className="hero-value"><AnimatedMoney value={pos.value} split /></div>
              <div className="hero-meta"><span>{money(pos.price)} per unit</span><Delta value={pos.unrealizedPct} /> <span>since you bought</span></div>
              {last && <div className="muted mt-16" style={{ fontSize: 12 }}>Last updated: {dateLabel(last.date)} · {last.fetchedAt ? `fetched from ${sourceName(last.source)} ${sinceLabel(last.fetchedAt)}` : last.source === 'trade' ? 'price from your last trade' : 'entered by you'}</div>}
            </div>
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => open({ kind: 'trade', holdingId: holding.id, kindHint: 'buy' })}><Plus size={16} /> Log activity</button>
              <button className="btn" onClick={() => open({ kind: 'prices' })}><RefreshCw size={15} /> Update price</button>
              <button className="btn" onClick={() => open({ kind: 'holding', holding })}><Pencil size={14} /> Edit</button>
            </div>
          </div>
          <div className="hero-split">
            <div className="cell"><div className="between"><span className="eyebrow">{monthLabel(month, 'short')}</span><MonthSwitch month={month} onChange={setMonth} /></div><div className="v"><Signed value={pos.monthPL} /></div></div>
            <div className="cell"><div className="eyebrow">Paper gain / loss</div><div className="v"><Signed value={pos.unrealized} /></div></div>
            <div className="cell"><div className="eyebrow">Locked-in + dividends</div><div className="v"><Signed value={pos.realized + pos.dividends} /></div></div>
          </div>
        </section>
        <section className="panel span-8">
          <div className="panel-head"><div><h2 className="panel-title">Price history</h2><div className="panel-sub">Every price you’ve entered or fetched, plus trade prices</div></div></div>
          {history.length > 1 ? <ChartFrame caption="Price history" chart={<AreaLine data={history} height={240} label="Price" />} table={{ head: ['Date', 'Price'], rows: history.map((h) => [h.label, money(h.value)]) }} /> : <p className="muted">Update the price a few times to see a trend.</p>}
        </section>
        <section className="panel span-4">
          <div className="panel-head"><div><h2 className="panel-title">Position</h2></div></div>
          <div className="form-stack" style={{ gap: 12 }}>
            {[
              ['Units held', num(pos.shares)],
              ['Average cost', money(pos.avgCost)],
              ['Still invested', money(pos.costBasis)],
              ['Ever put in', money(pos.totalInvested)],
              ['Current price', money(pos.price)],
              ['Value', money(pos.value)],
              ['Total return', money(pos.totalReturn, { sign: true })],
            ].map(([l, v]) => <div key={l} className="between"><span className="muted">{l}</span><span className="num" style={{ fontWeight: 600 }}>{v}</span></div>)}
          </div>
          {holding.notes && <p className="muted mt-16" style={{ fontSize: 13 }}>{holding.notes}</p>}
        </section>
        <section className="panel span-12">
          <div className="panel-head"><div><h2 className="panel-title">Activity</h2><div className="panel-sub">{trades.length} entries · click to edit</div></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Activity</th><th className="r">Units</th><th className="r">Price</th><th className="r">Total</th></tr></thead>
              <tbody>
                {[...trades].reverse().map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => open({ kind: 'trade', holdingId: holding.id, trade: t })}>
                    <td>{dateLabel(t.date)}</td>
                    <td><span className={`pill ${t.kind === 'dividend' ? 'gold' : ''}`}>{t.kind === 'buy' ? 'Bought' : t.kind === 'sell' ? 'Sold' : 'Dividend'}</span></td>
                    <td className="r num">{t.kind === 'dividend' ? '—' : num(t.shares)}</td>
                    <td className="r num">{t.kind === 'dividend' ? '—' : money(t.price)}</td>
                    <td className="r num" style={{ fontWeight: 600 }}>{t.kind === 'dividend' ? money(t.price, { sign: true }) : money(t.shares * t.price + (t.kind === 'buy' ? t.fees : -t.fees))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
