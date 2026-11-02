import {afterEach,expect,test,vi} from 'vitest';
import {makeImg,bytesToBase64,type Img} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../src/lib/image/hash.ts';
import type {InpaintV3} from '../../src/lib/pixellab/routes.ts';

const controls=vi.hoisted(()=>({approved:'',approvedHash:'',sourceApproved:'',sourceApprovedHash:'',recipeApproved:'',recipeApprovedHash:'',prior:undefined as unknown,jobs:new Map<string,unknown>(),blobs:new Map<string,Blob>(),receipts:new Map<string,string>(),exportDisarm:vi.fn(),exportCompletionDisarm:vi.fn(),dispatch:vi.fn(),export:vi.fn()}));
vi.mock('../../src/lib/image/hash.ts',async original=>{const real=await original<typeof import('../../src/lib/image/hash.ts')>();return{...real,sha256:(data:Uint8Array|ArrayBuffer|string)=>typeof data==='string'&&data===controls.approved?Promise.resolve(controls.approvedHash):typeof data==='string'&&data===controls.sourceApproved?Promise.resolve(controls.sourceApprovedHash):typeof data==='string'&&data===controls.recipeApproved?Promise.resolve(controls.recipeApprovedHash):real.sha256(data)};});
vi.mock('../../src/ui/motion-lab/weapon-aware.ts',async original=>{const real=await original<typeof import('../../src/ui/motion-lab/weapon-aware.ts')>();return{...real,exportDisarm:()=>{controls.exportDisarm();return Promise.resolve(controls.prior);},exportCompletionDisarm:()=>{controls.exportCompletionDisarm();return Promise.resolve(controls.prior);}};});
vi.mock('../../src/lib/store/db.ts',()=>({get:async(_store:string,id:string)=>controls.jobs.get(id),getBlob:async(sha:string)=>controls.blobs.get(sha)}));
vi.mock('../../src/ui/motion-lab/fixed-inpaint.ts',()=>({dispatchFixedInpaint:(...args:unknown[])=>controls.dispatch(...args),readFixedInpaint:(key:string)=>JSON.parse(controls.receipts.get(key)??'null'),exportFixedInpaint:(key:string)=>controls.export(key)}));
import {DISARM_PACKET_SHA256,COMPLETION_DISARM_PACKET_SHA256} from '../../src/ui/motion-lab/weapon-aware.ts';
import {SWAP_KEY,SWAP_PACKET_SHA256,COMPLETION_SWAP_KEY,COMPLETION_SWAP_PACKET_SHA256,BODY_STAR_RECIPE_SHA256,readSwap,readCompletionSwap,exportCompletionSwap,parseSwapPacket,submitSwap,type SwapPacket} from '../../src/ui/motion-lab/weapon-swap.ts';

