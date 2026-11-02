// Offline reproduction of the Claude-session review's armed/disarmed recomposition check.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
const root=path.resolve(import.meta.dirname,'../../..'),source=path.resolve(process.argv[2]??path.join(root,'spikes/api/out/x28')),out=path.join(root,'spikes/api/out/workflow-reconciliation-2026-11-01');
const rows=[];
for(const [direction,name]of [['south','pm_slash_armed_s11_south'],['east','v3_slash_armed_east']])for(let i=0;i<8;i++){
  const original=fs.readFileSync(path.join(source,`B/${name}.${i+1}.png`)),recomposed=fs.readFileSync(path.join(source,`S/ea_${name}.recomp.${i}.png`));
  const a=await decodePngBytes(original),b=await decodePngBytes(recomposed);if(a.w!==b.w||a.h!==b.h)throw new Error('Comparison canvas mismatch');
  let changed=0,alphaMismatch=0,largeColorDelta=0;
  for(let p=0;p<a.data.length;p+=4){const aa=!!a.data[p+3],ba=!!b.data[p+3];if(aa!==ba)alphaMismatch++;if((aa||ba)&&a.data.subarray(p,p+4).some((v,k)=>v!==b.data[p+k]))changed++;if(aa&&ba&&[0,1,2].some(k=>Math.abs(a.data[p+k]-b.data[p+k])>32))largeColorDelta++;}
  rows.push({direction,frame:i,source:`B/${name}.${i+1}.png`,recomposition:`S/ea_${name}.recomp.${i}.png`,originalSha256:createHash('sha256').update(original).digest('hex'),recomposedSha256:createHash('sha256').update(recomposed).digest('hex'),cell:[a.w,a.h],changed,alphaMismatch,largeColorDelta});
}
const summary=['south','east'].map(direction=>{const cases=rows.filter(r=>r.direction===direction);return{direction,frames:cases.length,...Object.fromEntries((['changed','alphaMismatch','largeColorDelta']as const).map(key=>[key,{min:Math.min(...cases.map(r=>r[key])),max:Math.max(...cases.map(r=>r[key]))}]))};});
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'armed-split-audit.json'),JSON.stringify({version:1,paidCalls:0,method:'Visible RGBA differences; alpha-presence mismatch; common opaque RGB max-channel change above32. These measure preservation, not naturalness.',summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
