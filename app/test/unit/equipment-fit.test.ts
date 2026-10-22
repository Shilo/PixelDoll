import { beforeEach,expect,test,vi } from 'vitest';
import { equipmentFixture,bodyOnly } from './equipment-fixture.ts';
import type { Project,Item,Material,CellKey } from '../../src/lib/store/manifest.ts';
import type { EquipmentDesign,FitDraft,FitPlan } from '../../src/lib/equipment/types.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';

const state=vi.hoisted(()=>({projects:new Map<string,unknown>(),blobs:new Map<string,Blob>(),jobs:new Map<string,JobRec>(),posts:0,failSave:false,poseFails:false,strictTransferMin:false,restPreflights:0,qualified:null as string|null,source:null as Project|null}));
vi.mock('../../src/lib/store/db.ts',()=>({
  get:async(s:string,k:string)=>structuredClone((s==='projects'?state.projects:state.jobs).get(k)),
  all:async(s:string)=>[...(s==='projects'?state.projects:state.jobs).values()].map(x=>structuredClone(x)),
  put:async(s:string,k:string,v:unknown)=>{(s==='projects'?state.projects:state.jobs as Map<string,unknown>).set(k,structuredClone(v));},
  del:async(_s:string,k:string)=>{state.projects.delete(k);},
  getBlob:async(k:string)=>state.blobs.get(k),askPersist:()=>{},
  putCharacter:async(id:string,r:unknown,bs:Map<string,Blob>)=>{if(state.projects.has(id))throw new Error('exists');for(const[h,b]of bs)state.blobs.set(h,b);state.projects.set(id,structuredClone(r));},
  update:async(_s:string,id:string,fn:(x:unknown)=>unknown)=>{const out=fn(structuredClone(state.projects.get(id)));state.projects.set(id,structuredClone(out));return structuredClone(out);},
  updateCharacter:async(id:string,bs:Map<string,Blob>,fn:(x:unknown)=>unknown)=>{if(state.failSave){state.failSave=false;throw new Error('local storage temporarily unavailable');}const out=fn(structuredClone(state.projects.get(id)));for(const[h,b]of bs)state.blobs.set(h,b);state.projects.set(id,structuredClone(out));},
  updateCharacterAndDraft:async(id:string,did:string,bs:Map<string,Blob>,fn:(p:unknown,d:unknown)=>{project:unknown;draft:unknown})=>{const out=fn(structuredClone(state.projects.get(id)),structuredClone(state.projects.get(did)));for(const[h,b]of bs)state.blobs.set(h,b);state.projects.set(id,structuredClone(out.project));state.projects.set(did,structuredClone(out.draft));},
}));
vi.mock('../../src/lib/pixellab/queue.ts',()=>({live:(r:JobRec)=>['queued','running','submitting'].includes(r.state),queue:{role:'solo',key:'test-only-placeholder',snapshot:()=>({jobs:[...state.jobs.values()]}),settled:async(id:string)=>state.jobs.get(id)!,enqueue:async(req:{path:string;body:unknown},meta:{tag:string})=>{
  state.posts++;const rec:JobRec={id:crypto.randomUUID(),state:'done',endpoint:req.path,tag:meta.tag,params:req.body,gens:req.path==='/transfer-outfit-v2'?10:2,jobs:[],createdAt:1,label:'Test job',method:'POST',inputs:[],requestHash:'a'.repeat(64),attempts:1,nextAt:0,usd:0};state.jobs.set(rec.id,rec);return rec;
}}}));
vi.mock('../../src/lib/equipment/generate.ts',()=>({
  qualifiedFit:()=>state.qualified,
  restFitRequests:async(_d:unknown,_s:unknown,t:Project,seed:number)=>{state.restPreflights++;if(state.strictTransferMin&&t.manifest.rig.directions.length<2)throw new Error('Transfer requires at least two target frames.');return[{req:{method:'POST',path:'/transfer-outfit-v2',body:{seed}},cells:['rest/south/0'],limit:10}];},
  poseFitRequests:async(_d:unknown,t:Project,_r:unknown,seed:number,selected?:string[])=>t.manifest.rig.animations.map(a=>({req:{method:'POST',path:'/animate-with-skeleton-v3',body:{seed}},cells:Array.from({length:a.cells},(_,i)=>`${a.id}/south/${i}`).filter(k=>!selected||selected.includes(k)),limit:2})).filter(c=>c.cells.length).map(c=>({...c,limit:c.cells.length<=3?2:c.cells.length<=8?3:4})),
  evaluateRestFit:async(_d:unknown,t:Project)=>({project:t,itemId:'base',rest:{south:t.images.get(t.manifest.items[0].layers[0].cells![t.manifest.rig.animations[0].id]!.south![0]!)},warnings:[],fails:[]}),
  evaluatePoseFit:async(design:EquipmentDesign,t:Project,_rest:unknown,records:{call:{cells:string[]};rec:JobRec}[])=>{
    const source=state.source!,hat=structuredClone(source.manifest.items[1]),h=source.manifest.items[1].layers[0].cells!.rest!.south![0]!,m:Material={id:'fitted-preview_1',owner:'fitted-preview',label:'Metal',ramp:['#787878'],variants:{}};
    const paths=records.flatMap(r=>r.call.cells) as CellKey[],history=design.source.items.find(it=>it.id===design.itemId)!.provenance;
    hat.id='fitted-preview';hat.materials=[m.id];hat.layers[0].cells=Object.fromEntries(t.manifest.rig.animations.map(a=>[a.id,{south:Array.from({length:a.cells},(_,i)=>paths.includes(`${a.id}/south/${i}`)?h:null)}]));
    hat.provenance=[...structuredClone(history).map(p=>({...p,produced:[]})),...records.map(r=>({endpoint:r.rec.endpoint,params:{},seed:1,requestHash:`sha256:${'b'.repeat(64)}` as const,createdAt:'',produced:r.call.cells as CellKey[]}))];
    hat.qa={status:'pass',minKeyKept:1,minAreaRatio:1,maxKeyOutside:0,maxAreaCV:0,maxPaletteDist:0,clipPx:0,shiftedFrames:0,strayPx:0,rerolls:0,cells:Object.fromEntries(paths.map(k=>[k,{route:'posed' as const,area:1,provenance:history.length+records.findIndex(r=>r.call.cells.includes(k))}]))};
    const manifest=structuredClone(t.manifest);manifest.items.push(hat);manifest.materials.push(m);
    return{project:{manifest,images:new Map([...t.images,...source.images])},itemId:hat.id,materials:[m],variants:{},warnings:[],fails:state.poseFails?['bad batch']:[],failedCells:state.poseFails?paths:[]};
  }
}));
import { createDesign } from '../../src/lib/equipment/design.ts';
import { encodedImages,saveCreatedDesign,removeDesign,exportDesign,importDesign } from '../../src/lib/equipment/store.ts';
import { prepareCopy,acceptCopy } from '../../src/lib/equipment/copy.ts';
import { createFit,getFit,runRestFit,approveRestAndPose,acceptFit,retryFit,resumeFits,prepareExtensionFit,clearFinishedFits,fitJobRefs,discardFit,reviewFit } from '../../src/lib/equipment/fit.ts';
import { targetAudit } from '../../src/lib/equipment/compatibility.ts';
import { targetStamp } from '../../src/lib/equipment/copy.ts';
import { loadProject } from '../../src/lib/store/project.ts';
import { readCharacterZip,projectEntries } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { saveDress } from '../../src/lib/dress/project.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { recolour } from '../../src/lib/dress/dress.ts';
import { cellImg } from '../../src/lib/compose/compose.ts';
import { planFit } from '../../src/lib/equipment/fit.ts';

