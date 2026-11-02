import {afterEach,expect,test,vi} from 'vitest';
import {makeImg,bytesToBase64,type Img} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {sha256,stableStringify} from '../../src/lib/image/hash.ts';

const controls=vi.hoisted(()=>({approved:'',approvedHash:'',job:undefined as unknown,blobs:new Map<string,Blob>(),get:vi.fn(),dispatch:vi.fn()}));
// The unsigned synthetic packet alone substitutes for the reviewed pin. All actual image hashes stay real.
vi.mock('../../src/lib/image/hash.ts',async original=>{const real=await original<typeof import('../../src/lib/image/hash.ts')>();return{...real,sha256:(data:Uint8Array|ArrayBuffer|string)=>typeof data==='string'&&data===controls.approved?Promise.resolve(controls.approvedHash):real.sha256(data)};});
vi.mock('../../src/lib/store/db.ts',()=>({get:(...args:unknown[])=>{controls.get(...args);return Promise.resolve(controls.job);},getBlob:async(sha:string)=>controls.blobs.get(sha)}));
vi.mock('../../src/ui/motion-lab/fixed-inpaint.ts',()=>({dispatchFixedInpaint:(...args:unknown[])=>controls.dispatch(...args),readFixedInpaint:()=>null,exportFixedInpaint:vi.fn()}));
import {DISARM_KEY,DISARM_PACKET_SHA256,parseDisarmPacket,submitDisarm,type DisarmPacket} from '../../src/ui/motion-lab/weapon-aware.ts';

afterEach(()=>{controls.approved='';controls.approvedHash='';controls.job=undefined;controls.blobs.clear();controls.get.mockClear();controls.dispatch.mockReset();});
function put(grid:Img,cell:Img,index:number,cols:number){for(let y=0;y<cell.h;y++)grid.data.set(cell.data.subarray(y*cell.w*4,(y+1)*cell.w*4),((Math.floor(index/cols)*cell.h+y)*grid.w+(index%cols)*cell.w)*4);}
function black(){const image=makeImg(144,144);for(let p=0;p<144*144;p++)image.data[p*4+3]=255;return image;}
function white(image:Img,x:number,y:number){image.data.set([255,255,255,255],(y*image.w+x)*4);}
const base64=async(image:Img)=>bytesToBase64(await encodePngBytes(image));
async function fixture(){
  const source=makeImg(432,288),grid=makeImg(288,288),globalMask=makeImg(288,288),frames:DisarmPacket['frames']=[],rawFrames:Img[]=[],derived:Img[]=[],masks:{weapon:Img;body:Img;unknown:Img;edit:Img}[]=[];
  for(const [i,index]of [1,3,4,6].entries()){
    const raw=makeImg(144,144),cleanup:DisarmPacket['frames'][number]['cleanup']=[];
    for(let y=40;y<110;y++)for(let x=50;x<75;x++)raw.data.set([0,100+i*20,0,255],(y*144+x)*4);
    for(let y=50;y<95;y++)for(let x=80;x<83;x++)raw.data.set([100,60,20,255],(y*144+x)*4);
    raw.data.set([40,30,20,255],(75*144+78)*4);
    if(index===1||index===4){const[x,y]=index===1?[63,55]:[68,101];white(raw,x,y);cleanup.push({x,y,from:[255,255,255,255],to:[0,0,0,0],reason:'Synthetic documented white speck.'});}
    const image=structuredClone(raw);for(const c of cleanup)image.data.set(c.to,(c.y*144+c.x)*4);
    const weapon=black(),body=black(),unknown=black(),edit=black();
    for(let p=0;p<144*144;p++)if(image.data[p*4+3]){
      const x=p%144,y=(p/144)|0;if(x>=80&&x<83){white(weapon,x,y);white(edit,x,y);}else if(x===78){white(unknown,x,y);white(edit,x,y);}else white(body,x,y);
    }
    const bytes=await encodePngBytes(image);
    frames.push({index,png:bytesToBase64(bytes),sha256:await sha256(bytes),rgbaSha256:await sha256(new Uint8Array(image.data)),rawRgbaSha256:await sha256(new Uint8Array(raw.data)),weaponMask:await base64(weapon),bodyMask:await base64(body),unknownMask:await base64(unknown),editMask:await base64(edit),cleanup,grip:{x:79.5,y:60.5}});
    put(source,raw,i,3);put(grid,image,i,2);put(globalMask,edit,i,2);rawFrames.push(raw);derived.push(image);masks.push({weapon,body,unknown,edit});
  }
  const sourceBytes=await encodePngBytes(source),gridBytes=await encodePngBytes(grid),maskBytes=await encodePngBytes(globalMask),sourceHash=await sha256(sourceBytes);
  const packet:DisarmPacket={version:1,kind:'weapon-aware-disarm',cell:144,cols:2,indices:[1,3,4,6],frames,sourceJobId:'synthetic-source-receipt',sourceRequestHash:'a'.repeat(64),sourceGridSha256:sourceHash,gridSha256:await sha256(gridBytes),maskSha256:await sha256(maskBytes),canonicalHash:DISARM_PACKET_SHA256,request:{description:'Synthetic fixed source disarm.',seed:732,no_background:true,inpainting_image:{image:{type:'base64',base64:bytesToBase64(gridBytes)},size:{width:288,height:288}},mask_image:{image:{type:'base64',base64:bytesToBase64(maskBytes)},size:{width:288,height:288}}}};
  controls.job={id:packet.sourceJobId,state:'done',requestHash:packet.sourceRequestHash,jobs:[{results:[{sha:sourceHash,label:'0'}]}]};controls.blobs.set(sourceHash,new Blob([sourceBytes as Uint8Array<ArrayBuffer>]));
  controls.dispatch.mockResolvedValue({version:1,packet,callId:'synthetic-new-disarm-call',jobId:'synthetic-disarm-receipt'});
  const review=()=>{controls.approved=stableStringify({...packet,canonicalHash:undefined});controls.approvedHash=DISARM_PACKET_SHA256;};review();
  return{packet,source,grid,globalMask,rawFrames,derived,masks,review};
}
function noDispatch(){expect(controls.dispatch).not.toHaveBeenCalled();}

