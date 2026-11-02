// Independent offline check of actual disarmed bodies against the already-known original unarmed frames.
// No body derivative is created here. Unsupported inferred opacity is evidence, not anatomical ground truth.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {cutGrid,padImg,contactSheet} from '../../../app/src/lib/items/items.ts';
import {toChroma,components} from '../../../app/src/lib/image/chroma.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex'),decode=(s:string)=>decodePngBytes(Buffer.from(s,'base64'));
const diff=(a:Img,b:Img,p:number)=>a.data.subarray(p*4,p*4+4).some((v,k)=>v!==b.data[p*4+k]);
const bounding=(positions:number[])=>positions.length?{xMin:Math.min(...positions.map(p=>p%144)),xMax:Math.max(...positions.map(p=>p%144)),yMin:Math.min(...positions.map(p=>Math.floor(p/144))),yMax:Math.max(...positions.map(p=>Math.floor(p/144)))}:null;
const rows=[],originalSkinFrames:Record<number,Img>={},actualSkinFrames:Record<number,Img>={},unsupportedFrames:Record<number,Img>={};
for(const completion of [false,true]){
  const stem=completion?'managed-disarm-completion':'managed-disarm',evidenceBytes=fs.readFileSync(path.join(out,completion?'disarm-completion-evidence.json':'disarm-evidence.json')),e=JSON.parse(evidenceBytes.toString('utf8')),packet=e.probe.packet;
  const {canonicalHash,...unsigned}=packet;if(sha(stableStringify(unsigned))!==canonicalHash)throw new Error('Disarm source packet canonical hash changed.');
  const armedFile=completion?path.join(out,'armed-completion-evidence.json'):path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01/managed-equipment-evidence.json'),armedBytes=fs.readFileSync(armedFile),armed=JSON.parse(armedBytes.toString('utf8'));
  if(sha(armedBytes)!==packet.sourceEvidenceSha256||e.job.state!=='done')throw new Error('Source evidence differs or actual disarm is incomplete.');
  const resultBytes=Buffer.from(e.images[0].png,'base64');if(sha(resultBytes)!==e.images[0].sha)throw new Error('Actual disarmed result hash changed.');
  const actual=cutGrid(await decodePngBytes(resultBytes),4,144,144,2);
  for(const [i,frame]of packet.frames.entries()){
    const nativeBytes=Buffer.from(frame.originalBodyReference.png,'base64');if(sha(nativeBytes)!==frame.originalBodyReference.sha256)throw new Error('Original unarmed source PNG changed.');
    const native=await decodePngBytes(nativeBytes),originalSkin=padImg(native,16),original=padImg(toChroma(native,'green'),16),source=await decode(frame.png),K=await decode(frame.bodyMask),W=await decode(frame.weaponMask),U=await decode(frame.unknownMask),body=actual[i];
    const old=armed.probe.packet.maskPlan.find((p:any)=>p.index===frame.index)?.grip;if(!old)throw new Error('Original reviewed grip observation is missing.');
    const oldGrip={x:old.x+16,y:old.y+16},newGrip=frame.grip,H=new Uint8Array(144*144),unsupported=new Uint8Array(144*144),unsupportedImage=makeImg(144,144);
    let sourceKnownBodyChanged=0,actualAlphaExceedsCprime=0,actualBodyPixels=0,originalBodyPixels=0,outsideHandNonKDifferences=0,unsupportedNewOpaqueOutsideHand=0,changedKnownBodyColorUnderPropOutsideHand=0,erasedKnownBodyOutsideHand=0,unsupportedBrownPropInfill=0;
    for(let p=0;p<144*144;p++){
      const q=p*4,x=p%144+0.5,y=Math.floor(p/144)+0.5,inside=Math.hypot(x-oldGrip.x,y-oldGrip.y)<=8||Math.hypot(x-newGrip.x,y-newGrip.y)<=8;
      if(inside)H[p]=1;if(body.data[q+3])actualBodyPixels++;if(original.data[q+3])originalBodyPixels++;
      if(K.data[q]&&diff(body,source,p))sourceKnownBodyChanged++;
      if(body.data[q+3]>source.data[q+3])actualAlphaExceedsCprime++;
      if(!inside&&!K.data[q]&&diff(body,original,p)){
        outsideHandNonKDifferences++;
        if(body.data[q+3]&&!original.data[q+3]){unsupportedNewOpaqueOutsideHand++;unsupported[p]=1;unsupportedImage.data.set(body.data.subarray(q,q+4),q);const [r,g,b]=source.data.subarray(q,q+3);if(W.data[q]&&r>=40&&r>=g*1.15&&g>=b*1.15)unsupportedBrownPropInfill++;}
        if(original.data[q+3]&&body.data[q+3]&&(W.data[q]||U.data[q]))changedKnownBodyColorUnderPropOutsideHand++;
        if(original.data[q+3]&&!body.data[q+3])erasedKnownBodyOutsideHand++;
      }
    }
    const unsupportedComponents=components(unsupported,144,144).map(c=>({pixels:c.length,bounds:bounding(c),coordinates:c.map(p=>({x:p%144,y:Math.floor(p/144)}))}));
    const wMask=Uint8Array.from({length:144*144},(_,p)=>W.data[p*4]?1:0),weaponComponents=components(wMask,144,144).map(c=>({pixels:c.length,bounds:bounding(c),newBarePixelsOutsideOriginalAndHand:c.filter(p=>unsupported[p]).length,originalBodyOpaquePixels:c.filter(p=>original.data[p*4+3]).length}));
    const actualSkin=await decodePngBytes(fs.readFileSync(path.join(out,`${stem}-${frame.index}-authored-skin-base.png`)));
    originalSkinFrames[frame.index]=originalSkin;actualSkinFrames[frame.index]=actualSkin;unsupportedFrames[frame.index]=unsupportedImage;
    fs.writeFileSync(path.join(out,`reference-audit-${frame.index}-unsupported-added-body.png`),await encodePngBytes(unsupportedImage));
    rows.push({frame:frame.index,profile:completion?'completion':'diagnostic',actualDisarmJobId:e.job.id,actualResultSha256:e.images[0].sha,originalPngSha256:frame.originalBodyReference.sha256,originalBodyPixels,actualBodyPixels,handEnvelope:{oldGrip,newGrip,radius:8,definition:'Union of pixel-center old/new8px grip circles, independently endorsed as an authoring envelope only; source-knownK takes precedence.'},sourceKnownBodyChanged,actualAlphaExceedsCprime,outsideHandNonKDifferences,unsupportedNewOpaqueOutsideHand,changedKnownBodyColorUnderPropOutsideHand,erasedKnownBodyOutsideHand,unsupportedBrownPropInfill,unsupportedComponents,weaponComponents,qualified:false});
  }
}
rows.sort((a,b)=>a.frame-b.frame);
fs.writeFileSync(path.join(out,'independent-disarm-reference-comparison.png'),await encodePngBytes(contactSheet([rows.map(r=>originalSkinFrames[r.frame]),rows.map(r=>actualSkinFrames[r.frame]),rows.map(r=>unsupportedFrames[r.frame])],3,2)));
const report={version:1,paidCalls:0,frames:rows,qualified:false,notes:['Original unarmed reference pixels already exist. Actual disarm inference outside the reviewed hand envelope is unnecessary where the reference supplies known body/background.','Unsupported inferred opacity under a brown pommel is not automatically a real far-side fist. Anatomy and visible forearm connection remain unknown until reviewed.','The source-knownK priority preserves visible adopted armed-body pixels, including the explicitly retained source0 contour point outside the hand circles.','No actual body, palette, item layer, receipt or source packet is modified by this audit.','An independently authored B-star can preserve all sourceK, use actual disarmed pixels within the reviewed hand envelope, and use original reference body/background elsewhere. Its own alpha and W/U reconstruction must be audited before use.']};
fs.writeFileSync(path.join(out,'independent-disarm-reference-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(rows.map(({frame,outsideHandNonKDifferences,unsupportedNewOpaqueOutsideHand,unsupportedBrownPropInfill,changedKnownBodyColorUnderPropOutsideHand,erasedKnownBodyOutsideHand})=>({frame,outsideHandNonKDifferences,unsupportedNewOpaqueOutsideHand,unsupportedBrownPropInfill,changedKnownBodyColorUnderPropOutsideHand,erasedKnownBodyOutsideHand}))));
