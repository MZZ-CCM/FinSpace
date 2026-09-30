import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Info, Minus, Table2, X } from 'lucide-react'
import { addMonths, isPrivate, money, monthLabel, pct, todayISO } from '../lib/format'

// ─────────────────────── Overlay primitives ───────────────────────

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

function useFocusTrap(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, select, textarea, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return
      const f = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'))
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault()
        f[0].focus()
      }
    }
    el?.addEventListener('keydown', onKey)
    return () => {
      el?.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [ref])
}

export function Sheet(props: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEscape(props.onClose)
  useFocusTrap(ref)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <div className="sheet-head">
          <div>
            <h2>{props.title}</h2>
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={props.onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.footer && <div className="sheet-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog(props: { title: string; body: ReactNode; confirm: string; cancel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEscape(props.onClose)
  useFocusTrap(ref)
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <h2>{props.title}</h2>
        <p>{props.body}</p>
        <div className="actions">
          <button className="btn" onClick={props.onClose} data-autofocus>
            {props.cancel ?? 'Keep it'}
          </button>
          <button
            className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              props.onConfirm()
              props.onClose()
            }}
          >
            {props.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────── Numbers ───────────────────────

/** Counts up to the value on mount/change. Respects reduced motion. */
export function useCountUp(target: number, duration = 900) {
  const [v, setV] = useState(target)
  const from = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setV(target)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - p, 4)
      setV(a + (target - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = target
    }
  }, [target, duration])
  return v
}

export function AnimatedMoney({ value, sign, split }: { value: number; sign?: boolean; split?: boolean }) {
  const v = useCountUp(value)
  const s = money(v, { sign })
  if (isPrivate()) return <span className="num">{s}</span>
  if (!split) return <span className="num">{s}</span>
  const i = s.search(/[.,]\d{2}$/)
  if (i === -1) return <span className="num">{s}</span>
  return (
    <span className="num" aria-label={money(value, { sign })}>
      {s.slice(0, i)}
      <span className="cents">{s.slice(i)}</span>
    </span>
  )
}

/** Change indicator. `good` decides color: for spending, going up is bad. */
export function Delta({ value, format = 'pct', invert = false, title }: { value: number; format?: 'pct' | 'money'; invert?: boolean; title?: string }) {
  const flat = Math.abs(value) < (format === 'pct' ? 0.0005 : 0.005)
  const up = value > 0
  const good = invert ? !up : up
  const cls = flat ? 'flat' : good ? 'up' : 'down'
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta ${cls}`} title={title}>
      <Icon size={13} strokeWidth={2.5} aria-hidden />
      <span className="num">{format === 'pct' ? pct(value, { sign: true }) : money(value, { sign: true })}</span>
    </span>
  )
}

export function Signed({ value, className = '' }: { value: number; className?: string }) {
  const cls = value > 0.004 ? 'pos' : value < -0.004 ? 'neg' : ''
  return <span className={`num ${cls} ${className}`}>{money(value, { sign: true })}</span>
}

// ─────────────────────── Controls ───────────────────────

export function MonthSwitch({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = todayISO().slice(0, 7)
  return (
    <div className="month-switch" role="group" aria-label="Choose month">
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft size={18} />
      </button>
      <span className="label" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(addMonths(month, 1))} disabled={month >= current} aria-label="Next month">
        <ChevronRight size={18} />
      </button>
      {month !== current && (
        <button className="btn btn-sm" onClick={() => onChange(current)}>
          This month
        </button>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, error, children, optional }: { label: string; hint?: string; error?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className="field">
      <span>
        {label}
        {optional && <span className="muted"> · optional</span>}
      </span>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <div className="mt-16">{action}</div>}
    </div>
  )
}

/** Parse a user-typed amount like "1,234.50". Returns NaN when invalid. */
export function readAmount(s: string) {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? NaN : Math.round(n * 100) / 100
}

/** "How is this calculated?" — a keyboard- and touch-friendly disclosure (no hover needed). */
export function HowCalculated({ children, label = 'How is this worked out?' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="how">
      <button type="button" className="how-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} title={label}>
        <Info size={13} aria-hidden /> <span className="sr-only">{label}</span>
      </button>
      {open && <span id={id} role="note" className="how-body">{children}</span>}
    </span>
  )
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="tab-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Wraps a chart with a "Chart / Table" toggle so the numbers are always available as text. */
export function ChartFrame({ chart, table, caption }: { chart: ReactNode; table: { head: string[]; rows: (string | number)[][] }; caption: string }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <div className="chart-frame">
      <div className="chart-toggle">
        <button className="btn btn-ghost btn-sm" onClick={() => setAsTable(!asTable)} aria-pressed={asTable} title={asTable ? 'Show chart' : 'Show as table'}>
          {asTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
          <span className="hide-sm">{asTable ? 'Chart' : 'Table'}</span>
        </button>
      </div>
      {asTable ? (
        <div className="table-wrap" style={{ margin: 0, maxHeight: 320, overflowY: 'auto' }}>
          <table className="table">
            <caption className="sr-only">{caption}</caption>
            <thead><tr>{table.head.map((h, i) => <th key={h} className={i ? 'r' : ''}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'r num' : ''}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : chart}
    </div>
  )
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />
}

export function Progress({ ratio, tone = 'accent', label }: { ratio: number; tone?: 'accent' | 'ok' | 'warn' | 'over'; label: string }) {
  return (
    <div className="track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, ratio) * 100)}>
      <i className={tone} style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  )
}
