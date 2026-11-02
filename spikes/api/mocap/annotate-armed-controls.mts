// Offline manual annotations. No credentials, network or provider requests.
// Run: node spikes/api/mocap/annotate-armed-controls.mts <directory containing x28/B>
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';

type Point=[number,number];
type Box=[number,number,number,number];
type Image={w:number;h:number;data:Uint8ClampedArray};
interface Annotation {
  id:string;source:string;weaponRegions:Point[][];unknownRegions:Box[];
  observedBodyPoints:Point[];grip:{x:number;y:number;uncertaintyPx:number;status:string};
  interpretation:string;providerEligibility:string;
}
const sourceRoot=process.argv[2];
if(!sourceRoot)throw new Error('Pass the source directory containing x28/B.');
const out=path.resolve(import.meta.dirname,'../out/weapon-aware-2026-11-02');
fs.mkdirSync(out,{recursive:true});
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const reviewedSources:Record<string,string>={
  south1:'8445418b7bce94270e1ff67be6412f0404eb60d323b968da82091af1f9071fdb',
  east1:'068b59b347b7faf6be7670873b6eed667ee61587ef095f29defccec886ea30d6',
  east3:'f35878635451e1a52ebb8aaf64c5ae768552424dfe5b076fba1b1100e950b73c',
};
const annotations:Annotation[]=[
  {id:'south1',source:'B/pm_slash_armed_s11_south.1.png',
    weaponRegions:[[[5,0],[17,0],[18,25],[21,25],[21,29],[6,31],[5,27]],[[12,33],[18,33],[18,39],[12,39]]],
    unknownRegions:[[12,28,19,36]],observedBodyPoints:[[14,29],[15,29],[17,31],[18,31]],
    grip:{x:16,y:31,uncertaintyPx:2,status:'partly visible fist; dark hilt/outline boundary unknown'},
    interpretation:'Visible thumb/finger skin beside the guard is protected. Dark central grip pixels remain unknown. Blade is clipped at the top edge.',
    providerEligibility:'Bounded partial removal only. Unknown grip pixels stay black and may retain hilt residue.'},
  {id:'east1',source:'B/v3_slash_armed_east.1.png',
    weaponRegions:[[[50,37],[69,15],[73,15],[73,19],[59,41],[61,42],[61,45],[52,42],[48,39]],[[49,42],[56,42],[54,51],[52,54],[47,54],[47,49]]],
    unknownRegions:[[47,40,56,49]],observedBodyPoints:[[50,41],[51,41],[52,41],[50,42],[51,42],[52,42],[51,43],[52,43],[50,45]],
    grip:{x:51,y:43,uncertaintyPx:2,status:'visible palm/finger skin; dark hilt edge unknown'},
    interpretation:'Observed light palm and finger pixels remain protected. Hilt/skin/shadow boundary is not assigned by color alone.',
    providerEligibility:'Bounded partial removal only. Unknown grip pixels stay black and may retain hilt residue.'},
  {id:'east3',source:'B/v3_slash_armed_east.3.png',
    weaponRegions:[[[3,39],[7,44],[36,21],[35,14],[30,14],[5,34]],[[27,13],[34,13],[36,19],[30,21]],[[39,8],[45,8],[45,15],[39,15]]],
    unknownRegions:[[28,8,48,26]],observedBodyPoints:[],
    grip:{x:44,y:16,uncertaintyPx:4,status:'inferred and head-occluded; not a measured visible grip'},
    interpretation:'The hidden hand/head/hilt interface stays unknown. No finger closure or hidden anatomy is reconstructed.',
    providerEligibility:'Offline challenge only. Known external blade mask is incomplete for removing the hidden hilt.'},
];
function inside([x,y]:Point,polygon:Point[]){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)result=!result;
  }
  return result;
}
function blank(w:number,h:number):Image{return{w,h,data:new Uint8ClampedArray(w*h*4)}};
const reviewed=[];const sheets:Image[][]=[];
for(const annotation of annotations){
  const sourceBytes=fs.readFileSync(path.join(sourceRoot,annotation.source));
  if(hash(sourceBytes)!==reviewedSources[annotation.id])throw new Error(annotation.id+': source differs from manually reviewed pixels.');
  const source=await decodePngBytes(sourceBytes);
  if(source.w!==80||source.h!==80)throw new Error(annotation.id+': expected native80 input.');
  const labels=new Uint8Array(80*80),bodyPoints=new Set(annotation.observedBodyPoints.map(p=>p.join(',')));
  const W=blank(80,80),B=blank(80,80),U=blank(80,80),exploratory=blank(80,80),tri=blank(80,80),overlay=blank(80,80);
  for(let y=0;y<80;y++)for(let x=0;x<80;x++){
    const i=y*80+x,q=i*4,opaque=source.data[q+3]>0;
    // Zero is transparent background. One/two/three are weapon/body/unknown.
    let label=opaque?2:0;
    if(opaque&&annotation.weaponRegions.some(p=>inside([x+.5,y+.5],p)))label=1;
    if(opaque&&annotation.unknownRegions.some(([x0,y0,x1,y1])=>x>=x0&&x<=x1&&y>=y0&&y<=y1))label=3;
    if(bodyPoints.has(x+','+y)){if(!opaque)throw new Error('Observed skin point is transparent.');label=2;}
    labels[i]=label;
    for(const [mask,target]of [[W,1],[B,2],[U,3]] as const)mask.data.set([label===target?255:0,label===target?255:0,label===target?255:0,255],q);
    exploratory.data.set([label===1||label===3?255:0,label===1||label===3?255:0,label===1||label===3?255:0,255],q);
    const color=label===1?[255,0,255,255]:label===2?[0,192,255,255]:label===3?[255,196,0,255]:[0,0,0,0];
    tri.data.set(color,q);
    overlay.data.set(opaque?[Math.round((source.data[q]*3+color[0])/4),Math.round((source.data[q+1]*3+color[1])/4),Math.round((source.data[q+2]*3+color[2])/4),source.data[q+3]]:[0,0,0,0],q);
  }
  const files={input:annotation.id+'-armed.png',weapon:annotation.id+'-weapon-mask.png',body:annotation.id+'-body-mask.png',unknown:annotation.id+'-unknown-mask.png',disarm:annotation.id+'-disarm-mask.png',exploratory:annotation.id+'-exploratory-mask.png',triState:annotation.id+'-tri-state.png',overlay:annotation.id+'-overlay.png'};
  const images={input:source,weapon:W,body:B,unknown:U,disarm:W,exploratory,triState:tri,overlay};
  const artifactHashes:Record<string,string>={};
  for(const [key,file]of Object.entries(files)){const bytes=await encodePngBytes(images[key as keyof typeof images]);fs.writeFileSync(path.join(out,file),bytes);artifactHashes[key]=hash(bytes);}
  const counts={weapon:0,body:0,unknown:0,background:0};
  for(const label of labels)counts[label===1?'weapon':label===2?'body':label===3?'unknown':'background']++;
  reviewed.push({...annotation,direction:annotation.id.startsWith('south')?'south':'east',frame:Number(annotation.id.replace(/\D/g,''))-1,sourcePath:annotation.source,sourceSha256:hash(sourceBytes),sourcePngSha256:hash(sourceBytes),sourceRgbaSha256:hash(source.data),weaponMaskPng:files.weapon,bodyMaskPng:files.body,unknownMaskPng:files.unknown,strictEditMaskPng:files.disarm,exploratoryEditMaskPng:annotation.id==='east3'?null:files.exploratory,protectedSkinPoints:annotation.observedBodyPoints.map(([x,y])=>({x,y})),files,artifactHashes,counts,completeWeaponMask:false,qualification:false,exploratoryWarning:annotation.id==='east3'?'DO NOT SUBMIT: broad head/hand occlusion unknown contains visible head anatomy. Exploratory image is audit-only.':'Exploratory edits include uncertain hilt/hand boundary and may synthesize new skin there. Confident observed skin points and all other known body stay black. No exact preservation or recovered anatomy claim within unknown.'});
  sheets.push([source,overlay,tri,W,U,exploratory]);
}
fs.writeFileSync(path.join(out,'armed-control-annotations.json'),JSON.stringify({schemaVersion:1,method:'Manual native80 visual annotation with conservative polygon/box boundaries; no hidden anatomy inference.',coordinateSystem:'Zero-based native80 pixels. Unknown boxes inclusive; polygons sampled at pixel centers. Only existing alpha-positive pixels may be weapon.',legend:{weapon:'magenta',observedBody:'cyan',unknown:'yellow',background:'transparent'},reviewColumns:['source','overlay','tri-state','confident weapon / strict edit','unknown','exploratory edit, east3 audit-only'],rules:['Binary masks are opaque white for selected label and black everywhere else.','Strict disarm D equals confident weapon W. Unknown and observed body/fingers remain black.','Exploratory disarm D equals W plus explicitly unknown boundary. Observed skin overrides remain black.','Original transparent pixels remain black, preventing edits in empty canvas.','Complete weapon removal is not promised where hilt pixels are unknown.','A provider disarmed result is a proposed new frozen base, not ground-truth recovered anatomy.','East3 is an offline challenge. Its exploratory mask includes head anatomy and must not be submitted.','Confident W is semantically constrained to manually identified visible blade, guard and pommel. Residual in unknown must be reported separately, never silently counted as proven weapon-only pixels.'],entries:reviewed},null,2)+'\n');
fs.writeFileSync(path.join(out,'armed-control-annotation-review.png'),await encodePngBytes(contactSheet(sheets,5,4)));
console.log(JSON.stringify({output:path.relative(process.cwd(),out),cases:reviewed.map(c=>({id:c.id,counts:c.counts,completeWeaponMask:c.completeWeaponMask}))}));
