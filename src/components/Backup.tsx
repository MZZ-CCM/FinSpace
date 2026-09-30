import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { migrateWithReport, isBackup } from '../lib/migrate'
import { download } from '../lib/csv'
import { dateLabel, todayISO } from '../lib/format'
import { decryptSnapshot, encryptSnapshot, isEncryptedFile, newKey, type EncryptedFile } from '../lib/sync'
import { Field } from './ui'

/** Download and restore backups — encrypted (.finspace) or plain JSON. Works in every browser. */
export function BackupPanel() {
  const { data, withUndo, toast } = useStore()
  const [busy, setBusy] = useState(false)
  const [bpass, setBpass] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreFile, setRestoreFile] = useState<EncryptedFile | null>(null)
  const [rpass, setRpass] = useState('')

  const downloadEncrypted = async () => {
    if (bpass.length < 8) return
    setBusy(true)
    const snap = await encryptSnapshot(data, await newKey(bpass))
    download(`finspace-backup-${todayISO()}.finspace`, JSON.stringify(snap), 'application/json')
    setBpass('')
    setBusy(false)
    toast('Encrypted backup downloaded. You’ll need the same passphrase to restore it.', 'success')
  }

  const restore = (raw: unknown, label: string) => {
    const { data: m, dropped } = migrateWithReport(raw)
    // keep this device's storage choice; a backup shouldn't silently change where data lives
    withUndo(`${label}${dropped ? ` · ${dropped} invalid record${dropped === 1 ? '' : 's'} skipped` : ''}`, { type: 'replace', data: { ...m, settings: { ...m.settings, onboarded: true, storage: data.settings.storage } } })
  }

  const onPickBackup = async (f: File) => {
    if (f.size > 50 * 1024 * 1024) { toast('That file is over 50 MB — it isn’t a Finspace backup.', 'error'); return }
    try {
      const parsed = JSON.parse(await f.text())
      if (isEncryptedFile(parsed)) setRestoreFile(parsed)
      else if (isBackup(parsed)) restore(parsed, 'Backup restored')
      else throw new Error()
    } catch {
      toast('That file isn’t a Finspace backup. Choose a .finspace or .json file downloaded from Settings.', 'error')
    }
  }

  return (
    <>
      <div className="row mt-16" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Backup passphrase" hint="At least 8 characters — needed to restore"><input className="input" type="password" autoComplete="new-password" value={bpass} onChange={(e) => setBpass(e.target.value)} style={{ width: 240 }} /></Field>
        <button className="btn" onClick={downloadEncrypted} disabled={bpass.length < 8 || busy}><Download size={15} /> Download encrypted backup</button>
      </div>
      <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => { download(`finspace-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json'); toast('Unencrypted backup downloaded — store it somewhere private', 'success') }}><Download size={15} /> Download unencrypted backup (JSON)</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Restore a backup</button>
        <input ref={fileRef} type="file" accept=".finspace,.json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickBackup(f); e.target.value = '' }} />
      </div>

      {restoreFile && (
        <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && setRestoreFile(null)}>
          <form className="dialog" role="dialog" aria-modal="true" aria-label="Restore encrypted backup" onSubmit={async (e) => {
            e.preventDefault()
            try {
              const { payload } = await decryptSnapshot(restoreFile, rpass)
              restore(payload, `Backup from ${dateLabel(restoreFile.savedAt.slice(0, 10))} restored`)
              setRestoreFile(null); setRpass('')
            } catch { toast('That passphrase doesn’t open this backup.', 'error') }
          }}>
            <h2>Restore encrypted backup</h2>
            <p>Saved {dateLabel(restoreFile.savedAt.slice(0, 10))} on {restoreFile.device}. This replaces your current data — you can undo right after.</p>
            <input className="input" type="password" autoFocus placeholder="Backup passphrase" value={rpass} onChange={(e) => setRpass(e.target.value)} aria-label="Backup passphrase" />
            <div className="actions mt-16"><button type="button" className="btn" onClick={() => setRestoreFile(null)}>Cancel</button><button className="btn btn-primary" disabled={!rpass}>Restore</button></div>
          </form>
        </div>
      )}
    </>
  )
}
