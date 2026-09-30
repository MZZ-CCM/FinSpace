import { useEffect, useRef, useState } from 'react'
import { CreditCard, Eye, EyeOff, FileText, HeartPulse, Home, LineChart, Lock, MoreHorizontal, Plus, Receipt, Search, Settings as SettingsIcon, Target, Wallet, X } from 'lucide-react'
import { useStore } from './lib/store'
import { routeHref, useUI, type Route } from './lib/ui'
import { greeting, monthLabel } from './lib/format'
import { Overview } from './views/Overview'
import { Accounts } from './views/Accounts'
import { Money } from './views/Money'
import { Investments } from './views/Investments'
import { Budgets } from './views/Budgets'
import { Goals } from './views/Goals'
import { Insights } from './views/Insights'
import { Reports } from './views/Reports'
import { Settings } from './views/Settings'
import { Privacy } from './views/Privacy'
import { Onboarding } from './views/Onboarding'
import { AccountSheet, BalanceSheet, BudgetSheet, OverallBudgetSheet, ContributeSheet, CustomizeSheet, GoalSheet, HoldingSheet, ImportSheet, MoreSheet, PricesSheet, RecurringSheet, TradeSheet, TxSheet } from './components/sheets'
import { CommandPalette } from './components/CommandPalette'
import { AuthGate, CloudAutoWriter, storageLabel, useCloud } from './components/Cloud'
import { MonthSwitch } from './components/ui'
import { runNotifications } from './lib/notify'
import { InstallHint } from './components/InstallHint'
import { ShareAppButton } from './components/ShareApp'

type Page = Route['page']
const NAV: { page: Page; label: string; icon: typeof Home; key: string; sub: string }[] = [
  { page: 'overview', label: 'Overview', icon: Home, key: 'O', sub: '' },
  { page: 'money', label: 'Money', icon: Receipt, key: 'M', sub: 'Money in, money out, repeating payments' },
  { page: 'accounts', label: 'Accounts & cards', icon: CreditCard, key: 'A', sub: 'What you own and what you owe' },
  { page: 'investments', label: 'Investments', icon: LineChart, key: 'I', sub: 'What you hold, and how it’s doing' },
  { page: 'budgets', label: 'Budgets', icon: Wallet, key: 'B', sub: 'Limits and how you’re pacing' },
  { page: 'goals', label: 'Goals', icon: Target, key: 'L', sub: 'What you’re saving towards' },
  { page: 'insights', label: 'Insights', icon: HeartPulse, key: 'E', sub: 'Financial health, patterns and your timeline' },
  { page: 'reports', label: 'Reports', icon: FileText, key: 'R', sub: 'Monthly, yearly and custom reports' },
]
const MOBILE_TABS: Page[] = ['overview', 'money', 'accounts', 'investments']
const SHORT: Partial<Record<Page, string>> = { overview: 'Home', investments: 'Invest', accounts: 'Accounts' }

