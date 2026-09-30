import { useEffect, useRef } from 'react'
import { EyeOff, Landmark, ShieldCheck } from 'lucide-react'

/* The visual half of the welcome screen: an engraved guilloché rosette, a floating stack of
   cards and a quietly animated net-worth line. Purely decorative — every number is illustrative,
   nothing here is the user's data. Motion follows the pointer on desktop and stops entirely
   when the person prefers reduced motion. */

function Rosette() {
  // Guilloché: many rotated ellipses, as engraved on banknotes and share certificates
  const rings = Array.from({ length: 36 }, (_, i) => i * 5)
  return (
    <svg className="sc-rosette" viewBox="-200 -200 400 400" aria-hidden>
      <defs>
        <radialGradient id="sc-fade" r="0.5">
          <stop offset="0.25" stopColor="#e6c98a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e6c98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="url(#sc-fade)" strokeWidth="0.6">
        {rings.map((r) => <ellipse key={r} rx="190" ry="72" transform={`rotate(${r})`} />)}
        {rings.map((r) => <ellipse key={`i${r}`} rx="110" ry="38" transform={`rotate(${r + 2.5})`} opacity="0.7" />)}
        <circle r="196" opacity="0.5" />
        <circle r="150" opacity="0.35" strokeDasharray="1 5" />
      </g>
    </svg>
  )
}

function Card({ className, name, kind, bank, amount, last4 }: { className: string; name: string; kind: string; bank: string; amount: string; last4: string }) {
  return (
    <div className={`sc-card ${className}`} aria-hidden>
      <div className="sc-card-sheen" />
      <div className="sc-card-top">
        <div>
          <div className="sc-card-bank">{bank}</div>
          <div className="sc-card-name">{name}</div>
        </div>
        <span className="sc-card-kind">{kind}</span>
      </div>
      <div className="sc-chip" />
      <div className="sc-card-foot">
        <div><div className="sc-card-l">Balance</div><div className="sc-card-v">{amount}</div></div>
        <div className="sc-card-digits">•••• {last4}</div>
      </div>
    </div>
  )
}

export function AuthShowcase() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
        el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
      })
    }
    const onLeave = () => { el.style.setProperty('--px', '0'); el.style.setProperty('--py', '0') }
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave) }
  }, [])

  return (
    <aside className="showcase" ref={ref} aria-label="What Finspace does">
      <div className="sc-stage">
        <Rosette />
        <div className="sc-orb" />
        <div className="sc-cards">
          <Card className="sc-c3" bank="Harbor" name="Travel Rewards" kind="Credit" amount="£2,654" last4="1177" />
          <Card className="sc-c2" bank="Meridian" name="Brokerage" kind="Invest" amount="£61,152" last4="3308" />
          <Card className="sc-c1" bank="Northwind" name="Reserve" kind="Current" amount="£26,298" last4="4821" />
        </div>
        <div className="sc-glass">
          <div className="sc-glass-l">Net worth · illustration</div>
          <div className="sc-glass-v">£248,390<span className="sc-up">+2.4%</span></div>
          <svg viewBox="0 0 200 48" className="sc-spark" aria-hidden>
            <defs>
              <linearGradient id="sc-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d4b26a" stopOpacity=".35" /><stop offset="1" stopColor="#d4b26a" stopOpacity="0" /></linearGradient>
            </defs>
            <path d="M0 40 C 20 38, 30 30, 48 32 S 80 22, 98 24 S 130 12, 150 15 S 182 6, 200 4 L200 48 L0 48Z" fill="url(#sc-area)" className="sc-area" />
            <path d="M0 40 C 20 38, 30 30, 48 32 S 80 22, 98 24 S 130 12, 150 15 S 182 6, 200 4" fill="none" stroke="#e6c98a" strokeWidth="2" strokeLinecap="round" className="sc-line" pathLength={1} />
          </svg>
        </div>
      </div>
      <div className="sc-copy">
        <div className="eyebrow sc-eyebrow">Private wealth cockpit</div>
        <p className="sc-headline">Every account, card and holding. <em>One quiet, private view.</em></p>
        <ul className="sc-points">
          <li><ShieldCheck size={15} /> Encrypted on your device</li>
          <li><Landmark size={15} /> No bank logins</li>
          <li><EyeOff size={15} /> No ads or tracking</li>
        </ul>
      </div>
    </aside>
  )
}
