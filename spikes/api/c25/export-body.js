// Paste into the agent dev server page (http://localhost:5199) after starting `node c25/receive.mjs <name>`:
// sends one Studio character (rig, measured skeletons, rest views, idle/walk body frames) to the local receiver.
// Change NAME to the character's name. The dev CSP allows ws://127.0.0.1:*; production builds do not.
const NAME = 'C25 body B';
const db = await new Promise((res, rej) => { const r = indexedDB.open('pixeldoll'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const all = (s) => new Promise((res) => { const t = db.transaction(s).objectStore(s).getAll(); t.onsuccess = () => res(t.result); });
const get = (s, k) => new Promise((res) => { const t = db.transaction(s).objectStore(s).get(k); t.onsuccess = () => res(t.result); });
const p = (await all('projects')).find((x) => JSON.stringify(x).includes(NAME));
const m = p.manifest, rig = m.rig, drawn = rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
const body = m.items.find((i) => i.slot === 'body'), shas = new Set(drawn.map((d) => rig.rest[d].image));
for (const a of ['idle', 'walk']) for (const d of drawn) for (const s of body.layers[0].cells[a][d]) shas.add(s);
const toB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
const images = {};
for (const s of shas) { const b = (await get('blobs', s)) ?? (await get('blobs', s.replace(/^sha256:/, ''))); images[s] = await toB64(b instanceof Blob ? b : b?.blob ?? b?.data); }
const payload = JSON.stringify({ rig, skeletons: p.skeletons, body: { cells: { idle: body.layers[0].cells.idle, walk: body.layers[0].cells.walk } }, images });
await new Promise((res, rej) => { const ws = new WebSocket('ws://127.0.0.1:5297'); ws.onopen = () => ws.send(payload); ws.onclose = res; ws.onerror = () => rej(new Error('ws error')); });