type Prior={probe:{callId:string;jobId:string;packet:{canonicalHash:string;gridSha256:string;frames:{index:number;weaponMask:string;bodyMask:string;unknownMask:string;grip:{x:number;y:number}}[]}};job:{id:string;state:string;inputs:string[]};images:{sha:string;png:string}[]};
afterEach(()=>{controls.approved='';controls.approvedHash='';controls.sourceApproved='';controls.sourceApprovedHash='';controls.recipeApproved='';controls.recipeApprovedHash='';controls.prior=undefined;controls.jobs.clear();controls.blobs.clear();controls.receipts.clear();controls.exportDisarm.mockClear();controls.exportCompletionDisarm.mockClear();controls.dispatch.mockReset();controls.export.mockReset();});
function put(grid:Img,cell:Img,index:number,cols=2){for(let y=0;y<144;y++)grid.data.set(cell.data.subarray(y*144*4,(y+1)*144*4),((Math.floor(index/cols)*144+y)*grid.w+(index%cols)*144)*4);}
function black(){const image=makeImg(144,144);for(let p=0;p<144*144;p++)image.data[p*4+3]=255;return image;}
const set=(image:Img,x:number,y:number,value=255)=>image.data.set([value,value,value,255],(y*image.w+x)*4);
const base64=async(image:Img)=>bytesToBase64(await encodePngBytes(image));
async function fixture(){
  const input=makeImg(288,288),bare=makeImg(288,288),mask=makeImg(288,288),frames:SwapPacket['frames']=[],sources:Img[]=[],bodies:Img[]=[],masks:{weapon:Img;body:Img;unknown:Img;edit:Img}[]=[];
  for(const[i,index]of [1,3,4,6].entries()){
    const source=makeImg(144,144);
    for(let y=40;y<110;y++)for(let x=50;x<75;x++)source.data.set([0,100+i*20,0,255],(y*144+x)*4);
    for(let y=50;y<95;y++)for(let x=80;x<83;x++)source.data.set([100,60,20,255],(y*144+x)*4);
    source.data.set([40,30,20,255],(75*144+78)*4);
    const body=structuredClone(source);for(let y=50;y<95;y++)for(let x=80;x<83;x++)body.data.fill(0,(y*144+x)*4,(y*144+x+1)*4);
    // The old foreground weapon corridor may overlap new bare anatomy, particularly frame6.
    if(index===6)body.data.set([0,160,0,255],(60*144+80)*4);
    const weapon=black(),known=black(),unknown=black(),edit=black();
    for(let p=0;p<144*144;p++)if(source.data[p*4+3]){const x=p%144,y=(p/144)|0;if(x>=80&&x<83){set(weapon,x,y);set(edit,x,y);}else if(x===78)set(unknown,x,y);else set(known,x,y);}
    set(edit,85,60);
    const src=await encodePngBytes(source),frozen=await encodePngBytes(body);
    frames.push({index,png:bytesToBase64(src),sha256:await sha256(src),rgbaSha256:await sha256(new Uint8Array(source.data)),weaponMask:await base64(weapon),bodyMask:await base64(known),unknownMask:await base64(unknown),editMask:await base64(edit),grip:{x:79.5,y:60.5},frozenBase:{png:bytesToBase64(frozen),sha256:await sha256(frozen),rgbaSha256:await sha256(new Uint8Array(body.data))}});
    put(input,source,i);put(bare,body,i);put(mask,edit,i);sources.push(source);bodies.push(body);masks.push({weapon,body:known,unknown,edit});
  }
  const inputBytes=await encodePngBytes(input),bareBytes=await encodePngBytes(bare),maskBytes=await encodePngBytes(mask);
  const packet:SwapPacket={version:1,kind:'weapon-aware-swap',cell:144,cols:2,indices:[1,3,4,6],frames,sourceDisarmJobId:'synthetic-disarm-receipt',sourceDisarmResultSha:await sha256(bareBytes),sourceDisarmCallId:'synthetic-disarm-call',sourceArmedPacketCanonicalHash:DISARM_PACKET_SHA256,gridSha256:await sha256(inputBytes),maskSha256:await sha256(maskBytes),canonicalHash:SWAP_PACKET_SHA256,request:{description:'One synthetic hatchet swap.',seed:733,no_background:true,inpainting_image:{image:{type:'base64',base64:bytesToBase64(inputBytes)},size:{width:288,height:288}},mask_image:{image:{type:'base64',base64:bytesToBase64(maskBytes)},size:{width:288,height:288}}}};
  const prior:Prior={probe:{callId:packet.sourceDisarmCallId,jobId:packet.sourceDisarmJobId,packet:{canonicalHash:DISARM_PACKET_SHA256,gridSha256:packet.gridSha256,frames:frames.map(f=>({index:f.index,weaponMask:f.weaponMask,bodyMask:f.bodyMask,unknownMask:f.unknownMask,grip:{...f.grip}}))}},job:{id:packet.sourceDisarmJobId,state:'done',inputs:[packet.gridSha256]},images:[{sha:packet.sourceDisarmResultSha,png:bytesToBase64(bareBytes)}]};controls.prior=prior;
  controls.dispatch.mockResolvedValue({version:1,packet,callId:'synthetic-swap-call',jobId:'synthetic-swap-receipt'});
  const review=()=>{controls.approved=stableStringify({...packet,canonicalHash:undefined});controls.approvedHash=SWAP_PACKET_SHA256;};review();
  const reviewSource=()=>{controls.sourceApproved=stableStringify({...prior.probe.packet,canonicalHash:undefined});controls.sourceApprovedHash=DISARM_PACKET_SHA256;};reviewSource();
  async function commitMask(i=0){Object.assign(packet.frames[i],{weaponMask:await base64(masks[i].weapon),bodyMask:await base64(masks[i].body),unknownMask:await base64(masks[i].unknown),editMask:await base64(masks[i].edit)});put(mask,masks[i].edit,i);const bytes=await encodePngBytes(mask);packet.maskSha256=await sha256(bytes);packet.request.mask_image.image.base64=bytesToBase64(bytes);review();}
  return{packet,prior,input,bare,mask,sources,bodies,masks,review,reviewSource,commitMask};
}
const noDispatch=()=>expect(controls.dispatch).not.toHaveBeenCalled();

