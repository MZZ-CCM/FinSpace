import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Account, Goal, Holding, RecurringRule, Trade, Transaction, TxType } from './types'
import { todayISO } from './format'

export type MoneyTab = 'activity' | 'recurring' | 'analysis'

export type Route =
  | { page: 'overview' }
  | { page: 'accounts'; id?: string }
  | { page: 'money'; tab?: MoneyTab; account?: string; category?: string; type?: TxType; month?: string; tag?: string }
  | { page: 'investments'; id?: string }
  | { page: 'budgets' }
  | { page: 'goals'; id?: string }
  | { page: 'insights' }
  | { page: 'reports' }
  | { page: 'settings' }
  | { page: 'privacy' }

export type SheetState =
  | { kind: 'tx'; tx?: Transaction; defaults?: Partial<Transaction> }
  | { kind: 'account'; account?: Account }
  | { kind: 'balance'; accountId: string }
  | { kind: 'holding'; holding?: Holding }
  | { kind: 'trade'; holdingId: string; trade?: Trade; kindHint?: Trade['kind'] }
  | { kind: 'prices' }
  | { kind: 'import'; accountId?: string }
  | { kind: 'budget'; category?: string }
  | { kind: 'overallBudget' }
  | { kind: 'goal'; goal?: Goal }
  | { kind: 'contribute'; goalId: string }
  | { kind: 'recurring'; rule?: RecurringRule }
  | { kind: 'customize' }
  | { kind: 'more' }
  | null

// Only IDs and filter names go in the URL — never amounts or other financial data.
function parseHash(): Route {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  const [path, query = ''] = h.split('?')
  const [page, id] = path.split('/')
  const q = new URLSearchParams(query)
  const g = (k: string) => q.get(k) ?? undefined
  switch (page) {
    case 'accounts':
    case 'investments':
    case 'goals':
      return { page, id }
    case 'transactions':
    case 'money':
      return { page: 'money', tab: (id as MoneyTab) || undefined, account: g('account'), category: g('category'), type: g('type') as TxType | undefined, month: g('month'), tag: g('tag') }
    case 'budgets':
    case 'insights':
    case 'reports':
    case 'settings':
    case 'privacy':
      return { page }
    default:
      return { page: 'overview' }
  }
}

export function routeHref(r: Route) {
  switch (r.page) {
    case 'overview':
      return '#/'
    case 'accounts':
    case 'investments':
    case 'goals':
      return `#/${r.page}${r.id ? '/' + r.id : ''}`
    case 'money': {
      const q = new URLSearchParams()
      for (const k of ['account', 'category', 'type', 'month', 'tag'] as const) if (r[k]) q.set(k, r[k]!)
      const s = q.toString()
      return `#/money${r.tab && r.tab !== 'activity' ? '/' + r.tab : ''}${s ? '?' + s : ''}`
    }
    default:
      return `#/${r.page}`
  }
}

interface UICtx {
  route: Route
  go: (r: Route) => void
  month: string
  setMonth: (m: string) => void
  sheet: SheetState
  open: (s: SheetState) => void
  close: () => void
  paletteOpen: boolean
  setPaletteOpen: (b: boolean) => void
}

const C = createContext<UICtx | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash)
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [sheet, setSheet] = useState<SheetState>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const h = () => {
      setRoute(parseHash())
      setSheet((s) => (s?.kind === 'more' ? null : s))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const go = useCallback((r: Route) => {
    location.hash = routeHref(r)
  }, [])
  const close = useCallback(() => setSheet(null), [])

  const value = useMemo(
    () => ({ route, go, month, setMonth, sheet, open: setSheet, close, paletteOpen, setPaletteOpen }),
    [route, go, month, sheet, close, paletteOpen],
  )
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useUI() {
  const c = useContext(C)
  if (!c) throw new Error('useUI outside provider')
  return c
}
