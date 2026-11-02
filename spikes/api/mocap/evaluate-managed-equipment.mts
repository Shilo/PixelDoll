// Offline inspection of one managed frozen-frame equipment diagnostic. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {cutGrid,extractCell,recompose,padImg,bandOf,contactSheet} from '../../../app/src/lib/items/items.ts';
import {chromaMask,components,keyScore,KT,toChroma} from '../../../app/src/lib/image/chroma.ts';
import {bodyComponents,borderPx} from '../../../app/src/lib/rig/clips.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const file='managed-equipment-evidence.json',bytes=fs.readFileSync(path.join(out,file)),e=JSON.parse(bytes.toString('utf8')),packet=e.probe?.packet;
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const decode=(value:string)=>decodePngBytes(Buffer.from(value,'base64'));
const different=(a:Img,b:Img,p:number)=>a.data.subarray(p*4,p*4+4).some((v,i)=>v!==b.data[p*4+i]);
function checkSize(image:Img,w:number,h:number){if(image.w!==w||image.h!==h)throw new Error(`Unexpected image size ${image.w}x${image.h}; expected ${w}x${h}.`);}
const write=async(name:string,image:Img)=>fs.writeFileSync(path.join(out,name+'.png'),await encodePngBytes(image));
if(packet?.kind!=='managed-equipment-probe'||packet.version!==1||packet.cell!==144||packet.cols!==3||packet.direction!=='east'||JSON.stringify(packet.indices)!=='[1,3,4,6]'||e.job?.state!=='done'||e.images?.length!==1)throw new Error('The expected completed bounded probe is missing.');
const input=await decode(packet.request.inpainting_image.image.base64),mask=await decode(packet.request.mask_image.image.base64),resultBytes=Buffer.from(e.images[0].png,'base64');
if(hash(resultBytes)!==e.images[0].sha)throw new Error('Exported result hash changed.');
const output=await decodePngBytes(resultBytes);
for(const image of [input,mask,output])checkSize(image,432,288);
const disk=fs.readFileSync(path.join(out,'managed-equipment-result.png'));
const diskImage=await decodePngBytes(disk);checkSize(diskImage,432,288);
if(diskImage.data.some((v,i)=>v!==output.data[i]))throw new Error('Standalone result pixels differ from retained receipt.');
let blackPixels=0,changedBlackPixels=0,visibleChangedBlackPixels=0,whitePixels=0,changedWhitePixels=0;
for(let p=0;p<input.w*input.h;p++){
  const m=mask.data.subarray(p*4,p*4+4);
  if(m[3]!==255||![0,255].includes(m[0])||m[1]!==m[0]||m[2]!==m[0])throw new Error('Mask has an unexpected nonbinary or transparent pixel.');
  if(m[0]===0){blackPixels++;if(different(input,output,p)){changedBlackPixels++;if(input.data[p*4+3]||output.data[p*4+3])visibleChangedBlackPixels++;}}
  else{whitePixels++;if(different(input,output,p))changedWhitePixels++;}
}
const inputs=cutGrid(input,6,144,144,3),outputs=cutGrid(output,6,144,144,3),masks=cutGrid(mask,6,144,144,3);
const refs=[];
for(const [i,ref]of packet.references.entries()){
  const refBytes=Buffer.from(ref.png,'base64');if(hash(refBytes)!==ref.sha256)throw new Error('Reference PNG hash changed.');
  const source=padImg(await decodePngBytes(refBytes),16);checkSize(source,144,144);
  let inputChangedPixels=0,changedPixels=0,unprotectedPixels=0;
  for(let p=0;p<144*144;p++){if(different(source,inputs[i+4],p))inputChangedPixels++;if(different(inputs[i+4],outputs[i+4],p))changedPixels++;if(masks[i+4].data[p*4])unprotectedPixels++;}
  if(inputChangedPixels||unprotectedPixels)throw new Error('Reference source pixels or protection differ from the prepared contract.');
  refs.push({direction:ref.direction,sha256:ref.sha256,inputChangedPixels,changedPixels,unprotectedPixels});
}
const bodies:Img[]=[],rawOutputs:Img[]=[],rawLayers:Img[]=[],layers:Img[]=[],composites:Img[]=[],rows=[];
for(const [i,frame]of packet.frames.entries()){
  const sourceBytes=Buffer.from(frame.png,'base64');if(hash(sourceBytes)!==frame.sha256)throw new Error('A native frozen body PNG changed.');
  const source=await decodePngBytes(sourceBytes);checkSize(source,112,112);const body=padImg(source,16),cell=outputs[i],cellMask=masks[i],inputCell=inputs[i],plan=packet.maskPlan.find((p:any)=>p.index===frame.index);
  let sourcePixelChanges=0,inputChromaChanges=0,whiteBodyPixels=0,changedWhiteBodyPixels=0,changedBlackBodyPixels=0,changedBodyAlphaPixels=0,erasedOriginalBodyPixels=0,newOpaqueOutsideBodyPixels=0,newNonKeyOverBodyPixels=0,newNonKeyOutsideMaskPixels=0,bodyCoveredByLayerPixels=0,bodyCoveredOutsideMaskPixels=0;
  const expectedInput=toChroma(body,'green');
  const newKeyOutsideBody:{x:number;y:number;distanceFromObservedGrip:number}[]=[],brownItemCandidates:{x:number;y:number;distanceFromObservedGrip:number}[]=[];
  const nonkey=chromaMask(cell,'green'),rawLayer=makeImg(144,144);
  for(let p=0;p<144*144;p++){
    const bodyOpaque=body.data[p*4+3]>0,white=cellMask.data[p*4]===255,changed=different(inputCell,cell,p);
    if(different(expectedInput,inputCell,p))inputChromaChanges++;
    const x=p%144,y=Math.floor(p/144),nx=x-16,ny=y-16,distanceFromObservedGrip=Math.hypot(nx+0.5-plan.grip.x,ny+0.5-plan.grip.y),rgba=cell.data.subarray(p*4,p*4+4);
    if(!bodyOpaque&&rgba[3]>=128&&keyScore('green',rgba[0],rgba[1],rgba[2])>=KT)newKeyOutsideBody.push({x:nx,y:ny,distanceFromObservedGrip});
    if(!bodyOpaque&&rgba[3]>=128)newOpaqueOutsideBodyPixels++;
    if(nonkey[p]&&changed){rawLayer.data.set(rgba,p*4);if(bodyOpaque)newNonKeyOverBodyPixels++;if(!white)newNonKeyOutsideMaskPixels++;if(rgba[0]>=40&&rgba[0]>=rgba[1]*1.15&&rgba[1]>=rgba[2]*1.15)brownItemCandidates.push({x:nx,y:ny,distanceFromObservedGrip});}
    if(bodyOpaque){if(white){whiteBodyPixels++;if(changed)changedWhiteBodyPixels++;}else if(changed)changedBlackBodyPixels++;if(body.data[p*4+3]!==cell.data[p*4+3])changedBodyAlphaPixels++;if(body.data[p*4+3]>=128&&cell.data[p*4+3]<128)erasedOriginalBodyPixels++;}
    if(x>=16&&x<128&&y>=16&&y<128){const native=((y-16)*112+x-16)*4;if(body.data.subarray(p*4,p*4+4).some((v,j)=>v!==source.data[native+j]))sourcePixelChanges++;}
  }
  // Shared production extraction is retained as a separately labeled view. posed:false prevents auto-alignment.
  // Its key-outline handling/despill is not hidden: the raw changed-nonkey layer and metrics are preserved too.
  const extracted=extractCell({key:`managed-probe/east/${frame.index}`,call:0,base:body,out:cell,route:'green',band:bandOf('main_hand',undefined,144),posed:false,held:true,pad:16}),composite=recompose(extracted),rawComposite=recompose({base:body,layer:rawLayer});
  let rawLayerPixels=0,sharedLayerPixels=0,sharedLayerDifferences=0,sharedLayerOutsideMaskPixels=0;
  for(let p=0;p<144*144;p++){
    if(rawLayer.data[p*4+3])rawLayerPixels++;
    if(extracted.layer.data[p*4+3]){sharedLayerPixels++;if(cellMask.data[p*4]!==255)sharedLayerOutsideMaskPixels++;if(body.data[p*4+3]){bodyCoveredByLayerPixels++;if(cellMask.data[p*4]!==255)bodyCoveredOutsideMaskPixels++;}}
    if(different(rawLayer,extracted.layer,p))sharedLayerDifferences++;
  }
  const rawComponentSizes=components(new Uint8Array(Array.from({length:144*144},(_,p)=>rawLayer.data[p*4+3]?1:0)),144,144).map(c=>c.length).sort((a,b)=>b-a);
  if(whiteBodyPixels!==plan.whiteBodyPixels||sourcePixelChanges||inputChromaChanges)throw new Error('Frozen source, chroma input or editable-body accounting differs from preparation.');
  const bbox=(points:{x:number;y:number}[])=>points.length?{xMin:Math.min(...points.map(p=>p.x)),xMax:Math.max(...points.map(p=>p.x)),yMin:Math.min(...points.map(p=>p.y)),yMax:Math.max(...points.map(p=>p.y))}:null;
  rows.push({frame:frame.index,bodySha256:frame.sha256,nativeRgbaSha256:hash(Buffer.from(source.data)),sourcePixelChanges,inputChromaChanges,grip:plan.observedGrip,visibility:plan.visibility,whiteBodyPixels,changedWhiteBodyPixels,changedBlackBodyPixels,changedBodyAlphaPixels,erasedOriginalBodyPixels,newOpaqueOutsideBodyPixels,newNonKeyOverBodyPixels,newNonKeyOutsideMaskPixels,newKeyOutsideBody:{pixels:newKeyOutsideBody.length,bounds:bbox(newKeyOutsideBody),nearestObservedGripDistance:newKeyOutsideBody.length?Math.min(...newKeyOutsideBody.map(p=>p.distanceFromObservedGrip)):null,coordinates:newKeyOutsideBody},brownItemColorCandidates:{pixels:brownItemCandidates.length,bounds:bbox(brownItemCandidates),nearestObservedGripDistance:brownItemCandidates.length?Math.min(...brownItemCandidates.map(p=>p.distanceFromObservedGrip)):null,note:'Color-based brown handle/pommel candidates, not automatically identified hilt or grip geometry.',coordinates:brownItemCandidates},rawLayerPixels,rawComponentSizes,rawLayerBorderPixels:borderPx(rawLayer),sharedLayerPixels,sharedLayerDifferences,sharedLayerOutsideMaskPixels,bodyCoveredByLayerPixels,bodyCoveredOutsideMaskPixels,sharedLayerBorderPixels:borderPx(extracted.layer),sharedLayerConnectivity:bodyComponents(extracted.layer),sharedExtraction:{keyKept:extracted.keyKept,keyOutside:extracted.keyOutside,offset:extracted.offset,shiftedDiagnostic:extracted.shifted},qualified:false});
  bodies.push(body);rawOutputs.push(cell);rawLayers.push(rawLayer);layers.push(extracted.layer);composites.push(composite);
  const stem=`managed-equipment-${frame.index}`;
  for(const[name,image]of [['body',body],['output',cell],['raw-layer',rawLayer],['layer',extracted.layer],['composite',composite],['raw-composite',rawComposite]]as const)await write(stem+'-'+name,image);
}
await write('managed-equipment-comparison',contactSheet([bodies,rawOutputs,rawLayers,layers,composites],3,2));
const crop={x:32,y:16,w:48,h:40};
const cropImage=(image:Img)=>{const clipped=makeImg(crop.w,crop.h);for(let y=0;y<crop.h;y++){const start=((y+crop.y+16)*144+crop.x+16)*4;clipped.data.set(image.data.subarray(start,start+crop.w*4),y*crop.w*4);}return clipped;};
const gripCrops=[cropImage(bodies[0]),cropImage(rawOutputs[0]),cropImage(composites[0])];
await write('managed-equipment-frame1-grip-comparison',contactSheet([gripCrops],8,1));
const reviewPath=path.join(root,'app/test-results-managed-equipment-evaluation');fs.mkdirSync(reviewPath,{recursive:true});
const gripViews=await Promise.all(gripCrops.map(async(image,i)=>({name:['Frozen original body','Raw provider chroma output','Shared layer over frozen body'][i],png:Buffer.from(await encodePngBytes(image)).toString('base64')})));
fs.writeFileSync(path.join(reviewPath,'index.html'),`<!doctype html><meta charset="utf-8"><title>Frozen weapon grip audit</title><style>body{background:#18181c;color:#eee;font:16px system-ui;margin:24px}.views{display:flex;flex-wrap:wrap;gap:20px}canvas{width:384px;height:320px;image-rendering:pixelated;background:repeating-conic-gradient(#555 0 25%,#666 0 50%) 0/32px 32px}p{max-width:1100px}</style><h1>Frame1: frozen-hand versus generated-hand audit</h1><p>Source crop: native x32–79, y16–55. Red cross marks the original approximate grip(44,36), uncertainty plus/minus2pixels. It is an annotation, not a changed source pixel. Pointer coordinates use the original112px frame. Do not treat the brown-color distance as automatic hilt recognition.</p><p>31 new key-colored pixels appear outside the frozen body, bounds x43–53,y24–33. Black-mask pixels are unchanged, yet removing the generated green anatomy may leave the weapon detached from the frozen original hand.</p><div class="views"></div><script>const views=${JSON.stringify(gripViews)};for(const v of views){const a=document.createElement('article');a.innerHTML='<h2>'+v.name+'</h2>';const c=document.createElement('canvas');c.width=48;c.height=40;const label=document.createElement('p');label.textContent='Pointer nativecoordinate';a.append(c,label);document.querySelector('.views').append(a);const ctx=c.getContext('2d'),im=new Image();im.src='data:image/png;base64,'+v.png;im.onload=()=>{ctx.drawImage(im,0,0);ctx.strokeStyle='red';ctx.lineWidth=.25;ctx.beginPath();ctx.moveTo(44-32-2,36-16+.5);ctx.lineTo(44-32+3,36-16+.5);ctx.moveTo(44-32+.5,36-16-2);ctx.lineTo(44-32+.5,36-16+3);ctx.stroke()};c.onmousemove=e=>{const r=c.getBoundingClientRect();label.textContent='Native '+(32+Math.floor((e.clientX-r.left)*48/r.width))+','+(16+Math.floor((e.clientY-r.top)*40/r.height))}};</script>`);
const report={version:1,jobId:e.job.id,requestHash:e.job.requestHash,gens:e.job.gens,evidenceSha256:hash(bytes),resultSha256:hash(resultBytes),standalonePngSha256:hash(disk),standalonePixelsIdentical:true,grid:[432,288],blackPixels,changedBlackPixels,visibleChangedBlackPixels,whitePixels,changedWhitePixels,references:refs,frames:rows,qualified:false,notes:['Rows in comparison: frozen body, raw provider chroma output, raw changed-nonkey layer, shared chroma extraction, shared layer over frozen body.','Raw changed-nonkey pixels are a diagnostic, not an accepted item segmentation. Black outlines and dark shading require visual interpretation.','Shared extraction uses existing outline handling, component threshold and despill. No additional cleanup, clipping or per-frame alignment was applied. Raw output/layers remain available.','White-body changes can be intentional weapon coverage or anatomy repaint. Non-key body coverage is a spill risk requiring visual review, not an automatic defect count.','All source body pixels remain immutable in the base. Compositing can still cover them with wrong weapon or spill pixels.','The mask protects head and feet but can bias weapon angle, occlusion and length. Frame6 grip is inferred and must not count as measured visible-grip evidence.','Grip/finger overlap, blade perspective, consistent item design and timing are not qualified by numeric preservation alone.']};
fs.writeFileSync(path.join(out,'managed-equipment-analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