async function completionFixture(){
  const f=await fixture(),{packet,prior,sources,bodies,masks}=f,indices=[0,2,5,7],grid=makeImg(432,288),mask=makeImg(432,288),originalGrid=makeImg(432,288),designGrid=makeImg(288,288),originals:Img[]=[],recipeFrames:NonNullable<SwapPacket['bodyRecipe']>['frames']=[];
  packet.indices=indices;packet.cols=3;packet.request.seed=736;packet.canonicalHash=COMPLETION_SWAP_PACKET_SHA256;packet.sourceArmedPacketCanonicalHash=COMPLETION_DISARM_PACKET_SHA256;
  prior.probe.packet.canonicalHash=COMPLETION_DISARM_PACKET_SHA256;
  bodies[0].data.set([0,160,0,255],(85*144+88)*4);put(f.bare,bodies[0],0);
  const bareBytes=await encodePngBytes(f.bare);packet.sourceDisarmResultSha=await sha256(bareBytes);prior.images=[{sha:packet.sourceDisarmResultSha,png:bytesToBase64(bareBytes)}];
  const exportContract={bodyCell:[80,80],bodyPivot:[40,75],heldCell:[112,112],heldPivot:[56,91]};
  for(const[i,index]of indices.entries()){
    const frame=packet.frames[i],actual=bodies[i],original=makeImg(144,144),hand=black(),star=makeImg(144,144);frame.index=index;prior.probe.packet.frames[i].index=index;
    if(i===0){frame.grip={x:37.5,y:45.5};prior.probe.packet.frames[i].grip={...frame.grip};}
    for(let p=0;p<144*144;p++){
      const q=p*4,x=p%144,y=Math.floor(p/144),inside=Math.hypot(x+.5-frame.grip.x,y+.5-frame.grip.y)<=8;
      if(masks[i].body.data[q])original.data.set(sources[i].data.subarray(q,q+4),q);
      if(inside)set(hand,x,y);
      const from=masks[i].body.data[q]||inside?actual:original;star.data.set(from.data.subarray(q,q+4),q);
      set(masks[i].edit,x,y,Number(!!masks[i].weapon.data[q]||(!sources[i].data[q+3]&&x>=16&&x<128&&y>=16&&y<128&&Math.hypot(x+.5-frame.grip.x,y+.5-frame.grip.y)<=40))*255);
    }
    const starBytes=await encodePngBytes(star),actualBytes=await encodePngBytes(actual),originalBytes=await encodePngBytes(original),handBytes=await encodePngBytes(hand),delta:NonNullable<SwapPacket['bodyRecipe']>['frames'][number]['delta']=[];
    for(let p=0;p<144*144;p++){const q=p*4;if(actual.data.subarray(q,q+4).some((v,k)=>v!==star.data[q+k]))delta.push({x:p%144,y:Math.floor(p/144),from:Array.from(actual.data.subarray(q,q+4)),to:Array.from(star.data.subarray(q,q+4))});}
    frame.frozenBase={png:bytesToBase64(starBytes),sha256:await sha256(starBytes),rgbaSha256:await sha256(new Uint8Array(star.data))};frame.actualDisarmBase={png:bytesToBase64(actualBytes),sha256:await sha256(actualBytes),rgbaSha256:await sha256(new Uint8Array(actual.data))};frame.authoredBodyRecipeFrameSha256=frame.frozenBase.sha256;frame.editMask=await base64(masks[i].edit);
    recipeFrames.push({index,...frame.frozenBase,handEnvelope:bytesToBase64(handBytes),handEnvelopeSha256:await sha256(handBytes),actualPng:frame.actualDisarmBase.png,actualSha256:frame.actualDisarmBase.sha256,originalPng:bytesToBase64(originalBytes),originalSha256:await sha256(originalBytes),sourceArmedPng:frame.png,sourceArmedSha256:frame.sha256,sourceProtectedKeyMask:frame.bodyMask,sourceWeaponMask:frame.weaponMask,sourceUnknownMask:frame.unknownMask,oldGrip:{...frame.grip},newGrip:{...frame.grip},handRadius:8,actualProviderJobId:prior.job.id,sourcePacketCanonicalHash:COMPLETION_DISARM_PACKET_SHA256,delta});
    put(grid,sources[i],i,3);put(mask,masks[i].edit,i,3);put(originalGrid,original,i,3);put(designGrid,sources[i],i);originals.push(original);
  }
  const originalBytes=await encodePngBytes(originalGrid),originalHash=await sha256(originalBytes),armedJob={id:'synthetic-armed-receipt',state:'done',requestHash:'e'.repeat(64),params:{inpainting_image:{image:{$blob:originalHash}}},inputs:[originalHash],jobs:[{results:[{sha:'f'.repeat(64)}]}]};
  Object.assign(prior.probe.packet,{sourceJobId:armedJob.id,sourceRequestHash:armedJob.requestHash,sourceGridSha256:'f'.repeat(64),request:{...packet.request,seed:735,inpainting_image:{image:{type:'base64',base64:await base64(f.input)},size:{width:288,height:288}}} satisfies InpaintV3});
  packet.sourceFirstWeaponJobId=armedJob.id;controls.jobs.set(armedJob.id,armedJob);controls.blobs.set(originalHash,new Blob([originalBytes as Uint8Array<ArrayBuffer>]));
  const designBytes=await encodePngBytes(designGrid),designHash=await sha256(designBytes),designJob={id:'synthetic-old-hatchet',state:'done',requestHash:'c'.repeat(64),jobs:[{results:[{sha:designHash}]}]};controls.jobs.set(designJob.id,designJob);controls.blobs.set(designHash,new Blob([designBytes as Uint8Array<ArrayBuffer>]));
  packet.designSource={jobId:designJob.id,requestHash:designJob.requestHash,resultSha256:designHash,sourcePacketCanonicalHash:SWAP_PACKET_SHA256};packet.references=[];
  for(const[i,sourceCell]of [0,3].entries()){const bytes=await encodePngBytes(sources[sourceCell]);packet.references.push({index:[1,6][i],sourceCell,gridCell:i+4,png:bytesToBase64(bytes),sha256:await sha256(bytes),rgbaSha256:await sha256(new Uint8Array(sources[sourceCell].data)),width:144,height:144});put(grid,sources[sourceCell],i+4,3);put(mask,black(),i+4,3);}
  const gridBytes=await encodePngBytes(grid),maskBytes=await encodePngBytes(mask);packet.gridSha256=await sha256(gridBytes);packet.maskSha256=await sha256(maskBytes);packet.request.inpainting_image={image:{type:'base64',base64:bytesToBase64(gridBytes)},size:{width:432,height:288}};packet.request.mask_image={image:{type:'base64',base64:bytesToBase64(maskBytes)},size:{width:432,height:288}};
  const fullRows=Array.from({length:8},(_,index)=>recipeFrames.find(f=>f.index===index)??{...structuredClone(recipeFrames[0]),index});
  packet.profile='east-completion-body-star-v2-0-2-5-7';packet.bodySource='authored-reference-family-v2';packet.sourceBodyRecipeCanonicalHash=BODY_STAR_RECIPE_SHA256;packet.heldWindow={x:16,y:16,w:112,h:112};packet.authoredExportContract=exportContract;
  packet.bodyRecipe={version:2,kind:'body-family-hand-conservation',cell:144,indices:[0,1,2,3,4,5,6,7],canonicalHash:BODY_STAR_RECIPE_SHA256,completionSourceCanonicalHash:COMPLETION_DISARM_PACKET_SHA256,providerBareResultHashes:[packet.sourceDisarmResultSha],frames:fullRows,authoredExportContract:exportContract};
  const review=()=>{controls.approved=stableStringify({...packet,canonicalHash:undefined});controls.approvedHash=COMPLETION_SWAP_PACKET_SHA256;};
  const reviewRecipe=()=>{controls.recipeApproved=stableStringify({...packet.bodyRecipe,canonicalHash:undefined});controls.recipeApprovedHash=BODY_STAR_RECIPE_SHA256;};
  const reviewSource=()=>{controls.sourceApproved=stableStringify({...prior.probe.packet,canonicalHash:undefined});controls.sourceApprovedHash=COMPLETION_DISARM_PACKET_SHA256;};reviewRecipe();reviewSource();review();
  async function commitMask(i=0){packet.frames[i].editMask=await base64(masks[i].edit);put(mask,masks[i].edit,i,3);const bytes=await encodePngBytes(mask);packet.maskSha256=await sha256(bytes);packet.request.mask_image.image.base64=bytesToBase64(bytes);review();}
  async function commitGrid(){const bytes=await encodePngBytes(grid);packet.gridSha256=await sha256(bytes);packet.request.inpainting_image.image.base64=bytesToBase64(bytes);review();}
  return{...f,packet,prior,grid,mask,originals,originalGrid,originalHash,armedJob,designJob,designHash,recipeFrames,review,reviewSource,reviewRecipe,commitMask,commitGrid};
}

