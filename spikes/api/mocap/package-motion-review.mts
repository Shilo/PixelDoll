// Build a token-free, offline comparison pack from the browser export. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';
import {registerHooks} from 'node:module';
import {zip,type ZipEntry} from '../../../app/src/lib/store/zip.ts';
import {sheet} from '../animation-research-2026-10-27/preview.mts';
// Vite supplies named CJS imports for gifenc; adapt only that import for native Node diagnostics.
const hooks=registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/studio/shareMedia.ts'))return {...result,source:String(result.source).replace("import { GIFEncoder, quantize, applyPalette } from 'gifenc'","import gifenc from 'gifenc'; const { GIFEncoder, quantize, applyPalette } = gifenc")};return result}});
const {encodeShareMedia}=await import('../../../app/src/studio/shareMedia.ts');hooks.deregister();
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28');
const evidence=JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8'));
const reports=JSON.parse(fs.readFileSync(path.join(out,'render-analysis.json'),'utf8'));
const entries:ZipEntry[]=[],enc=new TextEncoder();
const add=(name:string,data:Uint8Array)=>{entries.push({name,data});fs.writeFileSync(path.join(out,name),data)};
const latest=new Map<string,any>();
for(const row of evidence.records)if(row.job?.state==='done'&&!row.context&&row.document.revision==='ground-support-v2')latest.set([row.document.fixture.id,row.document.clip.id,row.document.direction,row.seed].join('/'),row);
const cases=[];
for(const [key,row]of latest){
  const stem='review-'+key.replaceAll('/','-'),d=row.document,frames=await Promise.all(row.images.slice(0,d.buffer?-1:undefined).map((i:any)=>decodePngBytes(Buffer.from(i.png,'base64'))));
  const durations=d.times.map((t:number,i:number)=>i<d.times.length-1?Math.round((d.times[i+1]-t)*1000):d.durations[i]);
  const images=frames.map((image:any,i:number)=>({image,ms:durations[i]}));
  add(stem+'.gif',await encodeShareMedia({frames:images,still:frames[0],animated:true,grid:false,previewRows:1,omitted:[],mime:'image/gif',extension:'gif'},2));
  add(stem+'.png',await encodePngBytes(contactSheet(Array.from({length:Math.ceil(frames.length/5)},(_,i)=>frames.slice(i*5,i*5+5)),1,0)));
  const selected=[0,Math.floor(frames.length/3),Math.floor(frames.length*2/3),frames.length-1];
  add(stem+'.overlay.png',await encodePngBytes(sheet(selected.map(i=>frames[i]),selected.map(i=>row.job.params.keypoints[i]),true)));
  add(stem+'.json',enc.encode(JSON.stringify({kind:'pixeldoll-motion-research-candidate',qualified:false,jobId:row.job.id,seed:row.seed,document:d,request:row.job.params,inputs:row.inputs,images:row.images,durations,bufferExcluded:d.buffer,note:'Research candidate, not a production approved preset. GIF repeats for inspection. Source timing replaces old rounded attack/hurt intervals; raw request timing remains in document.'},null,2)));
  cases.push({key,stem,jobId:row.job.id,poses:frames.length});
}
const groups=[];
for(const body of ['c27man','chibi','body128'])for(const clip of ['idle','walk','run','attack','hurt','death']){
  const group=cases.filter(c=>c.key.startsWith(body+'/'+clip+'/')).sort((a,b)=>a.key.localeCompare(b.key));
  const panels=await Promise.all(group.map(c=>decodePngBytes(fs.readFileSync(path.join(out,c.stem+'.png')))));
  const name=`overview-${body}-${clip}.png`;
  add(name,await encodePngBytes(contactSheet(Array.from({length:Math.ceil(panels.length/2)},(_,i)=>panels.slice(i*2,i*2+2)),2,0)));
  groups.push({name,order:group.map(c=>c.key)});
}
const jobs=new Map(evidence.records.filter((r:any)=>r.job).map((r:any)=>[r.job.id,r.job]));
const summary={cap:evidence.cap,reserved:evidence.reserved,uniqueJobs:jobs.size,providerGenerations:reports.providerGenerations,priorResearchGenerations:86,totalGenerations:reports.providerGenerations+86,records:evidence.records.length,returnedImages:[...jobs.values()].reduce((n:number,j:any)=>n+(j.jobs??[]).reduce((a:number,b:any)=>a+(b.results?.length??0),0),0),states:[...jobs.values()].reduce((a:any,j:any)=>(a[j.state]=(a[j.state]??0)+1,a),{}),latestProfiles:cases.length,groups,cases};
add('qualification-summary.json',enc.encode(JSON.stringify(summary,null,2)));
const html='<!doctype html><meta charset="utf-8"><title>Motion qualification review</title><h1>Motion qualification review</h1><p>Research candidates. No preset is automatically accepted. GIFs repeat for inspection. Compare anatomy, ground contact, silhouette, timing, identity and the final hold. Raw requests and failed experiments remain in evidence.json.</p><p><a href="preset-catalog.json">42 selected candidates and exact equipment outcomes</a> · <a href="rigid-attachment-analysis.json">Rigid attachment experiment</a> · <a href="kaykit-comparison.json">Independent KayKit source control</a></p><style>body{font:16px system-ui;background:#181a20;color:#eee;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px}article{border:1px solid #777;padding:12px}img{image-rendering:pixelated;max-width:100%;background:#292c32}a{color:#9dc8ff}</style><div class="grid">'+cases.map(c=>`<article><h2>${c.key}</h2><img src="${c.stem}.gif" alt="Timed generated animation"><p><a href="${c.stem}.png">All frames</a> · <a href="${c.stem}.overlay.png">Requested joints</a> · <a href="${c.stem}.json">Provenance</a></p></article>`).join('')+'</div>';
add('review.html',enc.encode(html));
entries.push({name:'evidence.json',data:fs.readFileSync(path.join(out,'evidence.json'))});
entries.push({name:'equipment-analysis.json',data:fs.readFileSync(path.join(out,'equipment-analysis.json'))});
for(const name of ['preset-catalog.json','rigid-attachment-analysis.json','kaykit-comparison.json'])entries.push({name,data:fs.readFileSync(path.join(out,name))});
for(const action of ['idle','walk','run','attack','hurt','death'])entries.push({name:`controls/kaykit-${action}.json`,data:fs.readFileSync(path.join(root,`app/dev-fixtures/motion-lab/kaykit-${action}.json`))});
entries.push({name:'controls/KAYKIT-LICENSE.txt',data:fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/KAYKIT-LICENSE.txt'))});
entries.push({name:'FOLLOWUP.md',data:fs.readFileSync(path.join(root,'docs/research/2026-10-28-motion-followup.md'))});
entries.push({name:'followup-preview.jpg',data:fs.readFileSync(path.join(out,'followup-preview.jpg'))});
for(const name of ['reviewed-walk-south.json','reviewed-walk-east.json','review-proof.jpg'])entries.push({name,data:fs.readFileSync(path.join(out,name))});
for(const name of fs.readdirSync(out).filter(n=>n.startsWith('equipment-')&&n.endsWith('.png')))entries.push({name,data:fs.readFileSync(path.join(out,name))});
fs.writeFileSync(path.join(out,'motion-review.zip'),await zip(entries));
console.log(JSON.stringify({...summary,cases:undefined,groups:undefined}));
