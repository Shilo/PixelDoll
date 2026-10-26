// Round 6, step B1: motion transfer. Managed template idle (S, E) and the pixminimax chop (S only: its east turned to a back
// view, the known facing drift) -> estimate-skeleton per frame -> change-retarget onto the body's rest pose -> raw skeleton-v3.
// Also retries the hair dress once with new wording (the first was refused by PixelLab's content policy).
// Usage (spikes/api): node --env-file=<repo root>/.env x26/b_motion.mts
import fs from 'node:fs';
import { load, OUT, items, chroma, b64, call, CELL, SEED, BODY, estimateFrame, retarget, renderBody, spent, TOTAL_CAP } from './lib.mts';

const frames = async (name: string, d: string) => {
  const o = [];
  for (let i = 0; i < 16; i++) { const f = `${OUT}/X2/managed_${name}_${d}.${d}_${i}.png`; if (fs.existsSync(f)) o.push(await load(f)); }
  return name.startsWith('pmx') ? o.slice(1) : o; // pixminimax returned its reference frame first despite keep_first_frame: false
};
async function transfer(name: string, d: string, action: string) {
  const fr = await frames(name, d);
  const kps = await Promise.all(fr.map((im, i) => estimateFrame({ arm: 'X2', label: `est ${name} ${d} ${i}`, file: `${OUT}/X2/est_${name}_${d}_${i}`, img: im, armCap: 70 })));
  if (kps.some((k) => !k)) return console.log(`estimate missing for ${name} ${d}`);
  const seq = retarget(kps as any, d, { w: fr[0].w, h: fr[0].h });
  fs.writeFileSync(`${OUT}/X2/seq_${name}_${d}.json`, JSON.stringify(seq));
  return renderBody({ arm: 'X2', armCap: 70, name: `${name}_raw`, dir: d, action, keypoints: seq });
}
const HAIR = 'shoulder-length dark brown hair, no hat';
await Promise.all([
  transfer('tpl_idle', 'south', 'breathing idle'),
  transfer('tpl_idle', 'east', 'breathing idle'),
  transfer('pmx_chop', 'south', 'slash, empty hands, no weapon, no props, no effects'),
  (async () => {
    const key = chroma.pickKey(HAIR), drawn = ['south', 'east', 'north'];
    const views = await Promise.all(drawn.map(async (d) => b64(chroma.toChroma(await BODY.rest(d), key))));
    const req = items.itemRoute.edit(views, items.itemPrompt(HAIR, key, drawn.map((d) => `rest/${d}/0`)), SEED, CELL);
    return call({ arm: 'X4', label: 'dress hair (retry, new wording)', file: `${OUT}/X4/dress_hair2`, req: req as any, estimate: 10, armCap: 45 });
  })(),
]);
console.log(`spent ${spent()} / ${TOTAL_CAP}`);
