import { expect,test } from 'vitest';
import { equipmentFixture,bodyOnly } from './equipment-fixture.ts';
import { createDesign,designRevision,designRestReferences } from '../../src/lib/equipment/design.ts';
import { assessDesign } from '../../src/lib/equipment/compatibility.ts';
import { prepareCopy,targetStamp,publishCandidate,extensionStamp,restStamp } from '../../src/lib/equipment/copy.ts';
import { saveCreatedDesign } from '../../src/lib/equipment/store.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { cellImg } from '../../src/lib/compose/compose.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
import type { DirectionName } from '../../src/lib/store/manifest.ts';
import { mergeQa } from '../../src/lib/items/qa-summary.ts';

test('same frozen cells copy despite renamed moves and playback metadata; target playback stays owned',async()=>{
  const p=await equipmentFixture(),design=await createDesign(p,'hat',{hat:'blue'}),target=bodyOnly(p),base=target.manifest.items[0];
  target.manifest.rig.animations[0]={...target.manifest.rig.animations[0],id:'standing',loop:false,frames:[{cell:0,ms:987}]};
  base.layers[0].cells={standing:{south:[p.manifest.items[0].layers[0].cells!.rest!.south![0]]}};
  expect((await assessDesign(design,target)).freeCells).toBe(1);
  const candidate=await prepareCopy(design,target);
  expect(candidate.project.manifest.rig.animations[0].frames[0].ms).toBe(987);
  const item=candidate.project.manifest.items.find(i=>i.id===candidate.itemId)!;
  const rendered=cellImg(recolor(candidate.project,{}),item.layers[0],'standing','south',0)!;
  expect([...rendered.data.slice((18*64+20)*4,(18*64+20)*4+4)]).toEqual([0,0,255,255]);
  const stamp=targetStamp(target.manifest,'head');target.manifest.rig.animations[0].frames[0].ms=500;expect(targetStamp(target.manifest,'head')).toBe(stamp);
});
test('fitting references preserve selected RGB channels exactly',async()=>{
  const p=await equipmentFixture(),design=await createDesign(p,'hat',{hat:'red'}),reference=designRestReferences(design,p)[0];
  expect([...reference.image.data.slice((18*64+20)*4,(18*64+20)*4+4)]).toEqual([255,0,0,255]);
});
test('saving a fitted copy cannot pair stale dressed artwork with newly changed standing joints',async()=>{
  const p=await equipmentFixture(),base=p.manifest.items[0].layers[0].cells!.rest!.south![0]!,hat=p.manifest.items[1];
  p.manifest.rig.rest={south:{image:base,keypoints:[{label:'NECK',x:0.5,y:0.3}]}};hat.dressed={south:base};hat.route='skeleton-pose';
  const source=await createDesign(p,'hat');hat.design={designId:source.id,revision:source.revision,snapshot:source,roleMaterials:{hat:'hat'},targetAudit:base,targetStamp:'',dressedStamp:restStamp(p.manifest)};
  expect((await createDesign(p,'hat')).source.items[1].dressed).toBeDefined();p.manifest.rig.rest.south!.keypoints[0].x=0.6;
  const changed=await createDesign(p,'hat');expect(changed.source.items[1].dressed).toBeUndefined();expect(changed.source.items[1].route).toBeUndefined();expect(changed.warnings).not.toEqual([]);
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

test('partial extension retains original and transparent pixels, old QA, other directions and actual producer keys',async()=>{
  const source=await equipmentFixture(),target=bodyOnly(source),candidate=await prepareCopy(await createDesign(source,'hat'),target);
  const existing=structuredClone(candidate.project.manifest.items.find(it=>it.id===candidate.itemId)!);
  const m=structuredClone(candidate.project.manifest),h=existing.layers[0].cells!.rest!.south![0]!,other=[...source.images.keys()].at(-1)!;
  m.rig.animations[0].cells=3;existing.layers[0].cells={rest:{south:[h,null,null],east:[h,h,h]}};existing.coverage=['rest/south/0','rest/south/1','rest/east/0','rest/east/1','rest/east/2'];
  const summary={status:'pass' as const,minKeyKept:1,minAreaRatio:1,maxKeyOutside:0,maxAreaCV:0,maxPaletteDist:0,clipPx:0};
  existing.provenance=[{endpoint:'/original',params:{},seed:1,requestHash:m.rig.baseHash,createdAt:'',produced:['rest/south/0','rest/south/1']}];
  existing.qa={...summary,rerolls:0,clips:{'rest/south':summary},cells:{'rest/south/0':{route:'chroma',area:1,provenance:0},'rest/south/1':{route:'chroma',area:0,provenance:0}}};
  m.items=m.items.filter(it=>it.id!==existing.id);m.items.push(existing);
  const generated=structuredClone(existing);generated.id='extension';generated.layers[0].cells={rest:{south:[other as typeof h,other as typeof h,other as typeof h]}};generated.coverage=['rest/south/0','rest/south/1','rest/south/2'];
  generated.design!.snapshot.source.items[1].provenance=structuredClone(existing.provenance);
  generated.provenance=[...structuredClone(existing.provenance),{endpoint:'/new',params:{},seed:2,requestHash:m.rig.baseHash,createdAt:'',produced:['rest/south/0','rest/south/1','rest/south/2']}];
  generated.qa={...summary,status:'warn',maxPaletteDist:7,rerolls:0,clips:{'rest/south':{...summary,status:'warn',maxPaletteDist:7}},cells:{'rest/south/2':{route:'posed',area:1,provenance:1}}};
  const preview={manifest:{...structuredClone(m),items:[...m.items,generated]},images:source.images};
  const ext={...candidate,project:preview,itemId:generated.id,targetStamp:targetStamp(m,'head'),extensionItemId:existing.id,extensionStamp:extensionStamp(m,existing.id),reuseRest:true};
  const out=publishCandidate({id:'rig-target',savedAt:'',manifest:m},ext,{wear:false}),actual=out.manifest.items.find(it=>it.id===existing.id)!;
  expect(actual.layers[0].cells!.rest!.south).toEqual([h,null,other]);expect(actual.layers[0].cells!.rest!.east).toEqual([h,h,h]);
  expect(actual.qa!.status).toBe('warn');expect(actual.qa!.maxPaletteDist).toBe(7);
  expect(actual.qa!.cells['rest/south/0'].provenance).toBe(0);expect(actual.qa!.cells['rest/south/1'].area).toBe(0);expect(actual.qa!.cells['rest/south/2'].provenance).toBe(1);
  expect(actual.provenance[1].produced).toEqual(['rest/south/2']);expect(actual.provenance[0].produced).toEqual(['rest/south/0','rest/south/1']);
});
test('a later measured move cannot clear the warning or unknown measurement flag of a retained copied clip',async()=>{
  const p=await equipmentFixture(),item=p.manifest.items[1],summary={status:'warn' as const,unmeasured:true,minKeyKept:0,minAreaRatio:0,maxKeyOutside:0,maxAreaCV:0,maxPaletteDist:0,clipPx:0};
  item.qa={...summary,rerolls:0,cells:{'rest/south/0':{route:'propagated',area:1}},clips:{'rest/south':summary}};
  const next={...summary,status:'pass' as const,unmeasured:undefined,minKeyKept:1,minAreaRatio:1,rerolls:0,cells:{},clips:{'walk/south':{...summary,status:'pass' as const,unmeasured:undefined,minKeyKept:1,minAreaRatio:1}}};
  const merged=mergeQa(item,next,{});expect(merged.unmeasured).toBe(true);expect(merged.status).toBe('warn');
});
