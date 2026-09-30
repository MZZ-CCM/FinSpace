/**
 * Account state, encrypted cloud storage, and the sign-in / unlock gate.
 *
 * Security model
 *  • Everyone signs in (Supabase Auth, email confirmation required) — no anonymous use.
 *  • All data is encrypted in the browser with the user's encryption passphrase (AES-256-GCM,
 *    PBKDF2-SHA256). The same key encrypts the copy on the device and the copy in the cloud.
 *    Neither the passphrase nor readable data ever reaches the server.
 *  • Encrypted data on a device is bound to one account; another account can't open it.
 *  • Row Level Security: each account can only touch its own row.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { Cloud, CloudOff, HardDrive, KeyRound, Lock, LogOut, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { lockoutState, useStore } from '../lib/store'
import { migrate, migrateWithReport } from '../lib/migrate'
import { dateLabel, sinceLabel } from '../lib/format'
import { cloudConfigured, currentUser, deleteAccount, deleteVault, fetchVault, onAuthChange, pushVault, sendReset, signIn, signOut, signUp, updatePassword } from '../lib/cloud'
import { decryptSnapshot, encryptSnapshot, type EncryptedFile } from '../lib/sync'
import { openWithKey } from '../lib/vault'
import { AuthShowcase } from './AuthShowcase'
import { Field } from './ui'
import type { AppData } from '../lib/types'

// ─────────────── account state (module singleton) ───────────────

interface CloudState {
  user: User | null
  ready: boolean
  offline: boolean
  recovery: boolean
  status: 'idle' | 'saving' | 'error' | 'conflict'
  error?: string
  lastSavedAt: string | null
  /** A newer cloud copy (or one encrypted with a changed passphrase) waiting for the user's decision. */
  pending: { file: EncryptedFile; payload: unknown | null } | null
}
let st: CloudState = { user: null, ready: false, offline: false, recovery: false, status: 'idle', lastSavedAt: null, pending: null }
const subs = new Set<() => void>()
const set = (p: Partial<CloudState>) => { st = { ...st, ...p }; subs.forEach((f) => f()) }
export const useCloud = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => st)

const SEEN = 'finspace:cloudSeen'
const seen = () => { try { return localStorage.getItem(SEEN) } catch { return null } }
const setSeen = (v: string) => { try { localStorage.setItem(SEEN, v) } catch { /* ignore */ } }

/** Re-checks the session every time the gate appears, so a sign-out or expiry elsewhere is never missed. */
function startAuth() {
  if (!cloudConfigured()) { set({ ready: true }); return }
  const giveUp = setTimeout(() => set({ ready: true, offline: !navigator.onLine }), 8000)
  currentUser()
    .then((user) => set({ user, ready: true }))
    .catch(() => set({ ready: true, offline: true }))
    .finally(() => clearTimeout(giveUp))
  subscribeAuth()
}

let subscribed = false
function subscribeAuth() {
  if (subscribed) return
  subscribed = true
  onAuthChange((event, user) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true })
    set({ user, ready: true })
  }).catch(() => undefined)
}

async function push(data: AppData, key: { key: CryptoKey; salt: string } | null) {
  if (!st.user || !key || data.settings.storage === 'local') return 'skipped' as const
  set({ status: 'saving' })
  try {
    const snap = await encryptSnapshot(data, key)
    const r = await pushVault(snap, st.user.id, st.lastSavedAt ?? seen())
    if (r === 'conflict') { set({ status: 'conflict' }); return r }
    setSeen(snap.savedAt)
    set({ status: 'idle', error: undefined, lastSavedAt: snap.savedAt })
    return r
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
    return 'error' as const
  }
}

/** Compare the cloud copy with this device after unlocking; queue a decision if they differ. */
async function reconcile(data: AppData, key: { key: CryptoKey; salt: string }) {
  if (!st.user || data.settings.storage === 'local') return
  try {
    const file = await fetchVault()
    if (!file) { set({ lastSavedAt: null }); await push(data, key); return }
    if (file.savedAt === seen()) { set({ lastSavedAt: file.savedAt }); return }
    let payload: unknown | null = null
    try { payload = await openWithKey(file, key.key) } catch { payload = null } // passphrase changed on another device
    set({ pending: { file, payload } })
  } catch (e) {
    set({ status: 'error', error: (e as Error).message })
  }
}

// ─────────────── background writer + decision dialogs (mounted in the app) ───────────────

