// Dev-only, explicit paid reference-transfer experiment. Never imported by the Studio or production entry.
import '../app.css';
import { queue } from '../lib/pixellab/queue.ts';
import { app, setKey } from '../lib/app.svelte.ts';
import * as db from '../lib/store/db.ts';
import { readCharacterZip, type ImportedCharacter } from '../lib/store/import.ts';
import { createDesign, designRestReferences } from '../lib/equipment/design.ts';
import { cellImg, over } from '../lib/compose/compose.ts';
import { toChroma } from '../lib/image/chroma.ts';
import { decodePng, makeImg, type Img } from '../lib/image/png.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import { bandOf, extractCell, packGrid, bandMask, cutGrid } from '../lib/items/items.ts';
import { png, routes, type Req } from '../lib/pixellab/routes.ts';
import { zip, type ZipEntry } from '../lib/store/zip.ts';

if (!import.meta.env.DEV) throw new Error('This research harness is dev-only.');
await queue.connect();
if (import.meta.env.MODE === 'agent' && window.top === window && localStorage.getItem('pixeldoll.agentKey') !== 'off') {
  const r = await fetch('/__dev/pixellab-key', { cache: 'no-store' });
  if (r.ok) setKey(await r.text(), false);
}
const root = document.querySelector<HTMLDivElement>('#probe')!;
root.style.cssText = 'max-width:1100px;margin:30px auto;padding:20px;';
root.innerHTML = '<h1>Shared equipment qualification</h1><p>Explicit live editing experiment. One submission per click; no retries. Output remains a candidate.</p><label>Source character ZIP <input id="source" type="file" accept=".zip"></label><br><label>Target character ZIP <input id="target" type="file" accept=".zip"></label><p id="details"></p><button id="transfer" disabled>Run reference transfer (one paid call)</button> <button id="inpaint" disabled>Run masked reference grid (one paid call)</button> <button id="download" disabled>Download evidence</button><pre id="status"></pre><div id="frames" style="display:flex;gap:16px;flex-wrap:wrap"></div>';
let source: ImportedCharacter | undefined, target: ImportedCharacter | undefined;
let outputs: ZipEntry[] = [], busy = false;
const status = root.querySelector<HTMLPreElement>('#status')!;
const details = root.querySelector<HTMLParagraphElement>('#details')!;
function ready() { for (const id of ['transfer','inpaint']) root.querySelector<HTMLButtonElement>('#'+id)!.disabled = busy || !source || !target || !app.key; }
for (const id of ['source', 'target']) root.querySelector<HTMLInputElement>('#'+id)!.onchange = async e => {
  try {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const imported = await readCharacterZip(new Uint8Array(await file.arrayBuffer()));
    if (id === 'source') source = imported; else target = imported;
    details.textContent = `${source?.project.manifest.name ?? 'No source'} → ${target?.project.manifest.name ?? 'No target'}`;
    ready();
  } catch (e) { status.textContent = String(e); }
};
const b64 = async (im: Img) => { let s=''; for (const n of await encodePngBytes(im)) s+=String.fromCharCode(n); return btoa(s); };
function show(label: string, images: Img[]) {
  const group = document.createElement('section'), title = document.createElement('h2'); title.textContent=label; group.append(title);
  for (const im of images) { const canvas=document.createElement('canvas'); canvas.width=im.w;canvas.height=im.h;canvas.style.cssText='width:192px;image-rendering:pixelated;background:#292b36;margin:3px;';canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data),im.w,im.h),0,0);group.append(canvas); }
  root.querySelector('#frames')!.append(group);
}
async function run(kind: 'transfer' | 'inpaint') {
  if (busy || !source || !target) return;
  busy=true; ready(); outputs=[]; root.querySelector('#frames')!.replaceChildren();
  try {
    const sp=source.project,tp=target.project,sm=sp.manifest,tm=tp.manifest;
    const item=sm.items.find(i=>i.slot==='head'); if(!item) throw new Error('Source requires approved headwear.');
    const design=await createDesign(sp,item.id,sm.presets[0]?.variants), refs=designRestReferences(design,{manifest:design.source,images:sp.images},'green');
    const dirs=tm.rig.directions.filter(d=>!d.mirrorOf).map(d=>d.id);
    const base=tm.items.find(i=>i.id===tm.rig.baseItem)!;
    const targets=dirs.map(dir=>{ const rest=tm.rig.rest?.[dir];const im=rest&&tp.images.get(rest.image)||cellImg(tp,base.layers[0],tm.rig.animations[0].id,dir,0);if(!im)throw new Error('Missing target '+dir);return im; });
    const reference=refs.find(r=>r.direction==='south')!;if(!reference||targets.some(im=>im.w!==64||im.h!==64))throw new Error('Probe supports 64px worn headwear only.');
    const frames=await Promise.all(targets.map(im=>b64(toChroma(im,'green'))));
    const instructions=`Transfer ONLY the identical ${item.prompt} from the reference onto the green mannequin in every target frame. Target directions in order: ${dirs.join(', ')}. Preserve target body silhouette, limb positions, green chroma-key ramp and transparent background exactly. Empty hands; no other clothing, weapons or effects. Keep the helmet design and steel colors; fit it to the target head. Do not transfer the reference body shape.`;
    let req:Req;
    if(kind==='transfer')req={method:'POST',path:'/transfer-outfit-v2',body:{reference_image:{image:png(await b64(reference.image)),size:{width:64,height:64}},frames:frames.map(base64=>({image:png(base64),size:{width:64,height:64}})),image_size:{width:64,height:64},additional_instructions:instructions,no_background:true,seed:223014}};
    else {const inputs=targets.map(im=>toChroma(im,'green')), selected=dirs.map(d=>refs.find(r=>r.direction===d)).filter(r=>!!r);const packed=packGrid([...inputs,...selected.map(r=>r.image)],[...inputs.map(im=>bandMask({x:0,y:0,w:64,h:28},im.w,im.h)),...selected.map(()=>null)]);req=routes.inpaintV3({description:`${instructions} This is a 4-column 64px cell sprite grid. First ${inputs.length} cells are targets; next ${selected.length} cells are kept reference views. Edit only white head bands; keep black reference cells, layout and every other pixel unchanged.`,inpainting_image:{image:png(await b64(packed.image)),size:{width:packed.image.w,height:packed.image.h}},mask_image:{image:png(await b64(packed.mask)),size:{width:packed.mask.w,height:packed.mask.h}},no_background:true,seed:223015});outputs.push({name:'input-grid.png',data:await encodePngBytes(packed.image)},{name:'mask-grid.png',data:await encodePngBytes(packed.mask)});}
    show('Source reference', [reference.image]);show('Target bodies', targets);
    status.textContent='Submitting one explicit '+kind+' call. No automatic retry.';
    const rec=await queue.enqueue(req,{label:'Shared headwear qualification: '+kind,tag:'shared-fit-qualification',resumeSafe:true});
    status.textContent='Job '+rec.id+' — waiting';
    const done=await queue.settled(rec.id);if(done.state!=='done')throw new Error(done.state+': '+done.error);
    const resultRefs=done.jobs.flatMap(j=>j.results), images=await Promise.all(resultRefs.map(async r=>{const b=await db.getBlob(r.sha);if(!b)throw new Error('Missing result');return decodePng(b);}));
    const result=kind==='inpaint'?cutGrid(images[0],dirs.length,64,64):images;
    if(result.length!==dirs.length||result.some(im=>im.w!==64||im.h!==64))throw new Error('Unexpected output dimensions/count');
    const cells=result.map((out,i)=>extractCell({key:'rest/'+dirs[i]+'/0',call:0,base:targets[i],out,route:'green',band:bandOf('head',undefined,64)}));
    show('Generated dressed candidates',result);show('Isolated layers',cells.map(c=>c.layer));show('On frozen target',cells.map((c,i)=>{const im=makeImg(64,64);over(im,targets[i]);over(im,c.layer);return im;}));
    const summary={kind,source:sm.name,target:tm.name,sourceHash:sm.rig.baseHash,targetHash:tm.rig.baseHash,sourceView:sm.rig.view,targetView:tm.rig.view??'legacy-unspecified',directions:dirs,job:{id:done.id,requestHash:done.requestHash,state:done.state,gens:done.gens,usd:done.usd,remoteIds:done.jobs.map(j=>j.id)},metrics:cells.map(c=>({key:c.key,area:c.area,keyKept:c.keyKept,keyLost:c.keyLost,keyOutside:c.keyOutside,outBand:c.outBand,specks:c.specks,shifted:c.shifted}))};
    outputs.push({name:'evidence.json',data:new TextEncoder().encode(JSON.stringify(summary,null,2))});
    for(const [i,dir] of dirs.entries())for(const [label,im]of Object.entries({target:targets[i],dressed:result[i],layer:cells[i].layer}))outputs.push({name:dir+'-'+label+'.png',data:await encodePngBytes(im)});
    outputs.push({name:'source-reference.png',data:await encodePngBytes(reference.image)});
    status.textContent=JSON.stringify(summary,null,2);root.querySelector<HTMLButtonElement>('#download')!.disabled=false;
  } catch(e){status.textContent=String(e);}finally{busy=false;ready();}
}
root.querySelector<HTMLButtonElement>('#transfer')!.onclick=()=>void run('transfer');
root.querySelector<HTMLButtonElement>('#inpaint')!.onclick=()=>void run('inpaint');
root.querySelector<HTMLButtonElement>('#download')!.onclick=async()=>{const url=URL.createObjectURL(new Blob([await zip(outputs) as Uint8Array<ArrayBuffer>]));const a=document.createElement('a');a.href=url;a.download='shared-fit-qualification.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