test('the exact reviewed disarm source dispatches one bounded swap, including foreground W over frame6 bare anatomy',async()=>{
  const{packet,bodies,masks}=await fixture(),p=60*144+80,before=structuredClone(packet);
  expect(bodies[3].data[p*4+3]).toBe(255);expect(masks[3].weapon.data[p*4]).toBe(255);expect(masks[3].edit.data[p*4]).toBe(255);
  await submitSwap(packet);expect(controls.dispatch).toHaveBeenCalledExactlyOnceWith({key:SWAP_KEY,label:'Frozen weapon-aware body, one-handed hatchet swap',units:25},packet,packet.request);expect(packet).toEqual(before);
});

test.each(['canonical','prompt','metadata'] as const)('tampered %s rejects before reading or refreshing the old disarm receipt',async mode=>{
  const{packet}=await fixture();if(mode==='canonical')packet.canonicalHash='a'.repeat(64);if(mode==='prompt')packet.request.description+=' Unreviewed.';if(mode==='metadata')packet.sessionMetadata='synthetic-unapproved';
  await expect(submitSwap(packet)).rejects.toThrow('differs from the reviewed source-bound diagnostic');expect(controls.exportDisarm).not.toHaveBeenCalled();noDispatch();
});

test.each(['missing','pending','failed','job-id','call-id','source-pin','result-id'] as const)('a %s source receipt cannot authorize this limited swap',async mode=>{
  const{packet,prior}=await fixture();if(mode==='missing')controls.prior={probe:null,job:undefined,images:[]};if(mode==='pending')prior.job.state='running';if(mode==='failed')prior.job.state='failed';if(mode==='job-id')prior.job.id='different-job';if(mode==='call-id')prior.probe.callId='different-call';if(mode==='source-pin')prior.probe.packet.canonicalHash='a'.repeat(64);if(mode==='result-id')prior.images[0].sha='b'.repeat(64);
  await expect(submitSwap(packet)).rejects.toThrow('exact reviewed completed disarm receipt');noDispatch();
});