test('verified source, exactly documented cleanup and protected disjoint masks dispatch one fixed 25-unit equipment probe',async()=>{
  const{packet}=await fixture();const before=structuredClone(packet);await submitDisarm(packet);
  expect(controls.get).toHaveBeenCalledWith('jobs',packet.sourceJobId);expect(controls.dispatch).toHaveBeenCalledExactlyOnceWith({key:DISARM_KEY,label:'Weapon-aware source disarm, east frames 1/3/4/6',units:25},packet,packet.request);expect(packet).toEqual(before);
});

test.each(['hash-field','prompt','extra-field'] as const)('tampered %s is rejected before source database reads or dispatch',async mode=>{
  const{packet}=await fixture();if(mode==='hash-field')packet.canonicalHash='b'.repeat(64);if(mode==='prompt')packet.request.description+=' Unreviewed change.';if(mode==='extra-field')packet.unreviewedSessionData='synthetic-unapproved';
  await expect(submitDisarm(packet)).rejects.toThrow('differs from the reviewed packet');expect(controls.get).not.toHaveBeenCalled();noDispatch();
});

test.each(['missing','queued','running','failed','lost','wrong-request','wrong-result'] as const)('a %s source receipt cannot authorize disarm',async mode=>{
  const{packet}=await fixture(),job=controls.job as {state:string;requestHash:string;jobs:{results:{sha:string}[]}[]};
  if(mode==='missing')controls.job=undefined;else if(mode==='wrong-request')job.requestHash='b'.repeat(64);else if(mode==='wrong-result')job.jobs[0].results[0].sha='c'.repeat(64);else job.state=mode;
  await expect(submitDisarm(packet)).rejects.toThrow('exact completed armed source receipt');noDispatch();
});

test('missing source bytes and changed provider PNG bytes are rejected',async()=>{
  const{packet}=await fixture();controls.blobs.clear();await expect(submitDisarm(packet)).rejects.toThrow('source grid is missing');
  controls.blobs.set(packet.sourceGridSha256,new Blob([await encodePngBytes(makeImg(432,288)) as Uint8Array<ArrayBuffer>]));await expect(submitDisarm(packet)).rejects.toThrow('armed source PNG hash changed');noDispatch();
});

test.each(['raw-frame','derived-grid','frame-png'] as const)('changed %s evidence cannot pass preparation verification',async mode=>{
  const{packet,grid,review}=await fixture();
  if(mode==='raw-frame')packet.frames[0].rawRgbaSha256='d'.repeat(64);
  if(mode==='derived-grid'){grid.data[(50*288+60)*4]^=1;const bytes=await encodePngBytes(grid);packet.request.inpainting_image.image.base64=bytesToBase64(bytes);packet.gridSha256=await sha256(bytes);}
  if(mode==='frame-png')packet.frames[0].png=await base64(makeImg(144,144));review();
  await expect(submitDisarm(packet)).rejects.toThrow(mode==='raw-frame'?'retained provider pixels':'derived target changed');noDispatch();
});

