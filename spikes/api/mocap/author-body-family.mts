// Free, explicit body-authoring derivative. No credentials, network or provider requests.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {toChroma} from '../../../app/src/lib/image/chroma.ts';
import {cutGrid,padImg,contactSheet} from '../../../app/src/lib/items/items.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const oldDir=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const load=(name:string)=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
const first=load('managed-armed-disarm-probe.json'),completion=load('completion-disarm-probe.json');
for(const p of[first,completion]){const{canonicalHash,...content}=p;if(sha(stableStringify(content))!==canonicalHash)throw new Error('Prepared source packet hash mismatch.');}
if(first.canonicalHash!=='834ba23d967c560dc61fd0d11dc17c2fa826c7f662e69b642f75f70447d4d341'||completion.canonicalHash!=='d7bb854ba6c6eb013e2541e6b3bc830ed50741f16aa7760cd41fdf26f8d5fbcd')throw new Error('Reviewed source family changed.');
const receipts=[load('disarm-evidence.json'),load('disarm-completion-evidence.json')];
const actuals:Img[][]=[];
for(const receipt of receipts){
  if(receipt.job.state!=='done'||receipt.images.length!==1)throw new Error('Completed bare-body receipt required.');
  const bytes=Buffer.from(receipt.images[0].png,'base64');
  if(sha(bytes)!==receipt.images[0].sha)throw new Error('Provider bare-body receipt hash mismatch.');
  actuals.push(cutGrid(await decodePngBytes(bytes),4,144,144,2));
}
const oldLandmarks=JSON.parse(fs.readFileSync(path.join(oldDir,'reviewed-hand-landmarks.json'),'utf8'));
const newLandmarks=JSON.parse(fs.readFileSync(path.join(oldDir,'reviewed-hand-landmarks-east-completion.json'),'utf8'));
const frames=[],originals:Img[]=[],armed:Img[]=[],actual:Img[]=[],authored:Img[]=[],envelopes:Img[]=[];
for(let index=0;index<8;index++){
  const group=[0,2,5,7].includes(index)?1:0,p=group?completion:first;
  const source=p.frames.find((f:any)=>f.index===index),position=p.frames.indexOf(source);
  const provider=actuals[group][position];
  const naturalBytes=Buffer.from(source.originalBodyReference.png,'base64');
  if(sha(naturalBytes)!==source.originalBodyReference.sha256)throw new Error('Original body reference changed.');
  const native=await decodePngBytes(naturalBytes);
  if(native.w!==112||native.h!==112)throw new Error('Expected original native112 body.');
  const original=padImg(toChroma(native,'green'),16),sourceArmed=await decodePngBytes(Buffer.from(source.png,'base64'));
  const K=await decodePngBytes(Buffer.from(source.bodyMask,'base64'));
  const observation=(group?newLandmarks:oldLandmarks).entries.find((f:any)=>f.frame===index);
  if(!observation)throw new Error('Missing independently reviewed original hand center.');
  const oldGrip={x:observation.grip.x+16,y:observation.grip.y+16},newGrip={x:source.grip.x,y:source.grip.y};
  const image=makeImg(144,144),H=makeImg(144,144),selection=makeImg(144,144),delta=[];
  const counts={protectedSourceKey:0,actualInsideHand:0,originalOutsideHand:0,changedFromActual:0,changedSourceKey:0,opaqueOutside80:0,alphaExcessOverArmed:0};
  for(let y=0;y<144;y++)for(let x=0;x<144;x++){
    const p=y*144+x,q=p*4;
    // This is a conservative authoring envelope, not inferred finger segmentation.
    const h=Math.hypot(x+.5-oldGrip.x,y+.5-oldGrip.y)<=8||Math.hypot(x+.5-newGrip.x,y+.5-newGrip.y)<=8;
    const protectedKey=K.data[q]===255;
    if(protectedKey&&sourceArmed.data.subarray(q,q+4).some((v,k)=>v!==provider.data[q+k]))throw new Error('Actual bare result changed protected source key pixels.');
    const chosen=protectedKey||h?provider:original;
    image.data.set(chosen.data.subarray(q,q+4),q);
    H.data.set([h?255:0,h?255:0,h?255:0,255],q);
    selection.data.set(protectedKey?[0,192,255,255]:h?[255,0,255,255]:[90,90,90,255],q);
    if(protectedKey)counts.protectedSourceKey++;else if(h)counts.actualInsideHand++;else counts.originalOutsideHand++;
    if(protectedKey&&image.data.subarray(q,q+4).some((v,k)=>v!==sourceArmed.data[q+k]))counts.changedSourceKey++;
    if(image.data.subarray(q,q+4).some((v,k)=>v!==provider.data[q+k])){counts.changedFromActual++;delta.push({x,y,from:Array.from(provider.data.subarray(q,q+4)),to:Array.from(image.data.subarray(q,q+4)),rule:'original-known-body-outside-hand-and-protected-source-key'});}
    if(image.data[q+3]&&(x<32||x>=112||y<32||y>=112))counts.opaqueOutside80++;
    if(image.data[q+3]>sourceArmed.data[q+3])counts.alphaExcessOverArmed++;
  }
  if(counts.changedSourceKey||counts.opaqueOutside80)throw new Error('Source-key conservation or authored80 containment failed.');
  const imageBytes=Buffer.from(await encodePngBytes(image)),handBytes=Buffer.from(await encodePngBytes(H)),originalBytes=Buffer.from(await encodePngBytes(original)),actualBytes=Buffer.from(await encodePngBytes(provider));
  const stem=`body-star-${index}`;
  for(const[suffix,bytes]of [['authored',imageBytes],['hand-envelope',handBytes],['original',originalBytes],['actual',actualBytes]] as const)fs.writeFileSync(path.join(out,stem+'-'+suffix+'.png'),bytes);
  fs.writeFileSync(path.join(out,stem+'-selection.png'),await encodePngBytes(selection));
  frames.push({index,png:imageBytes.toString('base64'),sha256:sha(imageBytes),rgbaSha256:sha(image.data),handEnvelope:handBytes.toString('base64'),handEnvelopeSha256:sha(handBytes),actualPng:actualBytes.toString('base64'),actualSha256:sha(actualBytes),originalPng:originalBytes.toString('base64'),originalSha256:sha(originalBytes),sourceArmedPng:source.png,sourceArmedSha256:source.sha256,sourceProtectedKeyMask:source.bodyMask,sourceWeaponMask:source.weaponMask,sourceUnknownMask:source.unknownMask,originalBodyReference:source.originalBodyReference,oldGrip,newGrip,handRadius:8,counts,delta,sourcePacketCanonicalHash:p.canonicalHash,actualProviderJobId:receipts[group].job.id,qualified:false});
  originals.push(original);armed.push(sourceArmed);actual.push(provider);authored.push(image);envelopes.push(H);
}
const recipe={version:1,kind:'body-family-hand-conservation',unqualified:true,qualified:false,cell:144,indices:[0,1,2,3,4,5,6,7],direction:'east',rule:'Preserve observed sourceK globally. For nonK inside old8 union new8 main-hand envelope retain actual disarmed body; for nonK outside envelope use original known managed bare body. Pixel-center distances; no resampling or shifts.',classificationWarning:'K is observed protected key-colored source, not certified anatomy. H is an authoring envelope, not a true hand/finger segmentation.',actualProviderResultsUnchanged:true,firstSourceCanonicalHash:first.canonicalHash,completionSourceCanonicalHash:completion.canonicalHash,providerBareResultHashes:receipts.map(e=>e.images[0].sha),authoredExportContract:{bodyCell:[80,80],bodyCropOrigin:[32,32],bodyPivot:[40,75],heldCell:[112,112],heldCropOrigin:[16,16],heldPivot:[56,91],sharedPivotIn144:[72,107],providerPivotInferred:false},frames,notes:['This is a separately authored B-star derivative, not a successful automatic provider disarm claim.','The original raw734 leg failure,144source corrections, actual735 bare results and previous first-weapon/hatchet composites remain separate evidence.','No skin patch is added to equipment. Body palette mapping belongs only to the new body asset.','Head-occluded raised wrists, hip-hidden fingers, timing and universal-body support remain unqualified.']};
const canonicalHash=sha(stableStringify(recipe));
fs.writeFileSync(path.join(out,'body-star-recipe.json'),JSON.stringify({...recipe,canonicalHash}));
fs.writeFileSync(path.join(out,'body-star-full8-review.png'),await encodePngBytes(contactSheet([originals,actual,authored],3,2)));
fs.writeFileSync(path.join(out,'body-star-hand-selection-review.png'),await encodePngBytes(contactSheet([armed,envelopes,authored],3,2)));
console.log(JSON.stringify({prepared:true,canonicalHash,frames:frames.map(f=>({index:f.index,sha256:f.sha256,counts:f.counts})),unqualified:true}));
