import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = new URL('./', import.meta.url), tmp = new URL('temp.local/', here);
mkdirSync(tmp, { recursive: true });
const rootSource = fileURLToPath(new URL('../../../app/src/', here)).replaceAll('\\', '/');
const fixture = readFileSync(new URL('../../../app/test/unit/automatic-recovery.test.ts', here), 'utf8').replaceAll("'../../src/", `'${rootSource}`);
const extra = `
import { writeFileSync } from 'node:fs';
import { qaReasons } from '${rootSource}studio/model.ts';
test('independent warning review: dark note survives saving just as a gray note does', async () => {
  const rows = [];
  for (const [name, rgb] of [['dark', [20,20,20]], ['gray', [150,150,150]]]) {
    const f = await singleStandingFixture(), rig = f.ctx.rec.manifest.rig;
    for (const dir of ['east', 'north']) {
      rig.directions.push({ id: dir }); rig.rest[dir] = structuredClone(rig.rest.south);
      rig.animations[0].sources[dir] = structuredClone(rig.animations[0].sources.south);
      f.ctx.rec.manifest.items[0].layers[0].cells.walking[dir] = [rig.rest.south.image];
      f.ctx.rec.skeletons['walking/' + dir + '/0'] = f.ctx.rec.skeletons['walking/south/0'];
    }
    const body = f.ctx.project.images.get(rig.rest.south.image);
    const views = ['south','east','north'].map((dir, index) => {
      const out = toChroma(body, 'green'); paint(out, 12,13,8,8,[30,80,200]);
      if (index === 0) paint(out,13,14,5,5,rgb);
      return out;
    });
    ledger.output = async () => views;
    ledger.project = structuredClone(f.ctx.rec);
    const d = newDraft(f.ctx, { name: 'Note ' + name, slot: 'back', prompt: name === 'dark' ? 'a blue garment with a charcoal medallion on the front' : 'a plain blue garment', key:'green', anims:['walking'], dirs:['south','east','north'] });
    const result = await runItem(d, f.ctx);
    const warning = result.qa?.warnings.find(w => w.includes('dark patch'));
    const saved = await acceptItem(d, f.ctx, result);
    rows.push({ name, draftNotes: result.qa?.warnings, designFailures: [...result.g1.values()], savedDesignNotes: saved.item.designWarnings ?? [], savedStatus: saved.item.qa.status, savedReasons: qaReasons(saved.item.qa, false, true, rig), serializedItemHasDarkText: JSON.stringify(saved.item).includes('dark patch') });
    if (name === 'dark') expect(warning).toBeTruthy();
  }
  writeFileSync(new URL('../warning-results.json', import.meta.url), JSON.stringify(rows,null,2));
  expect(rows.find(r => r.name === 'gray').savedDesignNotes.some(n => n.includes('D1'))).toBe(true);
  // Deliberately retain the desired durability assertion rather than blessing the missing note.
  expect(rows.find(r => r.name === 'dark').serializedItemHasDarkText).toBe(true);
});
test('independent prompt review: capture real dress requests at padded and maximum native sizes', async () => {
  const rows = [];
  for (const size of [64,256]) for (const slot of ['main_hand','off_hand']) {
    const f = await fixture();
    f.ctx.rec.manifest.rig.cell = {w:size,h:size};
    f.ctx.rec.manifest.items[0].layers[0].cell = {w:size,h:size};
    for (const [hash] of f.ctx.project.images) {
      const body = makeImg(size,size); paint(body, size/2-3,8,6,20,[180,130,100]);
      f.ctx.project.images.set(hash,body);
      ledger.blobs.set(hash.slice(7),new Blob([await encodePngBytes(body)]));
    }
    let request;
    ledger.output = async req => { request=req;throw new Error('Review stopped in the mock queue before transport'); };
    const draft = newDraft(f.ctx,{name:'Request probe',slot,prompt:slot==='off_hand'?'a wooden shield':'a steel sword',key:'green',anims:['walking'],dirs:['south']});
    try { await runItem(draft,f.ctx); } catch(error) { expect(error.message).toContain('Review stopped'); }
    expect(request).toBeTruthy();
    const description=request.body.description;
    rows.push({size,slot,method:draft.spec.method,description,hasRequestedHand:description.includes(slot==='off_hand'?'left hand':'right hand'),hasOneItem:description.includes('exactly one'),imageSize:request.body.image_size});
  }
  writeFileSync(new URL('../prompt-boundary-results.json',import.meta.url),JSON.stringify(rows,null,2));
  expect(rows.filter(r=>r.size===64).every(r=>r.hasRequestedHand&&r.hasOneItem)).toBe(true);
  expect(rows.filter(r=>r.size===256).every(r=>!r.hasRequestedHand&&!r.hasOneItem)).toBe(true);
});
`;
writeFileSync(new URL('warnings.generated.test.ts', tmp), fixture + extra);
console.log('Prepared offline warning persistence check.');
