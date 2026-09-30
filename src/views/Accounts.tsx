import { useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, CreditCard, FileUp, Layers, LayoutGrid, List, Pencil, Plus, RefreshCw } from 'lucide-react'
import { CardDeck } from '../components/CardDeck'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { addMonths, money, monthEnd, monthLabel, shortDate, todayISO } from '../lib/format'
import { accountValueBase, cashBalanceAt, flowsForAccount, lastActivity, linkedHoldingsValue, missingRates, position, positionAt } from '../lib/calc'
import { CARD_SKINS, isLiability, kindGroup, kindLabel, type AccountGroup } from '../lib/meta'
import type { Account } from '../lib/types'
import { AccountCard, useAccountFigures } from '../components/AccountCard'
import { AreaLine, FlowBars } from '../components/charts'
import { ChartFrame, Empty, MonthSwitch, Segmented, Signed } from '../components/ui'
import { TxList } from './Money'

type View = 'deck' | 'wallet' | 'table' | 'compare'
const VIEW_KEY = 'finspace:accountsView'
const GROUPS: { id: AccountGroup; label: string }[] = [
  { id: 'cash', label: 'Everyday & savings' },
  { id: 'invest', label: 'Investments & pensions' },
  { id: 'liability', label: 'Cards & loans' },
]

export function Accounts() {
  const { data } = useStore()
  const { route, open, go, month, setMonth } = useUI()
  const [view, setViewState] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || 'deck' } catch { return 'deck' }
  })
  const setView = (v: View) => {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
  }
  const pos = useMemo(() => positionAt(data), [data])

  if (route.page === 'accounts' && route.id) {
    const a = data.accounts.find((x) => x.id === route.id)
    if (a) return <AccountDetail account={a} />
  }

  if (!data.accounts.length) {
    return (
      <div className="panel page-enter">
        <Empty icon={<CreditCard size={28} />} title="Your accounts and cards will appear here" body="Add each bank account, card, savings pot, pension or loan you want to track. You enter the balance — nothing connects to your bank." action={<button className="btn btn-primary" onClick={() => open({ kind: 'account' })}><Plus size={16} /> Add an account</button>} />
      </div>
    )
  }

  const missing = missingRates(data)
  const cardsOwed = data.accounts.filter((a) => a.kind === 'credit').reduce((s, a) => s + Math.max(0, -(accountValueBase(data, a) ?? 0)), 0)
  const limit = data.accounts.reduce((s, a) => s + (a.kind === 'credit' ? a.creditLimit ?? 0 : 0), 0)

  return (
    <div className="page-enter">
      <div className="kpis" style={{ marginBottom: 24 }}>
        <div className="kpi"><div className="label">Everything you own</div><div className="value num">{money(pos.assets)}</div><div className="foot">Accounts, investments & pensions</div></div>
        <div className="kpi"><div className="label">Everything you owe</div><div className="value num">{money(pos.liabilities)}</div><div className="foot">{limit ? `Cards at ${Math.round((cardsOwed / limit) * 100)}% of ${money(limit, { cents: false })} limit` : 'Cards & loans'}</div></div>
        <div className="kpi"><div className="label">Cash & bank</div><div className="value num">{money(pos.cash)}</div><div className="foot">Money you can reach quickly</div></div>
        <div className="kpi"><div className="label">Accounts</div><div className="value num">{data.accounts.length}</div><div className="foot">{missing.length ? `${missing.join(', ')} not in totals — no rate` : 'All included in totals'}</div></div>
      </div>

      <div className="toolbar">
        <Segmented<View>
          label="Accounts view"
          value={view}
          onChange={setView}
          options={[
            { value: 'deck', label: <><Layers size={14} />Swipe</> },
            { value: 'wallet', label: <><LayoutGrid size={14} />Grid</> },
            { value: 'table', label: <><List size={14} />Table</> },
            { value: 'compare', label: <><BarChart3 size={14} />Compare</> },
          ]}
        />
        {view === 'compare' && <MonthSwitch month={month} onChange={setMonth} />}
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => open({ kind: 'account' })}><Plus size={16} /> Add account</button>
      </div>

      {view === 'wallet' && (
        <div className="form-stack" style={{ gap: 32 }}>
          {GROUPS.map((g) => {
            const accs = data.accounts.filter((a) => kindGroup(a.kind) === g.id && !a.archived)
            if (!accs.length) return null
            const total = accs.reduce((s, a) => s + (accountValueBase(data, a) ?? 0), 0)
            return (
              <section key={g.id} aria-label={g.label}>
                <div className="between mb-16"><h2 className="panel-title">{g.label}</h2><span className="num muted">{money(g.id === 'liability' ? -total : total)}{g.id === 'liability' ? ' owed' : ''}</span></div>
                <div className="cards-grid stagger">
                  {accs.map((a) => <AccountCard key={a.id} account={a} onClick={() => go({ page: 'accounts', id: a.id })} />)}
                </div>
              </section>
            )
          })}
          <button className="card-add" style={{ width: '100%', aspectRatio: 'auto', padding: 32 }} onClick={() => open({ kind: 'account' })}><CreditCard size={22} /><b>Add account</b><span className="muted" style={{ fontSize: 13 }}>Bank, card, savings, ISA, pension, loan or cash</span></button>
        </div>
      )}

      {view === 'deck' && (
        <section className="panel">
          <CardDeck accounts={data.accounts.filter((a) => !a.archived)} onOpen={(a) => go({ page: 'accounts', id: a.id })} />
        </section>
      )}
      {view === 'table' && <AccountTable accounts={data.accounts} />}
      {view === 'compare' && <Compare accounts={data.accounts} month={month} />}
    </div>
  )
}

function AccountRow({ a }: { a: Account }) {
  const { data } = useStore()
  const { go } = useUI()
  const f = useAccountFigures(a)
  const fl = flowsForAccount(data.transactions, a.id, todayISO().slice(0, 7))
  return (
    <tr className="clickable" onClick={() => go({ page: 'accounts', id: a.id })}>
      <td>
        <div className="row">
          <SkinDot account={a} />
          <div><div style={{ fontWeight: 600 }}>{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{[a.institution, a.last4 && `•••• ${a.last4}`].filter(Boolean).join(' · ') || kindLabel(a.kind)}</div></div>
        </div>
      </td>
      <td className="hide-sm muted">{kindLabel(a.kind)}</td>
      <td className="r num hide-sm">{money(fl.inflow, { currency: a.currency })}</td>
      <td className="r num hide-sm">{money(fl.outflow, { currency: a.currency })}</td>
      <td className="r muted hide-sm">{shortDate(lastActivity(data, a.id) || a.openingDate)}</td>
      <td className="r num" style={{ fontWeight: 600 }}>
        {money(f.display, { currency: f.displayCcy })}{f.liability && <span className="muted" style={{ fontWeight: 400 }}> owed</span>}
        {f.converted !== null && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>≈ {money(f.converted)}</div>}
      </td>
    </tr>
  )
}

function AccountTable({ accounts }: { accounts: Account[] }) {
  return (
    <section className="panel">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Account</th><th className="hide-sm">Type</th><th className="r hide-sm">In this month</th><th className="r hide-sm">Out this month</th><th className="r hide-sm">Last activity</th><th className="r">Balance</th></tr>
          </thead>
          {GROUPS.map((g) => {
            const accs = accounts.filter((a) => kindGroup(a.kind) === g.id)
            if (!accs.length) return null
            return (
              <tbody key={g.id}>
                <tr><td colSpan={6} className="eyebrow" style={{ paddingTop: 20 }}>{g.label}</td></tr>
                {accs.map((a) => <AccountRow key={a.id} a={a} />)}
              </tbody>
            )
          })}
        </table>
      </div>
    </section>
  )
}

function SkinDot({ account }: { account: Account }) {
  const s = CARD_SKINS[account.skin] ?? CARD_SKINS.obsidian
  return <span aria-hidden style={{ width: 36, height: 24, borderRadius: 6, flex: 'none', background: `linear-gradient(135deg, ${s.a}, ${s.b})` }} />
}

function Compare({ accounts, month }: { accounts: Account[]; month: string }) {
  const { data } = useStore()
  const { go } = useUI()
  const rows = accounts.map((a) => ({ a, ...flowsForAccount(data.transactions, a.id, month) }))
  const max = Math.max(1, ...rows.flatMap((r) => [r.inflow, r.outflow]))
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2 className="panel-title">Every account, side by side</h2><div className="panel-sub">Money in and out of each account in {monthLabel(month)}, including transfers between them</div></div>
        <div className="legend"><span><i style={{ background: 'var(--in)' }} />In</span><span><i style={{ background: 'var(--out)' }} />Out</span></div>
      </div>
      <div className="form-stack" style={{ gap: 20 }}>
        {rows.map((r, i) => (
          <button key={r.a.id} onClick={() => go({ page: 'accounts', id: r.a.id })} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr', gap: 16, alignItems: 'center', background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' }}>
            <div className="row"><SkinDot account={r.a} /><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.a.name}</div><span className={`num ${r.inflow - r.outflow >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 13 }}>{money(r.inflow - r.outflow, { sign: true, currency: r.a.currency })}</span></div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['inflow', 'outflow'] as const).map((k) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8, alignItems: 'center' }}>
                  <div className="track" style={{ height: 10 }}><i style={{ width: `${(r[k] / max) * 100}%`, background: k === 'inflow' ? 'var(--in)' : 'var(--out)', animationDelay: `${i * 60}ms` }} /></div>
                  <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>{money(r[k], { cents: false, currency: r.a.currency })}</span>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function AccountDetail({ account }: { account: Account }) {
  const { data } = useStore()
  const { open, go, month, setMonth } = useUI()
  const today = todayISO()
  const f = useAccountFigures(account)
  const liab = isLiability(account.kind)
  const fl = flowsForAccount(data.transactions, account.id, month)
  const holdings = data.holdings.filter((h) => h.accountId === account.id)
  const ccy = f.displayCcy

  const trend = useMemo(() => {
    const end = today.slice(0, 7)
    return Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(end, i - 11)
      const d = monthEnd(m) < today ? monthEnd(m) : today
      const cash = cashBalanceAt(account, data.transactions, d)
      const v = holdings.length ? (accountValueBase(data, account, d) ?? 0) : liab ? Math.max(0, -cash) : cash
      return { key: m, label: monthLabel(m, 'short'), value: v }
    })
  }, [account, data, today, liab, holdings.length])

  const flows = useMemo(() => {
    const end = today.slice(0, 7)
    return Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(end, i - 5)
      const x = flowsForAccount(data.transactions, account.id, m)
      return { month: m, income: x.inflow, expense: x.outflow, net: x.inflow - x.outflow }
    })
  }, [account.id, data.transactions, today])

  const txs = useMemo(() => data.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [data.transactions, account.id])
  const pay = data.accounts.find((a) => a.kind === 'checking' && a.id !== account.id)

  return (
    <div className="page-enter">
      <button className="link-btn mb-16" onClick={() => go({ page: 'accounts' })}><ArrowLeft size={14} /> All accounts</button>
      <div className="acc-select mb-16 no-print" role="tablist" aria-label="Switch account">
        {data.accounts.map((a) => <button key={a.id} role="tab" aria-selected={a.id === account.id} className="chip" aria-pressed={a.id === account.id} onClick={() => go({ page: 'accounts', id: a.id })}><SkinDot account={a} />{a.name}</button>)}
      </div>
      <div className="dash stagger">
        <section className="span-4" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
          <AccountCard account={account} />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => open({ kind: 'tx', defaults: { accountId: account.id, type: 'expense' } })}><Plus size={16} /> Add transaction</button>
            {liab && pay && <button className="btn" onClick={() => open({ kind: 'tx', defaults: { type: 'transfer', toAccountId: account.id, accountId: pay.id, payee: account.kind === 'loan' ? 'Loan repayment' : 'Card repayment' } })}>Pay off</button>}
            <button className="btn" onClick={() => open({ kind: 'import', accountId: account.id })}><FileUp size={14} /> Import statement</button>
            <button className="btn" onClick={() => open({ kind: 'balance', accountId: account.id })}><RefreshCw size={14} /> Update balance</button>
            <button className="btn btn-ghost" onClick={() => open({ kind: 'account', account })}><Pencil size={14} /> Edit</button>
          </div>
          {account.notes && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{account.notes}</p>}
        </section>
        <section className="span-8" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="between" style={{ flexWrap: 'wrap' }}>
            <div className="eyebrow">{kindLabel(account.kind)} · {account.currency} · last activity {shortDate(lastActivity(data, account.id) || account.openingDate)}</div>
            <MonthSwitch month={month} onChange={setMonth} />
          </div>
          <div className="detail-stats">
            <div className="stat"><div className="l">{liab ? 'Owed now' : holdings.length ? 'Value now' : 'Balance now'}</div><div className="v num">{money(f.display, { currency: ccy })}</div>{f.converted !== null && <div className="muted num" style={{ fontSize: 12 }}>≈ {money(f.converted)}</div>}</div>
            <div className="stat"><div className="l">In · {monthLabel(month, 'short')}</div><div className="v num">{money(fl.inflow, { currency: account.currency })}</div></div>
            <div className="stat"><div className="l">Out · {monthLabel(month, 'short')}</div><div className="v num">{money(fl.outflow, { currency: account.currency })}</div></div>
            {account.kind === 'credit' && account.creditLimit ? (
              <div className="stat"><div className="l">Available credit</div><div className="v num">{money(Math.max(0, account.creditLimit - f.display), { currency: account.currency })}</div></div>
            ) : holdings.length ? (
              <div className="stat"><div className="l">Of which investments</div><div className="v num">{money(linkedHoldingsValue(data, account.id))}</div></div>
            ) : (
              <div className="stat"><div className="l">Net · {monthLabel(month, 'short')}</div><div className="v"><Signed value={fl.inflow - fl.outflow} /></div></div>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h2 className="panel-title">{liab ? 'Amount owed' : 'Value'} over time</h2><div className="panel-sub">Month-end, last 12 months</div></div></div>
            <ChartFrame caption={`${account.name} over time`} chart={<AreaLine data={trend} height={200} label={liab ? 'Owed' : 'Value'} color={liab ? 'var(--out)' : 'var(--in)'} />} table={{ head: ['Month', liab ? 'Owed' : 'Value'], rows: trend.map((t) => [t.label, money(t.value, { currency: ccy })]) }} />
          </div>
        </section>
        {holdings.length > 0 && (
          <section className="panel span-12">
            <div className="panel-head"><div><h2 className="panel-title">Investments in this account</h2><div className="panel-sub">{holdings.length} holding{holdings.length === 1 ? '' : 's'}</div></div></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Holding</th><th className="r">Value</th><th className="r">This month</th><th className="r hide-sm">Total return</th></tr></thead>
                <tbody>
                  {holdings.map((h) => {
                    const p = position(h, data.trades, month)
                    return (
                      <tr key={h.id} className="clickable" onClick={() => go({ page: 'investments', id: h.id })}>
                        <td><div className="row"><span className="symbol-badge">{h.symbol.slice(0, 4)}</span><div><b>{h.symbol}</b><div className="muted" style={{ fontSize: 12 }}>{h.name}</div></div></div></td>
                        <td className="r num" style={{ fontWeight: 600 }}>{money(p.value)}</td>
                        <td className="r"><Signed value={p.monthPL} /></td>
                        <td className="r hide-sm"><Signed value={p.totalReturn} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className="panel span-5">
          <div className="panel-head"><div><h2 className="panel-title">In vs out</h2><div className="panel-sub">Last 6 months, transfers included</div></div></div>
          <FlowBars data={flows} height={220} selected={month} onSelect={setMonth} />
        </section>
        <section className="panel span-7">
          <div className="panel-head">
            <div><h2 className="panel-title">Transactions</h2><div className="panel-sub">{txs.length} in this account</div></div>
            <button className="link-btn" onClick={() => go({ page: 'money', account: account.id })}>Search & filter</button>
          </div>
          {txs.length ? <TxList txs={txs.slice(0, 25)} accountId={account.id} /> : <Empty icon={<CreditCard size={22} />} title="No transactions in this account yet" body="Import a statement from your bank, add one by hand, or use Update balance to record today’s balance." action={<button className="btn btn-sm btn-primary" onClick={() => open({ kind: 'import', accountId: account.id })}><FileUp size={14} /> Import statement</button>} />}
        </section>
      </div>
    </div>
  )
}