export function CloudAutoWriter() {
  const { data, locked, getKey, adoptVault, withUndo, toast } = useStore()
  const c = useCloud()
  const last = useRef<AppData | null>(null)
  const reconciled = useRef(false)
  const [newPass, setNewPass] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (locked || !c.user) { reconciled.current = false; last.current = null; return }
    if (!reconciled.current) {
      reconciled.current = true
      last.current = data
      const k = getKey()
      if (k) reconcile(data, k)
    }
  }, [locked, c.user, data, getKey])

  useEffect(() => {
    if (locked || !c.user || c.pending || c.status === 'conflict' || data.settings.storage === 'local') return
    if (last.current === data) return
    const t = setTimeout(() => { last.current = data; push(data, getKey()) }, 2500)
    return () => clearTimeout(t)
  }, [data, locked, c.user, c.pending, c.status, getKey])

  if (!c.pending || locked || !c.user) return null
  const p = c.pending

  if (p.payload === null) {
    return (
      <div className="overlay center">
        <form className="dialog" role="alertdialog" aria-modal="true" aria-label="Enter your new encryption passphrase" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            const { key, payload } = await decryptSnapshot(p.file, newPass)
            await adoptVault(key, c.user!.id, migrate(payload))
            setSeen(p.file.savedAt)
            set({ pending: null, status: 'idle', lastSavedAt: p.file.savedAt })
            setNewPass('')
            toast('Unlocked with your new passphrase and loaded the latest data', 'success')
          } catch { toast('That passphrase doesn’t open your cloud data.', 'error') }
          setBusy(false)
        }}>
          <h2>Your encryption passphrase was changed</h2>
          <p>Your cloud data was saved {sinceLabel(p.file.savedAt)} on {p.file.device} with a different passphrase. Enter the new one to load it. Changes made on this device since then won’t be kept.</p>
          <input className="input" type="password" autoFocus autoComplete="current-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="New encryption passphrase" aria-label="New encryption passphrase" />
          <div className="actions mt-16"><button className="btn btn-primary" disabled={!newPass || busy}>{busy ? 'Opening…' : 'Load latest data'}</button></div>
        </form>
      </div>
    )
  }

  return (
    <div className="overlay center">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Choose which version to keep">
        <h2>Which version do you want to keep?</h2>
        <p>Your cloud copy was saved {dateLabel(p.file.savedAt.slice(0, 10))} ({sinceLabel(p.file.savedAt)}) on {p.file.device}, and differs from this device. Load it here, or keep this device’s data and replace the cloud copy.</p>
        <div className="actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true)
            set({ pending: null, status: 'idle', lastSavedAt: p.file.savedAt })
            await push(data, getKey())
            setBusy(false)
            toast('Kept this device’s data and updated the cloud copy', 'success')
          }}>Keep this device’s data</button>
          <button className="btn btn-primary" autoFocus disabled={busy} onClick={() => {
            const { data: m, dropped } = migrateWithReport(p.payload)
            setSeen(p.file.savedAt)
            set({ pending: null, status: 'idle', lastSavedAt: p.file.savedAt })
            last.current = null
            withUndo(`Loaded your cloud data${dropped ? ` · ${dropped} invalid record${dropped === 1 ? '' : 's'} skipped` : ''}`, { type: 'replace', data: { ...m, settings: { ...m.settings, onboarded: m.settings.onboarded || data.settings.onboarded } } })
          }}>Load cloud data</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────── the gate: sign in → unlock → app ───────────────

const strong = (pw: string) => pw.length >= 10 && /[A-Za-z]/.test(pw) && /[0-9\W_]/.test(pw)

