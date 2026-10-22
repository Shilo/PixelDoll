// Explicit paid stages. Drafts pin their source and all request IDs before any publication.
import * as db from '../store/db.ts';
import { loadProject, type StoredProject } from '../store/project.ts';
import { queue, live, type JobRec } from '../pixellab/queue.ts';
import { poseBatches } from '../rig/clips.ts';
import { cellHash, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { validate } from '../export/generic.ts';
import { imageHashes, designRevision, createDesign } from './design.ts';
import { assessDesign, targetAudit } from './compatibility.ts';
import { publishCandidate, targetStamp, extensionStamp, restStamp } from './copy.ts';
import { assertDesign, encodedImages, loadImages, snapshotDesign } from './store.ts';
import { qualifiedFit, restFitRequests, poseFitRequests, evaluateRestFit, evaluatePoseFit, type FitRecord, type GeneratedFitCall } from './generate.ts';
import type { EquipmentDesign, FitCall, FitCandidate, FitDraft, FitPlan, FitReview } from './types.ts';
import type { Img } from '../image/png.ts';
import type { Project, Item, ItemQa, Material, CellKey } from '../store/manifest.ts';
import { variantRampOf, variantOf } from '../dress/dress.ts';
import { colourCounts, fromHex } from '../dress/palette.ts';
import { normaliseItemPalette } from './palette.ts';
import { chromaLayer } from '../image/chroma.ts';
import { cellImg } from '../compose/compose.ts';

export const FIT_PROFILES = [{slot:'head',view:'low top-down',template:'mannequin',cell:64,experimental:true}] as const;
const now=()=>new Date().toISOString();
const seed=()=>crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff;
const active=new Map<string,Promise<FitDraft>>();
const callsOf=(f:FitDraft,s:'rest'|'pose')=>f.calls.filter(c=>c.stage===s&&!c.superseded);
const fitUsage=(fit:FitDraft,ledger:JobRec[])=>ledger.filter(r=>fit.calls.some(c=>c.recId===r.id||r.tag===`${fit.id}:${c.id}`)).reduce((sum,r)=>({spentGens:sum.spentGens+(r.gens??0),spentUsd:sum.spentUsd+(r.usd??0)}),{spentGens:0,spentUsd:0});
const leader=()=>{if(queue.role==='follower')throw new Error('Continue this fit in the active generation tab, or close that tab first.');};
async function sourceOf(design:EquipmentDesign):Promise<Project>{
  assertDesign(design);
  if(await designRevision(design.source,design.variants,design.imageHashes)!==design.revision)throw new Error('The design revision is invalid.');
  const p={manifest:design.source,images:await loadImages(design.imageHashes,design.images)},errors=validate(p);
  if(errors.length)throw new Error(`The design is incomplete: ${errors.slice(0,3).join('; ')}`);return p;
}
async function targetOf(f:FitDraft):Promise<Project>{
  const {project}=await loadProject(f.targetId);
  if(targetStamp(project.manifest,f.plan.design.slot)!==f.plan.targetStamp)throw new Error('The character changed. Prepare a fresh fit plan.');
  if(f.plan.extension&&extensionStamp(project.manifest,f.plan.extension.itemId)!==f.plan.extension.stamp)throw new Error('This equipment changed. Prepare its missing-frame fit again.');return project;
}
const selectedTarget=(target:Project,fit:FitDraft):Project=>fit.plan.extension?{...target,manifest:{...target.manifest,rig:{...target.manifest.rig,animations:target.manifest.rig.animations.filter(a=>fit.plan.extension!.anims.includes(a.id))}}}:target;
const unknownQa=():ItemQa=>({status:'warn',unmeasured:true,minKeyKept:0,minAreaRatio:0,maxKeyOutside:0,maxAreaCV:0,maxPaletteDist:0,clipPx:0,rerolls:0,cells:{},clips:{}});
async function extensionPreviewVariants(targetId:string,originals:Material[],materials:Material[]):Promise<FitCandidate['variants']>{
  const rec=await db.get<StoredProject&{dress?:{current?:{variants:FitCandidate['variants']}}}>('projects',targetId);
  if(!rec)throw new Error('The target character was removed.');
  const selected=rec.dress?.current?.variants??rec.manifest.presets[0]?.variants??{};
  return {...selected,...Object.fromEntries(originals.flatMap((m,i)=>{const name=variantOf(rec.manifest,selected,m.id);return name?[[materials[i].id,name]]:[];}))};
}
async function appendFreeCells(fit:FitDraft,project:Project,item:Item):Promise<void>{
  const extension=fit.plan.extension;if(!extension?.freeMatches?.length||!extension.freeSource)return;
  const source={manifest:extension.freeSource.source,images:await loadImages(extension.freeSource.imageHashes)},original=source.manifest.items.find(i=>i.id===extension.freeSource!.itemId)!;
  item.qa??=unknownQa();const qa=item.qa,clips=qa.clips??={};
  for(const match of extension.freeMatches){
    const[a,d,n]=match.target.split('/') as[string,DirectionName,string],[sa,sd,sn]=match.source.split('/') as[string,DirectionName,string];let area=0;
    for(const[i,l]of original.layers.entries()){
      const im=cellImg(source,l,sa,sd,+sn),hash=im?await cellHash(im):null;
      if(im){project.images.set(hash!,im);for(let p=3;p<im.data.length;p+=4)if(im.data[p])area++;}
      const count=project.manifest.rig.animations.find(anim=>anim.id===a)!.cells,layer=item.layers[i];layer.cells??={};
      ((layer.cells[a]??={})[d]??=Array(count).fill(null))[+n]=hash;
    }
    // Exact raster reuse has no new API preservation measurement or generating-call claim.
    qa.cells[match.target as CellKey]={route:'propagated',area};
    const clip=`${a}/${d}`;const {cells:_cells,clips:_clips,rerolls:_rerolls,...unknown}=unknownQa();clips[clip]??=unknown;clips[clip].unmeasured=true;if(clips[clip].status==='pass')clips[clip].status='warn';
  }
  if(qa.status==='pass')qa.status='warn';
  qa.unmeasured=true;
  item.coverage=[...new Set([...(item.coverage??[]),...extension.freeMatches.map(m=>m.target as CellKey)])];
}
async function freeExtensionReview(fit:FitDraft,target:Project):Promise<FitDraft>{
  const existing=target.manifest.items.find(i=>i.id===fit.plan.extension!.itemId)!,item=structuredClone(existing),id=`gear-${crypto.randomUUID()}`;
  item.id=id;item.coverage=[];item.qa=unknownQa();
  if(!fit.plan.extension!.reuseRest){delete item.dressed;delete item.route;}
  const originals=target.manifest.materials.filter(m=>m.owner===existing.id),materials=originals.map((m,i)=>({...structuredClone(m),id:`${id}_${i+1}`,owner:id}));
  materials.forEach(m=>{delete m.linkTo;});item.materials=materials.map(m=>m.id);
  item.design={designId:fit.plan.design.id,revision:fit.plan.design.revision,snapshot:snapshotDesign(fit.plan.design),roleMaterials:Object.fromEntries(originals.map((m,i)=>[m.id,materials[i].id])),targetAudit:fit.plan.targetAudit,targetStamp:fit.plan.targetStamp,dressedStamp:fit.plan.extension!.reuseRest?restStamp(target.manifest):undefined};
  const project={manifest:structuredClone(target.manifest),images:new Map(target.images)};project.manifest.items.push(item);project.manifest.materials.push(...materials);
  await appendFreeCells(fit,project,item);
  await db.update<FitDraft>('projects',fit.id,f=>{if(!f||!['ready','pose-running'].includes(f.stage))throw new Error('The free fitting draft changed or was removed.');return{...f,stage:'pose-running',updatedAt:now()};});
  return storeResult(fit.id,'pose',project,id,undefined,materials,await extensionPreviewVariants(fit.targetId,originals,materials),['These missing cells reuse exact frozen poses for free. Review the combined result; copied cells have no new API quality measurements.'],[]);
}
async function priceFit(design:EquipmentDesign,targetId:string,options:{reuseApprovedRest?:boolean}={}):Promise<FitPlan>{
  if(!targetId.startsWith('rig-'))throw new Error('Make an editable copy of the demo before fitting equipment.');
  const {project}=await loadProject(targetId),source=await sourceOf(design),assessment=await assessDesign(design,project),rig=project.manifest.rig;
  const reason=qualifiedFit(design,project);if(reason)throw new Error(reason);
  if(!assessment.targetRigReady)throw new Error('Set up the target character’s pose rig before fitting.');
  if(options.reuseApprovedRest&&restStamp(source.manifest)!==restStamp(project.manifest))throw new Error('The approved standing reference contract changed.');
  const requests=options.reuseApprovedRest?[]:await restFitRequests(design,source,project,1),directions=rig.directions.filter(d=>!d.mirrorOf).map(d=>d.id),body=project.manifest.items.find(it=>it.id===rig.baseItem)!;
  const poseGens=rig.animations.reduce((n,a)=>n+directions.filter(d=>body.layers[0].cells?.[a.id]?.[d]?.some(Boolean)&&!(a.cells===1&&a.sources?.[d]?.motion==='imported-rest')).length*poseBatches(a.cells).reduce((s,b)=>s+(b.count<=3?2:b.count<=8?3:4),0),0);
  assessment.warnings.push('Experimental headwear fitting: review every view and move. Failed attempts still cost generations.');
  return{design:snapshotDesign(design),targetId,targetAudit:await targetAudit(project),targetStamp:targetStamp(project.manifest,design.slot),assessment,previewGens:requests.reduce((n,r)=>n+r.limit,0),poseGens,directions,createdAt:now()};
}
export const planFit=(design:EquipmentDesign,targetId:string):Promise<FitPlan>=>priceFit(design,targetId);
export async function getFit(id:string):Promise<FitDraft>{const f=await db.get<FitDraft>('projects',id);if(!f||f.kind!=='equipment-fit-draft')throw new Error('This equipment fit was removed.');return f;}
export const listFits=async():Promise<FitDraft[]> =>(await db.all<FitDraft>('projects')).filter(r=>r?.kind==='equipment-fit-draft'&&r.stage!=='discarded').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
export async function createFit(plan:FitPlan,budget:FitDraft['budget']):Promise<FitDraft>{
  leader();if(!Number.isFinite(budget.previewGens)||!Number.isFinite(budget.poseGens)||budget.previewGens<plan.previewGens||budget.poseGens<0)throw new Error('Approve the displayed rest-preview cost before fitting.');
  const source=await sourceOf(plan.design),{project}=await loadProject(plan.targetId);
  if(targetStamp(project.manifest,plan.design.slot)!==plan.targetStamp)throw new Error('The character changed. Prepare a fresh fit plan.');
  const reason=plan.extension&&!plan.extension.cells.length?null:qualifiedFit(plan.design,project);if(reason)throw new Error(reason);
  const fit:FitDraft={kind:'equipment-fit-draft',format:'pixeldoll-fit/1',id:`equipment-fit:${crypto.randomUUID()}`,name:plan.design.name,targetId:plan.targetId,targetProjectId:plan.targetId,plan:structuredClone(plan),stage:'ready',updatedAt:now(),error:'',previewGens:plan.previewGens,poseGens:plan.poseGens,spentGens:0,spentUsd:0,budget:{...budget},calls:[]};
  await db.putCharacter(fit.id,fit,await encodedImages(source.images));return fit;
}
export async function reviewFit(id:string):Promise<FitReview>{const draft=await getFit(id);return{draft,project:draft.candidate?{manifest:draft.candidate.manifest,images:await loadImages(draft.candidate.imageHashes)}:null,itemId:draft.candidate?.itemId??null};}
export async function discardFit(id:string):Promise<void>{
  leader();if(active.has(id))throw new Error('Wait for the fitting stage to finish before discarding. You can hide it while it runs.');
  const jobs=await db.all<JobRec>('jobs');await db.update<FitDraft>('projects',id,f=>{
    if(!f)throw new Error('The fit was removed.');
    if(f.calls.some(c=>jobs.some(j=>(j.id===c.recId||j.tag===`${id}:${c.id}`)&&live(j))))throw new Error('Wait for submitted jobs before discarding.');
    return{...f,stage:'discarded',candidate:undefined,rest:undefined,updatedAt:now()};
  });
  await db.del('projects',id);
}
export async function clearFinishedFits(before=Infinity):Promise<void>{
  leader();for(const f of await db.all<FitDraft>('projects'))if(f.kind==='equipment-fit-draft'&&['accepted','discarded'].includes(f.stage)&&Date.parse(f.updatedAt)<=before)await db.del('projects',f.id);
}
export async function fitJobRefs():Promise<Set<string>>{const fits=(await listFits()).filter(f=>f.stage!=='accepted'),tags=new Set(fits.flatMap(f=>f.calls.map(c=>`${f.id}:${c.id}`)));return new Set([...fits.flatMap(f=>f.calls.flatMap(c=>c.recId??[])),...(await db.all<JobRec>('jobs')).filter(j=>j.tag&&tags.has(j.tag)).map(j=>j.id)]);}
async function attention(id:string,error:unknown):Promise<void>{const ledger=await db.all<JobRec>('jobs');await db.update<FitDraft>('projects',id,f=>{
  if(!f||['accepted','discarded'].includes(f.stage))throw error;
  if(f.stage!=='rest-running'&&f.stage!=='pose-running')return f;
  return{...f,...fitUsage(f,ledger),stage:'needs-attention',resumeStage:f.stage==='rest-running'?'rest':'pose',error:error instanceof Error?error.message:String(error),updatedAt:now()};
});}
async function restImages(f:FitDraft):Promise<Partial<Record<DirectionName,Img>>>{const images=await loadImages(Object.values(f.rest??{}).filter((h):h is Sha256=>!!h));return Object.fromEntries(Object.entries(f.rest??{}).map(([d,h])=>[d,images.get(h!)]));}
async function records(f:FitDraft,stage:'rest'|'pose'):Promise<FitRecord[]>{
  const ledger=await db.all<JobRec>('jobs'),out:FitRecord[]=[];
  for(const call of callsOf(f,stage)){
    const rec=ledger.find(r=>r.id===call.recId)??ledger.find(r=>r.tag===`${f.id}:${call.id}`);
    if(!rec)throw new Error('A submission has no durable job record. Nothing was resent. Check PixelLab before starting a separate attempt.');
    if(!call.recId){call.recId=rec.id;await db.update<FitDraft>('projects',f.id,current=>({...current!,calls:current!.calls.map(c=>c.id===call.id?{...c,recId:rec.id}:c),updatedAt:now()}));}
    const done=live(rec)?await queue.settled(rec.id):rec;
    if(done.state!=='done')throw new Error(`A fitting job ${done.state}: ${done.error??'no completed images'}. Nothing was resent.`);
    out.push({call,rec:done});
  }return out;
}
async function storeResult(id:string,stage:'rest'|'pose',project:Project,itemId:string,rest:Partial<Record<DirectionName,Img>>|undefined,materials:FitCandidate['materials'],variants:FitCandidate['variants'],warnings:string[],fails:string[],failedCells:string[]=[]):Promise<FitDraft>{
  const images=new Map(project.images),hashes:Partial<Record<DirectionName,Sha256>>={};
  for(const[d,im]of Object.entries(rest??{}))if(im){const h=await cellHash(im);images.set(h,im);hashes[d as DirectionName]=h;}
  const refs=imageHashes(project.manifest);Object.values(hashes).forEach(h=>{if(h&&!refs.includes(h))refs.push(h);});
  const blobs=await encodedImages(await loadImages(refs,images));
  await db.updateCharacter<FitDraft>(id,blobs,f=>{
    if(!f||f.stage!==`${stage}-running`)throw new Error('This fitting stage changed during review.');
    const retryGens=fails.length?(stage==='rest'?callsOf(f,'rest').reduce((n,c)=>n+c.limit,0):callsOf(f,'pose').filter(c=>c.cells.some(k=>failedCells.includes(k))).reduce((n,c)=>n+c.limit,0)):0;
    return{...f,stage:stage==='rest'?'rest-review':'fit-review',resumeStage:undefined,candidate:{manifest:project.manifest,imageHashes:refs,itemId,materials,variants},...(rest?{rest:hashes}:{}),error:'',qualityFails:fails,failedCells,retryGens,retryStage:retryGens?stage:undefined,warnings,updatedAt:now()};
  });return getFit(id);
}
async function finishStage(id:string,stage:'rest'|'pose'):Promise<FitDraft>{
  const fit=await getFit(id),fullTarget=await targetOf(fit);
  if(stage==='pose'&&fit.plan.extension&&!fit.plan.extension.cells.length&&fit.plan.extension.freeMatches?.length)return freeExtensionReview(fit,fullTarget);
  const target=selectedTarget(fullTarget,fit),completed=await records(fit,stage);
  const usage=fitUsage(fit,await db.all<JobRec>('jobs'));
  await db.update<FitDraft>('projects',id,f=>({...f!,...usage,updatedAt:now()}));
  if(stage==='rest'){const r=await evaluateRestFit(fit.plan.design,target,completed);return storeResult(id,stage,r.project,r.itemId,r.rest,[],{},r.warnings,r.fails);}
  const r=await evaluatePoseFit(fit.plan.design,target,await restImages(fit),completed,await records(fit,'rest'),fit.plan.extension?{reuseApprovedSourceRest:fit.plan.extension.reuseRest,selectedCells:fit.plan.extension.cells}:undefined);
  const item=r.project.manifest.items.find(it=>it.id===r.itemId)!,newId=`gear-${crypto.randomUUID()}`,roles:Record<string,string>={};item.id=newId;
  item.coverage=Object.keys(item.qa?.cells??{}) as NonNullable<typeof item.coverage>;
  for(const[i,m]of r.materials.entries()){roles[m.id]=`${newId}_${i+1}`;m.id=roles[m.id];m.owner=newId;}
  item.materials=item.materials.map(id=>roles[id]??id);
  const roleMaterials:Record<string,string>={},unmappedRoles:string[]=[];
  const sourceRoles=fit.plan.design.source.materials.filter(m=>m.owner===fit.plan.design.itemId);
  if(sourceRoles.length===1&&r.materials.length===1)roleMaterials[sourceRoles[0].id]=r.materials[0].id;
  else for(const material of sourceRoles){
    const selected=fit.plan.design.variants[material.id],ramp=selected?variantRampOf(material,selected):material.ramp;
    const matches=r.materials.filter(m=>ramp&&JSON.stringify([...m.ramp].sort())===JSON.stringify([...ramp].sort()));
    if(matches.length===1)roleMaterials[material.id]=matches[0].id;else unmappedRoles.push(material.id);
  }
  if(r.materials.length!==1){r.fails.push('This experimental single-material fitting route produced multiple material roles. Review a separate attempt; this result cannot be kept.');r.failedCells=[...new Set(completed.flatMap(x=>x.call.cells))];}
  item.design={designId:fit.plan.design.id,revision:fit.plan.design.revision,snapshot:snapshotDesign(fit.plan.design),roleMaterials,unmappedRoles,targetAudit:fit.plan.targetAudit,targetStamp:fit.plan.targetStamp,dressedStamp:restStamp(fullTarget.manifest)};
  await appendFreeCells(fit,r.project,item);
  if(fit.plan.extension?.freeMatches?.length)r.warnings.push('Exact matching poses were reused for free. Those cells have no new API body-preservation measurements; review their target appearance.');
  if(unmappedRoles.length)r.warnings.push('Some source colour roles could not be matched exactly. This fitted copy has its own independent materials.');
  if(fit.plan.extension){
    const existing=fullTarget.manifest.items.find(it=>it.id===fit.plan.extension!.itemId)!;
    const palette=new Set(fullTarget.manifest.materials.filter(m=>m.owner===existing.id).flatMap(m=>m.ramp.map(fromHex)));
    const known=colourCounts(existing.layers.flatMap(l=>Object.values(l.cells??{}).flatMap(ds=>Object.values(ds??{}).flatMap(cs=>(cs??[]).flatMap(h=>h&&fullTarget.images.get(h)||[])))));
    // Fixed outline pixels may intentionally have no material ramp; identical existing raw colours remain valid.
    for(const colour of known.keys())palette.add(colour);
    let adjusted=0,unmatched=0;
    for(const l of item.layers)for(const[a,ds]of Object.entries(l.cells??{}))for(const[d,cs]of Object.entries(ds))for(const[i,h]of(cs??[]).entries())if(h){
      const raw=r.project.images.get(h)!,normal=normaliseItemPalette(raw,palette);adjusted+=normal.changed;unmatched+=normal.unmatched;
      if(normal.changed){const hash=await cellHash(normal.image);r.project.images.set(hash,normal.image);cs![i]=hash;const q=item.qa?.cells[`${a}/${d}/${i}` as keyof NonNullable<typeof item.qa>['cells']];if(q)q.snappedPct=normal.changed/Math.max(1,normal.pixels);}
    }
    if(!fit.plan.extension.reuseRest&&item.key)for(const[d,h]of Object.entries(item.dressed??{}))if(h){
      const raw=r.project.images.get(h)!,base=fullTarget.images.get(fullTarget.manifest.rig.rest![d as DirectionName]!.image)!;
      const extracted=chromaLayer(raw,item.key,base).layer,normal=normaliseItemPalette(extracted,palette),data=new Uint8ClampedArray(raw.data);
      adjusted+=normal.changed;unmatched+=normal.unmatched;
      // Change only extracted item RGBs on the actual returned frame. Original key/body pixels and alpha remain intact.
      for(let i=0;i<data.length;i+=4)if(extracted.data[i+3]){data[i]=normal.image.data[i];data[i+1]=normal.image.data[i+1];data[i+2]=normal.image.data[i+2];}
      if(normal.changed){const image={...raw,data},hash=await cellHash(image);r.project.images.set(hash,image);item.dressed![d as DirectionName]=hash;}
    }
    if(adjusted)r.warnings.push(`${adjusted} new item pixels were matched to this copy’s original palette. Actual API body-preservation checks and raw job images are retained.`);
    if(unmatched){r.fails.push('New frames contain ambiguous or distant colours outside this item’s original palette. They cannot be merged while preserving independent recolouring.');r.failedCells=[...new Set(completed.flatMap(x=>x.call.cells))];}
    // Review exactly the eventual merged raster, including original known-transparent cells and other directions.
    const additions=new Set<string>(item.coverage??[]);
    for(const[i,l]of item.layers.entries()){
      const generated=l.cells;l.cells=structuredClone(existing.layers[i].cells??{});
      for(const[a,ds]of Object.entries(generated??{}))for(const[d,cs]of Object.entries(ds))for(const[n,h]of(cs??[]).entries())if(additions.has(`${a}/${d}/${n}`)){
        const count=fullTarget.manifest.rig.animations.find(anim=>anim.id===a)!.cells;
        ((l.cells[a]??={})[d as DirectionName]??=Array(count).fill(null))[n]=h;
      }
    }
    const oldMaterials=fullTarget.manifest.materials.filter(m=>m.owner===existing.id);
    r.project.manifest.materials=r.project.manifest.materials.filter(m=>m.owner!==newId);
    r.materials=oldMaterials.map((m,i)=>({...structuredClone(m),id:`${newId}_${i+1}`,owner:newId}));
    for(const m of r.materials)delete m.linkTo;
    item.materials=r.materials.map(m=>m.id);r.project.manifest.materials.push(...r.materials);
    r.variants=await extensionPreviewVariants(fit.targetId,oldMaterials,r.materials);
    item.design.roleMaterials=Object.fromEntries(oldMaterials.map((m,i)=>[m.id,r.materials[i].id]));
    item.design.unmappedRoles=[];
    const base=fullTarget.manifest.items.find(it=>it.id===fullTarget.manifest.rig.baseItem)!;
    r.project.manifest.rig=structuredClone(fullTarget.manifest.rig);
    r.project.manifest.items=r.project.manifest.items.filter(it=>it.id!==base.id);r.project.manifest.items.unshift(structuredClone(base));
  }
  return storeResult(id,stage,r.project,newId,undefined,r.materials,r.variants,r.warnings,r.fails,r.failedCells);
}
async function submitStage(id:string,stage:'rest'|'pose',requests:GeneratedFitCall[]):Promise<FitDraft>{
  leader();if(!queue.key)throw new Error('Connect PixelLab before starting a paid fit.');
  const calls:FitCall[]=requests.map(r=>({id:crypto.randomUUID(),stage,cells:r.cells,seed:(r.req.body as {seed:number}).seed,limit:r.limit}));
  await db.update<FitDraft>('projects',id,f=>{
    if(!f||f.stage!==(stage==='rest'?'ready':'rest-review'))throw new Error('This fitting stage was already started.');
    const cost=requests.reduce((n,r)=>n+r.limit,0),used=f.calls.filter(c=>c.stage===stage).reduce((n,c)=>n+c.limit,0),approved=stage==='rest'?f.budget.previewGens:f.budget.poseGens;
    if(used+cost>approved)throw new Error('The fitting stage exceeds its approved generation budget.');
    return{...f,stage:`${stage}-running`,calls:[...f.calls,...calls],resumeStage:undefined,error:'',qualityFails:[],updatedAt:now()};
  });
  for(const[i,c]of calls.entries()){
    await targetOf(await getFit(id));
    const rec=await queue.enqueue(requests[i].req,{label:`Fit ${stage}: ${(await getFit(id)).name}`,tag:`${id}:${c.id}`,resumeSafe:true});
    await db.update<FitDraft>('projects',id,f=>({...f!,calls:f!.calls.map(call=>call.id===c.id?{...call,recId:rec.id}:call),updatedAt:now()}));
  }return finishStage(id,stage);
}
function run(id:string,fn:()=>Promise<FitDraft>):Promise<FitDraft>{const running=active.get(id);if(running)return running;const p=fn().catch(async e=>{await attention(id,e);throw e;}).finally(()=>active.delete(id));active.set(id,p);return p;}
export async function resumeFits():Promise<void>{if(queue.role==='follower')return;await clearFinishedFits(Date.now()-7*24*60*60*1000);for(const f of await listFits())if(f.stage==='rest-running'||f.stage==='pose-running'){const stage=f.stage==='rest-running'?'rest':'pose';void run(f.id,()=>finishStage(f.id,stage)).catch(()=>{});}}
export function runRestFit(id:string):Promise<FitDraft>{return run(id,async()=>{
  leader();const f=await getFit(id);
  if(f.stage==='needs-attention'&&f.resumeStage==='rest'){await db.update<FitDraft>('projects',id,current=>({...current!,stage:'rest-running',error:'',updatedAt:now()}));return finishStage(id,'rest');}
  if(f.stage!=='ready')throw new Error('Prepare a new rest preview or continue retained submitted work.');
  return submitStage(id,'rest',await restFitRequests(f.plan.design,await sourceOf(f.plan.design),await targetOf(f),seed()));
});}
export function approveRestAndPose(id:string,budget:number):Promise<FitDraft>{return run(id,async()=>{
  leader();const f=await getFit(id);
  if(f.stage==='needs-attention'&&f.resumeStage==='pose'){await db.update<FitDraft>('projects',id,current=>({...current!,stage:'pose-running',error:'',updatedAt:now()}));return finishStage(id,'pose');}
  if(f.stage!=='rest-review'||!f.rest||f.qualityFails?.length)throw new Error('Review a passing target rest fit before animating.');
  if(!Number.isFinite(budget)||budget<f.poseGens)throw new Error('Approve the displayed animation cost first.');
  const requests=await poseFitRequests(f.plan.design,selectedTarget(await targetOf(f),f),await restImages(f),seed(),f.plan.extension?.cells);
  await db.update<FitDraft>('projects',id,current=>({...current!,budget:{...current!.budget,poseGens:Math.max(current!.budget.poseGens,budget)},updatedAt:now()}));
  return submitStage(id,'pose',requests);
});}
export async function acceptFit(id:string,wear:boolean):Promise<string>{
  leader();const f=await getFit(id);if(f.stage==='accepted'&&f.acceptedItemId)return f.acceptedItemId;
  if(f.stage!=='fit-review'||!f.candidate||f.qualityFails?.length)throw new Error('Review a completed, passing fit before keeping it.');
  const project={manifest:f.candidate.manifest,images:await loadImages(f.candidate.imageHashes)},errors=validate(project);
  if(errors.length)throw new Error(`The candidate failed validation: ${errors.slice(0,3).join('; ')}`);
  const candidate:FitCandidate={project,itemId:f.candidate.itemId,designId:f.plan.design.id,targetAudit:f.plan.targetAudit,targetStamp:f.plan.targetStamp,materials:f.candidate.materials,variants:f.candidate.variants,assessment:f.plan.assessment,extensionItemId:f.plan.extension?.itemId,extensionStamp:f.plan.extension?.stamp,reuseRest:f.plan.extension?.reuseRest};
  await db.updateCharacterAndDraft<StoredProject,FitDraft>(f.targetId,id,await encodedImages(project.images),(record,current)=>{
    if(!current||!record)throw new Error('The fit or target was removed.');
    if(current.stage==='accepted')return{project:record,draft:current};
    if(current.stage!=='fit-review'||current.candidate?.itemId!==candidate.itemId||current.qualityFails?.length)throw new Error('The fitting review changed. Reload it before keeping.');
    return{project:publishCandidate(record,candidate,{wear}),draft:{...current,stage:'accepted',acceptedItemId:current.plan.extension?.itemId??candidate.itemId,updatedAt:now()}};
  });return f.plan.extension?.itemId??candidate.itemId;
}

/** Reuse approved target-local raw references. Preparing an extension never submits a request. */
export async function prepareExtensionFit(targetId:string,itemId:string,options:{anims?:string[]}={}):Promise<FitDraft>{
  leader();const {project}=await loadProject(targetId),item=project.manifest.items.find(it=>it.id===itemId);
  if(!item?.design||item.status!=='accepted')throw new Error('Choose an accepted fitted copy.');
  const dirs=project.manifest.rig.directions.filter(d=>!d.mirrorOf).map(d=>d.id),body=project.manifest.items.find(it=>it.id===project.manifest.rig.baseItem)!;
  const anims=project.manifest.rig.animations.filter(a=>(!options.anims||options.anims.includes(a.id))&&dirs.some(d=>body.layers[0].cells?.[a.id]?.[d]?.some(Boolean)&&(item.coverage?Array.from({length:a.cells},(_,i)=>`${a.id}/${d}/${i}` as NonNullable<typeof item.coverage>[number]).some(k=>!item.coverage!.includes(k)):!item.layers.some(l=>(l.cells?.[a.id]?.[d]?.length===a.cells))))).map(a=>a.id);
  if(!anims.length)throw new Error('This copy already covers the requested moves.');
  const stamp=extensionStamp(project.manifest,itemId);
  const pending=(await listFits()).find(f=>f.targetId===targetId&&f.plan.targetStamp===targetStamp(project.manifest,item.slot)&&f.plan.extension?.itemId===itemId&&f.plan.extension.stamp===stamp&&JSON.stringify([...f.plan.extension.anims].sort())===JSON.stringify([...anims].sort())&&!['accepted','discarded'].includes(f.stage));
  if(pending)return pending;
  const reuseRest=!!item.dressed&&dirs.every(d=>item.dressed?.[d])&&item.design.dressedStamp===restStamp(project.manifest);
  const covered=new Set<string>(item.coverage??item.layers.flatMap(l=>Object.entries(l.cells??{}).flatMap(([a,ds])=>Object.entries(ds).flatMap(([d,cs])=>(cs??[]).map((_,i)=>`${a}/${d}/${i}`)))));
  const missing=project.manifest.rig.animations.filter(a=>anims.includes(a.id)).flatMap(a=>dirs.filter(d=>body.layers[0].cells?.[a.id]?.[d]?.some(Boolean)).flatMap(d=>Array.from({length:a.cells},(_,i)=>`${a.id}/${d}/${i}`).filter(k=>!covered.has(k))));
  const freeDesign=await createDesign(project,itemId,{},item.name);freeDesign.variants={};
  freeDesign.source.presets.forEach(p=>{p.variants={};});freeDesign.source.materials.filter(m=>m.owner===itemId).forEach(m=>{delete m.defaultVariant;});
  freeDesign.revision=await designRevision(freeDesign.source,freeDesign.variants,freeDesign.imageHashes);
  const assessment=await assessDesign(freeDesign,project),freeMatches=assessment.matches.filter(m=>missing.includes(m.target)),freeKeys=new Set(freeMatches.map(m=>m.target)),cells=missing.filter(k=>!freeKeys.has(k));
  if(!cells.length){
    const plan:FitPlan={design:snapshotDesign(freeDesign),targetId,targetAudit:await targetAudit(project),targetStamp:targetStamp(project.manifest,item.slot),assessment,previewGens:0,poseGens:0,directions:dirs,createdAt:now(),extension:{itemId,anims,cells,stamp,reuseRest,freeMatches,freeSource:snapshotDesign(freeDesign)}};
    const fit=await createFit(plan,{previewGens:0,poseGens:0});return run(fit.id,async()=>freeExtensionReview(fit,await targetOf(fit)));
  }
  const design:EquipmentDesign=reuseRest?await createDesign(project,itemId,{},item.name):structuredClone(item.design.snapshot);
  design.images=await loadImages(design.imageHashes,project.images);
  const sourceMaterials=design.source.materials.filter(m=>m.owner===design.itemId),targetMaterials=project.manifest.materials.filter(m=>m.owner===itemId);
  const signature=(ramps:string[][])=>JSON.stringify(ramps.flat().map(h=>h.toLowerCase()).sort());
  const rawMatches=signature(sourceMaterials.map(m=>m.ramp))===signature(targetMaterials.map(m=>m.ramp));
  const visibleMatches=signature(sourceMaterials.map(m=>{const name=design.variants[m.id]??m.defaultVariant;return(name&&variantRampOf(m,name))||m.ramp;}))===signature(targetMaterials.map(m=>m.ramp));
  if(!reuseRest&&!rawMatches&&!visibleMatches)throw new Error('The original source colourway cannot be matched exactly to this copy’s raw palette. No fitting request was sent.');
  if(reuseRest||rawMatches){design.variants={};design.source.presets.forEach(p=>{p.variants={};});sourceMaterials.forEach(m=>{delete m.defaultVariant;});}
  design.revision=await designRevision(design.source,design.variants,design.imageHashes);
  const plan=await priceFit(design,targetId,{reuseApprovedRest:reuseRest});plan.extension={itemId,anims,cells,stamp,reuseRest,freeMatches,freeSource:freeMatches.length?snapshotDesign(freeDesign):undefined};
  const narrowed={...project,manifest:{...project.manifest,rig:{...project.manifest.rig,animations:project.manifest.rig.animations.filter(a=>anims.includes(a.id))}}};
  const rest=Object.fromEntries(dirs.map(d=>[d,project.images.get(reuseRest?item.dressed![d]!:project.manifest.rig.rest![d]!.image)!]));
  plan.poseGens=(await poseFitRequests(design,narrowed,rest,1,cells)).reduce((n,c)=>n+c.limit,0);
  const fit=await createFit(plan,{previewGens:plan.previewGens,poseGens:0});
  if(reuseRest){
    const materials=project.manifest.materials.filter(m=>m.owner===itemId),variants=await extensionPreviewVariants(targetId,materials,materials);
    await db.update<FitDraft>('projects',fit.id,current=>({...current!,stage:'rest-review',rest:structuredClone(item.dressed),candidate:{manifest:structuredClone(project.manifest),imageHashes:imageHashes(project.manifest),itemId,materials:[],variants},warnings:['Existing target standing references are reused for free. Only missing cells will be generated; existing approved cells and outfit colours are kept.'],updatedAt:now()}));
  }
  return getFit(fit.id);
}

/** An explicit additional charged attempt, reusing successful batches and the approved target rest. */
export function retryFit(id:string,stage:'rest'|'pose',budget:number):Promise<FitDraft>{return run(id,async()=>{
  leader();const f=await getFit(id);
  if(f.retryStage!==stage||!f.retryGens||!Number.isFinite(budget)||budget<f.retryGens)throw new Error('Approve the displayed additional attempt cost first.');
  const ledger=await db.all<JobRec>('jobs');
  if(callsOf(f,stage).some(c=>{const r=ledger.find(j=>j.id===c.recId);return !r||live(r)||r.state==='lost';}))throw new Error('A submitted request is still running or unknown. It will not be resent.');
  const target=selectedTarget(await targetOf(f),f),all=stage==='rest'?await restFitRequests(f.plan.design,await sourceOf(f.plan.design),target,seed()):await poseFitRequests(f.plan.design,target,await restImages(f),seed(),f.plan.extension?.cells);
  const requests=stage==='rest'?all:all.filter(r=>r.cells.some(k=>f.failedCells?.includes(k)));
  const cost=requests.reduce((n,r)=>n+r.limit,0);if(!cost||cost>budget)throw new Error('The retry coverage or cost changed. Review the fit again.');
  await db.update<FitDraft>('projects',id,current=>{
    if(!current||current.updatedAt!==f.updatedAt)throw new Error('This fitting review changed.');
    return{...current,stage:stage==='rest'?'ready':'rest-review',calls:current.calls.map(c=>c.stage===stage&&!c.superseded&&(stage==='rest'||c.cells.some(k=>f.failedCells?.includes(k)))?{...c,superseded:true}:c),budget:{previewGens:current.budget.previewGens+(stage==='rest'?budget:0),poseGens:current.budget.poseGens+(stage==='pose'?budget:0)},retryGens:0,retryStage:undefined,error:'',updatedAt:now()};
  });return submitStage(id,stage,requests);
});}
