import { useMemo, useRef, useState } from 'react'
import { ShareAppButton } from './ShareApp'
import { readStatement, STATEMENT_ACCEPT, StatementError, type Statement } from '../lib/statements'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileUp, RefreshCw, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import type { Account, AccountKind, AssetType, Frequency, Goal, Holding, RecurringRule, Trade, TradeKind, Transaction } from '../lib/types'
import { ACCOUNT_KINDS, ADJUSTMENT_CATEGORY, ASSET_TYPES, CARD_SKINS, CURRENCIES, FREQUENCIES, GOAL_PRESETS, SKIN_KEYS, TRANSFER_CATEGORY, WIDGETS, expenseCategories, freqLabel, incomeCategories, isLiability, kindGroup } from '../lib/meta'
import { addMonths, currencySymbol, dateLabel, money, monthEnd, num, shortDate, sinceLabel, todayISO, uid, sourceName } from '../lib/format'
import { advance, cashBalanceAt, flowBetween, fxRate, goalProgress, lastPricePoint, sharesAt, tradesFor } from '../lib/calc'
import { fetchQuotes } from '../lib/prices'
import { guessDateFormat, parseAmount, parseDate, type DateFormat } from '../lib/csv'
import { ConfirmDialog, Field, Progress, Sheet, Skeleton, readAmount } from './ui'
import { AccountCard } from './AccountCard'

const LAST_ACC = 'finspace:lastAccount'
const lastAccount = () => {
  try {
    return localStorage.getItem(LAST_ACC) ?? undefined
  } catch {
    return undefined
  }
}

function AmountInput({ value, onChange, ccy, big, autoFocus, invalid, label }: { value: string; onChange: (v: string) => void; ccy?: string; big?: boolean; autoFocus?: boolean; invalid?: boolean; label?: string }) {
  return (
    <div className="input-affix">
      <span className="affix">{currencySymbol(ccy)}</span>
      <input className={`input num ${big ? 'amount-input' : ''}`} data-autofocus={autoFocus || undefined} inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-label={label} />
    </div>
  )
}

function TagInput({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setDraft('')
  }
  return (
    <div className="input" style={{ height: 'auto', minHeight: 42, display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, alignItems: 'center' }}>
      {tags.map((t) => (
        <span key={t} className="pill gold">#{t}<button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} style={{ border: 0, background: 'none', color: 'inherit', padding: 0, display: 'grid' }}><X size={12} /></button></span>
      ))}
      <input
        list="tag-suggestions"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            if (draft.trim()) { e.preventDefault(); add(draft) }
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? '' : 'e.g. holiday, work'}
        aria-label="Add tag"
        style={{ flex: 1, minWidth: 80, border: 0, background: 'transparent', outline: 'none', height: 28 }}
      />
      <datalist id="tag-suggestions">{suggestions.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  )
}

// ═══════════════════════════ Transaction ═══════════════════════════

export function TxSheet({ tx, defaults }: { tx?: Transaction; defaults?: Partial<Transaction> }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close, open } = useUI()
  const accounts = data.accounts.filter((a) => !a.archived)
  const init = tx ?? defaults ?? {}
  const firstAcc = init.accountId ?? (accounts.find((a) => a.id === lastAccount()) ?? accounts.find((a) => a.kind === 'checking') ?? accounts[0])?.id ?? ''

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(init.type === 'adjustment' ? 'expense' : init.type ?? 'expense')
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : '')
  const [toAmount, setToAmount] = useState(init.toAmount ? String(init.toAmount) : '')
  const [payee, setPayee] = useState(init.payee ?? '')
  const [category, setCategory] = useState(init.category ?? '')
  const [accountId, setAccountId] = useState(firstAcc)
  const [toAccountId, setToAccountId] = useState(init.toAccountId ?? accounts.find((a) => a.id !== firstAcc && a.kind === 'savings')?.id ?? accounts.find((a) => a.id !== firstAcc)?.id ?? '')
  const [date, setDate] = useState(init.date ?? todayISO())
  const [note, setNote] = useState(init.note ?? '')
  const [tags, setTags] = useState<string[]>(init.tags ?? [])
  const [repeat, setRepeat] = useState<'' | Frequency>('')
  const [tried, setTried] = useState(false)
  const amountRef = useRef<HTMLDivElement>(null)

  const cats = type === 'income' ? incomeCategories(data.settings.customCategories) : expenseCategories(data.settings.customCategories)
  const payees = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) if (t.type === type) m.set(t.payee, t.category)
    return m
  }, [data.transactions, type])
  const allTags = useMemo(() => [...new Set(data.transactions.flatMap((t) => t.tags ?? []))].sort(), [data.transactions])

  if (tx?.type === 'adjustment') return <AdjustmentEdit tx={tx} />

  const from = accounts.find((a) => a.id === accountId)
  const to = accounts.find((a) => a.id === toAccountId)
  const crossCcy = type === 'transfer' && from && to && from.currency !== to.currency
  const amt = readAmount(amount)
  const toAmt = readAmount(toAmount)
  const errors = {
    amount: !(amt > 0) ? 'Enter an amount above zero' : undefined,
    account: !accountId ? 'Choose an account' : undefined,
    to: type === 'transfer' && (!toAccountId || toAccountId === accountId) ? 'Choose a different account to move money into' : undefined,
    toAmount: crossCcy && !(toAmt > 0) ? `Enter how much arrived in ${to!.currency}` : undefined,
    category: type !== 'transfer' && !category ? 'Pick a category' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)

  if (!accounts.length) {
    return (
      <Sheet title="Add a transaction" onClose={close}>
        <p className="muted">Transactions live inside an account. Add your first account — a bank account, card or cash wallet — then come back.</p>
        <button className="btn btn-primary mt-16" onClick={() => open({ kind: 'account' })}>Add an account</button>
      </Sheet>
    )
  }

  const save = (another: boolean) => {
    setTried(true)
    if (!valid) return
    const t: Transaction = {
      id: tx?.id ?? uid(),
      type,
      amount: amt,
      toAmount: crossCcy ? toAmt : undefined,
      date,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      category: type === 'transfer' ? TRANSFER_CATEGORY : category,
      payee: payee.trim() || (type === 'transfer' ? `To ${to?.name ?? 'account'}` : category),
      note: note.trim() || undefined,
      tags: tags.length ? tags : undefined,
      recurringId: tx?.recurringId,
    }
    if (repeat && !tx) {
      // this occurrence is saved now, so the rule starts from the next one (and back-fills any missed since `date`)
      const rule: RecurringRule = { id: uid(), type, amount: amt, accountId, toAccountId: t.toAccountId, category: t.category, payee: t.payee, tags: t.tags, frequency: repeat, nextDate: advance(date, repeat), active: true }
      dispatch({ type: 'upsertTx', tx: { ...t, recurringId: rule.id } })
      dispatch({ type: 'upsertRecurring', rule })
      dispatch({ type: 'runRecurring', today: todayISO() })
    } else dispatch({ type: 'upsertTx', tx: t })
    try { localStorage.setItem(LAST_ACC, accountId) } catch { /* ignore */ }
    const verb = type === 'income' ? 'Money in' : type === 'expense' ? 'Money out' : 'Transfer'
    toast(tx ? 'Changes saved' : `${verb} of ${money(amt, { currency: from?.currency })} added${repeat ? ` · repeats ${freqLabel(repeat).toLowerCase()}` : ''}`, 'success')
    if (another) {
      setAmount('')
      setToAmount('')
      setPayee('')
      setNote('')
      setTried(false)
      amountRef.current?.querySelector('input')?.focus()
    } else close()
  }

  const accLabel = type === 'income' ? 'Paid into' : type === 'expense' ? 'Paid from' : 'From'
  const primary = tx ? 'Save changes' : type === 'income' ? 'Add money in' : type === 'expense' ? 'Add money out' : 'Add transfer'
  const rule = tx?.recurringId ? data.recurring.find((r) => r.id === tx.recurringId) : undefined

  return (
    <Sheet
      title={tx ? 'Edit transaction' : 'Add a transaction'}
      subtitle="Entered by you — nothing is connected to your bank."
      onClose={close}
      footer={
        <>
          {tx && (
            <button className="btn btn-ghost btn-danger left" onClick={() => { withUndo('Transaction deleted', { type: 'deleteTxs', ids: [tx.id] }); close() }}>
              <Trash2 size={16} /> Delete
            </button>
          )}
          {!tx && <button className="btn btn-ghost left" onClick={() => save(true)}>Save & add another</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={() => save(false)}>{primary}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save(false) }}>
        <div className="type-switch" role="group" aria-label="Transaction type">
          <button type="button" data-t="expense" aria-pressed={type === 'expense'} onClick={() => { setType('expense'); setCategory('') }}><ArrowUpRight size={16} />Money out</button>
          <button type="button" data-t="income" aria-pressed={type === 'income'} onClick={() => { setType('income'); setCategory('') }}><ArrowDownLeft size={16} />Money in</button>
          <button type="button" data-t="transfer" aria-pressed={type === 'transfer'} onClick={() => setType('transfer')}><ArrowLeftRight size={16} />Transfer</button>
        </div>
        {type === 'transfer' && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Moving money between your own accounts. It isn’t counted as money in or money out.</p>}

        <div ref={amountRef}>
          <Field label={crossCcy ? `Amount sent (${from!.currency})` : 'Amount'} error={tried ? errors.amount : undefined}>
            <AmountInput value={amount} onChange={setAmount} ccy={from?.currency} big autoFocus invalid={tried && !!errors.amount} />
          </Field>
        </div>

        {type !== 'transfer' && (
          <Field label={type === 'income' ? 'From' : 'Paid to'} hint="Pick a past name to reuse its category">
            <input
              className="input"
              list="payees"
              placeholder={type === 'income' ? 'e.g. Employer, client' : 'e.g. FreshMart, landlord'}
              value={payee}
              onChange={(e) => {
                setPayee(e.target.value)
                const c = payees.get(e.target.value)
                if (c && !category) setCategory(c)
              }}
            />
            <datalist id="payees">{[...payees.keys()].slice(-200).map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
        )}

        {type !== 'transfer' && (
          <div className="field">
            <span>Category</span>
            <div className="chips" role="group" aria-label="Category">
              {cats.map((c) => (
                <button type="button" key={c.name} className="chip" aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
                  <span aria-hidden>{c.emoji}</span>{c.name}
                </button>
              ))}
            </div>
            {tried && errors.category && <span className="err" role="alert">{errors.category}</span>}
          </div>
        )}

        <div className="grid-2">
          <Field label={accLabel} error={tried ? errors.account : undefined}>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency !== data.settings.currency ? ` (${a.currency})` : ''}</option>)}
            </select>
          </Field>
          {type === 'transfer' ? (
            <Field label="To" error={tried ? errors.to : undefined}>
              <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Choose account</option>
                {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.id === accountId}>{a.name}{isLiability(a.kind) ? ' (pay off)' : ''}{a.currency !== data.settings.currency ? ` (${a.currency})` : ''}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Date">
              <input className="input" type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value || todayISO())} />
            </Field>
          )}
        </div>
        {crossCcy && (
          <Field label={`Amount received (${to!.currency})`} error={tried ? errors.toAmount : undefined} hint={amt > 0 && toAmt > 0 ? `Rate used: 1 ${from!.currency} = ${(toAmt / amt).toFixed(4)} ${to!.currency}` : 'Check your statement for the amount that arrived'}>
            <AmountInput value={toAmount} onChange={setToAmount} ccy={to!.currency} />
          </Field>
        )}
        {type === 'transfer' && (
          <div className="grid-2">
            <Field label="Date">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />
            </Field>
            <Field label="Description" optional>
              <input className="input" placeholder="e.g. Card repayment" value={payee} onChange={(e) => setPayee(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid-2">
          {!tx ? (
            <Field label="Repeats" hint={repeat ? 'Future ones are added automatically when due' : undefined}>
              <select className="select" value={repeat} onChange={(e) => setRepeat(e.target.value as Frequency | '')}>
                <option value="">Doesn’t repeat</option>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Repeats">
              <div className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-2)' }}>{rule ? `${freqLabel(rule.frequency)} · next ${shortDate(rule.nextDate)}` : 'Doesn’t repeat'}</div>
            </Field>
          )}
          <Field label="Tags" optional>
            <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
          </Field>
        </div>
        <Field label="Note" optional>
          <input className="input" placeholder="Anything to remember" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {rule && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Part of a repeating payment. Changes here affect only this one — edit future ones in Money › Recurring.</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Sheet>
  )
}

function AdjustmentEdit({ tx }: { tx: Transaction }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close } = useUI()
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const [amount, setAmount] = useState(String(tx.amount))
  const [date, setDate] = useState(tx.date)
  const [note, setNote] = useState(tx.note ?? '')
  const n = parseFloat(amount)
  return (
    <Sheet
      title="Edit balance update"
      subtitle={`${acc?.name ?? 'Account'} · doesn’t count as money in or out`}
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost btn-danger left" onClick={() => { withUndo('Balance update deleted', { type: 'deleteTxs', ids: [tx.id] }); close() }}><Trash2 size={16} /> Delete</button>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={isNaN(n) || n === 0} onClick={() => { dispatch({ type: 'upsertTx', tx: { ...tx, amount: n, date, note: note || undefined } }); toast('Balance update saved', 'success'); close() }}>Save changes</button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Change" hint="Use a minus sign for a decrease, e.g. -120">
          <input className="input num amount-input" data-autofocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} /></Field>
        <Field label="Note" optional><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Sheet>
  )
}

