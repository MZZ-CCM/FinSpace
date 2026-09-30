import { useState } from 'react'
import { GoalGlyph } from '../components/glyphs'
import { ArrowRight, Compass, HardDrive, Lock, PenLine, Plus, ShieldCheck, Trash2, WalletCards } from 'lucide-react'
import { useStore } from '../lib/store'
import { buildSample } from '../lib/sample'
import { ACCOUNT_KINDS, CURRENCIES, GOAL_PRESETS, SKIN_KEYS, isLiability } from '../lib/meta'
import type { Account, AccountKind, Goal } from '../lib/types'
import { currencySymbol, todayISO, uid } from '../lib/format'
import { Field, readAmount } from '../components/ui'

interface Draft { key: string; name: string; kind: AccountKind; balance: string }

function guessCurrency() {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale
    if (/GB/.test(loc)) return 'GBP'
    if (/-US/.test(loc)) return 'USD'
    if (/ZA/.test(loc)) return 'ZAR'
    if (/(DE|FR|ES|IT|NL|IE|PT|BE|AT|FI)/.test(loc)) return 'EUR'
  } catch { /* ignore */ }
  return 'GBP'
}

const STEPS = ['Basics', 'Accounts', 'Extras']

export function Onboarding() {
  const { data, dispatch } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(guessCurrency)
  const [accounts, setAccounts] = useState<Draft[]>([
    { key: 'a', name: 'Current account', kind: 'checking', balance: '' },
    { key: 'b', name: 'Savings', kind: 'savings', balance: '' },
  ])
  const [invest, setInvest] = useState(false)
  const [goals, setGoals] = useState<Set<string>>(new Set())

  const finish = () => {
    const today = todayISO()
    const accs: Account[] = accounts
      .filter((a) => a.name.trim())
      .map((a, i) => ({ id: uid(), name: a.name.trim(), kind: a.kind, currency, skin: SKIN_KEYS[i % SKIN_KEYS.length], openingBalance: isNaN(readAmount(a.balance)) ? 0 : readAmount(a.balance), openingDate: today }))
    const gs: Goal[] = GOAL_PRESETS.filter((g) => goals.has(g.name)).map((g) => ({ id: uid(), name: g.name, emoji: g.emoji, target: g.name === 'Emergency fund' ? 5000 : g.name === 'House deposit' ? 25000 : 2000, contributions: [], createdAt: today }))
    dispatch({
      type: 'replace',
      data: { ...data, accounts: accs, goals: gs, settings: { ...data.settings, name: name.trim(), currency, onboarded: true, sampleData: false } },
    })
    if (invest) setTimeout(() => { location.hash = '#/investments' }, 0)
  }

  return (
    <div className="onboard">
      <div className="onboard-card page-enter">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div><div className="brand-name">Finspace</div><div className="brand-sub">Private wealth cockpit</div></div>
        </div>

        {step === 0 && (
          <>
            <h1>See all your money. <em>In one calm place.</em></h1>
            <p className="lede">Track accounts, cards, spending and investments — by hand, on your device. No bank logins. No subscriptions. No hidden costs.</p>
            <div className="form-stack" style={{ gap: 12 }}>
              <button className="choice" onClick={() => setStep(1)}>
                <span className="ic"><PenLine size={20} /></span>
                <span><b>Set up with my own numbers</b><span>About 2 minutes. You can add more later.</span></span>
                <ArrowRight size={18} />
              </button>
              <button className="choice" onClick={() => dispatch({ type: 'replace', data: buildSample({ ...data, settings: { ...data.settings, currency } }) })}>
                <span className="ic"><Compass size={20} /></span>
                <span><b>Explore the demo first</b><span>18 months of fictional activity. Remove it with one click.</span></span>
                <ArrowRight size={18} />
              </button>
            </div>
          </>
        )}

        {step > 0 && (
          <div className="steps mt-24" aria-label={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}>
            {STEPS.map((s, i) => <i key={s} className={i < step ? 'on' : ''} />)}
          </div>
        )}

        {step === 1 && (
          <>
            <h1 style={{ fontSize: 34 }}>The basics</h1>
            <p className="lede">Step 1 of 3 · You can change these later in Settings.</p>
            <form className="form-stack" onSubmit={(e) => { e.preventDefault(); setStep(2) }}>
              <Field label="What should we call you?" optional>
                <input className="input" autoFocus placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="What currency do you mainly use?" hint="Totals are shown in this. Accounts can still use other currencies.">
                <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <div className="row mt-16">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                <button type="submit" className="btn btn-primary" style={{ marginLeft: 'auto' }}>Next: accounts <ArrowRight size={16} /></button>
              </div>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={{ fontSize: 34 }}>What do you want to track?</h1>
            <p className="lede">Step 2 of 3 · Add each account with today’s balance. Rough numbers are fine — you can update them any time.</p>
            <div className="form-stack">
              {accounts.map((a, i) => (
                <div key={a.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 36px', gap: 8, alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Name' : ''}><input className="input" value={a.name} onChange={(e) => setAccounts(accounts.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)))} aria-label="Account name" /></Field>
                  <Field label={i === 0 ? 'Type' : ''}>
                    <select className="select" value={a.kind} onChange={(e) => setAccounts(accounts.map((x) => (x.key === a.key ? { ...x, kind: e.target.value as AccountKind } : x)))} aria-label="Account type">
                      {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? 'Balance / owed' : ''}>
                    <div className="input-affix"><span className="affix">{currencySymbol(currency)}</span><input className="input num" inputMode="decimal" placeholder="0.00" value={a.balance} onChange={(e) => setAccounts(accounts.map((x) => (x.key === a.key ? { ...x, balance: e.target.value } : x)))} aria-label={isLiability(a.kind) ? 'Amount owed' : 'Balance'} /></div>
                  </Field>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${a.name || 'account'}`} onClick={() => setAccounts(accounts.filter((x) => x.key !== a.key))}><Trash2 size={16} /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAccounts([...accounts, { key: uid(), name: '', kind: 'credit', balance: '' }])}><Plus size={16} /> Add another</button>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>For credit cards and loans, enter what you owe as a positive number.</p>
              <div className="row mt-16">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setStep(3)}>Next <ArrowRight size={16} /></button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={{ fontSize: 34 }}>Anything else?</h1>
            <p className="lede">Step 3 of 3 · Both optional.</p>
            <div className="form-stack">
              <div className="setting-row">
                <div><b>I want to track investments</b><div className="muted" style={{ fontSize: 13 }}>Stocks, funds, crypto — we’ll take you there next</div></div>
                <button type="button" className="toggle" role="switch" aria-checked={invest} aria-label="Track investments" onClick={() => setInvest(!invest)} />
              </div>
              <div className="field">
                <span>Start a goal or two</span>
                <div className="chips">
                  {GOAL_PRESETS.map((g) => <button type="button" key={g.name} className="chip" aria-pressed={goals.has(g.name)} onClick={() => { const n = new Set(goals); n.has(g.name) ? n.delete(g.name) : n.add(g.name); setGoals(n) }}><GoalGlyph goal={g} size={15} />{g.name}</button>)}
                </div>
                <span className="hint">We’ll add a starting target you can change.</span>
              </div>
              <div className="row mt-16">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
                <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={finish}>Open my dashboard <ArrowRight size={16} /></button>
              </div>
            </div>
          </>
        )}

        <div className="promise">
          <span><Lock size={14} /> No bank connection</span>
          <span><HardDrive size={14} /> Encrypted before it’s saved</span>
          <span><ShieldCheck size={14} /> Free — no hidden costs</span>
          <span><WalletCards size={14} /> Export any time</span>
          <a href="#/privacy" style={{ color: 'var(--text-2)' }}>Privacy & terms</a>
        </div>
      </div>
    </div>
  )
}