test.each(['dimensions','pixels'] as const)('an internally hashed frame PNG with wrong %s cannot contradict the derived grid',async mode=>{
  const{packet,review}=await fixture(),bytes=await encodePngBytes(makeImg(mode==='dimensions'?64:144,mode==='dimensions'?64:144));
  packet.frames[0].png=bytesToBase64(bytes);packet.frames[0].sha256=await sha256(bytes);review();
  await expect(submitDisarm(packet)).rejects.toThrow('derived target changed');noDispatch();
});

test.each([64,192])('source alpha %i is rejected even when every PNG, RGBA hash and derived grid agrees',async alpha=>{
  const{packet,source,grid,rawFrames,derived,review}=await fixture(),offset=(40*144+50)*4;
  rawFrames[0].data[offset+3]=alpha;derived[0].data[offset+3]=alpha;put(source,rawFrames[0],0,3);put(grid,derived[0],0,2);
  const sourceBytes=await encodePngBytes(source),gridBytes=await encodePngBytes(grid),frameBytes=await encodePngBytes(derived[0]);
  packet.sourceGridSha256=await sha256(sourceBytes);packet.gridSha256=await sha256(gridBytes);packet.request.inpainting_image.image.base64=bytesToBase64(gridBytes);
  Object.assign(packet.frames[0],{png:bytesToBase64(frameBytes),sha256:await sha256(frameBytes),rgbaSha256:await sha256(new Uint8Array(derived[0].data)),rawRgbaSha256:await sha256(new Uint8Array(rawFrames[0].data))});
  (controls.job as {jobs:{results:{sha:string}[]}[]}).jobs[0].results[0].sha=packet.sourceGridSha256;controls.blobs.set(packet.sourceGridSha256,new Blob([sourceBytes as Uint8Array<ArrayBuffer>]));review();
  await expect(submitDisarm(packet)).rejects.toThrow('binary source alpha');noDispatch();
});

test.each(['coordinate','from','to','unsupported-frame','raw-pixel'] as const)('an unreviewed cleanup %s cannot alter the frozen source',async mode=>{
  const{packet,review}=await fixture();const correction=packet.frames[0].cleanup[0];
  if(mode==='coordinate')correction.x++;if(mode==='from')correction.from=[0,0,0,255];if(mode==='to')correction.to=[0,100,0,255];
  if(mode==='unsupported-frame')packet.frames[1].cleanup=[structuredClone(correction)];
  if(mode==='raw-pixel'){correction.x=63;correction.y=55;packet.frames[0].cleanup.push(structuredClone(correction));}review();
  await expect(submitDisarm(packet)).rejects.toThrow(mode==='raw-pixel'?'no longer matches':'unreviewed source cleanup');noDispatch();
});

test.each(['nonbinary','translucent','overlap','transparent-edit','body-edit','key-exposed','global-mismatch'] as const)('the %s mask cannot expose protected source pixels',async mode=>{
  const{packet,masks,globalMask,review}=await fixture(),m=masks[0];
  if(mode==='nonbinary')m.weapon.data.set([1,1,1,255],0);
  if(mode==='translucent')m.weapon.data[3]=0;
  if(mode==='overlap')white(m.unknown,80,50);
  if(mode==='transparent-edit'){white(m.unknown,0,0);white(m.edit,0,0);}
  if(mode==='body-edit')white(m.edit,50,40);
  if(mode==='key-exposed'){m.body.data.set([0,0,0,255],(40*144+50)*4);white(m.unknown,50,40);white(m.edit,50,40);}
  if(mode==='global-mismatch')white(globalMask,0,0);else put(globalMask,m.edit,0,2);
  Object.assign(packet.frames[0],{weaponMask:await base64(m.weapon),bodyMask:await base64(m.body),unknownMask:await base64(m.unknown),editMask:await base64(m.edit)});
  const bytes=await encodePngBytes(globalMask);packet.request.mask_image.image.base64=bytesToBase64(bytes);packet.maskSha256=await sha256(bytes);review();
  await expect(submitDisarm(packet)).rejects.toThrow(mode==='nonbinary'||mode==='translucent'?'opaque binary':mode==='key-exposed'?'known key-colored body':'protect known body and transparency');noDispatch();
});

test('the fixed frame selection and declared grid dimensions reject invalid packets before source reads',async()=>{
  const{packet}=await fixture();packet.indices=[0,1,2,3];expect(()=>parseDisarmPacket(packet)).toThrow('fixed four-frame');packet.indices=[1,3,4,6];packet.request.mask_image.size.width=432;
  await expect(submitDisarm(packet)).rejects.toThrow('bounded 288 by 288');expect(controls.get).not.toHaveBeenCalled();noDispatch();
});
