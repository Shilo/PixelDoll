// Offline preparation only. No provider calls. Hand coordinates require explicit visual review.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {padImg,packGrid,cutGrid,contactSheet,gridFits} from '../../../app/src/lib/items/items.ts';
import {toChroma} from '../../../app/src/lib/image/chroma.ts';
import {png} from '../../../app/src/lib/pixellab/routes.ts';

const root=path.resolve(import.meta.dirname,'../../..');
const out=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const previous=path.join(root,'spikes/api/out/motion-targeted-2026-10-28');
const evidence=JSON.parse(fs.readFileSync(path.join(out,'body-evidence.json'),'utf8'));
const old=JSON.parse(fs.readFileSync(path.join(previous,'evidence.json'),'utf8'));
const designId='c3df7cc0-e236-4d71-a246-d7028f376f70';
const dress=old.records.find((r:any)=>r.job?.id===designId);
const indices=[1,3,4,6],pad=16,cell=144,cols=3,direction='east';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
if(evidence.pilot.verification?.length!==4||evidence.pilot.verification.some((v:any)=>v.changedPixels))throw new Error('Exact reference verification is missing.');
if(dress?.job.state!=='done'||dress.images.length!==3||dress.context.key!=='green')throw new Error('The frozen three-view sword design is unavailable.');
if(!gridFits({w:cell,h:cell},indices.length,2,cols))throw new Error('Prepared grid exceeds supported size.');

const frames=await Promise.all(indices.map(async index=>{
  const bytes=fs.readFileSync(path.join(out,'managed',direction,`${index}.png`)),image=await decodePngBytes(bytes);
  if(image.w!==112||image.h!==112)throw new Error('Expected exact native 112px managed frames.');
  return{index,sha256:hash(bytes),png:bytes.toString('base64'),image};
}));
const refs=await Promise.all((['east','south']as const).map(async view=>{
  const record=dress.context.references[view];
  if(record?.sha!==evidence.pilot.source[view])throw new Error('Sword design was not dressed on the same adult reference.');
  const saved=dress.images[record.index],bytes=Buffer.from(saved.png,'base64'),image=await decodePngBytes(bytes);
  if(hash(bytes)!==saved.sha||image.w!==112||image.h!==112)throw new Error('Sword reference hash or canvas changed.');
  return{direction:view,sha256:saved.sha,standingReferenceSha:record.sha,png:saved.png,image};
}));
const review=path.join(root,'app/test-results-managed-equipment-preparation');fs.mkdirSync(review,{recursive:true});
fs.writeFileSync(path.join(review,'index.html'),`<!doctype html><meta charset="utf-8"><title>Frozen managed hand inspection</title><style>body{background:#18181c;color:#eee;font:16px system-ui;margin:24px}.frames{display:flex;flex-wrap:wrap;gap:20px}canvas{width:448px;height:448px;image-rendering:pixelated;background:repeating-conic-gradient(#555 0 25%,#666 0 50%) 0/32px 32px}pre{white-space:pre-wrap}</style><h1>Frozen managed east hand inspection</h1><p>Native112x112. Frame numbers are zero-based. Click a visible grip center; coordinates are native pixels. This records an observation only. Hidden hands must remain unknown.</p><div class="frames"></div><pre id="marks">No observations yet.</pre><script>const frames=${JSON.stringify(frames.map(({index,png})=>({index,png})))};const marks={};for(const f of frames){const article=document.createElement('article');article.innerHTML='<h2>East frame '+f.index+'</h2>';const canvas=document.createElement('canvas');canvas.width=canvas.height=112;article.append(canvas);const label=document.createElement('p');label.textContent='Pointer coordinate';article.append(label);document.querySelector('.frames').append(article);const ctx=canvas.getContext('2d'),image=new Image();image.src='data:image/png;base64,'+f.png;image.onload=()=>ctx.drawImage(image,0,0);function point(event){const r=canvas.getBoundingClientRect();return{x:Math.floor((event.clientX-r.left)*112/r.width),y:Math.floor((event.clientY-r.top)*112/r.height)}}canvas.onmousemove=e=>label.textContent=JSON.stringify(point(e));canvas.onclick=e=>{marks[f.index]=point(e);document.querySelector('#marks').textContent=JSON.stringify(marks,null,2)}};</script>`);
fs.writeFileSync(path.join(out,'managed-equipment-source-review.png'),await encodePngBytes(contactSheet([frames.map(f=>f.image)],4,2)));

