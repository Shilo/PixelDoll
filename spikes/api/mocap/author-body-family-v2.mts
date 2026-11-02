// Explicit reviewed source correction, preserving the complete v1 history. No paid calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const v1Bytes=fs.readFileSync(path.join(out,'body-star-recipe.json')),v1=JSON.parse(v1Bytes.toString());
const{canonicalHash:v1Hash,...v1Content}=v1;
if(sha(stableStringify(v1Content))!==v1Hash||v1Hash!=='b02d34dd62fad46236ffdcf75bbfffa103fe655b11ab9d795b3dd3d483d2405a')throw new Error('Reviewed v1 body recipe changed.');
const decode=(s:string)=>decodePngBytes(Buffer.from(s,'base64'));
const encode=async(im:Img)=>Buffer.from(await encodePngBytes(im));
const frames=[],ledger:any[]=[],oldBodies:Img[]=[],newBodies:Img[]=[],sources:Img[]=[],keyExceptions=[];
for(const old of v1.frames){
  const original=await decode(old.originalPng),actual=await decode(old.actualPng),hand=await decode(old.handEnvelope),oldSource=await decode(old.sourceArmedPng),source:Img={...oldSource,data:new Uint8ClampedArray(oldSource.data)},key=await decode(old.sourceProtectedKeyMask);
  if(sha(Buffer.from(old.sourceArmedPng,'base64'))!==old.sourceArmedSha256)throw new Error('Original armed source changed.');
  const oldKey=new Uint8ClampedArray(key.data);
  if(old.index===6){
    // Independently observed posterior-arm component. This is not a global key cleanup.
    for(let y=70;y<=77;y++)for(let x=66;x<=68;x++){
      const q=(y*144+x)*4;
      if(key.data[q]!==255||original.data[q+3]||hand.data[q])continue;
      const from=Array.from(source.data.subarray(q,q+4)),to=Array.from(original.data.subarray(q,q+4));
      if(to.some(Boolean))throw new Error('Reviewed correction must restore original transparency only.');
      ledger.push({index:6,x,y,from,to,reason:'explicitly-reviewed-posterior-arm-addition-outside-original-body-and-main-hand-envelope'});
      source.data.set(to,q);key.data.set([0,0,0,255],q);
    }
    if(ledger.length!==18)throw new Error('Reviewed posterior-arm correction no longer contains18pixels.');
  }
  const image=makeImg(144,144),delta=[];
  const counts={protectedSourceKey:0,actualInsideHand:0,originalOutsideHand:0,changedFromActual:0,changedSourceKey:0,opaqueOutside80:0,alphaExcessOverArmed:0};
  let keyChanges=0,sourceChanges=0,handBodyChanges=0;
  for(let p=0;p<144*144;p++){
    const q=p*4,x=p%144,y=Math.floor(p/144),K=key.data[q]===255,H=hand.data[q]===255;
    const chosen=K||H?actual:original;
    image.data.set(chosen.data.subarray(q,q+4),q);
    if(K)counts.protectedSourceKey++;else if(H)counts.actualInsideHand++;else counts.originalOutsideHand++;
    if(K&&image.data.subarray(q,q+4).some((v,k)=>v!==source.data[q+k]))counts.changedSourceKey++;
    if(image.data.subarray(q,q+4).some((v,k)=>v!==actual.data[q+k])){counts.changedFromActual++;delta.push({x,y,from:Array.from(actual.data.subarray(q,q+4)),to:Array.from(image.data.subarray(q,q+4)),rule:'original-known-body-outside-hand-and-v2-protected-source-key'});}
    if(image.data[q+3]&&(x<32||x>=112||y<32||y>=112))counts.opaqueOutside80++;
    if(image.data[q+3]>source.data[q+3])counts.alphaExcessOverArmed++;
    if(key.data[q]!==oldKey[q])keyChanges++;
    if(source.data.subarray(q,q+4).some((v,k)=>v!==oldSource.data[q+k]))sourceChanges++;
    if(H&&image.data.subarray(q,q+4).some((v,k)=>v!==actual.data[q+k]))handBodyChanges++;
    if(K&&!H&&!original.data[q+3]){
      if(old.index!==0||x!==65||y!==82)throw new Error(`Unreviewed source-key body addition outside original and hand: ${old.index}/${x},${y}`);
      keyExceptions.push({index:old.index,x,y,rgba:Array.from(source.data.subarray(q,q+4)),meaning:'Explicit connected posterior contour adoption from v1; color evidence, not certified finger anatomy.'});
    }
  }
  if(counts.changedSourceKey||counts.opaqueOutside80||counts.alphaExcessOverArmed||handBodyChanges||keyChanges!==(old.index===6?18:0)||sourceChanges!==(old.index===6?18:0))throw new Error('Source, hand, containment or correction invariant failed.');
  const bytes=await encode(image),sourceBytes=await encode(source),keyBytes=await encode(key);
  const frame={...old,png:bytes.toString('base64'),sha256:sha(bytes),rgbaSha256:sha(image.data),sourceArmedPng:sourceBytes.toString('base64'),sourceArmedSha256:sha(sourceBytes),sourceProtectedKeyMask:keyBytes.toString('base64'),counts,delta,sourceVersion:old.index===6?2:1,sourceV1ArmedSha256:old.sourceArmedSha256,sourceV1ProtectedKeyMask:old.sourceProtectedKeyMask,sourceCorrections:old.index===6?ledger:[],sourceWAndUUnchanged:true,handEnvelopeUnchanged:true,qualified:false};
  frames.push(frame);oldBodies.push(await decode(old.png));newBodies.push(image);sources.push(source);
  fs.writeFileSync(path.join(out,`body-star-v2-${old.index}-authored.png`),bytes);
  if(old.index===6){
    fs.writeFileSync(path.join(out,'body-star-v2-source-6-before.png'),Buffer.from(old.sourceArmedPng,'base64'));
    fs.writeFileSync(path.join(out,'body-star-v2-source-6-after.png'),sourceBytes);
    fs.writeFileSync(path.join(out,'body-star-v2-source-6-key-mask.png'),keyBytes);
  }
}
if(keyExceptions.length!==1)throw new Error('Expected only the explicitly adopted frame0 contour exception.');
const recipe={...v1Content,version:2,kind:'body-family-hand-conservation',sourceV1RecipeCanonicalHash:v1Hash,sourceV1RecipeFileSha256:sha(v1Bytes),sourceCorrection:{index:6,pixels:18,ledger,sourceWAndUUnchanged:true,mainHandAndFeetUnchanged:true,meaning:'Explicit authored source correction; original C6 receipt and all v1 bodies remain unchanged.'},sourceKeyOutsideHandExceptions:keyExceptions,frames,notes:[...v1Content.notes,'V2 removes exactly18 independently reviewed sourceC6 posterior-arm pixels outside the original body and main-hand envelope, updates K, then reapplies the same body selector.','Only the already documented connected frame0contour pixel65,82 remains as sourceK outside original body and hand. This is explicit adoption, not anatomy ground truth.']};
const canonicalHash=sha(stableStringify(recipe));
fs.writeFileSync(path.join(out,'body-star-v2-recipe.json'),JSON.stringify({...recipe,canonicalHash}));
fs.writeFileSync(path.join(out,'body-star-v2-source-correction-ledger.json'),JSON.stringify({sourceV1RecipeCanonicalHash:v1Hash,ledger,sourceKeyOutsideHandExceptions:keyExceptions},null,2)+'\n');
fs.writeFileSync(path.join(out,'body-star-v2-comparison.png'),await encodePngBytes(contactSheet([oldBodies,newBodies],3,2)));
fs.writeFileSync(path.join(out,'body-star-v2-source6-comparison.png'),await encodePngBytes(contactSheet([[await decode(v1.frames[6].sourceArmedPng),sources[6],oldBodies[6],newBodies[6]]],6,3)));
console.log(JSON.stringify({prepared:true,canonicalHash,sourceCorrectionPixels:18,changedBodyFromV1:frames.map(f=>({index:f.index,changesFromActual:f.counts.changedFromActual,sha256:f.sha256})),sourceKeyOutsideHandExceptions:keyExceptions,unqualified:true}));
