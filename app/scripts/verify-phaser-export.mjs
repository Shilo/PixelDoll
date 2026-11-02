// Real pinned engines, no PixelLab calls or application dependencies installed.
// node --experimental-transform-types app/scripts/verify-phaser-export.mjs [--zip actual-ui-export.zip]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { exportZip } from '../src/lib/export/export.ts';
import { applyExportSettings } from '../src/lib/store/export-settings.ts';
import { unzip } from '../src/lib/store/zip.ts';
import { baseHashOf, cellHash } from '../src/lib/rig/rig.ts';
import { makeImg } from '../src/lib/image/png.ts';

const app = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { versions: { type: 'string' }, 'vendor-dir': { type: 'string' }, output: { type: 'string' }, zip: { type: 'string', multiple: true } } });
const versions = (values.versions ?? process.env.PHASER_VERSIONS ?? '3.80.1,3.90.0,4.1.0').split(',');
assert(versions.every(v => /^\d+\.\d+\.\d+$/.test(v)), 'Use explicit release versions.');
const vendor = resolve(values['vendor-dir'] ?? process.env.PHASER_VENDOR_DIR ?? join(app, 'node_modules/.cache/export-review-phaser'));
const output = resolve(values.output ?? process.env.PHASER_REVIEW_OUTPUT ?? join(vendor, 'results.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(vendor, { recursive: true });
const bundles = [];
for (const version of versions) {
  const file = join(vendor, `phaser-${version}.js`), source = `https://raw.githubusercontent.com/phaserjs/phaser/v${version}/dist/phaser.js`;
  let bytes;
  try { bytes = await readFile(file); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Downloading Phaser ${version}: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer()); await writeFile(file, bytes);
  }
  bundles.push({ version, file, source, sha256: sha(bytes) });
}

async function fixtureArchive() {
  const images = new Map(), body = [], hats = [];
  for (const size of [64, 96]) for (let cell = 0; cell < 2; cell++) {
    const image = makeImg(size, size);
    for (let y = 0; y < (size === 64 ? size : 8); y++) for (let x = 0; x < size; x++) image.data.set([100, 100, 100, 255], (y * size + x) * 4);
    image.data.set(cell ? [0, 255, 0, 255] : [255, 0, 0, 255], ((size === 64 ? 32 : 4) * size + size / 2) * 4);
    const hash = await cellHash(image); images.set(hash, image); (size === 64 ? body : hats).push(hash);
  }
  const animations = ['walk', 'jump'].map(id => ({ id, cells: 2, loop: id === 'jump', frames: [{ cell: 0, ms: 80 }, { cell: 1, ms: 180 }, { cell: 1, ms: 100 }] }));
  const rig = { baseItem: 'base', cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: [{ id: 'south' }], animations, baseHash: '' };
  rig.baseHash = await baseHashOf(rig, Object.fromEntries(animations.flatMap(a => body.map((hash, i) => [`${a.id}/south/${i}`, hash]))));
  const manifest = { name: 'Phaser playback', app: 'test', format: 'pixeldoll/2', rig,
    slots: [{ id: 'body', class: 'base', z: 10, required: true }, { id: 'head', class: 'rigid', z: 20 }],
    materials: [{ id: 'skin', owner: 'base', label: 'Skin', ramp: ['#646464'], defaultVariant: 'blue', variants: { blue: ['#0000ff'], red: ['#ff0000'] } }],
    items: [['base', 'body', body], ['hat', 'head', hats]].map(([id, slot, hashes]) => ({ id, name: id, slot, status: 'accepted', mirror: 'flip', prompt: '', provenance: [], baseHash: rig.baseHash, materials: slot === 'body' ? ['skin'] : [],
      layers: [{ id: 'main', role: 'fg', z: slot === 'body' ? 10 : 20, ...(slot === 'head' ? { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } } : {}), cells: Object.fromEntries(animations.map(a => [a.id, { south: hashes }])) }] })),
    presets: [{ id: 'current', name: 'Current', items: { body: 'base', head: 'hat' }, variants: {} }, { id: 'red', name: 'Red', items: { body: 'base', head: 'hat' }, variants: { skin: 'red' } }],
  };
  const copy = structuredClone(manifest);
  applyExportSettings(copy, { engine: 'phaser', dressedCharacterSheets: true, playOnce: ['jump'] });
  const result = await exportZip({ manifest: copy, images }, { engines: ['phaser'], baked: true, exportedAt: '2026-10-28T00:00:00.000Z' });
  assert.deepEqual(result.errors, []); assert.deepEqual(manifest.rig.animations.map(a => a.loop), [false, true]);
  await writeFile(join(vendor, 'pipeline-fixture.pixeldoll.zip'), result.zip);
  return { label: 'global-settings-pipeline', fixture: true, zip: result.zip };
}
const archives = [await fixtureArchive()];
for (const file of values.zip ?? []) archives.push({ label: basename(file), fixture: false, zip: new Uint8Array(await readFile(file)) });
for (const archive of archives) {
  archive.files = await unzip(archive.zip); archive.sha256 = sha(archive.zip);
  assert(archive.files.has('phaser/PaperdollContainer.js'), `${archive.label} must contain a Phaser export.`);
}