// ═══════════════════════════ Update balance ═══════════════════════════

export function BalanceSheet({ accountId }: { accountId: string }) {
  const { data, dispatch, toast } = useStore()
  const { close } = useUI()
  const a = data.accounts.find((x) => x.id === accountId)
  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  if (!a) return null
  const liab = isLiability(a.kind)
  const current = cashBalanceAt(a, data.transactions, date)
  const shown = liab ? -current : current
  const v = readAmount(value)
  const diffShown = v - shown
  const delta = liab ? -diffShown : diffShown
  const err = isNaN(v) ? 'Enter the balance shown on your statement or app' : undefined

  const save = () => {
    setTried(true)
    if (err) return
    if (Math.abs(delta) < 0.005) { toast('Balance already matches — nothing to change'); close(); return }
    dispatch({ type: 'upsertTx', tx: { id: uid(), type: 'adjustment', amount: Math.round(delta * 100) / 100, date, accountId: a.id, category: ADJUSTMENT_CATEGORY, payee: kindGroup(a.kind) === 'invest' ? 'Valuation update' : 'Balance update', note: note || undefined } })
    toast(`${a.name} updated to ${money(v, { currency: a.currency })}`, 'success')
    close()
  }

  return (
    <Sheet
      title={`Update ${a.name}`}
      subtitle={kindGroup(a.kind) === 'invest' ? 'Enter today’s value from your statement or provider app.' : 'Match the balance your bank shows.'}
      onClose={close}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Update balance</button></>}
    >
      <div className="form-stack">
        <div className="stat"><div className="l">Finspace currently shows {liab ? '(owed)' : ''}</div><div className="v num">{money(shown, { currency: a.currency })}</div></div>
        <Field label={liab ? 'Amount owed now' : kindGroup(a.kind) === 'invest' ? 'Value now' : 'Balance now'} error={tried ? err : undefined}>
          <AmountInput value={value} onChange={setValue} ccy={a.currency} big autoFocus />
        </Field>
        {!isNaN(v) && value && (
          <p className="muted" style={{ margin: 0 }}>
            Difference: <b className={`num ${diffShown >= 0 !== liab ? 'pos' : 'neg'}`}>{money(diffShown, { sign: true, currency: a.currency })}</b>. It’s recorded as a <b>balance update</b> — not money in or out — so your spending figures stay accurate.
          </p>
        )}
        <div className="grid-2">
          <Field label="As of"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} /></Field>
          <Field label="Note" optional><input className="input" placeholder="e.g. Quarterly statement" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Sheet>
  )
}

// ═══════════════════════════ Account ═══════════════════════════

