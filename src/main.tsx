import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './lib/store'
import { UIProvider } from './lib/ui'
import { App } from './App'
import '@fontsource-variable/geist'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import './styles.css'

// Offline support + notification clicks (production only; the dev server serves files directly)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <UIProvider>
        <App />
      </UIProvider>
    </StoreProvider>
  </StrictMode>,
)
