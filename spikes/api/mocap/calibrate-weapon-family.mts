// Offline measurements and an explicitly illustrative authoring guide. No paid calls or source-pixel changes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {makeImg,type Img} from '../../../app/src/lib/image/png.ts';
import {hardMaskBits} from '../../../app/src/lib/image/hard-mask.ts';
import {axisOf,angleDiff,cutGrid,contactSheet,recompose} from '../../../app/src/lib/items/items.ts';
import {components,chromaMask} from '../../../app/src/lib/image/chroma.ts';
import {centroid,maskOf} from '../../../app/src/lib/image/similarity.ts';
import {stableStringify} from '../../../app/src/lib/image/hash.ts';

const out=path.resolve(import.meta.dirname,'../out/weapon-aware-2026-11-02'),sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const inputs=new Map<string,string>();
function bytes(name:string){const data=fs.readFileSync(path.join(out,name));inputs.set(name,sha(data));return data;}
const read=(name:string)=>JSON.parse(bytes(name).toString('utf8'));
const decode=(png:string)=>decodePngBytes(Buffer.from(png,'base64'));
const recipe=read('body-star-v2-recipe.json'),skinAudit=read('independent-body-family-v2-audit.json'),old=read('swap-evidence.json'),completion=read('swap-completion-evidence.json');
function pin(value:any,expected:string){if(value.canonicalHash!==expected||sha(stableStringify({...value,canonicalHash:undefined}))!==expected)throw new Error('A reviewed input pin changed.');}
pin(recipe,'4458544f88245b1a96db2c1781f857a2f306271014009574bf0ac11de5fb8fd8');
pin(old.probe.packet,'287f215152db5ea978fd4319b1c3025344a9046a6c28b665f7e44402d261a56b');
pin(completion.probe.packet,'8fb5ba7f0464f71ebb622d704490d4b223eea09bdc43d1c2ee24ddda310ba9ce');
if(skinAudit.bodyRecipeCanonicalHash!==recipe.canonicalHash)throw new Error('The frozen skin audit belongs to another body recipe.');
const actual=new Map<number,{output:Img;frame:any;jobId:string;resultSha:string}>();
for(const evidence of [old,completion]){
  if(evidence.job.state!=='done'||evidence.images.length!==1)throw new Error('Actual completed hatchet evidence is required.');
  const raw=Buffer.from(evidence.images[0].png,'base64');if(sha(raw)!==evidence.images[0].sha)throw new Error('Actual provider PNG changed.');
  const cells=cutGrid(await decodePngBytes(raw),evidence.probe.packet.cols===3?6:4,144,144,evidence.probe.packet.cols);
  for(const[i,frame]of evidence.probe.packet.frames.entries())actual.set(frame.index,{output:cells[i],frame,jobId:evidence.job.id,resultSha:evidence.images[0].sha});
}
type Point=[number,number];
const points=(mask:Uint8Array)=>Array.from(mask.entries()).filter(([,v])=>v).map(([p])=>[p%144+.5,Math.floor(p/144)+.5] as Point);
const count=(mask:Uint8Array)=>mask.reduce((n,v)=>n+v,0);
const copy=(image:Img):Img=>({...image,data:new Uint8ClampedArray(image.data)});
function bounds(mask:Uint8Array){const ps=points(mask);return ps.length?{x:Math.min(...ps.map(p=>p[0]))-.5,y:Math.min(...ps.map(p=>p[1]))-.5,w:Math.max(...ps.map(p=>p[0]))-Math.min(...ps.map(p=>p[0]))+1,h:Math.max(...ps.map(p=>p[1]))-Math.min(...ps.map(p=>p[1]))+1}:null;}
function center(mask:Uint8Array):Point|null{const c=centroid(mask,144);return c?[c[0]+.5,c[1]+.5]:null;}
function interval(mask:Uint8Array,angle:number,origin:Point){
  const values=points(mask).map(([x,y])=>(x-origin[0])*Math.cos(angle)+(y-origin[1])*Math.sin(angle)),support=.5*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)));
  return values.length?{min:Math.min(...values)-support,max:Math.max(...values)+support,length:Math.max(...values)-Math.min(...values)+2*support}:null;
}
function distance(mask:Uint8Array,g:Point){const ps=points(mask);return ps.length?Math.min(...ps.map(([x,y])=>Math.hypot(x-g[0],y-g[1]))):null;}
const deg=(angle:number)=>angle*180/Math.PI;
const directionDifference=(a:number,b:number)=>Math.abs(((deg(a-b)+540)%360)-180);
function measure(image:Img,g:Point,kind:'sword'|'hatchet'){
  const raw=maskOf(image),wood=raw.map((v,p)=>{const[r,g,b]=image.data.subarray(p*4,p*4+3);return v&&r-g>=10&&g-b>=8?1:0;}),iron=raw.map((v,p)=>{const c=image.data.subarray(p*4,p*4+3);return v&&Math.max(...c)-Math.min(...c)<=4?1:0;});
  const metalParts=components(iron,144,144).sort((a,b)=>b.length-a.length),head=new Uint8Array(raw.length);for(const p of metalParts[0]??[])head[p]=1;
  const geometry=wood.map((v,p)=>v||head[p]?1:0),headCenter=center(head),woodCenter=center(wood);
  const rawAxis=axisOf(raw,144),woodAxis=axisOf(wood,144),metalAxis=axisOf(head,144),geometryAxis=axisOf(geometry,144),axis=(kind==='sword'?metalAxis:woodAxis)??geometryAxis;
  if(axis==null||!headCenter||!woodCenter)throw new Error('The observed palette does not support a projected handle/head measurement.');
  const towardHead:[number,number]=[headCenter[0]-g[0],headCenter[1]-g[1]];
  const directed=axis+(towardHead[0]*Math.cos(axis)+towardHead[1]*Math.sin(axis)<0?Math.PI:0);
  const frontWood=wood.map((v,p)=>v&&((p%144+.5-g[0])*Math.cos(directed)+(Math.floor(p/144)+.5-g[1])*Math.sin(directed))>=0?1:0);
  const other=raw.map((v,p)=>v&&!wood[p]&&!iron[p]?1:0),excludedIron=iron.map((v,p)=>v&&!head[p]?1:0);
  return{raw,wood,iron,head,geometry,angle:directed,
    report:{raw:{pixels:count(raw),bounds:bounds(raw),axisDegrees:rawAxis==null?null:deg(rawAxis),components:components(raw,144,144).map(c=>c.length).sort((a,b)=>b-a)},
      wood:{pixels:count(wood),bounds:bounds(wood),center:woodCenter,axisDegrees:woodAxis==null?null:deg(woodAxis),projectedSpan:interval(wood,directed,g),frontVisiblePixels:count(frontWood),frontVisibleProjectedSpan:interval(frontWood,directed,g),nearestGripDistance:distance(wood,g)},
      metal:{allNeutralPixels:count(iron),allNeutralBounds:bounds(iron),largestConnectedNeutralPixels:count(head),headBounds:bounds(head),headCenter,axisDegrees:metalAxis==null?null:deg(metalAxis),alongWeaponAxis:interval(head,directed,g),acrossWeaponAxis:interval(head,directed+Math.PI/2,g),nearestGripDistance:distance(head,g),otherNeutralComponents:metalParts.slice(1).map(c=>({pixels:c.length,coordinates:c.map(p=>({x:p%144,y:Math.floor(p/144),rgba:Array.from(image.data.subarray(p*4,p*4+4))}))}))},
      projected:{directedWeaponAxisDegrees:deg(directed),axisSource:kind==='sword'?'Largest connected neutral blade PCA; geometry fallback if unavailable.':'Visible wood PCA; geometry fallback if unavailable.',geometryAxisDegrees:geometryAxis==null?null:deg(geometryAxis),geometrySpan:interval(geometry,directed,g),gripToHeadCenter:Math.hypot(...towardHead),nearestRawGripDistance:distance(raw,g)},
      measurementSubsets:{otherPalettePixels:count(other),neutralPixelsOutsideLargestComponent:count(excludedIron),note:'All source pixels remain in the raw candidate and composites. Palette subsets and the largest neutral component are measurement hypotheses only, not a safe extraction or semantic material classification.'}}};
}
const colors={sword:[30,200,255,255],hatchet:[255,70,205,255],wood:[50,180,255,255],head:[255,230,40,255],guide:[255,140,20,255],grip:[255,255,255,255]};
function pixel(im:Img,x:number,y:number,color:number[]){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<im.w&&y<im.h)im.data.set(color,(y*im.w+x)*4);}
function line(im:Img,a:Point,b:Point,color:number[]){const n=Math.max(1,Math.ceil(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))*2));for(let i=0;i<=n;i++)pixel(im,a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,color);}
function box(im:Img,b:ReturnType<typeof bounds>,color:number[]){if(!b)return;const x=b.x,y=b.y,X=x+b.w-1,Y=y+b.h-1;line(im,[x,y],[X,y],color);line(im,[X,y],[X,Y],color);line(im,[X,Y],[x,Y],color);line(im,[x,Y],[x,y],color);}
const font:Record<string,string>={A:'010101111101101',C:'111100100100111',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'111100101101111',H:'101101111101101',I:'111010010010111',O:'111101101101111',R:'110101110101101',S:'111100111001111',T:'111010010010010',U:'101101101101111',W:'101101111111101',0:'111101101101111',1:'010110010010111',2:'110001010100111',3:'110001110001110',4:'101101111001001',5:'111100110001110',6:'011100111101111',7:'111001010010010'};
function text(im:Img,value:string,color:number[]){for(const[i,char]of [...value].entries()){const glyph=font[char];if(!glyph)continue;for(let p=0;p<15;p++)if(glyph[p]==='1')pixel(im,5+i*4+p%3,5+Math.floor(p/3),color);}}
const rows:any[]=[],swordOverlays:Img[]=[],hatchetOverlays:Img[]=[],rawComposites:Img[]=[],guideBodies:Img[]=[],working:{base:Img;sword:ReturnType<typeof measure>;hatchet:ReturnType<typeof measure>;grip:Point}[]=[];
for(let i=0;i<8;i++){
  const r=recipe.frames[i],entry=actual.get(i)!;if(!entry||r.index!==i)throw new Error('All eight matching source frames are required.');
  const source=await decode(r.sourceArmedPng),W=hardMaskBits(await decode(r.sourceWeaponMask)),K=hardMaskBits(await decode(entry.frame.bodyMask)),U=hardMaskBits(await decode(entry.frame.unknownMask)),D=hardMaskBits(await decode(entry.frame.editMask)),base=await decodePngBytes(bytes(`reference-family-v2-${i}-body-skin.png`));
  if(base.w!==144||base.h!==144||sha(base.data)!==skinAudit.frames.find((f:any)=>f.frame===i)?.authoredSkinRgbaSha256)throw new Error('The frozen skin base differs from its independent body-family audit.');
  const sword=makeImg(144,144);for(let p=0;p<W.length;p++)if(W[p])sword.data.set(source.data.subarray(p*4,p*4+4),p*4);
  const stem=[0,2,5,7].includes(i)?'weapon-swap-completion':'weapon-swap',rawBytes=bytes(`${stem}-${i}-raw-candidate-layer.png`),raw=await decodePngBytes(rawBytes),nonkey=chromaMask(entry.output,'green');
  let protectedPixels=0,outsideD=0,reconstructionDifferences=0;
  for(let p=0;p<D.length;p++){const keep=!!(nonkey[p]&&D[p]&&!K[p]&&!U[p]);if(!!raw.data[p*4+3]!==keep||(keep&&raw.data.subarray(p*4,p*4+4).some((v,k)=>v!==entry.output.data[p*4+k])))reconstructionDifferences++;if(raw.data[p*4+3]){if(K[p]||U[p])protectedPixels++;if(!D[p])outsideD++;}}
  if(protectedPixels||outsideD||reconstructionDifferences)throw new Error('Raw layer no longer matches unchanged provider candidate permissions.');
  const grip:[number,number]=[entry.frame.grip.x,entry.frame.grip.y],s=measure(sword,grip,'sword'),h=measure(raw,grip,'hatchet'),sOverlay=recompose({base,layer:sword}),hOverlay=recompose({base,layer:raw});
  for(const[image,m,color,label]of [[sOverlay,s,colors.sword,'SWORD'],[hOverlay,h,colors.hatchet,'HATCHET']] as const){box(image,m.report.wood.bounds,colors.wood);box(image,m.report.metal.headBounds,colors.head);const span=m.report.projected.geometrySpan!;line(image,[grip[0]+Math.cos(m.angle)*span.min,grip[1]+Math.sin(m.angle)*span.min],[grip[0]+Math.cos(m.angle)*span.max,grip[1]+Math.sin(m.angle)*span.max],color);line(image,[grip[0]-2,grip[1]],[grip[0]+2,grip[1]],colors.grip);line(image,[grip[0],grip[1]-2],[grip[0],grip[1]+2],colors.grip);text(image,label+' F'+i,color);}
  swordOverlays.push(sOverlay);hatchetOverlays.push(hOverlay);rawComposites.push(recompose({base,layer:raw}));guideBodies.push(copy(base));working.push({base,sword:s,hatchet:h,grip});
  const retainedPommel=i===7?[{x:67,y:79},{x:67,y:80}].map(({x,y})=>({x,y,rgba:Array.from(raw.data.subarray((y*144+x)*4,(y*144+x+1)*4)),woodPaletteCandidate:!!h.wood[y*144+x]})):undefined;
  if(retainedPommel?.some(p=>!p.rgba[3]||!p.woodPaletteCandidate))throw new Error('The reviewed raw brown pommel alternative was not retained.');
  rows.push({frame:i,jobId:entry.jobId,resultSha256:entry.resultSha,rawCandidateFile:`${stem}-${i}-raw-candidate-layer.png`,rawCandidatePngSha256:sha(rawBytes),grip:entry.frame.grip,sourcePermissions:{known:count(K),unknown:count(U),edit:count(D),confirmedSwordW:count(W),rawProtectedPixels:protectedPixels,rawOutsideD:outsideD,rawReconstructionDifferences:reconstructionDifferences},sword:s.report,hatchet:h.report,comparison:{undirectedWeaponAxisDifferenceDegrees:angleDiff(s.angle,h.angle),directedHeadwardAxisDifferenceDegrees:directionDifference(s.angle,h.angle)},...(retainedPommel?{retainedReviewedPommelAlternative:retainedPommel}:{}),qualified:false});
}
const median=(v:number[])=>{const sorted=[...v].sort((a,b)=>a-b);return(sorted[3]+sorted[4])/2;};
const commonLength=median(rows.map(r=>r.hatchet.projected.geometrySpan.max)),commonHeadWidth=median(rows.map(r=>r.hatchet.metal.acrossWeaponAxis.length));
for(const[i,w]of working.entries()){
  const guide=guideBodies[i],axis=w.sword.angle,end:[number,number]=[w.grip[0]+Math.cos(axis)*commonLength,w.grip[1]+Math.sin(axis)*commonLength];
  line(guide,w.grip,end,colors.guide);line(guide,[end[0]-Math.sin(axis)*commonHeadWidth/2,end[1]+Math.cos(axis)*commonHeadWidth/2],[end[0]+Math.sin(axis)*commonHeadWidth/2,end[1]-Math.cos(axis)*commonHeadWidth/2],colors.guide);
  line(guide,[w.grip[0]-2,w.grip[1]],[w.grip[0]+2,w.grip[1]],colors.grip);line(guide,[w.grip[0],w.grip[1]-2],[w.grip[0],w.grip[1]+2],colors.grip);text(guide,'GUIDE F'+i,colors.guide);
}
const ratio=(field:(r:any)=>number)=>field(rows[5])/field(rows[4]);
const report={version:1,paidCalls:0,qualified:false,bodyRecipeCanonicalHash:recipe.canonicalHash,coordinateSystem:'Native padded144; x right/y down. Grip observations use pixel-edge coordinates, image samples use pixel centers. Bounds are visible raster extents. No registration or resampling.',classification:{wood:'Candidate RGB r-g>=10 AND g-b>=8.',iron:'Candidate max(R,G,B)-min(R,G,B)<=4.',head:'Largest8-connected iron/neutral component, selected only for head/blade measurements. Other neutral pixels remain listed and in the raw image.',axis:'Existing shared axisOf PCA: largest-neutral blade for sword, visible wood for hatchet; geometry fallback if unavailable. Sign points toward the measured neutral head centroid. Sword guard/pommel wood is not assumed to measure the blade direction.',limits:'Color classes are palette hypotheses. Dark/warm outlines, hidden material and generated body-colored candidates are not semantically established. No source pixel is dropped or recolored.'},authoringGuide:{label:'AUTHORING GUIDE CONTROL, NOT PHYSICAL GROUND TRUTH OR A PRODUCTION FIX',direction:'Each source-sword largest-neutral blade axis, directed toward its blade centroid.',commonProjectedGripToDistalLength:commonLength,commonProjectedHeadWidth:commonHeadWidth,reason:'Common median of eight observed hatchet image projections. It is a drawing-consistency hypothesis only; true foreshortening can require unequal projected lengths.',changesActualPixels:false},focus:{frame3:rows[3].comparison,frame4to5:{totalWoodProjectedSpanRatio:ratio(r=>r.hatchet.wood.projectedSpan.length),headwardWoodExtentRatio:ratio(r=>r.hatchet.wood.projectedSpan.max),frontVisibleWoodSpanRatio:ratio(r=>r.hatchet.wood.frontVisibleProjectedSpan.length),gripToHeadCenterRatio:ratio(r=>r.hatchet.projected.gripToHeadCenter),neutralHeadAreaRatio:ratio(r=>r.hatchet.metal.largestConnectedNeutralPixels),neutralHeadAlongWeaponRatio:ratio(r=>r.hatchet.metal.alongWeaponAxis.length),swordGripToDistalRatio:ratio(r=>r.sword.projected.geometrySpan.max),note:'These are projected visibility ratios, not physical scale or perspective ground truth. Total wood span includes the rear pommel and hidden-hand gaps; headward extent isolates the front reach. Head area and handle span need not vary uniformly under rotation/occlusion.'}},frames:rows,sourceFiles:[...inputs].map(([file,sha256])=>({file,sha256})),notes:['RAW candidate alternative retained, including frame7 brown pixels(67,79),(67,80); shared extracted layers are not used for these measurements.','A visible near-grip pixel distance can establish contact proximity only; it cannot establish finger closure, correct occlusion, hand-side anatomy or natural motion.','White/neutral isolated components can distort all-pixel bounds and PCA. They remain in the raw view, and measurement exclusions are explicit.','No3D camera, physical object dimensions, hidden handle length or provider frame timing is known. No gate is passed by these measurements.']};
await fs.promises.writeFile(path.join(out,'weapon-family-calibration-overlay.png'),await encodePngBytes(contactSheet([swordOverlays,hatchetOverlays],3,2)));
await fs.promises.writeFile(path.join(out,'weapon-family-authoring-guide.png'),await encodePngBytes(contactSheet([rawComposites,guideBodies],3,2)));
for(const[file,hash]of inputs)if(sha(fs.readFileSync(path.join(out,file)))!==hash)throw new Error('An actual source changed during the audit.');
fs.writeFileSync(path.join(out,'weapon-family-calibration.json'),JSON.stringify(report,null,2)+'\n');
const table=rows.map(r=>`<tr><td>${r.frame}</td><td>${r.hatchet.wood.projectedSpan.length.toFixed(2)}</td><td>${r.hatchet.projected.geometrySpan.max.toFixed(2)}</td><td>${r.hatchet.metal.largestConnectedNeutralPixels}</td><td>${r.comparison.directedHeadwardAxisDifferenceDegrees.toFixed(1)}</td><td>${r.hatchet.projected.nearestRawGripDistance.toFixed(2)}</td></tr>`).join('');
fs.writeFileSync(path.join(out,'weapon-family-calibration.html'),`<!doctype html><meta charset="utf-8"><title>Weapon family offline calibration</title><style>body{background:#18181c;color:#eee;font:16px system-ui;margin:24px}img{max-width:100%;image-rendering:pixelated}td,th{padding:6px 12px;text-align:right}p{max-width:1100px}a{color:#9cf}</style><h1>Offline weapon-family measurements</h1><p>Unchanged raw candidates on one authored body. No paid calls and no production qualification. Cyan=source-sword axis; magenta=hatchet axis; blue=wood bounds; yellow=largest neutral head/blade component; white=reviewed grip. Frame indices0 through7 run left to right.</p><img src="weapon-family-calibration-overlay.png" alt="Measured source sword and raw hatchet overlays"><h2>AUTHORING GUIDE CONTROL</h2><p>The second row is a wire guide, not corrected artwork: source-sword axis and common median observed projected hatchet length ${commonLength.toFixed(2)}px. True perspective can require unequal projected length. First row preserves the actual raw hatchet, including the two brown pommel pixels at frame7.</p><img src="weapon-family-authoring-guide.png" alt="Actual raw hatchet row and explicitly labeled illustrative authoring guide row"><table><tr><th>Frame</th><th>Wood span px</th><th>Grip-to-distal px</th><th>Neutral head px</th><th>Sword/hatchet difference deg</th><th>Nearest grip px</th></tr>${table}</table><p>Color/PCA measurements describe visible projections. Head occlusion, hidden finger closure, physical scale, depth, foreshortening and timing remain uncertain. <a href="weapon-family-calibration.json">Full JSON and exact source hashes</a>.</p>`);
console.log(JSON.stringify({paidCalls:0,frames:8,commonProjectedLength:commonLength,focus:report.focus,qualified:false,artifacts:['weapon-family-calibration.json','weapon-family-calibration-overlay.png','weapon-family-authoring-guide.png','weapon-family-calibration.html']}));
