import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Account, AppData, Budget, Goal, GoalContribution, Holding, PricePoint, RecurringRule, Settings, Trade, Transaction } from './types'
import { setCurrency, setPrivacy, uid } from './format'
import { registerCustomCategories } from './meta'
import { EMPTY, migrate } from './migrate'
import { createVaultKey, open as openVault, seal, type Vault } from './vault'
import { materializeRecurring, netWorthAt } from './calc'
import { todayISO } from './format'

export { EMPTY }

const KEY = 'finspace:v1'
const VAULT_KEY = 'finspace:vault'
const FAILS_KEY = 'finspace:lockFails'

/** Wrong-passphrase throttling: after 3 misses, waits grow 5s, 10s, 20s… up to 15 minutes. Survives reloads. */
export function lockoutState(): { fails: number; until: number } {
  try {
    const r = JSON.parse(localStorage.getItem(FAILS_KEY) ?? '{}')
    return { fails: Number(r.fails) || 0, until: Number(r.until) || 0 }
  } catch {
    return { fails: 0, until: 0 }
  }
}
function recordFail() {
  const s = lockoutState()
  const fails = s.fails + 1
  const wait = fails >= 3 ? Math.min(15 * 60_000, 5000 * 2 ** (fails - 3)) : 0
  try { localStorage.setItem(FAILS_KEY, JSON.stringify({ fails, until: Date.now() + wait })) } catch { /* ignore */ }
}
function clearFails() {
  try { localStorage.removeItem(FAILS_KEY) } catch { /* ignore */ }
}

export type Action =
  | { type: 'replace'; data: AppData }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'upsertAccount'; account: Account }
  | { type: 'deleteAccount'; id: string }
  | { type: 'upsertTx'; tx: Transaction }
  | { type: 'addTxs'; txs: Transaction[] }
  | { type: 'deleteTxs'; ids: string[] }
  | { type: 'upsertRecurring'; rule: RecurringRule }
  | { type: 'deleteRecurring'; id: string }
  | { type: 'upsertHolding'; holding: Holding }
  | { type: 'deleteHolding'; id: string }
  | { type: 'addPrices'; points: { holdingId: string; point: PricePoint }[] }
  | { type: 'upsertTrade'; trade: Trade }
  | { type: 'deleteTrade'; id: string }
  | { type: 'setBudget'; budget: Budget }
  | { type: 'deleteBudget'; category: string }
  | { type: 'upsertGoal'; goal: Goal }
  | { type: 'deleteGoal'; id: string }
  | { type: 'contribute'; goalId: string; contribution: GoalContribution }
  | { type: 'deleteContribution'; goalId: string; id: string }
  | { type: 'runRecurring'; today: string }

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const next = list.slice()
  next[i] = item
  return next
}

export function reducer(s: AppData, a: Action): AppData {
  switch (a.type) {
    case 'replace':
      return a.data
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.patch } }
    case 'upsertAccount':
      return { ...s, accounts: upsert(s.accounts, a.account) }
    case 'deleteAccount':
      return {
        ...s,
        accounts: s.accounts.filter((x) => x.id !== a.id),
        transactions: s.transactions.filter((t) => t.accountId !== a.id && t.toAccountId !== a.id),
        recurring: s.recurring.filter((r) => r.accountId !== a.id && r.toAccountId !== a.id),
        holdings: s.holdings.map((h) => (h.accountId === a.id ? { ...h, accountId: undefined } : h)),
        goals: s.goals.map((g) => (g.accountId === a.id ? { ...g, accountId: undefined } : g)),
      }
    case 'upsertTx':
      return { ...s, transactions: upsert(s.transactions, a.tx) }
    case 'addTxs':
      return { ...s, transactions: [...s.transactions, ...a.txs] }
    case 'deleteTxs': {
      const ids = new Set(a.ids)
      return { ...s, transactions: s.transactions.filter((t) => !ids.has(t.id)) }
    }
    case 'upsertRecurring':
      return { ...s, recurring: upsert(s.recurring, a.rule) }
    case 'deleteRecurring':
      return { ...s, recurring: s.recurring.filter((r) => r.id !== a.id) }
    case 'runRecurring': {
      const { txs, rules } = materializeRecurring(s.recurring, a.today, uid)
      if (!txs.length && rules.every((r, i) => r === s.recurring[i])) return s
      return { ...s, recurring: rules, transactions: [...s.transactions, ...txs] }
    }
    case 'upsertHolding':
      return { ...s, holdings: upsert(s.holdings, a.holding) }
    case 'deleteHolding':
      return { ...s, holdings: s.holdings.filter((h) => h.id !== a.id), trades: s.trades.filter((t) => t.holdingId !== a.id) }
    case 'addPrices': {
      const holdings = s.holdings.map((h) => {
        const pts = a.points.filter((p) => p.holdingId === h.id).map((p) => p.point)
        if (!pts.length) return h
        const days = new Set(pts.map((p) => p.date))
        return { ...h, prices: [...h.prices.filter((p) => !days.has(p.date)), ...pts].sort((x, y) => x.date.localeCompare(y.date)) }
      })
      return { ...s, holdings }
    }
    case 'upsertTrade':
      return { ...s, trades: upsert(s.trades, a.trade) }
    case 'deleteTrade':
      return { ...s, trades: s.trades.filter((t) => t.id !== a.id) }
    case 'setBudget': {
      const rest = s.budgets.filter((b) => b.category !== a.budget.category)
      return { ...s, budgets: [...rest, a.budget] }
    }
    case 'deleteBudget':
      return { ...s, budgets: s.budgets.filter((b) => b.category !== a.category) }
    case 'upsertGoal':
      return { ...s, goals: upsert(s.goals, a.goal) }
    case 'deleteGoal':
      return { ...s, goals: s.goals.filter((g) => g.id !== a.id) }
    case 'contribute':
      return { ...s, goals: s.goals.map((g) => (g.id === a.goalId ? { ...g, contributions: upsert(g.contributions, a.contribution) } : g)) }
    case 'deleteContribution':
      return { ...s, goals: s.goals.map((g) => (g.id === a.goalId ? { ...g, contributions: g.contributions.filter((c) => c.id !== a.id) } : g)) }
  }
}

