import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

/* Offers to install Finspace as an app.
   iPhone/iPad Safari has no install prompt, so we explain the Share → Add to Home Screen step;
   Chrome, Edge and Android fire `beforeinstallprompt`, which we turn into an Install button. */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const KEY = 'finspace:installHint'

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac, but has touch
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function dismissed(): boolean {
  try { return localStorage.getItem(KEY) === 'dismissed' } catch { return false }
}

export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [hidden, setHidden] = useState(() => isStandalone() || dismissed())

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent) }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const close = () => { setHidden(true); try { localStorage.setItem(KEY, 'dismissed') } catch { /* private mode */ } }
  const ios = isIOS()
  if (hidden || (!ios && !prompt)) return null

  return (
    <div className="install-hint" role="note">
      <span className="install-icon" aria-hidden><img src="/icons/apple-touch-icon.png" alt="" /></span>
      {ios ? (
        <p>
          <b>Install Finspace on your {/iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent) ? 'iPad' : 'iPhone'}.</b>{' '}
          In Safari, tap Share <Share size={15} className="share-glyph" aria-label="Share" /> then <b>Add to Home Screen</b>. It opens full-screen, like any other app.
        </p>
      ) : (
        <p><b>Install Finspace as an app</b> for a full-screen window and quick access from your home screen or dock.</p>
      )}
      {!ios && prompt && (
        <button className="btn btn-sm btn-primary" onClick={async () => { await prompt.prompt(); const { outcome } = await prompt.userChoice; setPrompt(null); if (outcome === 'accepted') setHidden(true) }}>
          <Download size={14} /> Install
        </button>
      )}
      <button className="btn btn-icon btn-ghost btn-sm" onClick={close} aria-label="Dismiss install tip"><X size={16} /></button>
    </div>
  )
}
