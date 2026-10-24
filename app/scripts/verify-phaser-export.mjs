// Optional real-engine regression. Run from any directory with Node 24:
//   node app/scripts/verify-phaser-export.mjs
// Downloads pinned Phaser bundles into node_modules/.cache; never contacts PixelLab.
// Options: --versions 3.90.0,4.1.0 --vendor-dir <dir> --output <json>
// Environment equivalents: PHASER_VERSIONS, PHASER_VENDOR_DIR, PHASER_REVIEW_OUTPUT.
// Playwright honors PLAYWRIGHT_BROWSERS_PATH and uses its managed Chromium.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { atlasJson, atlasName, PAPERDOLL_JS } from '../src/lib/export/phaser.ts';

const app = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { versions: { type: 'string' }, 'vendor-dir': { type: 'string' }, output: { type: 'string' } } });
const versions = (values.versions ?? process.env.PHASER_VERSIONS ?? '3.90.0,4.1.0').split(',');
assert(versions.every((v) => /^\d+\.\d+\.\d+$/.test(v)), 'Use explicit release versions, e.g. 3.90.0,4.1.0');
const vendor = resolve(values['vendor-dir'] ?? process.env.PHASER_VENDOR_DIR ?? join(app, 'node_modules/.cache/export-review-phaser'));
const output = resolve(values.output ?? process.env.PHASER_REVIEW_OUTPUT ?? join(vendor, 'results.json'));
await mkdir(vendor, { recursive: true });
for (const version of versions) {
  const bundle = join(vendor, 'phaser-' + version + '.js');
  try { await readFile(bundle); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch('https://cdn.jsdelivr.net/npm/phaser@' + version + '/dist/phaser.js');
    if (!response.ok) throw new Error('Failed to download Phaser ' + version + ': HTTP ' + response.status);
    await writeFile(bundle, new Uint8Array(await response.arrayBuffer()));
  }
}

const manifest = {
  name: 'Engine smoke', app: 'test', format: 'pixeldoll/2',
  rig: { baseItem: 'base', cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: [{ id: 'south' }],
    animations: [{ id: 'walk', cells: 2, directions: ['south'], loop: true, frames: [{ cell: 1, ms: 80 }, { cell: 0, ms: 180 }, { cell: 1, ms: 100 }] }] },
  slots: [{ id: 'body', z: 10 }, { id: 'head', z: 20 }],
  materials: [{ id: 'skin', owner: 'base', ramp: ['#646464'], defaultVariant: 'blue', variants: { blue: ['#0000ff'], red: ['#ff0000'] } }],
  items: [
    { id: 'base', slot: 'body', materials: ['skin'], layers: [{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'body.png' }, sourceSheets: { walk: 'sources/body.png' } }] },
    { id: 'hat', slot: 'head', materials: [], layers: [{ id: 'main', role: 'fg', z: 20, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 }, sheets: { walk: 'hat.png' } }] },
  ],
  presets: [{ id: 'one', items: { body: 'base', head: 'hat' }, variants: {} }, { id: 'two', items: { body: 'base', head: 'hat' }, variants: { skin: 'red' } }],
};
const atlases = new Map(manifest.items.map((it) => [atlasName(it.id, 'main', 'walk'), atlasJson(manifest, it.id, 'main', 'walk')]));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const version of versions) for (const renderer of ['CANVAS', 'WEBGL']) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      let images;
      await page.route('https://game.test/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('manifest.json')) return route.fulfill({ json: manifest });
        if (path.endsWith('PaperdollContainer.js')) return route.fulfill({ contentType: 'text/javascript', body: PAPERDOLL_JS });
        if (path.endsWith('.json')) {
          const atlas = atlases.get(path.split('/').at(-1));
          return atlas ? route.fulfill({ json: atlas }) : route.fulfill({ status: 404 });
        }
        if (path.endsWith('.png')) {
          const image = path.includes('/sources/') ? images[0] : path.endsWith('hat.png') ? images[1] : images[2];
          return route.fulfill({ contentType: 'image/png', body: Buffer.from(image, 'base64') });
        }
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
      });
      await page.goto('https://game.test/');
      images = await page.evaluate(() => [[64, '#646464'], [96, '#646464'], [64, '#0000ff']].map(([size, color]) => {
        const canvas = document.createElement('canvas'); canvas.width = size * 2; canvas.height = size;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL().split(',')[1];
      }));
      await page.addScriptTag({ path: join(vendor, 'phaser-' + version + '.js') });
      const result = await page.evaluate(async (renderer) => {
        const api = await import('/hero/phaser/PaperdollContainer.js');
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Phaser initialization timeout')), 15000);
          const game = new Phaser.Game({ type: Phaser[renderer], width: 256, height: 256, pixelArt: true, roundPixels: true, audio: { noAudio: true }, scene: { async create() {
            try {
              const m = await api.loadPaperdoll(this, '/hero');
              const doll = new api.Paperdoll(this, 128, 128, m); doll.play('walk', 'south');
              this.sys.pause();
              const color = () => [...doll.body.texture.getSourceImage().getContext('2d').getImageData(0, 0, 1, 1).data];
              const defaults = color();
              doll.body.anims.update(0, 79); const before = doll.body.anims.currentFrame.textureFrame;
              doll.body.anims.update(0, 2); const after = doll.body.anims.currentFrame.textureFrame;
              const continued = color(); doll.applyPreset(m.presets[1]); const selected = color();
              const pivots = doll.nodes.map((n) => [n.sprite.originX, n.sprite.originY]);
              const timing = this.anims.get(api.animKey(m, 'walk', 'south')).frames.map((f) => doll.body.anims.msPerFrame + f.duration);
              const matches = doll.nodes.every((n) => n.sprite.frame.name === doll.body.anims.currentFrame.textureFrame);
              doll.destroy(); clearTimeout(timer);
              resolve({ defaults, selected, continued, before, after, pivots, timing, matches, version: Phaser.VERSION, renderer: game.renderer.type });
              game.destroy(true);
            } catch (error) { clearTimeout(timer); reject(error); }
          } } });
        });
      }, renderer);
      assert.equal(result.version, version);
      assert.equal(result.renderer, renderer === 'CANVAS' ? 1 : 2);
      assert.deepEqual(result.defaults, [0, 0, 255, 255]);
      assert.deepEqual(result.continued, [0, 0, 255, 255]);
      assert.deepEqual(result.selected, [255, 0, 0, 255]);
      assert.deepEqual(result.timing, [80, 180, 100]);
      assert.equal(result.before, 'walk_south_1'); assert.equal(result.after, 'walk_south_0');
      assert.deepEqual(result.pivots, [[0.5, 60 / 64], [0.5, 76 / 96]]);
      assert.equal(result.matches, true); assert.deepEqual(errors, []);
      results.push({ version, renderer, passed: true, ...result, errors });
      console.log('PASS Phaser ' + version + ' ' + renderer);
    } catch (error) {
      results.push({ version, renderer, passed: false, error: error.message, errors });
      console.error('FAIL Phaser ' + version + ' ' + renderer + ': ' + error.message);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(results, null, 2) + '\n');
console.log('Results: ' + output);
if (results.some((result) => !result.passed)) process.exitCode = 1;
