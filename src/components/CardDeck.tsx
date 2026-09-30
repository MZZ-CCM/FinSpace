import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, FileUp, Plus, RefreshCw } from 'lucide-react'
import type { Account } from '../lib/types'
import { CARD_SKINS, kindLabel } from '../lib/meta'
import { money, monthLabel, shortDate, todayISO } from '../lib/format'
import { flowsForAccount, lastActivity } from '../lib/calc'
import { useStore } from '../lib/store'
import { useUI } from '../lib/ui'
import { AccountCard, useAccountFigures } from './AccountCard'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A swipeable 3D card deck.
 * Drag or flick (touch / mouse / pen), two-finger swipe on a trackpad, arrow keys, or the dots.
 * Tap the front card to open it; tap a side card to bring it forward.
 */
export function CardDeck({ accounts, onOpen }: { accounts: Account[]; onOpen: (a: Account) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [active, setActive] = useState(0)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const g = useRef({ x0: 0, y0: 0, id: -1, moved: false, axis: '' as '' | 'x' | 'y', idx: -1, samples: [] as { t: number; x: number }[], touch: false })
  const wheel = useRef({ acc: 0, lock: 0 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (active > accounts.length - 1) setActive(Math.max(0, accounts.length - 1))
  }, [accounts.length, active])

  const cw = Math.min(360, width * (width < 520 ? 0.8 : 0.42))
  const ch = cw / 1.586
  const spacing = width < 520 ? cw * 0.86 : cw * 0.6
  const last = accounts.length - 1

  const goTo = useCallback((i: number, haptic = false) => {
    const n = clamp(i, 0, last)
    setActive((cur) => {
      if (n !== cur && haptic) navigator.vibrate?.(8)
      return n
    })
  }, [last])

  // ── pointer: drag & flick ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const idx = Number((e.target as HTMLElement).closest<HTMLElement>('[data-idx]')?.dataset.idx ?? -1)
    g.current = { x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false, axis: '', idx, samples: [{ t: e.timeStamp, x: e.clientX }], touch: e.pointerType !== 'mouse' }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current
    if (s.id !== e.pointerId) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (!s.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (s.axis === 'y') { s.id = -1; return } // let the page scroll
      s.moved = true
      setDragging(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    // rubber-band past either end
    const atEdge = (active === 0 && dx > 0) || (active === last && dx < 0)
    setDrag(atEdge ? dx * 0.3 : dx)
    s.samples.push({ t: e.timeStamp, x: e.clientX })
    if (s.samples.length > 6) s.samples.shift()
  }
  const endDrag = (e: React.PointerEvent) => {
    const s = g.current
    if (s.id !== e.pointerId && !s.moved) {
      g.current.id = -1
      return
    }
    if (!s.moved) {
      // a tap
      if (s.idx >= 0) {
        if (s.idx === active) onOpen(accounts[s.idx])
        else goTo(s.idx)
      }
      g.current.id = -1
      return
    }
    const a = s.samples[0]
    const b = s.samples[s.samples.length - 1]
    const v = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0 // px per ms
    const throwPx = clamp(v * 150, -spacing * 1.1, spacing * 1.1) // momentum: at most ~one extra card
    let steps = Math.round(-(drag + throwPx) / spacing)
    if (steps === 0 && Math.abs(drag) > spacing * 0.18) steps = drag < 0 ? 1 : -1
    steps = clamp(steps, -2, 2)
    goTo(active + steps, s.touch)
    setDrag(0)
    setDragging(false)
    g.current.id = -1
    // swallow the click that follows a drag
    const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
  }

  // ── trackpad horizontal swipe ──
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    const w = wheel.current
    const now = performance.now()
    if (now < w.lock) return
    w.acc += e.deltaX
    if (Math.abs(w.acc) > 40) {
      goTo(active + (w.acc > 0 ? 1 : -1))
      w.acc = 0
      w.lock = now + 380
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1) }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0) }
    else if (e.key === 'End') { e.preventDefault(); goTo(last) }
  }

  if (!accounts.length) return null
  const rm = reduced()
  const progress = active - drag / spacing // fractional position while dragging
  const cur = accounts[clamp(Math.round(progress), 0, last)]
  const glow = (CARD_SKINS[cur.skin] ?? CARD_SKINS.obsidian).glow

  return (
    <div className="deck-wrap">
      <div
        ref={wrapRef}
        className={`deck ${dragging ? 'dragging' : ''}`}
        style={{ height: ch + 72, '--cw': `${cw}px`, '--glow': glow } as React.CSSProperties}
        role="region"
        aria-roledescription="carousel"
        aria-label="Your cards and accounts — swipe or use arrow keys"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div className="deck-glow" aria-hidden />
        <div className="deck-shadow" aria-hidden style={{ width: cw * 0.86 }} />
        {accounts.map((a, i) => {
          const d = i - progress
          const ad = Math.abs(d)
          if (ad > 4.5) return null
          const x = Math.sign(d) * (ad <= 1 ? ad * spacing : spacing + (ad - 1) * spacing * 0.4)
          const z = -ad * 170
          const ry = rm ? 0 : clamp(-d * 24, -48, 48)
          const scale = 1 - Math.min(ad, 3) * 0.05
          const bright = 1 - Math.min(ad, 2.5) * 0.24
          const lift = ad < 1 ? (1 - ad) * -6 : 0
          return (
            <div
              key={a.id}
              data-idx={i}
              className="deck-card"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${accounts.length}: ${a.name}`}
              aria-hidden={i !== active}
              style={{
                transform: `translate3d(${x}px, ${lift}px, ${z}px) rotateY(${ry}deg) scale(${scale})`,
                zIndex: 1000 - Math.round(ad * 100),
                filter: `brightness(${bright}) saturate(${1 - Math.min(ad, 2) * 0.15})`,
                opacity: ad > 3.6 ? 0 : 1,
                transition: dragging ? 'none' : rm ? 'transform 160ms ease, opacity 160ms' : 'transform 640ms cubic-bezier(.16,1,.3,1), filter 500ms ease, opacity 400ms ease',
                pointerEvents: ad > 2.5 ? 'none' : undefined,
              }}
            >
              <AccountCard account={a} tilt={i === active && !dragging} tabIndex={i === active ? 0 : -1} onClick={(e) => { if (e.detail === 0) onOpen(a) }} />
            </div>
          )
        })}
        {accounts.length > 1 && (
          <>
            <button className="deck-nav prev" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous card"><ChevronLeft size={20} /></button>
            <button className="deck-nav next" onClick={() => goTo(active + 1)} disabled={active === last} aria-label="Next card"><ChevronRight size={20} /></button>
          </>
        )}
      </div>
      {accounts.length > 1 && (
        <div className="deck-dots" role="tablist" aria-label="Choose card">
          {accounts.map((a, i) => (
            <button key={a.id} role="tab" aria-selected={i === active} aria-label={a.name} className={i === active ? 'on' : ''} onClick={() => goTo(i)} />
          ))}
          <span className="deck-count num" aria-live="polite">{active + 1} / {accounts.length}</span>
        </div>
      )}
      <DeckInfo key={accounts[active].id} account={accounts[active]} onOpen={() => onOpen(accounts[active])} />
    </div>
  )
}

function DeckInfo({ account, onOpen }: { account: Account; onOpen: () => void }) {
  const { data } = useStore()
  const { open } = useUI()
  const f = useAccountFigures(account)
  const m = todayISO().slice(0, 7)
  const fl = flowsForAccount(data.transactions, account.id, m)
  return (
    <div className="deck-info">
      <div className="deck-info-main">
        <div className="eyebrow">{kindLabel(account.kind)}{account.institution ? ` · ${account.institution}` : ''}</div>
        <div className="deck-info-name">{account.name}</div>
        <div className="deck-info-stats">
          <span><span className="muted">{f.liability ? 'Owed' : 'Balance'}</span> <b className="num">{money(f.display, { currency: f.displayCcy })}</b></span>
          <span><span className="muted">In · {monthLabel(m, 'short')}</span> <b className="num">{money(fl.inflow, { cents: false, currency: account.currency })}</b></span>
          <span><span className="muted">Out</span> <b className="num">{money(fl.outflow, { cents: false, currency: account.currency })}</b></span>
          <span><span className="muted">Last activity</span> <b>{shortDate(lastActivity(data, account.id) || account.openingDate)}</b></span>
        </div>
      </div>
      <div className="deck-info-actions">
        <button className="btn btn-sm" onClick={() => open({ kind: 'import', accountId: account.id })}><FileUp size={14} /> Import statement</button>
        <button className="btn btn-sm" onClick={() => open({ kind: 'balance', accountId: account.id })}><RefreshCw size={14} /> Update balance</button>
        <button className="btn btn-sm" onClick={() => open({ kind: 'tx', defaults: { accountId: account.id } })}><Plus size={14} /> Add</button>
        <button className="btn btn-sm btn-primary" onClick={onOpen}>Open <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}
