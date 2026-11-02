// Independent offline audit of the authored reference-conserving B-star family.
// Actual provider bodies, prior weapon results and their palettes are never replaced.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {cutGrid,padImg,recompose,contactSheet} from '../../../app/src/lib/items/items.ts';
import {toChroma} from '../../../app/src/lib/image/chroma.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const v2=process.argv.includes('--v2'),stemPrefix=v2?'reference-family-v2':'reference-family';
const manifestBytes=fs.readFileSync(path.join(out,v2?'body-star-v2-recipe.json':'body-star-recipe.json')),family=JSON.parse(manifestBytes.toString('utf8'));
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex'),decode=(s:string)=>decodePngBytes(Buffer.from(s,'base64'));
const same=(a:Img,b:Img,label:string)=>{if(a.w!==b.w||a.h!==b.h||a.data.some((v,i)=>v!==b.data[i]))throw new Error(label+' pixels differ.');};
const diff=(a:Img,b:Img,p:number)=>a.data.subarray(p*4,p*4+4).some((v,k)=>v!==b.data[p*4+k]);
const write=async(name:string,image:Img)=>{const file=path.join(out,name+'.png');fs.writeFileSync(file,await encodePngBytes(image));return file;};
const {canonicalHash,...unsigned}=family;
if(sha(stableStringify(unsigned))!==canonicalHash||canonicalHash!==(v2?'4458544f88245b1a96db2c1781f857a2f306271014009574bf0ac11de5fb8fd8':'b02d34dd62fad46236ffdcf75bbfffa103fe655b11ab9d795b3dd3d483d2405a')||family.cell!==144||JSON.stringify(family.indices)!=='[0,1,2,3,4,5,6,7]')throw new Error('The independently reviewed eight-frame body-star recipe changed.');
const cases=[],rows=[],originalSkin:Img[]=[],actualSkin:Img[]=[],authoredSkin:Img[]=[],actualGreen:Img[]=[],authoredGreen:Img[]=[],firstWeaponSkin:Img[]=[],firstWeaponOldSkin:Img[]=[],newHatchetSkin:Img[]=[],oldHatchetSkin:Img[]=[],hatchetIndices:number[]=[];
for(const f of family.frames){
  const completion=[0,2,5,7].includes(f.index),prefix=completion?'managed-disarm-completion':'managed-disarm';
  const evidenceBytes=fs.readFileSync(path.join(out,completion?'disarm-completion-evidence.json':'disarm-evidence.json')),e=JSON.parse(evidenceBytes.toString('utf8')),packet=e.probe.packet,source=packet.frames.find((p:any)=>p.index===f.index);
  const resultBytes=Buffer.from(e.images[0].png,'base64');if(sha(resultBytes)!==e.images[0].sha||packet.canonicalHash!==f.sourcePacketCanonicalHash||e.job.id!==f.actualProviderJobId)throw new Error('Body-star frame is not bound to its actual provider/source profile.');
  const actual=cutGrid(await decodePngBytes(resultBytes),4,144,144,2)[packet.frames.findIndex((p:any)=>p.index===f.index)];
  const encodedActual=Buffer.from(f.actualPng,'base64'),encodedOriginal=Buffer.from(f.originalPng,'base64'),encodedStar=Buffer.from(f.png,'base64'),encodedC=Buffer.from(f.sourceArmedPng,'base64'),encodedH=Buffer.from(f.handEnvelope,'base64');
  if(sha(encodedActual)!==f.actualSha256||sha(encodedOriginal)!==f.originalSha256||sha(encodedStar)!==f.sha256||sha(encodedC)!==f.sourceArmedSha256||sha(encodedH)!==f.handEnvelopeSha256)throw new Error('Body-star manifest PNG hash changed.');
  const C=await decodePngBytes(encodedC),I=await decodePngBytes(encodedOriginal),star=await decodePngBytes(encodedStar),H=await decodePngBytes(encodedH),K=await decode(f.sourceProtectedKeyMask),W=await decode(f.sourceWeaponMask),U=await decode(f.sourceUnknownMask);
  same(actual,await decodePngBytes(encodedActual),'Actual provider body');same(W,await decode(source.weaponMask),'Confirmed weapon W');same(U,await decode(source.unknownMask),'Source unknown U');
  const originalBytes=Buffer.from(f.originalBodyReference.png,'base64');if(sha(originalBytes)!==f.originalBodyReference.sha256)throw new Error('Original native reference hash changed.');
  const original=await decodePngBytes(originalBytes);same(I,padImg(toChroma(original,'green'),16),'Original known green reference');
  let explicitSourceCorrectionPixels=0;
  if(v2&&f.index===6){
    const sourceV1=await decode(source.png),keyV1=await decode(source.bodyMask);
    if(f.sourceV1ArmedSha256!==sha(Buffer.from(source.png,'base64')))throw new Error('V2 source6 does not identify its unchanged V1 ancestor.');
    same(keyV1,await decode(f.sourceV1ProtectedKeyMask),'V1 source6 key mask');
    const corrections=new Map<number,any>();for(const d of f.sourceCorrections){const p=d.y*144+d.x;if(corrections.has(p))throw new Error('Duplicate V2 source correction.');corrections.set(p,d);}
    for(let p=0;p<144*144;p++){
      const q=p*4,x=p%144,y=Math.floor(p/144),d=corrections.get(p),changed=diff(sourceV1,C,p);
      if(changed){explicitSourceCorrectionPixels++;if(!d||x<66||x>68||y<70||y>77||I.data[q+3]||H.data[q]||W.data[q]||U.data[q]||!keyV1.data[q]||diff(C,I,p)||d.from.some((v:number,k:number)=>v!==sourceV1.data[q+k])||d.to.some((v:number,k:number)=>v!==C.data[q+k]))throw new Error('V2 source6 change is outside the explicitly reviewed posterior contour contract.');}
      if(!!d!==changed||K.data[q]!==((changed)?0:keyV1.data[q]))throw new Error('V2 source6 ledger/key-mask delta differs.');
    }
    if(explicitSourceCorrectionPixels!==18||corrections.size!==18)throw new Error('V2 source6 must contain exactly18 reviewed source corrections.');
  }else{same(C,await decode(source.png),'Armed C-prime source');same(K,await decode(source.bodyMask),'Protected source K');}
  const skinI=padImg(original,16),skinActual=await decodePngBytes(fs.readFileSync(path.join(out,`${prefix}-${f.index}-authored-skin-base.png`))),skinStar=makeImg(144,144),delta=new Map<number,any>();
  for(const d of f.delta){const p=d.y*144+d.x;if(delta.has(p))throw new Error('Duplicate body-star correction coordinate.');delta.set(p,d);}
  let bodyChanges=0,changesOutsideLedger=0,recipeErrors=0,handMaskErrors=0,Kerrors=0,alphaExcessOverC=0,skinAlphaChanges=0,footPixelChanges=0,sourceKeyAdditionsOutsideHand=0;
  const preservedContourExceptions=[];
  for(let p=0;p<144*144;p++){
    const q=p*4,x=p%144+0.5,y=Math.floor(p/144)+0.5,expectedH=Math.hypot(x-f.oldGrip.x,y-f.oldGrip.y)<=8||Math.hypot(x-f.newGrip.x,y-f.newGrip.y)<=8,hand=H.data[q]===255,key=K.data[q]===255;
    if(H.data[q+3]!==255||![0,255].includes(H.data[q])||H.data[q+1]!==H.data[q]||H.data[q+2]!==H.data[q]||hand!==expectedH)handMaskErrors++;
    const expected=key?C:hand?actual:I;if(diff(star,expected,p))recipeErrors++;
    if(key&&diff(star,C,p))Kerrors++;
    if(star.data[q+3]>C.data[q+3])alphaExcessOverC++;
    const skinSource=key||hand?skinActual:skinI;skinStar.data.set(skinSource.data.subarray(q,q+4),q);
    if(skinStar.data[q+3]!==star.data[q+3])skinAlphaChanges++;
    if(I.data[q+3]&&Math.floor(p/144)>=100&&diff(star,I,p))footPixelChanges++;
    if(key&&!hand&&!I.data[q+3]){sourceKeyAdditionsOutsideHand++;preservedContourExceptions.push({x:p%144,y:Math.floor(p/144)});}
    const d=delta.get(p),changed=diff(actual,star,p);
    if(changed){bodyChanges++;if(!d)changesOutsideLedger++;else if(d.from.some((v:number,k:number)=>v!==actual.data[q+k])||d.to.some((v:number,k:number)=>v!==star.data[q+k]))throw new Error('Body-star correction values differ from the declared delta.');}
    if(d&&!changed)throw new Error('A body-star correction has no actual change.');
  }
  if(recipeErrors||handMaskErrors||Kerrors||alphaExcessOverC||skinAlphaChanges||changesOutsideLedger||bodyChanges!==f.delta.length)throw new Error('Authored body family violates its reviewed priority/alpha/provenance contract.');
  const sourceFile=await write(`${stemPrefix}-${f.index}-source-armed`,C),bodyFile=await write(`${stemPrefix}-${f.index}-body-green`,star);
  await write(`${stemPrefix}-${f.index}-body-skin`,skinStar);
  const masks:Record<string,string>={};for(const[name,b64]of [['weapon',f.sourceWeaponMask],['body',f.sourceProtectedKeyMask],['unknown',f.sourceUnknownMask],['edit',source.editMask]]as const){const file=path.join(out,`${stemPrefix}-${f.index}-${name}-mask.png`);fs.writeFileSync(file,Buffer.from(b64,'base64'));masks[name]=file;}
  cases.push({id:`${stemPrefix}-frame${f.index}`,direction:'east',frame:f.index,kind:'authored-reference-body-star',armedPng:sourceFile,basePng:bodyFile,armedSha256:f.sourceArmedSha256,weaponMaskPng:masks.weapon,bodyMaskPng:masks.body,unknownMaskPng:masks.unknown,editMaskPng:masks.edit,protectedSkinPoints:[]});
  const first=await decodePngBytes(fs.readFileSync(path.join(out,`${prefix}-frame${f.index}-weapon-only-layer.png`))),firstSkin=recompose({base:skinStar,layer:first});await write(`${stemPrefix}-${f.index}-first-weapon-skin`,firstSkin);
  originalSkin.push(skinI);actualSkin.push(skinActual);authoredSkin.push(skinStar);actualGreen.push(actual);authoredGreen.push(star);firstWeaponSkin.push(firstSkin);firstWeaponOldSkin.push(await decodePngBytes(fs.readFileSync(path.join(out,`${prefix}-${f.index}-confirmed-weapon-skin-composite.png`))));
  let priorHatchetCompositeChanges:number|null=null;
  if(!completion){const hatchet=await decodePngBytes(fs.readFileSync(path.join(out,`weapon-swap-${f.index}-conservative-bounded-shared-layer.png`))),previous=await decodePngBytes(fs.readFileSync(path.join(out,`weapon-swap-${f.index}-conservative-bounded-shared-skin-composite.png`))),composed=recompose({base:skinStar,layer:hatchet});await write(`${stemPrefix}-${f.index}-existing-hatchet-skin`,composed);newHatchetSkin.push(composed);oldHatchetSkin.push(previous);hatchetIndices.push(f.index);priorHatchetCompositeChanges=0;for(let p=0;p<144*144;p++)if(diff(previous,composed,p))priorHatchetCompositeChanges++;}
  rows.push({frame:f.index,profile:completion?'completion':'diagnostic',actualProviderJobId:e.job.id,actualProviderResultSha256:e.images[0].sha,sourcePacketCanonicalHash:packet.canonicalHash,authoredBodySha256:f.sha256,authoredSkinRgbaSha256:sha(Buffer.from(skinStar.data)),bodyChanges,changesOutsideLedger,recipeErrors,handMaskErrors,Kerrors,alphaExcessOverC,skinAlphaChanges,footPixelChanges,sourceKeyAdditionsOutsideHand,preservedContourExceptions,priorHatchetCompositeChanges,...(v2?{explicitSourceCorrectionPixels}:{}),qualified:false});
}
const caseFile=path.join(out,stemPrefix+'-controlled-cases.json');fs.writeFileSync(caseFile,JSON.stringify({version:1,cases},null,2));
const checked=spawnSync(process.execPath,[path.join(root,'spikes/api/mocap/evaluate-disarm-control.mts'),'--cases',caseFile,'--report',stemPrefix+'-reconstruction.json'],{cwd:root,encoding:'utf8'});if(checked.status!==0)throw new Error('Shared reconstruction audit failed: '+checked.stderr);
const reconstruction=JSON.parse(fs.readFileSync(path.join(out,stemPrefix+'-reconstruction.json'),'utf8'));
await write(stemPrefix+'-body-comparison',contactSheet([originalSkin,actualSkin,authoredSkin],3,2));
await write(stemPrefix+'-first-weapon-comparison',contactSheet([firstWeaponOldSkin,firstWeaponSkin],3,2));
await write(stemPrefix+'-existing-hatchet-comparison',contactSheet([oldHatchetSkin,newHatchetSkin],3,2));
const report={version:1,paidCalls:0,bodyRecipeCanonicalHash:canonicalHash,bodyRecipeFileSha256:sha(manifestBytes),frames:rows,reconstruction:reconstruction.rows,hatchetComparisonIndices:hatchetIndices,qualified:false,notes:['The authored B-star variant is independently checked against K/source, H/actual disarm and outside-K/H/original-reference pixel priorities. The raw actual bodies remain unchanged.','Skin previews reuse the already-authored actual body skin on K or H, and exact original native skin elsewhere. No new palette inverse, item recolor or provider-body adoption is performed.','First-weapon and prior four-pose hatchet layers are unchanged and composited on the explicitly different authored B-star body only in these separately named previews. Existing receipts, body hashes and swap artifacts are not updated.','Source-knownK additions outside H remain declared contour exceptions, not independently verified anatomy. Hand envelopes are authoring regions, not finger segmentation.','Exact W+U reconstruction does not make unknown rim a pure weapon. W-only target errors, hilt/hip ambiguity, action continuity and anatomical quality remain separate qualification gates.']};
if(v2)Object.assign(report,{authoredSourceVersion:2,source6CorrectionPixels:18,sourceCorrectionContract:'Only the reviewed18 posterior contour pixels and their K mask entries are restored to original transparency. Original C6/V1 family/provider results remain separate and unchanged.'});
fs.writeFileSync(path.join(out,v2?'independent-body-family-v2-audit.json':'independent-body-family-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({bodyRecipeCanonicalHash:canonicalHash,frames:rows.map(({frame,bodyChanges,Kerrors,alphaExcessOverC,footPixelChanges,sourceKeyAdditionsOutsideHand,priorHatchetCompositeChanges})=>({frame,bodyChanges,Kerrors,alphaExcessOverC,footPixelChanges,sourceKeyAdditionsOutsideHand,priorHatchetCompositeChanges})),reconstruction:reconstruction.rows.map((r:any)=>({frame:r.frame,knownBodyResidual:r.residualClassifications.knownBody,unknownResidual:r.residualClassifications.unknown,exactErrors:r.exactResidualRecompositionErrors,WonlyErrors:r.strictWeaponOnlyRecompositionErrors})),qualified:false}));
