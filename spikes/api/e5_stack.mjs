// E5: layer stacking (static + animated), cape front/back split, two-pass "remove the character" fallback.
import { experiment, imagesOf } from './lib/run.mjs';
import { over, toB64, make, bbox, opaqueCount } from './lib/img.mjs';
import { b64img } from './lib/api.mjs';
import { VARIANTS } from './lib/extract.mjs';
import { layerFrom, maskExact } from './lib/diff.mjs';
import { ITEMS } from './e3_static.mjs';
import { sheet } from './lib/sheet.mjs';

const X = experiment('e5_stack');
const B = X.load('../e2_anim/walk_south_0.png');
const ext = (C, region) => layerFrom(C, VARIANTS.slot_novel_cc(B, C, region));
const px = (L) => opaqueCount(L);
const overlap = (a, b) => { let n = 0; for (let i = 3; i < a.d.length; i += 4) if (a.d[i] && b.d[i]) n++; return n; };

// 1. static stack (inpaint-v3 layers, all extracted against the same base frame)
const L = Object.fromEntries(Object.keys(ITEMS).map(k => [k, ext(X.load(`../e3_static/${k}__inpaint-v3.out0.png`), ITEMS[k].region)]));
const order = ['cape', 'chest', 'hair', 'helmet', 'sword'];
const pairs = []; for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) pairs.push(`${order[i]}+${order[j]}:${overlap(L[order[i]], L[order[j]])}`);
console.log('static layer px', Object.fromEntries(order.map(k => [k, px(L[k])])), 'pairwise overlap px', pairs.join(' '));
let full = B; const steps = [B];
for (const k of ['chest', 'helmet', 'sword']) { full = over(full, L[k]); steps.push(full); }
X.save('static_stack_chest_helmet_sword.png', full);
X.save('static_stack_sheet.png', sheet([steps, [B, L.chest, L.helmet, L.sword]]));

// 2. animated stack: helmet + chest from edit-animation-v2 runs (each extracted against the same unchanged base frames)
const SK = JSON.parse((await import('node:fs')).readFileSync(`${X.dir}/../e4_anim/walk_skeletons.json`));
const rows = [[], [], [], []]; const ov = [];
for (let i = 0; i < 8; i++) {
  const Bi = X.load(`../e2_anim/walk_south_${i}.png`), k = SK[`south_${i}`];
  const cx = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'].reduce((a, l) => a + k[l][0], 0) / 5;
  const rh = { x: Math.floor(cx - 11), y: 0, w: 22, h: Math.ceil(k.NECK[1] + 2) };
  const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map(l => k[l][0]);
  const rc = { x: Math.floor(Math.min(...xs) - 2), y: Math.floor(k.NECK[1] - 2), w: Math.ceil(Math.max(...xs) + 3 - Math.min(...xs) + 2), h: Math.ceil(Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 5 - k.NECK[1]) };
  const Lh = layerFrom(X.load(`../e4_anim/helmet_south__ea2.out${i}.png`), VARIANTS.slot_novel_cc(Bi, X.load(`../e4_anim/helmet_south__ea2.out${i}.png`), rh));
  const Lc = layerFrom(X.load(`../e4_anim/chest_south__ea2.out${i}.png`), VARIANTS.slot_novel_cc(Bi, X.load(`../e4_anim/chest_south__ea2.out${i}.png`), rc));
  ov.push(overlap(Lh, Lc));
  rows[0].push(Bi); rows[1].push(Lc); rows[2].push(Lh); rows[3].push(over(over(Bi, Lc), Lh));
}
X.save('anim_stack_sheet.png', sheet(rows, { s: 3 }));
console.log('animated helmet/chest overlap px per frame', ov.join(','));

// 3. cape front/back split by base silhouette
const Lcape = L.cape, front = make(B.w, B.h), back = make(B.w, B.h);
for (let i = 0; i < B.d.length; i += 4) if (Lcape.d[i + 3]) (B.d[i + 3] ? front : back).d.set(Lcape.d.subarray(i, i + 4), i);
const recompose = over(over(back, B), front), direct = over(B, Lcape);
console.log('cape split: front px', px(front), 'back px', px(back), 'back,base,front == base+layer:', maskExact(recompose, direct).reduce((a, b) => a + b, 0) === 0);
X.save('cape_split_sheet.png', sheet([[B, X.load('../e3_static/cape__inpaint-v3.out0.png'), Lcape, back, front, recompose]]));

// 4. two-pass fallback: ask PixelLab to remove the character from the cape composite
const Ccape = X.load('../e3_static/cape__inpaint-v3.out0.png');
const desc = 'Remove the character completely (head, body, arms, legs, underwear). Keep only the red cape exactly as it is, in the same position, on a transparent background.';
const routes = {
  'pf-edit': ['/edit-image-pro-flash', { image: b64img(toB64(Ccape)), method: 'text', description: desc, no_background: true, seed: 7 }],
  'edit-images-v2': ['/edit-images-v2', { method: 'edit_with_text', edit_images: [{ image: b64img(toB64(Ccape)), width: 64, height: 64 }], image_size: { width: 64, height: 64 }, description: desc, no_background: true, seed: 7 }],
};
const out = [B, Ccape, Lcape];
for (const [name, [p, body]] of Object.entries(routes)) {
  try {
    const r = await X.api.run(p, body); const [{ im: R }] = await imagesOf(r.jobs[0].last_response.images || r.jobs[0].last_response, { w: 64, h: 64 });
    X.save(`cape_removed_${name}.png`, R); out.push(R);
    let inter = 0, uni = 0, same = 0, insideBody = 0;
    for (let i = 3; i < R.d.length; i += 4) { const a = R.d[i] > 0, b = Lcape.d[i] > 0; if (a && b) { inter++; if (R.d[i - 3] === Lcape.d[i - 3] && R.d[i - 2] === Lcape.d[i - 2] && R.d[i - 1] === Lcape.d[i - 1]) same++; } if (a || b) uni++; if (a && B.d[i]) insideBody++; }
    console.log('two-pass', name, { usage: r.jobs[0].usage, ms: r.totalMs, removedPx: px(R), alphaIoUvsDiffLayer: +(inter / uni).toFixed(2), identicalPxOnOverlap: same, pxInsideBaseSilhouette: insideBody, bbox: bbox(R) });
  } catch (e) { console.log('two-pass', name, 'ERROR', e.message.slice(0, 400)); }
}
X.save('cape_twopass_sheet.png', sheet([out]));
