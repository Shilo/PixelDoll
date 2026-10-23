// Real GDevelop editor core import, official HTML exporter, and shipped runtime rendering.
// Usage: node scripts/verify-gdevelop-engine.mjs <portable GDevelop directory> <libGD.js extracted from its resources/app.asar>
// No downloads/installs; all generated evidence goes to node_modules/.cache/gdevelop-native-verification/.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { gdevelopFiles, gdObjectName, gdCharacterKey } from '../src/lib/export/gdevelop.ts';
import { gdFixture, gdSheets } from '../test/fixtures/gdevelop-native.ts';

const engine = path.resolve(process.argv[2] ?? 'node_modules/.cache/export-review-tools/gdevelop/engine');
const corePath = path.resolve(process.argv[3] ?? 'node_modules/.cache/export-review-tools/gdevelop/libGD.cjs');
const output = path.resolve('node_modules/.cache/gdevelop-native-verification');
fs.mkdirSync(output, { recursive: true });
const normalize = (s) => s.replace(/\\/g, '/');
const crc32 = (bytes) => { let crc = -1; for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; };
const chunk = (type, bytes) => { const content = Buffer.concat([Buffer.from(type), bytes]), out = Buffer.alloc(bytes.length + 12); out.writeUInt32BE(bytes.length); content.copy(out, 4); out.writeUInt32BE(crc32(content), out.length - 4); return out; };
const png = (im) => {
  const header = Buffer.alloc(13); header.writeUInt32BE(im.w); header.writeUInt32BE(im.h, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((im.w * 4 + 1) * im.h);
  for (let y = 0; y < im.h; y++) Buffer.from(im.data.buffer, im.data.byteOffset + y * im.w * 4, im.w * 4).copy(pixels, y * (im.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
};
const m = gdFixture();
const other = gdFixture(); other.rig.baseHash = 'sha256:' + '2'.repeat(64);
const firstFiles = gdevelopFiles(m, gdSheets()), otherFiles = gdevelopFiles(other, gdSheets());
for (const f of [...firstFiles, ...otherFiles]) {
  const file = path.join(output, f.name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof f.data === 'string' || f.data instanceof Uint8Array ? f.data : png(f.data));
}
// Same-named distinct characters sharing base/main and every other item ID must coexist in one native scene.
const nativeProject = JSON.parse(firstFiles.find((f) => f.name === 'gdevelop/game.json').data);
const otherProject = JSON.parse(otherFiles.find((f) => f.name === 'gdevelop/game.json').data);
nativeProject.resources.resources.push(...otherProject.resources.resources);
nativeProject.layouts[0].objects.push(...otherProject.layouts[0].objects);
nativeProject.layouts[0].events.push(...otherProject.layouts[0].events);
fs.writeFileSync(path.join(output, 'gdevelop/game.json'), JSON.stringify(nativeProject));
const require = createRequire(import.meta.url);
const gd = await require(corePath)({ locateFile: (name) => path.join(path.dirname(corePath), name) });
gd.JsPlatform.get();
const project = new gd.Project(), source = gd.Serializer.fromJSON(fs.readFileSync(path.join(output, 'gdevelop/game.json'), 'utf8'));
project.addPlatform(gd.JsPlatform.get());
project.unserializeFrom(source); project.setProjectFile(normalize(path.join(output, 'gdevelop/game.json')));
assert.equal(project.getLayout('Paperdoll').getObjects().getObjectsCount(), 8);
const afs = new gd.AbstractFileSystemJS();
Object.assign(afs, {
  mkDir: (p) => { fs.mkdirSync(p, { recursive: true }); return true; },
  dirExists: fs.existsSync,
  clearDir: (p) => { const target = path.resolve(p); assert.ok(target.startsWith(output + path.sep)); fs.mkdirSync(target, { recursive: true }); for (const n of fs.readdirSync(target)) fs.rmSync(path.join(target, n), { recursive: true, force: true }); },
  getTempDir: () => normalize(path.join(output, 'temp')),
  fileNameFrom: path.posix.basename, dirNameFrom: path.posix.dirname, isAbsolute: path.isAbsolute,
  makeAbsolute: (p, base) => normalize(path.resolve(base, p)), makeRelative: (p, base) => normalize(path.relative(base, p)),
  copyFile: (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); return true; },
  writeToFile: (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return true; },
  readFile: (p) => fs.readFileSync(p, 'utf8'), fileExists: fs.existsSync,
  readDir: () => new gd.VectorString(),
});
const exporter = new gd.Exporter(afs, normalize(path.join(engine, 'resources/GDJS')));
const exported = path.join(output, 'html');
const options = new gd.ExportOptions(project, normalize(exported)); options.setTarget('web');
assert.ok(exporter.exportWholePixiProject(options), exporter.getLastError());
console.log('Native GDevelop 5.6.285 editor core import and official web export passed.');
const server = createServer((req, res) => {
  const file = path.resolve(exported, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(exported + path.sep)) { res.writeHead(403); return res.end(); }
  try { const actual = fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file; res.setHeader('Content-Type', actual.endsWith('.js') ? 'text/javascript' : actual.endsWith('.png') ? 'image/png' : 'text/html'); const data = fs.readFileSync(actual); res.end(actual.endsWith('index.html') ? data.toString().replace('var game = new gdjs.RuntimeGame', 'var game = window.__nativeGDGame = new gdjs.RuntimeGame') : data); } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => { const scene = window.__nativeGDGame?.getSceneStack().getCurrentScene(); return scene && Object.keys(scene).some((k) => k.startsWith('PixelDoll_PD_')); });
  const result = await page.evaluate(({ bodyName, hairName, hatName, tuckedName, primaryKey, otherKey }) => {
    const game = window.__nativeGDGame, scene = game.getSceneStack().getCurrentScene();
    const key = primaryKey;
    if (!key) throw new Error('Native controller not initialized');
    const library = scene[key], d = library.dolls[0];
    const distinctLibraries = !!scene[otherKey] && scene[otherKey] !== library && scene[otherKey].dolls[0].nodes !== d.nodes;
    const color = (d, name) => {
      const node = d.nodes.get(name), sprite = node.getRendererObject(), canvas = sprite.texture.baseTexture.resource.source;
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    d.play('walk', 'south');
    const body = d.nodes.get(bodyName).getRendererObject(), hat = d.nodes.get(hatName).getRendererObject();
    const origins = { body: [body.position.x - body.anchor.x * body.texture.width, body.position.y - body.anchor.y * body.texture.height], hat: [hat.position.x - hat.anchor.x * hat.texture.width, hat.position.y - hat.anchor.y * hat.texture.height] };
    const initial = { cell: d.cell, base: color(d, bodyName), hair: color(d, tuckedName) };
    const extract = () => game.getRenderer().getPIXIRenderer().extract.pixels(body);
    const renderedBody = [...extract().slice(0, 4)], initialMarker = [...extract().slice(-4)];
    d.update(80); const next = { cell: d.cell, hatZ: d.nodes.get(hatName).getZOrder(), bodyZ: d.nodes.get(bodyName).getZOrder() };
    const nextMarker = [...extract().slice(-4)];
    const second = library.create(400, 240); second.applyPreset('red');
    const independent = { first: color(d, bodyName), second: color(second, bodyName), secondHair: color(second, hairName) };
    d.play('stop', 'south'); d.update(999); const stopped = d.cell;
    d.equip('head', null); const hatHidden = d.nodes.get(hatName).isHidden();
    d.m.items.find((i) => i.id === 'hat').hides = ['hair']; d.equip('head', 'hat');
    const hiddenHair = [...d.nodes].filter(([name]) => name === hairName || name === tuckedName).every(([, n]) => n.isHidden());
    let rejects = false; try { d.play('walk', 'east'); } catch { rejects = true; }
    d.destroy(); const destroyed = d.nodes.size === 0 && second.nodes.size > 0;
    return { initial, next, independent, origins, renderedBody, initialMarker, nextMarker, stopped, hatHidden, hiddenHair, rejects, destroyed, distinctLibraries };
  }, { bodyName: gdObjectName('base', 'main', gdCharacterKey(m)), hairName: gdObjectName('hair', 'main', gdCharacterKey(m)), hatName: gdObjectName('hat', 'main', gdCharacterKey(m)), tuckedName: gdObjectName('hair~hat', 'main', gdCharacterKey(m)), primaryKey: 'PixelDoll_PD_' + gdCharacterKey(m), otherKey: 'PixelDoll_PD_' + gdCharacterKey(other) });
  assert.deepEqual(result.initial, { cell: 1, base: [0,0,255,255], hair: [0,255,255,255] });
  assert.deepEqual(result.renderedBody, [0,0,255,255]);
  assert.deepEqual(result.initialMarker, [0,200,0,255]); assert.deepEqual(result.nextMarker, [255,200,0,255]);
  assert.equal(result.next.cell, 0); assert.ok(result.next.hatZ < result.next.bodyZ);
  assert.deepEqual(result.independent, { first: [0,0,255,255], second: [255,0,0,255], secondHair: [255,0,255,255] });
  assert.deepEqual(result.origins, { body: [319, 238], hat: [318, 237] });
  assert.equal(result.stopped, 1); assert.ok(result.hatHidden && result.hiddenHair && result.rejects && result.destroyed && result.distinctLibraries);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'native-preview.png') });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ version: '5.6.285', method: 'Official editor WASM import + official web exporter + shipped GDJS/PIXI runtime', ...result, errors }, null, 2));
  console.log('Actual shipped GDevelop runtime passed timing, origin resources, tuck, z, palettes, independent dolls, stop, unequip and destroy checks.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }

