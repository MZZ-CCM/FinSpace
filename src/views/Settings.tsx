import { useState } from 'react'
import { CatGlyph } from '../components/glyphs'
import { Download, Lock, Moon, Plus, RefreshCw, Sun, Trash2 } from 'lucide-react'
import { EMPTY, useStore } from '../lib/store'
import { CURRENCIES, expenseCategories, incomeCategories } from '../lib/meta'
import { download, transactionsToCSV } from '../lib/csv'
import { fetchRate } from '../lib/prices'
import { dateLabel, todayISO } from '../lib/format'
import { ConfirmDialog, Field, Segmented } from '../components/ui'
import { BackupPanel } from '../components/Backup'
import { permission, requestPermission } from '../lib/notify'
import { AccountPanel } from '../components/Cloud'

export function Settings() {
  const { data, dispatch, toast, withUndo, lockNow } = useStore()
  const s = data.settings
  const [confirm, setConfirm] = useState<null | 'reset' | 'currency'>(null)
  const [pendingCcy, setPendingCcy] = useState('')
  const [newCat, setNewCat] = useState({ name: '', emoji: '', kind: 'expense' as 'expense' | 'income' })
  const [rates, setRates] = useState<Record<string, string>>({})
  const [fetching, setFetching] = useState('')

  const foreign = [...new Set(data.accounts.map((a) => a.currency).filter((c) => c !== s.currency))]


  const setRate = (ccy: string, rate: number, source: 'manual' | 'frankfurter') => {
    dispatch({ type: 'settings', patch: { fx: { ...s.fx, [ccy]: { rate, date: todayISO(), source } } } })
  }

  const allCats = [...expenseCategories(), ...incomeCategories()].map((c) => c.name.toLowerCase())
  const catErr = newCat.name.trim() && (allCats.includes(newCat.name.trim().toLowerCase()) || s.customCategories.some((c) => c.name.toLowerCase() === newCat.name.trim().toLowerCase())) ? 'That category already exists' : undefined

  return (
    <div className="page-enter" style={{ maxWidth: 820 }}>
      <section className="panel">
        <AccountPanel />
      </section>

      <section className="panel mt-24">
        <h2 className="panel-title">Preferences</h2>
        <div className="form-stack mt-16">
          <div className="grid-2">
            <Field label="Your first name" optional hint="Shown on your overview">
              <input className="input" value={s.name} onChange={(e) => dispatch({ type: 'settings', patch: { name: e.target.value } })} />
            </Field>
            <Field label="Main currency" hint="Totals are shown in this currency">
              <select className="select" value={s.currency} onChange={(e) => { setPendingCcy(e.target.value); setConfirm('currency') }}>
                {[...new Set([s.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="setting-row">
            <div><b>Appearance</b><div className="muted" style={{ fontSize: 13 }}>“Match device” follows your system setting</div></div>
            <Segmented label="Appearance" value={s.theme} onChange={(v) => dispatch({ type: 'settings', patch: { theme: v } })} options={[{ value: 'system', label: 'Match device' }, { value: 'dark', label: <><Moon size={14} />Dark</> }, { value: 'light', label: <><Sun size={14} />Light</> }]} />
          </div>
          <div className="setting-row">
            <div><b>Privacy mode</b><div className="muted" style={{ fontSize: 13 }}>Hide every amount on screen — handy in public. Shortcut: <kbd>H</kbd></div></div>
            <button className="toggle" role="switch" aria-checked={s.privacy} aria-label="Privacy mode" onClick={() => dispatch({ type: 'settings', patch: { privacy: !s.privacy } })} />
          </div>
        </div>
      </section>

      <NotificationSettings />

      <section className="panel mt-24">
        <h2 className="panel-title">Exchange rates</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Amounts always stay in their original currency. To include other-currency accounts in your {s.currency} totals, Finspace needs a rate. Enter one yourself, or fetch today’s free ECB reference rate (via Frankfurter, no key). Nothing converts without a rate.
        </p>
        {foreign.length ? (
          <div className="form-stack mt-16">
            {foreign.map((c) => {
              const r = s.fx[c]
              return (
                <div key={c} className="setting-row" style={{ flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 160 }}><b>1 {c} =</b><div className="muted" style={{ fontSize: 12 }}>{r ? `${r.source === 'manual' ? 'Entered by you' : 'ECB rate'} · ${dateLabel(r.date)}` : 'No rate — not in totals'}</div></div>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <input className="input num" style={{ width: 130 }} inputMode="decimal" placeholder={r ? String(r.rate) : '0.0000'} value={rates[c] ?? ''} onChange={(e) => setRates({ ...rates, [c]: e.target.value })} aria-label={`${c} to ${s.currency} rate`} />
                    <span className="muted">{s.currency}</span>
                    <button className="btn btn-sm" disabled={!(parseFloat(rates[c]) > 0)} onClick={() => { setRate(c, parseFloat(rates[c]), 'manual'); setRates({ ...rates, [c]: '' }); toast(`Rate for ${c} saved`, 'success') }}>Save</button>
                    <button className="btn btn-sm btn-ghost" disabled={fetching === c} onClick={async () => {
                      setFetching(c)
                      try { const v = await fetchRate(c, s.currency); setRate(c, v, 'frankfurter'); toast(`1 ${c} = ${v} ${s.currency} (ECB)`, 'success') } catch (e) { toast((e as Error).message, 'error') }
                      setFetching('')
                    }}><RefreshCw size={13} className={fetching === c ? 'spin' : ''} /> Fetch free rate</button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : <p className="muted mt-16" style={{ fontSize: 13 }}>All your accounts are in {s.currency}. If you add an account in another currency, its rate appears here.</p>}
      </section>

      <section className="panel mt-24">
        <h2 className="panel-title">Your categories</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Add your own alongside the built-in ones.</p>
        <div className="row mt-16" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 180 }}><Field label="Name" error={catErr}><input className="input" placeholder="e.g. Pets" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} /></Field></div>
          <Field label="Type"><select className="select" value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as 'expense' | 'income' })}><option value="expense">Money out</option><option value="income">Money in</option></select></Field>
          <button className="btn btn-primary" disabled={!newCat.name.trim() || !!catErr} onClick={() => { dispatch({ type: 'settings', patch: { customCategories: [...s.customCategories, { ...newCat, name: newCat.name.trim() }] } }); toast(`${newCat.name.trim()} added`, 'success'); setNewCat({ name: '', emoji: '', kind: 'expense' }) }}><Plus size={15} /> Add</button>
        </div>
        {s.customCategories.length > 0 && (
          <div className="chips mt-16">
            {s.customCategories.map((c) => {
              const used = data.transactions.some((t) => t.category === c.name)
              return (
                <span key={c.name} className="chip" style={{ cursor: 'default' }}>
                  <CatGlyph name={c.name} size={14} /> {c.name} <span className="muted">· {c.kind === 'expense' ? 'out' : 'in'}</span>
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ height: 22, width: 22 }} aria-label={`Remove ${c.name}`} title={used ? 'Transactions keep this category name; it just won’t be offered for new ones' : 'Remove'}
                    onClick={() => withUndo(`${c.name} removed`, { type: 'settings', patch: { customCategories: s.customCategories.filter((x) => x.name !== c.name) } })}><Trash2 size={12} /></button>
                </span>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel mt-24">
        <h2 className="panel-title">Live prices</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Crypto prices update from CoinGecko, with Coinbase as a backup. Both are free and need no key or account. Stocks, funds and bonds are priced by you: use <b>Update prices</b> on the Investments page. Your own prices are always the source of truth.
        </p>
      </section>

      <section className="panel mt-24">
        <h2 className="panel-title">Security</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Your data is always encrypted with your encryption passphrase (AES-256). Finspace locks itself when you’re away; unlock with the same passphrase.
        </p>
        <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={lockNow}><Lock size={15} /> Lock now</button>
          <label className="row" style={{ fontSize: 13 }}>Lock automatically after
            <select className="select" style={{ width: 'auto', height: 32 }} value={s.autoLockMinutes ?? 5} onChange={(e) => dispatch({ type: 'settings', patch: { autoLockMinutes: Number(e.target.value) } })}>
              <option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={0}>Only when I close the app</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel mt-24">
        <h2 className="panel-title">Your data</h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>Export or back up everything at any time. No cookies, no analytics, no tracking. <a href="#/privacy">Read the privacy notice</a>.</p>
        <BackupPanel />
        <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => download(`finspace-transactions-${todayISO()}.csv`, transactionsToCSV(data), 'text/csv')}><Download size={15} /> Export transactions (CSV)</button>
        </div>
        <div className="divider" />
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <div>
            <b>{s.sampleData ? 'Remove demo data' : 'Erase everything'}</b>
            <div className="muted" style={{ fontSize: 13 }}>{s.sampleData ? 'Clear the fictional demo and start with your own numbers.' : 'Deletes all accounts, transactions, investments, goals and budgets on this device.'}</div>
          </div>
          <button className="btn btn-danger" onClick={() => setConfirm('reset')}>{s.sampleData ? 'Remove demo data' : 'Erase all data'}</button>
        </div>
      </section>

      <p className="muted mt-24" style={{ fontSize: 12, lineHeight: 2 }}>
        Keyboard: <kbd>⌘</kbd> <kbd>K</kbd> search & commands · <kbd>N</kbd> new transaction · <kbd>H</kbd> hide amounts · <kbd>G</kbd> then <kbd>O</kbd> overview, <kbd>M</kbd> money, <kbd>A</kbd> accounts, <kbd>I</kbd> investments, <kbd>B</kbd> budgets, <kbd>L</kbd> goals, <kbd>S</kbd> settings
      </p>

      {confirm === 'reset' && (
        <ConfirmDialog
          title={s.sampleData ? 'Remove demo data?' : 'Erase all your data?'}
          body={s.sampleData ? 'The fictional accounts, transactions, investments and goals will be cleared. Your preferences stay.' : 'All accounts, transactions, investments, goals and budgets will be deleted from this device. You can undo right after, but download a backup first if you might need it.'}
          confirm={s.sampleData ? 'Remove demo data' : 'Erase everything'}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => withUndo(s.sampleData ? 'Demo data removed' : 'All data erased', { type: 'replace', data: { ...EMPTY, settings: { ...s, sampleData: false, onboarded: true, fx: {}, lastVisit: undefined } } })}
        />
      )}
      {confirm === 'currency' && (
        <ConfirmDialog
          title={`Show totals in ${pendingCcy}?`}
          body={`Your existing amounts won’t be converted — accounts keep their own currency. Accounts in ${s.currency} will then need a ${s.currency}→${pendingCcy} exchange rate to appear in totals.`}
          confirm={`Switch to ${pendingCcy}`}
          cancel="Keep current"
          onClose={() => setConfirm(null)}
          onConfirm={() => { const fx = { ...s.fx }; delete fx[pendingCcy]; dispatch({ type: 'settings', patch: { currency: pendingCcy, fx } }); toast(`Totals now shown in ${pendingCcy}`, 'success') }}
        />
      )}
    </div>
  )
}

const NOTE_TYPES = [
  { key: 'recurring', label: 'Repeating payments due tomorrow', hint: 'e.g. “Rent is due tomorrow”' },
  { key: 'budgets', label: 'Budget reaches 80% or 100%', hint: 'Once per budget, per month' },
  { key: 'goals', label: 'A goal is reached', hint: 'A small celebration' },
  { key: 'monthly', label: 'Monthly report is ready', hint: 'In the first week of each month' },
] as const

function NotificationSettings() {
  const { data, dispatch, toast } = useStore()
  const [perm, setPerm] = useState(permission())
  const n = data.settings.notify ?? { recurring: false, budgets: false, goals: false, monthly: false }
  const toggle = async (k: keyof typeof n) => {
    const turningOn = !n[k]
    if (turningOn && perm !== 'granted') {
      const p = await requestPermission()
      setPerm(p)
      if (p !== 'granted') { toast(p === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.' : 'Notifications weren’t allowed.', 'error'); return }
    }
    dispatch({ type: 'settings', patch: { notify: { ...n, [k]: turningOn } } })
  }
  return (
    <section className="panel mt-24">
      <h2 className="panel-title">Notifications <span className="pill" style={{ marginLeft: 8 }}>Off unless you turn them on</span></h2>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        Gentle reminders from this device — never marketing, and never amounts (notifications can show on a locked screen). They’re generated on your device (so no data leaves it), which means they arrive while Finspace is open, or installed as an app and recently used.
      </p>
      {perm === 'unsupported' ? <p className="muted mt-16">This browser doesn’t support notifications.</p> : (
        <div className="mt-16">
          {NOTE_TYPES.map((t) => (
            <div className="setting-row" key={t.key}>
              <div><b style={{ fontWeight: 500 }}>{t.label}</b><div className="muted" style={{ fontSize: 13 }}>{t.hint}</div></div>
              <button className="toggle" role="switch" aria-checked={n[t.key] && perm === 'granted'} aria-label={t.label} onClick={() => toggle(t.key)} />
            </div>
          ))}
          {perm === 'denied' && <p className="err mt-16" style={{ color: 'var(--warn)', fontSize: 13 }}>Blocked in your browser. Allow notifications for this site in the browser’s settings to use these.</p>}
        </div>
      )}
    </section>
  )
}
