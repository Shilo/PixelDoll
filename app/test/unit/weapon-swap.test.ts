import {afterEach,expect,test,vi} from 'vitest';
import {makeImg,bytesToBase64,type Img} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../src/lib/image/hash.ts';

const controls=vi.hoisted(()=>({approved:'',approvedHash:'',sourceApproved:'',sourceApprovedHash:'',prior:undefined as unknown,exportDisarm:vi.fn(),dispatch:vi.fn()}));
vi.mock('../../src/lib/image/hash.ts',async original=>{const real=await original<typeof import('../../src/lib/image/hash.ts')>();return{...real,sha256:(data:Uint8Array|ArrayBuffer|string)=>typeof data==='string'&&data===controls.approved?Promise.resolve(controls.approvedHash):typeof data==='string'&&data===controls.sourceApproved?Promise.resolve(controls.sourceApprovedHash):real.sha256(data)};});
vi.mock('../../src/ui/motion-lab/weapon-aware.ts',async original=>{const real=await original<typeof import('../../src/ui/motion-lab/weapon-aware.ts')>();return{...real,exportDisarm:()=>{controls.exportDisarm();return Promise.resolve(controls.prior);}};});
vi.mock('../../src/ui/motion-lab/fixed-inpaint.ts',()=>({dispatchFixedInpaint:(...args:unknown[])=>controls.dispatch(...args),readFixedInpaint:()=>null,exportFixedInpaint:vi.fn()}));
import {DISARM_PACKET_SHA256} from '../../src/ui/motion-lab/weapon-aware.ts';
import {SWAP_KEY,SWAP_PACKET_SHA256,parseSwapPacket,submitSwap,type SwapPacket} from '../../src/ui/motion-lab/weapon-swap.ts';

type Prior={probe:{callId:string;jobId:string;packet:{canonicalHash:string;gridSha256:string;frames:{index:number;weaponMask:string;bodyMask:string;unknownMask:string;grip:{x:number;y:number}}[]}};job:{id:string;state:string;inputs:string[]};images:{sha:string;png:string}[]};
afterEach(()=>{controls.approved='';controls.approvedHash='';controls.sourceApproved='';controls.sourceApprovedHash='';controls.prior=undefined;controls.exportDisarm.mockClear();controls.dispatch.mockReset();});
function put(grid:Img,cell:Img,index:number){for(let y=0;y<144;y++)grid.data.set(cell.data.subarray(y*144*4,(y+1)*144*4),((Math.floor(index/2)*144+y)*288+(index%2)*144)*4);}
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
