// Only served by Vite's dev server. All PixelLab traffic is replaced before the application loads.
localStorage.setItem('pixeldoll.agentKey', 'off');
localStorage.setItem('pixeldoll.welcomed', '1');
// Never read or replace a person's remembered token. The app receives only the memory fixture key below.
const originalFetch = window.fetch.bind(window);
const stateKey = 'pixeldoll.capacityFixture';
interface State { tier: number; external: number; jobs: string[]; posts: number; refused: number; complete: boolean }
const initial = (): State => ({ tier: 3, external: 0, jobs: [], posts: 0, refused: 0, complete: false });
const limit = (tier: number) => tier === 0 ? 1 : tier === 1 ? 8 : tier === 2 ? 10 : 20;
const read = (): State => JSON.parse(localStorage.getItem(stateKey) ?? JSON.stringify(initial()));
const write = (s: State) => localStorage.setItem(stateKey, JSON.stringify(s));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin !== 'https://api.pixellab.ai') return originalFetch(input, init);
  const s = read(), path = url.pathname, method = init?.method ?? 'GET';
  if (path === '/v2/balance') return Response.json({ subscription: { status: s.tier === 0 ? 'trial' : 'active', plan: s.tier === 0 ? 'Free trial' : `Tier ${s.tier}: Pixel ${s.tier === 3 ? 'Architect' : s.tier === 2 ? 'Artisan' : 'Apprentice'}`, generations: 10000, total: 10000 }, credits: { usd: 0 } });
  if (method === 'POST') {
    s.posts++;
    if (s.external + s.jobs.length >= limit(s.tier)) {
      s.refused++; write(s);
      return Response.json({ detail: 'Concurrency limit reached' }, { status: 429, headers: { 'Retry-After': '3' } });
    }
    const id = crypto.randomUUID(); s.jobs.push(id); write(s);
    return Response.json({ background_job_id: id });
  }
  const id = path.split('/').at(-1)!;
  if (s.complete) { s.jobs = s.jobs.filter((job) => job !== id); write(s); }
  return Response.json({ id, status: s.complete ? 'completed' : 'processing', last_response: s.complete ? { images: [{ type: 'base64', base64: png }] } : {} });
};
// Dynamic imports ensure interception is active even for the first account read.
await import('../../src/main.ts');
const { queue } = await import('../../src/lib/pixellab/queue.ts');
const { ui } = await import('../../src/studio/state.svelte.ts');
const { refreshBalance } = await import('../../src/lib/app.svelte.ts');
// setKey on the queue does not touch the remembered-key preference.
queue.setKey('offline-fixture-not-a-key');
await refreshBalance();
const button = (id: string, action: () => unknown) => document.getElementById(id)!.addEventListener('click', () => void action());
for (const tier of [0, 1, 2, 3]) button(`tier${tier}`, async () => { const s = read(); s.tier = tier; write(s); await refreshBalance(); });
button('enqueue', async () => { for (let n = 0; n < 25; n++) await queue.enqueue({ method: 'POST', path: '/create-character-v3', body: { description: `Fixture ${crypto.randomUUID()}` } }, { label: `Queue test ${n + 1}` }); });
button('busy', () => { const s = read(); s.external = limit(s.tier) - s.jobs.length; write(s); });
button('release', () => { const s = read(); s.external = 0; write(s); });
button('complete', () => { const s = read(); s.complete = true; write(s); });
button('activity', () => { ui.sheet = 'activity'; });
button('connect', () => { ui.sheet = 'connect'; });
setInterval(() => {
  const s = read();
  document.getElementById('stats')!.textContent = `${queue.role} · ${s.jobs.length} remote · ${s.external} external · ${s.posts} POSTs · ${s.refused} deferred`;
  // Native modal dialogs make siblings inert. Keep the fixture controls in the current top layer.
  const panel = document.getElementById('fixture')!, host = document.querySelector('dialog[open]') ?? document.body;
  if (panel.parentElement !== host) host.append(panel);
}, 250);
ui.sheet = 'activity';
