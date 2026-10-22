// B13 cross-tab probe (no key, no spend; DEV server only: imports /src modules). node app/scripts/probe-tabs.mjs  env BASE=http://localhost:5173
// Keyless on the agent server too (opts out of the agent key).
// Drafts load once per id across reload / follower / takeover; follower cannot start generations; nobody answers a key ask;
// db.update is atomic; gcBlobs keeps referenced blobs and drops the rest.
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => { localStorage.setItem('pixeldoll.welcomed', '1'); localStorage.setItem('pixeldoll.agentKey', 'off') })
const ok = (s) => console.log('ok', s)
const open = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message)); await p.goto(`${BASE}/#/`); await p.waitForSelector('.stage canvas'); return p }
const role = (p) => p.evaluate(() => window.__queue.role)
const ids = (p) => p.evaluate(() => window.__studio.gens.map((g) => g.draft.spec.id))

const a = await open()
// persisted duplicates (the regression wrote every draft twice): 2 drafts x 2
await a.evaluate(async () => {
  const gen = (id) => ({ draft: { spec: { id, name: id, slot: 'hat', prompt: id, key: 'magenta', anims: [], dirs: [] }, rigId: 'rig-none', calls: [], keySwitched: false, log: [] }, input: { name: id, slot: 'hat', prompt: id }, phase: 'failed', status: '', error: 'probe' })
  const db = await import('/src/lib/store/db.ts')
  await db.put('projects', 'studio-drafts', { id: 'studio-drafts', gens: [gen('d1'), gen('d2'), gen('d1'), gen('d2')] })
})
await a.reload(); await a.waitForSelector('.stage canvas')
await a.waitForFunction(() => window.__studio.gens.length > 0)
assert.deepEqual(await ids(a), ['d1', 'd2']); assert.equal(await role(a), 'leader')
await a.evaluate(async () => { const s = await import('/src/studio/state.svelte.ts'); await s.loadGens(); await s.loadGens() })
assert.deepEqual(await ids(a), ['d1', 'd2'])
ok('leader: persisted duplicates heal on read, loadGens twice = one entry per draft id')

const b = await open()
assert.equal(await role(b), 'follower')
await b.waitForFunction(() => window.__studio.gens.length > 0)
assert.deepEqual(await ids(b), ['d1', 'd2'])
ok('follower mirrors the drafts once')

// follower cannot start a paid flow: Create shows the "open in another tab" toast, not Connect
await b.locator('.project-btn').click()
await b.getByRole('menuitem', { name: 'New character…' }).click()
await b.locator('dialog textarea').fill('probe')
await b.locator('dialog').getByRole('button', { name: /^Create/ }).click()
await b.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('open in another tab'))
assert.notEqual(await b.evaluate(() => document.querySelector('dialog[open] h2')?.textContent), 'Connect PixelLab')
ok('follower: Create is refused with a toast (only the leader drives generations)')
await b.keyboard.press('Escape')

// R6 P1-4: the leader holds a key; a same-origin page asks for it
await a.evaluate(() => window.__queue.setKey('probe-key-not-real', false))
const heard = await b.evaluate(() => new Promise((res) => {
  const spy = new BroadcastChannel('pixeldoll-queue'), got = []
  spy.onmessage = (e) => got.push(e.data)
  spy.postMessage({ ask: true })
  setTimeout(() => { spy.close(); res(got) }, 300)
}))
assert.ok(!heard.some((m) => typeof m?.key === 'string'), JSON.stringify(heard))
ok(`nobody answers a key ask (${heard.length} channel messages, none with a key)`)

// leader tab closes -> follower takes over, drafts still once
await a.close()
await b.waitForFunction(() => window.__queue.role === 'leader', null, { timeout: 10_000 })
await b.waitForTimeout(500)
assert.deepEqual(await ids(b), ['d1', 'd2'])
ok('follower becomes leader, takes over, drafts still one entry per id')

// db.update atomic + gcBlobs mark-and-sweep (isolated origin storage of this context)
const r = await b.evaluate(async () => {
  const db = await import('/src/lib/store/db.ts')
  await db.put('projects', 'probe-n', { n: 0 })
  await Promise.all(Array.from({ length: 20 }, () => db.update('projects', 'probe-n', (x) => ({ n: (x?.n ?? 0) + 1 }))))
  const n = (await db.get('projects', 'probe-n')).n
  const keep = await db.putBlob(new Uint8Array([7, 7])), drop = await db.putBlob(new Uint8Array([8, 8]))
  await db.put('projects', 'probe-ref', { cells: [`sha256:${keep}`] })
  const swept = await db.gcBlobs()
  return { n, swept, keep: !!(await db.getBlob(keep)), drop: !!(await db.getBlob(drop)) }
})
assert.equal(r.n, 20); assert.ok(r.keep && !r.drop && r.swept >= 1, JSON.stringify(r))
ok(`db.update: 20 concurrent increments = ${r.n}; gcBlobs swept ${r.swept}, kept the referenced blob`)
await browser.close()