const planArg=process.argv.indexOf('--plan');
if(planArg<0){console.log(JSON.stringify({prepared:false,review:'http://localhost:5199/test-results-managed-equipment-preparation/index.html',indices,note:'Supply --plan <reviewed-mask-plan.json> after observing native grip/face coordinates. No paid request prepared.'}));process.exit(0);}
const plan=JSON.parse(fs.readFileSync(path.resolve(process.argv[planArg+1]),'utf8'));
if(plan.version!==1||!Array.isArray(plan.frames)||plan.frames.length!==indices.length||typeof plan.notes!=='string'||!plan.notes.trim())throw new Error('A version1 mask plan needs all four reviewed frames and notes.');
const reviewedBytes=fs.readFileSync(path.join(out,'reviewed-hand-landmarks.json'));
const reviewed=JSON.parse(reviewedBytes.toString('utf8'));
if(reviewed.schemaVersion!==1||!Array.isArray(reviewed.entries))throw new Error('Independent hand observations are unavailable.');
const images=[],masks=[],maskReview=[];
for(const frame of frames){
  const p=plan.frames.find((p:any)=>p.index===frame.index);
  if(!p||!p.grip||![p.grip.x,p.grip.y,p.radius,p.bodyRadius,p.head?.x,p.head?.y,p.head?.w,p.head?.h].every(Number.isFinite)||p.radius<4||p.radius>40||p.bodyRadius<1||p.bodyRadius>10||p.grip.x<0||p.grip.x>=112||p.grip.y<0||p.grip.y>=112||p.head.w<=0||p.head.h<=0||typeof p.visibility!=='string'||!p.visibility.trim())throw new Error('Each mask needs reviewed native grip, radius4-40, body radius1-10, head box and visibility label.');
  const observation=reviewed.entries.find((e:any)=>e.frame===frame.index),reviewPath=path.join(out,`blind-B-east/${frame.index}.png`),reviewBytes=fs.readFileSync(reviewPath),reviewImage=await decodePngBytes(reviewBytes);
  if(!observation||observation.path!==`blind-B-east/${frame.index}.png`||hash(reviewBytes)!==observation.sha256||reviewImage.w!==112||reviewImage.h!==112||reviewImage.data.some((v,i)=>v!==frame.image.data[i]))throw new Error('Reviewed PNGs differ from the exact managed native pixels.');
  const h=observation.headProtection;
  if(p.grip.x!==observation.grip.x||p.grip.y!==observation.grip.y||p.head.x!==h.xMin||p.head.y!==h.yMin||p.head.w!==h.xMax-h.xMin+1||p.head.h!==h.yMax-h.yMin+1)throw new Error('Mask plan differs from the independent hand/head observations. Re-review instead of silently changing measurements.');
  const image=padImg(toChroma(frame.image,'green'),pad),mask=new Uint8Array(cell*cell);
  let white=0,whiteBody=0;
  for(let y=0;y<112;y++)for(let x=0;x<112;x++){
    // Body toes and head stay protected even if the hand disk overlaps them.
    const opaque=frame.image.data[(y*112+x)*4+3]>0;
    const protectedHead=opaque&&x>=p.head.x&&x<p.head.x+p.head.w&&y>=p.head.y&&y<p.head.y+p.head.h;
    const protectedFoot=opaque&&y>=84;
    const finger=(p.fingerOccluders??[]).some((q:any)=>q.x===x&&q.y===y);
    const radius=opaque?Math.min(p.radius,p.bodyRadius):p.radius;
    if(!protectedHead&&!protectedFoot&&!finger&&Math.hypot(x+0.5-p.grip.x,y+0.5-p.grip.y)<=radius){mask[(y+pad)*cell+x+pad]=1;white++;if(opaque)whiteBody++;}
  }
  // Let the sword extend into the new border; its head/foot protection applies in native space.
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(x<pad||x>=pad+112||y<pad||y>=pad+112){const nx=x-pad,ny=y-pad;if(Math.hypot(nx+0.5-p.grip.x,ny+0.5-p.grip.y)<=p.radius){mask[y*cell+x]=1;white++;}}
  if(!white)throw new Error('An empty editable mask is not a probe.');
  images.push(image);masks.push(mask);maskReview.push({index:frame.index,sourceSha256:frame.sha256,reviewedPngSha256:observation.sha256,nativeRgbaSha256:hash(Buffer.from(frame.image.data)),observedGrip:observation.grip,...p,whitePixels:white,whiteBodyPixels:whiteBody,note:'White body pixels may be redrawn. Frozen-body recomposition does not establish correct finger occlusion or prevent item-color spill.'});
}
for(const r of refs){images.push(padImg(r.image,pad));masks.push(null);}
const grid=packGrid(images,masks,cols);
if(grid.image.w!==432||grid.image.h!==288)throw new Error('Unexpected packed grid geometry.');
const cuts=cutGrid(grid.image,images.length,cell,cell,cols);
if(cuts.some((im,i)=>im.data.some((v,p)=>v!==images[i].data[p])))throw new Error('Packed grid does not preserve exact source cells.');
const sized=async(image:typeof grid.image)=>({image:png(Buffer.from(await encodePngBytes(image)).toString('base64')),size:{width:image.w,height:image.h}});
const description='This existing image is a 3x2 sprite-sheet grid of 144x144 pixel cells. The first four cells, left to right then top to bottom, are frozen east-facing overhead-strike frames in source order1,3,4,6. The final two cells are the identical steel longsword design references, east then south. Add exactly that one steel longsword with a simple brown grip to the character\'s right hand in each target. The hilt must pass through the fist naturally; fingers occlude the grip correctly. The blade follows the bent arm through overhead windup, downward strike and recovery, with appropriate east-facing perspective and foreshortening. No second sword, no sword in the left hand, no effects. Bright green body colors are an intentional chroma key. Preserve all black-masked pixels, faces, feet, poses, grid geometry, reference cells and transparent background exactly. Change only white-masked regions. Do not turn the body or redraw the reference design.';
const request={description,inpainting_image:await sized(grid.image),mask_image:await sized(grid.mask),no_background:true,seed:731};
const output={version:1,kind:'managed-equipment-probe',qualified:false,characterId:evidence.pilot.characterId,animationGroupId:evidence.pilot.character.animations[0].animation_group_id,direction,cell,cols,indices,bodyPadding:pad,designJobId:designId,frames:frames.map(({image,...f})=>f),references:refs.map(({image,...r})=>r),maskPlan:maskReview,reviewedLandmarksSha256:hash(reviewedBytes),notes:plan.notes,conservativeUnits:25,request};
fs.writeFileSync(path.join(out,'managed-equipment-probe.json'),JSON.stringify(output));
fs.writeFileSync(path.join(out,'managed-equipment-input.png'),await encodePngBytes(grid.image));
fs.writeFileSync(path.join(out,'managed-equipment-mask.png'),await encodePngBytes(grid.mask));
console.log(JSON.stringify({prepared:true,size:[grid.image.w,grid.image.h],frames:maskReview.map(({index,whitePixels,whiteBodyPixels})=>({index,whitePixels,whiteBodyPixels})),references:refs.map(r=>({direction:r.direction,sha256:r.sha256})),units:25,qualified:false}));
