/**
 * Encrypted snapshots — used for cloud sync (Supabase) and for encrypted backup files.
 * AES-256-GCM with a key derived from a passphrase that never leaves the device.
 */
import type { AppData } from './types'
import { createVaultKey, deriveKeyFromB64, open, seal, type Vault } from './vault'

export interface EncryptedFile extends Vault {
  format: 'finspace-encrypted'
  savedAt: string
  device: string
}

export function isEncryptedFile(x: unknown): x is EncryptedFile {
  const o = x as EncryptedFile
  return !!o && o.format === 'finspace-encrypted' && typeof o.data === 'string' && typeof o.salt === 'string' && typeof o.iv === 'string'
}

export function deviceName() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'device'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser'
  return `${br} on ${os}`
}

export async function encryptSnapshot(data: AppData, key: { key: CryptoKey; salt: string }): Promise<EncryptedFile> {
  const v = await seal(key.key, key.salt, data)
  return { ...v, format: 'finspace-encrypted', savedAt: new Date().toISOString(), device: deviceName() }
}

export async function newKey(passphrase: string) {
  return createVaultKey(passphrase)
}

/** Decrypts with the passphrase. Throws on a wrong passphrase or tampered file. */
export async function decryptSnapshot(file: EncryptedFile, passphrase: string) {
  const { key, payload } = await open(file, passphrase)
  return { key: { key, salt: file.salt }, payload }
}

/** Re-derive the key for an existing file's salt (so later writes stay readable with the same passphrase). */
export async function keyForFile(file: EncryptedFile, passphrase: string) {
  return { key: await deriveKeyFromB64(passphrase, file.salt), salt: file.salt }
}
