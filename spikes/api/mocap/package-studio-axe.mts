// Package the retained candidate through the real editable-project and engine exporters. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {cellHash,baseHashOf,type Sha256} from '../../../app/src/lib/rig/rig.ts';
import {CURRENT_FORMAT,type Project,type ItemQa,type CellKey} from '../../../app/src/lib/store/manifest.ts';
import {projectEntries,readCharacterZip} from '../../../app/src/lib/store/import.ts';
import {exportFiles} from '../../../app/src/lib/export/export.ts';
import {composeCell} from '../../../app/src/lib/compose/compose.ts';
import {zip,unzip} from '../../../app/src/lib/store/zip.ts';
import type {Img} from '../../../app/src/lib/image/png.ts';
import {splitBase} from '../../../app/src/lib/dress/regions.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/studio-axe-2026-11-02'),input=fs.readFileSync(path.join(root,'docs/research/artifacts/2026-11-02-gripped-axe-east.zip')),sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
if(sha(input)!=='2b753653143df05b8b2a08d9e940c19230d2fa405e87f679b964522e416b27f3')throw new Error('Expected the retained native grip candidate.');
const files=await unzip(input),read=(name:string)=>{const bytes=files.get(name);if(!bytes)throw new Error('Missing candidate entry: '+name);return bytes;},native=JSON.parse(new TextDecoder().decode(read('manifest.json')));
if(native.qualified!==false||native.direction!=='east'||native.frames.length!==8)throw new Error('Only the explicitly experimental eight-frame east candidate is supported.');
const images=new Map<Sha256,Img>(),bodyHashes:Sha256[]=[],axeHashes:Sha256[]=[],bodyFrames:Img[]=[],expected:Img[]=[];
for(let i=0;i<8;i++){
  if(sha(read(`body/${i}.png`))!==native.frames[i].sourceBodySha256)throw new Error('Body source identity changed.');
  const body=await decodePngBytes(read(`body/${i}.png`)),axe=await decodePngBytes(read(`layers/${i}.png`));
  if([body,axe].some(im=>im.w!==144||im.h!==144))throw new Error('Native geometry changed.');
  const b=await cellHash(body),a=await cellHash(axe);images.set(b,body);images.set(a,axe);bodyHashes.push(b);axeHashes.push(a);bodyFrames.push(body);expected.push(await decodePngBytes(read(`preview/${i}.png`)));
}
// These are deliberately unmeasured warnings, not fabricated successful QA. The UI hides the required scalar storage fields.
const unmeasured=():ItemQa=>({unmeasured:true,status:'warn',minKeyKept:0,maxKeyOutside:0,minAreaRatio:0,maxAreaCV:0,maxPaletteDist:0,clipPx:0,rerolls:0,cells:{}});
const animations=[{id:'default',cells:1,loop:true,frames:[{cell:0,ms:150}]},{id:'axe-attack',cells:8,loop:false,frames:native.frames.map((f:any)=>({cell:f.frame,ms:f.durationMs}))}];
const rig={cell:{w:144,h:144},pivot:{x:72,y:107},directions:[{id:'east' as const}],animations,baseItem:'base',baseHash:'sha256:' as Sha256};
const hashes:Record<string,Sha256>={'default/east/0':bodyHashes[0]};for(let i=0;i<8;i++)hashes[`axe-attack/east/${i}`]=bodyHashes[i];rig.baseHash=await baseHashOf(rig,hashes);
const coverage=Object.keys(hashes) as CellKey[];
const project:Project={images,manifest:{format:CURRENT_FORMAT,name:'EXPERIMENTAL east axe review',app:'PixelDoll offline candidate; not professionally qualified',rig,materials:[],slots:[{id:'body',z:10,class:'base',required:true},{id:'main_hand',z:180,class:'held'}],items:[
  {id:'base',name:'Experimental frozen body',slot:'body',status:'accepted',mirror:'generate',materials:[],prompt:'Offline review candidate. One east view only. Visible foot contact and motion still require review. No pose rig has been measured.',baseHash:rig.baseHash,provenance:[],qa:unmeasured(),coverage,layers:[{id:'main',role:'fg',z:10,cells:{default:{east:[bodyHashes[0]]},'axe-attack':{east:bodyHashes}}}]},
  {id:'axe',name:'Experimental palm-gripped axe',slot:'main_hand',status:'accepted',mirror:'generate',materials:[],prompt:'Offline authored attachment; not a qualified preset. Review all fingers, occlusion, perspective and body motion before production use.',baseHash:rig.baseHash,provenance:[],qa:unmeasured(),coverage,layers:[{id:'main',role:'fg',z:180,cells:{default:{east:[axeHashes[0]]},'axe-attack':{east:axeHashes}}}]}
],presets:[{id:'armed-review',name:'Experimental armed review',items:{body:'base',main_hand:'axe'},variants:{}},{id:'body-review',name:'Body review',items:{body:'base',main_hand:null},variants:{}}]}};
function same(a:Img|null,b:Img,label:string){if(!a||a.w!==b.w||a.h!==b.h||a.data.some((v,i)=>v!==b.data[i]))throw new Error(label+' differs from native source.');}
for(let i=0;i<8;i++){same(composeCell(project,{body:'base',main_hand:'axe'},'axe-attack','east',i),expected[i],'Armed project frame');same(composeCell(project,{body:'base'},'axe-attack','east',i),bodyFrames[i],'Unequipped project frame');}
fs.mkdirSync(out,{recursive:true});
const editable=await zip(await projectEntries(project)),restored=await readCharacterZip(editable);
for(let i=0;i<8;i++)same(composeCell(restored.project,{body:'base',main_hand:'axe'},'axe-attack','east',i),expected[i],'Editable roundtrip frame');
const engine=await exportFiles(project,{engines:['generic','phaser'],baked:true,exportedAt:'2026-11-02T00:00:00.000Z'});if(engine.errors.length)throw new Error(engine.errors.join('; '));
const engineZip=await zip(engine.entries),engineRestored=await readCharacterZip(engineZip);
for(let i=0;i<8;i++)same(composeCell(engineRestored.project,{body:'base',main_hand:'axe'},'axe-attack','east',i),expected[i],'Engine editable roundtrip frame');
fs.writeFileSync(path.join(out,'experimental-east-axe.pixeldoll.zip'),editable);fs.writeFileSync(path.join(out,'experimental-east-axe-engine.zip'),engineZip);
const report={version:1,paidRequests:0,sourceArchiveSha256:sha(input),editableZipSha256:sha(editable),engineZipSha256:sha(engineZip),supportedDirections:['east'],moves:animations,rigPivot:rig.pivot,nativeCell:rig.cell,armedExactFrames:8,unequippedExactFrames:8,editableRoundtripExactFrames:8,engineEditableRoundtripExactFrames:8,qa:'warn; unmeasured=true; no quality acceptance inferred from item publication status',qualified:false,engineWarnings:engine.warnings,notes:['Uses existing local PixelDoll project import, with no new importer or API.','An explicit Default pose is provided; the attack is nonlooping in engine metadata.','Only east artwork exists in this project. No automatic mirroring, other-view artwork or rig measurements are invented.','Both items are published local records so they can be worn, but QA stays warn/unmeasured and names/prompts explicitly say experimental.']};
fs.writeFileSync(path.join(out,'integration-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
// Artist-picked sole-outline marks from the retained native foot crops. Merged rear-foot views stay unknown.
const front={x:76.5,y:106.5},rear={x:77.5,y:100.5},footFrames=bodyFrames.map((body,index)=>{
  const opaque=(point:{x:number;y:number})=>body.data[(Math.floor(point.y)*body.w+Math.floor(point.x))*4+3]===255;
  if(!opaque(front)||(![4,5].includes(index)&&!opaque(rear)))throw new Error('A visible sole annotation is no longer on the frozen body.');
  return{frame:index,front:{...front,status:'visible'},rear:[4,5].includes(index)?{status:'ambiguous-merged-feet'}:{...rear,status:'visible'},root:{x:0,y:0}};
});
fs.writeFileSync(path.join(out,'both-feet-review.json'),JSON.stringify({sourceArchiveSha256:sha(input),frames:footFrames,front:{visibleFrames:8,screenSpanPx:0,complete:true},rear:{visibleFrames:6,observedScreenSpanPx:0,complete:false,unmeasuredFrames:[4,5]},qualified:false,scope:'Manual visible pixel landmarks on one stationary east attack. Front foot is stable; rear-foot contact is not certified during the merged crouch poses. No new body pixels, inferred hidden landmarks or engine walking speed.'},null,2));
// Studio deliberately applies the existing garment region bit on open. Audit this separately from exact native export.
await splitBase(restored.project);
const colorAudit=expected.map((original,i)=>{
  const actual=composeCell(restored.project,{body:'base',main_hand:'axe'},'axe-attack','east',i)!;
  if(actual.data.some((v,q)=>q%4===2?(v&~1)!==(original.data[q]&~1):v!==original.data[q]))throw new Error('Studio normalization changed more than the declared blue region bit.');
  return{frame:i,changedBlueValues:actual.data.reduce((n,v,q)=>n+Number(v!==original.data[q]),0)};
});
fs.writeFileSync(path.join(out,'studio-color-audit.json'),JSON.stringify({scope:'Existing B15 shirt/shorts tagging, not new artwork. Red, green, alpha and blue bits 1-7 stay exact.',frames:colorAudit},null,2));
// Inspect complete visible support and authored transitions without pretending to recover hidden feet or physics.
const authoring=JSON.parse(new TextDecoder().decode(read('authoring.json')));
const support=bodyFrames.map((body,frame)=>{
  let bottom=-1;for(let y=0;y<body.h;y++)for(let x=0;x<body.w;x++)if(body.data[(y*body.w+x)*4+3])bottom=Math.max(bottom,y);
  if(bottom<0)throw new Error('Empty frozen body cannot establish visible support.');
  const xs=Array.from({length:body.w},(_,x)=>x).filter(x=>body.data[(bottom*body.w+x)*4+3]>0);
  return{frame,y:bottom,xs,centroidX:xs.reduce((n,x)=>n+x+.5,0)/xs.length};
});
if(support.some(s=>s.y!==106||JSON.stringify(s.xs)!==JSON.stringify([72,73,74,75,76])))throw new Error('Reviewed visible support edge changed. Reinspect this candidate.');
const transitions=authoring.frames.map((from:any,i:number)=>{
  const next=(i+1)%8,to=authoring.frames[next],angle=((to.angle-from.angle)%360+540)%360-180;
  return{from:i,to:next,previewLoopOnly:i===7,heldMs:animations[1].frames[i].ms,gripDisplacementPx:Math.hypot(to.grip.x-from.grip.x,to.grip.y-from.grip.y),shortestAxisChangeDegrees:angle};
});
fs.writeFileSync(path.join(out,'clip-continuity-audit.json'),JSON.stringify({qualified:false,interpolated:false,support,transitions,scope:'One fixed-root east clip. Complete bottom silhouette edge stays fixed. Ankle/heel shape and hidden-foot anatomy are not inferred. Distances and shortest axis changes describe discrete authored samples; they are not physical velocities or universal quality thresholds.'},null,2));