beforeEach(()=>{state.projects.clear();state.blobs.clear();state.jobs.clear();state.posts=0;state.failSave=false;state.poseFails=false;state.strictTransferMin=false;state.restPreflights=0;state.qualified=null;});
async function fixture(){
  const source=await equipmentFixture();state.source=source;const target=bodyOnly(source),design=await createDesign(source,'hat',{hat:'blue'});
  for(const[h,b]of await encodedImages(source.images))state.blobs.set(h,b);
  state.projects.set('rig-target',{id:'rig-target',savedAt:'',manifest:target.manifest});
  const assessment={status:'fit' as const,freeCells:0,totalCells:1,missingCells:1,canExtend:false,targetRigReady:true,canCopy:false,reasons:[],warnings:[],matches:[]};
  const {images:_images,...snapshot}=design;
  const plan:FitPlan={design:snapshot,targetId:'rig-target',targetAudit:await targetAudit(target),targetStamp:targetStamp(target.manifest,'head'),assessment,previewGens:10,poseGens:2,directions:['south'],createdAt:new Date().toISOString()};
  return{source,target,design,plan};
}
test('paid stages require separate budgets, publish only after review and accept idempotently',async()=>{
  const{plan}=await fixture(),fit=await createFit(plan,{previewGens:10,poseGens:0});
  await expect(createFit(plan,{previewGens:9,poseGens:100})).rejects.toThrow('cost');
  expect((await runRestFit(fit.id)).stage).toBe('rest-review');expect(state.posts).toBe(1);
  await expect(approveRestAndPose(fit.id,1)).rejects.toThrow('animation cost');expect(state.posts).toBe(1);
  const review=await approveRestAndPose(fit.id,2);expect(review.stage).toBe('fit-review');expect(state.posts).toBe(2);
  expect((await loadProject('rig-target')).project.manifest.items).toHaveLength(1);
  const id=await acceptFit(fit.id,true);expect(await acceptFit(fit.id,true)).toBe(id);
  const{project,rec}=await loadProject('rig-target');expect(project.manifest.items).toHaveLength(2);
  expect((rec as typeof rec&{dress:{current:{items:{head:string}}}}).dress.current.items.head).toBe(id);
  expect(project.manifest.items[1].design!.roleMaterials.hat).toBe(project.manifest.items[1].materials[0]);
});
test('local result-save failure resumes retained paid results without another enqueue',async()=>{
  const{plan}=await fixture(),f=await createFit(plan,{previewGens:10,poseGens:0});state.failSave=true;
  await expect(runRestFit(f.id)).rejects.toThrow('temporarily');expect((await getFit(f.id)).resumeStage).toBe('rest');expect((await getFit(f.id)).spentGens).toBe(10);
  expect((await runRestFit(f.id)).stage).toBe('rest-review');expect(state.posts).toBe(1);
});
test('lost or missing posted records never become a fresh paid request on reload/continue',async()=>{
  const{plan}=await fixture(),f=await createFit(plan,{previewGens:10,poseGens:0});
  f.stage='rest-running';f.calls=[{id:'reserved',stage:'rest',cells:['rest/south/0'],seed:1,limit:10}];state.projects.set(f.id,f);
  await resumeFits();await vi.waitFor(async()=>expect((await getFit(f.id)).stage).toBe('needs-attention'));
  await expect(runRestFit(f.id)).rejects.toThrow('Nothing was resent');expect(state.posts).toBe(0);
});
test('explicit failed-batch retry retains approved rest and charges only its additional pose cap',async()=>{
  const{plan}=await fixture(),f=await createFit(plan,{previewGens:10,poseGens:0});await runRestFit(f.id);state.poseFails=true;
  const failed=await approveRestAndPose(f.id,2);expect(failed.retryGens).toBe(2);await expect(acceptFit(f.id,false)).rejects.toThrow('passing');
  await expect(retryFit(f.id,'pose',1)).rejects.toThrow('additional');state.poseFails=false;
  const ready=await retryFit(f.id,'pose',2);expect(ready.stage).toBe('fit-review');expect(state.posts).toBe(3);expect(ready.calls.filter(c=>c.stage==='rest')).toHaveLength(1);
  expect(ready.calls.filter(c=>c.superseded)).toHaveLength(1);expect(ready.spentGens).toBe(14);
});
test('source/library deletion, target reload, archive restore and re-save design retain source blobs',async()=>{
  const{design,target}=await fixture(),saved=await saveCreatedDesign(design),candidate=await prepareCopy(saved,target);
  const itemId=await acceptCopy('rig-target',candidate,{wear:false});await removeDesign(saved.id);
  const loaded=await loadProject('rig-target'),bytes=await zip(await projectEntries(loaded.project));
  state.projects.clear();state.blobs.clear();const restored=await readCharacterZip(bytes);
  const resaved=await createDesign(restored.project,itemId);expect(resaved.source.items[1].design).toBeUndefined();expect(resaved.images!.size).toBeGreaterThan(0);
  const imported=await importDesign(await exportDesign(resaved));expect(imported.revision).toBe(resaved.revision);
});
test('pending outfit autosave preserves new published wear and drops deleted owners',async()=>{
  const{source,target,design}=await fixture(),candidate=await prepareCopy(design,target);
  await acceptCopy('rig-target',candidate,{wear:true});await saveDress('rig-target',target.manifest,{items:{body:'base'},variants:{}});
  const rec=state.projects.get('rig-target') as {dress:{current:{items:{head:string}}};manifest:Project['manifest']};
  expect(rec.dress.current.items.head).toBe(candidate.itemId);expect(rec.manifest.materials.some(m=>m.owner===candidate.itemId)).toBe(true);
});
test('stale outfit selection cannot restore deleted item or material references',async()=>{
  const{source}=await fixture();await saveDress('rig-target',source.manifest,{items:{body:'base',head:'hat'},variants:{hat:'red'}});
  const rec=state.projects.get('rig-target') as {dress:{current:{items:{head:string|null};variants:Record<string,string>}}};
  expect(rec.dress.current.items.head).toBeNull();expect(rec.dress.current.variants).toEqual({});
});