export type StoredVault = Vault & { owner?: string }

/** Wipes every Finspace key from this browser (data, vault, sync and auth state excluded — auth is cleared by sign-out). */
export function wipeLocal() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('finspace:') && k !== 'finspace:auth') localStorage.removeItem(k)
  } catch { /* ignore */ }
}

export function readVault(): StoredVault | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    return raw ? (JSON.parse(raw) as StoredVault) : null
  } catch {
    return null
  }
}

function loadPlain(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? migrate(JSON.parse(raw)) : EMPTY
  } catch {
    return EMPTY
  }
}

// ─────────────────────────── Toasts (with undo) ───────────────────────────

export interface Toast {
  id: number
  message: string
  tone?: 'default' | 'success' | 'error'
  undo?: () => void
}

export interface SinceLastVisit {
  at: string
  change: number
  recurringAdded: number
}

interface Ctx {
  data: AppData
  dispatch: (a: Action) => void
  /** Run an action and offer an Undo toast that restores the previous state. */
  withUndo: (message: string, a: Action) => void
  toast: (message: string, tone?: Toast['tone']) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
  saveState: 'saved' | 'saving' | 'error'
  /** True until the data is decrypted with the encryption passphrase. */
  locked: boolean
  /** The encrypted vault on this device, if any, and which account owns it. */
  vaultOwner: string | null | undefined
  unlock: (passphrase: string, owner: string) => Promise<boolean>
  /** First device: create the key from a new passphrase and encrypt `data` (or whatever is loaded). */
  setupVault: (passphrase: string, owner: string, data?: AppData) => Promise<{ key: CryptoKey; salt: string }>
  /** New device: use a key already derived (from the cloud copy) and its decrypted data. */
  adoptVault: (key: { key: CryptoKey; salt: string }, owner: string, data: AppData) => Promise<void>
  changePassphrase: (next: string) => Promise<{ key: CryptoKey; salt: string }>
  getKey: () => { key: CryptoKey; salt: string } | null
  /** Removes all Finspace data from this device and locks. */
  wipeDevice: () => void
  lockNow: () => void
  since: SinceLastVisit | null
  dismissSince: () => void
}

