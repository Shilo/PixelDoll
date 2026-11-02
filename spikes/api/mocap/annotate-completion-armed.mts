// Offline, manually reviewed completion derivative and disarm preparation. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {keyScore,KT} from '../../../app/src/lib/image/chroma.ts';
import {cutGrid,packGrid,contactSheet,padImg} from '../../../app/src/lib/items/items.ts';
import {png} from '../../../app/src/lib/pixellab/routes.ts';

const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const evidenceBytes=fs.readFileSync(path.join(out,'armed-completion-evidence.json'));
const ledgerBytes=fs.readFileSync(path.join(out,'completion-proposed-corrections.json'));
if(sha(evidenceBytes)!=='1c57bfc3c6a6ebbddbe70e943b9661af5b965de0292240b9bdfb575400f491b3'||sha(ledgerBytes)!=='b890c01458c5493c6b7527bfe80527fbcb695c094a3ea2b59e0044429ce3daed')throw new Error('Reviewed receipt or explicit pixel ledger changed.');
const evidence=JSON.parse(evidenceBytes.toString()),ledger=JSON.parse(ledgerBytes.toString());
const rawGridBytes=Buffer.from(evidence.images[0].png,'base64');
if(sha(rawGridBytes)!==evidence.images[0].sha||sha(rawGridBytes)!=='70ce15e8288abfad0186b9dab24b7e6103ed34e93e96875a5ce11eb2311adb20')throw new Error('Reviewed raw source grid changed.');
const rawCells=cutGrid(await decodePngBytes(rawGridBytes),6,144,144,3);
const plans=[
  {index:0,bounds:[58,73,104,103],unknown:[[73,80],[70,85],[70,86]],grip:{x:74,y:84,uncertaintyPx:3,status:'Hand at hip partly occluded; source-aligned grip, not measured hidden finger closure.'}},
  {index:2,bounds:[33,23,77,51],unknown:[[64,42]],grip:{x:67,y:44,uncertaintyPx:3,status:'Raised fist above skull; retained source hand geometry, forearm connection partly head-occluded and anatomically unqualified.'}},
  {index:5,bounds:[80,76,125,102],unknown:[[83,79],[94,81]],grip:{x:93,y:82,uncertaintyPx:2,status:'Visible forward/down fist; uncertain undersaturated hilt/body seam.'}},
  {index:7,bounds:[60,73,104,104],unknown:[[74,87],[73,88],[73,89],[71,90]],grip:{x:74,y:84,uncertaintyPx:3,status:'Hanging hand against hip; finger closure partly occluded, not independently measured.'}},
];
const frames=[],images:Img[]=[],masks:Uint8Array[]=[],review:Img[][]=[];
for(const [i,plan]of plans.entries()){
  const reviewed=ledger.frames.find((f:any)=>f.index===plan.index),raw=rawCells[i];
  const image:Img={...raw,data:new Uint8ClampedArray(raw.data)};
  if(sha(raw.data)!==reviewed.rawRgbaSha256)throw new Error('Source cell differs from reviewed ledger.');
  const original=reviewed.originalBodyReference;
  const natural=await decodePngBytes(Buffer.from(original.png,'base64'));
  const paddedNatural=padImg(natural,16);
  if(natural.w!==112||natural.h!==112||sha(Buffer.from(original.png,'base64'))!==original.sha256)throw new Error('Original body reference changed.');
  const changed=new Set<number>();
  for(const c of reviewed.corrections){
    const p=c.y*144+c.x,q=p*4;
    if(changed.has(p)||c.to.some(Boolean)||paddedNatural.data[q+3]||c.from.some((v:number,k:number)=>raw.data[q+k]!==v))throw new Error('Unsafe or duplicate explicit correction.');
    image.data.set(c.to,q);changed.add(p);
  }
  if(changed.size!==({0:27,2:1,5:114,7:2} as Record<number,number>)[plan.index]||sha(image.data)!==reviewed.rgbaSha256)throw new Error('Derived source or correction count changed.');
  const W=makeImg(144,144),B=makeImg(144,144),U=makeImg(144,144),D=makeImg(144,144),tri=makeImg(144,144),m=new Uint8Array(144*144);
  const unknown=new Set(plan.unknown.map(([x,y])=>x+','+y)),counts={weapon:0,body:0,unknown:0,transparent:0};
  for(let p=0;p<144*144;p++){
    const q=p*4,x=p%144,y=Math.floor(p/144),alpha=image.data[q+3],key=alpha>0&&keyScore('green',image.data[q],image.data[q+1],image.data[q+2])>=KT;
    if(alpha!==0&&alpha!==255)throw new Error('Partial alpha needs separate review.');
    const uncertain=alpha>0&&unknown.has(x+','+y);
    if(uncertain&&key)throw new Error('Unknown marker would override protected key body.');
    const [x0,y0,x1,y1]=plan.bounds,weapon=alpha>0&&!key&&!uncertain&&x>=x0&&x<=x1&&y>=y0&&y<=y1;
    if(alpha>0&&!key&&!uncertain&&!weapon)throw new Error(`Unreviewed non-key source ${plan.index}/${x},${y}`);
    const role=weapon?'weapon':uncertain?'unknown':key?'body':'transparent';counts[role]++;
    for(const [im,white]of [[W,weapon],[B,key],[U,uncertain],[D,weapon||uncertain]] as const)im.data.set([white?255:0,white?255:0,white?255:0,255],q);
    tri.data.set(weapon?[255,0,255,255]:uncertain?[255,196,0,255]:key?[0,192,255,255]:[0,0,0,0],q);
    if(weapon||uncertain)m[p]=1;
  }
  const encode=async(im:Img)=>Buffer.from(await encodePngBytes(im));
  const sourcePng=await encode(image),rawPng=await encode(raw),w=await encode(W),b=await encode(B),u=await encode(U),d=await encode(D);
  if(sha(sourcePng)!==reviewed.sha256)throw new Error('Derived PNG differs from independently reviewed preview.');
  const stem=`completion-armed-${plan.index}`;
  for(const [suffix,bytes]of [['derived',sourcePng],['weapon-mask',w],['body-mask',b],['unknown-mask',u],['edit-mask',d]] as const)fs.writeFileSync(path.join(out,stem+'-'+suffix+'.png'),bytes);
  frames.push({index:plan.index,png:sourcePng.toString('base64'),sha256:sha(sourcePng),rgbaSha256:sha(image.data),rawSha256:sha(rawPng),rawRgbaSha256:sha(raw.data),weaponMask:w.toString('base64'),bodyMask:b.toString('base64'),unknownMask:u.toString('base64'),editMask:d.toString('base64'),maskHashes:{weapon:sha(w),body:sha(b),unknown:sha(u),edit:sha(d)},counts,cleanup:reviewed.corrections,manualWeaponBounds:plan.bounds,unknownCoordinates:plan.unknown,grip:plan.grip,originalBodyReference:{index:plan.index,png:original.png,sha256:original.sha256,width:112,height:112,padding:16},notes:plan.index===2?'All20 source-added green raised-hand pixels are retained. No certification of hidden wrist/elbow anatomy.':plan.index===0?'Isolated new green pixel65,82 remains source-body evidence with unresolved interpretation; no silent cleanup.':'Only explicitly reviewed component corrections applied.',qualified:false});
  images.push(image);masks.push(m);review.push([raw,image,tri,W,U,D]);
}
const grid=packGrid(images,masks,2);
if(grid.image.w!==288||grid.image.h!==288)throw new Error('Unexpected disarm grid.');
const gridBytes=Buffer.from(await encodePngBytes(grid.image)),maskBytes=Buffer.from(await encodePngBytes(grid.mask));
const sized=(b:Buffer)=>({image:png(b.toString('base64')),size:{width:288,height:288}});
const description='This existing image is a 2x2 sprite-sheet grid of four144x144 pixel cells, east-facing attack poses in source order0,2,5,7. Remove each complete steel longsword, guard, brown grip and pommel. Preserve all existing visible green body and fist pixels protected by the black mask. In white regions only, remove the prop and reveal a plausible empty closed green fist or hidden green body where the sword covered it; otherwise restore transparent background. Bright green is intentional chroma key and must remain bright green. No skin tones, replacement weapon, prop, effects, extra fingers, hands or limbs. Preserve every black-masked pixel, existing transparent background, head, feet, pose, direction, scale and grid geometry exactly. Do not shift or resize any cell. Newly revealed body is a proposed frozen base, not recovered anatomy.';
const request={description,inpainting_image:sized(gridBytes),mask_image:sized(maskBytes),no_background:true,seed:735};
const packet={version:1,kind:'weapon-aware-disarm',unqualified:true,qualified:false,cell:144,cols:2,indices:plans.map(p=>p.index),direction:'east',sourceEvidenceSha256:sha(evidenceBytes),sourceGridSha256:sha(rawGridBytes),sourceJobId:evidence.job.id,sourceRequestHash:evidence.job.requestHash,sourceReferenceJobId:evidence.probe.packet.designJobId,sourceArmedPacketCanonicalHash:sha(stableStringify(evidence.probe.packet)),sourceCorrectionLedgerSha256:sha(ledgerBytes),sourceCorrectionTotal:144,gridSha256:sha(gridBytes),maskSha256:sha(maskBytes),cleanup:frames.flatMap(f=>f.cleanup.map((c:any)=>({index:f.index,...c}))),frames,conservativeUnits:25,maskContract:'Exploratory D=W+U. Every known source key body pixel and derived-source transparent pixel remains black. Explicit U is not proven pure weapon.',reconstructionTarget:'Only the separately reviewed144-pixel corrected derivative. Raw734source retains its recorded anatomy failure; no raw reconstruction or professional motion pass claimed.',paletteWarning:'New hidden body colors require authored palette mapping. Never place skin patches in weapon item layers.',request};
const canonicalHash=sha(stableStringify(packet));
fs.writeFileSync(path.join(out,'completion-disarm-probe.json'),JSON.stringify({...packet,canonicalHash}));
fs.writeFileSync(path.join(out,'completion-disarm-input.png'),gridBytes);
fs.writeFileSync(path.join(out,'completion-disarm-mask.png'),maskBytes);
fs.writeFileSync(path.join(out,'completion-disarm-review.png'),await encodePngBytes(contactSheet(review,3,2)));
console.log(JSON.stringify({prepared:true,canonicalHash,sourceEvidenceSha256:sha(evidenceBytes),sourceCorrectionLedgerSha256:sha(ledgerBytes),size:[288,288],seed:735,corrections:144,frames:frames.map(f=>({index:f.index,sha256:f.sha256,counts:f.counts})),unqualified:true}));
