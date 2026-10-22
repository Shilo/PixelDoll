// Offline evidence builder. No client, queue, application bootstrap, credentials, fetch or writes.
import { sha256, stableStringify } from '../../src/lib/image/hash.ts';
import { decodePng, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { normalize } from '../../src/lib/rig/normalize.ts';
import { buildRig, anchorTracks } from '../../src/lib/rig/freeze.ts';
import { largestComponent, clipQa, rawClip } from '../../src/lib/rig/clips.ts';
import { LABELS, authoredPoses, fromApi, toApi, hasAll } from '../../src/lib/rig/poses.ts';
import { cellHash, cellKey, cellKeys, type Keypoint, type Sha256 } from '../../src/lib/rig/rig.ts';
import type { Skeleton } from '../../src/lib/rig/skeleton.ts';
import type { Project, Provenance, CellKey } from '../../src/lib/store/manifest.ts';
import { projectEntries, readCharacterZip, type ImportedCharacter } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import { routes } from '../../src/lib/pixellab/routes.ts';
import { basePrompt, looksOf } from '../../src/studio/model.ts';

export interface RecoverySpec { description: string; name: string; seed: number; size: number; dirs?: 4 | 8; directionPolicy?: string; projectId?: string }
export interface RecoveryJob { id: string; method: string; endpoint: string; params: unknown; requestHash: string; state: string; createdAt: number; submittedAt?: number; gens: number; usd: number; response?: unknown; jobs: { id: string; done: boolean; status: string; results: { label: string; sha: string }[] }[] }
type Obj = Record<string, unknown>;
const DIRS = ['south', 'east', 'north', 'west'] as const;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const equal = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);
const pngRef = (hash: string) => ({ type: 'base64', format: 'png', $blob: hash });
const fail = (why: string): never => { throw new Error(why); };
const complete = (j: RecoveryJob) => j.state === 'done' && j.jobs.every(s => s.done && s.status === 'completed');
function points(value: unknown): Keypoint[] {
  if (!hasAll(value as Keypoint[])) return fail('A stored measurement is incomplete or invalid. Recovery stopped.');
  return LABELS.map(label => { const p = (value as Keypoint[]).find(k => k.label === label)!; return { label, x: +p.x.toFixed(4), y: +p.y.toFixed(4) }; });
}
export async function recoverIdle(spec: RecoverySpec, jobs: RecoveryJob[], readBlob: (hash: string) => Promise<Blob | undefined>, name = `${spec.name} recovered idle`) {
  if (spec.dirs !== 4 || spec.directionPolicy !== 'independent' || !Number.isSafeInteger(spec.seed) || ![48, 56].includes(spec.size)) fail('This helper requires a saved independent four-direction creation at 48 or 56 px.');
  if (!name.trim() || name.trim().length > 60) fail('Choose a recovered character name of 1–60 characters.');
  const bytes = new Map<string, Uint8Array>(), images: Project['images'] = new Map();
  async function blob(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) return fail('Invalid stored PNG hash.');
    if (!bytes.has(hash)) { const b = await readBlob(hash); if (!b) fail(`Stored PNG ${hash.slice(0, 12)} is missing.`); const data = new Uint8Array(await b!.arrayBuffer()); if (await sha256(data) !== hash) fail('Stored PNG bytes do not match their hash.'); bytes.set(hash, data); }
    return bytes.get(hash)!;
  }
  async function verified(j: RecoveryJob) { if (await sha256(stableStringify({ method: j.method, endpoint: j.endpoint, params: j.params })) !== j.requestHash) fail(`Request integrity failed for ${j.id}.`); return j; }
  async function find(endpoint: string, method: string, params: unknown, stage = endpoint) {
    const j = jobs.filter(j => complete(j) && j.endpoint === endpoint && j.method === method && equal(j.params, params)).sort((a,b)=>b.createdAt-a.createdAt)[0];
    if (!j) return fail(`No complete stored ${stage} source matches this creation (${endpoint}).`);
    return verified(j);
  }
  const looks = looksOf(spec.description), view = 'low top-down' as const;
  const base = await find('/create-character-v3', 'POST', routes.createCharacterV3({ description: basePrompt(spec.description), image_size: { width: spec.size, height: spec.size }, view, template_id: 'mannequin', seed: spec.seed, no_background: true }).body, 'drawing');
  const baseResults = base.jobs.flatMap(s=>s.results), rest = {} as Record<(typeof DIRS)[number], Img>, restPng: Record<string, string> = {};
  let pad: [number,number] = [0,0];
  for (const dir of DIRS) {
    const matches = baseResults.filter(r=>r.label===dir); if(matches.length!==1) fail(`Expected one original ${dir} rotation.`);
    const n = normalize(await decodePng(await blob(matches[0].sha)),64,64);
    if(n.cutPx)fail(`The original ${dir} rotation is cropped.`); rest[dir]=n.img; pad=n.offset;
    restPng[dir] = await sha256(await encodePngBytes(n.img));
  }
  const imported = await find('/create-character-v3','POST',{ description:looks,reference_image:pngRef(restPng.south),direction_images:Object.fromEntries(DIRS.filter(d=>d!=='south').map(d=>[d,pngRef(restPng[d])])),n_directions:4,view,template_id:'mannequin',no_background:true,seed:spec.seed },'rest import');
  const characterId = obj(imported.response).character_id; if(typeof characterId!=='string'||!characterId)fail('The matching rest import has no managed character ID.');
  const chars = jobs.filter(j=>complete(j)&&j.method==='GET'&&j.endpoint===`/characters/${encodeURIComponent(characterId as string)}`).sort((a,b)=>b.createdAt-a.createdAt);
  const character = chars[0]; if(!character)fail('The matching managed rest skeleton is missing.'); await verified(character);
  const refs=obj(obj(obj(character.response).skeletons)['2d_references']);
  const measurements = new Map<string,{job:RecoveryJob;kps:Keypoint[]}>();
  async function measured(hash:string) {
    if (!measurements.has(hash)) { const job=await find('/estimate-skeleton','POST',{image:pngRef(hash)},'frame measurement'); await blob(hash); measurements.set(hash,{job,kps:points(obj(job.response).keypoints)}); }
    return measurements.get(hash)!;
  }
  const restKps={} as Record<(typeof DIRS)[number],Keypoint[]>;
  for(const dir of DIRS){const supplied=obj(refs[dir]).keypoints;if(supplied==null){restKps[dir]=(await measured(restPng[dir])).kps;continue;}const ref=obj(supplied),k=LABELS.map(label=>({label,x:obj(ref[label]).x,y:obj(ref[label]).y}));restKps[dir]=points(k);}
  const selected=[] as {dir:(typeof DIRS)[number];job:RecoveryJob;frames:Img[];requested:Keypoint[][];measured:Keypoint[][];measurementJobs:RecoveryJob[];qa:ReturnType<typeof clipQa>}[];
  const matches=[] as {dir:string;cell:number;rawJob:string;estimateJob:string;pngSha:string}[];
  for(const dir of DIRS){
    const requested=authoredPoses('idle',fromApi(restKps[dir],{w:64,h:64}),dir).map(p=>toApi(p,{w:64,h:64}));
    const candidates=[] as typeof selected;
    for(const seed of [spec.seed+101,spec.seed+101+7919]){
      const expected=obj(rawClip({first:'',rest:restKps[dir],keypoints:requested,description:looks,action:'breathing idle',dir,seed,view}).body); expected.first_frame=pngRef(restPng[dir]);
      const job=jobs.filter(j=>complete(j)&&j.method==='POST'&&j.endpoint==='/animate-with-skeleton-v3'&&equal(j.params,expected)).sort((a,b)=>b.createdAt-a.createdAt)[0];
      if(!job)continue;await verified(job);
      const outputs=job.jobs.flatMap(s=>s.results), ordered=outputs.map(r=>({r,index:Number(r.label.split('/').at(-1))})).sort((a,b)=>a.index-b.index);
      if(ordered.length!==requested.length||ordered.some((x,i)=>x.index!==i||!/^\d+$/.test(x.r.label.split('/').at(-1)!)))fail(`Idle ${dir} has missing, duplicate or invalid frame labels.`);
      const frames:Img[]=[], actual:Keypoint[][]=[], measurementJobs:RecoveryJob[]=[];let stray=0;const localMatches:typeof matches=[];
      for(const {r,index} of ordered){const clean=largestComponent(normalize(await decodePng(await blob(r.sha)),64,64,128,64).img);frames.push(clean.img);stray+=clean.stray;const hash=await sha256(await encodePngBytes(clean.img));const m=await measured(hash);actual.push(m.kps);measurementJobs.push(m.job);localMatches.push({dir,cell:index,rawJob:job.id,estimateJob:m.job.id,pngSha:hash});}
      const qa=clipQa({anim:'idle',rest:rest[dir],frames,requested,measured:actual,stray});candidates.push({dir,job,frames,requested,measured:actual,measurementJobs,qa});
      // Each chosen frame's measurement is hash-matched independently; duplicates legitimately reuse one known result.
      matches.push(...localMatches);
    }
    if(!candidates.length)fail(`No complete original idle ${dir} render is available.`);
    candidates.sort((a,b)=>a.qa.fails.length-b.qa.fails.length||Number(obj(a.job.params).seed)-Number(obj(b.job.params).seed));selected.push(candidates[0]);
  }
  const built=await buildRig([{id:'idle',dirs:Object.fromEntries(selected.map(c=>[c.dir,c.frames]))}],{size:64,mode:'all'});
  if(built.errors.length||built.rig.directions.length!==4||built.rig.directions.some(d=>d.mirrorOf))fail(`Recovered rig failed validation: ${built.errors.join('; ')}`);
  const rig=built.rig;rig.view=view;rig.template='mannequin';rig.pad={x:pad[0],y:pad[1]};rig.rest={};
  const provenance:Provenance[]=[],indices=new Map<string,number>();
  function at(job:RecoveryJob,produced:CellKey[]=[]){let i=indices.get(job.id);if(i===undefined){i=provenance.length;indices.set(job.id,i);provenance.push({endpoint:job.endpoint,params:job.params as Obj,seed:Number(obj(job.params).seed??0),requestHash:`sha256:${job.requestHash}`,jobId:job.jobs[0]?.id,usage:{generations:job.gens,usd:job.usd},createdAt:new Date(job.submittedAt??job.createdAt).toISOString(),produced:[]});}provenance[i].produced=[...new Set([...provenance[i].produced,...produced])];return i;}
  at(base);at(imported);at(character);
  const byHash:Record<string,Skeleton>={},skeletons:Record<string,Skeleton>={};
  for(const dir of DIRS){const hash=await cellHash(rest[dir]);images.set(hash,rest[dir]);rig.rest[dir]={image:hash,keypoints:restKps[dir]};const m=measurements.get(restPng[dir]);if(m)at(m.job);}
  for(const c of selected){const keys=c.frames.map((_,i)=>cellKey('idle',c.dir,i) as CellKey);rig.animations[0].sources??={};rig.animations[0].sources[c.dir]={route:'skeleton-v3',reference:rig.rest[c.dir]!.image,keypoints:c.requested,motion:'authored:idle',measured:c.measured,provenance:[at(c.job,keys),...c.measurementJobs.map((j,i)=>at(j,[keys[i]]))]};for(let i=0;i<c.frames.length;i++){const key=keys[i],cell=built.cells[key];byHash[cell.hash]=skeletons[key]=fromApi(c.measured[i],rig.cell);}built.warnings.push(...c.qa.fails.map(f=>`idle/${c.dir}: ${f}`));}
  const tracks=anchorTracks(built,byHash);rig.anchors=tracks.anchors;
  const cells:Record<string,Partial<Record<(typeof DIRS)[number],Sha256[]>>>={idle:{}};for(const key of cellKeys(rig)){const [,dir,index]=key.split('/') as [string,(typeof DIRS)[number],string];const c=built.cells[key];(cells.idle[dir]??=[])[+index]=c.hash;images.set(c.hash,c.img);}
  const project:Project={images,manifest:{format:'pixeldoll/1',app:'PixelDoll offline audit recovery',name:name.trim(),rig,materials:[],slots:[{id:'body',z:10,class:'base',required:true}],items:[{id:'base',name:'Base body',slot:'body',status:'accepted',mirror:'generate',materials:[],prompt:spec.description,baseHash:rig.baseHash,layers:[{id:'main',role:'fg',z:10,cells}],provenance}],presets:[{id:'default',name:'Base',items:{body:'base'},variants:{}}]}};
  const report={kind:'offline-idle-recovery/1',warning:'The original idle+walk creation failed. This artifact recovers only complete idle artwork and actual hash-matched measurements; no API was called, no job was retried, and the original failed record is unchanged.',sourceProjectId:spec.projectId,seed:spec.seed,selected: selected.map(c=>({dir:c.dir,rawJob:c.job.id,qa:c.qa})),measurements:matches.filter(m=>selected.some(c=>c.job.id===m.rawJob)),selectedUsage:{generations:provenance.reduce((n,p)=>n+(p.usage?.generations??0),0),usd:provenance.reduce((n,p)=>n+(p.usage?.usd??0),0)},billing:'Selected source records only; the original failed flow may have additional charges.',warnings:built.warnings};
  const extra:ImportedCharacter['extra']={character:{id:characterId as string,looks},skeletons,rigQa:{warnings:[report.warning,...built.warnings],clips:Object.fromEntries(selected.map(c=>[`idle/${c.dir}`,c.qa])),tracks:tracks.stats.map(({points:_,...s})=>s),recovery:report}};
  const entries=await projectEntries(project,extra);entries.push({name:'recovery-report.json',data:new TextEncoder().encode(JSON.stringify(report,null,2))});const data=await zip(entries);await readCharacterZip(data);
  return {project,extra,report,zip:data};
}

