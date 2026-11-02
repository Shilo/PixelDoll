import {afterEach,expect,test,vi} from 'vitest';
import {makeImg,bytesToBase64,type Img} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../src/lib/image/hash.ts';
import {toChroma} from '../../src/lib/image/chroma.ts';
import {padImg} from '../../src/lib/items/items.ts';

const controls=vi.hoisted(()=>({pilot:null as unknown,existing:undefined as {id:string}|undefined,enqueue:vi.fn(),reconcile:vi.fn(async()=>{}),approvedCanonical:'',approvedHash:''}));
// Only the synthetic reviewed packet substitutes for the production pin. PNG and request hashes remain real.
vi.mock('../../src/lib/image/hash.ts',async original=>{const real=await original<typeof import('../../src/lib/image/hash.ts')>();return{...real,sha256:(data:Uint8Array|ArrayBuffer|string)=>typeof data==='string'&&data===controls.approvedCanonical?Promise.resolve(controls.approvedHash):real.sha256(data)};});
vi.mock('../../src/ui/motion-lab/pilot.ts',()=>({readPilot:()=>controls.pilot}));
vi.mock('../../src/ui/motion-lab/run.ts',()=>({
  labQueue:{key:'synthetic-test-session',enqueue:(...args:unknown[])=>controls.enqueue(...args),subscribe:(read:(value:{jobs:unknown[]})=>void)=>{read({jobs:[]});return()=>{};}},
  LAB_TAG:'synthetic-managed-probe',reconcileResearchJobs:controls.reconcile,existingLabRequest:()=>controls.existing,
}));
import {MANAGED_PROBE_SHA256,parseManagedEquipment,readManagedEquipment,submitManagedEquipment,type ManagedEquipmentProbe} from '../../src/ui/motion-lab/managed-equipment.ts';
import {readResearchBudget,recordResearchGate,researchBudgetUsage} from '../../src/ui/motion-lab/research-budget.ts';

afterEach(()=>{controls.pilot=null;controls.existing=undefined;controls.enqueue.mockReset();controls.reconcile.mockClear();controls.approvedCanonical='';controls.approvedHash='';vi.unstubAllGlobals();});
async function fixture(gated=true){
  const saved=new Map<string,string>(),tails=new Map<string,Promise<unknown>>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)});
  vi.stubGlobal('navigator',{locks:{request:<T>(key:string,run:()=>T)=>{const next=(tails.get(key)??Promise.resolve()).then(run);tails.set(key,next.catch(()=>undefined));return next;}}});
  const grid=makeImg(432,288),mask=makeImg(432,288),assets=new Map<string,Uint8Array>(),frames:ManagedEquipmentProbe['frames']=[];
  for(let i=0;i<mask.data.length;i+=4)mask.data.set([0,0,0,255],i);
  mask.data.set([255,255,255,255],(20*432+20)*4);
  for(const [cell,index]of [1,3,4,6].entries()){
    const native=makeImg(112,112);
    for(let y=30;y<85;y++)for(let x=40;x<70;x++)native.data.set([70+cell*20,40+y,25+x,255],(y*112+x)*4);
    const bytes=await encodePngBytes(native),url=`https://backblaze.pixellab.ai/synthetic/frame-${index}.png`;
    assets.set(url,bytes);frames.push({index,sha256:await sha256(bytes)});
    const chroma=padImg(toChroma(native,'green'),16);
    for(let y=0;y<144;y++)grid.data.set(chroma.data.subarray(y*144*4,(y+1)*144*4),((Math.floor(cell/3)*144+y)*432+(cell%3)*144)*4);
  }
  const fetchMock=vi.fn(async(url:string)=>{const bytes=assets.get(url);if(!bytes)throw new Error('Unexpected synthetic asset request.');return new Response(bytes as Uint8Array<ArrayBuffer>);});vi.stubGlobal('fetch',fetchMock);
  controls.pilot={characterId:'synthetic-character',verification:[0,1,2,3].map(()=>({changedPixels:0})),character:{animations:[{animation_group_id:'synthetic-group',directions:[{direction:'east',frames:Array.from({length:8},(_,i)=>`https://backblaze.pixellab.ai/synthetic/frame-${i}.png`)}]}]}};
  const packet:ManagedEquipmentProbe={version:1,kind:'managed-equipment-probe',characterId:'synthetic-character',animationGroupId:'synthetic-group',direction:'east',cell:144,cols:3,indices:[1,3,4,6],frames,request:{description:'One synthetic sword diagnostic.',seed:731,no_background:true,inpainting_image:await image(grid),mask_image:await image(mask)}};
  controls.enqueue.mockImplementation(async()=>{expect(readResearchBudget().calls).toMatchObject([{stage:'equipment',units:25,status:'reserved'}]);expect(readManagedEquipment()?.callId).toBeTruthy();return{id:'synthetic-queue-receipt'};});
  if(gated)await recordResearchGate('body',{passed:true,notes:'Synthetic reviewer approved body evidence.',evidence:['synthetic/body-review.json']});
  function review(){controls.approvedCanonical=stableStringify(packet);controls.approvedHash=MANAGED_PROBE_SHA256;}review();
  return{packet,grid,mask,assets,fetchMock,saved,review};
}
async function image(img:Img){return{image:{type:'base64' as const,base64:bytesToBase64(await encodePngBytes(img)),format:'png' as const},size:{width:img.w,height:img.h}};}
function noSpend(){expect(controls.enqueue).not.toHaveBeenCalled();expect(readResearchBudget().calls).toHaveLength(0);expect(readManagedEquipment()).toBeNull();}

