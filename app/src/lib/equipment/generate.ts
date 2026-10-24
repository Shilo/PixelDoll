// Qualified reference editing and offline review. No submission, retries or persistence here: fit.ts owns paid stages.
import { cellImg, layerFrame } from '../compose/compose.ts';
import { deriveMaterials } from '../dress/dress.ts';
import { fromHex } from '../dress/palette.ts';
import { components, keyScore, KT, toChroma, type Key } from '../image/chroma.ts';
import { binaryAlpha, decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { stableStringify } from '../image/hash.ts';
import { bandOf, buildItem, canPose, extractCell, GATES, g2Fails, itemQa, itemRoute, paletteDistance, postProcess, slotOf, unrotate, f0Last, type CellOut, type ItemSpec } from '../items/items.ts';
import { withH4 } from '../items/run.ts';
import { png, type Req } from '../pixellab/routes.ts';
import type { JobRec } from '../pixellab/queue.ts';
import { borderPx, paddedPoses, poseBatches } from '../rig/clips.ts';
import { fromApi, hasAll } from '../rig/poses.ts';
import { HEADROOM_MIN } from '../rig/freeze.ts';
import { opaqueBox } from '../rig/normalize.ts';
import { cellHash, cellKey, type DirectionName } from '../rig/rig.ts';
import * as db from '../store/db.ts';
import { CURRENT_FORMAT, type Material, type Preset, type Project, type Provenance } from '../store/manifest.ts';
import { designColors, designRestReferences } from './design.ts';
import { loadImages } from './store.ts';
import { designItem, type EquipmentDesign } from './types.ts';

export interface GeneratedFitCall { req: Req; cells: string[]; limit: number }
export interface FitRecord { call: { cells: string[]; seed: number }; rec: JobRec }
const directions = (p: Project) => p.manifest.rig.directions.filter(d => !d.mirrorOf).map(d => d.id);
const size = { width: 64, height: 64 };
const b64 = async (im: Img) => { let s = ''; for (const n of await encodePngBytes(im)) s += String.fromCharCode(n); return btoa(s); };

/** This is a paid trial, never a guarantee of arbitrary design identity or quality. */
export function qualifiedFit(design: EquipmentDesign, target: Project): string | null {
  const source = design.source, rig = target.manifest.rig, item = designItem(design);
  if (item.slot !== 'head') return 'Reference fitting is currently an experimental trial for headwear. Other slots support exact free copies.';
  if(source.materials.filter(m=>m.owner===item.id).length!==1)return 'This experimental fitting trial supports single-material headwear. Multi-material designs can still be copied onto matching frames for free.';
  const sourceSlot=source.slots.find(s=>s.id==='head')??slotOf('head'),targetSlot=target.manifest.slots.find(s=>s.id==='head')??slotOf('head');
  if([sourceSlot,targetSlot].some(s=>s.class!=='rigid'||s.anchor!=='head'||s.bgZ!==undefined))return 'This fitting trial needs a standard rigid head slot on both characters; custom grips and split layers are not qualified.';
  if (source.rig.view !== 'low top-down' || rig.view !== 'low top-down' || source.rig.template !== 'mannequin' || rig.template !== 'mannequin') return 'This fitting trial needs known low top-down humanoid rigs on both characters. Set up imported characters first.';
  if (source.rig.cell.w !== 64 || source.rig.cell.h !== 64 || rig.cell.w !== 64 || rig.cell.h !== 64) return 'This fitting trial supports 64 × 64 worn layers.';
  if (item.layers.length !== 1 || item.layers[0].role !== 'fg') return 'This headwear layer layout has not been qualified for reference fitting.';
  const frame = layerFrame(source.rig, item.layers[0]);
  if (frame.w !== 64 || frame.h !== 64 || frame.x !== source.rig.pivot.x || frame.y !== source.rig.pivot.y) return 'Oversized or offset headwear needs a separately qualified fitting route.';
  if (!item.key || !item.dressed || directions(target).some(d => !item.dressed?.[d] || !source.rig.rest?.[d])) return 'This trial requires original dressed standing references for every requested direction.';
  const body = target.manifest.items.find(i => i.id === rig.baseItem);
  if(!body || body.layers.length!==1)return 'This fitting trial requires one frozen base-body layer.';
  const bodyFrame=layerFrame(rig,body.layers[0]);
  if(bodyFrame.w!==64||bodyFrame.h!==64||bodyFrame.x!==rig.pivot.x||bodyFrame.y!==rig.pivot.y)return 'The target body layer must use the standard 64 × 64 cell and body pivot.';
  const clipDirs = Object.fromEntries(rig.animations.map(a => [a.id, directions(target).filter(d => body?.layers[0].cells?.[a.id]?.[d]?.some(Boolean))]));
  if(!Object.values(clipDirs).some(ds=>ds.length))return 'The target has no body frames to fit.';
  for(const a of rig.animations)for(const dir of clipDirs[a.id])for(let n=0;n<a.cells;n++) {
    const im=cellImg(target,body.layers[0],a.id,dir,n);
    if(!im||im.w!==64||im.h!==64||!opaqueBox(im))return `The target ${a.id}/${dir} has missing, empty or incorrectly sized body frames. Restore it before fitting.`;
  }
  if (!canPose(rig, { anims: rig.animations.filter(a => clipDirs[a.id].length).map(a => a.id), dirs: directions(target), clipDirs })) return 'Set up complete target standing joints and stored animation poses before fitting.';
  for (const d of directions(target)) {
    const rest = rig.rest?.[d], image = rest && target.images.get(rest.image);
    if (!rest || !hasAll(rest.keypoints) || !image || image.w !== 64 || image.h !== 64 || !opaqueBox(image)) return 'The target standing views need complete joints and nonempty 64 × 64 images.';
  }
  return null;
}
export function fitFramingWarnings(target: Project): string[] {
  return directions(target).flatMap(d => {
    const rest = target.manifest.rig.rest?.[d], im = rest && target.images.get(rest.image), box = im && opaqueBox(im);
    return box && box.y0 < HEADROOM_MIN ? [`${d}: headroom ${box.y0} px; tall headwear may need a larger frame.`] : [];
  });
}
function fitKey(design: EquipmentDesign): Key {
  const colors = designColors(design).map(fromHex);
  const preferred=designItem(design).key;
  const candidates:Key[]=preferred?[preferred,preferred==='green'?'magenta':'green']:['green','magenta'];
  const key = candidates.find(k => colors.every(c => keyScore(k, c >> 16, (c >> 8) & 255, c & 255) < KT));
  if (!key) throw new Error('This colorway overlaps both chroma keys. Choose a colorway with a safe key before fitting.');
  return key;
}
function specFor(design: EquipmentDesign, target: Project): ItemSpec {
  const rig = target.manifest.rig, body = target.manifest.items.find(i => i.id === rig.baseItem)!;
  const clipDirs = Object.fromEntries(rig.animations.map(a => [a.id, directions(target).filter(d => body.layers[0].cells?.[a.id]?.[d]?.some(Boolean))]));
  return { id: 'fitted-preview', name: design.name, slot: design.slot, prompt: designItem(design).prompt, method: 'skel', key: fitKey(design), anims: rig.animations.filter(a => clipDirs[a.id].length).map(a => a.id), dirs: directions(target), clipDirs };
}
function selectionFor(spec:ItemSpec,target:Project,requested?:string[]):Set<string> {
  const all=target.manifest.rig.animations.filter(a=>spec.anims.includes(a.id)).flatMap(a=>spec.clipDirs![a.id].flatMap(d=>Array.from({length:a.cells},(_,i)=>cellKey(a.id,d,i))));
  if(requested&&(!requested.length||new Set(requested).size!==requested.length||requested.some(k=>!all.includes(k))))throw new Error('The missing-frame selection is empty, duplicated or outside the target moves.');
  return new Set(requested??all);
}
export async function restFitRequests(design: EquipmentDesign, source: Project, target: Project, seed: number): Promise<GeneratedFitCall[]> {
  const reason = qualifiedFit(design, target); if (reason) throw new Error(reason);
  const key = fitKey(design), refs = designRestReferences(design, source, key), dirs = directions(target);
  if (dirs.length < 2 || dirs.length > 15 || dirs.some(d => !refs.some(r => r.direction === d && r.complete))) throw new Error('The requested standing reference coverage is incomplete.');
  const reference = refs.find(r => r.direction === 'south'); if (!reference) throw new Error('A south-facing source reference is required.');
  const frames = await Promise.all(dirs.map(async d => ({ image: png(await b64(toChroma(target.images.get(target.manifest.rig.rest![d]!.image)!, key))), size })));
  const color = key === 'green' ? 'bright green' : 'magenta';
  return [{ req: { method: 'POST', path: '/transfer-outfit-v2', body: {
    reference_image: { image: png(await b64(reference.image)), size }, frames, image_size: size, seed, no_background: true,
    additional_instructions: `Transfer ONLY the identical ${designItem(design).prompt} from the reference onto the ${color} mannequin in every target frame. Target directions in order: ${dirs.join(', ')}. Use the reference colors even if the description names the original color. Preserve target body silhouette, limb positions, ${color} chroma-key ramp and transparent background exactly. Empty hands; no other clothing, weapons or effects. Keep the headwear design; fit it to the target head. Do not transfer the reference body shape.`,
  } }, cells: dirs.map(d => `rest/${d}/0`), limit: 10 }];
}
export async function poseFitRequests(design: EquipmentDesign, target: Project, rest: Partial<Record<DirectionName, Img>>, seed: number, selectedCells?:string[]): Promise<GeneratedFitCall[]> {
  const reason = qualifiedFit(design, target); if (reason) throw new Error(reason);
  const rig = target.manifest.rig, spec = specFor(design, target), calls: GeneratedFitCall[] = [], selected=selectionFor(spec,target,selectedCells);
  for (const a of rig.animations.filter(a => spec.anims.includes(a.id))) for (const dir of spec.clipDirs![a.id]) {
    const poses = a.sources?.[dir]?.keypoints, first = rest[dir], reference = rig.rest?.[dir];
    if (!first || !reference || !poses || poses.length !== a.cells || !poses.every(hasAll)) throw new Error(`Missing approved reference or stored poses for ${a.id}/${dir}.`);
    // The API poses a minimum of three cells; a frozen imported single-frame rest is already the approved fitted frame.
    if (a.cells === 1 && a.sources?.[dir]?.motion === 'imported-rest') continue;
    const indices=Array.from({length:a.cells},(_,i)=>i).filter(i=>selected.has(cellKey(a.id,dir,i)));
    if(!indices.length)continue;
    for (const batch of poseBatches(indices.length)) {
      const part=indices.slice(batch.start,batch.start+batch.count);
      calls.push({ req: itemRoute.pose({ keyframePngB64: await b64(first), rest: reference.keypoints, poses: part.map(i=>poses[i]), item: spec.prompt, slot: spec.slot, key: spec.key as Key, anim: a.id, dir, seed: seed + calls.length, cell: rig.cell, view: rig.view }), cells: part.map(i=>cellKey(a.id,dir,i)), limit: batch.count <= 3 ? 2 : batch.count <= 8 ? 3 : 4 });
    }
  }
  return calls;
}
async function decoded(record: FitRecord): Promise<Img[]> {
  if (record.rec.state !== 'done') throw new Error('A fitting call has not completed.');
  const results = record.rec.jobs.flatMap(j => j.results).sort((a,b) => Number(a.label.split('/').at(-1)) - Number(b.label.split('/').at(-1)));
  return Promise.all(results.map(async o => { const blob = await db.getBlob(o.sha); if (!blob) throw new Error('A generated fitting image is missing.'); return binaryAlpha(await decodePng(blob)); }));
}
const provenance = (records: FitRecord[]): Provenance[] => records.map(({ call, rec }) => ({ endpoint: rec.endpoint, params: JSON.parse(JSON.stringify(rec.params, (_key, value) => value && typeof value === 'object' && '$blob' in value ? { sha256: value.$blob } : value)), seed: call.seed, requestHash: `sha256:${rec.requestHash}`, jobId: rec.jobs[0]?.id, usage: { generations: rec.gens, usd: rec.usd }, createdAt: new Date(rec.submittedAt ?? rec.createdAt).toISOString(), produced: [...call.cells] as Provenance['produced'] }));
export async function evaluateRestFit(design: EquipmentDesign, target: Project, records: FitRecord[]): Promise<{ project: Project; itemId: string; rest: Partial<Record<DirectionName, Img>>; warnings: string[]; fails: string[] }> {
  const key = fitKey(design), rig = target.manifest.rig, rest: Partial<Record<DirectionName, Img>> = {}, cells: CellOut[] = [], fails: string[] = [], warnings: string[] = ['Experimental reference fit: review design identity, all views and alignment. Failed attempts still cost generations.', ...fitFramingWarnings(target)];
  for (const [call, record] of records.entries()) {
    const images = await decoded(record);
    if (images.length !== record.call.cells.length || images.some(im => im.w !== 64 || im.h !== 64)) throw new Error('The rest fit returned an invalid frame count or canvas.');
    for (const [n, path] of record.call.cells.entries()) {
      const dir = path.split('/')[1] as DirectionName, reference = rig.rest?.[dir]; if (!reference) throw new Error('Missing target rest '+dir);
      if (rest[dir]) throw new Error('Duplicate fitted standing view.');
      const base = target.images.get(reference.image)!;
      const c = extractCell({ key: path, call, base, out: images[n], route: key, band: bandOf('head', fromApi(reference.keypoints, rig.cell), 64) });
      cells.push(c); rest[dir] = images[n];
      if (g2Fails(c) || (c.keyOutside ?? 0) > GATES.keyOutside || !c.area || c.outBand || c.shifted) fails.push(`${dir}: the fitted rest view failed body preservation, presence or alignment checks.`);
      const border=borderPx(c.layer);if(border)warnings.push(`G7 ${dir}: ${border} headwear pixels touch the canvas border; review framing.`);
      if(c.specks||c.pinholes||components(c.mask,64,64).length>1)warnings.push(`${dir}: inspect detached pieces, stray pixels and small holes in the fitted headwear.`);
    }
  }
  if (directions(target).some(d => !rest[d])) throw new Error('The rest fit is missing requested directions.');
  const manifest = structuredClone(target.manifest), images = new Map(target.images), base = manifest.items.find(i => i.id === rig.baseItem)!;
  manifest.rig.animations = [{ id: 'fit-rest', cells: 1, loop: true, frames: [{ cell: 0, ms: 200 }] }];
  base.layers[0].cells = { 'fit-rest': {} };
  for (const d of directions(target)) base.layers[0].cells['fit-rest']![d] = [rig.rest![d]!.image];
  const item = structuredClone(designItem(design));item.id = 'fitted-preview'; item.name = design.name; item.baseHash = rig.baseHash; item.materials = []; delete item.design; delete item.qa;
  item.layers = [{ id: 'main', role: 'fg', z: slotOf('head').z, cells: { 'fit-rest': {} } }];
  for (const c of cells) { const h = await cellHash(c.layer);images.set(h,c.layer);item.layers[0].cells!['fit-rest']![c.key.split('/')[1] as DirectionName] = [h]; }
  manifest.items = [base,item];manifest.materials = manifest.materials.filter(m => m.owner === base.id);manifest.format = CURRENT_FORMAT;
  if (!manifest.slots.some(s => s.id === 'head')) manifest.slots.push(slotOf('head'));
  return { project: { manifest, images }, itemId: item.id, rest, warnings, fails };
}
export async function evaluatePoseFit(design: EquipmentDesign, target: Project, rest: Partial<Record<DirectionName, Img>>, records: FitRecord[], restRecords: FitRecord[] = [], options: { reuseApprovedSourceRest?: boolean; selectedCells?:string[] } = {}): Promise<{ project: Project; itemId: string; materials: Material[]; variants: Preset['variants']; warnings: string[]; fails: string[]; failedCells: string[] }> {
  const rig = target.manifest.rig, spec = specFor(design,target), body = target.manifest.items.find(i => i.id === rig.baseItem)!, cells: CellOut[] = [], keys: Partial<Record<DirectionName, Img>> = {};
  const history:Provenance[] = structuredClone(designItem(design).provenance).map(p => ({...p, produced: []}));
  const selected=selectionFor(spec,target,options.selectedCells);
  if(options.reuseApprovedSourceRest) {
    const source=design.source.rig, item=designItem(design);
    const profile=(r:typeof rig)=>({cell:r.cell,pivot:r.pivot,view:r.view,template:r.template,rest:r.rest});
    if(stableStringify(profile(source))!==stableStringify(profile(rig))||!history.length||item.key!==spec.key||Object.keys(design.variants).length||design.source.materials.some(m=>m.owner===item.id&&m.defaultVariant))throw new Error('Existing standing references cannot be reused on a changed body, pose, camera or color baseline.');
    for(const dir of directions(target))if(!rest[dir]||await cellHash(rest[dir]!)!==item.dressed?.[dir])throw new Error('The reused reference is not the approved raw standing artwork.');
  } else if(directions(target).some(dir=>!restRecords.some(r=>r.rec.state==='done'&&r.call.cells.includes(`rest/${dir}/0`))))throw new Error('The approved fitted reference is missing its generating-call provenance.');
  for (const dir of directions(target)) { const view = rig.rest![dir]!, out = rest[dir];if (!out) throw new Error('Missing approved fitted standing view.'); keys[dir] = extractCell({ key: `rest/${dir}/0`, call: -1, base: target.images.get(view.image)!, out, route: spec.key, band: bandOf(spec.slot,fromApi(view.keypoints,rig.cell),64) }).layer; }
  for (const [call,record] of records.entries()) {
    const [anim,dir] = record.call.cells[0].split('/') as [string,DirectionName], a = rig.animations.find(a=>a.id===anim)!;
    const poses = record.call.cells.map(k=>a.sources![dir]!.keypoints![+k.split('/')[2]]), returned = await decoded(record);
    if (returned.length !== Math.max(3,record.call.cells.length) || returned.some(im=>im.w!==64||im.h!==64)) throw new Error('The posed fit returned an invalid frame count or canvas.');
    const frames = unrotate(returned,f0Last(spec.slot,rig.rest![dir]!.keypoints,paddedPoses(poses),rig.cell));
    for (const [n,path] of record.call.cells.entries()) { const index=+path.split('/')[2],base=cellImg(target,body.layers[0],anim,dir,index);if(!base)throw new Error('Missing frozen target frame.');cells.push(extractCell({key:path,call:history.length+call,base,out:frames[n],route:spec.key,band:bandOf(spec.slot,fromApi(a.sources![dir]!.keypoints![index],rig.cell),64),posed:true,clip:true})); }
  }
  const restProvenance = provenance(restRecords);
  for (const a of rig.animations.filter(a=>spec.anims.includes(a.id)&&a.cells===1)) for (const dir of spec.clipDirs![a.id]) if (a.sources?.[dir]?.motion==='imported-rest') {
    if(!selected.has(cellKey(a.id,dir,0)))continue;
    const producer=restRecords.findIndex(r=>r.call.cells.includes(`rest/${dir}/0`));
    const originalProducer=options.reuseApprovedSourceRest?designItem(design).provenance.findIndex(p=>p.produced?.includes(cellKey('rest',dir,0) as NonNullable<Provenance['produced']>[number])):-1;
    if(producer<0&&originalProducer<0)throw new Error('The fitted standing view is missing its generating-call provenance.');
    const key=cellKey(a.id,dir,0), source=producer>=0?restProvenance[producer]:history[originalProducer];source.produced=[...new Set([...source.produced,key as NonNullable<Provenance['produced']>[number]])];
    cells.push(extractCell({key,call:producer>=0?history.length+records.length+producer:originalProducer,base:cellImg(target,body.layers[0],a.id,dir,0)!,out:rest[dir]!,route:spec.key,band:bandOf(spec.slot,fromApi(rig.rest![dir]!.keypoints,rig.cell),64),posed:true,clip:true}));
  }
  if (new Set(cells.map(c=>c.key)).size !== selected.size || cells.length !== selected.size || cells.some(c=>!selected.has(c.key))) throw new Error('Fitted animation coverage is incomplete or duplicated.');
  postProcess(rig,slotOf(spec.slot),cells,keys);
  const qa = withH4(itemQa(rig,slotOf(spec.slot),spec.key,cells,0,GATES.keyOutsidePosed),slotOf(spec.slot),cells,keys,rig);
  for(const [clip,summary]of Object.entries(qa.qa.clips??{})) {
    const count=rig.animations.find(a=>a.id===clip.split('/')[0])!.cells;
    if(cells.filter(c=>c.key.startsWith(clip+'/')).length<count){if(summary.status==='pass')summary.status='warn';if(qa.qa.status==='pass')qa.qa.status='warn';qa.warnings.push(`${clip}: only newly fitted cells were checked. Earlier frames retain their existing checks.`);}
  }
  // itemQa's ordinary design lock starts at its first posed call. Fitting has an approved standing design before any pose;
  // compare against that actual per-direction palette as well, so a uniformly drifted whole clip cannot self-score clean.
  const palettes = new Map<DirectionName,number[]>();
  for(const [direction,image]of Object.entries(keys) as [DirectionName,Img][]) {
    const colors=new Set<number>();for(let n=0;n<image.data.length;n+=4)if(image.data[n+3])colors.add((image.data[n]<<16)|(image.data[n+1]<<8)|image.data[n+2]);
    palettes.set(direction,[...colors]);
  }
  for(const c of cells) {
    const [anim,dir]=c.key.split('/') as [string,DirectionName], distance=paletteDistance(palettes.get(dir)??[],[c.layer]);
    qa.qa.maxPaletteDist=Math.max(qa.qa.maxPaletteDist,distance);
    const clip=qa.qa.clips?.[`${anim}/${dir}`];if(clip)clip.maxPaletteDist=Math.max(clip.maxPaletteDist,distance);
    if(distance>GATES.paletteDist){const message=`G6 ${c.key}: palette differs from the approved rest fit (${distance.toFixed(1)}).`;qa.failCalls.set(c.call,[...(qa.failCalls.get(c.call)??[]),message]);qa.qa.status='fail';if(clip)clip.status='fail';}
  }
  const built = await buildItem({spec,rig,cells,route:spec.key,provenance:[...history,...provenance(records),...restProvenance],qa:qa.qa,dressed:rest});
  const manifest=structuredClone(target.manifest);manifest.format=CURRENT_FORMAT;manifest.items.push(built.item);
  if(!manifest.slots.some(s=>s.id===spec.slot))manifest.slots.push(slotOf(spec.slot));
  const project:Project={manifest,images:new Map([...target.images,...built.images])};deriveMaterials(project,[built.item]);
  const sourceImages=await loadImages(design.imageHashes,design.images);
  // Source assets stay pinned by lineage after publication; the fitting orchestrator attaches its immutable snapshot.
  for(const [h,im]of sourceImages)project.images.set(h,im);
  return {project,itemId:built.item.id,materials:manifest.materials.filter(m=>m.owner===built.item.id),variants:{},warnings:qa.warnings,fails:[...qa.failCalls.values()].flat(),failedCells:cells.filter(c=>qa.failCalls.has(c.call)).map(c=>c.key)};
}