test('a changed disarm PNG cannot be replaced with another body under the old receipt hash',async()=>{
  const{packet,prior}=await fixture();prior.images[0].png=await base64(makeImg(288,288));await expect(submitSwap(packet)).rejects.toThrow('frozen disarm result or original armed input hash changed');noDispatch();
});

test('the armed input must be attributable to an actual image input on the old paid disarm job',async()=>{
  const{packet,prior}=await fixture();prior.job.inputs=[];await expect(submitSwap(packet)).rejects.toThrow('original armed input hash changed');noDispatch();
});

test('the old unsigned packet is reverified rather than trusting its stored canonicalHash field',async()=>{
  const{packet,prior}=await fixture();prior.probe.packet.frames[0].grip.x++;
  await expect(submitSwap(packet)).rejects.toThrow('reviewed armed source packet or original input identity changed');noDispatch();
});

test('another input hash on the old receipt cannot be mistaken for the original armed C-prime grid',async()=>{
  const{packet,prior,review}=await fixture();packet.gridSha256='d'.repeat(64);prior.job.inputs.push(packet.gridSha256);review();
  await expect(submitSwap(packet)).rejects.toThrow('original input identity changed');noDispatch();
});

test('the local transparency radius cannot be moved by substituting a different grip observation',async()=>{
  const{packet,review}=await fixture();packet.frames[0].grip.x++;review();
  await expect(submitSwap(packet)).rejects.toThrow('grip differs from its reviewed source observation');noDispatch();
});

test('an original known-body pixel cannot be reclassified as foreground weapon even with a consistent new mask and packet hash',async()=>{
  const{packet,masks,commitMask}=await fixture();set(masks[0].body,50,40,0);set(masks[0].weapon,50,40);set(masks[0].edit,50,40);await commitMask();
  await expect(submitSwap(packet)).rejects.toThrow('changes source labels');noDispatch();
});

