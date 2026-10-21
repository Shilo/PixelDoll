import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { queue } from './lib/pixellab/queue.ts'
import { askPersist } from './lib/store/db.ts'

askPersist()
await queue.load() // resume pending jobs from the ledger
queue.start()

export default mount(App, { target: document.getElementById('app')! })
