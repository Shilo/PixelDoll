// Offline second-prop audit. The selected actual or authored body family and palette stay frozen.
// No paid calls, provider-body adoption, pixel cleanup, per-frame alignment or unknown-rim repair.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {cutGrid,extractCell,recompose,contactSheet,bandOf,paletteDistance,axisOf} from '../../../app/src/lib/items/items.ts';
import {chromaMask,keyScore,KT,newKeyPixels,components} from '../../../app/src/lib/image/chroma.ts';
import {indexImg,applyIndex} from '../../../app/src/lib/dress/palette.ts';
import {borderPx} from '../../../app/src/lib/rig/clips.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const completion=process.argv.includes('--completion'),stemPrefix=completion?'weapon-swap-completion':'weapon-swap',disarmPrefix=completion?'managed-disarm-completion':'managed-disarm';
const bytes=fs.readFileSync(path.join(out,completion?'swap-completion-evidence.json':'swap-evidence.json')),e=JSON.parse(bytes.toString('utf8')),packet=e.probe?.packet;
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const decode=(p:string)=>decodePngBytes(Buffer.from(p,'base64'));
const rgbaDiff=(a:Img,b:Img,p:number)=>a.data.subarray(p*4,p*4+4).some((v,i)=>v!==b.data[p*4+i]);
const rgb=(im:Img,p:number)=>(im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2];
const write=async(name:string,im:Img)=>fs.writeFileSync(path.join(out,name+'.png'),await encodePngBytes(im));
function same(a:Img,b:Img,label:string){if(a.w!==b.w||a.h!==b.h||a.data.some((v,i)=>v!==b.data[i]))throw new Error(label+' differs.');}
if(packet?.kind!=='weapon-aware-swap'||packet.version!==1||packet.cell!==144||packet.cols!==(completion?3:2)||e.job?.state!=='done'||e.images?.length!==1)throw new Error('Completed controlled swap evidence is missing.');
const {canonicalHash,...unsigned}=packet;if(sha(stableStringify(unsigned))!==canonicalHash||(!completion&&canonicalHash!=='287f215152db5ea978fd4319b1c3025344a9046a6c28b665f7e44402d261a56b'))throw new Error('The source-bound swap packet changed.');
if(JSON.stringify(packet.indices)!==JSON.stringify(completion?[0,2,5,7]:[1,3,4,6]))throw new Error('Swap indices differ from the selected profile.');
const authoredV2=completion&&packet.bodySource==='authored-reference-family-v2';
if(completion&&(!authoredV2||packet.profile!=='east-completion-body-star-v2-0-2-5-7'||packet.request.seed!==736||packet.sourceArmedPacketCanonicalHash!=='d7bb854ba6c6eb013e2541e6b3bc830ed50741f16aa7760cd41fdf26f8d5fbcd'||canonicalHash!=='8fb5ba7f0464f71ebb622d704490d4b223eea09bdc43d1c2ee24ddda310ba9ce'))throw new Error('Completion swap is not bound to the reviewed authored-v2 family, completion source and seed736.');
let familyAudit:any,familyAuditBytes:Buffer|undefined;
if(authoredV2){const {canonicalHash:recipeHash,...recipeUnsigned}=packet.bodyRecipe;if(sha(stableStringify(recipeUnsigned))!==recipeHash||recipeHash!==packet.sourceBodyRecipeCanonicalHash||recipeHash!=='4458544f88245b1a96db2c1781f857a2f306271014009574bf0ac11de5fb8fd8')throw new Error('Authored completion body recipe changed.');if(JSON.stringify(packet.heldWindow)!=='{"x":16,"y":16,"w":112,"h":112}')throw new Error('Authored held112 export window changed.');familyAuditBytes=fs.readFileSync(path.join(out,'independent-body-family-v2-audit.json'));familyAudit=JSON.parse(familyAuditBytes.toString('utf8'));if(familyAudit.bodyRecipeCanonicalHash!==recipeHash)throw new Error('Authored body skin audit belongs to a different body recipe.');}
const priorBytes=fs.readFileSync(path.join(out,completion?'disarm-completion-evidence.json':'disarm-evidence.json'));if(sha(priorBytes)!==packet.sourceDisarmEvidenceSha256)throw new Error('Frozen disarm evidence changed.');
const prior=JSON.parse(priorBytes.toString('utf8')),priorGridBytes=Buffer.from(prior.images[0].png,'base64');
if(prior.job.id!==packet.sourceDisarmJobId||prior.probe.callId!==packet.sourceDisarmCallId||prior.probe.packet.canonicalHash!==packet.sourceArmedPacketCanonicalHash||sha(priorGridBytes)!==packet.sourceDisarmResultSha)throw new Error('Swap is not bound to the approved actual disarm result.');
const actualFrozen=cutGrid(await decodePngBytes(priorGridBytes),4,144,144,2),frozen=authoredV2?await Promise.all(packet.frames.map(async(f:any)=>{const r=packet.bodyRecipe.frames.find((r:any)=>r.index===f.index);if(!r||r.sha256!==f.authoredBodyRecipeFrameSha256||r.sha256!==f.frozenBase.sha256||r.actualProviderJobId!==prior.job.id)throw new Error('Authored frozen frame is not bound to its actual disarm ancestor.');return decode(r.png);})):actualFrozen,resultBytes=Buffer.from(e.images[0].png,'base64');if(sha(resultBytes)!==e.images[0].sha)throw new Error('Swap provider result hash changed.');
const result=await decodePngBytes(resultBytes),input=await decode(packet.request.inpainting_image.image.base64),maskGrid=await decode(packet.request.mask_image.image.base64);
if([result,input,maskGrid].some(im=>im.w!==(completion?432:288)||im.h!==288))throw new Error('Swap grid geometry changed.');
if(sha(Buffer.from(packet.request.inpainting_image.image.base64,'base64'))!==packet.gridSha256||sha(Buffer.from(packet.request.mask_image.image.base64,'base64'))!==packet.maskSha256)throw new Error('Submitted source/mask hash changed.');
same(result,await decodePngBytes(fs.readFileSync(path.join(out,completion?'swap-completion-output.png':'swap-output.png'))),'Standalone swap output');
const allInputs=cutGrid(input,completion?6:4,144,144,packet.cols),allOutputs=cutGrid(result,completion?6:4,144,144,packet.cols),allEdits=cutGrid(maskGrid,completion?6:4,144,144,packet.cols),inputs=allInputs.slice(0,4),outputs=allOutputs.slice(0,4),edits=allEdits.slice(0,4),referenceRetention=[];
if(completion){
  const designBytes=fs.readFileSync(path.join(out,'swap-evidence.json')),design=JSON.parse(designBytes.toString('utf8')),designResult=Buffer.from(design.images[0].png,'base64'),d=packet.designSource;
  if(!d||design.job.id!=='ae4b858b-96a9-45dc-b412-7ca2f62b5200'||design.job.id!==d.jobId||design.job.requestHash!==d.requestHash||sha(designBytes)!==d.evidenceSha256||sha(designResult)!=='500468fcc84f4cc5f0dbc266480d677bea3da559aa895785bca81bff02edc146'||sha(designResult)!==d.resultSha256||design.probe.packet.canonicalHash!==d.sourcePacketCanonicalHash||packet.references?.length!==2)throw new Error('Actual hatchet design reference evidence changed.');
  const designCells=cutGrid(await decodePngBytes(designResult),4,144,144,2);
  for(const [i,r]of packet.references.entries()){
    if(r.sourceCell!==[0,3][i]||r.index!==[1,6][i]||r.gridCell!==4+i||sha(Buffer.from(r.png,'base64'))!==r.sha256)throw new Error('Design reference order or PNG hash changed.');
    const original=designCells[r.sourceCell];same(original,await decode(r.png),'Actual raw733 reference');same(original,allInputs[r.gridCell],'Packed raw733 reference');
    if(sha(Buffer.from(original.data))!==r.rgbaSha256||allEdits[r.gridCell].data.some((v:number,p:number)=>p%4!==3&&v!==0))throw new Error('Reference RGBA or protected black mask changed.');
    let changedPixels=0;for(let p=0;p<144*144;p++)if(rgbaDiff(original,allOutputs[r.gridCell],p))changedPixels++;
    referenceRetention.push({index:r.index,gridCell:r.gridCell,sourceCell:r.sourceCell,changedPixels,sourceSha256:r.sha256,sourceRgbaSha256:r.rgbaSha256,role:'Actual raw hatchet design only; reference anatomy is not adopted.'});
  }
}
const paletteBytes=fs.readFileSync(path.join(out,disarmPrefix+'-analysis.json')),priorAnalysis=JSON.parse(paletteBytes.toString('utf8'));
let blackPixels=0,changedBlackPixels=0,changedVisibleBlackPixels=0;
for(let p=0;p<input.w*input.h;p++)if(maskGrid.data[p*4]===0){blackPixels++;if(rgbaDiff(input,result,p)){changedBlackPixels++;if(input.data[p*4+3]||result.data[p*4+3])changedVisibleBlackPixels++;}}
const rows=[],rawLayers:Img[]=[],sharedLayers:Img[]=[],rawGreenComposites:Img[]=[],sharedGreenComposites:Img[]=[],skinBases:Img[]=[],rawSkinComposites:Img[]=[],sharedSkinComposites:Img[]=[],firstSkinComposites:Img[]=[];
const boundedViews=[],boundedLayers:Img[]=[],boundedGreenComposites:Img[]=[],boundedSkinComposites:Img[]=[];
const conservativeBoundedViews=[],conservativeLayers:Img[]=[],conservativeGreenComposites:Img[]=[],conservativeSkinComposites:Img[]=[];
for(const [i,frame]of packet.frames.entries()){
  const base=frozen[i],output=outputs[i],source=inputs[i],edit=edits[i],sourceBytes=Buffer.from(frame.png,'base64'),frozenBytes=Buffer.from(frame.frozenBase.png,'base64');
  if(sha(sourceBytes)!==frame.sha256||sha(frozenBytes)!==frame.frozenBase.sha256||sha(Buffer.from(base.data))!==frame.frozenBase.rgbaSha256)throw new Error('Frozen frame/source hashes changed.');
  same(base,await decodePngBytes(frozenBytes),'Packet frozen bare base');same(source,await decodePngBytes(sourceBytes),'C-prime input frame');
  if(authoredV2){const actualBytes=Buffer.from(frame.actualDisarmBase.png,'base64');if(sha(actualBytes)!==frame.actualDisarmBase.sha256)throw new Error('Actual ancestor body hash changed.');same(actualFrozen[i],await decodePngBytes(actualBytes),'Explicit actual disarm ancestor');}
  const masks:Record<string,Img>={};
  for(const name of ['weapon','body','unknown','edit']){const b=Buffer.from(frame[name+'Mask'],'base64');if(sha(b)!==frame.maskHashes[name])throw new Error('Per-frame swap mask hash changed.');masks[name]=await decodePngBytes(b);if(masks[name].w!==144||masks[name].h!==144)throw new Error('Per-frame mask canvas changed.');}
  same(edit,masks.edit,'Packed edit mask');
  const nonkey=chromaMask(output,'green'),rawLayer=makeImg(144,144),rawMask=new Uint8Array(144*144),newKeys=newKeyPixels(base,output,'green');
  const lowGreenCandidates:{x:number;y:number;rgb:number[];keyScore:number;outsideFrozenBase:boolean;editable:boolean;sourceUnknown:boolean;sourceKnownBody:boolean;note:string}[]=[],strictNewKeyCoordinates:{x:number;y:number}[]=[],preservedUnknownRim:{x:number;y:number;rgb:number[];frozenBaseOpaque:boolean}[]=[];
  let editOutsideHeldWindow=0,providerOpaqueOutsideHeldWindow=0,rawCandidateOutsideHeldWindow=0,rawCandidateHeldBoundaryPixels=0,frozenBodyOutsideBody80=0;
  let knownBodyChanges=0,unknownChanges=0,exposedKnownBodyPixels=0,exposedUnknownPixels=0,nonkeyKnownBodyPixels=0,nonkeyUnknownPixels=0,rawLayerPixels=0,rawOverBodyPixels=0,rawOutsideStencilPixels=0,foregroundCorridorPixels=0,rawForegroundCorridorPixels=0,providerErasedFrozenBodyPixels=0,changedFrozenBodyPixels=0,newNonkeyOutsideFrozenPixels=0,unchangedOldWeaponPixels=0;
  for(let p=0;p<144*144;p++){
    const q=p*4,x=p%144,y=Math.floor(p/144),K=masks.body.data[q]===255,U=masks.unknown.data[q]===255,W=masks.weapon.data[q]===255,E=edit.data[q]===255;
    if(authoredV2){const inside=x>=16&&x<128&&y>=16&&y<128;if(E&&!inside)editOutsideHeldWindow++;if(output.data[q+3]&&!inside)providerOpaqueOutsideHeldWindow++;if(base.data[q+3]&&(x<32||x>=112||y<32||y>=112))frozenBodyOutsideBody80++;}
    if(K&&E)exposedKnownBodyPixels++;if(U&&E)exposedUnknownPixels++;
    if(K&&rgbaDiff(source,output,p))knownBodyChanges++;if(U&&rgbaDiff(source,output,p))unknownChanges++;
    if(U)preservedUnknownRim.push({x,y,rgb:Array.from(output.data.subarray(q,q+3)),frozenBaseOpaque:base.data[q+3]>0});
    if(K&&nonkey[p])nonkeyKnownBodyPixels++;if(U&&nonkey[p])nonkeyUnknownPixels++;
    if(base.data[q+3]&&rgbaDiff(base,output,p))changedFrozenBodyPixels++;
    if(base.data[q+3]>=128&&output.data[q+3]<128)providerErasedFrozenBodyPixels++;
    if(W&&base.data[q+3])foregroundCorridorPixels++;
    if(W&&!rgbaDiff(source,output,p))unchangedOldWeaponPixels++;
    if(newKeys?.mask[p])strictNewKeyCoordinates.push({x,y});
    const [r,g,b,a]=output.data.subarray(q,q+4),score=keyScore('green',r,g,b),excess=g-Math.max(r,b);
    if(a>=128&&excess>=5&&score<KT)lowGreenCandidates.push({x,y,rgb:[r,g,b],keyScore:score,outsideFrozenBase:base.data[q+3]===0,editable:E,sourceUnknown:U,sourceKnownBody:K,note:'Undersaturated green candidate, not an automatic body/weapon classification.'});
    if(nonkey[p]&&E&&!K&&!U){rawMask[p]=1;rawLayer.data.set(output.data.subarray(q,q+4),q);rawLayerPixels++;if(base.data[q+3])rawOverBodyPixels++;else newNonkeyOutsideFrozenPixels++;if(W&&base.data[q+3])rawForegroundCorridorPixels++;if(!E)rawOutsideStencilPixels++;if(authoredV2){if(x<16||x>=128||y<16||y>=128)rawCandidateOutsideHeldWindow++;if(x===16||x===127||y===16||y===127)rawCandidateHeldBoundaryPixels++;}}
  }
  if(exposedKnownBodyPixels||exposedUnknownPixels)throw new Error('The second-prop mask exposes protected source anatomy.');
  if(authoredV2&&(editOutsideHeldWindow||frozenBodyOutsideBody80))throw new Error('The completion edit/body recipe exceeds the fixed authored export geometry.');
  const extractInput={key:`swap/east/${frame.index}`,call:0,base,out:output,route:'green' as const,band:bandOf('main_hand',undefined,144),posed:false,held:true,pad:16};
  const shared=extractCell(extractInput),stencil=Uint8Array.from({length:144*144},(_,p)=>edit.data[p*4]===255?1:0),beforeBase=sha(Buffer.from(base.data)),beforeOutput=sha(Buffer.from(output.data));
  const bounded=extractCell({...extractInput,stencil}),acceptedMatte=stencil.map((v,p)=>v&&nonkey[p]?1:0),conservative=extractCell({...extractInput,stencil:acceptedMatte});
  if(beforeBase!==sha(Buffer.from(base.data))||beforeOutput!==sha(Buffer.from(output.data)))throw new Error('Bounded extraction changed frozen base/provider output.');
  let sharedDifferences=0,sharedUnknownPixels=0,sharedKnownBodyPixels=0,sharedOutsideStencilPixels=0,sharedOverBodyPixels=0;
  for(let p=0;p<144*144;p++){
    if(rgbaDiff(rawLayer,shared.layer,p))sharedDifferences++;
    if(shared.layer.data[p*4+3]){if(masks.unknown.data[p*4])sharedUnknownPixels++;if(masks.body.data[p*4])sharedKnownBodyPixels++;if(!edit.data[p*4])sharedOutsideStencilPixels++;if(base.data[p*4+3])sharedOverBodyPixels++;}
  }
  let boundedPixels=0,boundedUnknownPixels=0,boundedKnownBodyPixels=0,boundedOutsideStencilPixels=0,boundedOverBodyPixels=0,boundedRgbaDifferencesFromRaw=0,boundedInsideStencilDifferencesFromRaw=0,boundedGeometryDifferencesFromRaw=0,boundedNewKeyOverlapPixels=0;
  const unboundedOutsideStencilCoordinates=[];
  for(let p=0;p<144*144;p++){
    if(bounded.layer.data[p*4+3]){boundedPixels++;if(masks.unknown.data[p*4])boundedUnknownPixels++;if(masks.body.data[p*4])boundedKnownBodyPixels++;if(!stencil[p])boundedOutsideStencilPixels++;if(base.data[p*4+3])boundedOverBodyPixels++;if(newKeys?.mask[p])boundedNewKeyOverlapPixels++;}
    if(rgbaDiff(rawLayer,bounded.layer,p)){boundedRgbaDifferencesFromRaw++;if(stencil[p])boundedInsideStencilDifferencesFromRaw++;}
    if(!!rawLayer.data[p*4+3]!==!!bounded.layer.data[p*4+3])boundedGeometryDifferencesFromRaw++;
    if(shared.layer.data[p*4+3]&&!stencil[p])unboundedOutsideStencilCoordinates.push({x:p%144,y:Math.floor(p/144),sourceAlpha:source.data[p*4+3],sourceKnownBody:masks.body.data[p*4]>0,sourceUnknown:masks.unknown.data[p*4]>0,outputAlpha:output.data[p*4+3]});
  }
  if(boundedOutsideStencilPixels||boundedKnownBodyPixels||boundedUnknownPixels)throw new Error('Bounded shared hatchet extraction crossed its explicit item stencil.');
  boundedViews.push({frame:frame.index,stencil:'actual source-bound edit D; known K/unknown U excluded; foreground W over frozen body retained',pixels:boundedPixels,knownBodyPixels:boundedKnownBodyPixels,unknownPixels:boundedUnknownPixels,outsideStencilPixels:boundedOutsideStencilPixels,overFrozenBodyPixels:boundedOverBodyPixels,rgbaDifferencesFromRawCandidate:boundedRgbaDifferencesFromRaw,insideStencilRgbaDifferences:boundedInsideStencilDifferencesFromRaw,geometryDifferencesFromRawCandidate:boundedGeometryDifferencesFromRaw,overlapWithNewRawKeyAdditions:boundedNewKeyOverlapPixels,offset:bounded.offset,unboundedOutsideStencilCoordinates,qualified:false,note:'Containment does not classify new editable-region green pixels or qualify grip/action orientation.'});
  let conservativePixels=0,conservativeOutsideMatte=0,conservativeOutsideEdit=0,conservativeKnownBody=0,conservativeUnknown=0,conservativeNewKeyOverlap=0,conservativeRgbaDifferences=0,conservativeGeometryDifferences=0,conservativeCommonRgbDifferences=0,conservativeOverBody=0;
  const removedRawCandidatePixels=[],addedOverRawCandidatePixels=[];
  for(let p=0;p<144*144;p++){
    const rawOpaque=rawLayer.data[p*4+3]>0,kept=conservative.layer.data[p*4+3]>0;
    if(kept){conservativePixels++;if(!acceptedMatte[p])conservativeOutsideMatte++;if(!stencil[p])conservativeOutsideEdit++;if(masks.body.data[p*4])conservativeKnownBody++;if(masks.unknown.data[p*4])conservativeUnknown++;if(newKeys?.mask[p])conservativeNewKeyOverlap++;if(base.data[p*4+3])conservativeOverBody++;}
    if(rgbaDiff(rawLayer,conservative.layer,p))conservativeRgbaDifferences++;
    if(rawOpaque!==kept)conservativeGeometryDifferences++;
    if(rawOpaque&&kept&&rawLayer.data.subarray(p*4,p*4+3).some((v,k)=>v!==conservative.layer.data[p*4+k]))conservativeCommonRgbDifferences++;
    if(rawOpaque&&!kept)removedRawCandidatePixels.push({x:p%144,y:Math.floor(p/144),rgba:Array.from(rawLayer.data.subarray(p*4,p*4+4)),note:'Existing shared extraction omitted this raw candidate; not automatically classified as stray or legitimate detail.'});
    if(!rawOpaque&&kept)addedOverRawCandidatePixels.push({x:p%144,y:Math.floor(p/144)});
  }
  if(conservativeOutsideMatte||conservativeOutsideEdit||conservativeKnownBody||conservativeUnknown||conservativeNewKeyOverlap||addedOverRawCandidatePixels.length)throw new Error('Conservative shared extraction crossed the raw nonkey source-bound matte.');
  conservativeBoundedViews.push({frame:frame.index,stencil:'S = source-bound edit D intersect unchanged chromaMask(provider output,green); source K/U already excluded by D',pixels:conservativePixels,outsideAcceptedMattePixels:conservativeOutsideMatte,outsideEditPixels:conservativeOutsideEdit,knownBodyPixels:conservativeKnownBody,unknownPixels:conservativeUnknown,overlapWithNewRawKeyAdditions:conservativeNewKeyOverlap,overFrozenBodyPixels:conservativeOverBody,rgbaDifferencesFromRawCandidate:conservativeRgbaDifferences,geometryDifferencesFromRawCandidate:conservativeGeometryDifferences,commonOpaqueRgbDifferences:conservativeCommonRgbDifferences,removedRawCandidatePixels,addedOverRawCandidatePixels,offset:conservative.offset,qualified:false,note:'The provider nonkey matte is a conservative candidate boundary, not automatic weapon/anatomy ground truth. Existing small-component handling remains observable.'});
  const mapping=priorAnalysis.palettes.find((p:any)=>p.frame===frame.index);if(!mapping)throw new Error('Approved frozen-body palette assignments are missing.');
  const ids=new Map<number,number>(),table=new Int32Array(mapping.assignments.length);
  for(const a of mapping.assignments){const source=(a.sourceRgb[0]<<16)|(a.sourceRgb[1]<<8)|a.sourceRgb[2],target=(a.targetRgb[0]<<16)|(a.targetRgb[1]<<8)|a.targetRgb[2];ids.set(source,ids.size);table[ids.size-1]=target;}
  const baseIndices=indexImg(base,ids);if(!authoredV2)for(let p=0;p<144*144;p++)if(base.data[p*4+3]&&baseIndices[p]<0)throw new Error('A frozen base color is absent from the original approved body mapping.');
  const skinBase=authoredV2?await decodePngBytes(fs.readFileSync(path.join(out,`reference-family-v2-${frame.index}-body-skin.png`))):applyIndex(base,baseIndices,table);
  if(authoredV2){const row=familyAudit.frames.find((r:any)=>r.frame===frame.index);if(!row||row.authoredBodySha256!==frame.frozenBase.sha256||sha(Buffer.from(skinBase.data))!==row.authoredSkinRgbaSha256||skinBase.data.some((v,p)=>p%4===3&&v!==base.data[p]))throw new Error('Authored frozen-body skin differs from its independent K/H/I audit.');}else same(skinBase,await decodePngBytes(fs.readFileSync(path.join(out,`${disarmPrefix}-${frame.index}-authored-skin-base.png`))),'Reused frozen-body skin palette');
  const rawGreen=recompose({base,layer:rawLayer}),sharedGreen=recompose(shared),rawSkin=recompose({base:skinBase,layer:rawLayer}),sharedSkin=recompose({base:skinBase,layer:shared.layer}),firstSkin=await decodePngBytes(fs.readFileSync(path.join(out,authoredV2?`reference-family-v2-${frame.index}-first-weapon-skin.png`:`${disarmPrefix}-${frame.index}-confirmed-weapon-skin-composite.png`)));
  const boundedGreen=recompose(bounded),boundedSkin=recompose({base:skinBase,layer:bounded.layer});
  const conservativeGreen=recompose(conservative),conservativeSkin=recompose({base:skinBase,layer:conservative.layer});
  conservativeLayers.push(conservative.layer);conservativeGreenComposites.push(conservativeGreen);conservativeSkinComposites.push(conservativeSkin);
  for(const[name,image]of [['conservative-bounded-shared-layer',conservative.layer],['conservative-bounded-shared-green-composite',conservativeGreen],['conservative-bounded-shared-skin-composite',conservativeSkin]]as const)await write(`${stemPrefix}-${frame.index}-${name}`,image);
  boundedLayers.push(bounded.layer);boundedGreenComposites.push(boundedGreen);boundedSkinComposites.push(boundedSkin);
  for(const[name,image]of [['bounded-shared-layer',bounded.layer],['bounded-shared-green-composite',boundedGreen],['bounded-shared-skin-composite',boundedSkin]]as const)await write(`${stemPrefix}-${frame.index}-${name}`,image);
  const componentSizes=components(rawMask,144,144).map(c=>c.length).sort((a,b)=>b-a),points=Array.from(rawMask.entries()).filter(([,v])=>v).map(([p])=>({x:p%144,y:Math.floor(p/144)}));
  const bounds=points.length?{xMin:Math.min(...points.map(p=>p.x)),xMax:Math.max(...points.map(p=>p.x)),yMin:Math.min(...points.map(p=>p.y)),yMax:Math.max(...points.map(p=>p.y))}:null;
  rows.push({frame:frame.index,frozenBaseSha256:frame.frozenBase.sha256,frozenBaseRgbaSha256:sha(Buffer.from(base.data)),frozenSkinRgbaSha256:sha(Buffer.from(skinBase.data)),frozenBodyAndPaletteUnchanged:true,knownBodyChanges,unknownChanges,exposedKnownBodyPixels,exposedUnknownPixels,nonkeyKnownBodyPixels,nonkeyUnknownPixels,preservedUnknownRim,changedFrozenBodyPixels,providerErasedFrozenBodyPixels,newKeyOutsideFrozenBase:{pixels:newKeys?.pixels??0,bounds:newKeys?.bounds??null,coordinates:strictNewKeyCoordinates},undersaturatedGreenCandidates:lowGreenCandidates,newUndersaturatedGreenOutsideFrozenBase:lowGreenCandidates.filter(p=>p.outsideFrozenBase&&p.editable&&!p.sourceUnknown&&!p.sourceKnownBody),rawCandidateLayer:{pixels:rawLayerPixels,bounds,components:componentSizes,principalAxisRadians:axisOf(rawMask,144),borderPixels:borderPx(rawLayer),overFrozenBodyPixels:rawOverBodyPixels,newNonkeyOutsideFrozenPixels,outsideStencilPixels:rawOutsideStencilPixels,foregroundCorridorPixels,foregroundCorridorOccupiedPixels:rawForegroundCorridorPixels,unchangedOldWeaponPixels,note:'Nonkey editable pixels excluding source known-body and unknown rim; candidates can still include new ambiguous green rim or incorrect prop pixels.'},sharedExtraction:{pixels:shared.area,differencesFromRawCandidatePixels:sharedDifferences,unknownPixels:sharedUnknownPixels,knownBodyPixels:sharedKnownBodyPixels,outsideStencilPixels:sharedOutsideStencilPixels,overFrozenBodyPixels:sharedOverBodyPixels,borderPixels:borderPx(shared.layer),offset:shared.offset,shiftedDiagnostic:shared.shifted,keyKept:shared.keyKept,keyOutside:shared.keyOutside,note:'Existing outline/despill/component behavior retained separately. No additional cleanup or registration.'},weaponCount:'requires-independent-visual-review; connected components are not weapon count',grip:frame.grip,firstWeaponUnknownRimPixels:frame.firstWeaponUnknownRimPixels,...(authoredV2?{authoredGeometry:{heldWindow:packet.heldWindow,bodyWindow:{x:32,y:32,w:80,h:80},editOutsideHeldWindow,providerOpaqueOutsideHeldWindow,rawCandidateOutsideHeldWindow,rawCandidateHeldBoundaryPixels,frozenBodyOutsideBody80,note:'Boundary contact is a clipping-risk diagnostic; fixed export geometry does not establish natural anatomy or grip.'}}:{}),qualified:false});
  rawLayers.push(rawLayer);sharedLayers.push(shared.layer);rawGreenComposites.push(rawGreen);sharedGreenComposites.push(sharedGreen);skinBases.push(skinBase);rawSkinComposites.push(rawSkin);sharedSkinComposites.push(sharedSkin);firstSkinComposites.push(firstSkin);
  for(const[name,image]of [['source-armed',source],['provider-output',output],['frozen-base-green',base],['raw-candidate-layer',rawLayer],['shared-layer',shared.layer],['raw-green-composite',rawGreen],['shared-green-composite',sharedGreen],['frozen-skin-base',skinBase],['raw-skin-composite',rawSkin],['shared-skin-composite',sharedSkin]]as const)await write(`${stemPrefix}-${frame.index}-${name}`,image);
}
const colors=(im:Img)=>[...new Set(Array.from({length:im.w*im.h},(_,p)=>im.data[p*4+3]?rgb(im,p):null).filter((v):v is number=>v!==null))];
const design=rawLayers.map((im,i)=>({frame:packet.indices[i],candidateColors:colors(im).length,paletteDistanceFromFirst:paletteDistance(colors(rawLayers[0]),[im]),note:'Palette similarity does not establish a consistent hatchet head, shaft, scale or perspective.'}));
await write(stemPrefix+'-fixed-body-comparison',contactSheet([skinBases,firstSkinComposites,rawSkinComposites,sharedSkinComposites],3,2));
await write(stemPrefix+'-layer-audit',contactSheet([outputs,rawLayers,sharedLayers,rawGreenComposites,sharedGreenComposites],3,2));
await write(stemPrefix+'-bounded-shared-comparison',contactSheet([rawLayers,sharedLayers,boundedLayers,rawSkinComposites,sharedSkinComposites,boundedSkinComposites],3,2));
await write(stemPrefix+'-conservative-stencil-comparison',contactSheet([rawLayers,boundedLayers,conservativeLayers,rawSkinComposites,boundedSkinComposites,conservativeSkinComposites],3,2));
const report={version:1,jobId:e.job.id,gens:e.job.gens,evidenceSha256:sha(bytes),packetCanonicalHash:canonicalHash,resultSha256:sha(resultBytes),frozenBaseResultSha256:packet.sourceDisarmResultSha,frozenPaletteReportSha256:sha(paletteBytes),blackPixels,changedBlackPixels,changedVisibleBlackPixels,frames:rows,design,qualified:false,notes:['All composites reuse the first actual disarmed body and the same saved body-only skin assignments. No generated body or palette is adopted.','Raw candidate layer is editable nonkey output minus source known-body and unknown pixels. It is not automatically a pure weapon segmentation.','Raw new key additions and undersaturated-green candidates are reported before any key removal or shared extraction. Unknown rim remains separate.','Shared extraction is a separately labeled comparison. Its outline absorption/despill/component threshold may retain source unknowns or change pixels; raw output is preserved.','First confirmed-weapon comparison retains its unresolved2/4/4/2 source-rim differences. The new prop does not retroactively qualify that source contract.','Fixed-body comparison rows: frozen bare skin body, first confirmed-W longsword, raw candidate hatchet on that same body, shared-extracted hatchet on that same body.','Layer-audit rows: raw provider output, raw candidate layer, shared extracted layer, raw candidate green composite, shared extracted green composite.','Component count is not weapon count; a naturally occluded hilt can split one weapon. Anatomy, grip, orientation, hatchet design and action continuity require independent visual review.','White foreground corridor over the frozen leg/fist is intentional, but it is not permission to export regenerated anatomy or a skin patch inside an item layer.']};
Object.assign(report,{boundedSharedExtraction:boundedViews});
Object.assign(report,{conservativeBoundedSharedExtraction:conservativeBoundedViews});
report.notes.push('Additional bounded-shared comparison rows: raw candidate, unbounded shared, D-bounded shared layers, followed by their same-frozen-body skin composites. Existing raw/unbounded artifacts are retained. Zero protected-region leakage is a containment result, not a grip, orientation, green-addition or animation qualification.');
report.notes.push('The separate conservative stencil is D intersect the existing raw provider nonkey mask. It forbids outline absorption into raw key additions without changing a threshold or adding an extraction option. Its comparison rows are raw/D-bounded/conservative layers and their same-base skin composites. Every omitted raw candidate pixel is reported; new green anatomy and action uncertainty remain unqualified.');
if(completion){Object.assign(report,{profile:packet.profile,bodySource:packet.bodySource,sourceBodyRecipeCanonicalHash:packet.sourceBodyRecipeCanonicalHash,bodyFamilySkinAuditSha256:sha(familyAuditBytes!),authoredExportContract:packet.authoredExportContract,designSource:packet.designSource,referenceRetention});report.notes=report.notes.map(note=>note.replace('First confirmed-weapon comparison retains its unresolved2/4/4/2 source-rim differences.',`Completion confirmed-weapon comparison retains its unresolved${packet.frames.map((f:any)=>f.firstWeaponUnknownRimPixels).join('/')} source-rim differences.`));report.notes[0]='All completion composites reuse the explicitly authored reference-family-v2 body and independently audited K/H/I skin pixels. The raw actual disarm remains an unchanged ancestor, not the frozen output body.';}
fs.writeFileSync(path.join(out,stemPrefix+'-analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({jobId:e.job.id,gens:e.job.gens,blackPixels,changedBlackPixels,frames:rows.map(r=>({frame:r.frame,newKey:r.newKeyOutsideFrozenBase.pixels,lowGreen:r.undersaturatedGreenCandidates.length,Kchanged:r.knownBodyChanges,Uchanged:r.unknownChanges,rawArea:r.rawCandidateLayer.pixels,rawOverBody:r.rawCandidateLayer.overFrozenBodyPixels,sharedArea:r.sharedExtraction.pixels,sharedUnknown:r.sharedExtraction.unknownPixels})),qualified:false}));
