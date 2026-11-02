// Reuse reviewed native art through the editor renderer. No PixelLab transport or inferred anatomy.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {base64ToBytes,makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {renderAttachmentFrame,validateAttachment,type AttachmentDocument} from '../../../app/src/ui/motion-lab/attachment.ts';
import {cutGrid,recompose,contactSheet} from '../../../app/src/lib/items/items.ts';
import {chromaMask} from '../../../app/src/lib/image/chroma.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {zip,type ZipEntry} from '../../../app/src/lib/store/zip.ts';

const root=path.resolve(import.meta.dirname,'../../..'),prior=path.join(root,'spikes/api/out/clean-grip-2026-11-02'),out=path.join(root,'spikes/api/out/native-weapon-control-2026-11-02');
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex'),decode=(s:string)=>decodePngBytes(base64ToBytes(s)),png=(im:Img)=>encodePngBytes(im);
const packetBytes=fs.readFileSync(path.join(prior,'frame4-contact-alternative/clean-grip-probe.json')),p=JSON.parse(packetBytes.toString('utf8')),{canonicalHash,...unsigned}=p;
if(canonicalHash!=='516a48a77fea477e0c3bc7d39ba35bfad8d6ca78a9e169dfa70314ca60daba0c'||sha(stableStringify(unsigned))!==canonicalHash)throw new Error('Expected the exact reviewed clean-grip packet.');
const receiptBytes=fs.readFileSync(path.join(prior,'clean-grip-evidence.json')),receipt=JSON.parse(receiptBytes.toString('utf8')),resultBytes=base64ToBytes(receipt.images[0].png);
if(receipt.job?.state!=='done'||receipt.job.requestHash!=='a271a57fcf6c1f21fb6d000ff076b1a15f506012b5cb08f161eb20ced850448c'||sha(resultBytes)!=='5c61d8651a45ed46b4d9e4bb3ca8ec694f1677cdbe994653bce9727d1c20e819')throw new Error('Expected the retained failed738 result, without generating a replacement.');
const rawCells=cutGrid(await decodePngBytes(resultBytes),4,144,144,2),source=await decode(p.sourceAsset.png),entries:ZipEntry[]=[],rows=[],before:Img[]=[],after:Img[]=[],bodies:Img[]=[];
const doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:{jobId:'offline-clean-grip-control',hashes:p.frames.map((f:any)=>f.frozenSkin.sha256),cell:{w:144,h:144},pivot:{x:p.authoredExportContract.sharedPivotIn144[0],y:p.authoredExportContract.sharedPivotIn144[1]},direction:'east',padding:0},asset:{png:p.sourceAsset.png,grip:p.sourceAsset.sourceGrip,axis:{x:p.sourceAsset.sourceGrip.x+Math.cos(p.sourceAsset.sourceAxisRadians)*10,y:p.sourceAsset.sourceGrip.y+Math.sin(p.sourceAsset.sourceAxisRadians)*10}},frames:p.frames.map((f:any)=>({grip:f.grip,angle:f.targetAxisDegrees,occluder:f.frozenGreen.png,authoredPng:f.desiredLayer.png})),notes:'Two-pose offline authoring control. Explicit existing2D reference rotation and artist placement; not a full animation, new anatomy, physical perspective truth, foot-planting fix or qualified preset.'};
validateAttachment(doc,doc.body);fs.mkdirSync(out,{recursive:true});
for(const[i,f]of p.frames.entries()){
  const skin=await decode(f.frozenSkin.png),green=await decode(f.frozenGreen.png),expected=await decode(f.visibleDesiredLayer.png),bodyBefore=new Uint8ClampedArray(skin.data),rendered=await renderAttachmentFrame(source,doc.asset,doc.frames[i],skin);
  if(skin.data.some((v,k)=>v!==bodyBefore[k])||rendered.image.data.some((v,k)=>v!==expected.data[k]))throw new Error('Native authoring changed the frozen body or reviewed visible layer.');
  const oldLayer=makeImg(144,144),nonkey=chromaMask(rawCells[i],'green'),mask=await decode(f.editMask.png);
  for(let q=0;q<144*144;q++)if(mask.data[q*4]===255&&nonkey[q])oldLayer.data.set(rawCells[i].data.subarray(q*4,q*4+4),q*4);
  const composite=recompose({base:skin,layer:rendered.image}),oldComposite=recompose({base:skin,layer:oldLayer});let itemPixels=0,neutralPixels=0,bodyChanges=0;
  for(let q=0;q<144*144;q++){if(rendered.image.data[q*4+3]){itemPixels++;const rgb=rendered.image.data.subarray(q*4,q*4+3);if(Math.max(...rgb)-Math.min(...rgb)<=4)neutralPixels++;}if(skin.data[q*4+3]&&composite.data.subarray(q*4,q*4+4).some((v,k)=>v!==skin.data[q*4+k]))bodyChanges++;}
  if(bodyChanges)throw new Error('Authored occlusion did not preserve the body composite.');
  for(const[name,im]of [['body',skin],['layer',rendered.image],['preview',composite],['before',oldComposite]]as const){const data=await png(im);fs.writeFileSync(path.join(out,`${name}-${f.index}.png`),data);if(name!=='before')entries.push({name:`${name}/${i}.png`,data});}
  rows.push({sourceFrame:f.index,bodySha256:f.frozenSkin.sha256,layerRgbaSha256:sha(rendered.image.data),expectedLayerRgbaSha256:sha(expected.data),bodyCompositePixelChanges:bodyChanges,source:rendered.source,itemPixels,neutralPixels,hiddenPixels:rendered.hidden,clippedSourcePixels:rendered.clippedSourcePixels,qualified:false});before.push(oldComposite);after.push(composite);bodies.push(skin);
}
const report={version:1,paidRequests:0,paidUnits:0,sourcePacketCanonicalHash:canonicalHash,sourceReceiptSha256:sha(receiptBytes),failedResultSha256:sha(resultBytes),bodyRecipeCanonicalHash:p.sourceBodyRecipeCanonicalHash,sourceAssetSha256:p.sourceAsset.sha256,frames:rows,qualified:false,limits:['Only two authored poses, no complete animation or independent repeat','Unchanged bodies still carry their original anatomy/contact limitations','Source design is existing154-pixel art with previously declared omissions, transformed in the approved offline control','Frame-specific native art can correct perspective, but this example uses the prior explicitly authored rotation guide','Neutral-pixel count describes this known art, not a general axe-head classifier']};
entries.push({name:'authoring.json',data:new TextEncoder().encode(JSON.stringify(doc,null,2))},{name:'manifest.json',data:new TextEncoder().encode(JSON.stringify({...report,kind:'pixeldoll-native-weapon-control',cell:{w:144,h:144},pivot:doc.body.pivot,direction:'east',loop:false,frames:rows.map((r,i)=>({...r,index:i,ms:120,included:true}))},null,2))});
fs.writeFileSync(path.join(out,'native-weapon-control.zip'),await zip(entries));fs.writeFileSync(path.join(out,'native-weapon-control.json'),JSON.stringify(doc));fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'before-after.png'),await png(contactSheet([before,after],3,2)));
console.log(JSON.stringify(report));
