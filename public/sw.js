/* Finspace service worker — offline app shell + notification clicks.
   Only same-origin GET requests are cached. API calls (prices, rates, Supabase) always go to the network. */
const CACHE = 'finspace-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icons/apple-touch-icon.png', '/icons/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // network first so updates arrive; fall back to the cached shell offline
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copy)); return res }).catch(() => caches.match('/index.html')))
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.woff2') || url.pathname === '/icon.svg' || url.pathname.startsWith('/icons/')) {
    // fingerprinted files never change: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return res })))
  }
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(target); return c.focus() }
    return self.clients.openWindow(target)
  }))
})
