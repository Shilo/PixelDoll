// Reuse the tracked mocked body-render path, replacing only its body color to exercise real garment-bit normalization.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const appSrc = fileURLToPath(new URL('../../../../app/src/', import.meta.url)).replaceAll('\\', '/');
const source = await readFile(new URL('../../../../app/test/unit/targeted-move.test.ts', import.meta.url), 'utf8');
const fixture = source.replaceAll("'../../src/", `'${appSrc}`).replace('[180,140,120,255]', '[128,128,128,255]');
if (fixture === source) throw new Error('Expected tracked fixture markers were not found.');
const extra = `
import { splitBase } from '${appSrc}lib/dress/regions.ts';
import { saveSplit } from '${appSrc}lib/dress/project.ts';
import { deriveMaterials } from '${appSrc}lib/dress/dress.ts';
import { writeFileSync } from 'node:fs';
const unmockedLoadProject = projects.loadProject;
test('independent first-open: normalization during body blob publication survives the completed operation', async () => {
  const f = await fixture();
  let injected = false, normalizedSouth: unknown, normalizedRegions: string | undefined, changes = 0;
  f.put.mockImplementation(async store => {
    if (store !== 'blobs' || injected) return;
    injected = true;
    const current = await projects.loadProject('rig-target');
    const split = await splitBase(current.project);
    expect(split.changed).toBeGreaterThan(0);
    changes = split.changed;
    deriveMaterials(current.project);
    await saveSplit('rig-target', current.project.manifest, split);
    normalizedSouth = structuredClone(f.saved().manifest.items[0].layers[0].cells!.idle!.south);
    normalizedRegions = f.saved().manifest.items[0].regions;
  });
  await f.run();
  expect(injected).toBe(true);
  expect(changes).toBeGreaterThan(0);
  expect(f.saved().manifest.items[0].layers[0].cells!.idle!.south).toEqual(normalizedSouth);
  expect(f.saved().manifest.items[0].regions).toBe(normalizedRegions);
  expect(f.saved().manifest.materials.length).toBeGreaterThan(0);
});

test('independent interrupted first-open: a post-publication read failure leaves stale region pixels until reopen normalization', async () => {
  const f = await fixture();
  const initial = await projects.loadProject('rig-target');
  const blobs = new Map<string, Blob>();
  for (const [hash, image] of initial.project.images) blobs.set(hash.slice(7), new Blob([await encodePngBytes(image)]));
  const oldGetBlob = vi.mocked(db.getBlob).getMockImplementation()!;
  vi.mocked(db.getBlob).mockImplementation(async hash => blobs.get(hash) ?? oldGetBlob(hash));
  const updateCharacter = vi.mocked(db.updateCharacter).getMockImplementation()!;
  vi.mocked(db.updateCharacter).mockImplementation(async (id, added, change) => {
    for (const [hash, blob] of added) blobs.set(hash, blob);
    return updateCharacter(id, added, change);
  });
  let injected = false, published = false, failed = false;
  let normalizedHash: string | null | undefined, normalizedImage: import('${appSrc}lib/image/png.ts').Img;
  let normalizedMaterials: unknown;
  f.put.mockImplementation(async (store, hash, blob) => {
    if (store !== 'blobs') return;
    blobs.set(hash as string, blob as Blob);
    if (injected) return;
    injected = true;
    const current = await unmockedLoadProject('rig-target');
    const split = await splitBase(current.project);
    expect(split.changed).toBeGreaterThan(0);
    deriveMaterials(current.project);
    await saveSplit('rig-target', current.project.manifest, split);
    normalizedHash = f.saved().manifest.items[0].layers[0].cells!.idle!.south![0];
    normalizedImage = current.project.images.get(normalizedHash!)!;
    normalizedMaterials = structuredClone(f.saved().manifest.materials);
  });
  const update = f.update.getMockImplementation()!;
  f.update.mockImplementation(async (...args) => { await update(...args); published = true; });
  const load = vi.mocked(projects.loadProject).getMockImplementation()!;
  vi.mocked(projects.loadProject).mockImplementation(async id => {
    if (published && !failed) { failed = true; throw new Error('Injected post-publication read failure'); }
    return load(id);
  });
  await expect(f.run()).rejects.toThrow('Injected post-publication read failure');
  const reloaded = await unmockedLoadProject('rig-target');
  const base = reloaded.rec.manifest.items[0], staleHash = base.layers[0].cells!.idle!.south![0];
  const staleImage = reloaded.project.images.get(staleHash!)!;
  expect(staleHash).not.toBe(normalizedHash!);
  expect(staleImage.data).not.toEqual(normalizedImage!.data);
  expect(base.regions).toBe('shirt-shorts');
  expect(reloaded.rec.manifest.materials).toEqual(normalizedMaterials!);
  let lostOddPixels = 0;
  for (let p = 0; p < staleImage.w * staleImage.h; p++) {
    if (normalizedImage!.data[p * 4 + 3] && (normalizedImage!.data[p * 4 + 2] & 1) && !(staleImage.data[p * 4 + 2] & 1)) lostOddPixels++;
  }
  expect(lostOddPixels).toBeGreaterThan(0);
  // Reopening through the actual normalization path repairs the semantic mismatch without regeneration.
  const repaired = await splitBase(reloaded.project);
  deriveMaterials(reloaded.project);
  await saveSplit('rig-target', reloaded.project.manifest, repaired);
  const healed = await unmockedLoadProject('rig-target');
  expect(healed.rec.manifest.items[0].layers[0].cells!.idle!.south![0]).toBe(normalizedHash!);
  const measurements = { firstOpenInterruption: { injectedFailure: failed, actualBlobReload: true, staleHash, normalizedHash, lostOddPixels, materialMetadataRetained: true, healedByReopenNormalization: true } };
  writeFileSync(new URL('../first-open-interrupted-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2) + '\\n');
  console.log(JSON.stringify(measurements));
});
`;
const folder = new URL('temp.local/', import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL('first-open.generated.test.ts', folder), fixture + extra);
console.log('Prepared owned, ignored first-open race test.');
