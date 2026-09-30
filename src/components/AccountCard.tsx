import { useEffect, useRef } from 'react'
import type { Account } from '../lib/types'
import { CARD_SKINS, isLiability, kindGroup, kindTag } from '../lib/meta'
import { money } from '../lib/format'
import { useStore } from '../lib/store'
import { cashBalanceAt, linkedHoldingsValue, toBase } from '../lib/calc'

/** What an account is worth, in the right currency, for display anywhere. */
export function useAccountFigures(account: Account) {
  const { data } = useStore()
  const native = cashBalanceAt(account, data.transactions)
  const holdings = linkedHoldingsValue(data, account.id)
  const liability = isLiability(account.kind)
  const foreign = account.currency !== data.settings.currency
  const nativeBase = toBase(data, native, account.currency)
  // Accounts holding investments are valued in the base currency (holdings are priced in it).
  const display = holdings > 0 ? (nativeBase ?? 0) + holdings : liability ? Math.max(0, -native) : native
  const displayCcy = holdings > 0 ? data.settings.currency : account.currency
  const converted = foreign && holdings === 0 && nativeBase !== null ? (liability ? Math.max(0, -nativeBase) : nativeBase) : null
  return { native, holdings, liability, foreign, display, displayCcy, converted, missingRate: foreign && nativeBase === null }
}

export function AccountCard({ account, onClick, pressed, preview, tilt = true, tabIndex }: { account: Account; onClick?: (e: React.MouseEvent) => void; pressed?: boolean; preview?: number; tilt?: boolean; tabIndex?: number }) {
  const ref = useRef<HTMLButtonElement>(null)
  const f = useAccountFigures(account)
  const skin = CARD_SKINS[account.skin] ?? CARD_SKINS.obsidian
  const display = preview ?? f.display
  const util = account.kind === 'credit' && account.creditLimit ? Math.min(1, display / account.creditLimit) : 0

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || !tilt || e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(px - 0.5) * 12}deg`)
    el.style.setProperty('--rx', `${(0.5 - py) * 10}deg`)
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
  }
  useEffect(() => {
    if (!tilt) onLeave()
  })
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--mx', '70%')
    el.style.setProperty('--my', '0%')
  }

  const label = f.liability ? 'Owed' : kindGroup(account.kind) === 'invest' ? 'Value' : 'Balance'

  return (
    <button
      ref={ref}
      className="fcard"
      style={{ '--a': skin.a, '--b': skin.b, '--glow': skin.glow } as React.CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
      aria-pressed={pressed}
      tabIndex={tabIndex}
      aria-label={`${account.name}, ${label.toLowerCase()} ${money(display, { currency: f.displayCcy })}. Open account.`}
      type="button"
    >
      <div className="fcard-top">
        <div>
          <div className="fcard-inst">{account.institution || kindTag(account.kind)}</div>
          <div className="fcard-name">{account.name}</div>
        </div>
        <span className="fcard-kind">{kindTag(account.kind)}{f.foreign ? ` · ${account.currency}` : ''}</span>
      </div>
      {['checking', 'savings', 'debit', 'credit', 'business'].includes(account.kind) && <div className="chip-ic" aria-hidden />}
      <div className="fcard-bal">
        <div className="l">{label}</div>
        <div className="v num">{money(display, { currency: f.displayCcy })}</div>
        {f.converted !== null && <div style={{ fontSize: 12, opacity: 0.8 }} className="num">≈ {money(f.converted)}</div>}
        {f.missingRate && <div style={{ fontSize: 12, opacity: 0.8 }}>No exchange rate — not in totals</div>}
        {account.kind === 'credit' && account.creditLimit ? (
          <div className="fcard-util" title={`${Math.round(util * 100)}% of limit used`}>
            <i style={{ width: `${util * 100}%` }} />
          </div>
        ) : null}
      </div>
      <div className="fcard-foot">
        <span className="digits">{account.last4 ? `•••• ${account.last4}` : f.holdings > 0 ? 'Includes investments' : ''}</span>
        {account.kind === 'credit' && account.creditLimit ? <span className="num">{Math.round(util * 100)}% of {money(account.creditLimit, { cents: false, currency: account.currency })}</span> : null}
      </div>
    </button>
  )
}
