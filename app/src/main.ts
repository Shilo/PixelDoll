import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { queue } from './lib/pixellab/queue.ts'
import { askPersist } from './lib/store/db.ts'

askPersist()
await queue.connect() // leader tab resumes the ledger; other tabs mirror it (Web Locks)
import.meta.hot?.dispose(() => queue.disconnect())
if (import.meta.env.DEV) (window as unknown as { __queue: unknown }).__queue = queue // dev: inspect role/ledger

export default mount(App, { target: document.getElementById('app')! })
