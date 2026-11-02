import {afterEach,expect,test,vi} from 'vitest';
import {makeImg,bytesToBase64,type Img} from '../../src/lib/image/png.ts';
import {decodePngBytes,encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../src/lib/image/hash.ts';
import {packGrid} from '../../src/lib/items/items.ts';

const controls=vi.hoisted(()=>({approved:new Map<string,string>(),ancestor:null as unknown,jobs:new Map<string,unknown>(),blobs:new Map<string,Blob>(),enqueue:vi.fn(),get:vi.fn(),existing:undefined as {id:string}|undefined}));
// Only synthetic canonical envelopes substitute for reviewed pins. All PNG and RGBA hashes remain real.
vi.mock('../../src/lib/image/hash.ts',async original=>{const real=await original<typeof import('../../src/lib/image/hash.ts')>();return{...real,sha256:(value:Uint8Array|ArrayBuffer|string)=>typeof value==='string'&&controls.approved.has(value)?Promise.resolve(controls.approved.get(value)!):real.sha256(value)};});
vi.mock('../../src/lib/store/db.ts',()=>({get:async(_store:string,id:string)=>{controls.get(id);return controls.jobs.get(id);},getBlob:async(hash:string)=>controls.blobs.get(hash)}));
vi.mock('../../src/ui/motion-lab/run.ts',()=>({labQueue:{key:'synthetic-session',enqueue:(...args:unknown[])=>controls.enqueue(...args)},LAB_TAG:'synthetic-clean-grip',reconcileResearchJobs:async()=>{},existingLabRequest:()=>controls.existing}));
vi.mock('../../src/lib/pixellab/queue.ts',()=>({requestIdentity:async()=>({requestHash:'synthetic-clean-grip-request'})}));
vi.mock('../../src/ui/motion-lab/weapon-swap.ts',async original=>{const real=await original<typeof import('../../src/ui/motion-lab/weapon-swap.ts')>();return{...real,readCompletionSwap:()=>controls.ancestor};});
import {BODY_STAR_RECIPE_SHA256,COMPLETION_SWAP_PACKET_SHA256,SWAP_PACKET_SHA256} from '../../src/ui/motion-lab/weapon-swap.ts';
import {CLEAN_GRIP_KEY,CLEAN_GRIP_PACKET_SHA256,parseCleanGripPacket,submitCleanGrip,readCleanGrip,exportCleanGrip,type CleanGripPacket} from '../../src/ui/motion-lab/clean-grip.ts';
import {readResearchBudget,recordResearchGate,reserveResearchCall,recordResearchOutcome,researchBudgetUsage} from '../../src/ui/motion-lab/research-budget.ts';

afterEach(()=>{controls.approved.clear();controls.ancestor=null;controls.jobs.clear();controls.blobs.clear();controls.enqueue.mockReset();controls.get.mockClear();controls.existing=undefined;vi.unstubAllGlobals();});
const png=async(image:Img)=>{const bytes=await encodePngBytes(image);return{png:bytesToBase64(bytes),sha256:await sha256(bytes),rgbaSha256:await sha256(new Uint8Array(image.data))};};
function put(grid:Img,image:Img,index:number,cols:number){for(let y=0;y<144;y++)grid.data.set(image.data.subarray(y*144*4,(y+1)*144*4),((Math.floor(index/cols)*144+y)*grid.w+(index%cols)*144)*4);}
async function fixture(){
  const saved=new Map<string,string>(),tails=new Map<string,Promise<unknown>>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)});
  vi.stubGlobal('navigator',{locks:{request:<T>(key:string,run:()=>T)=>{const next=(tails.get(key)??Promise.resolve()).then(run);tails.set(key,next.catch(()=>undefined));return next;}}});
  controls.enqueue.mockResolvedValue({id:'synthetic-clean-job'});
  await recordResearchGate('body',{passed:true,notes:'Synthetic body-only gate.',evidence:['synthetic/body.json']});
  await recordResearchGate('equipment',{passed:false,notes:'Prior equipment failure remains.',evidence:['synthetic/failed.json']});
  const green=makeImg(144,144),skin=makeImg(144,144),asset=makeImg(144,144);
  for(let y=50;y<105;y++)for(let x=50;x<75;x++){green.data.set([0,150,0,255],(y*144+x)*4);skin.data.set([180,100,70,255],(y*144+x)*4);}
  for(let y=70;y<73;y++)for(let x=73;x<85;x++)asset.data.set([130,70,20,255],(y*144+x)*4);
  const desired=structuredClone(asset),visible=structuredClone(desired),bits=new Uint8Array(144*144),mask=makeImg(144,144);
  for(let y=0;y<144;y++)for(let x=0;x<144;x++){
    const p=y*144+x,q=p*4;let near=false;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<144&&y+dy>=0&&y+dy<144&&desired.data[((y+dy)*144+x+dx)*4+3])near=true;
    bits[p]=Number(near&&!green.data[q+3]&&x>=16&&x<128&&y>=16&&y<128);mask.data.set([bits[p]*255,bits[p]*255,bits[p]*255,255],q);
    if(green.data[q+3])visible.data.fill(0,q,q+4);
  }
  const reference=structuredClone(green);for(let p=0;p<144*144;p++)if(asset.data[p*4+3])reference.data.set(asset.data.subarray(p*4,p*4+4),p*4);
  const recipe={version:2,cell:144,canonicalHash:BODY_STAR_RECIPE_SHA256,frames:await Promise.all(Array.from({length:8},async(_,index)=>({index,...await png(green)})))};
  controls.approved.set(stableStringify({...recipe,canonicalHash:undefined}),BODY_STAR_RECIPE_SHA256);
  const ancestor={canonicalHash:COMPLETION_SWAP_PACKET_SHA256,bodyRecipe:recipe};
  controls.approved.set(stableStringify({...ancestor,canonicalHash:undefined}),COMPLETION_SWAP_PACKET_SHA256);
  controls.ancestor={version:1,jobId:'source736',packet:ancestor};
  const sources:CleanGripPacket['sourceCompletionSwap'][]=[];
  for(const completion of [true,false]){
    const image=makeImg(completion?432:288,288),cell=completion?2:3;put(image,reference,cell,completion?3:2);
    const bytes=await encodePngBytes(image),resultSha256=await sha256(bytes),source={jobId:completion?'source736':'source733',requestHash:(completion?'a':'b').repeat(64),resultSha256,sourcePacketCanonicalHash:completion?COMPLETION_SWAP_PACKET_SHA256:SWAP_PACKET_SHA256};
    controls.jobs.set(source.jobId,{id:source.jobId,state:'done',requestHash:source.requestHash,jobs:[{results:[{sha:resultSha256,label:'0'}]}]});controls.blobs.set(resultSha256,new Blob([bytes as Uint8Array<ArrayBuffer>]));sources.push(source);
  }
  const grid=packGrid([green,green,reference,reference],[bits,bits,null,null],2),image=await png(grid.image),globalMask=await png(grid.mask),body=await png(green);
  const packet:CleanGripPacket={version:1,kind:'clean-grip-control',cell:144,cols:2,indices:[3,4],frames:await Promise.all([3,4].map(async index=>({index,frozenGreen:body,frozenSkin:await png(skin),editMask:await png(mask),desiredLayer:await png(desired),visibleDesiredLayer:await png(visible)}))),sourceBodyRecipeCanonicalHash:BODY_STAR_RECIPE_SHA256,sourceCompletionSwapPacketCanonicalHash:COMPLETION_SWAP_PACKET_SHA256,sourceCompletionSwap:sources[0],sourceAsset:await png(asset),references:await Promise.all([5,6].map(async(index,i)=>({index,sourceCell:i?3:2,gridCell:i+2,sourceJobId:sources[i].jobId,sourceRequestHash:sources[i].requestHash,sourceResultSha256:sources[i].resultSha256,sourcePacketCanonicalHash:sources[i].sourcePacketCanonicalHash,...await png(reference)}))),gridSha256:image.sha256,maskSha256:globalMask.sha256,canonicalHash:CLEAN_GRIP_PACKET_SHA256,request:{description:'Synthetic reviewed clean-input grip control.',seed:738,no_background:true,inpainting_image:{image:{type:'base64',base64:image.png},size:{width:288,height:288}},mask_image:{image:{type:'base64',base64:globalMask.png},size:{width:288,height:288}}}};
  const approve=()=>controls.approved.set(stableStringify({...packet,canonicalHash:undefined}),CLEAN_GRIP_PACKET_SHA256);approve();
  return{packet,saved,green,mask,bits,grid,approve};
}
function noSpend(){expect(controls.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(0);expect(readCleanGrip()).toBeNull();}

test('exact clean body, actual reference pixels and desired-only margin submit through the shared25-unit one-shot without changing failed gates',async()=>{
  const f=await fixture(),gates=structuredClone(readResearchBudget().gates),before=structuredClone(f.packet);
  await submitCleanGrip(f.packet);expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(readResearchBudget().gates).toEqual(gates);
  expect(researchBudgetUsage().stageUnits.equipment).toBe(25);expect(readCleanGrip()).toMatchObject({packet:before,jobId:'synthetic-clean-job'});expect(f.packet).toEqual(before);
});
test.each(['prompt','mask','skin','extra','seed'] as const)('unreviewed %s packet mutation fails before database reads or reservation',async mode=>{
  const f=await fixture();if(mode==='prompt')f.packet.request.description+=' changed';if(mode==='mask')f.packet.frames[0].editMask.png='AAAA';if(mode==='skin')f.packet.frames[0].frozenSkin.png='AAAA';if(mode==='extra')f.packet.extraUploader=true;if(mode==='seed')f.packet.request.seed=739;
  await expect(submitCleanGrip(f.packet)).rejects.toThrow();expect(controls.get).not.toHaveBeenCalled();noSpend();
});
test.each(['absent','changed-packet','changed-recipe'] as const)('a %s saved736 body ancestor cannot authorize submission',async mode=>{
  const f=await fixture();if(mode==='absent')controls.ancestor=null;else{const a=controls.ancestor as {packet:{canonicalHash:string;bodyRecipe:{canonicalHash:string}}};if(mode==='changed-packet')a.packet.canonicalHash='f'.repeat(64);else a.packet.bodyRecipe.canonicalHash='f'.repeat(64);}
  await expect(submitCleanGrip(f.packet)).rejects.toThrow(/(?:stored completed736|body recipe)/);noSpend();
});
test.each(['not-done','request','result','missing-blob','changed-blob'] as const)('a %s actual reference source fails before the one-shot hold',async mode=>{
  const f=await fixture(),source=f.packet.references[1],job=controls.jobs.get(source.sourceJobId) as {state:string;requestHash:string;jobs:{results:{sha:string}[]}[]};
  if(mode==='not-done')job.state='running';if(mode==='request')job.requestHash='c'.repeat(64);if(mode==='result')job.jobs[0].results[0].sha='c'.repeat(64);if(mode==='missing-blob')controls.blobs.delete(source.sourceResultSha256);if(mode==='changed-blob')controls.blobs.set(source.sourceResultSha256,new Blob([new Uint8Array([1,2,3])]));
  await expect(submitCleanGrip(f.packet)).rejects.toThrow(/(?:source receipt|source result)/);noSpend();
});
test.each(['body-white','unrelated-white','gray','transparent-white'] as const)('even a hypothetically reviewed %s target mask fails the exact transparent-margin contract',async mode=>{
  const f=await fixture(),mask=structuredClone(f.mask),p=mode==='body-white'?70*144+74:mode==='unrelated-white'?20*144+20:70*144+76;
  mask.data.set(mode==='gray'?[127,127,127,255]:mode==='transparent-white'?[255,255,255,0]:[255,255,255,255],p*4);
  f.packet.frames[0].editMask=await png(mask);put(f.grid.mask,mask,0,2);const packed=await png(f.grid.mask);f.packet.request.mask_image.image.base64=packed.png;f.packet.maskSha256=packed.sha256;f.approve();
  await expect(submitCleanGrip(f.packet)).rejects.toThrow(/(?:opaque binary|transparent pixels)/);noSpend();
});
test('changed body or protected reference pixels are rejected even when their image hashes and packet envelope match',async()=>{
  const f=await fixture(),ref=await decodePngBytes(new Uint8Array(await controls.blobs.get(f.packet.references[0].sourceResultSha256)!.arrayBuffer()));
  f.packet.references[0]={...f.packet.references[0],...await png(makeImg(144,144))};f.approve();
  await expect(submitCleanGrip(f.packet)).rejects.toThrow('Hatchet reference differs');expect(ref.w).toBe(432);noSpend();
});
test('the shared one-shot lock keeps historical reservations and prevents concurrent or later resends',async()=>{
  const f=await fixture();await reserveResearchCall({id:'historical-equipment',label:'Historical equipment evidence',stage:'equipment',units:25});await recordResearchOutcome('historical-equipment',{status:'completed',billedUnits:15});
  const old=structuredClone(readResearchBudget().calls[0]);f.saved.set('old-diagnostic-receipt','retained');
  const results=await Promise.allSettled([submitCleanGrip(f.packet),submitCleanGrip(f.packet)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  await expect(submitCleanGrip(f.packet)).rejects.toThrow('will not be resent');expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(readResearchBudget().calls[0]).toEqual(old);expect(readResearchBudget().calls).toHaveLength(2);expect(f.saved.get('old-diagnostic-receipt')).toBe('retained');
});
test('an existing one-shot receipt or uncertain old outcome cannot be reset by importing the packet again',async()=>{
  const f=await fixture(),old={version:1,packet:f.packet,callId:'old-clean-call',error:'Unknown outcome'};f.saved.set(CLEAN_GRIP_KEY,JSON.stringify(old));
  await expect(submitCleanGrip(f.packet)).rejects.toThrow('will not be resent');expect(readCleanGrip()).toEqual(old);expect(controls.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(0);
});
test('read and export do not enqueue or reserve a generation',async()=>{
  await fixture();expect(readCleanGrip()).toBeNull();const result=await exportCleanGrip();expect(result.probe).toBeNull();expect(result.images).toEqual([]);noSpend();
});
test('only the fixed two-frame profile can be imported',async()=>{const f=await fixture();expect(parseCleanGripPacket(f.packet)).toBe(f.packet);f.packet.indices=[0,2];expect(()=>parseCleanGripPacket(f.packet)).toThrow('fixed two-frame');});
