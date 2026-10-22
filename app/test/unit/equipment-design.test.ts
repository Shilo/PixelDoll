import { expect,test } from 'vitest';
import { equipmentFixture,bodyOnly } from './equipment-fixture.ts';
import { createDesign,designRevision } from '../../src/lib/equipment/design.ts';
import { assessDesign } from '../../src/lib/equipment/compatibility.ts';
import { prepareCopy,targetStamp,publishCandidate } from '../../src/lib/equipment/copy.ts';
import { saveCreatedDesign } from '../../src/lib/equipment/store.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { cellImg } from '../../src/lib/compose/compose.ts';
import { recolour } from '../../src/lib/dress/dress.ts';
import type { DirectionName } from '../../src/lib/store/manifest.ts';

test('same frozen cells copy despite renamed moves and playback metadata; target playback stays owned',async()=>{
  const p=await equipmentFixture(),design=await createDesign(p,'hat',{hat:'blue'}),target=bodyOnly(p),base=target.manifest.items[0];
  target.manifest.rig.animations[0]={...target.manifest.rig.animations[0],id:'standing',loop:false,frames:[{cell:0,ms:987}]};
  base.layers[0].cells={standing:{south:[p.manifest.items[0].layers[0].cells!.rest!.south![0]]}};
  expect((await assessDesign(design,target)).freeCells).toBe(1);
  const candidate=await prepareCopy(design,target);
  expect(candidate.project.manifest.rig.animations[0].frames[0].ms).toBe(987);
  const item=candidate.project.manifest.items.find(i=>i.id===candidate.itemId)!;
  const rendered=cellImg(recolour(candidate.project,{}),item.layers[0],'standing','south',0)!;
  expect([...rendered.data.slice((18*64+20)*4,(18*64+20)*4+4)]).toEqual([0,0,255,255]);
  const stamp=targetStamp(target.manifest,'head');target.manifest.rig.animations[0].frames[0].ms=500;expect(targetStamp(target.manifest,'head')).toBe(stamp);
});
test('unambiguous repeated body poses reuse per cell; contradictory equipment does not choose arbitrarily',async()=>{
  const p=await equipmentFixture(),target=bodyOnly(p),b=p.manifest.items[0].layers[0].cells!.rest!.south![0];
  target.manifest.rig.animations=[{id:'new',cells:3,loop:true,frames:[{cell:0,ms:100}]}];target.manifest.items[0].layers[0].cells={new:{south:[b,b,b]}};
  expect((await assessDesign(await createDesign(p,'hat'),target)).freeCells).toBe(3);
  const other=[...p.images.keys()].at(-1)!;
  p.manifest.rig.animations.push({id:'other',cells:1,loop:true,frames:[{cell:0,ms:100}]});
  p.manifest.items[0].layers[0].cells!.other={south:[b]};p.manifest.items[1].layers[0].cells!.other={south:[other as typeof b]};
  const assessment=await assessDesign(await createDesign(p,'hat'),target);expect(assessment.freeCells).toBe(0);expect(assessment.status).toBe('unsupported');
});
test('mirror-resolved gear participates in ambiguity signatures',async()=>{
  const p=await equipmentFixture(),body=p.manifest.items[0],hat=p.manifest.items[1],b=body.layers[0].cells!.rest!.south![0],h=hat.layers[0].cells!.rest!.south![0],other=[...p.images.keys()].at(-1)!;
  p.manifest.rig.directions=[{id:'east'},{id:'west',mirrorOf:'east'}];p.manifest.rig.animations.push({id:'other',cells:1,loop:true,frames:[{cell:0,ms:100}]});
  body.layers[0].cells={rest:{east:[b]},other:{east:[b]}};hat.layers[0].cells={rest:{east:[h]},other:{east:[other as typeof h]}};
  const target=bodyOnly(p),im=cellImg(p,body.layers[0],'rest','west',0)!,mirrored=await cellHash(im);target.images.set(mirrored,im);
  target.manifest.rig.directions=[{id:'west'}];target.manifest.rig.animations=[{id:'new',cells:1,loop:true,frames:[{cell:0,ms:100}]}];target.manifest.items[0].layers[0].cells={new:{west:[mirrored]}};
  const assessment=await assessDesign(await createDesign(p,'hat'),target);expect(assessment.freeCells).toBe(0);expect(assessment.reasons.join(' ')).toContain('differs');
});
test('transparent background layers and partial coverage remain available for free review',async()=>{
  const p=await equipmentFixture();p.manifest.items[1].layers.push({id:'bg',role:'bg',z:9,cells:{rest:{south:[null]}}});
  const design=await createDesign(p,'hat'),target=bodyOnly(p),b=target.manifest.items[0].layers[0].cells!.rest!.south![0];
  target.manifest.rig.animations.push({id:'new',cells:1,loop:true,frames:[{cell:0,ms:100}]});
  // A different frozen pose has no source equipment; retain rest rather than force setup just to copy it.
  const moved=structuredClone(target.images.get(b!)!);moved.data.set([180,120,90,255],(51*64+20)*4);const nh=await cellHash(moved);target.images.set(nh,moved);target.manifest.items[0].layers[0].cells!.new={south:[nh]};
  const a=await assessDesign(design,target);expect(a.canCopy).toBe(true);expect(a.freeCells).toBe(1);expect(a.missingCells).toBe(1);
  const candidate=await prepareCopy(design,target),item=candidate.project.manifest.items.find(i=>i.id===candidate.itemId)!;expect(item.layers[1].cells!.rest!.south).toEqual([null]);
});
test('immutable revisions cannot deduplicate altered metadata and nested lineage does not grow',async()=>{
  const p=await equipmentFixture(),design=await createDesign(p,'hat'),copy=await prepareCopy(design,bodyOnly(p));
  const snapshot=await createDesign(copy.project,copy.itemId);expect(snapshot.source.items.every(it=>!it.design)).toBe(true);
  design.source.name='Tampered';await expect(saveCreatedDesign(design)).rejects.toThrow('immutable revision');
  expect(await designRevision(design.source,design.variants,design.imageHashes)).not.toBe(design.revision);
});
test('atomic free publication keeps saved default in wardrobe and rejects changed slot semantics',async()=>{
  const p=await equipmentFixture(),target=bodyOnly(p),candidate=await prepareCopy(await createDesign(p,'hat',{hat:'blue'}),target);
  const rec={id:'rig-target',manifest:structuredClone(target.manifest),savedAt:''};
  const out=publishCandidate(rec,candidate,{wear:false});expect(out.manifest.materials.find(m=>m.owner===candidate.itemId)!.defaultVariant).toBe('blue');
  const stale={id:'rig-target',manifest:structuredClone(target.manifest),savedAt:''};stale.manifest.slots[1].anchor='hand-r';
  expect(()=>publishCandidate(stale,candidate,{wear:true})).toThrow('character changed');
});
