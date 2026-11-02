// Offline wrapper: evaluate the actual disarm result before making explicitly authored skin previews.
// No provider calls. No result cleanup, geometry alignment or unknown-pixel repair.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {type Img} from '../../../app/src/lib/image/png.ts';
import {cutGrid,padImg,recompose,contactSheet,extractCell,bandOf} from '../../../app/src/lib/items/items.ts';
import {toChroma,keyScore,KT} from '../../../app/src/lib/image/chroma.ts';
import {indexImg,applyIndex} from '../../../app/src/lib/dress/palette.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const completion=process.argv.includes('--completion'),stemPrefix=completion?'managed-disarm-completion':'managed-disarm',controlReportName=completion?'controlled-disarm-completion-analysis.json':'controlled-disarm-analysis.json';
const sourceBytes=fs.readFileSync(path.join(out,completion?'disarm-completion-evidence.json':'disarm-evidence.json')),e=JSON.parse(sourceBytes.toString('utf8')),packet=e.probe?.packet;
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const decode=(b64:string)=>decodePngBytes(Buffer.from(b64,'base64'));
const rgb=(im:Img,p:number)=>(im.data[p*4]<<16)|(im.data[p*4+1]<<8)|im.data[p*4+2];
const rgbArray=(c:number)=>[c>>16,(c>>8)&255,c&255];
const write=async(name:string,im:Img)=>{const bytes=await encodePngBytes(im),file=path.join(out,name+'.png');fs.writeFileSync(file,bytes);return file;};
function same(a:Img,b:Img,label:string){if(a.w!==b.w||a.h!==b.h||a.data.some((v,i)=>v!==b.data[i]))throw new Error(label+' pixels differ.');}
if(packet?.kind!=='weapon-aware-disarm'||packet.version!==1||packet.cell!==144||packet.cols!==2||e.job?.state!=='done'||e.images?.length!==1)throw new Error('The expected completed managed disarm receipt is missing.');
const {canonicalHash,...unsigned}=packet;if(sha(stableStringify(unsigned))!==canonicalHash)throw new Error('Retained disarm packet canonical hash changed.');
if(JSON.stringify(packet.indices)!==JSON.stringify(completion?[0,2,5,7]:[1,3,4,6]))throw new Error('Disarm indices differ from the selected profile.');
if(completion&&(canonicalHash!=='d7bb854ba6c6eb013e2541e6b3bc830ed50741f16aa7760cd41fdf26f8d5fbcd'||packet.request.seed!==735))throw new Error('Completion source packet differs from the independently reviewed seed735 contract.');
if(completion){const ledger=fs.readFileSync(path.join(out,'completion-proposed-corrections.json'));if(sha(ledger)!==packet.sourceCorrectionLedgerSha256||packet.sourceCorrectionTotal!==144)throw new Error('Completion source correction ledger changed.');}
const armedEvidenceBytes=fs.readFileSync(completion?path.join(out,'armed-completion-evidence.json'):path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01/managed-equipment-evidence.json'));
if(sha(armedEvidenceBytes)!==packet.sourceEvidenceSha256)throw new Error('Raw armed evidence differs from the independently reviewed source.');
const armedEvidence=JSON.parse(armedEvidenceBytes.toString('utf8')),rawArmedGridBytes=Buffer.from(armedEvidence.images[0].png,'base64');
if(sha(rawArmedGridBytes)!==packet.sourceGridSha256||sha(rawArmedGridBytes)!==armedEvidence.images[0].sha)throw new Error('Raw armed provider grid hash changed.');
const rawArmedCells=cutGrid(await decodePngBytes(rawArmedGridBytes),6,144,144,3).slice(0,4);
const resultBytes=Buffer.from(e.images[0].png,'base64');if(sha(resultBytes)!==e.images[0].sha)throw new Error('Provider result hash changed.');
const result=await decodePngBytes(resultBytes),input=await decode(packet.request.inpainting_image.image.base64),maskGrid=await decode(packet.request.mask_image.image.base64);
if([result,input,maskGrid].some(im=>im.w!==288||im.h!==288))throw new Error('Disarm source, mask or returned grid has a different geometry.');
if(sha(Buffer.from(packet.request.inpainting_image.image.base64,'base64'))!==packet.gridSha256||sha(Buffer.from(packet.request.mask_image.image.base64,'base64'))!==packet.maskSha256)throw new Error('Packed source or edit-mask hash changed.');
same(result,await decodePngBytes(fs.readFileSync(path.join(out,completion?'disarm-completion-output.png':'disarm-output.png'))),'Standalone provider output');
const inputCells=cutGrid(input,4,144,144,2),maskCells=cutGrid(maskGrid,4,144,144,2),bare=cutGrid(result,4,144,144,2),armed:Img[]=[],cases=[],rawDerivedAudit=[];
let blackPixels=0,changedBlackPixels=0,changedVisibleBlackPixels=0;
for(let p=0;p<288*288;p++)if(maskGrid.data[p*4]===0){blackPixels++;if(result.data.subarray(p*4,p*4+4).some((v,k)=>v!==input.data[p*4+k])){changedBlackPixels++;if(input.data[p*4+3]||result.data[p*4+3])changedVisibleBlackPixels++;}}
for(const [i,frame]of packet.frames.entries()){
  const bytes=Buffer.from(frame.png,'base64');if(sha(bytes)!==frame.sha256)throw new Error('Derived C-prime source hash changed.');
  const source=await decodePngBytes(bytes);same(source,inputCells[i],'Submitted source C-prime');armed.push(source);
  const raw=rawArmedCells[i];
  if(sha(await encodePngBytes(raw))!==frame.rawSha256||sha(Buffer.from(raw.data))!==frame.rawRgbaSha256||sha(Buffer.from(source.data))!==frame.rgbaSha256)throw new Error('Raw/derived per-frame source provenance differs.');
  let changedSourcePixels=0;for(let p=0;p<144*144;p++)if(raw.data.subarray(p*4,p*4+4).some((v,k)=>v!==source.data[p*4+k])){
    changedSourcePixels++;const approved=frame.cleanup.find((q:any)=>q.x===p%144&&q.y===Math.floor(p/144));
    if(!approved||approved.from.some((v:number,k:number)=>v!==raw.data[p*4+k])||approved.to.some((v:number,k:number)=>v!==source.data[p*4+k]))throw new Error('A raw armed source change is outside the explicit approved cleanup list.');
  }
  if(changedSourcePixels!==frame.cleanup.length)throw new Error('Raw/derived source cleanup count changed.');
  rawDerivedAudit.push({frame:frame.index,rawSha256:frame.rawSha256,derivedSha256:frame.sha256,changedSourcePixels,cleanup:frame.cleanup});
  const files:Record<string,string>={};
  for(const name of ['weapon','body','unknown','edit']){const b=Buffer.from(frame[name+'Mask'],'base64');if(sha(b)!==frame.maskHashes[name])throw new Error('Retained semantic/edit mask changed.');const file=path.join(out,`${stemPrefix}-${frame.index}-${name}-mask.png`);fs.writeFileSync(file,b);files[name]=file;if(name==='edit')same(await decodePngBytes(b),maskCells[i],'Submitted edit mask');}
  const sourceFile=await write(`${stemPrefix}-${frame.index}-source-armed-green`,source),baseFile=await write(`${stemPrefix}-${frame.index}-actual-bare-green`,bare[i]);
  cases.push({id:`${stemPrefix}-frame${frame.index}`,direction:packet.direction,frame:frame.index,kind:'managed-hard-mask-disarm-actual-result',armedPng:sourceFile,basePng:baseFile,armedSha256:frame.sha256,weaponMaskPng:files.weapon,bodyMaskPng:files.body,unknownMaskPng:files.unknown,editMaskPng:files.edit,protectedSkinPoints:[]});
}
const casesFile=path.join(out,stemPrefix+'-controlled-cases.json');fs.writeFileSync(casesFile,JSON.stringify({version:1,cases},null,2));
const checked=spawnSync(process.execPath,[path.join(root,'spikes/api/mocap/evaluate-disarm-control.mts'),'--cases',casesFile,...(completion?['--report',controlReportName]:[])],{cwd:root,encoding:'utf8'});
if(checked.status!==0)throw new Error('Shared disarm evaluator failed: '+checked.stderr);
const uncolored=JSON.parse(fs.readFileSync(path.join(out,controlReportName),'utf8'));

const palettes=[],strictLayers:Img[]=[],strictComposites:Img[]=[],exactLayers:Img[]=[],exactComposites:Img[]=[],skinBases:Img[]=[],strictSkinComposites:Img[]=[],exactSkinComposites:Img[]=[];
const sharedExtractionViews=[],unboundedSharedLayers:Img[]=[],boundedSharedLayers:Img[]=[],unboundedSharedSkin:Img[]=[],boundedSharedSkin:Img[]=[];
for(const [i,frame]of packet.frames.entries()){
  const referenceBytes=Buffer.from(frame.originalBodyReference.png,'base64');if(sha(referenceBytes)!==frame.originalBodyReference.sha256)throw new Error('Original skin reference hash changed.');
  const reference=await decodePngBytes(referenceBytes);if(reference.w!==112||reference.h!==112||frame.originalBodyReference.padding!==16)throw new Error('Unexpected original body reference geometry.');
  const green=padImg(toChroma(reference,'green'),16),skin=padImg(reference,16),inverse=new Map<number,Set<number>>();
  for(let p=0;p<144*144;p++)if(skin.data[p*4+3]){const c=rgb(green,p),targets=inverse.get(c)??new Set<number>();targets.add(rgb(skin,p));inverse.set(c,targets);}
  const ambiguous=[...inverse.entries()].filter(([,targets])=>targets.size!==1);if(ambiguous.length)throw new Error('This per-frame inverse is ambiguous. Do not silently choose an original skin color.');
  const oldColors=[...inverse.keys()].sort((a,b)=>a-b),counts=new Map<number,number>();
  for(let p=0;p<144*144;p++)if(bare[i].data[p*4+3]){const c=rgb(bare[i],p);counts.set(c,(counts.get(c)??0)+1);}
  const ids=new Map<number,number>(),table=new Int32Array(counts.size),assignments=[];
  let exactDictionaryPixels=0,authoredPixels=0,remainingNonkeyPixels=0;
  for(const [color,pixels]of counts){
    const exact=inverse.get(color),[r,g,b]=rgbArray(color);let chosen=color,dG=0,dRgb=0,ties=1;
    if(exact)exactDictionaryPixels+=pixels;
    else{
      authoredPixels+=pixels;const candidates=oldColors.map(c=>{const q=rgbArray(c);return{color:c,dG:Math.abs(q[1]-g),dRgb:Math.max(Math.abs(q[0]-r),Math.abs(q[1]-g),Math.abs(q[2]-b))};}).sort((a,b)=>a.dG-b.dG||a.dRgb-b.dRgb||a.color-b.color);
      chosen=candidates[0].color;dG=candidates[0].dG;dRgb=candidates[0].dRgb;ties=candidates.filter(c=>c.dG===dG).length;
    }
    const target=[...inverse.get(chosen)!][0],id=ids.size;ids.set(color,id);table[id]=target;
    assignments.push({sourceRgb:[r,g,b],pixels,targetRgb:rgbArray(target),method:exact?'exact-per-frame-color-dictionary':'authored-nearest-green-channel',greenChannelDistance:dG,maxRgbDistance:dRgb,equalGreenDistanceCandidates:ties,originalColorRecovered:!!exact,originalAnatomyRecovered:false});
  }
  for(let p=0;p<144*144;p++)if(bare[i].data[p*4+3]>=128&&keyScore('green',bare[i].data[p*4],bare[i].data[p*4+1],bare[i].data[p*4+2])<KT)remainingNonkeyPixels++;
  const recolored=applyIndex(bare[i],indexImg(bare[i],ids),table);
  let alphaChanges=0,unchangedPositionExactSkinPixels=0;for(let p=0;p<144*144;p++){if(recolored.data[p*4+3]!==bare[i].data[p*4+3])alphaChanges++;if(recolored.data[p*4+3]&&skin.data[p*4+3]&&recolored.data.subarray(p*4,p*4+4).every((v,k)=>v===skin.data[p*4+k]))unchangedPositionExactSkinPixels++;}
  if(alphaChanges)throw new Error('Body-only palette mapping changed geometry.');
  const stem=path.join(out,`${stemPrefix}-frame${frame.index}`),strictLayer=await decodePngBytes(fs.readFileSync(stem+'-weapon-only-layer.png')),strictComposite=await decodePngBytes(fs.readFileSync(stem+'-weapon-only-recomposition.png')),exactLayer=await decodePngBytes(fs.readFileSync(stem+'-exact-residual.png')),exactComposite=await decodePngBytes(fs.readFileSync(stem+'-exact-recomposition.png'));
  const strictSkin=recompose({base:recolored,layer:strictLayer}),exactSkin=recompose({base:recolored,layer:exactLayer});
  const weaponMask=await decode(frame.weaponMask),bodyMask=await decode(frame.bodyMask),unknownMask=await decode(frame.unknownMask),stencil=Uint8Array.from({length:144*144},(_,p)=>weaponMask.data[p*4]===255?1:0);
  const beforeBase=sha(Buffer.from(bare[i].data)),beforeSource=sha(Buffer.from(armed[i].data));
  const extractionInput={key:`disarm-rebuild/east/${frame.index}`,call:0,base:bare[i],out:armed[i],route:'green' as const,band:bandOf('main_hand',undefined,144),posed:false,held:true,pad:16};
  const unboundedShared=extractCell(extractionInput),boundedShared=extractCell({...extractionInput,stencil});
  if(beforeBase!==sha(Buffer.from(bare[i].data))||beforeSource!==sha(Buffer.from(armed[i].data)))throw new Error('Shared extraction changed frozen source/base pixels.');
  const viewMetrics=[];
  for(const [name,value]of [['unbounded',unboundedShared],['confirmed-W-stencil',boundedShared]]as const){
    let pixels=0,outsideConfirmedW=0,knownBodyPixels=0,unknownPixels=0,rgbaDifferencesFromRawConfirmedLayer=0,insideStencilRgbaDifferences=0,geometryDifferencesFromRawConfirmedLayer=0,recompositionErrorsAgainstCprime=0;
    const recomposed=recompose(value);
    for(let p=0;p<144*144;p++){
      if(value.layer.data[p*4+3]){pixels++;if(!stencil[p])outsideConfirmedW++;if(bodyMask.data[p*4])knownBodyPixels++;if(unknownMask.data[p*4])unknownPixels++;}
      if(value.layer.data.subarray(p*4,p*4+4).some((v,k)=>v!==strictLayer.data[p*4+k])){rgbaDifferencesFromRawConfirmedLayer++;if(stencil[p])insideStencilRgbaDifferences++;}
      if(!!value.layer.data[p*4+3]!==!!strictLayer.data[p*4+3])geometryDifferencesFromRawConfirmedLayer++;
      if((armed[i].data[p*4+3]||recomposed.data[p*4+3])&&recomposed.data.subarray(p*4,p*4+4).some((v,k)=>v!==armed[i].data[p*4+k]))recompositionErrorsAgainstCprime++;
    }
    if(name==='confirmed-W-stencil'&&(outsideConfirmedW||knownBodyPixels||unknownPixels))throw new Error('Bounded shared extraction leaked outside confirmed weapon support.');
    viewMetrics.push({name,pixels,outsideConfirmedW,knownBodyPixels,unknownPixels,rgbaDifferencesFromRawConfirmedLayer,insideStencilRgbaDifferences,geometryDifferencesFromRawConfirmedLayer,recompositionErrorsAgainstCprime,offset:value.offset,qualified:false});
  }
  sharedExtractionViews.push({frame:frame.index,stencil:'independently confirmed W only; unknown rim excluded',views:viewMetrics,qualified:false});
  unboundedSharedLayers.push(unboundedShared.layer);boundedSharedLayers.push(boundedShared.layer);
  const unboundedSkin=recompose({base:recolored,layer:unboundedShared.layer}),boundedSkin=recompose({base:recolored,layer:boundedShared.layer});
  unboundedSharedSkin.push(unboundedSkin);boundedSharedSkin.push(boundedSkin);
  for(const[name,image]of [['unbounded-shared-layer',unboundedShared.layer],['bounded-shared-layer',boundedShared.layer],['unbounded-shared-green-composite',recompose(unboundedShared)],['bounded-shared-green-composite',recompose(boundedShared)],['unbounded-shared-skin-composite',unboundedSkin],['bounded-shared-skin-composite',boundedSkin]]as const)await write(`${stemPrefix}-${frame.index}-${name}`,image);
  await write(`${stemPrefix}-${frame.index}-authored-skin-base`,recolored);await write(`${stemPrefix}-${frame.index}-confirmed-weapon-skin-composite`,strictSkin);await write(`${stemPrefix}-${frame.index}-exact-residual-skin-composite`,exactSkin);
  strictLayers.push(strictLayer);strictComposites.push(strictComposite);exactLayers.push(exactLayer);exactComposites.push(exactComposite);skinBases.push(recolored);strictSkinComposites.push(strictSkin);exactSkinComposites.push(exactSkin);
  palettes.push({frame:frame.index,originalReferenceSha256:frame.originalBodyReference.sha256,perFrameInverseColorCount:inverse.size,ambiguousInverseColors:0,exactDictionaryPixels,authoredPixels,remainingNonkeyPixels,alphaChanges,unchangedPositionExactSkinPixels,assignments,qualified:false,note:'A matching color dictionary restores a source color, not anatomical truth at a new pixel. Nearest-G assignments are explicit authored body colors. Weapon layers are never recolored.'});
}
await write(stemPrefix+'-confirmed-weapon-preview',contactSheet([bare,strictLayers,strictComposites,skinBases,strictSkinComposites],3,2));
await write(stemPrefix+'-exact-residual-preview',contactSheet([armed,bare,exactLayers,exactComposites,exactSkinComposites],3,2));
await write(stemPrefix+'-shared-stencil-comparison',contactSheet([strictLayers,unboundedSharedLayers,boundedSharedLayers,strictSkinComposites,unboundedSharedSkin,boundedSharedSkin],3,2));
const report={version:1,jobId:e.job.id,gens:e.job.gens,evidenceSha256:sha(sourceBytes),packetCanonicalHash:canonicalHash,resultSha256:sha(resultBytes),blackPixels,changedBlackPixels,changedVisibleBlackPixels,sourceTarget:'Derived C-prime, not unmodified raw C',cleanup:packet.cleanup,rawDerivedAudit,frames:uncolored.rows,palettes,qualified:false,notes:['Actual provider bases, masks and exact uncolored reconstruction are evaluated before any skin preview. No result pixels were patched, aligned or cleaned.','Source C-prime differs from raw C by only the separately approved two isolated white-artifact removals. Both sources and hashes remain retained and independently checked against the original armed receipt.','Confirmed-W-only layers and exact W+U residuals are separate. An exact residual containing unknown green rim is not automatically a weapon-only layer.','Confirmed-weapon preview rows: actual bare green, confirmed-W layer, W-only green composite, authored skin base, W-only skin composite.','Exact-residual preview rows: source C-prime, actual bare green, exact residual, exact green reconstruction, exact residual over authored skin base.','Palette previews use a separate per-frame exact old-color dictionary and explicit nearest-G assignment for new base colors. All assignments, distances and counts are recorded. This is not a global inverse or a claim of recovering original hand anatomy.','Only the new base is recolored. Exact/confirmed item pixels remain untouched, including any unresolved green rim. Palette preview must not be used to conceal weapon residue or anatomy changes.','An empty-hand base, hilt/finger occlusion, revealed leg anatomy, motion continuity, design consistency and alternate-weapon fit still require independent visual qualification.']};
Object.assign(report,{sharedExtractionViews});
report.notes.push('Additional shared-stencil comparison rows: raw confirmed-W layer, unbounded shared layer, W-bounded shared layer, then the corresponding three skin composites. Existing raw/exact views remain unchanged. A containment pass does not resolve the twelve original unknown rim pixels or qualify animation semantics.');
if(completion){Object.assign(report,{profile:'east-completion-0-2-5-7',sourceCorrectionLedgerSha256:packet.sourceCorrectionLedgerSha256,sourceCorrectionTotal:packet.sourceCorrectionTotal});report.notes[1]='Source C-prime includes exactly144 independently logged body/artifact corrections from raw seed734 output. Original opaque body and brown handle candidates remain unchanged. Raw, proposed and actual disarm results remain separate.';report.notes=report.notes.map(note=>note.replace('the twelve original unknown rim pixels',"the selected profile's original unknown rim pixels"));}
fs.writeFileSync(path.join(out,stemPrefix+'-analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({jobId:e.job.id,gens:e.job.gens,blackPixels,changedBlackPixels,frames:report.frames.map((f:any)=>({frame:f.frame,alphaExcess:f.baseAlphaExceedsTargetPixels,exactErrors:f.exactResidualRecompositionErrors,strictWeaponErrors:f.strictWeaponOnlyRecompositionErrors,residual:f.residualClassifications})),palettes:palettes.map(({frame,exactDictionaryPixels,authoredPixels,remainingNonkeyPixels,alphaChanges})=>({frame,exactDictionaryPixels,authoredPixels,remainingNonkeyPixels,alphaChanges})),qualified:false}));