test('the fixed probe reserves equipment units and saves its receipt before dispatching the reconstructed allowed request',async()=>{
  const{packet,fetchMock}=await fixture();const result=await submitManagedEquipment(packet);
  expect(fetchMock).toHaveBeenCalledTimes(4);expect(controls.enqueue).toHaveBeenCalledTimes(1);
  expect(controls.enqueue.mock.calls[0][0]).toMatchObject({method:'POST',path:'/inpaint-v3',body:{seed:731,no_background:true,description:packet.request.description}});
  expect(result.jobId).toBe('synthetic-queue-receipt');expect(readResearchBudget().calls[0]).toMatchObject({status:'accepted',units:25,jobIds:['synthetic-queue-receipt']});
});

test('a missing or failed body review blocks the probe before any paid reservation',async()=>{
  const{packet}=await fixture(false);await expect(submitManagedEquipment(packet)).rejects.toThrow('body qualification gate');noSpend();
  await recordResearchGate('body',{passed:false,notes:'Synthetic feet are unstable.',evidence:['synthetic/rejected-body.json']});
  await expect(submitManagedEquipment(packet)).rejects.toThrow('body qualification gate');noSpend();
});

test.each(['queued','failed','done','lost'])('a matching existing %s queue receipt prevents a second reservation or request',async state=>{
  const{packet}=await fixture();controls.existing={id:`synthetic-${state}`};
  await expect(submitManagedEquipment(packet)).rejects.toThrow(`receipt synthetic-${state}`);noSpend();
});

test('concurrent submits dispatch only once and never resend a saved diagnostic',async()=>{
  const{packet}=await fixture();const results=await Promise.allSettled([submitManagedEquipment(packet),submitManagedEquipment(packet)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(controls.enqueue).toHaveBeenCalledTimes(1);expect(readResearchBudget().calls).toHaveLength(1);
  await expect(submitManagedEquipment(packet)).rejects.toThrow('will not be resent');expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test('an uncertain enqueue outcome retains its full reservation and prevents an automatic resend',async()=>{
  const{packet}=await fixture();controls.enqueue.mockRejectedValue(new Error('Synthetic interrupted submission.'));
  await expect(submitManagedEquipment(packet)).rejects.toThrow('interrupted submission');
  expect(readResearchBudget().calls[0]).toMatchObject({status:'unknown',units:25});expect(researchBudgetUsage().reservedUnits).toBe(25);expect(readManagedEquipment()?.error).toContain('interrupted');
  await expect(submitManagedEquipment(packet)).rejects.toThrow('will not be resent');expect(controls.enqueue).toHaveBeenCalledTimes(1);
});

test('a changed managed PNG hash is rejected before a reservation',async()=>{
  const{packet,assets}=await fixture();assets.set('https://backblaze.pixellab.ai/synthetic/frame-1.png',await encodePngBytes(makeImg(112,112)));
  await expect(submitManagedEquipment(packet)).rejects.toThrow('differs from the reviewed frozen input');noSpend();
});

test('a grid with changed frozen body pixels is rejected even when the original asset hash is correct',async()=>{
  const{packet,grid,review}=await fixture();const offset=(46*432+56)*4;grid.data[offset]^=255;packet.request.inpainting_image=await image(grid);review();
  await expect(submitManagedEquipment(packet)).rejects.toThrow('exact frozen body chroma copy');noSpend();
});

test.each(['translucent','gray','reference','empty','oversized'] as const)('the %s mask cannot escape the reviewed editable region contract',async mode=>{
  const{packet,mask,review}=await fixture();
  if(mode==='translucent')mask.data[3]=0;
  if(mode==='gray')mask.data.set([1,1,1,255],0);
  if(mode==='reference')mask.data.set([255,255,255,255],(145*432+145)*4);
  if(mode==='empty')for(let i=0;i<mask.data.length;i+=4)mask.data.set([0,0,0,255],i);
  if(mode==='oversized')for(let y=0;y<288;y++)for(let x=0;x<432;x++)if(Math.floor(y/144)*3+Math.floor(x/144)<4)mask.data.set([255,255,255,255],(y*432+x)*4);
  packet.request.mask_image=await image(mask);review();
  await expect(submitManagedEquipment(packet)).rejects.toThrow(mode==='translucent'||mode==='gray'?'opaque binary':mode==='reference'?'reference cells':'edit region');noSpend();
});

test.each(['prompt','mask','metadata'] as const)('a tampered %s changes the whole-packet hash and is rejected before any asset GET or paid mutation',async mode=>{
  const{packet,mask,fetchMock}=await fixture();
  if(mode==='prompt')packet.request.description+=' Changed outside the reviewed diagnostic.';
  if(mode==='mask'){mask.data.set([255,255,255,255],0);packet.request.mask_image=await image(mask);}
  if(mode==='metadata')packet.unreviewedSessionMetadata='synthetic-unapproved-field';
  await expect(submitManagedEquipment(packet)).rejects.toThrow('differs from the one reviewed equipment diagnostic');
  expect(fetchMock).not.toHaveBeenCalled();noSpend();
});

test('the PNG dimensions and exact frame selection are checked before fetching or spending',async()=>{
  const{packet,fetchMock}=await fixture();packet.request.mask_image.image.base64=bytesToBase64(await encodePngBytes(makeImg(1,1)));
  expect(()=>parseManagedEquipment(packet)).toThrow('PNG dimensions');packet.indices=[0,1,2,3];
  await expect(submitManagedEquipment(packet)).rejects.toThrow('reviewed four-frame');expect(fetchMock).not.toHaveBeenCalled();noSpend();
});