/** Read-only evidence for uncertain estimator requests. Does not call the estimator or alter a ledger record. */
export async function lostEstimateInputs(spec: RecoverySpec, jobs: RecoveryJob[], readBlob: (hash: string) => Promise<Blob | undefined>) {
  const { opaqueBox } = await import('../../src/lib/rig/normalize.ts');
  const rawInputs=new Map<string,{job:string;dir:string;cell:number}[]>();
  for(const job of jobs){const p=obj(job.params);if(!complete(job)||job.endpoint!=='/animate-with-skeleton-v3'||p.action!=='walking'||p.description!==looksOf(spec.description)||![spec.seed+101,spec.seed+101+7919].includes(Number(p.seed)))continue;
    for(const result of job.jobs.flatMap(s=>s.results)){const b=await readBlob(result.sha);if(!b)continue;const data=new Uint8Array(await b.arrayBuffer());if(await sha256(data)!==result.sha)continue;const clean=largestComponent(normalize(await decodePng(data),64,64,128,64).img).img;const h=await sha256(await encodePngBytes(clean));const list=rawInputs.get(h)??[];list.push({job:job.id,dir:String(p.direction),cell:Number(result.label.split('/').at(-1))});rawInputs.set(h,list);}}
  const result=[] as {job:string;state:string;sha:string;w:number;h:number;opaquePixels:number;bounds:ReturnType<typeof opaqueBox>;rawMatches:{job:string;dir:string;cell:number}[];png:Uint8Array}[];
  for(const job of jobs){if(job.method!=='POST'||job.endpoint!=='/estimate-skeleton'||job.state!=='lost')continue;const h=obj(obj(job.params).image).$blob;if(typeof h!=='string'||!rawInputs.has(h))continue;const b=await readBlob(h);if(!b)fail('A lost estimator input blob is missing.');const data=new Uint8Array(await b!.arrayBuffer());if(await sha256(data)!==h)fail('A lost estimator input PNG hash is invalid.');const im=await decodePng(data);let opaque=0;for(let i=3;i<im.data.length;i+=4)if(im.data[i])opaque++;result.push({job:job.id,state:job.state,sha:h,w:im.w,h:im.h,opaquePixels:opaque,bounds:opaqueBox(im),rawMatches:rawInputs.get(h)!,png:data});}
  return result;
}



