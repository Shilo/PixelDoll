import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { queue } from './lib/pixellab/queue.ts'
import { askPersist } from './lib/store/db.ts'
import { app, setKey } from './lib/app.svelte.ts'

askPersist()
const target = document.getElementById('app')!
try {
  // leader tab resumes the ledger; other tabs mirror it (Web Locks). Only a real open error fails here (no IndexedDB,
  // onerror, onblocked in db.ts): a slow open (big ledger, hidden throttled tab) just takes longer.
  await queue.connect()
} catch (e) {
  // R6 P2-12: no IndexedDB (blocked site data, some private modes, full disk) -> say so instead of a blank page
  target.innerHTML = '<div style="max-width:32rem;margin:15vh auto;padding:0 16px;font:16px/1.5 system-ui,sans-serif"><h1 style="font-size:1.4em">PixelDoll can\'t open its storage</h1><p>PixelDoll keeps characters and generation jobs in this browser\'s storage (IndexedDB). Allow site data for this page, leave private browsing, or free some disk space, then reload.</p><p style="opacity:.7;font-size:.9em"></p></div>'
  target.querySelector('p:last-child')!.textContent = `Details: ${(e as Error)?.message ?? e}`
  throw e
}
import.meta.hot?.dispose(() => queue.disconnect())
if (import.meta.env.DEV) (window as unknown as { __queue: unknown }).__queue = queue // dev: inspect role/ledger

// AI-agent automation only (`npm run dev:agent`, Vite mode "agent"): connect with the key the agent dev server serves from
// ../.env. Statically false in `npm run dev` and every build, so the bundle has no trace of it. Scripts that must stay keyless
// set localStorage 'pixeldoll.agentKey' = 'off' first.
if (import.meta.env.DEV && import.meta.env.MODE === 'agent' && !app.key) {
  let off = false
  try { off = localStorage.getItem('pixeldoll.agentKey') === 'off' } catch {}
  if (!off) fetch('/__dev/pixellab-key', { cache: 'no-store' }).then(async (r) => { if (r.ok) setKey(await r.text(), false) }).catch(() => {})
}

export default mount(App, { target })
