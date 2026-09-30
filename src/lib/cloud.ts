/**
 * Optional Supabase account + cloud sync.
 *
 * • The account (email + password) only proves who you are.
 * • Your data is encrypted in the browser with a separate encryption passphrase (AES-256-GCM,
 *   PBKDF2-SHA256) before upload. Supabase stores ciphertext only — it can't read your finances.
 * • Row Level Security means each account can only read or write its own row.
 * • The Supabase client is loaded on demand, so people who don't use cloud sync never download it.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { EncryptedFile } from './sync'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const cloudConfigured = () => !!URL && !!KEY

let client: Promise<SupabaseClient> | null = null
export function supabase(): Promise<SupabaseClient> {
  if (!cloudConfigured()) return Promise.reject(new Error('Cloud sync isn’t configured for this copy of Finspace.'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'finspace:auth' } }),
  )
  return client
}

/** Plain-language messages for common auth errors. */
export function friendly(e: unknown) {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match. Check them and try again.'
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first — we sent you a link when you signed up.'
  if (/User already registered/i.test(m)) return 'There’s already an account with that email. Sign in instead.'
  if (/Password should be/i.test(m) || /weak/i.test(m)) return 'Choose a stronger password: at least 10 characters, mixing letters, numbers and symbols.'
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Couldn’t reach the sync service. Check your connection — your data on this device is safe.'
  return m
}

export async function currentUser(): Promise<User | null> {
  const sb = await supabase()
  const { data } = await sb.auth.getSession()
  return data.session?.user ?? null
}

export async function signUp(email: string, password: string) {
  const sb = await supabase()
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
  if (error) throw new Error(friendly(error))
  return data
}

export async function signIn(email: string, password: string) {
  const sb = await supabase()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(friendly(error))
  return data.user
}

export async function sendReset(email: string) {
  const sb = await supabase()
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/#/settings` })
  if (error) throw new Error(friendly(error))
}

export async function updatePassword(password: string) {
  const sb = await supabase()
  const { error } = await sb.auth.updateUser({ password })
  if (error) throw new Error(friendly(error))
}

export async function signOut() {
  const sb = await supabase()
  await sb.auth.signOut()
}

export async function deleteAccount() {
  const sb = await supabase()
  const { error } = await sb.rpc('delete_my_account')
  if (error) throw new Error(friendly(error))
  await sb.auth.signOut()
}

interface Row { salt: string; iv: string; data: string; device: string | null; saved_at: string }

export async function fetchVault(): Promise<EncryptedFile | null> {
  const sb = await supabase()
  const { data, error } = await sb.from('vaults').select('salt, iv, data, device, saved_at').maybeSingle<Row>()
  if (error) throw new Error(friendly(error))
  if (!data) return null
  return { v: 1, format: 'finspace-encrypted', salt: data.salt, iv: data.iv, data: data.data, device: data.device ?? 'another device', savedAt: new Date(data.saved_at).toISOString() }
}

/**
 * Saves the encrypted snapshot. When `expectSavedAt` is given, the write only succeeds if nobody else
 * saved in between (optimistic concurrency) — otherwise returns 'conflict' so the user can choose.
 */
export async function pushVault(snap: EncryptedFile, userId: string, expectSavedAt: string | null): Promise<'ok' | 'conflict'> {
  const sb = await supabase()
  const row = { salt: snap.salt, iv: snap.iv, data: snap.data, device: snap.device.slice(0, 100), saved_at: snap.savedAt }
  if (expectSavedAt === null) {
    const { error } = await sb.from('vaults').insert({ user_id: userId, ...row })
    if (error) {
      if (/duplicate key/i.test(error.message)) return 'conflict'
      throw new Error(friendly(error))
    }
    return 'ok'
  }
  const { data, error } = await sb.from('vaults').update(row).eq('user_id', userId).eq('saved_at', expectSavedAt).select('saved_at')
  if (error) throw new Error(friendly(error))
  return data && data.length ? 'ok' : 'conflict'
}

/** Removes this account's encrypted cloud copy (the account itself stays). */
export async function deleteVault(userId: string) {
  const sb = await supabase()
  const { error } = await sb.from('vaults').delete().eq('user_id', userId)
  if (error) throw new Error(friendly(error))
}

export async function onAuthChange(cb: (event: string, user: User | null) => void) {
  const sb = await supabase()
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session?.user ?? null))
  return () => data.subscription.unsubscribe()
}
