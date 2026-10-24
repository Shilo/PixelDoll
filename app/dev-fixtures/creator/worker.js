import { CharacterApi } from '/test/fixtures/character-api.ts'
const fixture = new CharacterApi()
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.hostname.endsWith('pixellab.ai')) event.respondWith((async () => {
    // Every PixelLab request is handled locally. Unknown routes fail closed.
    try { return await fixture.handle(event.request.method, url.href, event.request.method === 'POST' ? await event.request.json() : null) }
    catch (error) { return Response.json({ detail: String(error) }, { status: 500 }) }
  })())
})