test('extension preparation is free/deduplicated, reuses target refs and preserves old/new outfit colors through restore',async()=>{
  const source=await equipmentFixture(),b=source.manifest.items[0].layers[0].cells!.rest!.south![0]!,points=LABELS.map(label=>({label,x:0.5,y:0.5}));
  source.manifest.rig.rest={south:{image:b,keypoints:points}};
  source.manifest.rig.animations[0].sources={south:{route:'import',reference:b,keypoints:[points],provenance:[]}};
  source.manifest.items[1].dressed={south:b};source.manifest.items[1].key='green';source.manifest.items[1].route='skeleton-pose';
  source.manifest.items[1].provenance=[{endpoint:'/original',params:{},seed:1,requestHash:b,createdAt:'',produced:['rest/south/0']}];state.source=source;
  for(const[h,blob]of await encodedImages(source.images))state.blobs.set(h,blob);
  const target=bodyOnly(source);state.projects.set('rig-target',{id:'rig-target',savedAt:'',manifest:target.manifest});
  const candidate=await prepareCopy(await createDesign(source,'hat',{hat:'blue'}),target),id=await acceptCopy('rig-target',candidate,{wear:true});
  const loaded=await loadProject('rig-target'),m=loaded.project.manifest,newMove={id:'walk',cells:2,loop:true,frames:[{cell:0,ms:100},{cell:1,ms:100}],sources:{south:{route:'import' as const,reference:b,keypoints:[points,points],provenance:[]}}};
  const moved=structuredClone(loaded.project.images.get(b)!);moved.data.set([180,120,90,255],(51*64+20)*4);
  const movedHash=await(await import('../../src/lib/rig/rig.ts')).cellHash(moved);for(const[h,blob]of await encodedImages(new Map([[movedHash,moved]])))state.blobs.set(h,blob);
  m.rig.animations.push(newMove);m.items[0].layers[0].cells!.walk={south:[b,movedHash]};state.projects.set('rig-target',{...loaded.rec,manifest:m});
  const old=structuredClone(m.items.find(it=>it.id===id)!.layers[0].cells!.rest!.south);
  state.strictTransferMin=true;
  const draft=await prepareExtensionFit('rig-target',id,{anims:['walk']});expect(draft.stage).toBe('rest-review');expect(draft.previewGens).toBe(0);expect(draft.poseGens).toBe(2);expect(state.posts).toBe(0);expect(state.restPreflights).toBe(0);
  expect(draft.plan.extension!.freeMatches!.map(m=>m.target)).toEqual(['walk/south/0']);expect(draft.plan.extension!.cells).toEqual(['walk/south/1']);
  expect((await prepareExtensionFit('rig-target',id,{anims:['walk']})).id).toBe(draft.id);
  expect(draft.plan.design.variants).toEqual({});expect(draft.plan.design.source.materials.filter(mat=>mat.owner===draft.plan.design.itemId).every(mat=>!mat.defaultVariant)).toBe(true);
  const material=m.items.find(it=>it.id===id)!.materials[0];await saveDress('rig-target',m,{items:{body:'base',head:id},variants:{[material]:'red'}});
  const review=await approveRestAndPose(draft.id,2);expect(review.qualityFails).toEqual([]);
  const preview=await reviewFit(draft.id),previewItem=preview.project!.manifest.items.find(it=>it.id===preview.itemId)!;
  for(const anim of ['rest','walk'])expect([...cellImg(recolour(preview.project!,preview.draft.candidate!.variants),previewItem.layers[0],anim,'south',0)!.data.slice((18*64+20)*4,(18*64+20)*4+3)]).toEqual([255,0,0]);
  expect(await acceptFit(draft.id,false)).toBe(id);expect(await acceptFit(draft.id,false)).toBe(id);
  const final=await loadProject('rig-target'),item=final.project.manifest.items.find(it=>it.id===id)!;
  expect(item.layers[0].cells!.rest!.south).toEqual(old);expect(item.layers[0].cells!.walk!.south).toHaveLength(2);
  expect(item.qa!.status).toBe('warn');expect(item.qa!.cells['walk/south/0'].route).toBe('propagated');expect(item.qa!.cells['walk/south/0'].provenance).toBeUndefined();
  expect(item.qa!.unmeasured).toBe(true);
  expect(item.qa!.cells['walk/south/1'].route).toBe('posed');expect(item.provenance.at(-1)!.produced).toEqual(['walk/south/1']);
  for(const variant of ['blue','red'])for(const anim of ['rest','walk']){
    const view=recolour(final.project,{[material]:variant}),image=cellImg(view,item.layers[0],anim,'south',0)!;
    expect([...image.data.slice((18*64+20)*4,(18*64+20)*4+3)]).toEqual(variant==='blue'?[0,0,255]:[255,0,0]);
  }
  const restored=(await readCharacterZip(await zip(await projectEntries(final.project)))).project;
  const baseline=recolour(restored,{}),restoredItem=restored.manifest.items.find(it=>it.id===id)!;
  for(const anim of ['rest','walk'])expect([...cellImg(baseline,restoredItem.layers[0],anim,'south',0)!.data.slice((18*64+20)*4,(18*64+20)*4+3)]).toEqual([0,0,255]);
});

