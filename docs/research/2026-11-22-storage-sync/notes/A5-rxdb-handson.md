# A5: RxDB 17 `replication-google-drive`, hands-on (2026-11-22)

Scope: offline test against `google-drive-mock` (no Google account), two RxDB databases ("desktop", "phone") replicating to one mock Drive folder. Nothing in any git repo was changed.

## Setup

- Folder: `C:\Users\shilo\AppData\Local\Temp\claude\1c6991cc318388db\0c402822-31d3-4b10-ae85-e89be8419a82\scratchpad\rxdb-test\`
- Pinned installs (`npm install -E --ignore-scripts`): `rxdb@17.6.0` (latest), `google-drive-mock@1.2.0` (the version in rxdb's `package.json` at tag 17.6.0; master now pins 1.2.3), `rxjs@7.8.2`, plus `express@5.2.1` and `cors@2.8.6` (the mock needs them but declares them only as devDependencies). `esbuild@0.28.2` was installed without saving, only to measure bundle size.
- Storage: `rxdb/plugins/storage-memory` wrapped in `validate-ajv` (dev-mode refuses to start without a validator, error DVM1).
- Wiring matches rxdb's own test (`test/replication-google-drive.test.ts`): `startServer(port)` and `googleDrive: { authToken: 'valid-token', apiEndpoint: 'http://localhost:<port>', folderPath, space: 'drive', transactionTimeout }`.
- Sync mode: `live: false`, one call to `replicateGoogleDrive()` + `awaitInitialReplication()` + `cancel()` per "come online" event. Live mode needs WebRTC (simple-peer, plus `node-datachannel` in Node) for change pings, so it was not tested; the source shows that live mode pulls only at start and when a peer sends a RESYNC over WebRTC. It does not poll.
- Instrumentation: `globalThis.fetch` is wrapped to count requests and request/response body bytes per route. `data:` URL fetches, which RxDB uses locally to decode base64, are excluded. The mock adds 0-20 ms of random latency per request; one exp1 run adds 150 ms (`serverLagBefore`).
- Run: `node --import ./fix-specifier.mjs run.mjs`. Exp5 was run with `BIG_BODY=1 ONLY5=1` (see the issues below). Raw outputs: `out-exp1-4.txt`, `out-exp5.txt`, `results-exp5.json`, `out-exp5-defaultmock.txt`.

## How the plugin stores data (from source and observation)

- Drive layout in `folderPath`: `rxdb.json`, `transaction.json` (a global lock taken with ETag compare-and-swap), `rxdb-wal.json` (write-ahead log), `docs/<id>.json` (one JSON file per document) and `signaling/`.
- Push takes the lock, checks for conflicts by downloading the current `docs/<id>.json` for every pushed row and deep-comparing it with `assumedMasterState`, then writes the non-conflicting rows into the WAL and releases the lock. Doc files are written only by the next transaction from any client, which reads the WAL, inserts or updates `docs/*.json` and empties the WAL. So every write is uploaded twice (WAL, then doc file), often by a different device.
- Pull lists `docs` with `modifiedTime >= checkpoint` (page size `batchSize + 6`), then GETs each file (5 in parallel). There are no batch requests and no changes feed.
- Deletes are tombstones (`_deleted: true` inside the doc file); files are never removed.
- Attachments are stored as base64 in `_attachments_data` inside the doc's JSON file, never as separate Drive files.
- Every `replicateGoogleDrive()` start runs `initDriveStructure`: **24 requests the first time, 17 every later time**, before any data moves.

## Results

### 1. Sequential insert (character manifest, 38.9 KB JSON, 12 items x 24 frames)

| Step | Requests (init + replicate) | Up | Down | ms (mock) | ms (+150 ms/request) |
|---|---|---|---|---|---|
| Desktop first push | 45 (24 + 21) | 39.7 KB | 50.8 KB | 837 | 7,267 |
| Phone first pull | 30 (17 + 13) | 39.5 KB* | 86.7 KB | 516 | 5,231 |
| Desktop edits one field, push | 40 (17 + 23) | 78.2 KB | 167 KB | 777 | 7,456 |
| Phone pulls that edit | 31 / 25 | 39 KB / 0.3 KB | 128 KB / 47 KB | 540 | 4,373 |
| Idle sync, nothing changed | 24 (17 + 7) | 0.3 KB | 8.8 KB | 447 | 4,249 |

\*The phone uploads the desktop's doc: its transaction drained the WAL into `docs/char-1.json`. The phone received the doc and the edit correctly. A one-field edit re-uploads the whole document twice (WAL, then the doc file).

### 2. Independent edits offline (desktop `items[1].color`, phone `items[2].prompt`; desktop syncs first)

- **Default handler:** both ended with `color=#ff0000` and the original prompt. **The phone's edit was silently lost**; nothing reached `error$`. The default `resolve()` returns `realMasterState`, so the first device to sync wins the whole document.
- **Custom handler (3-way field merge):** both ended with both edits. **The handler receives `{ newDocumentState, assumedMasterState, realMasterState }`**, and `assumedMasterState` (the common base) was present in every call. It is the plain document plus `_deleted`, without `_meta` or `_rev`, so a real 3-way merge works. The handler ran once, on the device that pushed second.

### 3. Same field (`items[1].color`: desktop `#ff0000`, phone `#00ff00`)

- **Default:** the first device to sync (`#ff0000`) wins and the other value is lost silently.
- **Custom handler:** it can keep both. It chose remote and recorded `{path:"$.items[1].color", mine:"#00ff00", theirs:"#ff0000"}` in a `conflicts` array, which synced to both devices. Any policy is possible because the handler returns the full document.

### 4. Delete vs. edit (default handler)

- **Deleter syncs first:** the document is deleted on both devices and the phone's edit is lost.
- **Editor syncs first:** the document is resurrected on the desktop with the phone's edit, and the delete is lost.
- The outcome depends on sync order, and no error is reported either way.

### 5. Binary artwork: 500 attachments x 900 random bytes (450 KB raw)

| | 1 doc, 500 attachments | 500 docs, 1 attachment each |
|---|---|---|
| Files in `docs/` | 1 (about 667 KB JSON) | 500 (400 right after the push; the last WAL batch of 100 landed on the next client's transaction) |
| Initial push | 45 req, 668 KB up, 679 KB down, 0.9 s | 515-753 req (varied per run), 1.40 MB up, 1.45-1.79 MB down, 3-5.4 s |
| First fresh-client pull | 30 req, 1.34 MB down (+668 KB up, draining the WAL) | 663 req, 1.0 MB down (+172 KB up, WAL drain) |
| Later fresh-client pull | (broken, see below) | 559 req, 825 KB down, 3.2 s on mock |
| Change one attachment, push | 46-48 req, 184 KB up, about 1 MB down | 368-481 req, 2-3.6 KB up, 0.5-0.67 MB down** |
| Other client pulls that change | 25 req, 70 KB down | 25-31 req, 11-15 KB down |

\*\*The pushing device downloads its own earlier writes again, because its pull checkpoint predates the WAL drain. That is a one-time echo of about 500 GETs.

Wire inflation: base64 adds 1.33x. A push puts about 3.1x the raw bytes on the wire (WAL plus doc file plus JSON). A clean fresh pull downloads about 1.8x raw. Each document costs about 1 GET to pull; there is no batching. At 100-200 ms per real request with 5 in parallel, 500 cells take about 10-20 s.

**Data-loss bug (reproduced 3 times):** with one doc holding 500 attachments, changing a single attachment pushes a row whose `_attachments_data` contains only the changed attachment. The Drive file then has 500 stubs and **1** data entry (61.7 KB instead of 667 KB). Existing clients are fine (500/500), but **a new client fails with `ensureNotFalsy() is falsy` and never receives the document (0/500)**. The per-document model (500 docs) was unaffected: 500/500 on a third fresh client.

### 6. Bundle, errors, warnings

- **Bundle** (esbuild, browser, minified; rxdb + dexie storage + attachments): core is 251 KB min / 84 KB gzip; with `replication-google-drive` it is 495 KB min / 156 KB gzip (**+72 KB gzip**). The biggest new parts are simple-peer (117 KB min), readable-stream (36 KB), buffer (25 KB) and rxdb/gdrive (18 KB). simple-peer is imported eagerly even with `live: false`. The browser build **fails to resolve the Node builtin `events`** (pulled in by readable-stream), so Vite or esbuild need a polyfill or alias.
- **ESM packaging bug:** `dist/esm/plugins/replication-google-drive/signaling.js` imports `'../replication-webrtc/connection-handler-simple-peer'` without `.js`, so Node ESM throws `ERR_MODULE_NOT_FOUND`. I worked around it with a resolve hook (`fix-specifier.mjs`). Bundlers tolerate it.
- **Stuck replication on a failed upload:** `runInTransaction` has no try/finally. When the WAL upload failed (HTTP 413 from the mock's 100 KB `express.json` limit on a 667 KB WAL), the lock stayed held, every retry waited out `transactionTimeout` and failed again, `awaitInitialReplication()` never resolved, and **`cancel()` never resolved**. `error$` only emitted generic `FETCH` errors. Real Drive's simple upload (`uploadType=media`) is limited to 5 MB, and the plugin writes up to 100 rows (the push `batchSize`) into one WAL upload, so large base64 batches can plausibly hit the same stall in production. This is inferred, not tested against real Drive. Exp5 numbers were therefore measured with an outer express app that has a 50 MB body limit (`BIG_BODY=1`).
- The docs mark the plugin **Beta since 17.0.0**. No premium plugins were needed: storage-memory, validate-ajv, attachments, dev-mode and replication-google-drive are all in the free Apache-2.0 package. Dev-mode prints a banner advertising Premium. Apart from the errors above, no other runtime warnings appeared.

## Takeaways for PixelDoll

- Field-level merge is possible (base state provided), but the default loses data silently, so a custom handler is mandatory.
- Per-request overhead is high: 17 to 24 requests just to start, 24 for an idle sync, whole-document rewrites, about 1 GET per document on pull, and writes uploaded twice. Content-addressed cells as 500 docs cost 500+ requests per fresh device.
- Attachments inline as base64 JSON: avoid putting many attachments on one doc (data-loss bug above). If used at all, use one doc per cell.
- The global lock file serializes all devices, and a failed request can wedge sync for `transactionTimeout`.
- Beta, an ESM packaging bug, a WebRTC dependency and an `events` polyfill requirement: it is not production-ready for this use case without patches.

## Script

`C:\Users\shilo\AppData\Local\Temp\claude\1c6991cc318388db\0c402822-31d3-4b10-ae85-e89be8419a82\scratchpad\rxdb-test\run.mjs` (full source below), plus `fix-specifier.mjs`:

```js
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('/connection-handler-simple-peer')) specifier += '.js';
  return next(specifier, context);
} });
```

```js
// Hands-on test of rxdb 17.6.0 replication-google-drive against google-drive-mock 1.2.0.
// Run: node run.mjs  (from this folder)
import { createRxDatabase, addRxPlugin, defaultConflictHandler, randomToken } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateGoogleDrive, listFilesInFolder } from 'rxdb/plugins/replication-google-drive';
import { startServer, createApp } from 'google-drive-mock';
import express from 'express';

const USE_DEV_MODE = process.env.DEVMODE !== '0';
if (USE_DEV_MODE) addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBAttachmentsPlugin);

// ---------- fetch instrumentation ----------
const stats = { n: 0, up: 0, down: 0, byRoute: {} };
const realFetch = globalThis.fetch;
function bodySize(b) {
  if (b == null) return 0;
  if (typeof b === 'string') return Buffer.byteLength(b);
  if (b instanceof Blob) return b.size;
  if (b.byteLength != null) return b.byteLength;
  return 0;
}
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  // RxDB decodes base64 attachments with fetch("data:..."); that is local, not network traffic
  if (u.protocol === "data:") { stats.dataUrlFetches = (stats.dataUrlFetches || 0) + 1; return realFetch(url, init); }
  const method = init.method || 'GET';
  let route = method + ' ' + u.pathname.replace(/\/files\/[^/?]+/, '/files/:id');
  if (u.searchParams.get('alt') === 'media') route += '?alt=media';
  if (u.searchParams.get('uploadType')) route += '?uploadType=' + u.searchParams.get('uploadType');
  stats.n++;
  stats.up += bodySize(init.body);
  stats.byRoute[route] = (stats.byRoute[route] || 0) + 1;
  if (process.env.FETCH_LOG) console.log('fetch>', route, bodySize(init.body));
  const res = await realFetch(url, init);
  if (process.env.FETCH_LOG) console.log('fetch<', route, res.status);
  const buf = await res.clone().arrayBuffer();
  stats.down += buf.byteLength;
  return res;
};
function snap() { return { n: stats.n, up: stats.up, down: stats.down, byRoute: { ...stats.byRoute } }; }
function diff(a, b = snap()) {
  const byRoute = {};
  for (const k of Object.keys(b.byRoute)) {
    const d = b.byRoute[k] - (a.byRoute[k] || 0);
    if (d) byRoute[k] = d;
  }
  return { requests: b.n - a.n, bytesUp: b.up - a.up, bytesDown: b.down - a.down, byRoute };
}

// ---------- mock servers ----------
const PORT = 38117, PORT_LAG = 38118;
// google-drive-mock uses express.json() with the default 100 KB body limit, so any WAL/doc upload
// above 100 KB gets HTTP 413 (real Drive accepts up to 5 MB simple uploads). BIG_BODY=1 mounts the
// mock under an outer app that pre-parses bodies with a 50 MB limit (body-parser then skips re-parsing).
function startMock(port, config) {
  if (!process.env.BIG_BODY) return startServer(port, 'localhost', config);
  const outer = express();
  const verify = (req, res, buf) => { req.rawBody = buf; };
  outer.use(express.json({ limit: '50mb', verify }));
  outer.use(express.text({ type: ['multipart/mixed', 'multipart/related', 'text/*', 'application/xml'], limit: '50mb', verify }));
  outer.use(createApp(config));
  return outer.listen(port, 'localhost');
}
const server = startMock(PORT);
const serverLag = startMock(PORT_LAG, { serverLagBefore: 150 });
await new Promise(r => setTimeout(r, 300));

function driveOpts(folderPath, port = PORT) {
  return {
    oauthClientId: 'mock-client-id',
    authToken: 'valid-token',
    apiEndpoint: 'http://localhost:' + port,
    folderPath,
    space: 'drive',
    transactionTimeout: 10000,
  };
}

// ---------- schema / data ----------
const charSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    name: { type: 'string' },
    items: { type: 'array', items: { type: 'object' } },
    conflicts: { type: 'array', items: { type: 'object' } },
  },
  required: ['id', 'name', 'items'],
};
const cellSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: { id: { type: 'string', maxLength: 128 }, n: { type: 'number' } },
  required: ['id'],
  attachments: {},
};

function makeCharacter() {
  const items = [];
  for (let i = 0; i < 12; i++) {
    items.push({
      id: 'item-' + i,
      slot: ['hair', 'head', 'body', 'boots', 'cape', 'weapon'][i % 6],
      color: '#' + (0x100000 + i * 12345).toString(16).slice(0, 6),
      prompt: 'a nice item number ' + i,
      palette: Array.from({ length: 16 }, (_, k) => ({ from: '#' + (k * 111111).toString(16).padStart(6, '0').slice(0, 6), to: '#ffffff' })),
      frames: Array.from({ length: 24 }, (_, f) => ({ dir: f % 8, move: 'walk', frame: f, cell: 'sha256-' + randomToken(40), dx: f, dy: -f })),
    });
  }
  return { id: 'char-1', name: 'Knight', items, conflicts: [] };
}

async function makeDb(name, { schema = charSchema, conflictHandler } = {}) {
  const db = await createRxDatabase({ name: name + '-' + randomToken(6), storage: USE_DEV_MODE ? wrappedValidateAjvStorage({ storage: getRxStorageMemory() }) : getRxStorageMemory(), multiInstance: false });
  const coll = { schema };
  if (conflictHandler) coll.conflictHandler = conflictHandler;
  await db.addCollections({ docs: coll });
  return db;
}

// one-shot (non-live) sync = "come online, sync, go offline"
async function syncOnce(db, folderPath, { port = PORT, pushBatch, pullBatch } = {}) {
  const s0 = snap();
  const t0 = performance.now();
  const rs = await replicateGoogleDrive({
    replicationIdentifier: 'pixeldoll-test',
    collection: db.docs,
    googleDrive: driveOpts(folderPath, port),
    live: false,
    pull: pullBatch ? { batchSize: pullBatch } : {},
    push: pushBatch ? { batchSize: pushBatch } : {},
  });
  const tInit = performance.now();
  const sInit = snap();
  const errors = [];
  rs.error$.subscribe(e => { errors.push(String(e && (e.message || e)).slice(0, 300)); if (process.env.FETCH_LOG) console.log("error$>", String(e && (e.message || e)).slice(0, 200).replace(/s+/g, " ")); });
  const TIMEOUT = Number(process.env.SYNC_TIMEOUT_MS || 90000);
  const outcome = await Promise.race([
    rs.awaitInitialReplication().then(() => 'ok'),
    new Promise(r => setTimeout(() => r('timeout'), TIMEOUT)),
  ]);
  const t1 = performance.now();
  if (outcome !== 'ok') {
    if (process.env.FETCH_LOG) console.log("sync timed out, cancelling");
    await Promise.race([rs.cancel(), new Promise(r => setTimeout(r, 3000))]); // cancel() never resolves while the push handler is stuck retrying
    throw new Error('sync did not finish in ' + TIMEOUT + 'ms after ' + diff(s0).requests + ' requests; errors: ' + [...new Set(errors)].slice(0, 3).join(' | '));
  }
  const driveStructure = rs.driveStructure;
  await rs.cancel();
  return {
    ms: Math.round(t1 - t0), initMs: Math.round(tInit - t0),
    init: diff(s0, sInit), replicate: diff(sInit), total: diff(s0),
    errors, driveStructure,
  };
}

async function countDriveFiles(folderPath, ds) {
  const o = driveOpts(folderPath);
  const docs = await listFilesInFolder(o, ds.docsFolderId);
  const root = await listFilesInFolder(o, ds.rootFolderId);
  return { docsFolderFiles: docs.length, rootFolderEntries: root.length, rootNames: root.map(f => f.name) };
}

const progress = m => process.stdout.write("[progress " + new Date().toISOString().slice(11,19) + "] " + m + "\n");
const out = {};
const log = (k, v) => { out[k] = v; console.log('\n### ' + k + '\n' + JSON.stringify(v, null, 2)); };

// ---------- three-way field merge conflict handler ----------
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function merge3(base, mine, theirs, path, conflicts) {
  if (eq(mine, theirs)) return mine;
  if (eq(base, mine)) return theirs;
  if (eq(base, theirs)) return mine;
  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const r = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
      const v = merge3(base[k], mine[k], theirs[k], path + '.' + k, conflicts);
      if (v !== undefined) r[k] = v;
    }
    return r;
  }
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs) && base.length === mine.length && base.length === theirs.length) {
    return base.map((b, i) => merge3(b, mine[i], theirs[i], path + '[' + i + ']', conflicts));
  }
  // true same-field conflict: keep remote (theirs) as value, record both
  conflicts.push({ path, mine, theirs });
  return theirs;
}
const handlerCalls = [];
const mergeHandler = {
  isEqual: defaultConflictHandler.isEqual,
  async resolve(input) {
    const { assumedMasterState: base, realMasterState: theirs, newDocumentState: mine } = input;
    handlerCalls.push({
      hasAssumedMasterState: !!base,
      keys: Object.keys(input),
      deleted: { base: base?._deleted, mine: mine?._deleted, theirs: theirs?._deleted },
      docKeys: base ? Object.keys(base) : null,
    });
    if (!base) return theirs;
    if (theirs._deleted || mine._deleted) return theirs; // keep default semantics for deletes
    const conflicts = [];
    const { conflicts: _bc, ...b } = base; const { conflicts: mc = [], ...m } = mine; const { conflicts: tc = [], ...t } = theirs;
    const merged = merge3(b, m, t, '$', conflicts);
    merged.conflicts = [...tc, ...conflicts];
    return merged;
  },
};

function summarize(doc) {
  if (!doc) return null;
  return {
    deleted: !!doc._deleted,
    item1color: doc.items?.[1]?.color,
    item2prompt: doc.items?.[2]?.prompt,
    conflicts: doc.conflicts,
  };
}
async function state(db) {
  const d = await db.docs.findOne('char-1').exec();
  return d ? summarize(d.toJSON()) : { deleted: true };
}

// ---------- Experiment 1: sequential ----------
async function exp1(port, label) {
  const folder = 'exp1-' + label + '-' + randomToken(6);
  const desktop = await makeDb('desktop');
  const phone = await makeDb('phone');
  const char = makeCharacter();
  const json = JSON.stringify(char);
  await desktop.docs.insert(char);
  const push = await syncOnce(desktop, folder, { port });
  const pull = await syncOnce(phone, folder, { port });
  const got = await phone.docs.findOne('char-1').exec();
  // second, incremental change: one field
  await desktop.docs.findOne('char-1').exec().then(d => d.incrementalModify(x => { x.items[0].color = '#000000'; return x; }));
  const push2 = await syncOnce(desktop, folder, { port });
  const pull2 = await syncOnce(phone, folder, { port });
  const got2 = await phone.docs.findOne('char-1').exec();
  // no-op sync (nothing changed)
  const noop = await syncOnce(phone, folder, { port });
  const r = {
    docJsonBytes: json.length,
    phoneReceived: !!got && JSON.stringify(got.toJSON().items) === JSON.stringify(char.items),
    phoneGotEdit: got2?.items[0].color === '#000000',
    desktopFirstPush: push, phoneFirstPull: pull,
    desktopEditPush: push2, phoneEditPull: pull2, idleSync: noop,
  };
  for (const k of ['desktopFirstPush', 'phoneFirstPull', 'desktopEditPush', 'phoneEditPull', 'idleSync']) delete r[k].driveStructure;
  await desktop.remove(); await phone.remove();
  return r;
}

// ---------- Experiments 2-4 ----------
async function pair(conflictHandler) {
  const desktop = await makeDb('desktop', { conflictHandler });
  const phone = await makeDb('phone', { conflictHandler });
  return { desktop, phone };
}
async function setupInSync(conflictHandler) {
  const folder = 'exp-' + randomToken(8);
  const { desktop, phone } = await pair(conflictHandler);
  await desktop.docs.insert(makeCharacter());
  await syncOnce(desktop, folder);
  await syncOnce(phone, folder);
  return { folder, desktop, phone };
}
const editColor = (db, c) => db.docs.findOne('char-1').exec().then(d => d.incrementalModify(x => { x.items[1].color = c; return x; }));
const editPrompt = (db, p) => db.docs.findOne('char-1').exec().then(d => d.incrementalModify(x => { x.items[2].prompt = p; return x; }));

async function runConflict(name, conflictHandler, doEdits, order = ['desktop', 'phone']) {
  handlerCalls.length = 0;
  const { folder, desktop, phone } = await setupInSync(conflictHandler);
  const dbs = { desktop, phone };
  await doEdits(desktop, phone);
  const syncs = [];
  // first device comes online, then the second, then the first again to pull the result
  for (const who of [order[0], order[1], order[0], order[1]]) {
    const s = await syncOnce(dbs[who], folder);
    syncs.push({ who, requests: s.total.requests, errors: s.errors });
  }
  const r = {
    order: order.join(' then '),
    desktop: await state(desktop), phone: await state(phone),
    handlerCalls: handlerCalls.slice(), syncs,
  };
  await desktop.remove(); await phone.remove();
  log(name, r);
}

// ---------- Experiment 5: attachments ----------
function rnd(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
async function verifyAtt(src, dst) {
  let verified = 0, attCount = 0, missing = 0, errors = 0, missingDocs = 0;
  for (const da of await src.docs.find().exec()) {
    const dd = await dst.docs.findOne(da.id).exec();
    if (!dd) missingDocs++;
    for (const att of da.allAttachments()) {
      attCount++;
      const bt = dd?.getAttachment(att.id);
      if (!bt) { missing++; continue; }
      try {
        const x = new Uint8Array(await (await att.getData()).arrayBuffer());
        const y = new Uint8Array(await (await bt.getData()).arrayBuffer());
        if (x.length === y.length && x.every((v, i) => v === y[i])) verified++;
      } catch (e) { errors++; }
    }
  }
  return verified + '/' + attCount + ' identical' + (missing ? ', ' + missing + ' missing' : '') + (errors ? ', ' + errors + ' getData errors' : '') + (missingDocs ? ', ' + missingDocs + ' docs missing entirely' : '');
}
async function exp5() {
  const N = 500, SIZE = 900;
  const res = {};
  for (const variant of ['oneDoc500Attachments', 'manyDocsOneAttachment']) {
    const folder = 'exp5-' + variant + '-' + randomToken(6);
    const a = await makeDb('desktop', { schema: cellSchema });
    const tIns = performance.now();
    if (variant === 'oneDoc500Attachments') {
      const d = await a.docs.insert({ id: 'cells', n: 0 });
      await d.putAttachments(Array.from({ length: N }, (_, i) => ({ id: 'c' + i + '.png', data: new Blob([rnd(SIZE)], { type: 'image/png' }), type: 'image/png' })));
    } else {
      await a.docs.bulkInsert(Array.from({ length: N }, (_, i) => ({ id: 'cell-' + i, n: i })));
      const docs = await a.docs.find().exec();
      for (const d of docs) await d.putAttachment({ id: 'png', data: new Blob([rnd(SIZE)], { type: 'image/png' }), type: 'image/png' });
    }
    const insertMs = Math.round(performance.now() - tIns);
    progress(variant + " inserted in " + insertMs + "ms; pushing");
    let push, pushErr;
    try { push = await syncOnce(a, folder); } catch (e) { pushErr = String(e.message || e).slice(0, 400); }
    const filesAfterPush = push ? await countDriveFiles(folder, push.driveStructure) : null;
    // fresh client full pull
    const b = await makeDb('fresh', { schema: cellSchema });
    let pull, pullErr;
    progress(variant + " pushed: " + JSON.stringify(push && {ms: push.ms, req: push.total.requests}) + " err=" + pushErr + "; fresh pull");
    try { pull = await syncOnce(b, folder); } catch (e) { pullErr = String(e.message || e).slice(0, 400); }
    // verify binary integrity on fresh client
    const filesAfterNextTransaction = pull ? await countDriveFiles(folder, pull.driveStructure) : null;
    const dataUrlFetchesDuringPull = stats.dataUrlFetches;
    const verifiedB = await verifyAtt(a, b);
    // change one cell on A, push, B pulls
    if (variant === 'oneDoc500Attachments') {
      const d = await a.docs.findOne('cells').exec();
      await d.putAttachment({ id: 'c7.png', data: new Blob([rnd(SIZE)], { type: 'image/png' }), type: 'image/png' });
    } else {
      const d = await a.docs.findOne('cell-7').exec();
      await d.putAttachment({ id: 'png', data: new Blob([rnd(SIZE)], { type: 'image/png' }), type: 'image/png' });
    }
    const push1 = await syncOnce(a, folder);
    const pull1 = await syncOnce(b, folder);
    const verifiedBAfterChange = await verifyAtt(a, b);
    const c = await makeDb('third', { schema: cellSchema });
    let pull3, pull3Err;
    try { pull3 = await syncOnce(c, folder); } catch (e) { pull3Err = String(e.message || e).slice(0, 400); }
    const verifiedThirdFreshClient = await verifyAtt(a, c);
    let storedFile = null;
    if (variant === 'oneDoc500Attachments' && pull3) {
      const o = driveOpts(folder);
      const list = await listFilesInFolder(o, pull3.driveStructure.docsFolderId);
      const txt = await (await fetch(o.apiEndpoint + '/drive/v3/files/' + list[0].id + '?alt=media', { headers: { Authorization: 'Bearer ' + o.authToken } })).text();
      const j = JSON.parse(txt);
      storedFile = { name: list[0].name, bytes: txt.length, topLevelKeys: Object.keys(j), attachmentStubs: Object.keys(j._attachments || {}).length, attachmentsDataEntries: Object.keys(j._attachments_data || {}).length };
    }
    const strip = s => s && (delete s.driveStructure, s);
    res[variant] = {
      rawBinaryBytes: N * SIZE, insertMs, filesAfterPush, filesAfterNextTransaction, dataUrlFetchesSoFar: dataUrlFetchesDuringPull, pushErr, pullErr,
      initialPush: strip(push), freshFullPull: strip(pull),
      verifiedAttachmentsOnFreshClient: verifiedB, verifiedBAfterChange, verifiedThirdFreshClient, pull3Err, storedFileAfterChange: storedFile,
      changeOneCellPush: strip(push1), changeOneCellPull: strip(pull1), thirdClientFullPull: strip(pull3),
    };
    await a.remove(); await b.remove(); await c.remove();
  }
  log('exp5_attachments', res);
}

// ---------- run ----------
const warnings = [];
const origWarn = console.warn; console.warn = (...a) => { warnings.push(a.map(String).join(' ').slice(0, 400)); };
const origErr = console.error; console.error = (...a) => { warnings.push('ERROR: ' + a.map(String).join(' ').slice(0, 400)); };
process.on('unhandledRejection', e => warnings.push('unhandledRejection: ' + String(e?.stack || e).slice(0, 400)));

try {
  if (!process.env.ONLY5) {
  log('exp1_sequential_mock_0-20ms', await exp1(PORT, 'fast'));
  log('exp1_sequential_mock_plus150ms', await exp1(PORT_LAG, 'lag'));

  const indepEdits = async (desktop, phone) => { await editColor(desktop, '#ff0000'); await editPrompt(phone, 'phone prompt'); };
  await runConflict('exp2_independent_default', undefined, indepEdits);
  await runConflict('exp2_independent_mergeHandler', mergeHandler, indepEdits);

  const sameField = async (desktop, phone) => { await editColor(desktop, '#ff0000'); await editColor(phone, '#00ff00'); };
  await runConflict('exp3_samefield_default', undefined, sameField);
  await runConflict('exp3_samefield_mergeHandler', mergeHandler, sameField);

  const delVsEdit = async (desktop, phone) => { await desktop.docs.findOne('char-1').exec().then(d => d.remove()); await editPrompt(phone, 'phone prompt'); };
  await runConflict('exp4_delete_vs_edit_default_deleterSyncsFirst', undefined, delVsEdit, ['desktop', 'phone']);
  await runConflict('exp4_delete_vs_edit_default_editorSyncsFirst', undefined, delVsEdit, ['phone', 'desktop']);

  }
  await exp5();
} catch (e) {
  console.log('FATAL', e && (e.stack || e));
  out.fatal = String(e && (e.stack || e)).slice(0, 2000);
}
log('warnings', [...new Set(warnings)]);
const fs = await import('node:fs');
fs.writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2));
server.close(); serverLag.close();
process.exit(0);
```
