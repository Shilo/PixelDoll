import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeImg, type Img } from '../../../../app/src/lib/image/png.ts';
import { gridEstimate, gridFits, repairGridLayout } from '../../../../app/src/lib/items/items.ts';
import { runPipe } from '../../../research/2026-11-07-paperdoll-cycle/scripts/extraction/bench-replay.ts';

const folder = dirname(fileURLToPath(import.meta.url)), root = resolve(folder, '../../../..');
const pinned = '8ea08c28', baseline = 'bb830dfb';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const workspaceHead=git('rev-parse','--short=8','HEAD');
for(const path of ['app/src/lib/image/chroma.ts','app/src/lib/items/items.ts','app/src/lib/pixellab/plans.ts'])assert.equal((await readFile(resolve(root,path),'utf8')).replace(/\r\n/g,'\n').trimEnd(),git('show',`${pinned}:${path}`).replace(/\r\n/g,'\n').trimEnd(),`Working source differs from pinned ${path}`);
const output: any = { version: 1, baseline, pinned, workspaceHead, node: process.version, commands: [], sources: {}, grid: {}, chroma: {}, receiptAudit: {} };
const variants: Record<string, any> = {};
for (const rev of [baseline, '77b863e9', 'd8030391', pinned]) {
  const source = git('show', `${rev}:app/src/lib/image/chroma.ts`);
  output.sources[`chroma:${rev}`] = hash(source);
  const patched = source.replace("from './png.ts'", `from '${pathToFileURL(resolve(root, 'app/src/lib/image/png.ts')).href}'`);
  const js = stripTypeScriptTypes(patched, { mode: 'strip', sourceUrl: `${rev}/chroma.ts` });
  variants[rev] = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const current = variants[pinned], keys = current.KEYS;
function fixture(size: number, skin: number[], geometry: string, ink: number[]) {
  const B = makeImg(size, size), truth = new Uint8Array(size * size), c = size >> 1;
  for (let y = 3; y < size - 3; y++) for (let x = 3; x < size - 3; x++) B.data.set([...skin, 255], (y * size + x) * 4);
  const points: number[][] = geometry === 'ring8' ? [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]].map(([x,y]) => [c+x!,c+y!])
    : geometry === 'short3' ? Array.from({length:3},(_,i)=>[c-1+i,c])
    : geometry === 'zigzag10' ? Array.from({length:10},(_,i)=>[c-5+i,c+(i%2)])
    : geometry === 'diagonal10' ? Array.from({length:10},(_,i)=>[c-5+i,c-5+i])
    : Array.from({length:10},(_,i)=>[c-5+i,c]);
  points.forEach(([x,y]) => { truth[y! * size + x!] = 1; });
  return { B, truth, points, ink };
}
const skins = { light:[224,172,130], deep:[70,44,34], darker:[46,30,24], nearBlackShadow:[14,10,9] };
const inks = { black:[40,34,36], silver:[178,180,192], bronze:[40,34,10], teal:[15,40,40] };
const rows: any[] = [];
for (const size of [32,64,128]) for (const [tone,skin] of Object.entries(skins)) for (const key of keys) for (const shape of ['horizontal10','diagonal10','zigzag10','ring8','short3']) for (const [color,ink] of Object.entries(inks)) {
  const f = fixture(size,skin,shape,ink), C = current.toChroma(f.B,key);
  f.points.forEach(([x,y]) => C.data.set([...ink,255],(y!*size+x!)*4));
  const byVersion: any = {};
  for (const [rev,mod] of Object.entries(variants)) {
    const beforeB=hash(f.B.data),beforeC=hash(C.data), extracted=mod.chromaLayer(C,key,f.B);
    let kept=0,extra=0; for(let p=0;p<f.truth.length;p++) if(extracted.mask[p]) { if(f.truth[p]) kept++; else extra++; }
    assert.equal(hash(f.B.data),beforeB);assert.equal(hash(C.data),beforeC);
    byVersion[rev]={kept,extra};
  }
  rows.push({size,tone,key,shape,color,labeledItemPixels:f.points.length,byVersion});
}
output.chroma.authoredCases=rows.length; output.chroma.rows=rows;
output.chroma.focus=rows.filter(r=>r.size===64&&r.color==='black'&&['light','deep'].includes(r.tone));
// Opposite semantic labels on one raster bound what a color/shape heuristic can prove.
const negative=[];
for(const color of ['black','silver'] as const)for(const tone of ['light','deep'] as const){
 const f=fixture(64,skins[tone],'horizontal10',inks[color]),C=current.toChroma(f.B,'green');f.points.forEach(([x,y])=>C.data.set([...f.ink,255],(y!*64+x!)*4));
 negative.push({tone,color,observationSha256:hash(C.data),truth:'all painted pixels are a hypothetical mannequin redraw, not item',byVersion:Object.fromEntries(Object.entries(variants).map(([rev,mod])=>[rev,{falseGearPixels:mod.chromaLayer(C,'green',f.B).mask.reduce((s:number,v:number)=>s+v,0)}]))});
}
output.chroma.oppositeLabelControls=negative;
// Stored provider frames: same registered raw/base pairs, old versus current chroma extraction only.
const cases=JSON.parse(await readFile(resolve(root,'app/test/fixtures/bench/cases.json'),'utf8')).filter((c:any)=>c.key!=='none'&&!c.role);
const real=[];let cells=0;
for(const c of cases){
 const run=await runPipe(c), deltas=[];
 for(const x of [...run.kf,...run.cells]){
  cells++;const old=variants[baseline].chromaLayer(x.out,c.key,x.base),now=current.chromaLayer(x.out,c.key,x.base);let added=0,dropped=0,recolored=0;
  for(let p=0;p<old.mask.length;p++){if(!old.mask[p]&&now.mask[p])added++;if(old.mask[p]&&!now.mask[p])dropped++;if(old.mask[p]&&now.mask[p]&&[0,1,2].some(j=>old.layer.data[p*4+j]!==now.layer.data[p*4+j]))recolored++;}
  if(added||dropped||recolored)deltas.push({key:x.key,added,dropped,recolored});
 }
 real.push({id:c.id,key:c.key,cells:run.kf.length+run.cells.length,deltas});
}
output.chroma.realBench={cases:cases.length,cells,rows:real};
// Independent layout enumeration uses the declared ordering, not production's iteration strategy.
let examined=0,mismatch=0,areaLowerViolations=0;const failures=[];
for(const w of [32,40,48,64,80,86,96,112,120,128,144,160,192,224,256])for(const h of [32,48,64,80,96,112,128,144,160,192,256])for(let n=1;n<=40;n++)for(const refs of [0,1,2,4]){
 const choices=[];for(let cols=1;cols*w<=512;cols++){const H=Math.ceil((n+refs)/cols)*h;if(H<32||H>512)continue;const W=cols*w,mean=(W+H)/2;choices.push({w:W,h:H,gens:mean<=256?10:mean<=336?15:25,cols,tier:Math.max(W,H)<=256?1:2});}
 if(!choices.length)continue; examined++;const fixed=choices.find(c=>c.cols===4),eligible=fixed?choices.filter(c=>c.gens<fixed.gens||(c.gens===fixed.gens&&c.tier<fixed.tier)):choices;
 const ranked=eligible.sort((a,b)=>a.gens-b.gens||a.tier-b.tier||a.w*a.h-b.w*b.h||Math.abs(a.w-a.h)-Math.abs(b.w-b.h)||b.cols-a.cols);
 const best=ranked[0]??fixed!,actual=repairGridLayout({w,h},n,refs),expected={w:best.w,h:best.h,gens:best.gens,cols:best.cols};
 if(JSON.stringify(actual)!==JSON.stringify(expected)){mismatch++;if(failures.length<10)failures.push({cell:{w,h},n,refs,expected,actual});}
 for(const c of choices){const oldArea=c.w*c.h<=256*256?10:c.w*c.h<=341*341?15:25;if(c.gens<oldArea)areaLowerViolations++;assert(gridFits({w,h},n,refs,c.cols));assert.equal(gridEstimate({w,h},n,refs,c.cols).gens,c.gens);}
}
output.grid.validLayouts={examined,mismatch,areaLowerViolations,examples:failures};
// Bound malformed inputs in a subprocess so a regression cannot hang the reviewer itself.
const timeoutRows=[];
for(const rev of [baseline,pinned])for(const cell of [{w:64,h:64},{w:0,h:64}]){
 const source=git('show',`${rev}:app/src/lib/items/items.ts`),sourceDir=resolve(root,'app/src/lib/items');
 const rewritten=source.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_m,q,spec)=>`from ${q}${pathToFileURL(resolve(sourceDir,spec)).href}${q}`);
 const js=stripTypeScriptTypes(rewritten,{mode:'strip',sourceUrl:`${rev}/items.ts`});
 const url=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
 const code=`const m=await import(${JSON.stringify(url)});try{console.log(JSON.stringify(m.repairGridLayout(${JSON.stringify(cell)},8,1)))}catch(e){console.log(JSON.stringify({error:e.message}))}`;
 const started=performance.now(),p=spawnSync(process.execPath,['--input-type=module'],{input:code,encoding:'utf8',timeout:2500,maxBuffer:1024*1024});
 timeoutRows.push({revision:rev,cell,elapsedMs:Math.round(performance.now()-started),exitCode:p.status,errorCode:p.error?.code??null,signal:p.signal,stdout:p.stdout?.trim()});
}
output.grid.invalidInputTimeout=timeoutRows;
// Verify the seven older raw inpaint charges rather than inferring them from a test expectation.
const callsPath='spikes/api/out/x28/calls.jsonl',lines=(await readFile(resolve(root,callsPath),'utf8')).trim().split(/\r?\n/).map(s=>JSON.parse(s));
const bills=[];
for(const post of lines.filter((c:any)=>c.method==='POST'&&c.path==='/inpaint-v3'&&c.response?.background_job_id)){
 const id=post.response.background_job_id, polls=lines.filter((c:any)=>c.path===`/background-jobs/${id}`&&c.response?.status==='completed'),last=polls.at(-1),size=post.request.inpainting_image.size;
 bills.push({id,width:size.width,height:size.height,status:last?.response.status??null,usage:last?.response.usage??null,requestBytesSha256:hash(JSON.stringify(post.request)),predicted:gridEstimate({w:size.width,h:size.height},1,0,1).gens});
}
output.receiptAudit={source:callsPath,sourceSha256:hash(await readFile(resolve(root,callsPath))),rows:bills,limits:'This independently checks one rectangular shape repeated seven times. It does not independently recover all 11 claimed unique shapes or prove the provider price formula.'};
output.limits=['No production code changes, provider requests, installs, credentials or forbidden handoff reads.', 'Synthetic masks have independent authored ownership; opposite-label controls deliberately demonstrate unresolved identifiability.', 'Real bench deltas have no independent semantic labels and are not automatically classified as fixes or regressions.', 'ZIP imports validate positive layer and rig sizes. Zero-width helper hang is a malformed-input robustness regression; no normal validated-import path was demonstrated.'];
await writeFile(resolve(folder,'results.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({chromaCases:rows.length,realBench:output.chroma.realBench.cases,realCells:cells,grid:output.grid.validLayouts,timeouts:timeoutRows,receipts:bills.length}));
