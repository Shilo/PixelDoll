import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const here = new URL('./', import.meta.url), temp = new URL('temp.local/', here);
mkdirSync(temp, { recursive: true });
const tracked = readFileSync(new URL('../../../app/test/e2e/studio.spec.ts', here), 'utf8');
const start = tracked.indexOf('async function targetedRepairFixture('), end = tracked.indexOf("\ntest('failed anchored moves", start);
if (start < 0 || end < 0) throw new Error('Tracked fixture changed; inspect before adapting.');
const fixture = tracked.slice(start, end);
const test = String.raw`
import { test, expect, type Page } from '../../../../app/node_modules/@playwright/test/index.mjs';
import { openStudio, reloadStudio, equipmentMode } from '../../../../app/test/e2e/immersive-helpers.ts';
import { writeFileSync } from 'node:fs';
${fixture}
test('combined failure offers saved-frame recovery across reload and prices only the missing direction', async ({ page, context }) => {
  const attempted: string[] = [], posts: string[] = [];
  await context.route('**/*', async route => {
    if (route.request().url().startsWith('http') && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(route.request().url()).hostname)) {
      attempted.push(route.request().method() + ' ' + new URL(route.request().url()).hostname + new URL(route.request().url()).pathname);
      if (route.request().method() === 'POST') posts.push(new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => { localStorage.setItem('pixeldoll.agentKey', 'off'); localStorage.setItem('pixeldoll.welcomed', '1'); localStorage.removeItem('pixellabApiKey'); });
  await openStudio(page, process.env.E2E_DEV_PORT ? 'http://127.0.0.1:' + process.env.E2E_DEV_PORT : undefined);
  const { itemId } = await targetedRepairFixture(page);
  const seeded = await page.evaluate(async itemId => {
    const s = await import('/src/studio/state.svelte.ts'), db = await import('/src/lib/store/db.ts'), items = await import('/src/lib/items/items.ts');
    const run = await import('/src/lib/items/run.ts'), queue = await import('/src/lib/pixellab/queue.ts'), project = await import('/src/lib/store/project.ts');
    const png = await import('/src/lib/image/pngraw.ts'), chroma = await import('/src/lib/image/chroma.ts'), image = await import('/src/lib/image/png.ts');
    const rec = await db.get('projects', s.doc.id), m = rec.manifest, item = m.items.find(it => it.id === itemId);
    // Actual item-only skeleton path, not the anchor-only control in the existing spec.
    item.route = 'skeleton-pose'; item.key = 'green';
    for (const layer of item.layers) delete layer.cells.walk;
    item.coverage = [];
    for (const dir of ['east', 'south']) {
      const bodyHash = m.rig.rest[dir].image;
      const bodyBytes = new Uint8Array(await (await db.getBlob(bodyHash.slice(7))).arrayBuffer());
      const out = chroma.toChroma(await png.decodePngBytes(bodyBytes), 'green');
      for (let y = 22; y < 27; y++) for (let x = 42; x < 45; x++) out.data.set([160, 80, 30, 255], (y * out.w + x) * 4);
      item.dressed[dir] = 'sha256:' + await db.putBlob(await png.encodePngBytes(out));
    }
    await db.put('projects', s.doc.id, rec);
    const ctx = await project.loadProject(s.doc.id), rig = ctx.rec.manifest.rig, active = ctx.rec.manifest.items.find(it => it.id === itemId);
    const seedOf = value => 1 + ([...value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2000000);
    const seed = seedOf(itemId + '/walk/east/0/90');
    const bytes = new Uint8Array(await (await db.getBlob(active.dressed.east.slice(7))).arrayBuffer());
    const req = items.itemRoute.pose({ keyframePngB64: image.bytesToBase64(bytes), rest: rig.rest.east.keypoints, poses: rig.animations.find(a => a.id === 'walk').sources.east.keypoints, item: active.prompt, slot: active.slot, key: 'green', anim: 'walk', dir: 'east', seed, cell: rig.cell, pad: 0, view: rig.view });
    const identity = await queue.requestIdentity(req), count = rig.animations.find(a => a.id === 'walk').cells, sha = active.dressed.east.slice(7);
    await db.put('jobs', 'offline-r4-completed-east', { id: 'offline-r4-completed-east', label: 'Offline authored completed east', method: 'POST', endpoint: req.path, ...identity, state: 'done', attempts: 1, nextAt: 0, createdAt: Date.now(), gens: 2, usd: 0, jobs: [{ id: 'offline-r4-east', status: 'completed', done: true, results: Array.from({ length: count }, (_, i) => ({ label: String(i), sha })) }] });
    const spec = { id: 'walk', items: [itemId], dirs: ['east', 'south'], frames: count, seed: 90, itemsOnly: true };
    const combined = run.ITEM_MOVE_SAVE_CONFLICT + ' Sword walk south: PixelLab returned missing or malformed frames. No automatic retry was made.';
    await db.put('projects', 'studio-move', { id: 'studio-move', projectId: s.doc.id, status: 'failed', error: combined, requestText: s.REQUEST_TEXT, progress: { step: 'items', done: 1, total: 2, recIds: [] }, spec });
    return { projectId: s.doc.id, count, beforeGens: (await import('/src/studio/create.ts')).moveEstimate(m, spec).gens };
  }, itemId);
  const openFailure = async () => {
    await equipmentMode(page, 'Moves');
    await page.getByRole('button', { name: 'Walk Failed: tap for details' }).click();
    return page.getByRole('dialog', { name: 'Add a move', exact: true });
  };
  await reloadStudio(page);
  let sheet = await openFailure();
  await expect(sheet.getByRole('button', { name: 'Use saved frames', exact: true })).toBeVisible();
  const beforeText = await sheet.getByRole('button', { name: /^Generate new frames/ }).innerText();
  await reloadStudio(page);
  sheet = await openFailure();
  await expect(sheet.getByRole('button', { name: 'Use saved frames', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Use saved frames', exact: true }).click();
  await expect(sheet).toContainText('The finished views were saved (East); Generate new frames requests only the missing ones.');
  const after = await page.evaluate(async ({ itemId, seeded }) => {
    const s = await import('/src/studio/state.svelte.ts'), db = await import('/src/lib/store/db.ts'), flow = await import('/src/studio/create.ts');
    const rec = await db.get('projects', seeded.projectId), item = rec.manifest.items.find(i => i.id === itemId), pending = await db.get('projects', 'studio-move');
    return { east: item.layers[0].cells.walk?.east?.length ?? 0, south: item.layers[0].cells.walk?.south?.length ?? 0, afterGens: flow.moveEstimate(rec.manifest, pending.spec).gens, jobIds: (await db.all('jobs')).map(j => j.id), error: pending.error };
  }, { itemId, seeded });
  expect(after.east).toBe(seeded.count); expect(after.south).toBe(0);
  expect(after.afterGens * 2).toBe(seeded.beforeGens);
  const afterText = await sheet.getByRole('button', { name: /^Generate new frames/ }).innerText();
  await expect(sheet.getByRole('button', { name: /^Generate new frames/ })).toContainText('Est. ' + after.afterGens + ' gens');
  expect(after.jobIds).toEqual(['offline-r4-completed-east']);
  expect(posts).toEqual([]); expect(attempted).toEqual([]);
  await expect(page.getByRole('dialog', { name: 'Connect PixelLab' })).toHaveCount(0);
  writeFileSync(process.cwd() + '/../docs/reviews/2026-11-07-session-counter-review/r4-browser-results.json', JSON.stringify({ synthetic: true, seeded, beforeText, afterText, after, generationPosts: posts, externalAttempts: attempted }, null, 2));
});
`;
writeFileSync(new URL('r4.browser.spec.ts', temp), test);
console.log('Prepared offline R4 browser fixture; production tests unchanged.');