export function App() {
  const { data, toasts, dismissToast, saveState, dispatch, locked, lockNow } = useStore()
  const cloud = useCloud()

  // if the session ends while data is open (signed out elsewhere, expired, account deleted), lock immediately
  useEffect(() => {
    if (cloud.ready && !cloud.user && !locked) lockNow()
  }, [cloud.ready, cloud.user, locked, lockNow])
  const { route, sheet, paletteOpen, setPaletteOpen, open, go, month, setMonth } = useUI()
  const [scrolled, setScrolled] = useState(false)
  const gPending = useRef(false)

  // theme — follows the OS by default
  useEffect(() => {
    const apply = () => {
      const t = data.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : data.settings.theme
      document.documentElement.dataset.theme = t
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f4f2ec' : '#060910')
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [data.settings.theme])

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  // opt-in reminders: check on open and every 30 minutes while open
  const dataRef = useRef(data)
  dataRef.current = data
  useEffect(() => {
    if (locked || !data.settings.onboarded || !data.settings.notify) return
    const tick = async () => {
      const sent = await runNotifications(dataRef.current)
      if (sent) dispatch({ type: 'settings', patch: { notified: sent } })
    }
    const first = setTimeout(tick, 4000)
    const t = setInterval(tick, 30 * 60_000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [locked, data.settings.onboarded, data.settings.notify, dispatch])

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (locked || !data.settings.onboarded) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }
      const tag = (e.target as HTMLElement).tagName
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || sheet || paletteOpen || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (gPending.current) {
        gPending.current = false
        const n = NAV.find((x) => x.key.toLowerCase() === k)
        if (n) go({ page: n.page } as Route)
        else if (k === 's') go({ page: 'settings' })
        return
      }
      if (k === 'g') {
        gPending.current = true
        setTimeout(() => (gPending.current = false), 1200)
      } else if (k === 'n') {
        e.preventDefault()
        open({ kind: 'tx' })
      } else if (k === 'h') {
        dispatch({ type: 'settings', patch: { privacy: !data.settings.privacy } })
      } else if (k === '/') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [paletteOpen, sheet, go, open, setPaletteOpen, locked, data.settings.onboarded, data.settings.privacy, dispatch])

  const current = NAV.find((n) => n.page === route.page)
  const pageName = route.page === 'settings' ? 'Settings' : route.page === 'privacy' ? 'Privacy & terms' : current?.label ?? ''
  useEffect(() => {
    document.title = `${pageName} · Finspace`
  }, [pageName])

  function toastStack() {
    return (
      <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
              {t.message}
              {t.undo ? (
                <button onClick={() => { t.undo!(); dismissToast(t.id) }}>Undo</button>
              ) : (
                <button onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>
    )
  }

  if (route.page === 'privacy' && (locked || !data.settings.onboarded)) {
    return <><div className="ambient"><div className="grain" /></div><div className="content" style={{ margin: '0 auto', position: 'relative', zIndex: 1 }}><h1 style={{ font: '500 30px var(--serif)' }}>Privacy & terms</h1><a href="#/" className="link-btn">← Back</a><div className="mt-16"><Privacy /></div></div></>
  }
  if (locked) return <><div className="ambient"><div className="grain" /></div><AuthGate>{null}</AuthGate>{toastStack()}</>
  if (!data.settings.onboarded) return <><div className="ambient"><div className="grain" /></div><Onboarding /><CloudAutoWriter />{toastStack()}</>

  const title = route.page === 'overview' ? `${greeting()}${data.settings.name ? ', ' + data.settings.name : ''}` : pageName
  const idName =
    route.page === 'accounts' && route.id ? data.accounts.find((a) => a.id === route.id)?.name :
    route.page === 'investments' && route.id ? data.holdings.find((h) => h.id === route.id)?.symbol :
    route.page === 'goals' && route.id ? data.goals.find((g) => g.id === route.id)?.name : undefined
  const crumb = route.page === 'overview' ? `Here’s ${monthLabel(month)} at a glance` : idName ? `${pageName} › ${idName}` : route.page === 'privacy' ? 'How your data is handled, in plain English' : route.page === 'settings' ? 'Preferences, privacy, exchange rates and backups' : current?.sub ?? ''
  const privacy = data.settings.privacy
  const moreItems = [...NAV.filter((n) => !MOBILE_TABS.includes(n.page)), { page: 'settings' as Page, label: 'Settings', icon: SettingsIcon, key: 'S', sub: '' }]

  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <div className="ambient"><div className="grain" /></div>
      <div className="shell">
        <aside className="sidebar" aria-label="Main">
          <div className="brand">
            <div className="brand-mark" aria-hidden>F</div>
            <div><div className="brand-name">Finspace</div><div className="brand-sub">Private wealth cockpit</div></div>
          </div>
          <button className="btn btn-primary" onClick={() => open({ kind: 'tx' })} style={{ width: '100%' }}>
            <Plus size={16} /> Add transaction <kbd style={{ marginLeft: 'auto', background: 'transparent', color: 'inherit', borderColor: 'currentColor', opacity: 0.6 }}>N</kbd>
          </button>
          <nav className="nav" style={{ overflowY: 'auto' }}>
            {NAV.map((n) => (
              <a key={n.page} href={routeHref({ page: n.page } as Route)} aria-current={route.page === n.page ? 'page' : undefined}>
                <n.icon size={18} /> {n.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            <nav className="nav">
              <a href="#/settings" aria-current={route.page === 'settings' ? 'page' : undefined}><SettingsIcon size={18} /> Settings</a>
            </nav>
            <a href="#/privacy" className="muted" style={{ fontSize: 12, padding: '0 12px' }}>Privacy & terms · not financial advice</a>
            <div className="save-state" role="status" title="Your financial data is encrypted before it’s saved">
              <span className={`save-dot ${saveState}`} />
              {saveState === 'error' ? 'Couldn’t save your last change on this device. Download a backup.' : storageLabel(data.settings.storage === 'local', cloud.status)}
            </div>
          </div>
        </aside>

        <div className="main">
          <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
            <div style={{ minWidth: 0 }}>
              <h1>{title}</h1>
              <div className="crumb">{crumb}</div>
            </div>
            <div className="topbar-actions">
              {route.page === 'overview' && <MonthSwitch month={month} onChange={setMonth} />}
              <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search and commands">
                <Search size={15} /> Search or type a command… <kbd>⌘K</kbd>
              </button>
              <button className="btn btn-icon btn-ghost show-mobile" onClick={() => setPaletteOpen(true)} aria-label="Search and commands"><Search size={18} /></button>
              <button className="btn btn-icon btn-ghost" onClick={() => dispatch({ type: 'settings', patch: { privacy: !privacy } })} aria-pressed={privacy} aria-label={privacy ? 'Show amounts' : 'Hide amounts'} title={privacy ? 'Show amounts (H)' : 'Hide amounts (H)'}>
                {privacy ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <ShareAppButton />
              <button className="btn btn-icon btn-ghost" onClick={lockNow} aria-label="Lock Finspace" title="Lock now"><Lock size={18} /></button>
            </div>
          </header>
          <main id="main" className="content" key={route.page + ('id' in route ? route.id ?? '' : '')}>
            {data.settings.sampleData && (
              <div className="banner" role="note">
                <span className="grow">You’re exploring a <b>demo</b>. Every account, company and number here is fictional.</span>
                <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: 'replace', data: { ...data, accounts: [], transactions: [], recurring: [], holdings: [], trades: [], budgets: [], goals: [], settings: { ...data.settings, sampleData: false, fx: {}, lastVisit: undefined } } })}>
                  Start with my own data
                </button>
              </div>
            )}
            {route.page === 'overview' && <InstallHint />}
            {route.page === 'overview' && <Overview />}
            {route.page === 'money' && <Money />}
            {route.page === 'accounts' && <Accounts />}
            {route.page === 'investments' && <Investments />}
            {route.page === 'budgets' && <Budgets />}
            {route.page === 'goals' && <Goals />}
            {route.page === 'insights' && <Insights />}
            {route.page === 'reports' && <Reports />}
            {route.page === 'settings' && <Settings />}
            {route.page === 'privacy' && <Privacy />}
          </main>
        </div>
      </div>

      <nav className="tabbar" aria-label="Main">
        {MOBILE_TABS.map((p) => {
          const n = NAV.find((x) => x.page === p)!
          return (
            <a key={p} href={routeHref({ page: p } as Route)} aria-current={route.page === p ? 'page' : undefined}>
              <n.icon size={20} />
              {SHORT[p] ?? n.label}
            </a>
          )
        })}
        <a href="#more" onClick={(e) => { e.preventDefault(); open({ kind: 'more' }) }} aria-current={!MOBILE_TABS.includes(route.page) ? 'page' : undefined}><MoreHorizontal size={20} />More</a>
      </nav>
      <button className="btn btn-primary fab" onClick={() => open({ kind: 'tx' })} aria-label="Add transaction"><Plus size={22} /></button>

      {sheet?.kind === 'tx' && <TxSheet key={sheet.tx?.id ?? 'new'} tx={sheet.tx} defaults={sheet.defaults} />}
      {sheet?.kind === 'account' && <AccountSheet account={sheet.account} />}
      {sheet?.kind === 'balance' && <BalanceSheet accountId={sheet.accountId} />}
      {sheet?.kind === 'holding' && <HoldingSheet holding={sheet.holding} />}
      {sheet?.kind === 'trade' && <TradeSheet holdingId={sheet.holdingId} trade={sheet.trade} kindHint={sheet.kindHint} />}
      {sheet?.kind === 'prices' && <PricesSheet />}
      {sheet?.kind === 'import' && <ImportSheet accountId={sheet.accountId} />}
      {sheet?.kind === 'budget' && <BudgetSheet category={sheet.category} />}
      {sheet?.kind === 'overallBudget' && <OverallBudgetSheet />}
      {sheet?.kind === 'goal' && <GoalSheet goal={sheet.goal} />}
      {sheet?.kind === 'contribute' && <ContributeSheet goalId={sheet.goalId} />}
      {sheet?.kind === 'recurring' && <RecurringSheet rule={sheet.rule} />}
      {sheet?.kind === 'customize' && <CustomizeSheet />}
      {sheet?.kind === 'more' && <MoreSheet items={moreItems.map((n) => ({ href: routeHref({ page: n.page } as Route), label: n.label, icon: <n.icon size={22} /> }))} />}
      {paletteOpen && <CommandPalette />}
      <CloudAutoWriter />

      {toastStack()}
    </>
  )
}