test('all exactly reusable missing poses review for free without rig setup, route eligibility or new API provenance',async()=>{
  const{design,target}=await fixture(),copy=await prepareCopy(design,target),id=await acceptCopy('rig-target',copy,{wear:false});
  const loaded=await loadProject('rig-target'),m=loaded.project.manifest,b=m.items[0].layers[0].cells!.rest!.south![0]!,original=structuredClone(m.items.find(it=>it.id===id)!);
  m.rig.animations.push({id:'standing',cells:2,loop:true,frames:[{cell:0,ms:100},{cell:1,ms:100}]});m.items[0].layers[0].cells!.standing={south:[b,b]};state.projects.set('rig-target',{...loaded.rec,manifest:m});state.qualified='No paid route available';
  const fit=await prepareExtensionFit('rig-target',id,{anims:['standing']});expect(fit.stage).toBe('fit-review');expect(fit.poseGens).toBe(0);expect(fit.previewGens).toBe(0);expect(fit.calls).toEqual([]);expect(state.posts).toBe(0);
  expect(await acceptFit(fit.id,false)).toBe(id);const final=(await loadProject('rig-target')).project.manifest.items.find(it=>it.id===id)!;
  expect(final.layers[0].cells!.rest).toEqual(original.layers[0].cells!.rest);expect(final.layers[0].cells!.standing!.south).toEqual([original.layers[0].cells!.rest!.south![0],original.layers[0].cells!.rest!.south![0]]);
  expect(final.qa!.status).toBe('warn');expect(final.qa!.cells['standing/south/0'].keyKept).toBeUndefined();expect(final.qa!.cells['standing/south/0'].provenance).toBeUndefined();expect(final.provenance).toEqual(original.provenance);
});