function Shell({ children, title, lede, showcase }: { children?: ReactNode; title: ReactNode; lede?: ReactNode; showcase?: boolean }) {
  return (
    <div className={`onboard ${showcase ? 'auth' : ''}`}>
      {showcase && <AuthShowcase />}
      <div className="onboard-card page-enter">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div><div className="brand-name">Finspace</div><div className="brand-sub">Private wealth cockpit</div></div>
        </div>
        <h1 className="auth-title">{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
        <div className="promise">
          <span><ShieldCheck size={14} /> Encrypted on your device</span>
          <span><Lock size={14} /> No bank connection</span>
          <a href="#/privacy" style={{ color: 'var(--text-2)' }}>Privacy & terms</a>
        </div>
      </div>
    </div>
  )
}

function SignInScreen() {
  const { toast } = useStore()
  const c = useCloud()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'sent'>('signin')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  if (mode === 'sent') {
    return (
      <Shell showcase title="Check your email" lede={<>We sent a confirmation link to <b>{email}</b>. Open it on this device to finish creating your account, then sign in.</>}>
        <button className="btn" onClick={() => setMode('signin')}>Back to sign in</button>
      </Shell>
    )
  }

  return (
    <Shell
      showcase
      title={mode === 'signup' ? <>Create your <em>secure</em> account</> : mode === 'reset' ? 'Reset your password' : <>Welcome to <em>Finspace</em></>}
      lede={mode === 'signup' ? 'An account keeps your data protected and available on your devices. Your finances are encrypted on this device before they’re saved — we can’t read them.' : mode === 'reset' ? 'Enter your email and we’ll send you a link to choose a new password.' : 'Sign in to your account to see your money.'}
    >
      {c.offline && <p className="since" role="alert" style={{ marginBottom: 16 }}>You’re offline. Connect to the internet to sign in.</p>}
      <form className="form-stack" onSubmit={(e) => {
        e.preventDefault()
        if (mode === 'reset') return run(async () => { await sendReset(email.trim()); toast('If that email has an account, a reset link is on its way.', 'success'); setMode('signin') })
        if (mode === 'signup') return run(async () => { const r = await signUp(email.trim(), pw); setPw(''); if (!r.session) setMode('sent') })
        return run(async () => { await signIn(email.trim(), pw); setPw('') })
      }}>
        <Field label="Email"><input className="input" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {mode !== 'reset' && (
          <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters, with a number or symbol' : undefined} error={mode === 'signup' && pw && !strong(pw) ? 'Not strong enough yet' : undefined}>
            <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 10 : undefined} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        )}
        {err && <p className="err" role="alert" style={{ color: 'var(--loss)', margin: 0 }}>{err}</p>}
        <button className="btn btn-primary" style={{ height: 44 }} disabled={busy || !email || (mode !== 'reset' && !pw) || (mode === 'signup' && !strong(pw))}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
        </button>
        {mode === 'signup' && <p className="muted" style={{ margin: 0, fontSize: 12 }}>By creating an account you agree to the <a href="#/privacy">privacy notice and terms</a>. We store your email and your encrypted data — nothing else.</p>}
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {mode === 'signin' ? <button type="button" className="link-btn" onClick={() => { setMode('signup'); setErr('') }}>New here? Create an account</button> : <button type="button" className="link-btn" onClick={() => { setMode('signin'); setErr('') }}>Have an account? Sign in</button>}
          {mode === 'signin' && <button type="button" className="link-btn" onClick={() => { setMode('reset'); setErr('') }}>Forgot password?</button>}
        </div>
      </form>
    </Shell>
  )
}

function RecoveryScreen() {
  const { toast } = useStore()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Shell title="Choose a new password" lede="This changes the password you sign in with. Your encryption passphrase stays the same.">
      <form className="form-stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true)
        try { await updatePassword(pw); set({ recovery: false }); toast('Password updated', 'success') } catch (er) { toast((er as Error).message, 'error') }
        setBusy(false)
      }}>
        <Field label="New password" hint="At least 10 characters, with a number or symbol"><input className="input" type="password" autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <button className="btn btn-primary" disabled={busy || !strong(pw)}>Save new password</button>
      </form>
    </Shell>
  )
}

