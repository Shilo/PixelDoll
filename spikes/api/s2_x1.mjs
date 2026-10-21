// S2/X1: chroma mannequin. Recolour frozen base walk frames to a key ramp, ask PixelLab to dress the KEY mannequin.
// usage: node --env-file=../../.env s2_x1.mjs <item,item> <variant,variant> [ea2|to2] [base=s1|<s2 tag>]
// ea2: 16 frames = 8 south + 8 east walk in ONE call (one design across both directions). to2: 8 south (+ref).
import fs from 'node:fs';
import { experiment } from './lib/run.mjs';
import { toB64, fromB64, over } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { toChroma, WHAT, NAME, chromaPrompt } from './lib/chroma.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { layerFrom } from './lib/diff.mjs';
import { ITEMS as E3 } from './e3_static.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('s2_x1');
const [items = 'helmet', vars = 'green', route = 'ea2'] = process.argv.slice(2);
const load = (d, i) => X.load(`../e2_anim/walk_${d}_${i}.png`);
const base = [...['south', 'east'].flatMap(d => [...Array(8).keys()].map(i => load(d, i)))];
const W = 64, sz = { width: W, height: W }, fr = F => ({ image: b64img(toB64(F)), size: sz });
const cost = (o) => { fs.appendFileSync(`${X.dir}/costs.jsonl`, JSON.stringify(o) + '\n'); console.log('COST', JSON.stringify(o)); };

async function one(item, v) {
  const tag = `${item}_${v}_${route}`, K = base.map(B => toChroma(B, v)), t0 = Date.now();
  K.forEach((k, i) => i < 8 && X.save(`chroma_${v}_${i}.png`, k));
  try {
    let r;
    if (route === 'ea2') r = await X.api.run('/edit-animation-v2', { description: chromaPrompt(item, v, 'Frames 1-8 face south (front view), frames 9-16 face east (side view). '), frames: K.map(fr), image_size: sz, no_background: true, seed: 7 });
    else {
      // reference = chroma base south_0 + S1's clean E3 inpaint-v3 item layer (slot_thr18), so the reference is the same key mannequin wearing the item
      const B0 = base[0], L = layerFrom(X.load(`../e3_static/${item}__inpaint-v3.out0.png`), VARIANTS.slot_thr18(B0, X.load(`../e3_static/${item}__inpaint-v3.out0.png`), E3[item].region));
      const ref = over(toChroma(B0, v), L); X.save(`${tag}.ref.png`, ref);
      r = await X.api.run('/transfer-outfit-v2', { reference_image: fr(ref), frames: K.slice(0, 8).map(fr), image_size: sz, no_background: true, seed: 7, additional_instructions: `Only add the ${item} from the reference. The ${NAME[v]} mannequin colour is intentional and must stay unchanged. Frames show the character south-facing (front view).` });
    }
    const lr = r.jobs[0].last_response, outs = (lr.images || []).map(a => fromB64(a.base64));
    outs.forEach((o, i) => X.save(`${tag}.out${i}.png`, o));
    X.saveJson(`${tag}.response.json`, { keys: Object.keys(lr), job: r.jobs[0] });
    cost({ tag, route, ms: Date.now() - t0, usage: r.jobs[0].usage, nOut: outs.length });
    X.save(`${tag}.raw_sheet.png`, sheet([K.slice(0, 8), outs.slice(0, 8), K.slice(8), outs.slice(8)].filter(r => r.length), { s: 3 }));
  } catch (e) { cost({ tag, route, ms: Date.now() - t0, error: e.message.slice(0, 600) }); }
}
const b0 = await X.api.balance();
await Promise.all(items.split(',').flatMap(it => vars.split(',').map(v => one(it, v))));
const b1 = await X.api.balance();
cost({ batch: `${items} ${vars} ${route}`, generationsDelta: +(b0.subscription.generations - b1.subscription.generations).toFixed(2) });
