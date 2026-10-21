import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { queue } from './lib/pixellab/queue.ts'
import { askPersist } from './lib/store/db.ts'

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

export default mount(App, { target })
