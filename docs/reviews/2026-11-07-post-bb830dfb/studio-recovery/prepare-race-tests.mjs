// Reuse the tracked offline queue fixture without modifying app tests or running its unrelated cases.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../../../../app/test/unit/automatic-recovery.test.ts', import.meta.url);
const appSrc = fileURLToPath(new URL('../../../../app/src/', import.meta.url)).replaceAll('\\', '/');
const folder = new URL('temp.local/', import.meta.url);
await mkdir(folder, { recursive: true });
const existing = (await readFile(source, 'utf8')).replaceAll("'../../src/", `'${appSrc}`);
const extra = `
import { ITEM_MOVE_SAVE_CONFLICT, PartialMoveError } from '${appSrc}lib/items/run.ts';
async function partialConflict() {
  const f = await facingFixture();
  f.item.dressed!.north = f.item.dressed!.south;
  ledger.project = structuredClone(f.ctx.rec);
  ledger.output = async req => {
    if ((req.body as { direction: string }).direction === 'north') {
      const another = structuredClone(ledger.project!.manifest.rig.animations[0]);
      another.id = 'concurrent_move';
      ledger.project!.manifest.rig.animations.push(another);
      return [f.dressed]; // completed paid receipt, but malformed direction cardinality
    }
    return Array(3).fill(f.front);
  };
  let caught: Error | undefined;
  try { await poseItemClip(f.ctx, f.item, 'walking', () => {}, 77); }
  catch (error) { caught = error as Error; }
  expect(caught).toBeInstanceOf(Error);
  expect(caught!.message).toContain(ITEM_MOVE_SAVE_CONFLICT);
  expect(ledger.requests).toHaveLength(2);
  expect(ledger.project!.manifest.items.find(i => i.id === f.item.id)!.layers[0].cells!.walking).toBeUndefined();
  return { f, error: caught! };
}
test('independent review: a mixed failure still exposes the save-conflict recovery trigger', async () => {
  const { error } = await partialConflict();
  // MoveSheet.svelte uses this exact prefix condition to show its free Use saved frames button.
  expect(error.message.startsWith(ITEM_MOVE_SAVE_CONFLICT)).toBe(true);
});
test('independent review: the hidden recovery could save a finished view without another paid enqueue', async () => {
  const { f } = await partialConflict(), enqueues = ledger.enqueues;
  const rec = structuredClone(ledger.project!), item = rec.manifest.items.find(i => i.id === f.item.id)!;
  const ctx = { rec, project: { ...f.ctx.project, manifest: rec.manifest } };
  await expect(poseItemClip(ctx, item, 'walking', () => {}, 77, undefined, undefined, true)).rejects.toBeInstanceOf(PartialMoveError);
  expect(ledger.enqueues).toBe(enqueues);
  expect(ledger.project!.manifest.items.find(i => i.id === item.id)!.layers[0].cells!.walking!.south).toHaveLength(3);
  expect(ledger.project!.manifest.items.find(i => i.id === item.id)!.layers[0].cells!.walking!.north).toBeUndefined();
});
`;
await writeFile(new URL('mixed-recovery.generated.test.ts', folder), existing + extra);
console.log('Prepared owned, ignored mixed-recovery tests.');
