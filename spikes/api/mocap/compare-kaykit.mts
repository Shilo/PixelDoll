// Independent CC0 source control. Parses data only; no PixelLab calls or new dependencies.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseGlb,worldMatrices,animByName,animDuration,xformPoint,xformDir,sub,add,mul,dot,cross,norm,len,type V3} from './glb.mts';
import {completePose,type MotionClip,type Pose3,MOTION_EDGES,length3,sub3} from '../../../app/src/lib/rig/motion.ts';
import {newDocument,buildDocument,type MotionLibrary} from '../../../app/src/ui/motion-lab/model.ts';
import {templateContactMotion} from '../../../app/src/ui/motion-lab/diagnostics.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28'),dest=path.join(root,'app/dev-fixtures/motion-lab');
const pack=process.env.KAYKIT_PACK??path.join(out,'kaykit-free-1.1/KayKit_Character_Animations_1.1');
const library=JSON.parse(fs.readFileSync(path.join(dest,'library.json'),'utf8')) as MotionLibrary;
const specs=[['idle','General','Idle_A',true],['walk','MovementBasic','Walking_A',true],['run','MovementBasic','Running_A',true],['attack','CombatMelee','Melee_1H_Attack_Chop',false],['hurt','General','Hit_A',false],['death','General','Death_A',false]] as const;
const mapping:Record<string,string>={'NECK':'head','RIGHT SHOULDER':'upperarm.r','RIGHT ELBOW':'lowerarm.r','RIGHT ARM':'wrist.r','LEFT SHOULDER':'upperarm.l','LEFT ELBOW':'lowerarm.l','LEFT ARM':'wrist.l','RIGHT HIP':'upperleg.r','RIGHT KNEE':'lowerleg.r','RIGHT LEG':'foot.r','LEFT HIP':'upperleg.l','LEFT KNEE':'lowerleg.l','LEFT LEG':'foot.l'};
const idleG=parseGlb(path.join(pack,'Animations/gltf/Rig_Medium/Rig_Medium_General.glb')),idleW=worldMatrices(idleG,animByName(idleG,'Idle_A'),0);
const idlePos=(name:string)=>{const i=idleG.json.nodes.findIndex((n:any)=>n.name===name);if(i<0)throw new Error('Missing idle calibration bone '+name);return xformPoint(idleW[i],[0,0,0])};
const cases=[],sources=[];
for(const [id,category,name,loop]of specs){
  const file=path.join(pack,`Animations/gltf/Rig_Medium/Rig_Medium_${category}.glb`),g=parseGlb(file),rest=worldMatrices(g,null,0),anim=animByName(g,name),duration=animDuration(g,anim);
  const node=(n:string)=>{const i=g.json.nodes.findIndex((p:any)=>p.name===n);if(i<0)throw new Error('Missing KayKit bone '+n);return i},pos=(w:ReturnType<typeof worldMatrices>,n:string)=>xformPoint(w[node(n)],[0,0,0]);
  const shoulders=sub(pos(rest,'upperarm.l'),pos(rest,'upperarm.r')),left=norm([shoulders[0],0,shoulders[2]]),up:V3=[0,1,0],forward=cross(left,up);
  if(dot(sub(pos(rest,'toes.l'),pos(rest,'foot.l')),forward)<=0)throw new Error('KayKit forward axis does not point toward the toes.');
  const head=rest[node('head')],axes=([0,1,2] as const).map(i=>{const v:V3=[0,0,0];v[i]=1;return norm(xformDir(head,v))});
  const face:Record<string,V3>={'NOSE':[0,0.1,0.115],'RIGHT EYE':[-0.035,0.14,0.1],'LEFT EYE':[0.035,0.14,0.1],'RIGHT EAR':[-0.087,0.11,0],'LEFT EAR':[0.087,0.11,0]};
  const localFace=Object.fromEntries(Object.entries(face).map(([label,[x,y,z]])=>{const v=add(add(mul(left,x),mul(up,y)),mul(forward,z));return[label,axes.map(a=>dot(a,v)) as V3]}));
  const pose=(time:number|null,alignNeutral=true):Pose3=>{
    const w=time===null?rest:worldMatrices(g,anim,time),points=Object.fromEntries(Object.entries(mapping).map(([label,bone])=>[label,pos(w,bone)]));
    for(const [label,p]of Object.entries(localFace))points[label]=xformPoint(w[node('head')],p);
    if(time===null)for(const side of ['RIGHT','LEFT']){const shoulder=points[side+' SHOULDER'],a=len(sub(points[side+' ELBOW'],shoulder)),b=len(sub(points[side+' ARM'],points[side+' ELBOW'])),suffix=side==='RIGHT'?'r':'l',upper=alignNeutral?norm(sub(idlePos('lowerarm.'+suffix),idlePos('upperarm.'+suffix))):mul(up,-1),lower=alignNeutral?norm(sub(idlePos('wrist.'+suffix),idlePos('lowerarm.'+suffix))):mul(up,-1);points[side+' ELBOW']=add(shoulder,mul(upper,a));points[side+' ARM']=add(points[side+' ELBOW'],mul(lower,b));}
    return completePose(Object.fromEntries(Object.entries(points).map(([label,p])=>[label,[dot(p,left),dot(p,up),dot(p,forward)]])));
  };
  const sampleCount=Math.ceil(duration*60)+1,samples=Array.from({length:sampleCount},(_,i)=>({time:duration*i/(sampleCount-1),points:pose(duration*i/(sampleCount-1)),contacts:{}}));
  const source:MotionClip={id:'kaykit-'+id,action:id,name:'KayKit '+id,source:'KayKit Free 1.1 / '+name,duration,loop,nominalSpeed:0,reference:pose(null),samples,events:[]};
  const ground=Math.min(...samples.flatMap(s=>[s.points['RIGHT LEG'][1],s.points['LEFT LEG'][1]]));
  for(const sample of samples){const contacts:MotionClip['samples'][number]['contacts']={};for(const foot of ['RIGHT LEG','LEFT LEG'] as const){const v=Math.max(0,Math.min(1,(ground+0.06-sample.points[foot][1])/0.06));contacts[foot]={weight:id==='death'?0:v*v*(3-2*v)}}sample.contacts=contacts;}
  const provenance={url:'https://kaylousberg.itch.io/kaykit-character-animations',license:'CC0-1.0',packVersion:'Free 1.1',file:path.basename(file),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),animation:name};sources.push(provenance);
  for(const fixture of library.fixtures)for(const direction of Object.keys(fixture.references) as (keyof typeof fixture.references)[]){
    const doc=newDocument(library,fixture,source,direction);if(id==='death'){doc.padding=Math.round(fixture.cell.w*0.3);doc.buffer=true;doc.options.plane=direction==='south'||direction==='north'?90:0;}
    const before=buildDocument({...doc,clip:{...source,reference:pose(null,false)}}),beforeIssues=before.issues;
    if(id==='death')doc.options.travel=0.25;
    if(id==='walk'||id==='run')doc.options.weights={torso:1,legs:1,leftArm:0.5,rightArm:0.5};
    const fit=buildDocument(doc),maxLengthError=Math.max(...fit.frames.flatMap(f=>MOTION_EDGES.map(([a,b])=>Math.abs(length3(sub3(f.points[a],f.points[b]))-length3(sub3(fit.reference[a],fit.reference[b]))))));
    const armAngle=(frames:typeof fit.frames)=>Math.max(...frames.flatMap(f=>['RIGHT','LEFT'].map(side=>{const v=sub3(f.points[side+' ELBOW'],f.points[side+' SHOULDER']);return Math.acos(Math.max(-1,Math.min(1,-v[1]/length3(v))))*180/Math.PI})));
    cases.push({fixture:fixture.id,action:id,direction,poses:doc.times.length,duration,maxLengthError,beforeIssues,issues:fit.issues,rootTravel:doc.options.travel,upperArmFromDownDegrees:{before:armAngle(before.frames),after:armAngle(fit.frames)},contactFit:templateContactMotion(doc)});
    if(fixture.id==='c27man'&&direction==='south')fs.writeFileSync(path.join(dest,`kaykit-${id}.json`),JSON.stringify({...doc,provenance}));
  }
}
fs.writeFileSync(path.join(dest,'KAYKIT-LICENSE.txt'),fs.readFileSync(path.join(pack,'License.txt'),'utf8').replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,''));
const report={date:'2026-10-28',paidRequests:0,archiveSha256:'65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f',sources,mapping,assumptions:['Neutral arm directions calibrated from Idle_A at time zero, retaining rest lengths; before control uses synthetic arms-down neutral','Walk/run arm motion weight 0.5, other body weights 1','Face landmarks are synthetic offsets, not supplied facial joints','Uniform 12-pose source controls, not approved attack/fall timing','Ankle-height contacts are heuristic; nominalSpeed 0 means unqualified, not a measured speed','No rendered-body, equipment or professional quality qualification'],cases};
fs.writeFileSync(path.join(out,'kaykit-comparison.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'docs/research/2026-10-28-kaykit-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,withIssues:cases.filter(c=>c.issues.length).length,maxLengthError:Math.max(...cases.map(c=>c.maxLengthError))}));