const browser = await chromium.launch({ headless: true }), results = [];
try {
  for (const bundle of bundles) for (const renderer of ['CANVAS', 'WEBGL']) for (const archive of archives) {
    for (const control of archive.fixture ? ['none', 'old-duration', 'no-repeat', 'no-layer-update'] : ['none']) {
      const page = await browser.newPage(), errors = [], label = `${bundle.version} ${renderer} ${archive.label} ${control}`;
      page.on('pageerror', error => errors.push(error.message));
      try {
        let runtime = new TextDecoder().decode(archive.files.get('phaser/PaperdollContainer.js'));
        if (control === 'old-duration') {
          assert(runtime.includes('duration: f.ms }'), 'Old-duration control must mutate the current frame mapping.');
          assert(runtime.includes('duration: a.frames.reduce((total, frame) => total + frame.ms, 0)'));
          runtime = runtime.replace('duration: a.frames.reduce((total, frame) => total + frame.ms, 0)', 'frameRate: 1000 / Math.min(...a.frames.map(frame => frame.ms))');
          runtime = runtime.replace('duration: f.ms }', 'duration: f.ms - Math.min(...a.frames.map(frame => frame.ms)) }');
        } else if (control === 'no-repeat') {
          assert(runtime.includes('repeat: a.loop ? -1 : 0')); runtime = runtime.replace('repeat: a.loop ? -1 : 0', 'repeat: 0');
        } else if (control === 'no-layer-update') {
          assert(runtime.includes("'animationupdate', ")); runtime = runtime.replace("'animationupdate', ", '');
        }
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== 'https://game.test') return route.abort();
          if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' });
          const name = decodeURIComponent(url.pathname.slice('/hero/'.length));
          const bytes = name === 'phaser/PaperdollContainer.js' ? new TextEncoder().encode(runtime) : archive.files.get(name);
          return bytes ? route.fulfill({ contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.png') ? 'image/png' : 'application/json', body: Buffer.from(bytes) }) : route.fulfill({ status: 404 });
        });
        await page.goto('https://game.test/'); await page.addScriptTag({ path: bundle.file });
        let data, failure;
        try {
          data = await page.evaluate(async ({ renderer, fixture, control }) => {
            const api = await import('/hero/phaser/PaperdollContainer.js');
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Engine initialization timeout')), 15000);
              const game = new Phaser.Game({ type: Phaser[renderer], width: 256, height: 256, pixelArt: true, roundPixels: true, audio: { noAudio: true }, scene: { async create() {
                try {
                  const m = await api.loadPaperdoll(this, '/hero'), doll = new api.Paperdoll(this, 128, 128, m);
                  this.sys.pause();
                  const check = (ok, message) => { if (!ok) throw new Error(message); };
                  const samples = [], renders = [];
                  // The 3.x WebGL single-pixel helper reads y one row off; rectangular snapshots use the correct origin.
                  const pixel = (x, y) => new Promise(resolve => game.renderer.snapshotArea(x, y, 1, 1, image => {
                    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
                    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
                    resolve([...context.getImageData(0, 0, 1, 1).data]);
                  }));
                  const paletteColor = () => [...doll.body.texture.getSourceImage().getContext('2d').getImageData(0, 0, 1, 1).data];
                  for (const move of m.rig.animations) {
                    const dir = (move.directions ?? m.rig.directions.map(d => d.id))[0]; if (!dir) continue;
                    if (fixture) doll.applyPreset(m.presets[0]);
                    doll.play(move.id, dir);
                    if (fixture) {
                      check(paletteColor().join() === '0,0,255,255', 'palette: exported default must use original source ramp');
                      check(JSON.stringify(doll.nodes.map(n => [n.sprite.originX, n.sprite.originY])) === JSON.stringify([[.5, 60 / 64], [.5, 76 / 96]]), 'geometry: exported layer pivots');
                      const body = doll.body.getBounds(), hat = doll.nodes.find(n => n.slot.id === 'head').sprite.getBounds();
                      check(JSON.stringify([body.x, body.y, body.width, body.height, hat.x, hat.y, hat.width, hat.height]) === JSON.stringify([96, 68, 64, 64, 80, 52, 96, 96]), 'geometry: native oversized layer bounds');
                    }
                    let elapsed = 0, repeats = 0, completes = 0;
                    const repeated = () => repeats++, completed = () => completes++;
                    doll.body.on('animationrepeat', repeated); doll.body.on('animationcomplete', completed);
                    const total = move.frames.reduce((n, frame) => n + frame.ms, 0), animation = this.anims.get(api.animKey(m, move.id, dir));
                    // The old-code control must reach the real clock oracle, rather than fail on its known metadata error.
                    if (control !== 'old-duration') check(Math.abs(animation.duration - total) < .000001, 'duration: native animation total differs');
                    const boundaries = new Set([0, total * 3 + 1]);
                    for (let cycle = 0; cycle < 3; cycle++) { let t = cycle * total; for (const frame of move.frames) { t += frame.ms; for (const shift of [-1, 0, 1]) if (t + shift >= 0) boundaries.add(t + shift); } }
                    for (const time of [...boundaries].sort((a, b) => a - b)) {
                      while (elapsed < time) { const delta = Math.min(1, time - elapsed); elapsed += delta; doll.body.anims.update(elapsed, delta); }
                      let local = move.loop ? time % total : Math.min(time, total - .000001), index = 0;
                      while (index < move.frames.length - 1 && local >= move.frames[index].ms) local -= move.frames[index++].ms;
                      const expected = `${move.id}_${dir}_${move.frames[index].cell}`, actual = doll.body.anims.currentFrame;
                      check(actual.index === index + 1 && actual.textureFrame === expected, `clock: ${move.id} at ${time}ms expected index ${index + 1}, got ${actual.index}`);
                      check(doll.nodes.filter(n => n.sprite.visible).every(n => n.sprite.frame.name === expected), `synchronization: ${move.id} at ${time}ms`);
                    }
                    check(move.loop ? repeats >= 3 && completes === 0 && doll.body.anims.isPlaying : repeats === 0 && completes === 1 && !doll.body.anims.isPlaying, 'loop: completion/repeat behavior differs');
                    if (fixture) {
                      check(paletteColor().join() === '0,0,255,255', 'palette: animation advancement must retain source recolor');
                      const finalCell = move.loop ? move.frames[0].cell : move.frames.at(-1).cell;
                      const color = await pixel(128, 100); check(color.slice(0, 3).join() === (finalCell ? '0,255,0' : '255,0,0'), `render: ${renderer} marker differs (${color})`);
                      const hatColor = await pixel(128, 56); check(hatColor.slice(0, 3).join() === (finalCell ? '0,255,0' : '255,0,0'), `render: ${renderer} oversized layer marker differs (${hatColor})`);
                      renders.push({ move: move.id, color, hatColor });
                      const before = { index: doll.body.anims.currentFrame.index, playing: doll.body.anims.isPlaying };
                      doll.equip('head', null); check(!doll.nodes.find(n => n.slot.id === 'head').sprite.visible, 'equipment: unequip');
                      doll.equip('head', 'hat'); doll.applyPreset(m.presets[1]);
                      check(doll.body.anims.currentFrame.index === before.index && doll.body.anims.isPlaying === before.playing, 'equipment: changing outfits alters clock');
                      check(doll.nodes.every(n => n.sprite.frame.name === doll.body.anims.currentFrame.textureFrame), 'synchronization: re-equipped layers');
                      check(paletteColor().join() === '255,0,0,255', 'palette: selected outfit recolor');
                    }
                    doll.play(move.id, dir);
                    check(doll.body.anims.currentFrame.index === 1 && doll.body.anims.isPlaying, 'restart: same clip does not restart');
                    check(doll.nodes.filter(n => n.sprite.visible).every(n => n.sprite.frame.name === doll.body.anims.currentFrame.textureFrame), 'synchronization: restart');
                    samples.push({ move: move.id, loop: move.loop, total, repeats, completes, samples: boundaries.size });
                    doll.body.off('animationrepeat', repeated); doll.body.off('animationcomplete', completed);
                  }
                  doll.destroy(); clearTimeout(timeout); resolve({ version: Phaser.VERSION, renderer: game.renderer.type, samples, renders }); game.destroy(true);
                } catch (error) { clearTimeout(timeout); reject(error); game.destroy(true); }
              } } });
            });
          }, { renderer, fixture: archive.fixture, control });
        } catch (error) { failure = error; }
        if (control !== 'none') {
          const expectedFailure = control === 'no-layer-update' ? 'synchronization:' : 'clock:';
          assert(failure && failure.message.includes(expectedFailure), `Negative control was not caught by ${expectedFailure}: ${failure?.message ?? 'passed'}`);
          results.push({ label, passed: true, negativeControl: true, detected: failure.message, errors });
        } else {
          if (failure) throw failure;
          assert.equal(data.version, bundle.version); assert.equal(data.renderer, renderer === 'CANVAS' ? 1 : 2); assert.deepEqual(errors, []);
          results.push({ label, passed: true, ...data, errors });
        }
        console.log('PASS ' + label);
      } catch (error) { results.push({ label, passed: false, error: error.message, errors }); console.error('FAIL ' + label + ': ' + error.message); }
      finally { await page.close(); }
    }
  }
} finally { await browser.close(); }
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ bundles, archives: archives.map(({ label, fixture, sha256 }) => ({ label, fixture, sha256 })), results }, null, 2) + '\n');
console.log('Results: ' + output);
if (results.some(result => !result.passed)) process.exitCode = 1;
