import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CatGlyph, GoalGlyph } from './glyphs'
import { ArrowLeftRight, BarChart3, CreditCard, Eye, FileText, FileUp, HeartPulse, Home, LineChart, Moon, Plus, Receipt, RefreshCw, Repeat, Search, Settings, Target, Wallet, CornerDownLeft } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI, type Route } from '../lib/ui'
import { dateLabel, money } from '../lib/format'
import { parseCommand } from '../lib/command'

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  icon: ReactNode
  run: () => void
  keywords?: string
}

export function CommandPalette() {
  const { data, dispatch } = useStore()
  const { setPaletteOpen, open, go } = useUI()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const close = () => setPaletteOpen(false)

  const items = useMemo<Item[]>(() => {
    const nav = (label: string, r: Route, icon: ReactNode, kw = ''): Item => ({ id: 'nav-' + label, group: 'Go to', label, icon, run: () => go(r), keywords: kw })
    const base: Item[] = [
      { id: 'a-out', group: 'Actions', label: 'Add money out', hint: 'N', icon: <Plus size={16} />, run: () => open({ kind: 'tx', defaults: { type: 'expense' } }), keywords: 'expense spend new transaction' },
      { id: 'a-in', group: 'Actions', label: 'Add money in', icon: <Plus size={16} />, run: () => open({ kind: 'tx', defaults: { type: 'income' } }), keywords: 'income salary new' },
      { id: 'a-xfer', group: 'Actions', label: 'Move money between accounts', icon: <ArrowLeftRight size={16} />, run: () => open({ kind: 'tx', defaults: { type: 'transfer' } }), keywords: 'transfer pay card' },
      { id: 'a-rec', group: 'Actions', label: 'Add a repeating payment', icon: <Repeat size={16} />, run: () => open({ kind: 'recurring' }), keywords: 'recurring subscription rent salary' },
      { id: 'a-acc', group: 'Actions', label: 'Add an account or card', icon: <CreditCard size={16} />, run: () => open({ kind: 'account' }), keywords: 'bank credit new isa pension loan' },
      { id: 'a-hold', group: 'Actions', label: 'Add an investment', icon: <LineChart size={16} />, run: () => open({ kind: 'holding' }), keywords: 'stock crypto etf buy fund' },
      { id: 'a-price', group: 'Actions', label: 'Update investment prices', icon: <RefreshCw size={16} />, run: () => open({ kind: 'prices' }), keywords: 'quote refresh' },
      { id: 'a-goal', group: 'Actions', label: 'Create a goal', icon: <Target size={16} />, run: () => open({ kind: 'goal' }), keywords: 'save target' },
      { id: 'a-bud', group: 'Actions', label: 'Set a budget', icon: <Wallet size={16} />, run: () => open({ kind: 'budget' }), keywords: 'limit' },
      { id: 'a-imp', group: 'Actions', label: 'Import a CSV statement', icon: <FileUp size={16} />, run: () => open({ kind: 'import' }), keywords: 'upload bank file' },
      { id: 'a-priv', group: 'Actions', label: data.settings.privacy ? 'Show amounts' : 'Hide amounts (privacy mode)', hint: 'H', icon: <Eye size={16} />, run: () => dispatch({ type: 'settings', patch: { privacy: !data.settings.privacy } }), keywords: 'privacy hide mask' },
      { id: 'a-theme', group: 'Actions', label: document.documentElement.dataset.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode', icon: <Moon size={16} />, run: () => dispatch({ type: 'settings', patch: { theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' } }), keywords: 'theme appearance' },
      nav('Overview', { page: 'overview' }, <Home size={16} />, 'dashboard home net worth'),
      nav('Money', { page: 'money' }, <Receipt size={16} />, 'transactions activity'),
      nav('Accounts & cards', { page: 'accounts' }, <CreditCard size={16} />),
      nav('Investments', { page: 'investments' }, <LineChart size={16} />, 'portfolio stocks'),
      nav('Budgets', { page: 'budgets' }, <Wallet size={16} />),
      nav('Goals', { page: 'goals' }, <Target size={16} />),
      nav('Insights', { page: 'insights' }, <HeartPulse size={16} />, 'health timeline'),
      nav('Reports', { page: 'reports' }, <FileText size={16} />, 'monthly year print'),
      nav('Recurring payments', { page: 'money', tab: 'recurring' }, <Repeat size={16} />, 'subscriptions'),
      nav('Spending analysis', { page: 'money', tab: 'analysis' }, <BarChart3 size={16} />, 'categories trends'),
      nav('Settings', { page: 'settings' }, <Settings size={16} />, 'backup export currency lock'),
      ...data.accounts.map((a) => ({ id: 'acc-' + a.id, group: 'Accounts', label: a.name, hint: a.institution, icon: <CreditCard size={16} />, run: () => go({ page: 'accounts', id: a.id }) })),
      ...data.holdings.map((h) => ({ id: 'h-' + h.id, group: 'Investments', label: `${h.symbol} · ${h.name}`, icon: <LineChart size={16} />, run: () => go({ page: 'investments', id: h.id }) })),
      ...data.goals.map((g) => ({ id: 'g-' + g.id, group: 'Goals', label: g.name, icon: <GoalGlyph goal={g} size={16} />, run: () => go({ page: 'goals', id: g.id }) })),
    ]
    const needle = q.trim().toLowerCase()
    if (!needle) return base.filter((i) => i.group === 'Actions' || i.group === 'Go to')

    const out: Item[] = []
    const intent = parseCommand(q, data)
    if (intent) {
      out.push({
        id: 'cmd',
        group: 'Command',
        label: intent.label,
        hint: intent.kind === 'tx' ? 'Opens a form to confirm' : 'Enter',
        icon: <CornerDownLeft size={16} />,
        run: () => (intent.kind === 'tx' ? open({ kind: 'tx', defaults: intent.defaults }) : go(intent.route)),
      })
    }
    out.push(...base.filter((i) => (i.label + ' ' + (i.keywords ?? '') + ' ' + (i.hint ?? '')).toLowerCase().includes(needle)))
    const cats = [...new Set(data.transactions.map((t) => t.category))].filter((c) => c.toLowerCase().includes(needle)).slice(0, 3)
    out.push(...cats.map((c) => ({ id: 'cat-' + c, group: 'Categories', label: c, hint: 'Show transactions', icon: <CatGlyph name={c} />, run: () => go({ page: 'money', category: c }) })))
    const txs = data.transactions
      .filter((t) => t.payee.toLowerCase().includes(needle) || (t.tags ?? []).some((x) => x.includes(needle.replace(/^#/, ''))) || t.date.includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((t) => ({ id: 't-' + t.id, group: 'Transactions', label: t.payee, hint: `${money(t.amount, { currency: data.accounts.find((a) => a.id === t.accountId)?.currency })} · ${dateLabel(t.date)}`, icon: <CatGlyph name={t.category} />, run: () => open({ kind: 'tx', tx: t }) }))
    out.push(...txs)
    return out
  }, [q, data, go, open, dispatch])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (i: Item) => {
    close()
    i.run()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); run(items[active]) }
    else if (e.key === 'Escape') close()
  }

  let lastGroup = ''
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="palette-input">
          <Search size={18} className="muted" />
          <input autoFocus placeholder="Search, or type “add £45 groceries” or “show spending this month”" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[active]?.id} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <p className="muted" style={{ padding: 16, margin: 0 }}>No matches for “{q}”. Try “add 12 coffee” or an account name.</p>}
          {items.map((i, idx) => {
            const head = i.group !== lastGroup ? <div className="palette-group" key={'g' + i.group}>{i.group}</div> : null
            lastGroup = i.group
            return (
              <div key={i.id}>
                {head}
                <button id={i.id} role="option" aria-selected={idx === active} className="palette-item" data-active={idx === active} onMouseMove={() => setActive(idx)} onClick={() => run(i)}>
                  <span className="muted" style={{ display: 'grid', placeItems: 'center', width: 20 }}>{i.icon}</span>
                  {i.label}
                  {i.hint && <span className="hint">{i.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span><span style={{ marginLeft: 'auto' }}>Commands never save without your confirmation</span></div>
      </div>
    </div>
  )
}
