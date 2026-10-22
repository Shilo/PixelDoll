// Read-only offline evidence: selected provenance -> exact stored request -> all comparable done rolls.
import { sha256,stableStringify } from '../../src/lib/image/hash.ts';
import type { Item,Manifest,Provenance,Project,DirectionName } from '../../src/lib/store/manifest.ts';
import type { RecoveryJob } from '../audit-recovery/recovery.ts';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const same=(a:unknown,b:unknown)=>stableStringify(a)===stableStringify(b);
const withoutSeed=(v:unknown)=>({...object(v),seed:undefined});
const provenanceParams=(v:unknown)=>JSON.parse(JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&'$blob'in x?{sha256:x.$blob}:x));
const allowed=new Set(['description','action','direction','view','first_frame','first_frame_keypoints','keypoints','seed','no_background','template_id']);
function safeParams(v:unknown){const p=object(v);if(!Object.keys(p).length||Object.keys(p).some(k=>!allowed.has(k)))throw Error('Unsupported request shape; nothing exported.');const image=object(p.first_frame);if(image.type!=='base64'||image.format!=='png'||typeof image.$blob!=='string'||!/^[a-f0-9]{64}$/.test(image.$blob)||typeof image.base64==='string')throw Error('Expected a stored PNG reference, not embedded data.');return p;}
export async function comparablePoseRolls(m:Manifest,item:Item,anim:string,dir:DirectionName,jobs:RecoveryJob[]){
 const index=item.qa?.cells[`${anim}/${dir}/0`]?.provenance;
 const selected:Provenance|undefined=index===undefined?undefined:item.provenance[index];
 if(!selected||selected.endpoint!=='/animate-with-skeleton-v3'||!selected.produced.includes(`${anim}/${dir}/0`))throw Error('No selected pose provenance covers that clip/direction.');
 const candidates=jobs.filter(j=>j.method==='POST'&&j.endpoint===selected.endpoint&&j.requestHash===selected.requestHash.replace(/^sha256:/,'')&&(!selected.jobId||j.jobs.some(s=>s.id===selected.jobId)));
 if(candidates.length!==1)throw Error('Selected request/job identity is missing or ambiguous.');
 const chosen=candidates[0],params=safeParams(chosen.params);
 if(params.direction!==dir||!same(provenanceParams(chosen.params),selected.params))throw Error('Selected request fields do not match the exported provenance.');
 const result=[] as {record:RecoveryJob;selected:boolean}[];
 for(const record of jobs){if(record.method!=='POST'||record.endpoint!==selected.endpoint||record.state!=='done'||record.jobs.some(s=>!s.done||s.status!=='completed')||!same(withoutSeed(record.params),withoutSeed(params)))continue;safeParams(record.params);if(await sha256(stableStringify({method:record.method,endpoint:record.endpoint,params:record.params}))!==record.requestHash)throw Error('Stored request hash is invalid.');result.push({record,selected:record.id===chosen.id});}
 if(result.filter(r=>r.selected).length!==1)throw Error('Selected pose output is not complete.');
 return result.sort((a,b)=>a.record.createdAt-b.record.createdAt);
}
export interface PoseInspectionInput { project:Project; jobs:RecoveryJob[]; readBlob:(hash:string)=>Promise<Blob|undefined>; item:Item; anim:string; dirs:DirectionName[] }
export async function inspectPoseEvidence(input:PoseInspectionInput){
 const {decodePng,binaryAlpha,makeImg}=await import('../../src/lib/image/png.ts');
 const {encodePngBytes}=await import('../../src/lib/image/pngraw.ts');
 const {cellImg,composeCell,bakedFrame,layerFrame,over}=await import('../../src/lib/compose/compose.ts');
 const {contactSheet,f0Last,unrotate,padImg,extractCell,postProcess,slotOf,bandOf,itemQa,itemRoute,clipKeypoints,GATES}=await import('../../src/lib/items/items.ts');
 const {chromaLayer}=await import('../../src/lib/image/chroma.ts');
 const {paddedPoses}=await import('../../src/lib/rig/clips.ts');
 const {zip}=await import('../../src/lib/store/zip.ts');
 const {project,item,anim,dirs,jobs,readBlob}=input,m=project.manifest,rig=m.rig,animation=rig.animations.find(a=>a.id===anim);if(!animation||animation.cells>15)throw Error('Choose a stored move of at most15frames.');
 if(!item.key||item.slot!=='main_hand')throw Error('This diagnostic currently requires the primary held item.');
 const pad=((item.layers[0].cell?.w??rig.cell.w)-rig.cell.w)/2,frame=bakedFrame(m),slot=slotOf(item.slot),files=[] as {name:string;data:Uint8Array}[],views=[] as {title:string;png:Uint8Array}[],report=[] as unknown[];
 async function bytes(hash:string){if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid PNG hash');const b=await readBlob(hash);if(!b)throw Error('A source PNG is missing');const data=new Uint8Array(await b.arrayBuffer());if(await sha256(data)!==hash)throw Error('Stored source PNG does not match hash');return data;}
 for(const dir of dirs){const rolls=await comparablePoseRolls(m,item,anim,dir,jobs),rest=rig.rest?.[dir],poses=clipKeypoints(rig,anim,dir);if(!rest||!poses)throw Error('Original rest/requested clip points are missing');const dressed=project.images.get(item.dressed?.[dir]??'');if(!dressed)throw Error('Original dressed keyframe is missing');const key=chromaLayer(dressed,item.key,padImg(project.images.get(rest.image)!,pad)).layer;
  const current=Array.from({length:animation.cells},(_,c)=>composeCell(project,{body:rig.baseItem,[item.slot]:item.id},anim,dir,c,frame));
  const currentPng=await encodePngBytes(contactSheet([current],2));views.push({title:`${dir}: current stored composite`,png:currentPng});files.push({name:`${dir}/stored-composite.png`,data:currentPng});
  for(const [rollIndex,{record,selected}]of rolls.entries()){
   const params=safeParams(record.params),first=object(params.first_frame).$blob as string,inputPng=await bytes(first),inputImage=binaryAlpha(await decodePng(inputPng));
   if(!same([...inputImage.data],[...dressed.data])||inputImage.w!==dressed.w||inputImage.h!==dressed.h)throw Error('Pose input pixels differ from the stored dressed keyframe');
   const expected=object(itemRoute.pose({keyframePngB64:'',rest:rest.keypoints,poses,item:item.prompt,slot:item.slot,key:item.key,anim,dir,seed:Number(params.seed),cell:rig.cell,pad,view:rig.view}).body);expected.first_frame=params.first_frame;if(!same(expected,params))throw Error('Stored pose params differ from this clip request');
   const raw=record.jobs.flatMap(s=>s.results).map(r=>({r,index:Number(r.label.split('/').at(-1))})).sort((a,b)=>a.index-b.index);if(raw.length!==Math.max(3,animation.cells)||raw.some((r,i)=>r.index!==i))throw Error('Raw output frame sequence is incomplete');
   const ordered=unrotate(raw,f0Last(item.slot,rest.keypoints,paddedPoses(poses),rig.cell)).slice(0,animation.cells),rawImages=[] as ReturnType<typeof makeImg>[],cells=[] as ReturnType<typeof extractCell>[];
   const folder=`${dir}/roll-${rollIndex+1}${selected?'-SELECTED':''}`;files.push({name:`${folder}/input-dressed.png`,data:inputPng});
   for(const [c,{r}]of ordered.entries()){const rawPng=await bytes(r.sha),out=binaryAlpha(await decodePng(rawPng));if(out.w!==rig.cell.w+pad*2||out.h!==rig.cell.h+pad*2)throw Error('Raw result has wrong dimensions');rawImages.push(out);files.push({name:`${folder}/raw-${c}.png`,data:rawPng});const baseLayer=m.items.find(i=>i.id===rig.baseItem)!.layers[0],base=cellImg(project,baseLayer,anim,dir,c);if(!base)throw Error('Body cell missing');cells.push(extractCell({key:`${anim}/${dir}/${c}`,call:0,base:padImg(base,pad),out,route:item.key,band:bandOf(item.slot,undefined,rig.cell.h+pad*2),posed:true,clip:slot.band}));}
   const rawSheet=await encodePngBytes(contactSheet([rawImages],2));views.push({title:`${dir} roll${rollIndex+1}${selected?' SELECTED':''}: original provider PNGs`,png:rawSheet});files.push({name:`${folder}/raw-contactsheet.png`,data:rawSheet});
   const extracted=await encodePngBytes(contactSheet([cells.map(c=>c.layer)],2));files.push({name:`${folder}/extracted-before-postprocess.png`,data:extracted});
   const processing=postProcess(rig,slot,cells,{[dir]:key},pad),qa=itemQa(rig,slot,item.key,cells,rollIndex,GATES.keyOutsidePosed,pad),post=await encodePngBytes(contactSheet([cells.map(c=>c.layer)],2));views.push({title:`${dir} roll${rollIndex+1}: derived transparent layers`,png:post});files.push({name:`${folder}/derived-after-postprocess.png`,data:post});
   const pixelDifferences=cells.map((c,i)=>{const saved=makeImg(frame.w,frame.h);for(const layer of item.layers){const im=cellImg(project,layer,anim,dir,i),f=layerFrame(rig,layer);if(im)over(saved,im,frame.x-f.x,frame.y-f.y);}let changed=0;for(let p=0;p<saved.data.length;p+=4)if((saved.data[p+3]||c.layer.data[p+3])&&saved.data.slice(p,p+4).some((v,k)=>v!==c.layer.data[p+k]))changed++;return changed;});
   report.push({dir,roll:rollIndex+1,selected,recordId:record.id,jobIds:record.jobs.map(s=>s.id),requestHash:record.requestHash,params:record.params,createdAt:record.createdAt,usage:{gens:record.gens,usd:record.usd},rawFramePngHashes:ordered.map(r=>r.r.sha),processing,qa:qa.qa,failCalls:[...qa.failCalls],warnings:qa.warnings,pixelDifferencesVsStoredItem:pixelDifferences});
  }
 }
 const metadata={kind:'offline-pose-inspection/1',name:m.name,item:item.id,anim,dirs,warning:'Read-only actual provider outputs and rerolls; no generation, replacement or acceptance. Quality failures remain failures.',rolls:report};files.push({name:'inspection.json',data:new TextEncoder().encode(JSON.stringify(metadata,null,2))});return{report:metadata,views,zip:await zip(files)};
}
