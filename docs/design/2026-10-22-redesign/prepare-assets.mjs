import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const iconNames=['arrow-left','arrow-right','chevron-left','chevron-right','plus','search','sun','moon','shirt','palette','person-standing','bookmark','download','upload','check','x','undo-2','play','pause','settings-2','layers','eye','sparkles','scissors','crown','footprints','sword','backpack','circle-help','grid-2x2','panel-right-close','rotate-ccw','folder-open','key-round','ellipsis','circle','info'];
const icons={};
for(const name of iconNames){
 const iconDir=path.join(root,'app/node_modules/@lucide/svelte/dist/icons');
 let iconFile=path.join(iconDir,name+'.svelte');
 if(!fs.existsSync(iconFile)){const alias=fs.readFileSync(path.join(iconDir,name+'.js'),'utf8').match(/from "\.\/(.+?\.svelte)"/)[1];iconFile=path.join(iconDir,alias);}
 const source=fs.readFileSync(iconFile,'utf8');
 const data=JSON.parse(source.match(/export const __iconData = (.*?);/)[1]);
 icons[name]=`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${data.node.map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('')}</svg>`;
}
const layers={body:'body/base',vest:'torso_inner/vest_leather',cape:'back/cape_red',hair:'hair/hair_brown',helmet:'head/helmet_steel',hat:'head/hat_wizard',sword:'main_hand/sword_steel'};
const sheets={};
for(const [name,location] of Object.entries(layers)){
 sheets[name]='data:image/png;base64,'+fs.readFileSync(path.join(root,'app/public/fixtures/s2/layers',location,'main/walk.png')).toString('base64');
}
fs.writeFileSync(path.join(here,'assets/data.js'),'window.PD_ASSETS='+JSON.stringify({icons,sheets})+';\n');
console.log('Prepared existing Lucide icons and seven offline fixture sheets.');