test('binary source alpha remains required even when the prepared source and every image hash agree',async()=>{
  const{packet,prior,input,sources,review,reviewSource}=await fixture();sources[0].data[(40*144+50)*4+3]=64;put(input,sources[0],0);
  const bytes=await encodePngBytes(input),frameBytes=await encodePngBytes(sources[0]);packet.gridSha256=await sha256(bytes);packet.request.inpainting_image.image.base64=bytesToBase64(bytes);
  Object.assign(packet.frames[0],{png:bytesToBase64(frameBytes),sha256:await sha256(frameBytes),rgbaSha256:await sha256(new Uint8Array(sources[0].data))});
  prior.probe.packet.gridSha256=packet.gridSha256;prior.job.inputs=[packet.gridSha256];reviewSource();review();
  await expect(submitSwap(packet)).rejects.toThrow('reviewed weapon/transparent envelope');noDispatch();
});

test.each(['armed-png','armed-rgba','frozen-png','frozen-rgba','patched-body'] as const)('changed %s frame evidence cannot alter the frozen body to fit a new weapon',async mode=>{
  const{packet,bodies,review}=await fixture();
  if(mode==='armed-png')packet.frames[0].sha256='a'.repeat(64);if(mode==='armed-rgba')packet.frames[0].rgbaSha256='a'.repeat(64);if(mode==='frozen-png')packet.frames[0].frozenBase.sha256='a'.repeat(64);if(mode==='frozen-rgba')packet.frames[0].frozenBase.rgbaSha256='a'.repeat(64);
  if(mode==='patched-body'){bodies[0].data[(40*144+50)*4]^=1;const bytes=await encodePngBytes(bodies[0]);packet.frames[0].frozenBase={png:bytesToBase64(bytes),sha256:await sha256(bytes),rgbaSha256:await sha256(new Uint8Array(bodies[0].data))};}review();
  await expect(submitSwap(packet)).rejects.toThrow('frame differs from its frozen source pixels');noDispatch();
});

test.each(['known-body','unknown','transparent-outside','weapon-protected','overlap','nonbinary','cross-cell'] as const)('the %s edit cannot escape its reviewed original-weapon and local transparency envelope',async mode=>{
  const{packet,masks,mask,review,commitMask}=await fixture(),m=masks[0];
  if(mode==='known-body')set(m.edit,50,40);if(mode==='unknown')set(m.edit,78,75);if(mode==='transparent-outside')set(m.edit,0,0);if(mode==='weapon-protected')set(m.edit,80,50,0);if(mode==='overlap')set(m.unknown,80,50);if(mode==='nonbinary')m.edit.data.set([1,1,1,255],0);
  await commitMask();
  if(mode==='cross-cell'){set(mask,145,1);const bytes=await encodePngBytes(mask);packet.maskSha256=await sha256(bytes);packet.request.mask_image.image.base64=bytesToBase64(bytes);review();}
  await expect(submitSwap(packet)).rejects.toThrow(mode==='nonbinary'?'opaque binary':'reviewed weapon/transparent envelope');noDispatch();
});

test('invalid frame selection and bounded canvas contract fail before source access',async()=>{
  const{packet}=await fixture();packet.indices=[0,1,2,3];expect(()=>parseSwapPacket(packet)).toThrow('fixed four-frame');packet.indices=[1,3,4,6];packet.request.mask_image.size.width=432;
  await expect(submitSwap(packet)).rejects.toThrow('bounded 288 by 288');expect(controls.exportDisarm).not.toHaveBeenCalled();noDispatch();
});

test('736 binds a separately authored B-star recipe and two raw hatchet references without replacing the actual735 ancestor',async()=>{
  const{packet,prior,recipeFrames}=await completionFixture(),before=structuredClone(packet),actualBefore=structuredClone(prior.images);
  expect(recipeFrames[0].delta.length).toBeGreaterThan(0);expect(packet.frames[0].frozenBase.rgbaSha256).not.toBe(packet.frames[0].actualDisarmBase!.rgbaSha256);
  await submitSwap(packet);expect(controls.dispatch).toHaveBeenCalledExactlyOnceWith({key:COMPLETION_SWAP_KEY,label:'Authored completion body, one-handed hatchet swap',units:25},packet,packet.request);
  expect(controls.exportCompletionDisarm).toHaveBeenCalledOnce();expect(controls.exportDisarm).not.toHaveBeenCalled();expect(packet).toEqual(before);expect(prior.images).toEqual(actualBefore);
});

