// Build review artifacts from preserved captures; never loads the live prototype.
import { chromium } from '../../../../app/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('./evidence/regression-repair/', import.meta.url);
const versions = [
  { label: '003bef2 · pre-dependency', root: new URL('./evidence/bronze-dependency/', import.meta.url), phase: 'before' },
  { label: 'Reported · before repair', root, phase: 'before' },
  { label: 'Repaired integration', root, phase: 'after' },
];
for (const version of versions) version.report = JSON.parse(await readFile(new URL(version.phase + '.json', version.root), 'utf8'));
assert.equal(versions[2].report.captureComplete, true, 'Repair capture must finish successfully before building review artifacts.');
const records = await Promise.all(versions[0].report.images.map(async reference => ({
  ...reference,
  images: await Promise.all(versions.map(async version => {
    const image = version.report.images.find(image => image.file === reference.file);
    assert.ok(image, `Missing ${version.label}: ${reference.file}`);
    assert.deepEqual(image.viewport, reference.viewport);
    const data = await readFile(new URL(version.phase + '/' + image.file, version.root));
    assert.equal(createHash('sha256').update(data).digest('hex'), image.sha256, `Changed original: ${version.label}/${image.file}`);
    return data.toString('base64');
  })),
})));
await mkdir(new URL('review-boards/', root), { recursive: true });
await mkdir(new URL('baseline-pairs/', root), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  async function render(rows, labels, width, height) {
    return Buffer.from(await page.evaluate(async ({ rows, labels, width, height }) => {
      const label = 48, canvas = document.createElement('canvas'); canvas.width = width * labels.length; canvas.height = (height + label) * rows.length;
      const context = canvas.getContext('2d'); context.fillStyle = '#111317'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#f2eee6'; context.font = '13px Segoe UI';
      for (const [index, row] of rows.entries()) for (const [column, data] of row.images.entries()) {
        const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
        if (image.width !== row.viewport.width || image.height !== row.viewport.height) throw Error('Original dimensions differ: ' + row.file);
        const x = column * width, y = index * (height + label);
        context.fillText(row.screen, x + 8, y + 18); context.fillText(labels[column], x + 8, y + 37); context.drawImage(image, x, y + label, width, height);
      }
      return canvas.toDataURL().split(',')[1];
    }, { rows, labels, width, height }), 'base64');
  }
  for (const theme of ['obsidian', 'porcelain']) for (const device of ['desktop', 'mobile']) {
    const rows = records.filter(row => row.theme === theme && row.file.includes('-' + device + '-'));
    await writeFile(new URL(`review-boards/${theme}-${device}.png`, root), await render(rows, versions.map(version => version.label), device === 'desktop' ? 480 : 225, device === 'desktop' ? 270 : 400));
    for (const row of rows.filter(row => (device === 'desktop' ? ['creation', 'menu-parts'] : ['creation', 'creation-directions']).includes(row.screen))) {
      await writeFile(new URL('baseline-pairs/' + row.file, root), await render([{ ...row, images: [row.images[0], row.images[2]] }], [versions[0].label, versions[2].label], row.viewport.width, row.viewport.height));
    }
  }
  const intermediate = JSON.parse(await readFile(new URL('intermediate/manifest.json', root), 'utf8'));
  const creatorPair = ['003bef2', 'repaired'].map(revision => intermediate.find(image => image.revision === revision && image.theme === 'obsidian' && image.width === 1175));
  assert.ok(creatorPair.every(Boolean), 'Missing 1175px creator comparison');
  assert.ok(creatorPair.every(image => image.width === 1175 && image.height === 711 && image.errors.length === 0));
  const images = await Promise.all(creatorPair.map(async image => (await readFile(new URL('intermediate/' + image.file, root))).toString('base64')));
  await writeFile(new URL('baseline-pairs/obsidian-desktop-creation-1175.png', root), await render([{ screen: 'creation · 1175 × 711', viewport: { width: 1175, height: 711 }, images }], ['Reconstructed pre-dependency · 003bef2', 'Repaired integration'], 1175, 711));
} finally { await browser.close(); }
console.log(`Verified all ${records.length} three-way originals against manifests; built four review boards and nine baseline/repair pairs (including the 1175px creator comparison).`);