test('free-only local save failure continues retained raster work without entering a paid evaluator',async()=>{
  const{design,target}=await fixture(),copy=await prepareCopy(design,target),id=await acceptCopy('rig-target',copy,{wear:false});
  const loaded=await loadProject('rig-target'),m=loaded.project.manifest,b=m.items[0].layers[0].cells!.rest!.south![0]!;
  m.rig.animations.push({id:'standing',cells:1,loop:true,frames:[{cell:0,ms:100}]});m.items[0].layers[0].cells!.standing={south:[b]};state.projects.set('rig-target',{...loaded.rec,manifest:m});state.failSave=true;
  await expect(prepareExtensionFit('rig-target',id,{anims:['standing']})).rejects.toThrow('temporarily');
  const draft=[...state.projects.values()].find(r=>(r as FitDraft).kind==='equipment-fit-draft') as FitDraft;
  expect(draft.stage).toBe('needs-attention');expect(draft.resumeStage).toBe('pose');
  expect((await approveRestAndPose(draft.id,0)).stage).toBe('fit-review');expect(state.posts).toBe(0);expect(await acceptFit(draft.id,false)).toBe(id);
});

test('one-direction approved refs bypass transfer-only limits; ordinary or changed refs cannot',async()=>{
  const source=await equipmentFixture(),b=source.manifest.items[0].layers[0].cells!.rest!.south![0]!,points=LABELS.map(label=>({label,x:0.5,y:0.5}));
  source.manifest.rig.rest={south:{image:b,keypoints:points}};source.manifest.rig.animations[0].sources={south:{route:'import',reference:b,keypoints:[points],provenance:[]}};
  source.manifest.items[1].dressed={south:b};source.manifest.items[1].key='green';source.manifest.items[1].provenance=[{endpoint:'/original',params:{},seed:1,requestHash:b,createdAt:'',produced:['rest/south/0']}];state.source=source;
  for(const[h,blob]of await encodedImages(source.images))state.blobs.set(h,blob);
  const target=bodyOnly(source),design=await createDesign(source,'hat');state.projects.set('rig-target',{id:'rig-target',savedAt:'',manifest:target.manifest});
  const copy=await prepareCopy(design,target),id=await acceptCopy('rig-target',copy,{wear:false}),loaded=await loadProject('rig-target'),m=loaded.project.manifest;
  const moved=structuredClone(source.images.get(b)!);moved.data.set([180,120,90,255],(51*64+20)*4);const mh=await(await import('../../src/lib/rig/rig.ts')).cellHash(moved);for(const[h,blob]of await encodedImages(new Map([[mh,moved]])))state.blobs.set(h,blob);
  m.rig.animations.push({id:'move',cells:7,loop:true,frames:[{cell:0,ms:100}],sources:{south:{route:'import',reference:b,keypoints:Array(7).fill(points),provenance:[]}}});m.items[0].layers[0].cells!.move={south:Array(7).fill(mh)};
  const material=m.items.find(it=>it.id===id)!.materials[0];m.materials.find(mat=>mat.id==='base')!.variants['preview-skin']=['#123456'];
  state.projects.set('rig-target',{...loaded.rec,manifest:m,dress:{current:{items:{body:'base',head:id},variants:{[material]:'blue',base:'preview-skin'}}}});state.strictTransferMin=true;
  const fit=await prepareExtensionFit('rig-target',id,{anims:['move']});expect(fit.previewGens).toBe(0);expect(fit.poseGens).toBe(3);expect(state.restPreflights).toBe(0);
  const restReview=await reviewFit(fit.id),view=recolour(restReview.project!,restReview.draft.candidate!.variants),hat=view.manifest.items.find(it=>it.id===id)!;
  expect(restReview.draft.candidate!.variants[material]).toBe('blue');expect(restReview.draft.candidate!.variants.base).toBe('preview-skin');
  expect([...cellImg(view,hat.layers[0],'rest','south',0)!.data.slice((18*64+20)*4,(18*64+20)*4+3)]).toEqual([0,0,255]);
  expect([...cellImg(view,view.manifest.items[0].layers[0],'rest','south',0)!.data.slice((50*64+20)*4,(50*64+20)*4+3)]).toEqual([18,52,86]);
  expect([...restReview.project!.images.get(hat.layers[0].cells!.rest!.south![0]!)!.data.slice((18*64+20)*4,(18*64+20)*4+3)]).toEqual([120,120,120]);
  expect(restReview.draft.rest).toEqual(m.items.find(it=>it.id===id)!.dressed);
  await expect(planFit(design,'rig-target')).rejects.toThrow('at least two');
  m.rig.rest!.south!.keypoints=structuredClone(points);m.rig.rest!.south!.keypoints[0].x=0.6;state.projects.set('rig-target',{...loaded.rec,manifest:m});
  await expect(prepareExtensionFit('rig-target',id,{anims:['move']})).rejects.toThrow('at least two');expect(state.posts).toBe(0);
});

test('finished-fit cleanup releases snapshots and job protection while pending fits retain their pins',async()=>{
  const{plan}=await fixture(),pending=await createFit(plan,{previewGens:10,poseGens:0}),finished=await createFit(plan,{previewGens:10,poseGens:0});
  await runRestFit(finished.id);await approveRestAndPose(finished.id,2);await acceptFit(finished.id,false);
  const completed=await getFit(finished.id);expect((await fitJobRefs()).has(completed.calls[0].recId!)).toBe(false);
  expect(state.projects.has(finished.id)).toBe(true);await clearFinishedFits();expect(state.projects.has(finished.id)).toBe(false);expect(state.projects.has(pending.id)).toBe(true);
  await discardFit(pending.id);expect(state.projects.has(pending.id)).toBe(false);
});
