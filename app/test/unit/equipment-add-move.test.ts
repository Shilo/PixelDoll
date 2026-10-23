import { expect,test,vi } from 'vitest';
import type { StoredProject } from '../../src/lib/store/project.ts';
import type { FitDraft } from '../../src/lib/equipment/types.ts';
import type { Sha256 } from '../../src/lib/store/manifest.ts';

const state=vi.hoisted(()=>({
  projects:new Map<string,unknown>(),blobs:new Map<string,Blob>(),posts:0,
  captured:null as {target:string;item:string;bodyHash:Sha256;blue:number}|null,
}));
vi.mock('../../src/lib/store/db.ts',()=>({
  get:async(store:string,key:string)=>structuredClone(store==='blobs'?state.blobs.get(key):state.projects.get(key)),
  getBlob:async(key:string)=>state.blobs.get(key),
  put:async(store:string,key:string,value:unknown)=>{if(store==='blobs')state.blobs.set(key,value as Blob);else state.projects.set(key,structuredClone(value));},
  updateCharacter:async(key:string,blobs:Map<string,Blob>,fn:(record:unknown)=>unknown)=>{const record=fn(structuredClone(state.projects.get(key)));for(const[h,b]of blobs)state.blobs.set(h,b);state.projects.set(key,structuredClone(record));},
  update:async(_store:string,key:string,fn:(record:unknown)=>unknown)=>{const record=fn(structuredClone(state.projects.get(key)));state.projects.set(key,structuredClone(record));return structuredClone(record);},
}));
vi.mock('../../src/lib/pixellab/queue.ts',()=>({
  live:()=>false,
  queue:{subscribe:(fn:(snapshot:{jobs:unknown[]})=>void)=>{fn({jobs:[]});return()=>{};},enqueue:async()=>{state.posts++;throw new Error('Unexpected paid call in resumed Add move.');}},
}));
// Capture the real persisted contract at the equipment boundary; the normalization and storage path remain real.
vi.mock('../../src/lib/equipment/index.ts',()=>({
  prepareExtensionFit:async(id:string,itemId:string)=>{
    const {project}=await loadProject(id),m=project.manifest,h=m.items[0].layers[0].cells!.new!.south![0]!;
    state.captured={target:targetStamp(m,'head'),item:extensionStamp(m,itemId),bodyHash:h,blue:project.images.get(h)!.data[(40*64+20)*4+2]};
    return{id:'captured-fit'} as FitDraft;
  },
}));

import { equipmentFixture } from './equipment-fixture.ts';
import { splitBase } from '../../src/lib/dress/regions.ts';
import { deriveMaterials } from '../../src/lib/dress/dress.ts';
import { openSource } from '../../src/lib/dress/project.ts';
import { baseHashOf,cellHash } from '../../src/lib/rig/rig.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { loadProject } from '../../src/lib/store/project.ts';
import { encodedImages,snapshotDesign } from '../../src/lib/equipment/store.ts';
import { createDesign } from '../../src/lib/equipment/design.ts';
import { targetAudit } from '../../src/lib/equipment/compatibility.ts';
import { targetStamp,extensionStamp } from '../../src/lib/equipment/copy.ts';
import { addMove } from '../../src/studio/create.ts';

test('resuming a saved body move normalizes pixels before fit stamps, so the next open is stable and free',async()=>{
  const project=await equipmentFixture();await splitBase(project);deriveMaterials(project);
  const m=project.manifest,base=m.items[0],hat=m.items[1],bodyHash=base.layers[0].cells!.rest!.south![0]!;
  const points=LABELS.map(label=>({label,x:0.5,y:0.5}));
  m.rig.rest={south:{image:bodyHash,keypoints:points}};
  m.rig.animations[0].sources={south:{route:'import',reference:bodyHash,keypoints:[points],provenance:[]}};
  const design=await createDesign(project,hat.id);
  hat.design={designId:design.id,revision:design.revision,snapshot:snapshotDesign(design),roleMaterials:{hat:'hat'},targetAudit:await targetAudit(project),targetStamp:targetStamp(m,'head')};
  const originalItemCells=structuredClone(hat.layers),raw=structuredClone(project.images.get(bodyHash)!);
  raw.data.set([120,120,121,255],(40*64+20)*4);const rawHash=await cellHash(raw);project.images.set(rawHash,raw);
  m.rig.animations.push({id:'new',cells:1,loop:true,frames:[{cell:0,ms:100}],sources:{south:{route:'import',reference:bodyHash,keypoints:[points],provenance:[]}}});
  base.layers[0].cells!.new={south:[rawHash]};m.rig.baseHash=await baseHashOf(m.rig,{'rest/south/0':bodyHash,'new/south/0':rawHash});
  for(const item of m.items)item.baseHash=m.rig.baseHash;
  const rawBaseHash=m.rig.baseHash,current={items:{body:base.id,head:hat.id},variants:{hat:'azure'}};
  for(const[hash,blob]of await encodedImages(project.images))state.blobs.set(hash,blob);
  state.projects.set('rig-normalization',{id:'rig-normalization',savedAt:'',manifest:m,character:{id:'existing-character',looks:'humanoid'},dress:{current}});

  // The body clip already exists: real Add move resumes without generation, then invokes real split/derive/save.
  const result=await addMove('rig-normalization',{id:'new',frames:1,items:[],sharedItems:[hat.id],seed:1});
  expect(result).toEqual({fitIds:['captured-fit'],warnings:[]});
  const reopened=await openSource('rig-normalization'),second=await splitBase(reopened.project);deriveMaterials(reopened.project);
  // Before the boundary fix, this second split changes both actual captured stamps.
  expect(state.captured!.target).toBe(targetStamp(reopened.project.manifest,'head'));
  expect(state.captured!.item).toBe(extensionStamp(reopened.project.manifest,hat.id));
  expect(second.changed).toBe(0);expect(second.dirty).toBe(false);expect(state.captured!.blue).toBe(120);
  expect(state.captured!.bodyHash).not.toBe(rawHash);expect(reopened.project.manifest.rig.baseHash).not.toBe(rawBaseHash);
  expect(reopened.project.manifest.items.find(item=>item.id===hat.id)!.layers).toEqual(originalItemCells);
  expect(reopened.current).toEqual(current);
  const persisted=state.projects.get('rig-normalization') as StoredProject&{dress:{current:typeof current}};
  expect(persisted.dress.current.variants.hat).toBe('azure');expect(persisted.manifest.materials.some(material=>material.owner===hat.id&&material.id==='hat')).toBe(true);
  expect(state.posts).toBe(0);
});