test.each(['seed','indices','pin','recipe-pin','recipe-content','body-source'] as const)('736 rejects a mismatched %s before reading ancestor receipts',async mode=>{
  const{packet,review}=await completionFixture();if(mode==='seed')packet.request.seed=733;if(mode==='indices')packet.indices=[1,3,4,6];if(mode==='pin')packet.canonicalHash=SWAP_PACKET_SHA256;
  if(mode==='recipe-pin'){packet.sourceBodyRecipeCanonicalHash='a'.repeat(64);review();}if(mode==='recipe-content'){packet.bodyRecipe!.frames[0].oldGrip.x++;review();}if(mode==='body-source'){packet.bodySource='actual-provider-result';review();}
  await expect(submitSwap(packet)).rejects.toThrow(mode==='seed'||mode==='indices'?'fixed four-frame':mode==='pin'?'differs from the reviewed source-bound':'authored body recipe');
  expect(controls.exportCompletionDisarm).not.toHaveBeenCalled();expect(controls.exportDisarm).not.toHaveBeenCalled();noDispatch();
});

test('736 cannot use the original732 disarm profile as its completed ancestor',async()=>{
  const{packet,prior}=await completionFixture();prior.probe.packet.canonicalHash=DISARM_PACKET_SHA256;
  await expect(submitSwap(packet)).rejects.toThrow('exact reviewed completed disarm receipt');noDispatch();
});

test('736 rejects a v1 recipe even if its synthetic review pins otherwise match',async()=>{
  const{packet,review,reviewRecipe}=await completionFixture();(packet.bodyRecipe as unknown as {version:number}).version=1;reviewRecipe();review();
  await expect(submitSwap(packet)).rejects.toThrow('authored body recipe');expect(controls.exportCompletionDisarm).not.toHaveBeenCalled();noDispatch();
});

test('the completion one-shot receipt and export preserve original733 bytes',async()=>{
  const{packet}=await completionFixture(),old=JSON.stringify({version:1,packet:{request:{seed:733}},callId:'old-swap',jobId:'old-swap-receipt'});controls.receipts.set(SWAP_KEY,old);
  controls.dispatch.mockImplementation(async(profile:{key:string},p:SwapPacket)=>{if(controls.receipts.has(profile.key))throw new Error('Existing one-shot receipt.');const row={version:1,packet:p,callId:'new-completion-swap',jobId:'new-completion-swap-receipt'};controls.receipts.set(profile.key,JSON.stringify(row));return row;});
  await submitSwap(packet);expect(readCompletionSwap()?.jobId).toBe('new-completion-swap-receipt');expect(readSwap()?.jobId).toBe('old-swap-receipt');expect(controls.receipts.get(SWAP_KEY)).toBe(old);
  await expect(submitSwap(packet)).rejects.toThrow('Existing one-shot receipt');await exportCompletionSwap();expect(controls.export).toHaveBeenCalledExactlyOnceWith(COMPLETION_SWAP_KEY);expect(controls.receipts.get(SWAP_KEY)).toBe(old);
});

test.each(['pending','request','result','original-input'] as const)('736 rejects changed %s ancestry on the actual734 source job',async mode=>{
  const{packet,armedJob}=await completionFixture();if(mode==='pending')armedJob.state='running';if(mode==='request')armedJob.requestHash='a'.repeat(64);if(mode==='result')armedJob.jobs[0].results[0].sha='a'.repeat(64);if(mode==='original-input')armedJob.inputs=[];
  await expect(submitSwap(packet)).rejects.toThrow(mode==='original-input'?'original input identity':'original armed source ancestry');noDispatch();
});

test('736 targets must remain pixel-identical to the actual735 C-prime inputs when their packing changes',async()=>{
  const{packet,grid,commitGrid}=await completionFixture();grid.data[(40*432+50)*4]^=1;await commitGrid();
  await expect(submitSwap(packet)).rejects.toThrow('target differs from its actual reviewed C-prime input');noDispatch();
});

