import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = new URL('./', import.meta.url), tmp = new URL('temp.local/', here);
mkdirSync(tmp, { recursive: true });
const src = fileURLToPath(new URL('../../../../app/src/', here)).replaceAll('\\', '/');
const original = readFileSync(new URL('../../../../app/test/unit/automatic-recovery.test.ts', here), 'utf8').replaceAll("'../../src/", `'${src}`);
const extra = `
import { writeFileSync } from 'node:fs';
import { mergeClip } from '${src}lib/items/run.ts';
import { SLOTS, itemQa, slotOf, dressItem, heldPhrase, padOf } from '${src}lib/items/items.ts';
import { exportManifest, validate } from '${src}lib/export/generic.ts';
import { healthOf, plainReason } from '${src}studio/model.ts';
import { draftPlan, itemPlan } from '${src}studio/apiPlans.ts';
test('50ee notes: accepted dark, gray and clean cases survive repeated merges and export', async () => {
  const rows=[];
  for(const [name,rgb] of [['dark',[20,20,20]],['gray',[150,150,150]],['clean',null]]) {
    const f=await singleStandingFixture(), rig=f.ctx.rec.manifest.rig;
    f.ctx.rec.manifest.slots=structuredClone(SLOTS); // the source queue fixture intentionally omits a production slot ladder
    for(const dir of ['east','north']) {
      rig.directions.push({id:dir});rig.rest[dir]=structuredClone(rig.rest.south);
      rig.animations[0].sources[dir]=structuredClone(rig.animations[0].sources.south);
      f.ctx.rec.manifest.items[0].layers[0].cells.walking[dir]=[rig.rest.south.image];
      f.ctx.rec.skeletons['walking/'+dir+'/0']=f.ctx.rec.skeletons['walking/south/0'];
    }
    const body=f.ctx.project.images.get(rig.rest.south.image), views=[0,1,2].map(i=>{
      const out=toChroma(body,'green');paint(out,12,13,8,8,[30,80,200]);if(i===0&&rgb)paint(out,13,14,5,5,rgb);return out;
    });
    ledger.output=async()=>views;ledger.project=structuredClone(f.ctx.rec);
    const draft=newDraft(f.ctx,{name:'Independent '+name,slot:'back',prompt:'a blue garment',key:'green',anims:['walking'],dirs:['south','east','north']});
    const result=await runItem(draft,f.ctx), saved=await acceptItem(draft,f.ctx,result);
    const initial=structuredClone(ledger.project.manifest.items.find(i=>i.id===saved.item.id));
    const counts=[];
    for(let repeat=0;repeat<2;repeat++) {
      const ctx={rec:structuredClone(ledger.project),project:{...f.ctx.project,manifest:structuredClone(ledger.project.manifest)}};
      const item=ctx.rec.manifest.items.find(i=>i.id===saved.item.id), cells=result.cells.filter(c=>c.key==='walking/south/0');
      const qa=itemQa(ctx.rec.manifest.rig,slotOf('back'),'green',cells,0);
      const provenance=[{...item.provenance[0],produced:['walking/south/0']}];
      await mergeClip(ctx,item,'walking',['south'],cells,provenance,qa);
      const changed=ledger.project.manifest.items.find(i=>i.id===item.id);
      counts.push(changed.designWarnings?.length??0);
      expect(changed.designWarnings??[]).toEqual(initial.designWarnings??[]);
    }
    const rec=structuredClone(ledger.project), kept=rec.manifest.items.find(i=>i.id===saved.item.id);
    rec.manifest.items=rec.manifest.items.filter(i=>i.slot==='body'||i.id===kept.id);
    const project={manifest:rec.manifest,images:f.ctx.project.images};
    for(const [hash,blob]of ledger.blobs)if(/^[a-f0-9]{64}$/.test(hash))project.images.set('sha256:'+hash,await decodePngBytes(new Uint8Array(await blob.arrayBuffer())));
    const errors=validate(project), exported=exportManifest(project,{engines:['generic'],baked:false,exportedAt:'2026-11-07T00:00:00Z'}).manifest.items.find(i=>i.id===kept.id);
    if(errors.length) console.log('Independent export fixture errors:',JSON.stringify(errors));
    expect(errors).toEqual([]);
    expect(exported.designWarnings??[]).toEqual(initial.designWarnings??[]);
    if(name==='clean')expect(initial.designWarnings).toBeUndefined();
    else expect(initial.designWarnings).toHaveLength(1);
    if(name==='dark') {
      expect(initial.designWarnings[0]).toContain('dark patch');expect(initial.designWarnings[0]).not.toContain('smudge');
      expect(initial.designWarnings[0].split('; ')).toHaveLength(1);
      expect(plainReason(initial.designWarnings[0])).toBe('A dark patch is not seen in the other views; check that it is part of the design');
      expect(healthOf(rec.manifest,kept)).toBe('accepted');
    }
    rows.push({name,draftWarnings:result.qa.warnings,savedNotes:initial.designWarnings??[],afterMergeCounts:counts,exportNotes:exported.designWarnings??[],validationErrors:errors,afterMergeHealth:healthOf(rec.manifest,kept)});
  }
  writeFileSync(new URL('../notes-results.json',import.meta.url),JSON.stringify(rows,null,2));
});
test('50ee prompts: actual request and both preview paths agree across native sizes, hands, worn and anchor routes', async()=>{
  const rows=[];
  for(const size of [64,224,240,254,255,256])for(const slot of ['main_hand','off_hand','back'])for(const method of ['skel','anchor']) {
    const f=await singleStandingFixture();f.ctx.rec.manifest.rig.cell={w:size,h:size};f.ctx.rec.manifest.items[0].layers[0].cell={w:size,h:size};
    for(const [hash]of f.ctx.project.images) {
      const body=makeImg(size,size);paint(body,Math.floor(size/2)-3,8,6,20,[180,130,100]);f.ctx.project.images.set(hash,body);
      ledger.blobs.set(hash.slice(7),new Blob([await encodePngBytes(body)]));
    }
    const input={name:'Captured',slot,prompt:slot==='off_hand'?'a wooden shield':slot==='main_hand'?'a steel sword':'a blue cape'};
    let request;ledger.output=async req=>{request=req;throw new Error('Independent mock capture only');};
    const draft=newDraft(f.ctx,{...input,key:'green',method,anims:['walking'],dirs:['south']});
    try {await runItem(draft,f.ctx);}catch(error){expect(error.message).toContain('Independent mock capture');}
    expect(request).toBeTruthy();const body=request.body, expected=slot!=='back'&&method==='skel';
    expect(body.description.includes('held in the character')).toBe(expected);
    expect(body.description.includes('exactly one')).toBe(expected);
    const draftDescription=draftPlan(draft).find(c=>c.path==='/edit-animation-v2').body.description;
    expect(draftDescription).toBe(body.description);
    let planMatches=null;
    if(method==='skel') {const plan=itemPlan(f.ctx,input).find(c=>c.path==='/edit-animation-v2');expect(plan).toBeTruthy();expect(plan.body.description).toBe(body.description);planMatches=true;}
    rows.push({size,slot,method,hasHand:expected,canvas:body.image_size,draftPreviewMatches:true,pricedPreviewMatches:planMatches,descriptionLength:body.description.length});
  }
  const matrix=[];let unchanged=0,changes=0;
  for(const slot of SLOTS)for(const method of ['skel','anchor',undefined])for(let size=16;size<=320;size++) {
    const spec={slot:slot.id,method,prompt:'a sample item'},pad=padOf(slot.id,method,{w:size,h:size}),before=pad?heldPhrase(spec.prompt,spec.slot):spec.prompt,now=dressItem(spec);
    if(before!==now){changes++;expect(method==='skel'&&slot.class==='held'&&pad===0).toBe(true);}else unchanged++;
  }
  writeFileSync(new URL('../prompt-results.json',import.meta.url),JSON.stringify({rows,matrix:{changes,unchanged}},null,2));
});
`;
writeFileSync(new URL('notes-prompts.generated.test.ts',tmp),original+extra);
console.log('Prepared independent offline notes and prompt checks.');