const StoreContext = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const initialVault = useRef(readVault())
  // Data is always encrypted: nothing is usable until a key is set up or unlocked.
  const [locked, setLocked] = useState(true)
  const [vaultOwner, setVaultOwner] = useState<string | null | undefined>(initialVault.current ? initialVault.current.owner ?? null : undefined)
  // Legacy (pre-account) plaintext data is loaded so setupVault can encrypt it; it's never written again.
  const [data, dispatch] = useReducer(reducer, undefined, () => (initialVault.current ? EMPTY : loadPlain()))
  const [toasts, setToasts] = useState<Toast[]>([])
  const [saveState, setSaveState] = useState<Ctx['saveState']>('saved')
  const [since, setSince] = useState<SinceLastVisit | null>(null)
  const keyRef = useRef<{ key: CryptoKey; salt: string } | null>(null)
  const ownerRef = useRef<string | undefined>(initialVault.current?.owner)
  const dataRef = useRef(data)
  dataRef.current = data
  const nextId = useRef(1)
  const sessionStarted = useRef(false)

  setCurrency(data.settings.currency)
  setPrivacy(data.settings.privacy)
  registerCustomCategories(data.settings.customCategories)

  const writeVault = useCallback(async (d: AppData) => {
    const k = keyRef.current
    if (!k) return
    const v = await seal(k.key, k.salt, d)
    localStorage.setItem(VAULT_KEY, JSON.stringify({ ...v, owner: ownerRef.current }))
    localStorage.removeItem(KEY)
  }, [])

  // persist (debounced) — encrypted only; never written in plain text
  useEffect(() => {
    if (locked || !keyRef.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await writeVault(data)
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [data, locked, writeVault])

  // session start: add due recurring transactions, then work out what changed since last visit
  useEffect(() => {
    if (locked || sessionStarted.current || !data.settings.onboarded) return
    sessionStarted.current = true
    const today = todayISO()
    const cur = dataRef.current
    const next = reducer(cur, { type: 'runRecurring', today })
    const added = next.transactions.length - cur.transactions.length
    const now = netWorthAt(next, today)
    const lv = cur.settings.lastVisit
    if (lv && Date.now() - new Date(lv.at).getTime() > 6 * 36e5 && !cur.settings.sampleData) setSince({ at: lv.at, change: now - lv.netWorth, recurringAdded: added })
    else if (added > 0) setSince({ at: new Date().toISOString(), change: 0, recurringAdded: added })
    dispatch({ type: 'replace', data: { ...next, settings: { ...next.settings, lastVisit: { at: new Date().toISOString(), netWorth: now } } } })
  }, [locked, data.settings.onboarded])

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setToasts((ts) => [...ts.slice(-2), { ...t, id }])
      setTimeout(() => dismissToast(id), t.undo ? 7000 : t.tone === 'error' ? 6000 : 3500)
    },
    [dismissToast],
  )

  const toast = useCallback((message: string, tone?: Toast['tone']) => push({ message, tone }), [push])

  const withUndo = useCallback(
    (message: string, a: Action) => {
      const before = dataRef.current
      dispatch(a)
      push({ message, undo: () => dispatch({ type: 'replace', data: before }) })
    },
    [push],
  )

  const unlock = useCallback(async (passphrase: string, owner: string) => {
    const v = readVault()
    if (!v) return false
    if (lockoutState().until > Date.now()) return false
    try {
      const { key, payload } = await openVault(v, passphrase)
      keyRef.current = { key, salt: v.salt }
      // vaults from before accounts existed have no owner: they're claimed by the account that unlocks them
      ownerRef.current = v.owner ?? owner
      if (!v.owner) setVaultOwner(owner)
      dispatch({ type: 'replace', data: migrate(payload) })
      setLocked(false)
      clearFails()
      return true
    } catch {
      recordFail()
      return false
    }
  }, [])

  const setupVault = useCallback(async (passphrase: string, owner: string, d?: AppData) => {
    const k = await createVaultKey(passphrase)
    keyRef.current = k
    ownerRef.current = owner
    const next = d ?? dataRef.current
    await writeVault(next)
    if (d) dispatch({ type: 'replace', data: d })
    setVaultOwner(owner)
    setLocked(false)
    clearFails()
    return k
  }, [writeVault])

  const adoptVault = useCallback(async (key: { key: CryptoKey; salt: string }, owner: string, d: AppData) => {
    keyRef.current = key
    ownerRef.current = owner
    await writeVault(d)
    dispatch({ type: 'replace', data: d })
    setVaultOwner(owner)
    setLocked(false)
    clearFails()
  }, [writeVault])

  const changePassphrase = useCallback(async (next: string) => {
    const k = await createVaultKey(next)
    keyRef.current = k
    await writeVault(dataRef.current)
    return k
  }, [writeVault])

  const getKey = useCallback(() => keyRef.current, [])

  const wipeDevice = useCallback(() => {
    keyRef.current = null
    ownerRef.current = undefined
    sessionStarted.current = false
    wipeLocal()
    setVaultOwner(undefined)
    setLocked(true)
    dispatch({ type: 'replace', data: EMPTY })
  }, [])

  const lockNow = useCallback(() => {
    if (!keyRef.current) return
    keyRef.current = null
    sessionStarted.current = false
    setLocked(true)
    dispatch({ type: 'replace', data: EMPTY })
  }, [])

  // auto-lock after inactivity
  const autoLock = data.settings.autoLockMinutes ?? 5
  useEffect(() => {
    if (locked || !autoLock) return
    let last = Date.now()
    const bump = () => { last = Date.now() }
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const onHide = () => { if (document.visibilityState === 'hidden') last = Math.min(last, Date.now()) }
    document.addEventListener('visibilitychange', onHide)
    const t = setInterval(() => { if (Date.now() - last > autoLock * 60_000) lockNow() }, 15_000)
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump))
      document.removeEventListener('visibilitychange', onHide)
      clearInterval(t)
    }
  }, [locked, autoLock, lockNow])

  const value = useMemo(
    () => ({ data, dispatch, withUndo, toast, toasts, dismissToast, saveState, locked, vaultOwner, unlock, setupVault, adoptVault, changePassphrase, getKey, wipeDevice, lockNow, since, dismissSince: () => setSince(null) }),
    [data, withUndo, toast, toasts, dismissToast, saveState, locked, vaultOwner, unlock, setupVault, adoptVault, changePassphrase, getKey, wipeDevice, lockNow, since],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const c = useContext(StoreContext)
  if (!c) throw new Error('useStore outside provider')
  return c
}
