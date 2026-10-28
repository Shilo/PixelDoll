import fs from 'node:fs';
import path from 'node:path';
import {decodePngBytes,encodePngBytes} from '../../../app/src/lib/image/pngraw.ts';
import {contactSheet} from '../../../app/src/lib/items/items.ts';
import {sheet} from '../animation-research-2026-10-27/preview.mts';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'spikes/api/out/motion-lab-2026-10-28'),library=JSON.parse(fs.readFileSync(path.join(root,'app/dev-fixtures/motion-lab/library.json'),'utf8'));
for(const fixture of library.fixtures){const images=[];for(const direction of ['south','east','north']){const ref=fixture.references[direction],image=await decodePngBytes(new Uint8Array(Buffer.from(ref.png,'base64')));images.push(sheet([image],[ref.keypoints],true));}fs.writeFileSync(path.join(out,`reference-${fixture.id}.png`),await encodePngBytes(contactSheet([images],1,4)));}
console.log('Saved native reference-joint overlays, in south/east/north order.');
