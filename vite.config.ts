import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const CSP = readFileSync(new URL('./csp.txt', import.meta.url), 'utf8').trim()

/** Adds the Content-Security-Policy as a meta tag in production builds (the dev server needs inline HMR scripts). */
function cspMeta(): Plugin {
  return {
    name: 'finspace-csp',
    apply: 'build',
    transformIndexHtml(html) {
      // frame-ancestors is ignored in <meta>; it's enforced by the hosting headers (public/_headers, vercel.json)
      const metaCsp = CSP.replace(/frame-ancestors[^;]*;?\s*/, '')
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp}" />`)
    },
  }
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  server: { port: 5173, host: 'localhost' },
  build: { sourcemap: false },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
