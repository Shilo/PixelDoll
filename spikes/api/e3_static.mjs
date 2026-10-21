// E3: static equipment edits on the canonical base frame (walk south frame 0, 64x64), one item at a time, several routes.
// usage: node --env-file=../../.env e3_static.mjs <item|all> <route,route|all>
import fs from 'node:fs';
import { experiment, imagesOf } from './lib/run.mjs';
import { make, toB64, opaqueCount } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { heatmap } from './lib/diff.mjs';
import { extractAll } from './lib/extract.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('e3_static');
const B = X.load('../e2_anim/walk_south_0.png');
const W = B.w, H = B.h;
export const ITEMS = {
  helmet: { region: { x: 22, y: 2, w: 21, h: 21 }, what: 'a simple grey steel knight helmet covering the top and sides of the head, face visible' },
  sword: { region: { x: 10, y: 20, w: 21, h: 44 }, what: "a steel longsword held in the character's right hand (on the left side of the image), blade pointing down and slightly outward" },
  chest: { region: { x: 21, y: 19, w: 24, h: 22 }, what: 'a brown leather chest armor vest covering the torso' },
  hair: { region: { x: 21, y: 2, w: 24, h: 31 }, what: 'long straight black hair falling down to the shoulders' },
  cape: { region: { x: 16, y: 19, w: 34, h: 41 }, what: 'a long red cloth cape hanging from the shoulders behind the back, visible at both sides of the body' },
};
const prompt = (what) => `Add only ${what} to this south-facing pixel art character. Keep every other pixel of the body, face, limbs, outline, pose and the transparent background exactly unchanged. Do not redraw or move the character.`;
const maskOf = (r) => { const M = make(W, H); for (let p = 0; p < W * H; p++) { const x = p % W, y = (p / W) | 0, on = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; M.d.set(on ? [255, 255, 255, 255] : [0, 0, 0, 255], p * 4); } return M; };
const sz = { width: W, height: H };
const ROUTES = {
  'edit-image': (it) => ['/edit-image', { image: b64img(toB64(B)), image_size: sz, description: prompt(it.what), width: W, height: H, no_background: true, seed: 7 }],
  'edit-images-v2': (it) => ['/edit-images-v2', { method: 'edit_with_text', edit_images: [{ image: b64img(toB64(B)), width: W, height: H }], image_size: sz, description: prompt(it.what), no_background: true, seed: 7 }],
  'inpaint-v3': (it) => ['/inpaint-v3', { description: it.what, inpainting_image: { image: b64img(toB64(B)), size: sz }, mask_image: { image: b64img(toB64(maskOf(it.region))), size: sz }, no_background: true, crop_to_mask: true, seed: 7 }],
  'pf-edit': (it) => ['/edit-image-pro-flash', { image: b64img(toB64(B)), method: 'text', description: prompt(it.what), no_background: true, seed: 7 }],
  'pf-inpaint': (it) => ['/inpaint-image-pro-flash', { image: b64img(toB64(B)), mask_image: b64img(toB64(maskOf(it.region))), description: it.what, no_background: true, seed: 7 }],
  'pf-inpaint-newlayer': (it) => ['/inpaint-image-pro-flash', { image: b64img(toB64(B)), mask_image: b64img(toB64(maskOf(it.region))), description: it.what, no_background: true, seed: 7, output_method: 'New layer with changes' }],
  'pf-inpaint-onlychanges': (it) => ['/inpaint-image-pro-flash', { image: b64img(toB64(B)), mask_image: b64img(toB64(maskOf(it.region))), description: it.what, no_background: true, seed: 7, output_method: 'Modify current layer, only changes' }],
};

export async function runOne(item, route) {
  const it = ITEMS[item], [path, body] = ROUTES[route](it), tag = `${item}__${route}`;
  const t0 = Date.now();
  try {
    const r = await X.api.run(path, body);
    const payload = r.jobs.length ? r.jobs[0].last_response : r.res;
    X.saveJson(`${tag}.response.json`, { res: r.res, job: r.jobs[0] });
    const imgs = await imagesOf(payload, { w: W, h: H });
    if (!imgs.length) throw new Error('no image in response: ' + JSON.stringify(Object.keys(payload || {})));
    imgs.forEach((f, i) => X.save(`${tag}.out${i}.png`, f.im));
    const C = imgs[0].im;
    const usage = r.jobs[0]?.usage || r.res.usage;
    const info = { item, route, ms: Date.now() - t0, usage, outputs: imgs.map(f => `${f.path} ${f.url ? 'url' : f.type || 'b64'} ${f.im.w}x${f.im.h} opaque=${opaqueCount(f.im)}`) };
    if (C.w !== W || C.h !== H) { info.error = `canvas changed ${C.w}x${C.h}`; return info; }
    // background preserved? count opaque pixels in the 1px border ring
    let border = 0; for (let p = 0; p < W * H; p++) { const x = p % W, y = (p / W) | 0; if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && C.d[p * 4 + 3] > 0) border++; }
    info.borderOpaque = border;
    const ex = extractAll(B, C, it.region);
    info.variants = Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.m]));
    for (const k of ['exact', 'thr18', 'slot_hyst_cc']) X.save(`${tag}.layer_${k}.png`, ex[k].layer);
    X.save(`${tag}.heat.png`, heatmap(B, C));
    X.save(`${tag}.sheet.png`, sheet([[B, C, heatmap(B, C), ex.exact.layer, ex.thr18.layer, ex.slot_hyst_cc.layer, maskOf(it.region)]]));
    return info;
  } catch (e) { return { item, route, ms: Date.now() - t0, error: e.message.slice(0, 600) }; }
}

if (process.argv[1].endsWith('e3_static.mjs')) {
  const items = process.argv[2] === 'all' || !process.argv[2] ? Object.keys(ITEMS) : process.argv[2].split(',');
  const routes = process.argv[3] === 'all' || !process.argv[3] ? Object.keys(ROUTES) : process.argv[3].split(',');
  const b0 = await X.api.balance();
  const jobs = items.flatMap(i => routes.map(r => runOne(i, r)));
  const results = await Promise.all(jobs);
  const b1 = await X.api.balance();
  const resFile = `${X.dir}/results.json`;
  const prev = fs.existsSync(resFile) ? JSON.parse(fs.readFileSync(resFile)) : [];
  fs.writeFileSync(resFile, JSON.stringify([...prev, ...results], null, 1));
  for (const r of results) console.log(r.item, r.route, r.ms + 'ms', JSON.stringify(r.usage), r.error || '', r.variants ? `changed=${r.variants.exact.changed} addedOnEmpty=${r.variants.exact.addedOnEmpty} bodyChanged=${r.variants.exact.bodyChanged} smallDrift=${r.variants.exact.smallDrift} outsideRegion=${r.variants.exact.outsideChanged} border=${r.borderOpaque}` : '');
  console.log('batch balance delta gens', (b0.subscription.generations - b1.subscription.generations).toFixed(2), 'usd', (b0.credits.usd - b1.credits.usd).toFixed(4));
}
