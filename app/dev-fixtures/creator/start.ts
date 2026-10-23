// Served by Vite only, never an input to the production build. Fake key and complete network isolation.
if (import.meta.env.MODE === 'agent') throw new Error('Use a dedicated normal dev-server origin for the offline fixture, never the agent server.')
localStorage.setItem('pixeldoll.agentKey', 'off')
localStorage.setItem('pixeldoll.welcomed', '1')
await navigator.serviceWorker.register('/dev-fixtures/creator/worker.js', { type: 'module' })
await navigator.serviceWorker.ready
if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
const { app, setKey } = await import('../../src/lib/app.svelte.ts')
if (app.key) throw new Error('The offline fixture requires a dedicated origin with no saved PixelLab key.')
setKey('offline-fixture-not-a-real-key', false)
await import('../../src/main.ts')
const badge = document.createElement('div')
badge.textContent = 'Offline API fixture'
badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;padding:2px 8px;border-radius:8px;background:#30533c;color:white;font:11px/1.6 system-ui;pointer-events:none'
document.body.append(badge)
