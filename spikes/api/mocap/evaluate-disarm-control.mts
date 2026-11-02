// Offline counterchecks for armed -> disarmed base -> additive weapon-layer reconstruction.
// No provider calls. Historical unmasked edits are negative controls, not a test of a new hard-mask request.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {extractCell,recompose,contactSheet} from '../../../app/src/lib/items/items.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const arg=(key:string)=>{const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1];};
const source=path.resolve(arg('--source')??'C:/Programming_Files/Shilocity/PixelLab/PixelDoll/spikes/api/out/x28');
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
// The historical checkout already has pngjs, imported transitively by this existing pure helper module.
// Require identical helper source instead of installing a dependency or copying its extraction logic.
const helper=path.resolve(source,'../../lib/diff.mjs');
if(hash(fs.readFileSync(helper))!==hash(fs.readFileSync(path.join(root,'spikes/api/lib/diff.mjs'))))throw new Error('Historical diff helper differs from this branch. Reconcile its source before using this control.');
const {maskExact,layerFrom}=await import(pathToFileURL(helper).href);
const legacy=(image:Img)=>({w:image.w,h:image.h,d:image.data});
const fromLegacy=(image:{w:number;h:number;d:Uint8ClampedArray}):Img=>({w:image.w,h:image.h,data:image.d});
const difference=(a:Img,b:Img):Uint8Array=>maskExact(legacy(a),legacy(b));
const count=(m:Uint8Array)=>m.reduce((n,v)=>n+(v?1:0),0);
const layer=(armed:Img,mask:Uint8Array)=>fromLegacy(layerFrom(legacy(armed),mask));
const rgbaDifferent=(a:Img,b:Img,p:number)=>a.data.subarray(p*4,p*4+4).some((v,k)=>v!==b.data[p*4+k]);
const load=async(file:string)=>{const b=fs.readFileSync(file);return{image:await decodePngBytes(b),sha256:hash(b)};};
async function readMask(file:string|undefined,w:number,h:number){if(!file)return null;const im=(await load(path.resolve(file))).image;if(im.w!==w||im.h!==h)throw new Error('Mask dimensions differ from armed source.');const mask=new Uint8Array(w*h);for(let p=0;p<mask.length;p++){const c=im.data.subarray(p*4,p*4+4);if(c[3]!==255||![0,255].includes(c[0])||c[1]!==c[0]||c[2]!==c[0])throw new Error('A semantic/edit mask must be opaque black/white.');mask[p]=c[0]===255?1:0;}return mask;}
interface MaskSet {weapon:Uint8Array|null;unknown:Uint8Array|null;body:Uint8Array|null;edit:Uint8Array|null;protectedSkinPoints?:{x:number;y:number}[]}
function assess(armed:Img,base:Img,masks:MaskSet){
  if(armed.w!==base.w||armed.h!==base.h)throw new Error('Armed and new base canvases differ.');
  const exactMask=difference(base,armed),exactLayer=layer(armed,exactMask),exactComposite=recompose({base,layer:exactLayer}),fullArmedOverlay=recompose({base,layer:armed});
  const weaponMask=masks.weapon,weaponResidual=weaponMask?exactMask.map((v,p)=>v&&weaponMask[p]?1:0):null;
  const strictLayer=weaponResidual?layer(armed,weaponResidual):null,strictComposite=strictLayer?recompose({base,layer:strictLayer}):null;
  let changedRgbaPixels=0,changedOutsideEditPixels=0,changedOutsideEditVisiblePixels=0,changedProtectedSkinPixels=0,baseAlphaExceedsTargetPixels=0,baseOpaqueWhereTargetTransparentPixels=0,armedPartialAlphaPixels=0,basePartialAlphaPixels=0,residualWeaponPixels=0,residualUnknownPixels=0,residualKnownBodyPixels=0,residualUnclassifiedPixels=0,unchangedWeaponPixels=0,layerPixels=0,layerOutsideConfirmedWeaponPixels=0;
  for(let p=0;p<armed.w*armed.h;p++){
    const aa=armed.data[p*4+3],ba=base.data[p*4+3],changed=rgbaDifferent(armed,base,p);
    if(changed){changedRgbaPixels++;if(masks.edit&&!masks.edit[p]){changedOutsideEditPixels++;if(aa||ba)changedOutsideEditVisiblePixels++;}}
    if(ba>aa)baseAlphaExceedsTargetPixels++;
    if(ba&&aa===0)baseOpaqueWhereTargetTransparentPixels++;
    if(aa>0&&aa<255)armedPartialAlphaPixels++;if(ba>0&&ba<255)basePartialAlphaPixels++;
    if(weaponMask?.[p]&&!exactMask[p])unchangedWeaponPixels++;
    if(exactLayer.data[p*4+3]){layerPixels++;if(weaponMask&&!weaponMask[p])layerOutsideConfirmedWeaponPixels++;}
    if(exactMask[p]){if(weaponMask?.[p])residualWeaponPixels++;else if(masks.unknown?.[p])residualUnknownPixels++;else if(masks.body?.[p])residualKnownBodyPixels++;else residualUnclassifiedPixels++;}
    if((masks.weapon?.[p]??0)+(masks.unknown?.[p]??0)+(masks.body?.[p]??0)>1)throw new Error('Semantic weapon/body/unknown masks overlap.');
    if(!aa&&((masks.weapon?.[p]??0)||(masks.unknown?.[p]??0)||(masks.body?.[p]??0)))throw new Error('Semantic masks must classify visible armed pixels, not transparent background.');
    if(masks.edit?.[p]&&(!aa||masks.body?.[p]))throw new Error('Editable mask exposes original transparency or confirmed body.');
  }
  for(const q of masks.protectedSkinPoints??[]){if(!Number.isSafeInteger(q.x)||!Number.isSafeInteger(q.y)||q.x<0||q.x>=armed.w||q.y<0||q.y>=armed.h)throw new Error('Protected skin point is outside canvas.');const p=q.y*armed.w+q.x;if(masks.edit?.[p])throw new Error('Disarm mask exposes a protected skin point.');if(rgbaDifferent(armed,base,p))changedProtectedSkinPixels++;}
  const fallback=extractCell({key:'disarm-control/east/0',call:0,base,out:armed,route:'none',band:{x:0,y:0,w:armed.w,h:armed.h},posed:false});
  return{metrics:{changedVisiblePixels:count(exactMask),changedRgbaPixels,changedOutsideEditPixels:masks.edit?changedOutsideEditPixels:null,changedOutsideEditVisiblePixels:masks.edit?changedOutsideEditVisiblePixels:null,changedProtectedSkinPixels,baseAlphaExceedsTargetPixels,baseOpaqueWhereTargetTransparentPixels,armedPartialAlphaPixels,basePartialAlphaPixels,exactResidualPixels:layerPixels,layerOutsideConfirmedWeaponPixels:weaponMask?layerOutsideConfirmedWeaponPixels:null,residualClassifications:weaponMask?{weapon:residualWeaponPixels,unknown:residualUnknownPixels,knownBody:residualKnownBodyPixels,unclassified:residualUnclassifiedPixels}:null,unchangedConfirmedWeaponPixels:weaponMask?unchangedWeaponPixels:null,exactResidualRecompositionErrors:count(difference(armed,exactComposite)),strictWeaponOnlyRecompositionErrors:strictComposite?count(difference(armed,strictComposite)):null,fullArmedBodyOverlayErrors:count(difference(armed,fullArmedOverlay)),fullArmedBodyOverlayOpaquePixels:count(new Uint8Array(Array.from({length:armed.w*armed.h},(_,p)=>armed.data[p*4+3]?1:0))),fallbackLayerPixels:fallback.area,fallbackRecompositionErrors:count(difference(armed,recompose(fallback))),structuralEligible:!!weaponMask&&!!masks.edit&&!changedOutsideEditPixels&&!changedProtectedSkinPixels&&!baseAlphaExceedsTargetPixels&&!armedPartialAlphaPixels&&!basePartialAlphaPixels&&!residualKnownBodyPixels&&!residualUnknownPixels&&!residualUnclassifiedPixels&&count(difference(armed,exactComposite))===0,semanticQualification:'unreviewed',qualified:false},exactLayer,exactComposite,strictLayer,strictComposite,fullArmedOverlay,fallbackLayer:fallback.layer,fallbackComposite:recompose(fallback)};
}
function syntheticChecks(){
  const W=new Uint8Array([1,0]),Bmask=new Uint8Array([0,1]),U=new Uint8Array(2),D=W;
  const img=(colors:number[][])=>{const image=makeImg(2,1);colors.forEach((c,p)=>image.data.set(c,p*4));return image;};
  const armed=img([[150,150,160,255],[210,150,110,255]]),base=img([[210,150,110,255],[210,150,110,255]]),masks={weapon:W,body:Bmask,unknown:U,edit:D};
  const valid=assess(armed,base,masks).metrics;if(valid.exactResidualRecompositionErrors||!valid.structuralEligible)throw new Error('Valid hidden-body reveal countercheck failed.');
  const extra=img([[0,0,0,0],[210,150,110,255]]),extraBase=img([[210,150,110,255],[210,150,110,255]]),impossible=assess(extra,extraBase,{weapon:null,body:null,unknown:null,edit:null}).metrics;
  if(impossible.baseAlphaExceedsTargetPixels!==1||impossible.exactResidualRecompositionErrors!==1||impossible.fullArmedBodyOverlayErrors!==1)throw new Error('Additive-layer erasure countercheck failed.');
  const repainted=img([[210,150,110,255],[190,130,90,255]]),skin=assess(armed,repainted,masks).metrics;if(skin.exactResidualRecompositionErrors!==0||skin.residualClassifications?.knownBody!==1||skin.structuralEligible)throw new Error('Skin-in-item tautology countercheck failed.');
  const unchanged=assess(armed,armed,masks).metrics;if(unchanged.exactResidualRecompositionErrors||unchanged.unchangedConfirmedWeaponPixels!==1||unchanged.qualified)throw new Error('Unremoved-weapon tautology countercheck failed.');
  return{validHiddenBodyReveal:true,opaqueBaseCannotBeErased:true,exactSkinPatchIsNotWeaponLayer:true,unchangedArmedBaseIsNotCleanDisarm:true};
}