export function AccountSheet({ account }: { account?: Account }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close, go } = useUI()
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [last4, setLast4] = useState(account?.last4 ?? '')
  const [currency, setCurrency] = useState(account?.currency ?? data.settings.currency)
  const [skin, setSkin] = useState(account?.skin ?? SKIN_KEYS[data.accounts.length % SKIN_KEYS.length])
  const [opening, setOpening] = useState(account ? String(account.openingBalance) : '')
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? todayISO())
  const [limit, setLimit] = useState(account?.creditLimit ? String(account.creditLimit) : '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [tried, setTried] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const liab = isLiability(kind)
  const openingN = opening.trim() === '' ? 0 : readAmount(opening)
  const errors = {
    name: !name.trim() ? 'Give the account a name you’ll recognise' : undefined,
    opening: isNaN(openingN) ? 'Enter a number, e.g. 1250.00' : undefined,
    last4: last4 && !/^\d{4}$/.test(last4) ? 'Use exactly 4 digits' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)
  const txCount = account ? data.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id).length : 0
  const noRate = currency !== data.settings.currency && fxRate(data, currency) === null

  const draft: Account = {
    id: account?.id ?? 'preview',
    name: name || 'Account name',
    kind,
    institution: institution || undefined,
    last4: last4 || undefined,
    currency,
    skin,
    openingBalance: isNaN(openingN) ? 0 : openingN,
    openingDate,
    creditLimit: kind === 'credit' && readAmount(limit) > 0 ? readAmount(limit) : undefined,
    notes: notes.trim() || undefined,
  }

  const save = () => {
    setTried(true)
    if (!valid) return
    const a: Account = { ...draft, id: account?.id ?? uid(), name: name.trim(), archived: account?.archived }
    dispatch({ type: 'upsertAccount', account: a })
    toast(account ? 'Account updated' : `${a.name} added`, 'success')
    close()
  }

  return (
    <Sheet
      title={account ? 'Edit account' : 'Add an account'}
      subtitle="Manual account — you enter balances and transactions yourself."
      onClose={close}
      footer={
        <>
          {account && <button className="btn btn-ghost btn-danger left" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Delete</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{account ? 'Save changes' : 'Add account'}</button>
        </>
      }
    >
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 24 }}>
        <AccountCard account={draft} preview={account ? undefined : draft.openingBalance} />
      </div>
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="grid-2">
          <Field label="Type">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              <optgroup label="Everyday & savings">{ACCOUNT_KINDS.filter((k) => k.group === 'cash').map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</optgroup>
              <optgroup label="Investments & pensions">{ACCOUNT_KINDS.filter((k) => k.group === 'invest').map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</optgroup>
              <optgroup label="Debts">{ACCOUNT_KINDS.filter((k) => k.group === 'liability').map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</optgroup>
            </select>
          </Field>
          <Field label="Currency" hint={noRate ? 'Add an exchange rate in Settings to include it in totals' : undefined}>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!!account && txCount > 0} title={account && txCount > 0 ? 'Currency can’t change once the account has transactions' : undefined}>
              {[...new Set([data.settings.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Account name" error={tried ? errors.name : undefined}>
          <input className="input" data-autofocus placeholder={kind === 'credit' ? 'e.g. Travel card' : kind === 'pension' ? 'e.g. Workplace pension' : 'e.g. Everyday account'} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!errors.name} />
        </Field>
        <div className="grid-2">
          <Field label="Bank or provider" optional>
            <input className="input" placeholder="e.g. Northwind Bank" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </Field>
          <Field label="Last 4 digits" optional error={errors.last4} hint="Only to tell cards apart">
            <input className="input num" inputMode="numeric" maxLength={4} placeholder="1234" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label={liab ? 'Amount owed' : kindGroup(kind) === 'invest' ? 'Value' : 'Balance'} error={tried ? errors.opening : undefined} hint={account ? 'On the start date below' : 'What it is today'}>
            <AmountInput value={opening} onChange={setOpening} ccy={currency} />
          </Field>
          <Field label="As of" hint="Transactions after this date adjust it">
            <input className="input" type="date" value={openingDate} max={todayISO()} onChange={(e) => setOpeningDate(e.target.value || todayISO())} />
          </Field>
        </div>
        {kind === 'credit' && (
          <Field label="Credit limit" optional hint="Used to show how much of your limit you’ve used">
            <AmountInput value={limit} onChange={setLimit} ccy={currency} />
          </Field>
        )}
        <Field label="Notes" optional>
          <textarea className="input" rows={2} placeholder="e.g. Joint account, interest rate 4.1%" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="field">
          <span>Card finish</span>
          <div className="swatches" role="group" aria-label="Card finish">
            {SKIN_KEYS.map((k) => (
              <button type="button" key={k} className="swatch" aria-pressed={skin === k} title={CARD_SKINS[k].label} aria-label={CARD_SKINS[k].label} onClick={() => setSkin(k)} style={{ background: `linear-gradient(135deg, ${CARD_SKINS[k].a}, ${CARD_SKINS[k].b})` }} />
            ))}
          </div>
        </div>
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
      {confirmDel && account && (
        <ConfirmDialog
          title={`Delete “${account.name}”?`}
          body={txCount ? `This also removes its ${txCount} transaction${txCount === 1 ? '' : 's'} and any repeating payments. You can undo right after.` : 'You can undo right after.'}
          confirm="Delete account"
          danger
          onClose={() => setConfirmDel(false)}
          onConfirm={() => {
            withUndo(`${account.name} deleted`, { type: 'deleteAccount', id: account.id })
            close()
            go({ page: 'accounts' })
          }}
        />
      )}
    </Sheet>
  )
}

// ═══════════════════════════ Holding ═══════════════════════════

export function HoldingSheet({ holding }: { holding?: Holding }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close, go } = useUI()
  const [symbol, setSymbol] = useState(holding?.symbol ?? '')
  const [name, setName] = useState(holding?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(holding?.assetType ?? 'stock')
  const [accountId, setAccountId] = useState(holding?.accountId ?? '')
  const [cg, setCg] = useState(holding?.coingeckoId ?? '')
  const [notes, setNotes] = useState(holding?.notes ?? '')
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayISO())
  const [current, setCurrent] = useState('')
  const [mode, setMode] = useState<'units' | 'totals'>('units')
  const [invested, setInvested] = useState('')
  const [valueNow, setValueNow] = useState('')
  const [tried, setTried] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const investAccounts = data.accounts.filter((a) => kindGroup(a.kind) === 'invest')

  const sh = parseFloat(shares)
  const pr = readAmount(price)
  const cur = current ? readAmount(current) : NaN
  const inv = readAmount(invested)
  const vn = readAmount(valueNow)
  const errors = {
    symbol: !symbol.trim() ? 'Enter a ticker or short name, e.g. AAPL' : data.holdings.some((h) => h.symbol.toUpperCase() === symbol.trim().toUpperCase() && h.id !== holding?.id) ? 'You already track this — log a trade on it instead' : undefined,
    shares: !holding && mode === 'units' && !(sh > 0) ? 'How many units or shares you bought' : undefined,
    price: !holding && mode === 'units' && !(pr > 0) ? 'Price you paid per unit' : undefined,
    invested: !holding && mode === 'totals' && !(inv > 0) ? 'How much you’ve put in' : undefined,
    valueNow: !holding && mode === 'totals' && !(vn >= 0) ? 'What it’s worth today' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)

  const save = () => {
    setTried(true)
    if (!valid) return
    const id = holding?.id ?? uid()
    // "Totals" mode stores 1 unit priced at the amount invested, then a price point at today's value.
    const units = mode === 'totals' ? 1 : sh
    const paid = mode === 'totals' ? inv : pr
    const nowPrice = mode === 'totals' ? vn : cur
    const h: Holding = {
      id,
      symbol: symbol.trim().toUpperCase(),
      name: name.trim() || symbol.trim().toUpperCase(),
      assetType,
      accountId: accountId || undefined,
      coingeckoId: assetType === 'crypto' && cg.trim() ? cg.trim().toLowerCase() : undefined,
      notes: notes.trim() || undefined,
      prices: holding?.prices ?? (nowPrice > 0 || (mode === 'totals' && vn >= 0) ? [{ date: todayISO(), price: nowPrice, source: 'manual' }] : []),
    }
    dispatch({ type: 'upsertHolding', holding: h })
    if (!holding) dispatch({ type: 'upsertTrade', trade: { id: uid(), holdingId: id, kind: 'buy', date, shares: units, price: paid, fees: 0 } })
    toast(holding ? 'Investment updated' : `${h.symbol} added to your portfolio`, 'success')
    close()
  }

  return (
    <Sheet
      title={holding ? `Edit ${holding.symbol}` : 'Add an investment'}
      subtitle="Stocks, ETFs, funds, bonds or crypto — tracked by you."
      onClose={close}
      footer={
        <>
          {holding && <button className="btn btn-ghost btn-danger left" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Delete</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{holding ? 'Save changes' : 'Add investment'}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="grid-2">
          <Field label="Ticker / short name" error={tried ? errors.symbol : undefined}>
            <input className="input" data-autofocus placeholder="e.g. AAPL" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} aria-invalid={tried && !!errors.symbol} />
          </Field>
          <Field label="Type">
            <select className="select" value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
              {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Name" optional>
          <input className="input" placeholder="e.g. Apple Inc." value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Held in" optional hint={investAccounts.length ? 'Its value then counts towards that account' : 'Add an investment, ISA or pension account to group holdings'}>
          <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Not in a specific account</option>
            {investAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {assetType === 'crypto' && (
          <Field label="CoinGecko ID" optional hint="Lets Finspace fetch the price for free — e.g. bitcoin, ethereum, solana">
            <input className="input" placeholder="bitcoin" value={cg} onChange={(e) => setCg(e.target.value)} />
          </Field>
        )}
        {!holding && (
          <>
            <div className="divider" style={{ margin: '8px 0' }} />
            <div className="between">
              <div className="eyebrow">What you’ve put in</div>
              <div className="segmented" role="group" aria-label="Entry mode">
                <button type="button" aria-pressed={mode === 'units'} onClick={() => setMode('units')}>Units & price</button>
                <button type="button" aria-pressed={mode === 'totals'} onClick={() => setMode('totals')}>Just totals</button>
              </div>
            </div>
            {mode === 'units' ? (
              <>
                <div className="grid-3">
                  <Field label="Units / shares" error={tried ? errors.shares : undefined}>
                    <input className="input num" inputMode="decimal" placeholder="10" value={shares} onChange={(e) => setShares(e.target.value)} />
                  </Field>
                  <Field label="Price paid each" error={tried ? errors.price : undefined}>
                    <AmountInput value={price} onChange={setPrice} />
                  </Field>
                  <Field label="Date bought">
                    <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
                  </Field>
                </div>
                <Field label="Price today" optional hint="Leave blank to use the price you paid until you update it">
                  <AmountInput value={current} onChange={setCurrent} />
                </Field>
                {sh > 0 && pr > 0 && <p className="muted" style={{ margin: 0 }}>Cost: <b className="num" style={{ color: 'var(--text-1)' }}>{money(sh * pr)}</b>{cur > 0 && <> · Worth today: <b className="num" style={{ color: 'var(--text-1)' }}>{money(sh * cur)}</b> · <span className={cur >= pr ? 'pos' : 'neg'}>{money(sh * (cur - pr), { sign: true })}</span></>}</p>}
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>For funds or pensions where you only know the totals — e.g. “Invested £5,000, now worth £5,840”.</p>
                <div className="grid-3">
                  <Field label="Total invested" error={tried ? errors.invested : undefined}><AmountInput value={invested} onChange={setInvested} /></Field>
                  <Field label="Worth today" error={tried ? errors.valueNow : undefined}><AmountInput value={valueNow} onChange={setValueNow} /></Field>
                  <Field label="Invested since"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} /></Field>
                </div>
                {inv > 0 && vn >= 0 && valueNow && <p className="muted" style={{ margin: 0 }}>Gain: <b className={`num ${vn >= inv ? 'pos' : 'neg'}`}>{money(vn - inv, { sign: true })}</b> ({(((vn - inv) / inv) * 100).toFixed(1)}%)</p>}
              </>
            )}
          </>
        )}
        <Field label="Notes" optional>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Monthly direct debit £200" />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
      {confirmDel && holding && (
        <ConfirmDialog
          title={`Delete ${holding.symbol}?`}
          body="This removes the investment and all its trades and prices. You can undo right after."
          confirm="Delete investment"
          danger
          onClose={() => setConfirmDel(false)}
          onConfirm={() => {
            withUndo(`${holding.symbol} deleted`, { type: 'deleteHolding', id: holding.id })
            close()
            go({ page: 'investments' })
          }}
        />
      )}
    </Sheet>
  )
}

// ═══════════════════════════ Trade ═══════════════════════════

export function TradeSheet({ holdingId, trade, kindHint }: { holdingId: string; trade?: Trade; kindHint?: TradeKind }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close } = useUI()
  const h = data.holdings.find((x) => x.id === holdingId)
  const [kind, setKind] = useState<TradeKind>(trade?.kind ?? kindHint ?? 'buy')
  const [shares, setShares] = useState(trade?.shares ? String(trade.shares) : '')
  const [price, setPrice] = useState(trade ? String(trade.price) : '')
  const [fees, setFees] = useState(trade?.fees ? String(trade.fees) : '')
  const [date, setDate] = useState(trade?.date ?? todayISO())
  const [tried, setTried] = useState(false)
  if (!h) return null
  const owned = sharesAt(tradesFor(data.trades.filter((t) => t.id !== trade?.id), h.id), date)
  const sh = parseFloat(shares)
  const pr = readAmount(price)
  const fe = fees ? readAmount(fees) : 0
  const errors = {
    shares: kind !== 'dividend' && !(sh > 0) ? 'Enter how many units' : kind === 'sell' && sh > owned + 1e-9 ? `You held ${num(owned)} on that date` : undefined,
    price: !(pr > 0) ? (kind === 'dividend' ? 'Enter the amount you received' : 'Enter the price per unit') : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)
  const save = () => {
    setTried(true)
    if (!valid) return
    dispatch({ type: 'upsertTrade', trade: { id: trade?.id ?? uid(), holdingId, kind, date, shares: kind === 'dividend' ? 0 : sh, price: pr, fees: isNaN(fe) ? 0 : fe } })
    toast(trade ? 'Trade updated' : kind === 'dividend' ? `Dividend of ${money(pr)} logged` : `${kind === 'buy' ? 'Bought' : 'Sold'} ${num(sh)} ${h.symbol}`, 'success')
    close()
  }
  return (
    <Sheet
      title={trade ? 'Edit trade' : `Log activity · ${h.symbol}`}
      subtitle={`You hold ${num(owned)} ${h.symbol}`}
      onClose={close}
      footer={
        <>
          {trade && <button className="btn btn-ghost btn-danger left" onClick={() => { withUndo('Trade deleted', { type: 'deleteTrade', id: trade.id }); close() }}><Trash2 size={16} /> Delete</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{trade ? 'Save changes' : kind === 'buy' ? 'Log purchase' : kind === 'sell' ? 'Log sale' : 'Log dividend'}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="type-switch" role="group" aria-label="Activity type">
          <button type="button" data-t="income" aria-pressed={kind === 'buy'} onClick={() => setKind('buy')}>Bought</button>
          <button type="button" data-t="expense" aria-pressed={kind === 'sell'} onClick={() => setKind('sell')}>Sold</button>
          <button type="button" data-t="transfer" aria-pressed={kind === 'dividend'} onClick={() => setKind('dividend')}>Dividend</button>
        </div>
        {kind === 'dividend' ? (
          <Field label="Amount received" error={tried ? errors.price : undefined}>
            <AmountInput value={price} onChange={setPrice} big autoFocus />
          </Field>
        ) : (
          <div className="grid-2">
            <Field label="Units / shares" error={tried ? errors.shares : undefined}>
              <input className="input num" data-autofocus inputMode="decimal" placeholder="0" value={shares} onChange={(e) => setShares(e.target.value)} />
            </Field>
            <Field label="Price per unit" error={tried ? errors.price : undefined}>
              <AmountInput value={price} onChange={setPrice} />
            </Field>
          </div>
        )}
        <div className="grid-2">
          <Field label="Date">
            <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
          </Field>
          {kind !== 'dividend' && (
            <Field label="Fees" optional>
              <AmountInput value={fees} onChange={setFees} />
            </Field>
          )}
        </div>
        {kind !== 'dividend' && sh > 0 && pr > 0 && (
          <p className="muted" style={{ margin: 0 }}>Total {kind === 'buy' ? 'cost' : 'proceeds'}: <b className="num" style={{ color: 'var(--text-1)' }}>{money(sh * pr + (kind === 'buy' ? fe || 0 : -(fe || 0)))}</b></p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Sheet>
  )
}

// ═══════════════════════════ Update prices ═══════════════════════════

export function PricesSheet() {
  const { data, dispatch, toast } = useStore()
  const { close } = useUI()
  const holdings = data.holdings.filter((h) => sharesAt(tradesFor(data.trades, h.id), todayISO()) > 0)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [fetched, setFetched] = useState<Record<string, { source: 'finnhub' | 'coingecko' | 'coinbase'; at: string }>>({})
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fetchLive = async () => {
    setLoading(true)
    setErrors({})
    const res = await fetchQuotes(holdings, data.settings.currency, data.settings.finnhubKey)
    const next = { ...vals }
    const f = { ...fetched }
    const errs: Record<string, string> = {}
    let got = 0
    const at = new Date().toISOString()
    for (const r of res) {
      if (r.price) {
        next[r.holdingId] = String(r.price)
        f[r.holdingId] = { source: r.source!, at }
        got++
      } else if (r.error) errs[r.holdingId] = r.error
    }
    setVals(next)
    setFetched(f)
    setErrors(errs)
    setDate(todayISO())
    setLoading(false)
    toast(got ? `Fetched ${got} price${got === 1 ? '' : 's'} — review, then save` : 'No prices fetched. Your existing prices are unchanged — enter them by hand.', got ? 'success' : 'error')
  }

  const filled = holdings.filter((h) => readAmount(vals[h.id] ?? '') > 0)
  const save = () => {
    dispatch({
      type: 'addPrices',
      points: filled.map((h) => {
        const typed = readAmount(vals[h.id])
        const f = fetched[h.id]
        return { holdingId: h.id, point: f ? { date, price: typed, source: f.source, fetchedAt: f.at } : { date, price: typed, source: 'manual' as const } }
      }),
    })
    toast(`${filled.length} price${filled.length === 1 ? '' : 's'} updated`, 'success')
    close()
  }

  return (
    <Sheet
      title="Update prices"
      subtitle="Type today’s prices, or fetch them free. Only filled rows are saved."
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost left" onClick={fetchLive} disabled={loading || !holdings.length}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> {loading ? 'Fetching…' : 'Fetch live prices'}
          </button>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!filled.length}>Save {filled.length || ''} price{filled.length === 1 ? '' : 's'}</button>
        </>
      }
    >
      <Field label="Prices as of">
        <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} style={{ maxWidth: 200 }} />
      </Field>
      <div className="form-stack mt-24">
        {holdings.length === 0 && <p className="muted">You don’t hold any investments right now.</p>}
        {holdings.map((h) => {
          const last = lastPricePoint(h, tradesFor(data.trades, h.id))
          return (
            <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 150px', gap: 12, alignItems: 'center' }}>
              <span className="symbol-badge">{h.symbol.slice(0, 4)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{h.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {last ? <>Last {money(last.price)} · {shortDate(last.date)}{last.fetchedAt ? ` · fetched ${sinceLabel(last.fetchedAt)}` : last.source === 'trade' ? ' · trade price' : ' · entered by you'}</> : 'No price yet'}
                </div>
                {fetched[h.id] && <div style={{ fontSize: 12, color: 'var(--gain)' }}>Live from {sourceName(fetched[h.id].source)}</div>}
                {errors[h.id] && <div style={{ fontSize: 12, color: 'var(--warn)' }}>{errors[h.id]}</div>}
              </div>
              {loading && !vals[h.id] ? <Skeleton h={42} r={10} /> : (
                <AmountInput value={vals[h.id] ?? ''} onChange={(v) => { setVals({ ...vals, [h.id]: v }); if (fetched[h.id]) { const f = { ...fetched }; delete f[h.id]; setFetched(f) } }} label={`New price for ${h.symbol}`} />
              )}
            </div>
          )
        })}
      </div>
      <p className="muted mt-24" style={{ fontSize: 12 }}>
        Live prices are optional and free: crypto via CoinGecko or Coinbase (no key, rate-limited), stocks via Finnhub’s free tier (your own key from Settings, 60 calls a minute, US listings). If a service stops working, manual prices keep working.
      </p>
    </Sheet>
  )
}

// ═══════════════════════════ CSV import ═══════════════════════════

export function ImportSheet({ accountId: presetAccount }: { accountId?: string }) {
  const { data, dispatch, toast } = useStore()
  const { close, open } = useUI()
  const [rows, setRows] = useState<string[][] | null>(null)
  const [fileName, setFileName] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState({ date: -1, payee: -1, amount: -1, debit: -1, credit: -1, category: -1, balance: -1 })
  const [fmt, setFmt] = useState<DateFormat>('YMD')
  const [accountId, setAccountId] = useState(presetAccount ?? data.accounts[0]?.id ?? '')
  const [closing, setClosing] = useState('')
  const [closingTouched, setClosingTouched] = useState(false)
  const [flip, setFlip] = useState(false)
  const [skipDupes, setSkipDupes] = useState(true)

  const [reading, setReading] = useState(false)
  const [note, setNote] = useState<string | undefined>()
  const onFile = async (f: File) => {
    setReading(true)
    let st: Statement
    try { st = await readStatement(f) } catch (e) {
      setReading(false)
      toast(e instanceof StatementError ? e.message : 'That file couldn’t be read. Try a CSV, Excel, OFX, QIF or PDF statement.', 'error')
      return
    }
    setReading(false)
    const r = st.rows
    setFileName(f.name)
    setNote(st.note)
    setRows(r)
    setHasHeader(true)
    if (st.map) { setMap(st.map); setFmt('YMD'); return }
    const head = r[0].map((h) => h.toLowerCase())
    const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)))
    const m = {
      date: find('date', 'posted'),
      payee: find('description', 'payee', 'merchant', 'name', 'details', 'narrative'),
      amount: find('amount', 'value'),
      debit: find('debit', 'paid out', 'withdrawal', 'money out'),
      credit: find('credit', 'paid in', 'deposit', 'money in'),
      category: find('category'),
      balance: head.findIndex((h) => /balance/.test(h) && !/available/.test(h)),
    }
    setMap(m)
    if (m.date >= 0) setFmt(guessDateFormat(r.slice(1, 30).map((x) => x[m.date] ?? '')))
  }

  const body = rows ? (hasHeader ? rows.slice(1) : rows) : []
  const headers = rows ? (hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`)) : []
  const knownCats = new Set([...expenseCategories(data.settings.customCategories), ...incomeCategories(data.settings.customCategories)].map((c) => c.name))
  const existing = new Set(data.transactions.filter((t) => t.accountId === accountId).map((t) => `${t.date}|${t.amount.toFixed(2)}|${t.type}`))

  const parsed = body.map((r) => {
    const date = map.date >= 0 ? parseDate(r[map.date] ?? '', fmt) : null
    let amt: number | null = null
    if (map.amount >= 0) amt = parseAmount(r[map.amount] ?? '')
    else if (map.debit >= 0 || map.credit >= 0) {
      const d = map.debit >= 0 ? parseAmount(r[map.debit] ?? '') ?? 0 : 0
      const c = map.credit >= 0 ? parseAmount(r[map.credit] ?? '') ?? 0 : 0
      amt = c - Math.abs(d)
    }
    if (amt !== null && flip) amt = -amt
    const payee = map.payee >= 0 ? r[map.payee] ?? '' : ''
    const rawCat = map.category >= 0 ? r[map.category] ?? '' : ''
    const bal = map.balance >= 0 ? parseAmount(r[map.balance] ?? '') : null
    const dupe = !!date && amt !== null && existing.has(`${date}|${Math.abs(amt).toFixed(2)}|${amt > 0 ? 'income' : 'expense'}`)
    return { date, amt, payee, rawCat, bal, dupe, ok: !!date && amt !== null && amt !== 0 && !(skipDupes && dupe) }
  })
  const good = parsed.filter((p) => p.ok)
  const dupes = parsed.filter((p) => p.dupe).length
  const account = data.accounts.find((a) => a.id === accountId)
  const liab = account ? isLiability(account.kind) : false
  const lastDate = good.reduce((m, p) => (p.date! > m ? p.date! : m), '')
  // Closing balance: taken from the file's balance column (latest row) unless typed by the user.
  const fileClosing = (() => {
    const withBal = parsed.filter((p) => p.date && p.bal !== null)
    if (!withBal.length) return null
    const bal = withBal.reduce((a, b) => (b.date! >= a.date! ? b : a)).bal!
    // banks show card balances with either sign; "owed" is always positive here
    return liab ? Math.abs(bal) : bal
  })()
  const closingValue = closingTouched ? (closing.trim() ? readAmount(closing) : NaN) : fileClosing ?? NaN

  const doImport = () => {
    const txs: Transaction[] = good.map((p): Transaction => {
      const income = p.amt! > 0
      // On cards and loans, money coming in is usually a repayment from another account — not income.
      if (income && liab) return { id: uid(), type: 'adjustment', amount: p.amt!, date: p.date!, accountId, category: ADJUSTMENT_CATEGORY, payee: p.payee || 'Payment received', note: 'Imported payment or credit', tags: ['imported'] }
      return {
        id: uid(),
        type: income ? 'income' : 'expense',
        amount: Math.abs(p.amt!),
        date: p.date!,
        accountId,
        category: knownCats.has(p.rawCat) ? p.rawCat : income ? 'Other income' : 'Other',
        payee: p.payee || 'Imported',
        note: p.rawCat && !knownCats.has(p.rawCat) ? p.rawCat : undefined,
        tags: ['imported'],
      }
    })
    dispatch({ type: 'addTxs', txs })
    let msg = `Imported ${txs.length} transactions into ${account?.name ?? 'the account'}`
    if (account && !isNaN(closingValue) && lastDate) {
      const now = cashBalanceAt(account, [...data.transactions, ...txs], lastDate)
      const target = liab ? -closingValue : closingValue
      const diff = Math.round((target - now) * 100) / 100
      if (Math.abs(diff) >= 0.01) {
        dispatch({ type: 'upsertTx', tx: { id: uid(), type: 'adjustment', amount: diff, date: lastDate, accountId, category: ADJUSTMENT_CATEGORY, payee: 'Statement reconciliation', note: `Matched closing balance from ${fileName}` } })
        msg += ` · balance matched to the statement (${money(diff, { sign: true, currency: account.currency })} adjustment)`
      } else msg += ' · balance already matches the statement'
    }
    toast(msg, 'success')
    close()
  }

  const colSelect = (key: keyof typeof map, label: string, optional = true) => (
    <Field label={label} optional={optional}>
      <select className="select" value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
        <option value={-1}>—</option>
        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </Field>
  )

  if (!data.accounts.length) {
    return (
      <Sheet title="Import a statement" onClose={close}>
        <p className="muted">Add the account these transactions belong to first.</p>
        <button className="btn btn-primary mt-16" onClick={() => open({ kind: 'account' })}>Add an account</button>
      </Sheet>
    )
  }

  return (
    <Sheet
      wide
      title={presetAccount && account ? `Import statement · ${account.name}` : 'Import a statement'}
      subtitle="Download a statement from your bank’s website — PDF, CSV, Excel, OFX/QFX or QIF — then drop it here. Your bank is never connected."
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={!good.length || !accountId} onClick={doImport}>Import {good.length || ''} transactions</button>
        </>
      }
    >
      {!rows ? (
        <label
          className="card-add"
          style={{ width: '100%', aspectRatio: 'auto', padding: 48, cursor: 'pointer' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        >
          {reading ? <RefreshCw size={28} className="spin" /> : <FileUp size={28} />}
          <b>{reading ? 'Reading your statement…' : 'Drop a statement or click to choose'}</b>
          <span className="muted" style={{ fontSize: 13 }}>PDF, CSV, Excel (.xlsx), OFX/QFX or QIF · read on this device, never uploaded</span>
          <input type="file" accept={STATEMENT_ACCEPT} hidden disabled={reading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
        </label>
      ) : (
        <div className="form-stack">
          <div className="between">
            <div><b>{fileName}</b> <span className="muted">· {body.length} rows</span>{note && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{note}</div>}</div>
            <button className="link-btn" onClick={() => setRows(null)}>Choose another file</button>
          </div>
          <div className="grid-3">
            <Field label="Import into">
              <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!!presetAccount}>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Date format">
              <select className="select" value={fmt} onChange={(e) => setFmt(e.target.value as DateFormat)}>
                <option value="YMD">2026-09-29</option>
                <option value="DMY">29/09/2026</option>
                <option value="MDY">09/29/2026</option>
              </select>
            </Field>
            <Field label="First row">
              <select className="select" value={hasHeader ? 'h' : 'd'} onChange={(e) => setHasHeader(e.target.value === 'h')}>
                <option value="h">Is column names</option>
                <option value="d">Is a transaction</option>
              </select>
            </Field>
          </div>
          <div className="grid-3">
            {colSelect('date', 'Date column', false)}
            {colSelect('payee', 'Description column')}
            {colSelect('category', 'Category column')}
          </div>
          <div className="grid-3">
            {colSelect('amount', 'Amount (+/−) column')}
            {colSelect('debit', 'or Money out column')}
            {colSelect('credit', 'or Money in column')}
          </div>
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" className="tx-check" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
            Spending shows as positive numbers in this file (flip signs)
          </label>
          <div className="grid-2">
            {colSelect('balance', 'Running balance column')}
            <Field label={liab ? 'Amount owed at end of statement' : 'Closing balance on statement'} optional hint={fileClosing !== null && !closingTouched ? `Read from the file’s balance column${lastDate ? ` (${shortDate(lastDate)})` : ''} — check it matches` : 'Finspace adds a balance update so the account matches your statement exactly'}>
              <AmountInput value={closingTouched ? closing : !isNaN(closingValue) ? String(closingValue) : ''} onChange={(v) => { setClosing(v); setClosingTouched(true) }} ccy={account?.currency} />
            </Field>
          </div>
          {liab && <p className="muted" style={{ margin: 0, fontSize: 12 }}>For cards and loans, payments in are saved as balance updates, not income — so a repayment from your current account isn’t counted twice.</p>}
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" className="tx-check" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
            Skip rows that match an existing transaction (same date and amount){dupes ? ` — ${dupes} found` : ''}
          </label>
          <div className="eyebrow mt-16">Preview · {good.length} ready, {parsed.length - good.length} skipped</div>
          <div className="table-wrap" style={{ margin: 0 }}>
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {parsed.slice(0, 8).map((p, i) => (
                  <tr key={i} style={{ opacity: p.ok ? 1 : 0.4 }}>
                    <td>{p.date ?? <span className="neg">Can’t read date</span>}</td>
                    <td>{p.payee || '—'}{p.dupe && <span className="pill" style={{ marginLeft: 8 }}>Already added</span>}</td>
                    <td className="r num">{p.amt === null ? '—' : <span className={p.amt > 0 ? 'pos' : ''}>{money(p.amt, { sign: true })}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Sheet>
  )
}

// ═══════════════════════════ Budget ═══════════════════════════

export function BudgetSheet({ category }: { category?: string }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close } = useUI()
  const existing = data.budgets.find((b) => b.category === category)
  const cats = expenseCategories(data.settings.customCategories)
  const [cat, setCat] = useState(category ?? cats.find((c) => !data.budgets.some((b) => b.category === c.name))?.name ?? '')
  const [limit, setLimit] = useState(existing ? String(existing.limit) : '')
  const [period, setPeriod] = useState<'monthly' | 'yearly'>(existing?.period ?? 'monthly')
  const [tried, setTried] = useState(false)
  const l = readAmount(limit)
  const err = !(l > 0) ? `Enter a ${period === 'monthly' ? 'monthly' : 'yearly'} limit above zero` : undefined
  const save = () => {
    setTried(true)
    if (err || !cat) return
    dispatch({ type: 'setBudget', budget: { category: cat, limit: l, period } })
    toast(`${cat} budget set to ${money(l)} a ${period === 'monthly' ? 'month' : 'year'}`, 'success')
    close()
  }
  return (
    <Sheet
      title={existing ? `Edit ${category} budget` : 'Set a budget'}
      subtitle={period === 'monthly' ? 'Resets on the 1st of every month.' : 'Runs January to December.'}
      onClose={close}
      footer={
        <>
          {existing && <button className="btn btn-ghost btn-danger left" onClick={() => { withUndo(`${category} budget removed`, { type: 'deleteBudget', category: existing.category }); close() }}><Trash2 size={16} /> Remove</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{existing ? 'Save budget' : 'Set budget'}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        {!existing && (
          <div className="field">
            <span>Category</span>
            <div className="chips">
              {cats.map((c) => (
                <button type="button" key={c.name} className="chip" aria-pressed={cat === c.name} onClick={() => setCat(c.name)} disabled={data.budgets.some((b) => b.category === c.name)}>
                  <span aria-hidden>{c.emoji}</span>{c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span>Period</span>
          <div className="segmented" role="group" aria-label="Budget period">
            <button type="button" aria-pressed={period === 'monthly'} onClick={() => setPeriod('monthly')}>Monthly</button>
            <button type="button" aria-pressed={period === 'yearly'} onClick={() => setPeriod('yearly')}>Yearly</button>
          </div>
        </div>
        <Field label={period === 'monthly' ? 'Monthly limit' : 'Yearly limit'} error={tried ? err : undefined}>
          <AmountInput value={limit} onChange={setLimit} big autoFocus />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Sheet>
  )
}

// ═══════════════════════════ Overall budget ═══════════════════════════

export function OverallBudgetSheet() {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close } = useUI()
  const existing = data.settings.overallBudget
  const [limit, setLimit] = useState(existing ? String(existing) : '')
  const [tried, setTried] = useState(false)
  const l = readAmount(limit)
  const err = !(l > 0) ? 'Enter a monthly limit above zero' : undefined
  const allocated = data.budgets.filter((b) => b.period === 'monthly').reduce((s, b) => s + b.limit, 0)
  // a sensible suggestion: average spending over the last 3 full months
  const today = todayISO().slice(0, 7)
  const avg = [1, 2, 3].map((i) => {
    const m = addMonths(today, -i)
    return flowBetween(data, `${m}-01`, monthEnd(m)).expense
  }).filter((x) => x > 0)
  const typical = avg.length ? avg.reduce((a, b) => a + b, 0) / avg.length : 0
  const save = () => {
    setTried(true)
    if (err) return
    dispatch({ type: 'settings', patch: { overallBudget: l } })
    toast(`Overall budget set to ${money(l)} a month`, 'success')
    close()
  }
  return (
    <Sheet
      title={existing ? 'Edit overall budget' : 'Set an overall budget'}
      subtitle="One limit for everything you spend in a month, across every category and account."
      onClose={close}
      footer={
        <>
          {existing && <button className="btn btn-ghost btn-danger left" onClick={() => { withUndo('Overall budget removed', { type: 'settings', patch: { overallBudget: undefined } }); close() }}><Trash2 size={16} /> Remove</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{existing ? 'Save budget' : 'Set overall budget'}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Monthly limit for all spending" error={tried ? err : undefined} hint="Resets on the 1st of every month. Transfers between your own accounts don’t count.">
          <AmountInput value={limit} onChange={setLimit} big autoFocus />
        </Field>
        {typical > 0 && (
          <div className="stat">
            <div className="l">You’ve typically spent</div>
            <div className="v num">{money(typical, { cents: false })} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>a month (last {avg.length} full month{avg.length === 1 ? '' : 's'})</span></div>
            <button type="button" className="link-btn" onClick={() => setLimit(String(Math.round(typical / 10) * 10))}>Use this as my limit</button>
          </div>
        )}
        {allocated > 0 && l > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Your category budgets add up to <b className="num" style={{ color: 'var(--text-1)' }}>{money(allocated, { cents: false })}</b>
            {allocated <= l ? <> — leaving <b className="num" style={{ color: 'var(--text-1)' }}>{money(l - allocated, { cents: false })}</b> for everything else.</> : <>, which is <b className="num neg">{money(allocated - l, { cents: false })}</b> more than this overall limit.</>}
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Sheet>
  )
}

// ═══════════════════════════ Goals ═══════════════════════════

export function GoalSheet({ goal }: { goal?: Goal }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close, go } = useUI()
  const [name, setName] = useState(goal?.name ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? '💰')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [accountId, setAccountId] = useState(goal?.accountId ?? '')
  const [start, setStart] = useState('')
  const [tried, setTried] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const t = readAmount(target)
  const s = start ? readAmount(start) : 0
  const errors = {
    name: !name.trim() ? 'Name your goal, e.g. Holiday' : undefined,
    target: !(t > 0) ? 'Enter how much you want to reach' : undefined,
    date: targetDate && targetDate <= todayISO() ? 'Pick a date in the future' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)
  const save = () => {
    setTried(true)
    if (!valid) return
    const g: Goal = {
      id: goal?.id ?? uid(),
      name: name.trim(),
      emoji,
      target: t,
      targetDate: targetDate || undefined,
      accountId: accountId || undefined,
      contributions: goal?.contributions ?? (s > 0 && !accountId ? [{ id: uid(), date: todayISO(), amount: s, note: 'Starting amount' }] : []),
      createdAt: goal?.createdAt ?? todayISO(),
    }
    dispatch({ type: 'upsertGoal', goal: g })
    toast(goal ? 'Goal updated' : `${g.emoji} ${g.name} created`, 'success')
    close()
  }
  const perMonth = t > 0 && targetDate > todayISO() ? goalProgress(data, { id: 'x', name, emoji, target: t, targetDate, accountId: accountId || undefined, contributions: s > 0 ? [{ id: 'y', date: todayISO(), amount: s }] : [], createdAt: todayISO() }).perMonth : null
  return (
    <Sheet
      title={goal ? 'Edit goal' : 'Create a goal'}
      subtitle="Something you’re saving towards."
      onClose={close}
      footer={
        <>
          {goal && <button className="btn btn-ghost btn-danger left" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Delete</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{goal ? 'Save changes' : 'Create goal'}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        {!goal && (
          <div className="chips" role="group" aria-label="Suggestions">
            {GOAL_PRESETS.map((p) => <button type="button" key={p.name} className="chip" aria-pressed={name === p.name} onClick={() => { setName(p.name); setEmoji(p.emoji) }}><span aria-hidden>{p.emoji}</span>{p.name}</button>)}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 12 }}>
          <Field label="Icon"><input className="input" style={{ textAlign: 'center', fontSize: 20 }} maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Goal icon (emoji)" /></Field>
          <Field label="Goal name" error={tried ? errors.name : undefined}><input className="input" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. House deposit" /></Field>
        </div>
        <div className="grid-2">
          <Field label="Target amount" error={tried ? errors.target : undefined}><AmountInput value={target} onChange={setTarget} /></Field>
          <Field label="Target date" optional error={tried ? errors.date : undefined}><input className="input" type="date" value={targetDate} min={todayISO()} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        </div>
        <Field label="Track it with" hint={accountId ? 'Progress follows this account’s balance automatically' : 'You’ll add money to the goal yourself'}>
          <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Manual contributions</option>
            {data.accounts.filter((a) => !isLiability(a.kind)).map((a) => <option key={a.id} value={a.id}>Balance of {a.name}</option>)}
          </select>
        </Field>
        {!goal && !accountId && <Field label="Already saved" optional><AmountInput value={start} onChange={setStart} /></Field>}
        {perMonth !== null && perMonth > 0 && <p className="muted" style={{ margin: 0 }}>To get there on time: about <b className="num" style={{ color: 'var(--text-1)' }}>{money(perMonth, { cents: false })}</b> a month.</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
      {confirmDel && goal && (
        <ConfirmDialog title={`Delete “${goal.name}”?`} body="Its contribution history goes too. Your accounts aren’t affected. You can undo right after." confirm="Delete goal" danger onClose={() => setConfirmDel(false)}
          onConfirm={() => { withUndo(`${goal.name} deleted`, { type: 'deleteGoal', id: goal.id }); close(); go({ page: 'goals' }) }} />
      )}
    </Sheet>
  )
}

export function ContributeSheet({ goalId }: { goalId: string }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close } = useUI()
  const g = data.goals.find((x) => x.id === goalId)
  const [dir, setDir] = useState<'add' | 'take'>('add')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  if (!g) return null
  const p = goalProgress(data, g)
  const a = readAmount(amount)
  const err = !(a > 0) ? 'Enter an amount above zero' : undefined
  const save = () => {
    setTried(true)
    if (err) return
    dispatch({ type: 'contribute', goalId, contribution: { id: uid(), date, amount: dir === 'add' ? a : -a, note: note || undefined } })
    const after = p.current + (dir === 'add' ? a : -a)
    toast(after >= g.target && p.current < g.target ? `🎉 ${g.name} reached!` : `${money(a)} ${dir === 'add' ? 'added to' : 'taken from'} ${g.name}`, 'success')
    close()
  }
  return (
    <Sheet title={`${g.emoji} ${g.name}`} subtitle={`${money(p.current)} of ${money(g.target)}`} onClose={close}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>{dir === 'add' ? 'Add to goal' : 'Take from goal'}</button></>}>
      <div className="form-stack">
        <Progress ratio={p.ratio} label={`${Math.round(p.ratio * 100)}% of goal`} tone="accent" />
        <div className="type-switch" style={{ gridTemplateColumns: '1fr 1fr' }} role="group" aria-label="Direction">
          <button type="button" data-t="income" aria-pressed={dir === 'add'} onClick={() => setDir('add')}>Add money</button>
          <button type="button" data-t="expense" aria-pressed={dir === 'take'} onClick={() => setDir('take')}>Take money out</button>
        </div>
        <Field label="Amount" error={tried ? err : undefined}><AmountInput value={amount} onChange={setAmount} big autoFocus /></Field>
        <div className="grid-2">
          <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} /></Field>
          <Field label="Note" optional><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Goal contributions are earmarks — they don’t move money between accounts. To move real money, add a transfer.</p>
        {g.contributions.length > 0 && (
          <>
            <div className="eyebrow mt-16">History</div>
            {[...g.contributions].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 12).map((c) => (
              <div key={c.id} className="between" style={{ fontSize: 13 }}>
                <span>{dateLabel(c.date)}{c.note ? <span className="muted"> · {c.note}</span> : null}</span>
                <span className="row"><b className={`num ${c.amount >= 0 ? 'pos' : 'neg'}`}>{money(c.amount, { sign: true })}</b>
                  <button className="btn btn-ghost btn-sm btn-icon" aria-label="Delete contribution" onClick={() => withUndo('Contribution removed', { type: 'deleteContribution', goalId, id: c.id })}><Trash2 size={14} /></button></span>
              </div>
            ))}
          </>
        )}
      </div>
    </Sheet>
  )
}

// ═══════════════════════════ Recurring rule ═══════════════════════════

export function RecurringSheet({ rule }: { rule?: RecurringRule }) {
  const { data, dispatch, withUndo, toast } = useStore()
  const { close } = useUI()
  const accounts = data.accounts
  const [type, setType] = useState<RecurringRule['type']>(rule?.type ?? 'expense')
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '')
  const [payee, setPayee] = useState(rule?.payee ?? '')
  const [category, setCategory] = useState(rule?.category ?? '')
  const [accountId, setAccountId] = useState(rule?.accountId ?? accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [nextDate, setNextDate] = useState(rule?.nextDate ?? todayISO())
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const [active, setActive] = useState(rule?.active ?? true)
  const [tried, setTried] = useState(false)
  const cats = type === 'income' ? incomeCategories(data.settings.customCategories) : expenseCategories(data.settings.customCategories)
  const a = readAmount(amount)
  const made = rule ? data.transactions.filter((t) => t.recurringId === rule.id).length : 0
  const errors = {
    amount: !(a > 0) ? 'Enter an amount above zero' : undefined,
    payee: !payee.trim() ? 'Name it, e.g. Rent or Netflix' : undefined,
    category: type !== 'transfer' && !category ? 'Pick a category' : undefined,
    to: type === 'transfer' && (!toAccountId || toAccountId === accountId) ? 'Choose a different account' : undefined,
    end: endDate && endDate < nextDate ? 'End date must be after the next date' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)
  const save = () => {
    setTried(true)
    if (!valid) return
    const r: RecurringRule = { id: rule?.id ?? uid(), type, amount: a, payee: payee.trim(), category: type === 'transfer' ? TRANSFER_CATEGORY : category, accountId, toAccountId: type === 'transfer' ? toAccountId : undefined, frequency, nextDate, endDate: endDate || undefined, active, tags: rule?.tags }
    dispatch({ type: 'upsertRecurring', rule: r })
    dispatch({ type: 'runRecurring', today: todayISO() })
    toast(rule ? 'Repeating payment updated' : `${r.payee} will repeat ${freqLabel(frequency).toLowerCase()}`, 'success')
    close()
  }
  return (
    <Sheet
      title={rule ? 'Edit repeating payment' : 'Add a repeating payment'}
      subtitle={rule ? `${made} transaction${made === 1 ? '' : 's'} created so far · past ones aren’t changed` : 'Finspace adds it for you each time it’s due.'}
      onClose={close}
      footer={
        <>
          {rule && <button className="btn btn-ghost btn-danger left" onClick={() => { withUndo(`${rule.payee} will no longer repeat`, { type: 'deleteRecurring', id: rule.id }); close() }}><Trash2 size={16} /> Stop repeating</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{rule ? 'Save changes' : 'Add repeating payment'}</button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="type-switch" role="group" aria-label="Type">
          <button type="button" data-t="expense" aria-pressed={type === 'expense'} onClick={() => { setType('expense'); setCategory('') }}>Money out</button>
          <button type="button" data-t="income" aria-pressed={type === 'income'} onClick={() => { setType('income'); setCategory('') }}>Money in</button>
          <button type="button" data-t="transfer" aria-pressed={type === 'transfer'} onClick={() => setType('transfer')}>Transfer</button>
        </div>
        <div className="grid-2">
          <Field label="Amount" error={tried ? errors.amount : undefined}><AmountInput value={amount} onChange={setAmount} ccy={accounts.find((x) => x.id === accountId)?.currency} autoFocus /></Field>
          <Field label="Name" error={tried ? errors.payee : undefined}><input className="input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. Rent" /></Field>
        </div>
        {type !== 'transfer' && (
          <Field label="Category" error={tried ? errors.category : undefined}>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Choose…</option>
              {cats.map((c) => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid-2">
          <Field label={type === 'income' ? 'Paid into' : 'From'}>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </Field>
          {type === 'transfer' ? (
            <Field label="To" error={tried ? errors.to : undefined}>
              <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}><option value="">Choose…</option>{accounts.filter((x) => x.id !== accountId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </Field>
          ) : (
            <Field label="How often">
              <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>{FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
            </Field>
          )}
        </div>
        {type === 'transfer' && (
          <Field label="How often">
            <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>{FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
          </Field>
        )}
        <div className="grid-2">
          <Field label="Next date" hint={nextDate <= todayISO() ? 'Due ones up to today are added when you save' : undefined}><input className="input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value || todayISO())} /></Field>
          <Field label="Ends" optional error={tried ? errors.end : undefined}><input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>
        {rule && (
          <div className="setting-row">
            <div><b>Active</b><div className="muted" style={{ fontSize: 13 }}>Pause to stop adding new ones without deleting the rule</div></div>
            <button type="button" className="toggle" role="switch" aria-checked={active} onClick={() => setActive(!active)} aria-label="Active" />
          </div>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Sheet>
  )
}

// ═══════════════════════════ Customise dashboard ═══════════════════════════

export function CustomizeSheet() {
  const { data, dispatch } = useStore()
  const { close } = useUI()
  const hidden = new Set(data.settings.hiddenWidgets)
  return (
    <Sheet title="Customise overview" subtitle="Choose what appears on your dashboard. Net worth always stays at the top." onClose={close} footer={<button className="btn btn-primary" onClick={close}>Done</button>}>
      {WIDGETS.map((w) => (
        <div className="setting-row" key={w.id}>
          <span>{w.label}</span>
          <button type="button" className="toggle" role="switch" aria-checked={!hidden.has(w.id)} aria-label={`Show ${w.label}`}
            onClick={() => dispatch({ type: 'settings', patch: { hiddenWidgets: hidden.has(w.id) ? data.settings.hiddenWidgets.filter((x) => x !== w.id) : [...data.settings.hiddenWidgets, w.id] } })} />
        </div>
      ))}
      <button className="btn btn-ghost mt-16" onClick={() => dispatch({ type: 'settings', patch: { hiddenWidgets: [] } })}>Show everything</button>
    </Sheet>
  )
}

// ═══════════════════════════ Mobile “More” ═══════════════════════════

export function MoreSheet({ items }: { items: { href: string; label: string; icon: React.ReactNode }[] }) {
  const { close } = useUI()
  return (
    <Sheet title="More" onClose={close}>
      <nav className="more-grid" aria-label="More pages">
        {items.map((i) => <a key={i.href} href={i.href} onClick={close}>{i.icon}{i.label}</a>)}
      </nav>
      <ShareAppButton label className="btn btn-ghost mt-16" />
    </Sheet>
  )
}
