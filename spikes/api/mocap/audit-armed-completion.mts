// Independent offline audit of the actual seed734 completion before any disarm or transfer spending.
// This script observes original/returned pixels only. It does not repair or clean the armed source.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {cutGrid,padImg,contactSheet} from '../../../app/src/lib/items/items.ts';
import {toChroma,keyScore,KT,newKeyPixels,components} from '../../../app/src/lib/image/chroma.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const evidenceBytes=fs.readFileSync(path.join(out,'armed-completion-evidence.json')),e=JSON.parse(evidenceBytes.toString('utf8')),packet=e.probe?.packet;
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const decode=(b64:string)=>decodePngBytes(Buffer.from(b64,'base64'));
const changed=(a:Img,b:Img,p:number)=>a.data.subarray(p*4,p*4+4).some((v,k)=>v!==b.data[p*4+k]);
if(e.job?.state!=='done'||packet?.kind!=='managed-equipment-probe'||JSON.stringify(packet.indices)!=='[0,2,5,7]'||packet.request.seed!==734||e.images?.length!==1)throw new Error('The actual completed seed734 four-frame source is missing.');
const resultBytes=Buffer.from(e.images[0].png,'base64');if(sha(resultBytes)!==e.images[0].sha)throw new Error('Completion result PNG hash changed.');
const output=await decodePngBytes(resultBytes),input=await decode(packet.request.inpainting_image.image.base64),mask=await decode(packet.request.mask_image.image.base64);
if([input,output,mask].some(im=>im.w!==432||im.h!==288))throw new Error('Completion source/result canvas differs.');
const results=cutGrid(output,6,144,144,3),inputs=cutGrid(input,6,144,144,3),masks=cutGrid(mask,6,144,144,3),originals:Img[]=[],additions:Img[]=[],rows=[];
for(const [i,frame]of packet.frames.entries()){
  const nativeBytes=Buffer.from(frame.png,'base64');if(sha(nativeBytes)!==frame.sha256)throw new Error('Original managed source PNG changed.');
  const native=await decodePngBytes(nativeBytes);if(native.w!==112||native.h!==112)throw new Error('Expected exact native112 managed source.');
  const original=padImg(native,16),green=padImg(toChroma(native,'green'),16),actual=results[i],plan=packet.maskPlan.find((p:any)=>p.index===frame.index),grip={x:plan.grip.x+16,y:plan.grip.y+16};
  if(green.data.some((v,p)=>v!==inputs[i].data[p]))throw new Error('Submitted mannequin differs from exact original body conversion.');
  const newKeys=newKeyPixels(original,actual,'green'),newKeyMask=newKeys?.mask??new Uint8Array(144*144),added=makeImg(144,144),newKeyComponents=components(newKeyMask,144,144).map(c=>({pixels:c.length,bounds:{xMin:Math.min(...c.map(p=>p%144)),xMax:Math.max(...c.map(p=>p%144)),yMin:Math.min(...c.map(p=>Math.floor(p/144))),yMax:Math.max(...c.map(p=>Math.floor(p/144)))},minimumDistanceToOldGrip:Math.min(...c.map(p=>Math.hypot(p%144+0.5-grip.x,Math.floor(p/144)+0.5-grip.y)))}));
  let newOpaquePixels=0,newKeyInsideOldHand=0,newKeyOutsideOldHand=0,changedBlackPixels=0,originalFootPixels=0,changedOriginalFootPixels=0,changedOriginalBodyOutsideHand=0,erasedOriginalBodyOutsideHand=0;
  const lowGreenOutsideBody=[];
  // Independent visual region: rear leg/foot on frame5, spatially separate from the forward sword.
  const extraLegRoi=frame.index===5?{xMin:57,xMax:73,yMin:84,yMax:104}:null;
  let extraLegAddedOpaque=0,extraLegAddedKey=0,extraLegAddedNonkey=0;
  for(let p=0;p<144*144;p++){
    const q=p*4,x=p%144,y=Math.floor(p/144),oldOpaque=original.data[q+3]>0,newOpaque=actual.data[q+3]>0,insideOldHand=Math.hypot(x+0.5-grip.x,y+0.5-grip.y)<=8;
    if(!masks[i].data[q]&&changed(inputs[i],actual,p))changedBlackPixels++;
    if(oldOpaque&&!insideOldHand){if(changed(inputs[i],actual,p))changedOriginalBodyOutsideHand++;if(!newOpaque)erasedOriginalBodyOutsideHand++;}
    if(oldOpaque&&y>=100){originalFootPixels++;if(changed(inputs[i],actual,p))changedOriginalFootPixels++;}
    if(!oldOpaque&&newOpaque){
      newOpaquePixels++;const [r,g,b]=actual.data.subarray(q,q+3),score=keyScore('green',r,g,b);
      if(g-Math.max(r,b)>=5&&score<KT)lowGreenOutsideBody.push({x,y,rgb:[r,g,b],keyScore:score});
      if(extraLegRoi&&x>=extraLegRoi.xMin&&x<=extraLegRoi.xMax&&y>=extraLegRoi.yMin&&y<=extraLegRoi.yMax){extraLegAddedOpaque++;if(score>=KT)extraLegAddedKey++;else extraLegAddedNonkey++;}
    }
    if(newKeyMask[p]){if(insideOldHand)newKeyInsideOldHand++;else newKeyOutsideOldHand++;added.data.set(actual.data.subarray(q,q+4),q);}
  }
  originals.push(original);additions.push(added);
  for(const[name,image]of [['original-body',original],['submitted-green',green],['raw-armed',actual],['new-key-only',added]]as const)fs.writeFileSync(path.join(out,`independent-completion-${frame.index}-${name}.png`),await encodePngBytes(image));
  rows.push({frame:frame.index,originalPngSha256:frame.sha256,originalRgbaSha256:sha(Buffer.from(original.data)),rawArmedRgbaSha256:sha(Buffer.from(actual.data)),oldGrip:grip,oldHandRadius:8,newOpaquePixels,newKeyPixels:newKeys?.pixels??0,newKeyInsideOldHand,newKeyOutsideOldHand,newKeyComponents,lowGreenOutsideBody,changedBlackPixels,originalFootPixels,changedOriginalFootPixels,changedOriginalBodyOutsideHand,erasedOriginalBodyOutsideHand,confirmedExtraLegRoi:extraLegRoi,extraLegAddedOpaque,extraLegAddedKey,extraLegAddedNonkey,qualified:false});
}
const referenceChanges=[4,5].map(i=>{let n=0;for(let p=0;p<144*144;p++)if(changed(inputs[i],results[i],p))n++;return{referenceCell:i,changedRgbaPixels:n};});
const proposedFlag=process.argv.includes('--proposed'),proposedAssessment=[],proposedImages:Img[]=[];
if(proposedFlag){
  const proposedBytes=fs.readFileSync(path.join(out,'completion-proposed-corrections.json')),proposal=JSON.parse(proposedBytes.toString('utf8'));
  if(proposal.sourceEvidenceSha256!==sha(evidenceBytes)||proposal.sourceRawGridSha256!==sha(resultBytes)||proposal.sourceJobId!==e.job.id)throw new Error('Proposed corrections are not bound to the actual completed source.');
  let totalCorrections=0;
  for(const [i,original]of packet.frames.entries()){
    const p=proposal.frames.find((f:any)=>f.index===original.index);if(!p)throw new Error('Proposed profile lacks a source frame.');
    const proposedPng=Buffer.from(p.png,'base64'),rawPng=Buffer.from(p.rawPng,'base64'),raw=results[i],proposed=await decodePngBytes(proposedPng),correctionMask=await decode(p.correctionMaskPng);
    if(sha(proposedPng)!==p.sha256||sha(rawPng)!==p.rawSha256||sha(Buffer.from(proposed.data))!==p.rgbaSha256||sha(Buffer.from(raw.data))!==p.rawRgbaSha256)throw new Error('Proposed/raw source hashes differ.');
    if([proposed,correctionMask].some(im=>im.w!==144||im.h!==144))throw new Error('Proposed source changed the canvas.');
    const listed=new Map<number,any>();for(const q of p.corrections){const key=q.y*144+q.x;if(listed.has(key))throw new Error('Repeated correction ledger coordinate.');listed.set(key,q);}
    let correctedPixels=0,changedOutsideLedger=0,changedOriginalOpaquePixels=0,addedOpaquePixels=0,brownCandidatePixels=0,changedBrownCandidatePixels=0,retainedNewKeyPixels=0;
    const originalNewKeys=newKeyPixels(originals[i],raw,'green')?.mask??new Uint8Array(144*144);
    for(let pixel=0;pixel<144*144;pixel++){
      const q=pixel*4,m=correctionMask.data.subarray(q,q+4),entry=listed.get(pixel),diff=changed(raw,proposed,pixel);
      if(m[3]!==255||![0,255].includes(m[0])||m[1]!==m[0]||m[2]!==m[0]||!!m[0]!==!!entry)throw new Error('Correction mask and explicit ledger disagree.');
      if(diff){correctedPixels++;if(!entry)changedOutsideLedger++;else if(entry.from.some((v:number,k:number)=>v!==raw.data[q+k])||entry.to.some((v:number,k:number)=>v!==proposed.data[q+k]))throw new Error('Correction RGBA values differ from the logged source/target.');if(originals[i].data[q+3])changedOriginalOpaquePixels++;}
      if(entry&&!diff)throw new Error('A logged correction did not change its source pixel.');
      if(proposed.data[q+3]>raw.data[q+3])addedOpaquePixels++;
      const [r,g,b,a]=raw.data.subarray(q,q+4);if(a&&r>=40&&r>=g*1.15&&g>=b*1.15){brownCandidatePixels++;if(diff)changedBrownCandidatePixels++;}
      if(originalNewKeys[pixel]&&!diff)retainedNewKeyPixels++;
    }
    if(changedOutsideLedger||changedOriginalOpaquePixels||addedOpaquePixels||changedBrownCandidatePixels||correctedPixels!==p.corrections.length)throw new Error('Proposed source violates its explicit original-transparency/brown-prop preservation contract.');
    totalCorrections+=correctedPixels;
    const remaining=newKeyPixels(originals[i],proposed,'green');
    proposedAssessment.push({frame:original.index,rawSha256:p.rawSha256,proposedSha256:p.sha256,correctedPixels,changedOutsideLedger,changedOriginalOpaquePixels,addedOpaquePixels,brownCandidatePixels,changedBrownCandidatePixels,retainedNewKeyPixels,remainingNewKeyPixels:remaining?.pixels??0,remainingNewKeyBounds:remaining?.bounds??null,permittedNewHand:p.permittedNewHand??null,qualified:false,note:'Brown-color retention supports preserving the rear handle/pommel but is not independent semantic weapon segmentation. All removals are explicit authored corrections, not an unchanged provider output.'});
    proposedImages.push(proposed);
  }
  if(totalCorrections!==proposal.totalCorrectedPixels||totalCorrections!==144)throw new Error('The independently reviewed correction total changed.');
  fs.writeFileSync(path.join(out,'independent-completion-proposed-review.png'),await encodePngBytes(contactSheet([originals,results.slice(0,4),proposedImages],3,2)));
}
fs.writeFileSync(path.join(out,'independent-completion-body-review.png'),await encodePngBytes(contactSheet([originals,inputs.slice(0,4),results.slice(0,4),additions],3,2)));
const report={version:1,paidCalls:0,jobId:e.job.id,gens:e.job.gens,evidenceSha256:sha(evidenceBytes),resultSha256:sha(resultBytes),coordinateSystem:'Native padded144 x/y, zero-based. Original hand centers are native112 observations plus16px padding.',frames:rows,referenceChanges,qualified:false,notes:['All returned provider pixels remain unchanged. No threshold-based body cleanup or source adoption is performed.','Preserving original foot pixels does not prevent an extra generated foot in originally transparent space. A silhouette-bottom metric can also miss that lifted foot.','A strict original8px hand zone cannot automatically be imposed on the accepted new raised fist: frame2 new hand extends beyond it and needs a separately reviewed permitted hand region.','A possible authored derived source should restore original body outside independently reviewed hand regions, retain independently confirmed weapon foreground, and preserve/classify unknown rims explicitly. It is not a claim of an unchanged provider output or recovered anatomy.','Frame5 rear-leg region is a manual semantic observation independent of key threshold. Its added opaque/nonkey counts therefore expose outlines that a green-only mask could miss.','No downstream disarm or weapon-swap request is prepared or submitted by this audit.']};
if(proposedFlag)Object.assign(report,{proposedAssessment});
fs.writeFileSync(path.join(out,proposedFlag?'independent-completion-proposed-audit.json':'independent-completion-body-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({jobId:e.job.id,frames:rows.map(({frame,newKeyPixels,newKeyOutsideOldHand,newOpaquePixels,changedBlackPixels,changedOriginalFootPixels,extraLegAddedOpaque,extraLegAddedKey,extraLegAddedNonkey})=>({frame,newKeyPixels,newKeyOutsideOldHand,newOpaquePixels,changedBlackPixels,changedOriginalFootPixels,extraLegAddedOpaque,extraLegAddedKey,extraLegAddedNonkey})),referenceChanges,qualified:false}));
