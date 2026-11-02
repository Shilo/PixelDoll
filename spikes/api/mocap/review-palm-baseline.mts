// Offline reproduction of the old AND new palm targets; no provider request or image correction.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { unzip } from '../../../app/src/lib/store/zip.ts';
import { decodePngBytes } from '../../../app/src/lib/image/pngraw.ts';
import { base64ToBytes } from '../../../app/src/lib/image/png.ts';
import { rigidAttachment, occludeAttachment, type AttachmentDocument } from '../../../app/src/ui/motion-lab/attachment.ts';

const root=new URL('../../../',import.meta.url);
const historicalPath=new URL('spikes/api/out/claude-complete-review-2026-11-02/historical-attachment.mts',root);
fs.mkdirSync(new URL('.',historicalPath),{recursive:true});
// The later opaque-source guard intentionally rejects the old end anchor. Reproduce with its original renderer.
const historical=execFileSync('git',['show','a09e31fc:app/src/ui/motion-lab/attachment.ts'],{cwd:root,encoding:'utf8'});
fs.writeFileSync(historicalPath,historical.replaceAll("'../../lib/image/","'../../../../app/src/lib/image/"));
const legacy=await import(historicalPath.href) as typeof import('../../../app/src/ui/motion-lab/attachment.ts');
const read=(path:string)=>fs.readFileSync(new URL(path,root));
const files=await unzip(new Uint8Array(read('docs/research/artifacts/2026-11-02-gripped-axe-east.zip')));
const author=JSON.parse(new TextDecoder().decode(files.get('authoring.json')!)) as AttachmentDocument;
const report=JSON.parse(read('docs/research/2026-11-02-palm-grip-results.json').toString());
const source=await decodePngBytes(base64ToBytes(author.asset.png));
const axis=Math.atan2(author.asset.axis.y-author.asset.grip.y,author.asset.axis.x-author.asset.grip.x);
const observations=[];
for(const row of report.focused.frames){
  const body=await decodePngBytes(files.get(`body/${row.frame}.png`)!);
  const old=legacy.rigidAttachment(source,row.oldEndAnchor,row.oldTarget,author.frames[row.frame].angle*Math.PI/180-axis,body);
  const revised=rigidAttachment(source,author.asset.grip,row.authoredPalmCenter,author.frames[row.frame].angle*Math.PI/180-axis,body);
  const before=occludeAttachment(old.image,body,body).hidden,after=occludeAttachment(revised.image,body,body).hidden;
  if(before!==(row.frame===3?0:1)||after!==row.hiddenItemPixels)throw new Error('Historical palm comparison did not reproduce.');
  observations.push({frame:row.frame,oldTarget:row.oldTarget,newTarget:row.authoredPalmCenter,oldHiddenPixels:before,newHiddenPixels:after});
}
console.log(JSON.stringify({paidRequests:0,bodyPixelsEdited:0,observations},null,2));
