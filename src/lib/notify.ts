/**
 * Opt-in, on-device reminders. There's no push server: checks run while Finspace is open
 * (or installed and recently used). Messages never include amounts, because notifications
 * can appear on a locked screen.
 */
import type { AppData, Settings } from './types'
import { addMonths, monthLabel, todayISO } from './format'
import { budgetUsage, goalProgress, overallBudgetUsage, upcoming } from './calc'

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window
export const permission = (): NotificationPermission | 'unsupported' => (notifySupported() ? Notification.permission : 'unsupported')

export async function requestPermission() {
  if (!notifySupported()) return 'unsupported' as const
  return Notification.requestPermission()
}

interface Note { key: string; title: string; body: string; url: string }

/** Works out which reminders are due and haven't been sent yet. Pure — easy to test. */
export function dueNotes(data: AppData, today = todayISO()): Note[] {
  const n = data.settings.notify
  if (!n) return []
  const sent = data.settings.notified ?? {}
  const out: Note[] = []
  const month = today.slice(0, 7)
  if (n.recurring) {
    for (const u of upcoming(data.recurring, 1, today)) {
      if (u.rule.type === 'transfer') continue
      out.push({ key: `rec:${u.rule.id}:${u.date}`, title: `${u.rule.payee} is due tomorrow`, body: u.rule.type === 'income' ? 'Expected money in.' : 'A repeating payment goes out tomorrow.', url: '/#/money/recurring' })
    }
  }
  if (n.budgets) {
    const ov = overallBudgetUsage(data, month)
    for (const lvl of [1, 0.8]) {
      if (ov && ov.ratio >= lvl) { out.push({ key: `bud:overall:${month}:${lvl}`, title: lvl === 1 ? 'You’ve reached your overall budget' : 'You’ve used 80% of your overall budget', body: `For ${monthLabel(month)}.`, url: '/#/budgets' }); break }
    }
    for (const b of data.budgets) {
      const u = budgetUsage(data, b, month)
      for (const lvl of [1, 0.8]) {
        if (u.ratio >= lvl) { out.push({ key: `bud:${b.category}:${b.period === 'yearly' ? month.slice(0, 4) : month}:${lvl}`, title: lvl === 1 ? `${b.category} budget reached` : `You’ve used 80% of your ${b.category.toLowerCase()} budget`, body: b.period === 'yearly' ? `For ${month.slice(0, 4)}.` : `For ${monthLabel(month)}.`, url: '/#/budgets' }); break }
      }
    }
  }
  if (n.goals) {
    for (const g of data.goals) if (goalProgress(data, g, today).done) out.push({ key: `goal:${g.id}`, title: `🎉 ${g.name} reached`, body: 'You hit your goal.', url: `/#/goals/${g.id}` })
  }
  if (n.monthly && Number(today.slice(8)) <= 7) {
    const prev = addMonths(month, -1)
    out.push({ key: `month:${prev}`, title: `Your ${monthLabel(prev)} report is ready`, body: 'See what came in, what went out and how investments did.', url: '/#/reports' })
  }
  // an 80% note is redundant once 100% has been sent
  return out.filter((x) => !sent[x.key] && !(x.key.endsWith(':0.8') && sent[x.key.replace(/:0\.8$/, ':1')]))
}

export async function show(note: Note) {
  const opts: NotificationOptions = { body: note.body, icon: '/icon.svg', badge: '/icon.svg', tag: note.key, data: { url: note.url } }
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  if (reg) await reg.showNotification(note.title, opts)
  else new Notification(note.title, opts)
}

/** Sends due notes and returns the updated "already sent" map (pruned to the last 90 days of keys). */
export async function runNotifications(data: AppData): Promise<Settings['notified'] | null> {
  if (permission() !== 'granted') return null
  const notes = dueNotes(data)
  if (!notes.length) return null
  const sent = { ...(data.settings.notified ?? {}) }
  for (const note of notes.slice(0, 3)) {
    try { await show(note) } catch { /* ignore */ }
    sent[note.key] = todayISO()
  }
  // mark the rest as seen too, so a backlog doesn't flood the user later
  for (const note of notes.slice(3)) sent[note.key] = todayISO()
  const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  return Object.fromEntries(Object.entries(sent).filter(([, d]) => d >= cutoff))
}
