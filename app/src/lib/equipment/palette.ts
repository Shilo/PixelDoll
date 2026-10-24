import type { Img } from '../image/png.ts';
import { GATES } from '../items/items.ts';

/** Exact-palette repair for isolated new item pixels. Never changes alpha or the input image. */
export function normalizeItemPalette(image:Img,palette:ReadonlySet<number>,limit=GATES.paletteDist):{image:Img;changed:number;pixels:number;unmatched:number;mapping:Map<number,number>}{
  const data=new Uint8ClampedArray(image.data),mapping=new Map<number,number>(),failed=new Set<number>();
  let changed=0,pixels=0,unmatched=0;
  const distance=(a:number,b:number)=>Math.max(Math.abs((a>>16)-(b>>16)),Math.abs(((a>>8)&255)-((b>>8)&255)),Math.abs((a&255)-(b&255)));
  for(let i=0;i<data.length;i+=4)if(data[i+3]){
    pixels++;const color=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
    if(palette.has(color))continue;
    if(!mapping.has(color)&&!failed.has(color)){
      let best=Infinity,choice:number|undefined,tied=false;
      for(const candidate of palette){const d=distance(color,candidate);if(d<best){best=d;choice=candidate;tied=false;}else if(d===best)tied=true;}
      if(choice!==undefined&&best<=limit&&!tied)mapping.set(color,choice);else failed.add(color);
    }
    const next=mapping.get(color);if(next===undefined){unmatched++;continue;}
    data[i]=next>>16;data[i+1]=(next>>8)&255;data[i+2]=next&255;changed++;
  }
  return{image:{...image,data},changed,pixels,unmatched,mapping};
}