function PassphraseScreen({ user }: { user: User }) {
  const { vaultOwner, unlock, setupVault, adoptVault, wipeDevice, data, toast } = useStore()
  const [remote, setRemote] = useState<EncryptedFile | null | undefined>(undefined)
  const [loadErr, setLoadErr] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [ack, setAck] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [confirmErase, setConfirmErase] = useState(false)
  const hasLocal = vaultOwner !== undefined
  const foreign = hasLocal && vaultOwner !== null && vaultOwner !== user.id

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (hasLocal) return
    setLoadErr('')
    fetchVault().then(setRemote).catch((e) => setLoadErr((e as Error).message))
  }, [hasLocal])

  const wait = Math.max(0, Math.ceil((lockoutState().until - now) / 1000))
  const signOutHere = async () => { await signOut().catch(() => undefined) }

  const footer = (
    <p className="muted mt-16" style={{ fontSize: 13 }}>
      Signed in as <b>{user.email}</b> · <button className="link-btn" onClick={signOutHere}>Sign out</button>
    </p>
  )

  if (foreign) {
    return (
      <Shell title="This device holds another account’s data" lede="It’s encrypted and belongs to a different Finspace account, so it can’t be opened here.">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={signOutHere}>Sign out</button>
          <button className="btn btn-danger" onClick={() => setConfirmErase(true)}>Erase it from this device</button>
        </div>
        {confirmErase && (
          <div className="since mt-16" role="alert">
            <span className="grow">This permanently removes the other account’s data from this device (their cloud copy, if any, isn’t affected).</span>
            <button className="btn btn-sm btn-danger" onClick={() => { wipeDevice(); setConfirmErase(false) }}>Erase</button>
          </div>
        )}
        {footer}
      </Shell>
    )
  }

  // Existing data on this device → unlock
  if (hasLocal) {
    return (
      <Shell title="Unlock Finspace" lede="Enter your encryption passphrase to open your data.">
        <form className="form-stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr('')
          const ok = await unlock(pass, user.id)
          setBusy(false); setNow(Date.now())
          if (!ok) { setErr(lockoutState().fails >= 3 ? 'That passphrase didn’t work. For your security, please wait before trying again.' : 'That passphrase didn’t work. Your data is safe — try again.'); setPass('') }
        }}>
          <Field label="Encryption passphrase"><input className="input" type="password" autoFocus autoComplete="current-password" value={pass} onChange={(e) => { setPass(e.target.value); setErr('') }} aria-invalid={!!err} /></Field>
          {err && <p className="err" role="alert" style={{ color: 'var(--loss)', margin: 0 }}>{err}</p>}
          <button className="btn btn-primary" style={{ height: 44 }} disabled={!pass || busy || wait > 0}>{busy ? 'Unlocking…' : wait > 0 ? `Try again in ${wait >= 60 ? `${Math.ceil(wait / 60)} min` : `${wait}s`}` : 'Unlock'}</button>
        </form>
        {footer}
      </Shell>
    )
  }

  if (loadErr) {
    return (
      <Shell title="Couldn’t reach your account" lede={loadErr}>
        <button className="btn btn-primary" onClick={() => { setLoadErr(''); fetchVault().then(setRemote).catch((e) => setLoadErr((e as Error).message)) }}><RefreshCw size={15} /> Try again</button>
        {footer}
      </Shell>
    )
  }
  if (remote === undefined) return <Shell title="Opening your account…" lede="Checking for your encrypted data.">{footer}</Shell>

  // New device, existing account → enter passphrase to decrypt the cloud copy
  if (remote) {
    return (
      <Shell title="Welcome back" lede={<>Enter your encryption passphrase to unlock your data on this device. Last saved {sinceLabel(remote.savedAt)} on {remote.device}.</>}>
        <form className="form-stack" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr('')
          try {
            const { key, payload } = await decryptSnapshot(remote, pass)
            await adoptVault(key, user.id, migrate(payload))
            setSeen(remote.savedAt)
            set({ lastSavedAt: remote.savedAt })
          } catch { setErr('That passphrase doesn’t open your data. It’s the one you created with your account — not your password.') }
          setBusy(false)
        }}>
          <Field label="Encryption passphrase"><input className="input" type="password" autoFocus autoComplete="current-password" value={pass} onChange={(e) => { setPass(e.target.value); setErr('') }} /></Field>
          {err && <p className="err" role="alert" style={{ color: 'var(--loss)', margin: 0 }}>{err}</p>}
          <button className="btn btn-primary" style={{ height: 44 }} disabled={!pass || busy}>{busy ? 'Decrypting…' : 'Unlock my data'}</button>
        </form>
        {footer}
      </Shell>
    )
  }

  // Brand-new account → create the encryption passphrase
  const good = strong(pass) && pass !== user.email
  return (
    <Shell title={<>Protect your data with an <em>encryption passphrase</em></>} lede="This scrambles your finances on this device before anything is saved. It’s separate from your password and never leaves your device — so even we can’t read your data.">
      <form className="form-stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!good || pass !== pass2 || !ack) return
        setBusy(true)
        try {
          const k = await setupVault(pass, user.id, data)
          await push(data, k)
          toast('Your data is now encrypted and protected', 'success')
        } catch (er) { toast((er as Error).message, 'error') }
        setBusy(false)
      }}>
        <Field label="Encryption passphrase" hint="At least 10 characters with a number or symbol. A short sentence works well." error={pass && !good ? (pass === user.email ? 'Don’t use your email' : 'Not strong enough yet') : undefined}>
          <input className="input" type="password" autoFocus autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <Field label="Repeat it" error={pass2 && pass !== pass2 ? 'Doesn’t match' : undefined}><input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></Field>
        <label className="row" style={{ fontSize: 13, alignItems: 'flex-start' }}>
          <input type="checkbox" className="tx-check" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I understand that if I forget this passphrase, <b>my data can’t be recovered</b> — not even by Finspace. I’ll keep it somewhere safe.</span>
        </label>
        <button className="btn btn-primary" style={{ height: 44 }} disabled={busy || !good || pass !== pass2 || !ack}>{busy ? 'Encrypting…' : 'Encrypt and continue'}</button>
      </form>
      {footer}
    </Shell>
  )
}

