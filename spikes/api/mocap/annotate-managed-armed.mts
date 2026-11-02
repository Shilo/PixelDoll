// Offline preparation only. No credentials, network or paid submissions.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';
import {keyScore,KT} from '../../../app/src/lib/image/chroma.ts';
import {cutGrid,packGrid,contactSheet} from '../../../app/src/lib/items/items.ts';
import {png} from '../../../app/src/lib/pixellab/routes.ts';

type Point=[number,number];
const root=path.resolve(import.meta.dirname,'../../..');
const sourceDir=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const out=path.join(root,'spikes/api/out/weapon-aware-2026-11-02');
fs.mkdirSync(out,{recursive:true});
const sha=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const bytes=fs.readFileSync(path.join(sourceDir,'managed-equipment-evidence.json'));
const evidence=JSON.parse(bytes.toString());
if(sha(bytes)!=='0a02cd5f4e06bbe6fd173e362e927a9b181667d1da17c967d13d0f956f1df305')throw new Error('Manually reviewed source evidence changed.');
const sourceBytes=Buffer.from(evidence.images[0].png,'base64');
if(sha(sourceBytes)!=='4c6efdd48437ad312ead85b3ae6751f60905ec4e7711ae946644eb0670cc2e1f'||sha(sourceBytes)!==evidence.images[0].sha)throw new Error('Raw provider source grid changed.');
const sourceGrid=await decodePngBytes(sourceBytes);
const sources=cutGrid(sourceGrid,6,144,144,3).slice(0,4);
const plans=[
  {index:1,weaponBounds:[35,23,78,51],unknown:[[65,41],[63,44]] as Point[],cleanup:[[63,55]] as Point[],grip:{x:67,y:44,uncertaintyPx:3,status:'Provider-added raised green fist beside head; source geometry adopted, original frozen fist not retained.'}},
  {index:3,weaponBounds:[82,64,121,98],unknown:[[85,68],[95,72],[96,74],[95,76]] as Point[],cleanup:[] as Point[],grip:{x:93,y:73,uncertaintyPx:2,status:'Visible green fist/palm with uncertain dark boundary pixels.'}},
  {index:4,weaponBounds:[79,75,122,103],unknown:[[86,81],[88,86],[91,86],[91,87]] as Point[],cleanup:[[68,101]] as Point[],grip:{x:91,y:81,uncertaintyPx:2,status:'Visible green fist/palm with olive and undersaturated rim ambiguity.'}},
  {index:6,weaponBounds:[60,73,103,109],unknown:[[69,85],[79,92]] as Point[],cleanup:[] as Point[],grip:{x:76,y:86,uncertaintyPx:3,status:'Hand partly merged with hip; closed grip anatomy not independently measured. Blade also occludes leg.'}},
];
const frames=[];const derived:Img[]=[],edits:Uint8Array[]=[],raws:Img[]=[],reviews:Img[][]=[];
for(const [i,plan]of plans.entries()){
  const raw=sources[i],image:Img={...raw,data:new Uint8ClampedArray(raw.data)};
  const cleanup=[];
  for(const [x,y]of plan.cleanup){
    const q=(y*144+x)*4,old=Array.from(image.data.subarray(q,q+4));
    if(old.some(v=>v!==255))throw new Error('Cleanup whitelist pixel is not the reviewed isolated white speck.');
    // Isolated in the non-key mask; adjacent green body is intentionally allowed.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const a=((y+dy)*144+x+dx)*4;if(image.data[a+3]&&keyScore('green',image.data[a],image.data[a+1],image.data[a+2])<KT)throw new Error('Cleanup speck is no longer an isolated non-key component.');}
    image.data.fill(0,q,q+4);cleanup.push({x,y,from:old,to:[0,0,0,0],reason:'independently-confirmed-isolated-white-artifact-not-weapon'});
  }
  const W=makeImg(144,144),B=makeImg(144,144),U=makeImg(144,144),D=makeImg(144,144),tri=makeImg(144,144),mask=new Uint8Array(144*144);
  const unknown=new Set(plan.unknown.map(p=>p.join(',')));
  const counts={weapon:0,body:0,unknown:0,transparent:0};
  for(let p=0;p<144*144;p++){
    const q=p*4,x=p%144,y=Math.floor(p/144),alpha=image.data[q+3];
    if(alpha!==0&&alpha!==255)throw new Error('Unexpected partial alpha needs separate manual review.');
    const key=alpha>0&&keyScore('green',image.data[q],image.data[q+1],image.data[q+2])>=KT;
    const uncertain=alpha>0&&unknown.has(x+','+y);
    if(uncertain&&key)throw new Error('Unknown point would override known key body.');
    const [x0,y0,x1,y1]=plan.weaponBounds;
    const weapon=alpha>0&&!key&&!uncertain&&x>=x0&&x<=x1&&y>=y0&&y<=y1;
    if(alpha>0&&!key&&!uncertain&&!weapon)throw new Error(`Unreviewed non-key pixel ${plan.index}/${x},${y}`);
    const label=weapon?'weapon':uncertain?'unknown':key?'body':'transparent';counts[label]++;
    for(const [im,white]of [[W,weapon],[B,key],[U,uncertain],[D,weapon||uncertain]] as const)im.data.set([white?255:0,white?255:0,white?255:0,255],q);
    tri.data.set(weapon?[255,0,255,255]:uncertain?[255,196,0,255]:key?[0,192,255,255]:[0,0,0,0],q);
    if(weapon||uncertain)mask[p]=1;
  }
  const encoded=async(im:Img)=>Buffer.from(await encodePngBytes(im));
  const rawPng=await encoded(raw),bodyPng=await encoded(image),weaponPng=await encoded(W),knownBodyPng=await encoded(B),unknownPng=await encoded(U),editPng=await encoded(D);
  const stem=`managed-armed-${plan.index}`;
  for(const [suffix,data]of [['raw',rawPng],['derived',bodyPng],['weapon-mask',weaponPng],['body-mask',knownBodyPng],['unknown-mask',unknownPng],['edit-mask',editPng]] as const)fs.writeFileSync(path.join(out,stem+'-'+suffix+'.png'),data);
  fs.writeFileSync(path.join(out,stem+'-tri-state.png'),await encoded(tri));
  const original=evidence.probe.packet.frames[i];
  if(original.index!==plan.index)throw new Error('Original frame order changed.');
  frames.push({index:plan.index,png:bodyPng.toString('base64'),sha256:sha(bodyPng),rgbaSha256:sha(image.data),rawSha256:sha(rawPng),rawRgbaSha256:sha(raw.data),weaponMask:weaponPng.toString('base64'),bodyMask:knownBodyPng.toString('base64'),unknownMask:unknownPng.toString('base64'),editMask:editPng.toString('base64'),maskHashes:{weapon:sha(weaponPng),body:sha(knownBodyPng),unknown:sha(unknownPng),edit:sha(editPng)},counts,cleanup,manualWeaponBounds:plan.weaponBounds,unknownCoordinates:plan.unknown,grip:plan.grip,originalBodyReference:{index:original.index,png:original.png,sha256:original.sha256,width:112,height:112,padding:16},qualified:false});
  raws.push(raw);derived.push(image);edits.push(mask);reviews.push([raw,image,tri,W,U,D]);
}
const grid=packGrid(derived,edits,2),rawGrid=packGrid(raws,raws.map(()=>null),2).image;
if(grid.image.w!==288||grid.image.h!==288)throw new Error('Unexpected prepared grid size.');
const cuts=cutGrid(grid.image,4,144,144,2);
if(cuts.some((c,i)=>c.data.some((v,p)=>v!==derived[i].data[p])))throw new Error('Grid packing changed source pixels.');
const gridBytes=Buffer.from(await encodePngBytes(grid.image)),maskBytes=Buffer.from(await encodePngBytes(grid.mask));
const description='This existing image is a 2x2 sprite-sheet grid of four 144x144 pixel cells, east-facing overhead attack poses in source order1,3,4,6. Remove the complete steel longsword, guard, brown grip and pommel from each cell. Preserve every visible bright green mannequin body pixel and existing fist pose protected by black mask. In white regions only, remove the prop and reveal a plausible empty closed green fist or the hidden green body where the sword covered it; where no body belongs restore transparent background. Bright green is intentional chroma key and must remain bright green. Do not add skin tones, weapons, props, motion streaks, extra fingers or limbs. Preserve all black-masked pixels, existing transparent background, head, feet, pose, scale, direction, silhouette outside white regions and grid geometry exactly. Do not shift, resize or realign any cell. Newly revealed pixels are a proposed new frozen body, not recovered anatomy.';
const sized=(b:Buffer)=>({image:png(b.toString('base64')),size:{width:288,height:288}});
const request={description,inpainting_image:sized(gridBytes),mask_image:sized(maskBytes),no_background:true,seed:732};
const packet={version:1,kind:'weapon-aware-disarm',unqualified:true,qualified:false,cell:144,cols:2,indices:plans.map(p=>p.index),direction:'east',sourceEvidenceSha256:sha(bytes),sourceGridSha256:sha(sourceBytes),sourceJobId:evidence.job.id,sourceRequestHash:evidence.job.requestHash,sourceReferenceJobId:evidence.probe.packet.designJobId,gridSha256:sha(gridBytes),maskSha256:sha(maskBytes),cleanup:frames.flatMap(f=>f.cleanup.map(c=>({index:f.index,...c}))),frames,conservativeUnits:25,maskContract:'Exploratory D=W+U. Every known key body pixel and original C-prime transparent pixel is black. U is explicitly uncertain body-rim/hilt boundary, not certified weapon.',reconstructionTarget:'Derived C-prime only. Two explicitly logged isolated white specks were removed from raw C; exact raw-C reconstruction is not claimed.',paletteWarning:'Green conversion is not globally invertible. New body colors require an explicit body palette mapping and later visual qualification. No skin patch belongs in weapon layer.',request};
const canonicalHash=sha(stableStringify(packet));
fs.writeFileSync(path.join(out,'managed-armed-disarm-probe.json'),JSON.stringify({...packet,canonicalHash}));
fs.writeFileSync(path.join(out,'managed-armed-input.png'),gridBytes);
fs.writeFileSync(path.join(out,'managed-armed-mask.png'),maskBytes);
fs.writeFileSync(path.join(out,'managed-armed-raw-grid.png'),await encodePngBytes(rawGrid));
fs.writeFileSync(path.join(out,'managed-armed-review.png'),await encodePngBytes(contactSheet(reviews,3,2)));
console.log(JSON.stringify({prepared:true,canonicalHash,sourceEvidenceSha256:sha(bytes),size:[288,288],seed:732,frames:frames.map(f=>({index:f.index,sha256:f.sha256,counts:f.counts,cleanup:f.cleanup})),unqualified:true}));