test.each(['missing','pending','request','png','protected-mask','reference-pixels'] as const)('736 rejects an invalid %s hatchet design reference',async mode=>{
  const{packet,designJob,designHash,mask,grid,review,commitGrid}=await completionFixture();
  if(mode==='missing')packet.references=[];if(mode==='pending')designJob.state='running';if(mode==='request')designJob.requestHash='a'.repeat(64);
  if(mode==='png')controls.blobs.set(designHash,new Blob([await encodePngBytes(makeImg(288,288)) as Uint8Array<ArrayBuffer>]));
  if(mode==='protected-mask'){set(mask,164,164);const bytes=await encodePngBytes(mask);packet.maskSha256=await sha256(bytes);packet.request.mask_image.image.base64=bytesToBase64(bytes);}
  if(mode==='reference-pixels'){grid.data[(160*432+160)*4]^=1;await commitGrid();}review();
  await expect(submitSwap(packet)).rejects.toThrow(mode==='missing'?'two reviewed actual hatchet':mode==='pending'||mode==='request'?'completed hatchet design receipt':mode==='png'?'hatchet design PNG changed':mode==='protected-mask'?'reference cells must remain protected':'reference differs from its actual raw design pixels');noDispatch();
});

test.each(['hand-envelope','selector','missing-delta','wrong-delta'] as const)('736 reconstructs the reviewed recipe and rejects %s errors despite consistent newly approved fixture hashes',async mode=>{
  const{packet,recipeFrames,review,reviewRecipe}=await completionFixture(),r=recipeFrames[0];
  if(mode==='hand-envelope'){const h=black();const bytes=await encodePngBytes(h);r.handEnvelope=bytesToBase64(bytes);r.handEnvelopeSha256=await sha256(bytes);}
  if(mode==='selector'){const image=makeImg(144,144),bytes=await encodePngBytes(image);r.png=bytesToBase64(bytes);r.sha256=await sha256(bytes);r.rgbaSha256=await sha256(new Uint8Array(image.data));packet.frames[0].frozenBase={png:r.png,sha256:r.sha256,rgbaSha256:r.rgbaSha256};packet.frames[0].authoredBodyRecipeFrameSha256=r.sha256;}
  if(mode==='missing-delta')r.delta.pop();if(mode==='wrong-delta')r.delta[0].from[0]^=1;reviewRecipe();review();
  await expect(submitSwap(packet)).rejects.toThrow(mode==='hand-envelope'?'hand envelope or protected source classification':mode==='selector'?'does not follow the reviewed K/hand/original selector':'delta ledger differs from actual pixel changes');noDispatch();
});

test.each(['outside-window','removed-permission'] as const)('736 enforces the exact held-window permission for %s',async mode=>{
  const{packet,masks,commitMask}=await completionFixture();set(masks[0].edit,mode==='outside-window'?10:20,45,mode==='outside-window'?255:0);await commitMask();
  await expect(submitSwap(packet)).rejects.toThrow('held-window and weapon envelope');noDispatch();
});

test('736 rejects changed source K even if the actual ancestor PNG and its declared hashes agree',async()=>{
  const{packet,prior,bare,bodies,recipeFrames,review,reviewRecipe}=await completionFixture();bodies[0].data[(40*144+50)*4]^=1;put(bare,bodies[0],0);
  const bytes=await encodePngBytes(bare),actualBytes=await encodePngBytes(bodies[0]),sha=await sha256(bytes);packet.sourceDisarmResultSha=sha;prior.images=[{sha,png:bytesToBase64(bytes)}];packet.bodyRecipe!.providerBareResultHashes=[sha];
  packet.frames[0].actualDisarmBase={png:bytesToBase64(actualBytes),sha256:await sha256(actualBytes),rgbaSha256:await sha256(new Uint8Array(bodies[0].data))};recipeFrames[0].actualPng=packet.frames[0].actualDisarmBase.png;recipeFrames[0].actualSha256=packet.frames[0].actualDisarmBase.sha256;reviewRecipe();review();
  await expect(submitSwap(packet)).rejects.toThrow('hand envelope or protected source classification changed');noDispatch();
});

test('the736 recipe cannot substitute its embedded original-body PNG for the actual734 original input',async()=>{
  const{packet,recipeFrames,review,reviewRecipe}=await completionFixture(),bytes=await encodePngBytes(makeImg(144,144));recipeFrames[0].originalPng=bytesToBase64(bytes);recipeFrames[0].originalSha256=await sha256(bytes);reviewRecipe();review();
  await expect(submitSwap(packet)).rejects.toThrow('recipe differs from actual source pixels');noDispatch();
});
