/**
 * Encryption for all financial data (on the device and in the cloud): AES-GCM (256-bit),
 * with a key derived from the user's encryption passphrase using PBKDF2-SHA256 (310,000 iterations).
 * Uses the browser's built-in Web Crypto. The passphrase is never stored or sent anywhere;
 * if it's forgotten, the data can't be recovered.
 */

export interface Vault {
  v: 1
  salt: string
  iv: string
  data: string
}

const ITER = 310_000
const enc = new TextEncoder()
const dec = new TextDecoder()

/** Chunked so large datasets don't overflow the call stack. */
function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function deriveKey(passcode: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function createVaultKey(passcode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { key: await deriveKey(passcode, salt), salt: b64(salt) }
}

export async function seal(key: CryptoKey, salt: string, payload: unknown): Promise<Vault> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)))
  return { v: 1, salt, iv: b64(iv), data: b64(ct) }
}

/** Throws if the passcode is wrong (AES-GCM authentication fails). */
export async function open(vault: Vault, passcode: string) {
  const key = await deriveKey(passcode, unb64(vault.salt))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.data))
  return { key, payload: JSON.parse(dec.decode(pt)) as unknown }
}

/** Derive the key for an existing base64 salt (e.g. to keep writing to a sync file). */
export async function deriveKeyFromB64(passcode: string, saltB64: string) {
  return deriveKey(passcode, unb64(saltB64))
}

/** Decrypt with an already-derived key. Throws if the key doesn't match or the data was tampered with. */
export async function openWithKey(vault: Vault, key: CryptoKey) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.data))
  return JSON.parse(dec.decode(pt)) as unknown
}
