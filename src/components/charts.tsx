import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { money, moneyCompact, monthLabel, pct } from '../lib/format'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** "Nice" axis ticks */
function ticks(min: number, max: number, count = 4) {
  if (max === min) max = min + 1
  const span = max - min
  const step0 = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

/** Bar path with 4px rounded data-end, square at the baseline. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0)
  const r = Math.min(4, w / 2, h)
  if (y1 <= y0) {
    // grows up
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="tooltip" style={{ left: x, top: y }} role="status">
      {children}
    </div>
  )
}

const PAD = { l: 52, r: 8, t: 12, b: 28 }

// ─────────────────────── Money in vs out ───────────────────────

export function FlowBars({ data, height = 260, selected, onSelect }: { data: { month: string; income: number; expense: number; net: number }[]; height?: number; selected?: string; onSelect?: (m: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]))
  const t = ticks(0, max)
  const top = t[t.length - 1]
  const iw = w - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const band = iw / data.length
  const bw = Math.max(4, Math.min(18, band * 0.28))
  const y = (v: number) => PAD.t + ih - (v / top) * ih
  const narrow = w < 520

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg height={height} role="img" aria-label="Money in and money out by month">
        <g className="axis">
          {t.map((v) => (
            <g key={v}>
              <line className={v === 0 ? 'baseline' : 'gridline'} x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} />
              <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end">
                {moneyCompact(v)}
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          const cx = PAD.l + band * i + band / 2
          const isSel = selected === d.month
          const dim = (hover !== null && hover !== i) || (hover === null && selected && !isSel)
          return (
            <g key={d.month} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity .2s' }}>
              {isSel && <rect x={PAD.l + band * i + 2} y={PAD.t} width={band - 4} height={ih} rx={8} fill="var(--accent-soft)" />}
              <path className="bar-anim" style={{ animationDelay: `${i * 30}ms` }} d={barPath(cx - bw - 1, bw, y(0), y(d.income))} fill="var(--in)" />
              <path className="bar-anim" style={{ animationDelay: `${i * 30 + 60}ms` }} d={barPath(cx + 1, bw, y(0), y(d.expense))} fill="var(--out)" />
              {(!narrow || i % 2 === data.length % 2) && (
                <text className="axis" x={cx} y={height - 8} textAnchor="middle" fill={isSel ? 'var(--text-1)' : 'var(--text-3)'} fontSize={11} fontWeight={isSel ? 600 : 400}>
                  {monthLabel(d.month, 'short')}
                </text>
              )}
              <rect
                className="hit"
                x={PAD.l + band * i}
                y={PAD.t}
                width={band}
                height={ih + PAD.b}
                onMouseEnter={() => setHover(i)}
                onClick={() => onSelect?.(d.month)}
                style={{ cursor: onSelect ? 'pointer' : 'crosshair' }}
              >
                <title>{`${monthLabel(d.month)}: in ${money(d.income)}, out ${money(d.expense)}`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.l + band * hover + band / 2} y={y(Math.max(data[hover].income, data[hover].expense))}>
          <div className="t-title">{monthLabel(data[hover].month)}</div>
          <div className="t-row"><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--in)' }} />Money in<b className="num">{money(data[hover].income)}</b></div>
          <div className="t-row"><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--out)' }} />Money out<b className="num">{money(data[hover].expense)}</b></div>
          <div className="t-row" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>Net<b className={`num ${data[hover].net >= 0 ? 'pos' : 'neg'}`}>{money(data[hover].net, { sign: true })}</b></div>
          {onSelect && <div className="muted" style={{ marginTop: 6 }}>Click to view this month</div>}
        </Tooltip>
      )}
    </div>
  )
}

// ─────────────────────── Area line (net worth, value) ───────────────────────

export function AreaLine({ data, height = 220, label, color = 'var(--accent)', compact }: { data: { key: string; label: string; value: number; extra?: { label: string; value: number }[] }[]; height?: number; label: string; color?: string; compact?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gid = useMemo(() => 'g' + Math.random().toString(36).slice(2, 8), [])
  const pad = compact ? { l: 0, r: 0, t: 8, b: 4 } : PAD
  const vals = data.map((d) => d.value)
  const lo0 = Math.min(...vals)
  const hi0 = Math.max(...vals)
  const t = ticks(lo0 - (hi0 - lo0) * 0.15, hi0 + (hi0 - lo0) * 0.05)
  const lo = compact ? lo0 - (hi0 - lo0) * 0.2 : t[0]
  const hi = compact ? hi0 : t[t.length - 1]
  const iw = w - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const x = (i: number) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  // smooth path (monotone-ish cardinal)
  const pts = data.map((d, i) => [x(i), y(d.value)] as const)
  let line = ''
  pts.forEach(([px, py], i) => {
    if (i === 0) line += `M${px},${py}`
    else {
      const [x0, y0] = pts[i - 1]
      const cx = (x0 + px) / 2
      line += ` C${cx},${y0} ${cx},${py} ${px},${py}`
    }
  })
  const area = `${line} L${pts[pts.length - 1]?.[0] ?? 0},${pad.t + ih} L${pts[0]?.[0] ?? 0},${pad.t + ih} Z`

  const onMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const px = e.clientX - r.left
    const i = Math.round(((px - pad.l) / iw) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  if (!data.length) return null

  return (
    <div className="chart" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg height={height} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.32} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {!compact && (
          <g className="axis">
            {t.map((v) => (
              <g key={v}>
                <line className="gridline" x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} />
                <text x={pad.l - 10} y={y(v) + 4} textAnchor="end">{moneyCompact(v)}</text>
              </g>
            ))}
            {data.map((d, i) => (w > 520 || i % 2 === (data.length - 1) % 2) && (
              <text key={d.key} x={x(i)} y={height - 8} textAnchor="middle">{d.label}</text>
            ))}
          </g>
        )}
        <path d={area} fill={`url(#${gid})`} className="fade-anim" />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" className="line-anim" />
        {hover !== null && (
          <g>
            <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        )}
        {hover === null && pts.length > 0 && !compact && (
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
        )}
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={y(data[hover].value)}>
          <div className="t-title">{data[hover].label}</div>
          <div className="t-row">{label}<b className="num">{money(data[hover].value)}</b></div>
          {data[hover].extra?.map((e) => <div key={e.label} className="t-row">{e.label}<b className="num">{money(e.value)}</b></div>)}
        </Tooltip>
      )}
    </div>
  )
}

// ─────────────────────── Gain / loss bars ───────────────────────

export function PLBars({ data, height = 220 }: { data: { month: string; pl: number }[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const vals = data.map((d) => d.pl)
  const t = ticks(Math.min(0, ...vals), Math.max(0, ...vals))
  const lo = t[0]
  const hi = t[t.length - 1]
  const iw = w - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const band = iw / data.length
  const bw = Math.max(6, Math.min(28, band * 0.5))
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg height={height} role="img" aria-label="Investment gain or loss by month">
        <g className="axis">
          {t.map((v) => (
            <g key={v}>
              <line className={v === 0 ? 'baseline' : 'gridline'} x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} />
              <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end">{moneyCompact(v)}</text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          const cx = PAD.l + band * i + band / 2
          return (
            <g key={d.month} opacity={hover !== null && hover !== i ? 0.45 : 1}>
              <path className="bar-anim" style={{ animationDelay: `${i * 35}ms`, transformOrigin: d.pl >= 0 ? 'bottom' : 'top' }} d={barPath(cx - bw / 2, bw, y(0), y(d.pl))} fill={d.pl >= 0 ? 'var(--gain)' : 'var(--loss)'} />
              {(w > 520 || i % 2 === (data.length - 1) % 2) && (
                <text className="axis" x={cx} y={height - 8} textAnchor="middle" fill="var(--text-3)" fontSize={11}>{monthLabel(d.month, 'short')}</text>
              )}
              <rect className="hit" x={PAD.l + band * i} y={PAD.t} width={band} height={ih} onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.l + band * hover + band / 2} y={y(Math.max(0, data[hover].pl))}>
          <div className="t-title">{monthLabel(data[hover].month)}</div>
          <div className="t-row">{data[hover].pl >= 0 ? '▲ Gain' : '▼ Loss'}<b className={`num ${data[hover].pl >= 0 ? 'pos' : 'neg'}`}>{money(data[hover].pl, { sign: true })}</b></div>
        </Tooltip>
      )}
    </div>
  )
}

// ─────────────────────── Sparkline ───────────────────────

export function Sparkline({ values, width = 96, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={up ? 'var(--gain)' : 'var(--loss)'} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─────────────────────── Allocation bar ───────────────────────

/** Single stacked bar of portfolio weights, using one sequential hue by rank (magnitude, not identity). */
export function AllocationBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const [hover, setHover] = useState<number | null>(null)
  const shades = ['#d4b26a', '#b8892c', '#8c6a2f', '#6b5226', '#4f3d1e', '#3a2d17']
  useEffect(() => setHover(null), [items.length])
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 12, borderRadius: 6, overflow: 'hidden' }} onMouseLeave={() => setHover(null)}>
        {items.map((it, i) => (
          <div
            key={it.label}
            title={`${it.label}: ${money(it.value)} (${((it.value / total) * 100).toFixed(1)}%)`}
            onMouseEnter={() => setHover(i)}
            style={{ flex: it.value / total, background: shades[Math.min(i, shades.length - 1)], opacity: hover !== null && hover !== i ? 0.4 : 1, transition: 'opacity .2s', minWidth: 3 }}
          />
        ))}
      </div>
      <div className="legend mt-16">
        {items.map((it, i) => (
          <span key={it.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: shades[Math.min(i, shades.length - 1)] }} />
            {it.label}
            <b className="num" style={{ color: 'var(--text-1)' }}>{((it.value / total) * 100).toFixed(1)}%</b>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────── Range tabs ───────────────────────

export function RangeTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="range-tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

// ─────────────────────── Gain/loss heatmap ───────────────────────

/** Diverging blue↔red with a neutral midpoint; every cell also prints its signed value, so colour is never the only cue. */
export function Heatmap({ rows, months, onRow }: { rows: { id: string; label: string; cells: { month: string; held: boolean; pct: number; pl: number }[] }[]; months: string[]; onRow?: (id: string) => void }) {
  const max = Math.max(0.02, ...rows.flatMap((r) => r.cells.filter((c) => c.held).map((c) => Math.abs(c.pct))))
  const color = (v: number) => {
    const t = Math.min(1, Math.abs(v) / max)
    const hue = v >= 0 ? 'var(--in)' : 'var(--loss)'
    return `color-mix(in srgb, ${hue} ${Math.round(12 + t * 70)}%, var(--surface-2))`
  }
  return (
    <div className="table-wrap" style={{ margin: 0 }}>
      <div className="heat" style={{ gridTemplateColumns: `80px repeat(${months.length}, minmax(44px, 1fr))`, minWidth: 80 + months.length * 48 }} role="table" aria-label="Monthly return by holding">
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'contents' }} role="row">
            <button className="rowlabel link-btn" style={{ color: 'var(--text-1)' }} onClick={() => onRow?.(r.id)} role="rowheader">{r.label}</button>
            {r.cells.map((c) => (
              <div key={c.month} role="cell" className="cell" style={{ background: c.held ? color(c.pct) : 'transparent', color: c.held ? 'var(--text-1)' : 'var(--text-3)' }} title={c.held ? `${r.label} · ${monthLabel(c.month)}: ${pct(c.pct, { sign: true })} (${money(c.pl, { sign: true })})` : `${r.label} · ${monthLabel(c.month)}: not held`}>
                {c.held ? `${c.pct >= 0 ? '+' : '−'}${Math.abs(c.pct * 100).toFixed(Math.abs(c.pct) < 0.1 ? 1 : 0)}` : '·'}
              </div>
            ))}
          </div>
        ))}
        <div />
        {months.map((m) => <div key={m} className="collabel">{monthLabel(m, 'short')}</div>)}
      </div>
    </div>
  )
}