fs.mkdirSync(out,{recursive:true});const checks=syntheticChecks(),casesFile=arg('--cases');
const definitions=casesFile?JSON.parse(fs.readFileSync(path.resolve(casesFile),'utf8')).cases:(([['south','pm_slash_armed_s11_south'],['east','v3_slash_armed_east']]as const).flatMap(([direction,name])=>Array.from({length:8},(_,frame)=>({id:`historical-${direction}-${frame}`,direction,frame,kind:'historical-unmasked-edit-negative-control',armedPng:path.join(source,`B/${name}.${frame+1}.png`),basePng:path.join(source,`S/ea_${name}.bare.${frame}.png`)}))));
if(!Array.isArray(definitions)||!definitions.length)throw new Error('No explicit armed/base pairs supplied.');
const rows=[];
for(const c of definitions){
  if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(c.id))throw new Error('A case requires a safe stable ID.');
  const a=await load(path.resolve(c.armedPng)),b=await load(path.resolve(c.basePng));
  if(c.armedSha256&&c.armedSha256!==a.sha256)throw new Error('Annotated armed source hash changed.');
  const masks:MaskSet={weapon:await readMask(c.weaponMaskPng,a.image.w,a.image.h),unknown:await readMask(c.unknownMaskPng,a.image.w,a.image.h),body:await readMask(c.bodyMaskPng,a.image.w,a.image.h),edit:await readMask(c.editMaskPng,a.image.w,a.image.h),protectedSkinPoints:c.protectedSkinPoints};
  const result=assess(a.image,b.image,masks),stem=path.join(out,c.id);
  for(const[name,image]of [['armed',a.image],['base',b.image],['exact-residual',result.exactLayer],['exact-recomposition',result.exactComposite],['full-armed-tautology',result.fullArmedOverlay],['fallback-layer',result.fallbackLayer],['fallback-composite',result.fallbackComposite]]as const)fs.writeFileSync(stem+'-'+name+'.png',await encodePngBytes(image));
  if(result.strictLayer&&result.strictComposite){fs.writeFileSync(stem+'-weapon-only-layer.png',await encodePngBytes(result.strictLayer));fs.writeFileSync(stem+'-weapon-only-recomposition.png',await encodePngBytes(result.strictComposite));}
  fs.writeFileSync(stem+'-comparison.png',await encodePngBytes(contactSheet([[a.image,b.image,result.exactLayer,result.exactComposite],[a.image,b.image,result.fallbackLayer,result.fallbackComposite]],4,1)));
  const maskHashes=Object.fromEntries((['weapon','unknown','body','edit']as const).map(name=>[name,c[name+'MaskPng']?hash(fs.readFileSync(path.resolve(c[name+'MaskPng']))):null]));
  rows.push({id:c.id,direction:c.direction,frame:c.frame,kind:c.kind??'explicit-controlled-pair',armedSha256:a.sha256,baseSha256:b.sha256,cell:[a.image.w,a.image.h],masks:{weapon:!!masks.weapon,unknown:!!masks.unknown,body:!!masks.body,edit:!!masks.edit,sha256:maskHashes},...result.metrics});
}
const report={version:1,paidCalls:0,selfChecks:checks,casesFile:casesFile??null,rows,qualified:false,notes:['Historical unmasked edits are negative controls, not tests of the proposed protected disarm workflow.','Exact visible-RGBA reconstruction is necessary, not sufficient. A full armed body inside an item is a deliberately invalid tautology.','An additive item cannot remove base alpha. New opaque base pixels outside target armed alpha make exact reconstruction impossible without an explicit body-cut contract, which this experiment does not add.','Confirmed weapon support is independently annotated. Residual skin/body pixels fail; unknown residuals remain unqualified until independently classified.','Changes inside disarm-mask regions can reveal new body or background. Those are authored new-base pixels, not recovered anatomical ground truth.','Unchanged original weapon pixels in the base can trivially recompose. A clean empty hand and no residual blade/hilt must be checked separately.','Semantic qualification, full-clip timing, other directions, alternate weapons and interchangeability are not established by pair reconstruction.']};
const requestedReport=arg('--report');if(requestedReport&&!/^[a-zA-Z0-9_-]+\.json$/.test(requestedReport))throw new Error('A disarm report name must be a plain JSON filename.');
const reportName=requestedReport??(casesFile?(rows.every(r=>r.kind==='historical-unmasked-edit-negative-control')?'historical-annotated-disarm-countercheck.json':'controlled-disarm-analysis.json'):'historical-disarm-countercheck.json');
fs.writeFileSync(path.join(out,reportName),JSON.stringify(report,null,2));
console.log(JSON.stringify({selfChecks:checks,cases:rows.map(r=>({id:r.id,changed:r.changedVisiblePixels,alphaExcess:r.baseAlphaExceedsTargetPixels,residual:r.exactResidualPixels,recompositionErrors:r.exactResidualRecompositionErrors,fullArmedOverlayErrors:r.fullArmedBodyOverlayErrors,fallbackErrors:r.fallbackRecompositionErrors,qualified:r.qualified}))}));
