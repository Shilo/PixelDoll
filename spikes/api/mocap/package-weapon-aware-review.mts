// Offline full-eight-frame inspection, using the app's existing GIF encoder.
// Timing is explicitly illustrative; no provider duration or professional qualification is inferred.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {contactSheet,recompose} from '../../../app/src/lib/items/items.ts';
import type {Img} from '../../../app/src/lib/image/png.ts';

const hook=registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/studio/shareMedia.ts'))return {...result,source:String(result.source).replace("import { GIFEncoder, quantize, applyPalette } from 'gifenc'","import gifenc from 'gifenc'; const { GIFEncoder, quantize, applyPalette } = gifenc")};return result;}});
const {encodeShareMedia}=await import('../../../app/src/studio/shareMedia.ts');hook.deregister();
const out=path.resolve(import.meta.dirname,'../out/weapon-aware-2026-11-02'),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const family=read('independent-body-family-v2-audit.json'),completion=read('weapon-swap-completion-analysis.json'),original=read('weapon-swap-analysis.json');
if(family.bodyRecipeCanonicalHash!=='4458544f88245b1a96db2c1781f857a2f306271014009574bf0ac11de5fb8fd8'||completion.sourceBodyRecipeCanonicalHash!==family.bodyRecipeCanonicalHash||completion.packetCanonicalHash!=='8fb5ba7f0464f71ebb622d704490d4b223eea09bdc43d1c2ee24ddda310ba9ce'||original.packetCanonicalHash!=='287f215152db5ea978fd4319b1c3025344a9046a6c28b665f7e44402d261a56b')throw new Error('Both actual hatchet audits and the independently reviewed authored family are required.');
const sourceFiles:any[]=[],variants:Record<string,Img[]>={bare:[],sword:[],hatchet:[]};
for(let i=0;i<8;i++)for(const variant of ['bare','sword','hatchet']){
  const file=variant==='bare'?`reference-family-v2-${i}-body-skin.png`:variant==='sword'?`reference-family-v2-${i}-first-weapon-skin.png`:[0,2,5,7].includes(i)?`weapon-swap-completion-${i}-conservative-bounded-shared-skin-composite.png`:`reference-family-v2-${i}-existing-hatchet-skin.png`;
  const bytes=fs.readFileSync(path.join(out,file)),image=await decodePngBytes(bytes);if(image.w!==144||image.h!==144)throw new Error('Native review dimensions changed.');
  variants[variant].push(image);sourceFiles.push({frame:i,variant,file,sha256:sha(bytes),rgbaSha256:sha(image.data)});
}
const geometry=[],rawHatchets:Img[]=[];
for(let i=0;i<8;i++){
  const completionFrame=[0,2,5,7].includes(i),prefix=completionFrame?'weapon-swap-completion':'weapon-swap',layer=await decodePngBytes(fs.readFileSync(path.join(out,`${prefix}-${i}-conservative-bounded-shared-layer.png`))),rawLayer=await decodePngBytes(fs.readFileSync(path.join(out,`${prefix}-${i}-raw-candidate-layer.png`))),body=variants.bare[i];
  rawHatchets.push(recompose({base:body,layer:rawLayer}));
  let bodyOutside80=0,hatchetLayerOutside112=0,hatchetLayerTouching112Boundary=0,hatchetVisibleFootChanges=0,swordVisibleFootChanges=0,footPixels=0;
  for(let p=0;p<144*144;p++){
    const x=p%144,y=Math.floor(p/144),q=p*4;
    if(body.data[q+3]&&(x<32||x>=112||y<32||y>=112))bodyOutside80++;
    if(layer.data[q+3]){if(x<16||x>=128||y<16||y>=128)hatchetLayerOutside112++;if(x===16||x===127||y===16||y===127)hatchetLayerTouching112Boundary++;}
    if(y>=100&&body.data[q+3]){footPixels++;if(body.data.subarray(q,q+4).some((v,k)=>v!==variants.hatchet[i].data[q+k]))hatchetVisibleFootChanges++;if(body.data.subarray(q,q+4).some((v,k)=>v!==variants.sword[i].data[q+k]))swordVisibleFootChanges++;}
  }
  geometry.push({frame:i,bodyOutside80,hatchetLayerOutside112,hatchetLayerTouching112Boundary,visibleFootProxy:{definition:'Authored frozen-body opaque pixels at padded y>=100; pixel identity proxy only, not physical foot contact or continuous timing.',pixels:footPixels,hatchetChanges:hatchetVisibleFootChanges,swordChanges:swordVisibleFootChanges}});
}
fs.writeFileSync(path.join(out,'weapon-aware-full8-geometry-foot-audit.json'),JSON.stringify({version:1,bodyRecipeCanonicalHash:family.bodyRecipeCanonicalHash,nativeCanvas:144,authoredBodyCrop:{x:32,y:32,w:80,h:80,pivot:[40,75]},authoredHeldCrop:{x:16,y:16,w:112,h:112,pivot:[56,91]},commonPaddedPivot:[72,107],rows:geometry,scope:'Occupancy/pixel identity check on actual final conservative composites, not engine runtime export validation or foot planting certification.',qualified:false},null,2));
const artifactHashes:any[]=[];
async function writeGif(name:string,images:Img[]){const frames=images.map(image=>({image,ms:100})),bytes=await encodeShareMedia({frames,still:images[0],animated:true,grid:false,previewRows:1,omitted:[],mime:'image/gif',extension:'gif'},2);fs.writeFileSync(path.join(out,name),bytes);artifactHashes.push({file:name,sha256:sha(bytes)});}
for(const [variant,images]of Object.entries(variants))await writeGif(`weapon-aware-full8-${variant}-inspection-100ms.gif`,images);
await writeGif('weapon-aware-full8-hatchet-raw-candidate-inspection-100ms.gif',rawHatchets);
const rawComparison=await encodePngBytes(contactSheet([rawHatchets,variants.hatchet],2,2));fs.writeFileSync(path.join(out,'weapon-aware-full8-hatchet-raw-vs-conservative.png'),rawComparison);artifactHashes.push({file:'weapon-aware-full8-hatchet-raw-vs-conservative.png',sha256:sha(rawComparison)});
const combined=Array.from({length:8},(_,i)=>contactSheet([[variants.bare[i],variants.sword[i],variants.hatchet[i]]],1,0));
await writeGif('weapon-aware-full8-comparison-inspection-100ms.gif',combined);
const sheet=await encodePngBytes(contactSheet([variants.bare,variants.sword,variants.hatchet],2,2));fs.writeFileSync(path.join(out,'weapon-aware-full8-comparison.png'),sheet);artifactHashes.push({file:'weapon-aware-full8-comparison.png',sha256:sha(sheet)});
const report={version:1,sourceBodyRecipeCanonicalHash:family.bodyRecipeCanonicalHash,completionSwapPacketCanonicalHash:completion.packetCanonicalHash,originalSwapPacketCanonicalHash:original.packetCanonicalHash,frames:[0,1,2,3,4,5,6,7],nativeCell:144,scale:2,inspectionMillisecondsPerFrame:100,providerTiming:false,qualified:false,sourceFiles,artifactHashes,notes:['Full8 bare, confirmed-W-only first sword, and conservative S-matte hatchet share the authored-v2 body.','The first sword omits unresolved source U pixels; the hatchet excludes protected U and raw key. These inspection comparisons require independent anatomy/grip/action review and do not certify a preset.','GIF100ms timing is chosen for inspection, not inherited provider timing or a certified attack preset. Raw PNG and static contact sheets remain authoritative for exact pixels.']};
fs.writeFileSync(path.join(out,'weapon-aware-full8-inspection.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({frames:8,artifacts:artifactHashes,qualified:false,providerTiming:false}));
if(process.argv.includes('--axis-repair')){
  const actual=read('weapon-axis-repair-analysis.json');
  if(actual.packetCanonicalHash!=='dc4a43c87bc995d99390d7b3b3c8779e2c39997a4d6ea757c2122dbf0353f160'||actual.bodyRecipeCanonicalHash!==family.bodyRecipeCanonicalHash||JSON.stringify(actual.frames.map((f:any)=>f.frame))!=='[3,4]')throw new Error('The actual reviewed737 audit is required for a separate before/after inspection.');
  const afterRaw=[...rawHatchets],afterShared=[...variants.hatchet],repairSources=[];
  for(const i of [3,4])for(const [kind,destination]of [['raw',afterRaw],['shared',afterShared]]as const){
    const name=`weapon-axis-repair-${i}-${kind}-skin-composite.png`,bytes=fs.readFileSync(path.join(out,name)),image=await decodePngBytes(bytes);if(image.w!==144||image.h!==144)throw new Error('Native737 comparison geometry changed.');destination[i]=image;repairSources.push({frame:i,kind,file:name,sha256:sha(bytes),rgbaSha256:sha(image.data)});
  }
  const start=artifactHashes.length;
  await writeGif('weapon-axis-repair-full8-raw-after-inspection-100ms.gif',afterRaw);
  await writeGif('weapon-axis-repair-full8-shared-after-inspection-100ms.gif',afterShared);
  await writeGif('weapon-axis-repair-full8-before-after-inspection-100ms.gif',Array.from({length:8},(_,i)=>contactSheet([[rawHatchets[i],afterRaw[i],afterShared[i]]],1,0)));
  const comparison=await encodePngBytes(contactSheet([rawHatchets,afterRaw,afterShared],2,2)),comparisonName='weapon-axis-repair-full8-before-after.png';fs.writeFileSync(path.join(out,comparisonName),comparison);artifactHashes.push({file:comparisonName,sha256:sha(comparison)});
  fs.writeFileSync(path.join(out,'weapon-axis-repair-full8-inspection.json'),JSON.stringify({version:1,qualified:false,providerTiming:false,inspectionMillisecondsPerFrame:100,bodyRecipeCanonicalHash:family.bodyRecipeCanonicalHash,axisRepairPacketCanonicalHash:actual.packetCanonicalHash,axisRepairJobId:actual.jobId,axisRepairResultSha256:actual.resultSha256,baselineSourceFiles:sourceFiles,repairSources,artifacts:artifactHashes.slice(start),notes:['Baseline736 and all earlier artifacts remain separate and unchanged.','Only frames3/4 are substituted for inspection, without claiming the repair succeeded. Rows/animated columns: baseline raw candidate,737 raw candidate,737 shared accepted-matte variant.','Other frame candidates, unresolved pommel alternatives, hidden grips, physical perspective and provider timing remain unqualified.']},null,2));
  console.log(JSON.stringify({axisRepair:true,artifacts:artifactHashes.slice(start),qualified:false,providerTiming:false}));
}
