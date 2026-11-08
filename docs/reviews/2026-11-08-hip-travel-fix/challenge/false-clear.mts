import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath,pathToFileURL}from'node:url';
import{before,candidate,rest,rig,angle,pelvis}from'./probe.mts';
const here=fileURLToPath(new URL('./',import.meta.url)),{hasAll}=await import(pathToFileURL(here+'temp.local/before/app/src/lib/rig/poses.ts').href);
const hits:any[]=[];let tried=0;outer:for(const tilt of[-40,-30,-20,20,30,40])for(let elbow=-90;elbow<=0;elbow+=2){let f=angle(rest,'RIGHT SHOULDER',['RIGHT ELBOW','RIGHT ARM'],-180);f=angle(f,'RIGHT ELBOW',['RIGHT ARM'],elbow);f=pelvis(f,tilt);if(!hasAll(f)||before.decisiveAction(rig(f),'run-slash','south'))continue;
 for(const label of['RIGHT HIP','LEFT HIP'])for(let x=.1;x<.9;x+=.05)for(let y=.3;y<.95;y+=.025){const measured=f.map(p=>p.label===label?{...p,x,y}:p);if(!hasAll(measured))continue;tried++;const r=rig(measured);if(candidate.decisiveAction(r,'run-slash','south')){hits.push({tilt,elbow,label,x,y,frame:f,measured,beforeClean:before.decisiveAction(rig(f),'run-slash','south'),beforeCorrupt:before.decisiveAction(r,'run-slash','south'),candidateCorrupt:candidate.decisiveAction(r,'run-slash','south')});if(hits.length>=3)break outer;}}
}
writeFileSync(here+'false-clear-results.json',JSON.stringify({tried,hits},null,2)+'\n');console.log(JSON.stringify({tried,hits:hits.map(({frame,measured,...r})=>r)}));
