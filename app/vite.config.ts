import { svelte } from '@sveltejs/vite-plugin-svelte'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

// Dev-only (`vite dev`): serves PIXELLAB_API_KEY from ../.env at /__dev/pixellab-key to same-origin localhost requests,
// and lets the CSP allow Vite's HMR websocket. `apply: 'serve'` keeps both out of `vite build`.
function devKey(): Plugin {
  return {
    name: 'pixeldoll-dev-key',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
    configureServer(server) {
      server.middlewares.use('/__dev/pixellab-key', (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        const host = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '');
        const sameOrigin = req.headers['sec-fetch-site'] === 'same-origin';
        if (!local || !host || !sameOrigin) { res.statusCode = 403; return res.end() }
        let key = ''
        try { key = readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^PIXELLAB_API_KEY=(.*)$/m)?.[1]?.trim() ?? '' } catch {}
        res.setHeader('cache-control', 'no-store')
        res.statusCode = key ? 200 : 404
        res.end(key)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './', // ponytail: relative base so GitHub Pages subpath just works
  plugins: [svelte(), devKey()],
})
