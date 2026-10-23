// Offline body provenance evidence. No client/queue/bootstrap imports and no writes.
import { sha256, stableStringify } from '../../src/lib/image/hash.ts';
import type { Project, DirectionName } from '../../src/lib/store/manifest.ts';
import type { RecoveryJob } from '../audit-recovery/recovery.ts';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const same=(a:unknown,b:unknown)=>stableStringify(a)===stableStringify(b);
const allowed=new Set(['description','action','direction','view','first_frame','first_frame_keypoints','keypoints','seed','no_background','template_id']);
export async function bodySourceRecords(project:Project,anim:string,dir:DirectionName,jobs:RecoveryJob[]){
 const m=project.manifest,body=m.items.find(i=>i.id===m.rig.baseItem),source=m.rig.animations.find(a=>a.id===anim)?.sources?.[dir],rest=m.rig.rest?.[dir];
 if(!body||!source||source.route!=='skeleton-v3'||!rest||source.reference!==rest.image)throw Error('Body source/rest identity is unavailable.');
 const records:RecoveryJob[]=[];
 for(const index of source.provenance){const p=body.provenance[index];if(!p||p.endpoint!=='/animate-with-skeleton-v3')continue;
  if(!p.produced.includes(`${anim}/${dir}/0`))throw Error('Body source provenance does not cover the requested direction.');
  const matches=jobs.filter(j=>j.method==='POST'&&j.endpoint===p.endpoint&&j.requestHash===p.requestHash.replace(/^sha256:/,'')&&(!p.jobId||j.jobs.some(s=>s.id===p.jobId)));
  if(matches.length!==1)throw Error('Body source request/job is missing or ambiguous.');const r=matches[0],params=object(r.params),image=object(params.first_frame);
  if(r.state!=='done'||!r.jobs.length||r.jobs.some(s=>!s.done||s.status!=='completed'))throw Error('Body source is not known complete.');
  if(Object.keys(params).some(k=>!allowed.has(k))||image.type!=='base64'||image.format!=='png'||typeof image.$blob!=='string'||!/^[a-f0-9]{64}$/.test(image.$blob)||typeof image.base64==='string')throw Error('Unsupported body request shape.');
  if(!same(params,p.params)||params.direction!==dir||!same(params.keypoints,source.keypoints)||!same(params.first_frame_keypoints,rest.keypoints))throw Error('Body source request fields differ from stored pose provenance.');
  if(await sha256(stableStringify({method:r.method,endpoint:r.endpoint,params:r.params}))!==r.requestHash)throw Error('Body source request hash is invalid.');
  if(records.some(x=>x.id===r.id))throw Error('Duplicate body source provenance.');records.push(r);
 }
 if(!records.length)throw Error('No complete raw body source records.');return records;
}
export async function inspectBodyEvidence(input:{project:Project;jobs:RecoveryJob[];readBlob:(hash:string)=>Promise<Blob|undefined>;anim:string;dirs:DirectionName[]}){
 const {decodePng,makeImg}=await import('../../src/lib/image/png.ts'),{encodePngBytes}=await import('../../src/lib/image/pngraw.ts'),{normalize}=await import('../../src/lib/rig/normalize.ts'),{largestComponent}=await import('../../src/lib/rig/clips.ts'),{cellImg}=await import('../../src/lib/compose/compose.ts'),{contactSheet}=await import('../../src/lib/items/items.ts'),{zip}=await import('../../src/lib/store/zip.ts');
 const {project,jobs,readBlob,anim,dirs}=input,m=project.manifest,a=m.rig.animations.find(a=>a.id===anim),body=m.items.find(i=>i.id===m.rig.baseItem);if(!a||a.cells>15||!body||m.rig.cell.w!==64||m.rig.cell.h!==64)throw Error('This diagnostic requires a64px stored body move with at most15frames.');
 const files:{name:string;data:Uint8Array}[]=[],views:{title:string;png:Uint8Array}[]=[],rolls:unknown[]=[];
 async function bytes(hash:string){if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid PNG hash');const b=await readBlob(hash);if(!b)throw Error('Body source PNG missing');const data=new Uint8Array(await b.arrayBuffer());if(await sha256(data)!==hash)throw Error('Body source PNG hash mismatch');return data;}
 for(const dir of dirs){const records=await bodySourceRecords(project,anim,dir,jobs),rest=project.images.get(m.rig.rest![dir]!.image);if(!rest)throw Error('Stored body rest PNG missing');
  for(const [index,r]of records.entries()){const folder=`body/${dir}/roll-${index+1}`,params=object(r.params),first=await bytes(object(params.first_frame).$blob as string),firstImg=await decodePng(first);if(firstImg.w!==rest.w||firstImg.h!==rest.h||!same([...firstImg.data],[...rest.data]))throw Error('Raw body input pixels differ from actual stored rest');files.push({name:`${folder}/input-rest.png`,data:first});
   const outputs=r.jobs.flatMap(s=>s.results).map(r=>({r,index:Number(r.label.split('/').at(-1))})).sort((a,b)=>a.index-b.index);if(outputs.length!==a.cells||outputs.some((v,i)=>v.index!==i))throw Error('Body raw frame sequence incomplete');
   const rawImages=[],cleanImages=[],removedImages=[],frames=[];
   for(const [c,{r:result}]of outputs.entries()){const data=await bytes(result.sha),raw=await decodePng(data);if(raw.w!==64||raw.h!==64)throw Error('Raw skeleton body frame dimensions differ from input');const n=normalize(raw,64,64,128,64),clean=largestComponent(n.img),removed=makeImg(64,64),stored=cellImg(project,body.layers[0],anim,dir,c);if(!stored)throw Error('Stored body cell missing');let differences=0;
    for(let p=0;p<raw.data.length;p+=4){if(n.img.data[p+3]&&!clean.img.data[p+3])removed.data.set(n.img.data.slice(p,p+4),p);if(stored.data.slice(p,p+4).some((v,k)=>v!==clean.img.data[p+k]))differences++;}
    rawImages.push(raw);cleanImages.push(clean.img);removedImages.push(removed);frames.push({cell:c,rawPngHash:result.sha,stray:clean.stray,normalizedCutPixels:n.cutPx,semiAlpha:n.semiAlpha,pixelDifferencesVsStored:differences});files.push({name:`${folder}/raw-${c}.png`,data},{name:`${folder}/processed-${c}.png`,data:await encodePngBytes(clean.img)},{name:`${folder}/removed-${c}.png`,data:await encodePngBytes(removed)});
   }
   const sheet=await encodePngBytes(contactSheet([rawImages,cleanImages,removedImages],3));views.push({title:`${dir} body roll${index+1}: original / processed / removed pixels`,png:sheet});files.push({name:`${folder}/raw-processed-removed.png`,data:sheet});rolls.push({dir,roll:index+1,recordId:r.id,requestHash:r.requestHash,jobIds:r.jobs.map(s=>s.id),params:r.params,usage:{gens:r.gens,usd:r.usd},matchesStoredPixels:frames.every(f=>f.pixelDifferencesVsStored===0),frames});
  }
 }
 const report={kind:'offline-body-inspection/1',name:m.name,anim,dirs,warning:'Original provider PNGs versus the actual normalization/cleanup. No generation, measurement substitution, acceptance or mutation.',rolls};files.push({name:'body-inspection.json',data:new TextEncoder().encode(JSON.stringify(report,null,2))});return{report,views,zip:await zip(files)};
}
