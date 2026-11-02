// Offline missing-frame preparation. No credentials, network or paid submissions.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {toChroma} from '../../../app/src/lib/image/chroma.ts';
import {padImg,packGrid,cutGrid,contactSheet} from '../../../app/src/lib/items/items.ts';
import {png} from '../../../app/src/lib/pixellab/routes.ts';

const root=path.resolve(import.meta.dirname,'../../..');
const old=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
fs.mkdirSync(out,{recursive:true});
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const reviewedBytes=fs.readFileSync(path.join(old,'reviewed-hand-landmarks-east-completion.json'));
const reviewed=JSON.parse(reviewedBytes.toString());
const armedBytes=fs.readFileSync(path.join(out,'managed-armed-disarm-probe.json'));
const armed=JSON.parse(armedBytes.toString());
const {canonicalHash:armedCanonicalHash,...armedContent}=armed;
if(hash(stableStringify(armedContent))!==armedCanonicalHash||armedCanonicalHash!=='834ba23d967c560dc61fd0d11dc17c2fa826c7f662e69b642f75f70447d4d341')throw new Error('Reviewed armed-reference packet changed.');
const sourceBytes=fs.readFileSync(path.join(old,'managed-equipment-evidence.json'));
if(hash(sourceBytes)!==armed.sourceEvidenceSha256)throw new Error('Original sword reference provenance changed.');
const evidence=JSON.parse(sourceBytes.toString());
const prior=evidence.probe.packet;
if(prior.characterId!=='30dc1dd5-3523-45a4-b749-3500498f33e8'||prior.animationGroupId!=='b356b46f-b7f4-4296-8902-267a269683cd'||prior.designJobId!=='c3df7cc0-e236-4d71-a246-d7028f376f70')throw new Error('The expected controlled body or sword design is missing.');
const indices=[0,2,5,7],cell=144,pad=16,cols=3;
const images=[],masks=[],frames=[],maskPlan=[];
for(const index of indices){
  const observation=reviewed.entries.find((v:any)=>v.frame===index);
  if(!observation)throw new Error('Missing reviewed hand/head landmarks.');
  const nativeBytes=fs.readFileSync(path.join(old,`managed/east/${index}.png`));
  const native=await decodePngBytes(nativeBytes),reencoded=Buffer.from(await encodePngBytes(native));
  if(native.w!==112||native.h!==112||hash(reencoded)!==observation.reencodedPngSha256||hash(native.data)!==observation.rgbaSha256)throw new Error('Native pixels differ from independent landmark review.');
  const reviewBytes=fs.readFileSync(path.join(old,observation.path));
  if(hash(reviewBytes)!==observation.sourcePngSha256)throw new Error('Independently reviewed original PNG changed.');
  const h=observation.headProtection,g=observation.grip;
  if(![g.x,g.y,h.xMin,h.xMax,h.yMin,h.yMax].every(Number.isFinite))throw new Error('Invalid reviewed landmarks.');
  const image=padImg(toChroma(native,'green'),pad),mask=new Uint8Array(cell*cell);
  let whitePixels=0,whiteBodyPixels=0,protectedHeadPixels=0,protectedFootPixels=0;
  const radius=40,bodyRadius=8;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
    const nx=x-pad,ny=y-pad,p=y*cell+x,opaque=image.data[p*4+3]>0;
    const head=opaque&&nx>=h.xMin&&nx<=h.xMax&&ny>=h.yMin&&ny<=h.yMax;
    const foot=opaque&&ny>=84;
    if(head)protectedHeadPixels++;if(foot)protectedFootPixels++;
    if(!head&&!foot&&Math.hypot(nx+.5-g.x,ny+.5-g.y)<=(opaque?bodyRadius:radius)){mask[p]=1;whitePixels++;if(opaque)whiteBodyPixels++;}
  }
  if(!whitePixels||!whiteBodyPixels)throw new Error('Each candidate needs a nonempty reviewed hand-authoring region.');
  images.push(image);masks.push(mask);
  frames.push({index,png:nativeBytes.toString('base64'),sha256:hash(nativeBytes),rgbaSha256:hash(native.data),reencodedPngSha256:hash(reencoded),reviewedPngSha256:hash(reviewBytes),reviewedRgbaSha256:observation.rgbaSha256,sourcePath:`workflow-reconciliation-2026-11-01/managed/east/${index}.png`,width:112,height:112});
  maskPlan.push({index,grip:g,observedGrip:g,head:{x:h.xMin,y:h.yMin,w:h.xMax-h.xMin+1,h:h.yMax-h.yMin+1},visibility:g.description??g.status,radius,bodyRadius,whitePixels,whiteBodyPixels,protectedHeadPixels,protectedFootPixels,note:'Only native source hand-region pixels may be redrawn. A newly frozen body will be defined after separate disarm and review. Inferred resting grips remain inferred.'});
}
const references=[];
for(const index of[1,6]){
  const f=armed.frames.find((v:any)=>v.index===index),b=Buffer.from(f.png,'base64');
  if(hash(b)!==f.sha256)throw new Error('Derived armed source-reference PNG changed.');
  const image=await decodePngBytes(b);if(image.w!==144||image.h!==144)throw new Error('Armed context must remain exactly144px.');
  images.push(image);masks.push(null);
  references.push({role:'armed-pose-context',direction:'east',index,png:f.png,sha256:f.sha256,width:144,height:144,sourceCanonicalHash:armedCanonicalHash,sourceEvidenceSha256:armed.sourceEvidenceSha256,sourceGridSha256:armed.sourceGridSha256,sourceJobId:armed.sourceJobId,cleanup:f.cleanup});
}
const grid=packGrid(images,masks,cols);
if(grid.image.w!==432||grid.image.h!==288)throw new Error('Unexpected completion grid.');
const cells=cutGrid(grid.image,6,cell,cell,cols),cuts=cutGrid(grid.mask,6,cell,cell,cols);
for(let i=0;i<6;i++)if(cells[i].data.some((v,p)=>v!==images[i].data[p]))throw new Error('Packing changed source pixels.');
for(let i=4;i<6;i++)for(let p=0;p<cell*cell;p++)if(cuts[i].data[p*4]||cuts[i].data[p*4+3]!==255)throw new Error('Reference cell is not black protected.');
const gridPng=Buffer.from(await encodePngBytes(grid.image)),maskPng=Buffer.from(await encodePngBytes(grid.mask));
const sized=(b:Buffer)=>({image:png(b.toString('base64')),size:{width:432,height:288}});
const description='This existing image is a 3x2 sprite-sheet grid of 144x144 pixel cells. Cells1-4 are east-facing target attack poses in source order0,2,5,7. Cells5-6 are already armed east-facing attack pose references1,6, showing the identical steel longsword with simple brown grip. Add exactly that ONE longsword to the character\'s right hand in each of the first four target cells. Follow the raised-arm windup, strike follow-through and hanging recovery shown by each target; maintain purposeful natural wrist and fist gripping, fingers in front of the handle, sensible steel blade perspective and consistent sword proportions. Bright green body colors are intentional chroma key. The white hand region permits limited purposeful hand authoring; do not invent extra hands or limbs. Preserve every black-masked pixel, protected head, feet, body outside the hand region, source direction, pose scale, grid geometry and both reference cells exactly. Change only white regions. No second sword, no left-hand weapon, no motion streaks, no effects. Do not copy an identical sword angle into all poses.';
const request={description,inpainting_image:sized(gridPng),mask_image:sized(maskPng),no_background:true,seed:734};
const packet={version:1,kind:'managed-equipment-probe',qualified:false,unqualified:true,characterId:prior.characterId,animationGroupId:prior.animationGroupId,direction:'east',cell,cols,indices,bodyPadding:pad,designJobId:prior.designJobId,frames,references,maskPlan,reviewedLandmarksSha256:hash(reviewedBytes),sourceEvidenceSha256:hash(sourceBytes),sourceArmedPacketCanonicalHash:armedCanonicalHash,gridSha256:hash(gridPng),maskSha256:hash(maskPng),notes:'Missing-frame armed-source authoring only. Both actual armed-pose reference cells are immutable. New hand geometry is not accepted as the old native body; freeze a new bare body only after a separately qualified disarm. Existing four-frame diagnostic verdicts and production qualification stay unchanged.',conservativeUnits:25,request};
const canonicalHash=hash(stableStringify(packet));
const packetBytes=Buffer.from(JSON.stringify(packet));
fs.writeFileSync(path.join(out,'armed-completion-probe.json'),packetBytes);
fs.writeFileSync(path.join(out,'armed-completion-probe-hashes.json'),JSON.stringify({canonicalHash,packetFileSha256:hash(packetBytes),canonicalDefinition:'SHA256 of shared stableStringify over the entire packet; packet has no self hash field.'},null,2)+'\n');
fs.writeFileSync(path.join(out,'armed-completion-input.png'),gridPng);
fs.writeFileSync(path.join(out,'armed-completion-mask.png'),maskPng);
fs.writeFileSync(path.join(out,'armed-completion-review.png'),await encodePngBytes(contactSheet([cells.slice(0,4),cuts.slice(0,4),cells.slice(4,6),cuts.slice(4,6)],3,2)));
console.log(JSON.stringify({prepared:true,size:[432,288],seed:734,canonicalHash,packetFileSha256:hash(packetBytes),targets:maskPlan.map(p=>({index:p.index,whitePixels:p.whitePixels,whiteBodyPixels:p.whiteBodyPixels,grip:p.grip})),references:references.map(r=>({role:r.role,direction:r.direction,sha256:r.sha256})),unqualified:true}));