/** Renders children only for a signed-in user whose data is unlocked. */
export function AuthGate({ children }: { children: ReactNode }) {
  const c = useCloud()
  const { locked } = useStore()
  useEffect(() => { startAuth() }, [])
  if (!cloudConfigured()) return <Shell title="Finspace isn’t configured" lede="This copy is missing its account service settings (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY)." />
  if (!c.ready) return <Shell title="Opening Finspace…" />
  if (c.recovery && c.user) return <RecoveryScreen />
  if (!c.user) return <SignInScreen />
  if (locked) return <PassphraseScreen user={c.user} />
  return <>{children}</>
}

// ─────────────── Settings: account, storage choice ───────────────

export function AccountPanel() {
  const { data, dispatch, toast, getKey, wipeDevice, lockNow, changePassphrase } = useStore()
  const c = useCloud()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<null | 'local' | 'signout' | 'passphrase'>(null)
  const [alsoDelete, setAlsoDelete] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [np, setNp] = useState('')
  const [np2, setNp2] = useState('')
  const local = data.settings.storage === 'local'
  if (!c.user) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }

  const doSignOut = () => run(async () => {
    if (!local) {
      const r = await push(data, getKey())
      if (r === 'error' || r === 'conflict') throw new Error('Couldn’t save your latest changes to your account, so you’re still signed in. Check your connection and try again.')
      await signOut()
      wipeDevice()
    } else {
      await signOut()
      lockNow()
    }
    setDialog(null)
  })

  return (
    <>
      <h2 className="panel-title">Account & storage</h2>
      <div className="setting-row mt-16" style={{ flexWrap: 'wrap' }}>
        <div>
          <b className="row" style={{ gap: 6 }}><UserRound size={16} /> {c.user.email}</b>
          <div className="muted" style={{ fontSize: 13 }} role="status">
            {local ? <span className="row" style={{ gap: 6 }}><HardDrive size={14} /> Stored only on this device, encrypted</span>
              : c.status === 'saving' ? 'Encrypting and saving to your account…'
              : c.status === 'error' ? <span style={{ color: 'var(--loss)' }}><CloudOff size={13} /> {c.error} Your data on this device is safe and will save when you’re back online.</span>
              : c.status === 'conflict' ? <span style={{ color: 'var(--warn)' }}>Another device saved changes. Press “Sync now” to choose which version to keep.</span>
              : <span className="row" style={{ gap: 6 }}><Cloud size={14} /> Saved to your account, end-to-end encrypted{c.lastSavedAt ? ` · ${sinceLabel(c.lastSavedAt)}` : ''}</span>}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {!local && <button className="btn btn-sm" disabled={busy} onClick={() => run(async () => { const k = getKey(); if (k) { set({ status: 'idle' }); await reconcile(data, k); if (!st.pending) { await push(data, k); toast('Synced', 'success') } } })}><RefreshCw size={14} className={busy ? 'spin' : ''} /> Sync now</button>}
          <button className="btn btn-sm btn-ghost" onClick={() => setDialog('signout')}><LogOut size={14} /> Sign out</button>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
        {local
          ? <>Your data stays on this device only, encrypted with your passphrase. It won’t be available on your other devices, and if you clear this browser it’s gone — keep a backup. <button className="link-btn" onClick={() => run(async () => { dispatch({ type: 'settings', patch: { storage: 'cloud' } }); const k = getKey(); if (k) await reconcile({ ...data, settings: { ...data.settings, storage: 'cloud' } }, k); toast('Your data is now saved to your account, encrypted', 'success') })}>Save it to my account instead</button></>
          : <>Your data is saved to your Finspace account on our secure servers (Supabase, London) — encrypted on this device first, so only you can read it. If you’d rather your data be stored locally, <button className="link-btn" onClick={() => setDialog('local')}>click here</button>.</>}
      </p>

      <div className="divider" />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => setDialog('passphrase')}><KeyRound size={14} /> Change encryption passphrase</button>
        <button className="btn btn-sm" onClick={() => run(async () => { await sendReset(c.user!.email!); toast('We’ve emailed you a link to change your password.', 'success') })}>Change password</button>
      </div>

      <details className="mt-16">
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Delete my account</summary>
        <div className="row mt-16" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Type DELETE to permanently remove your account, your encrypted cloud copy and the data on this device"><input className="input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} style={{ width: 200 }} aria-label="Type DELETE to confirm" /></Field>
          <button className="btn btn-danger" disabled={confirmDelete !== 'DELETE' || busy} onClick={() => run(async () => { await deleteAccount(); wipeDevice(); setConfirmDelete('') })}><Trash2 size={14} /> Delete account</button>
        </div>
      </details>

      {dialog === 'local' && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Store data on this device only">
            <h2>Store your data on this device only?</h2>
            <p>New changes will stay encrypted on this device and won’t be saved to your account. You’ll still sign in to open Finspace. Other devices won’t see your data, and clearing this browser would erase it — so keep backups.</p>
            <label className="row" style={{ fontSize: 13, alignItems: 'flex-start', marginBottom: 20 }}>
              <input type="checkbox" className="tx-check" checked={alsoDelete} onChange={(e) => setAlsoDelete(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Also delete the encrypted copy already saved in my account</span>
            </label>
            <div className="actions">
              <button className="btn" onClick={() => setDialog(null)}>Keep saving to my account</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
                if (alsoDelete) await deleteVault(c.user!.id)
                dispatch({ type: 'settings', patch: { storage: 'local' } })
                set({ lastSavedAt: null, status: 'idle' })
                setDialog(null)
                toast(alsoDelete ? 'Your data is now stored on this device only, and the cloud copy was deleted' : 'New changes will stay on this device only', 'success')
              })}>Store on this device only</button>
            </div>
          </div>
        </div>
      )}

      {dialog === 'signout' && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Sign out">
            <h2>Sign out of Finspace?</h2>
            <p>{local ? 'Your data stays on this device, encrypted — only your account and passphrase can open it again.' : 'We’ll save your latest changes to your account, then remove your data from this device. Sign in again to get it back.'}</p>
            <div className="actions"><button className="btn" onClick={() => setDialog(null)}>Stay signed in</button><button className="btn btn-primary" disabled={busy} onClick={doSignOut}>{busy ? 'Saving…' : 'Sign out'}</button></div>
          </div>
        </div>
      )}

      {dialog === 'passphrase' && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <form className="dialog" role="dialog" aria-modal="true" aria-label="Change encryption passphrase" onSubmit={(e) => {
            e.preventDefault()
            if (!strong(np) || np !== np2) return
            run(async () => {
              const k = await changePassphrase(np)
              if (!local) {
                set({ status: 'idle' })
                const r = await push(data, k)
                if (r !== 'ok' && r !== 'skipped') throw new Error('Passphrase changed on this device, but the cloud copy couldn’t be updated yet. Use “Sync now” when you’re online.')
              }
              setNp(''); setNp2(''); setDialog(null)
              toast('Encryption passphrase changed. Use the new one on your other devices.', 'success')
            })
          }}>
            <h2>Change encryption passphrase</h2>
            <p>Your data is re-encrypted with the new passphrase{local ? '' : ' here and in your account'}. Other devices will ask for the new one.</p>
            <div className="form-stack">
              <Field label="New passphrase" hint="At least 10 characters with a number or symbol"><input className="input" type="password" autoFocus autoComplete="new-password" value={np} onChange={(e) => setNp(e.target.value)} /></Field>
              <Field label="Repeat it" error={np2 && np !== np2 ? 'Doesn’t match' : undefined}><input className="input" type="password" autoComplete="new-password" value={np2} onChange={(e) => setNp2(e.target.value)} /></Field>
            </div>
            <div className="actions mt-16"><button type="button" className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !strong(np) || np !== np2}>{busy ? 'Re-encrypting…' : 'Change passphrase'}</button></div>
          </form>
        </div>
      )}
    </>
  )
}

/** For the sidebar status line. */
export function storageLabel(local: boolean, status: CloudState['status']) {
  if (local) return 'Encrypted on this device'
  if (status === 'saving') return 'Saving to your account…'
  if (status === 'error') return 'Offline — saved on this device'
  if (status === 'conflict') return 'Needs your attention — open Settings'
  return 'Encrypted & saved to your account'
}

