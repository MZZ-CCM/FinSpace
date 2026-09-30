import { Share2 } from 'lucide-react'
import { useStore } from '../lib/store'

/* Shares a link to Finspace itself — never any of the user's data.
   Uses the native share sheet (iPhone, iPad, Android, Safari/Edge on desktop) and
   falls back to copying the link. */

const SHARE_TEXT = 'Finspace — a private, end-to-end encrypted place to see all your money. No bank connection needed.'

export function appUrl(): string {
  return window.location.origin + '/'
}

export async function shareApp(toast: (m: string, tone?: 'error') => void) {
  const url = appUrl()
  const payload = { title: 'Finspace', text: SHARE_TEXT, url }
  if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
    try { await navigator.share(payload); return } catch (e) {
      if ((e as Error).name === 'AbortError') return // the person closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast('Link copied. Paste it anywhere to share Finspace.')
  } catch {
    toast(`Couldn’t copy the link. Share this address instead: ${url}`, 'error')
  }
}

export function ShareAppButton({ label = false, className = 'btn btn-icon btn-ghost' }: { label?: boolean; className?: string }) {
  const { toast } = useStore()
  return (
    <button className={className} onClick={() => shareApp(toast)} aria-label="Share Finspace" title="Share Finspace">
      <Share2 size={label ? 16 : 18} />{label && ' Share Finspace'}
    </button>
  )
}
