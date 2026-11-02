// Explicit native grip authoring on retained bodies. No request, automatic anatomy inference or acceptance.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {rigidAttachment,occludeAttachment,renderAttachmentFrame,validateAttachment,type AttachmentDocument} from '../../../app/src/ui/motion-lab/attachment.ts';
import {recompose,contactSheet} from '../../../app/src/lib/items/items.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {zip,unzip,type ZipEntry} from '../../../app/src/lib/store/zip.ts';

const root=path.resolve(import.meta.dirname,'../../..'),prior=path.join(root,'spikes/api/out/clean-grip-2026-11-02/frame4-contact-alternative'),out=path.join(root,'spikes/api/out/gripped-axe-2026-11-02');
const p=JSON.parse(fs.readFileSync(path.join(prior,'clean-grip-probe.json'),'utf8')),{canonicalHash,...unsigned}=p,sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
if(canonicalHash!=='516a48a77fea477e0c3bc7d39ba35bfad8d6ca78a9e169dfa70314ca60daba0c'||sha(stableStringify(unsigned))!==canonicalHash)throw new Error('Reviewed source packet changed.');
const decode=(s:string)=>decodePngBytes(Buffer.from(s,'base64')),source=await decode(p.sourceAsset.png),sourceAngle=p.sourceAsset.sourceAxisRadians;
// The previous point was at the end of the handle, not its grasped section. These are authored palm centers.
const anchorDepth=6,sourceGrip={x:p.sourceAsset.sourceGrip.x+Math.cos(sourceAngle)*anchorDepth,y:p.sourceAsset.sourceGrip.y+Math.sin(sourceAngle)*anchorDepth};
const centers=new Map([[3,{x:90.5,y:75.5}],[4,{x:88.5,y:84.5}]]),before:Img[]=[],after:Img[]=[],rois:Img[][]=[],rows=[];
fs.mkdirSync(out,{recursive:true});
function crop(im:Img,x:number,y:number,w:number,h:number){const result=makeImg(w,h);for(let Y=0;Y<h;Y++)result.data.set(im.data.subarray(((Y+y)*im.w+x)*4,((Y+y)*im.w+x+w)*4),Y*w*4);return result;}
for(const f of p.frames){
  const body=await decode(f.frozenSkin.png),old=await decode(f.visibleDesiredLayer.png),target=centers.get(f.index)!;
  const placed=rigidAttachment(source,sourceGrip,target,f.targetAxisRadians-sourceAngle,body),hidden=occludeAttachment(placed.image,body,body),composite=recompose({base:body,layer:hidden.image}),oldComposite=recompose({base:body,layer:old});
  let headPixels=0,placedHeadPixels=0;for(let q=0;q<144*144;q++){if(hidden.image.data[q*4+3]){const rgb=hidden.image.data.subarray(q*4,q*4+3);if(Math.max(...rgb)-Math.min(...rgb)<=4)headPixels++;}if(placed.image.data[q*4+3]){const rgb=placed.image.data.subarray(q*4,q*4+3);if(Math.max(...rgb)-Math.min(...rgb)<=4)placedHeadPixels++;}}
  for(const[name,im]of [['body',body],['layer',hidden.image],['composite',composite]]as const)fs.writeFileSync(path.join(out,`${name}-${f.index}.png`),await encodePngBytes(im));
  before.push(oldComposite);after.push(composite);rois.push([crop(body,78,50,50,48),crop(oldComposite,78,50,50,48),crop(composite,78,50,50,48)]);
  rows.push({frame:f.index,oldEndAnchor:p.sourceAsset.sourceGrip,authoredShaftAnchor:sourceGrip,anchorDepthPx:anchorDepth,oldTarget:f.grip,authoredPalmCenter:target,hiddenItemPixels:hidden.hidden,placedNeutralPixels:placedHeadPixels,visibleNeutralPixels:headPixels,clippedSourcePixels:placed.clippedSourcePixels,qualified:false});
}
fs.writeFileSync(path.join(out,'before-after.png'),await encodePngBytes(contactSheet([before,after],3,2)));fs.writeFileSync(path.join(out,'grip-rois.png'),await encodePngBytes(contactSheet(rois,8,2)));fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify({sourcePacketCanonicalHash:canonicalHash,paidRequests:0,sourcePixelsEdited:0,bodyPixelsEdited:0,frames:rows,qualified:false},null,2));console.log(JSON.stringify(rows));
const original=path.join(root,'spikes/api/out/weapon-aware-2026-11-02'),calibrationBytes=fs.readFileSync(path.join(original,'weapon-family-calibration.json')),calibration=JSON.parse(calibrationBytes.toString('utf8')),handViews:Img[]=[];
if(sha(calibrationBytes)!==p.sourceCalibrationSha256)throw new Error('Original calibration measurements changed.');
for(const m of calibration.frames){const body=await decodePngBytes(fs.readFileSync(path.join(original,`reference-family-v2-${m.frame}-body-skin.png`)));handViews.push(crop(body,m.grip.x-16,m.grip.y-16,32,32));}
fs.writeFileSync(path.join(out,'all-body-hands.png'),await encodePngBytes(contactSheet([handViews.slice(0,4),handViews.slice(4)],8,2)));
const palmCenters=[{x:73.5,y:84.5},{x:67.5,y:42.5},{x:67.5,y:42.5},centers.get(3)!,centers.get(4)!,{x:93.5,y:83.5},{x:75.5,y:85.5},{x:73.5,y:84.5}],full:Img[]=[],oldFull:Img[]=[],feet:Img[]=[],fullRows=[];
const durations=[120,120,80,80,80,120,100,220],bodyAudit=JSON.parse(fs.readFileSync(path.join(original,'independent-body-family-v2-audit.json'),'utf8'));
const footRows=[];
const entries:ZipEntry[]=[],frontToe={x:76.5,y:106.5},attachment:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:{jobId:'offline-gripped-axe-east',hashes:[],cell:{w:144,h:144},pivot:{x:72,y:107},direction:'east',padding:0},asset:{png:p.sourceAsset.png,grip:sourceGrip,axis:{x:sourceGrip.x+10*Math.cos(sourceAngle),y:sourceGrip.y+10*Math.sin(sourceAngle)}},frames:[],notes:'Explicit one-body/east attachment authoring. Source grip is inside the shaft; target points are palm centers. No generated anatomy. The fixed-root visible front toe is sampled separately; no universal rig or professional preset qualification.'};
if(bodyAudit.bodyRecipeCanonicalHash!==p.sourceBodyRecipeCanonicalHash)throw new Error('Full clip body ancestry differs.');
for(const m of calibration.frames){
  const index=m.frame,bodyBytes=fs.readFileSync(path.join(original,`reference-family-v2-${index}-body-skin.png`)),body=await decodePngBytes(bodyBytes);
  if(sha(body.data)!==bodyAudit.frames.find((f:any)=>f.frame===index)?.authoredSkinRgbaSha256)throw new Error('Frozen body changed.');
  footRows.push({frame:index,rows:Array.from({length:8},(_,i)=>i+100).map(y=>({y,opaque:Array.from({length:32},(_,j)=>j+56).filter(x=>body.data[(y*144+x)*4+3]>0)}))});
  const target=palmCenters[index],placed=rigidAttachment(source,sourceGrip,target,m.hatchet.projected.directedWeaponAxisDegrees*Math.PI/180-sourceAngle,body),hidden=occludeAttachment(placed.image,body,body),composite=recompose({base:body,layer:hidden.image});
  const beforeFile=[0,2,5,7].includes(index)?`weapon-swap-completion-${index}-conservative-bounded-shared-skin-composite.png`:`reference-family-v2-${index}-existing-hatchet-skin.png`,oldImage=await decodePngBytes(fs.readFileSync(path.join(original,beforeFile)));
  let bodyChanges=0;for(let q=0;q<144*144;q++)if(body.data[q*4+3]&&body.data.subarray(q*4,q*4+4).some((v,k)=>v!==composite.data[q*4+k]))bodyChanges++;
  if(bodyChanges||placed.clippedSourcePixels)throw new Error('Full clip changes body pixels or clips the source.');
  const toeOffset=(Math.floor(frontToe.y)*144+Math.floor(frontToe.x))*4;if(!body.data[toeOffset+3])throw new Error('Authored visible toe mark is not on the frozen body.');
  attachment.body.hashes.push(sha(bodyBytes));attachment.frames.push({grip:target,angle:m.hatchet.projected.directedWeaponAxisDegrees,occluder:bodyBytes.toString('base64')});
  const uiRendered=await renderAttachmentFrame(source,attachment.asset,attachment.frames.at(-1)!,body);if(uiRendered.image.data.some((v,q)=>v!==hidden.image.data[q]))throw new Error('Shared editor renderer differs from offline placement.');
  entries.push({name:`body/${index}.png`,data:bodyBytes},{name:`layers/${index}.png`,data:await encodePngBytes(hidden.image)},{name:`preview/${index}.png`,data:await encodePngBytes(composite)});
  full.push(composite);oldFull.push(oldImage);feet.push(crop(body,56,94,32,18));
  for(const[name,im]of [['full-body',body],['full-layer',hidden.image],['full-composite',composite],['full-before',oldImage]]as const)fs.writeFileSync(path.join(out,`${name}-${index}.png`),await encodePngBytes(im));
  fullRows.push({frame:index,authoredPalmCenter:target,authoredAngleDegrees:m.hatchet.projected.directedWeaponAxisDegrees,hiddenItemPixels:hidden.hidden,bodyPixelChanges:bodyChanges,clippedSourcePixels:placed.clippedSourcePixels,sourceBodySha256:sha(bodyBytes),sourceMode:'single-native-asset-with-authored-track',durationMs:durations[index],visibleFrontToe:{...frontToe,opaque:true},root:{x:0,y:0},qualified:false});
}
fs.writeFileSync(path.join(out,'full-before-after.png'),await encodePngBytes(contactSheet([oldFull,full],3,2)));
fs.writeFileSync(path.join(out,'full-contact-sheet.png'),await encodePngBytes(contactSheet([full.slice(0,4),full.slice(4)],3,2)));
fs.writeFileSync(path.join(out,'feet-inspection.png'),await encodePngBytes(contactSheet([feet.slice(0,4),feet.slice(4)],10,2)));
fs.writeFileSync(path.join(out,'foot-pixels.json'),JSON.stringify(footRows,null,2));
const report={version:1,kind:'pixeldoll-gripped-axe-inspection',sourcePacketCanonicalHash:canonicalHash,bodyRecipeCanonicalHash:p.sourceBodyRecipeCanonicalHash,sourceGrip,anchorDepthPx:anchorDepth,sourceAssetSha256:p.sourceAsset.sha256,cell:{w:144,h:144},pivot:{x:72,y:107},direction:'east',frames:fullRows,loop:false,providerTiming:false,paidRequests:0,qualified:false,visibleToeReview:{landmark:'Artist-picked outer front-toe sole pixel',markedFrames:8,screenSpanPx:0,root:'Fixed at0,0 for the whole clip',scope:'One visible pixel landmark on this exact fixed-root clip, not heel/sole orientation, the hidden rear foot, weight transfer or an engine moving the character.'},notes:['All eight item layers come from one source asset, not selected AI successes.','Palm centers and directions are explicit2D authoring choices. The source hand anchor is6pixels into the shaft.','The frozen body is unchanged. Hidden finger anatomy, native perspective and general foot planting are not certified by this attachment test.','Timing is manually chosen for inspection and must be reviewed with actual playback.']};
validateAttachment(attachment,attachment.body);entries.push({name:'manifest.json',data:new TextEncoder().encode(JSON.stringify(report,null,2))},{name:'authoring.json',data:new TextEncoder().encode(JSON.stringify(attachment))});
fs.writeFileSync(path.join(out,'gripped-axe-east.zip'),await zip(entries));fs.writeFileSync(path.join(out,'full-inspection.json'),JSON.stringify(report,null,2));
const archive=fs.readFileSync(path.join(out,'gripped-axe-east.zip')),roundtrip=await unzip(archive);if(roundtrip.size!==entries.length||entries.some(e=>!roundtrip.get(e.name)||sha(roundtrip.get(e.name)!)!==sha(e.data)))throw new Error('Native ZIP roundtrip changed an exported entry.');
fs.writeFileSync(path.join(out,'export-audit.json'),JSON.stringify({zipSha256:sha(archive),entries:entries.length,exactEntryRoundtrip:true,sharedRendererParityFrames:8,qualified:false},null,2));
