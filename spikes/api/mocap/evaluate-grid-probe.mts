// Compare the masked frozen-pixel repair probe against exact source bodies. No API calls.
import fs from 'node:fs';
import path from 'node:path';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {cutGrid,extractCell,padImg,bandOf,contactSheet,recompose} from '../../../app/src/lib/items/items.ts';
import {bodyComponents,borderPx} from '../../../app/src/lib/rig/clips.ts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-targeted-2026-10-28'),e=JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8')),rows=[];
const decode=(png:string)=>decodePngBytes(Buffer.from(png,'base64'));
for(const row of e.records.filter((r:any)=>r.context?.kind==='equipment-grid'&&r.job?.state==='done')){
  const c=row.context,body=e.records.find((r:any)=>r.job?.id===c.bodyId),params=row.job.params,inputRef=params.inpainting_image.image.$blob,maskRef=params.mask_image.image.$blob,input=await decode(row.inputs.find((im:any)=>im.sha===inputRef).png),mask=await decode(row.inputs.find((im:any)=>im.sha===maskRef).png),output=await decode(row.images[0].png),stem='grid-'+row.job.id.slice(0,8);
  for(const[name,image]of [['input',input],['mask',mask],['output',output]] as const)fs.writeFileSync(path.join(out,`${stem}-${name}.png`),await encodePngBytes(image));
  if(output.w!==input.w||output.h!==input.h){rows.push({jobId:row.job.id,status:'fail',reason:'Returned grid dimensions changed.',input:[input.w,input.h],output:[output.w,output.h]});continue;}
  let blackPixels=0,changedBlackPixels=0;for(let p=0;p<input.w*input.h;p++)if(mask.data[p*4]<128){blackPixels++;if(output.data.slice(p*4,p*4+4).some((v:number,i:number)=>v!==input.data[p*4+i]))changedBlackPixels++;}
  const cell={w:body.document.fixture.cell.w+2*c.pad,h:body.document.fixture.cell.h+2*c.pad},cells=cutGrid(output,4,cell.w,cell.h),before=[],after=[],measurements=[];
  for(const [i,sourceIndex]of c.indices.entries()){
    const base=padImg(await decode(body.images[sourceIndex].png),c.pad),extracted=extractCell({key:`attack/east/${sourceIndex}`,call:0,base,out:cells[i],route:c.key,band:bandOf(c.slot,undefined,cell.h),posed:true,held:true,pad:c.pad});
    before.push(base);after.push(recompose(extracted));measurements.push({sourceIndex,bodySha:body.images[sourceIndex].sha,area:extracted.area,offset:extracted.offset,shifted:extracted.shifted,keyKept:extracted.keyKept,keyOutside:extracted.keyOutside,layerDetachedPixels:bodyComponents(extracted.layer).detachedPixels,layerBorderPixels:borderPx(extracted.layer)});
    fs.writeFileSync(path.join(out,`${stem}-${sourceIndex}-layer.png`),await encodePngBytes(extracted.layer));fs.writeFileSync(path.join(out,`${stem}-${sourceIndex}-composite.png`),await encodePngBytes(after.at(-1)!));
  }
  fs.writeFileSync(path.join(out,stem+'-comparison.png'),await encodePngBytes(contactSheet([before,after],4,0)));rows.push({jobId:row.job.id,bodyId:c.bodyId,dressId:c.dressId,indices:c.indices,gens:row.job.gens,blackPixels,changedBlackPixels,measurements,qualified:false,note:'Two-frame native probe, not a complete clip. Frozen body pixels are used in recomposition. Raw chroma output and black-mask deviations require visual inspection.'});
}
fs.writeFileSync(path.join(out,'grid-probe-analysis.json'),JSON.stringify({rows},null,2));console.log(JSON.stringify(rows));