// ─────────────────────── Diverging horizontal bars ───────────────────────

export function DivergingBars({ items, onClick }: { items: { id: string; label: string; sub?: string; value: number }[]; onClick?: (id: string) => void }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)))
  return (
    <div className="form-stack" style={{ gap: 10 }}>
      {items.map((it, i) => (
        <button key={it.id} onClick={() => onClick?.(it.id)} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px', alignItems: 'center', gap: 0, background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left' }} title={`${it.label}: ${money(it.value, { sign: true })}`}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{it.label}</span>
          <span style={{ display: 'flex', justifyContent: 'flex-end', borderRight: '1px solid var(--border-strong)', height: 18 }}>
            {it.value < 0 && <i className="bar-h" style={{ width: `${(Math.abs(it.value) / max) * 100}%`, background: 'var(--loss)', borderRadius: '4px 0 0 4px', animationDelay: `${i * 40}ms` }} />}
          </span>
          <span style={{ display: 'flex', height: 18 }}>
            {it.value >= 0 && <i className="bar-h" style={{ width: `${(it.value / max) * 100}%`, background: 'var(--gain)', borderRadius: '0 4px 4px 0', animationDelay: `${i * 40}ms` }} />}
          </span>
          <span className={`num ${it.value >= 0 ? 'pos' : 'neg'}`} style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{money(it.value, { sign: true, cents: false })}</span>
        </button>
      ))}
    </div>
  )
}
