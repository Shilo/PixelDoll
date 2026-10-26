// Round 6 gallery (no API calls): blind side-by-side frame strips for GIFs, item extraction on the new moves, and X3 metrics.
// Writes out/x26/gallery/<case>/<variant>/<i>.png plus gallery.json; x26/gif.py turns them into GIFs and the page.
// Usage (spikes/api): node x26/gallery.mts
import fs from 'node:fs';
import { load, save, OUT, BODY, RIG, CELL, items, chroma, clips, restKps } from './lib.mts';
const { evaluate, padTo } = await import('../c25/evaluate.mts');
const { mocapSeq } = await import('./b_items.mts');

type Img = { w: number; h: number; data: Uint8ClampedArray };
const G = `${OUT}/gallery`, S = 4, BOX = 112;
fs.rmSync(G, { recursive: true, force: true });
const seq = async (base: string, n: number, mid = '.') => { const o: Img[] = []; for (let i = 0; i < n; i++) { const f = `${base}${mid}${i}.png`; if (fs.existsSync(f)) o.push(await load(f)); } return o; };
const bodyFrames = (name: string, d: string, n: number) => seq(`${OUT}/${name.startsWith('authored_slash') && d === 'south' ? 'X1' : 'X2'}/body_${name}_${d}`, n);
const stored = async (anim: string, d: string, n: number) => Promise.all(Array.from({ length: n }, (_, i) => BODY.base(d, anim, i)));
/** Upscale on a neutral backdrop, centered in a BOX×BOX cell. */
function frame(im: Img): Img {
  const c = padTo(im, BOX), W = BOX * S, o = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (((y / S) | 0) * BOX + ((x / S) | 0)) * 4, j = (y * W + x) * 4, a = c.data[i + 3] / 255, bg = ((x >> 4) + (y >> 4)) & 1 ? 58 : 50;
    o[j] = c.data[i] * a + bg * (1 - a); o[j + 1] = c.data[i + 1] * a + bg * (1 - a); o[j + 2] = c.data[i + 2] * a + (bg + 6) * (1 - a); o[j + 3] = 255;
  }
  return { w: W, h: W, data: o };
}
const cases: any[] = [];
let rng = 26; const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
async function blind(id: string, title: string, question: string, variants: [string, Img[] | Promise<Img[]>][]) {
  const vs = (await Promise.all(variants.map(async ([n, p]) => [n, await p] as [string, Img[]]))).filter(([, f]) => f.length);
  for (let i = vs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [vs[i], vs[j]] = [vs[j], vs[i]]; }
  const out = vs.map(([name, frames], k) => ({ letter: 'ABCDEFG'[k], name, n: frames.length }));
  for (const [k, [, frames]] of vs.entries()) for (const [i, f] of frames.entries()) await save(`${G}/${id}/${'ABCDEFG'[k]}/${String(i).padStart(2, '0')}.png`, frame(f));
  cases.push({ id, title, question, blind: true, variants: out });
}
async function show(id: string, title: string, question: string, variants: [string, Img[]][]) {
  for (const [k, [, frames]] of variants.entries()) for (const [i, f] of frames.entries()) await save(`${G}/${id}/${'ABCDEFG'[k]}/${String(i).padStart(2, '0')}.png`, frame(f));
  cases.push({ id, title, question, blind: false, variants: variants.map(([name, f], k) => ({ letter: 'ABCDEFG'[k], name, n: f.length })) });
}

// ---- body motion (X1 + X2) ----
const pmxRaw = (d: string) => seq(`${OUT}/X2/body_pmx_chop_raw_${d}`, 8);
await blind('slash_south', 'Slash, facing south', 'Which attack looks most natural and least robotic?', [
  ['Our authored slash (today)', bodyFrames('authored_slash', 'south', 8)],
  ['Authored slash + joint depth/draw order (X1)', bodyFrames('authored_slash_depth', 'south', 8)],
  ['PixelLab text chop (pixminimax), re-rendered on our skeleton', pmxRaw('south')],
  ['CC0 mocap slash, first retarget (per-joint deltas) with depth', seq(`${OUT}/X2/body_mocap_slash_south`, 8)],
  ['CC0 mocap slash, bone-rotation retarget with depth', seq(`${OUT}/X2/body_mocap_bone_slash_south`, 8)],
]);
await blind('slash_east', 'Slash, facing east', 'Which attack looks most natural?', [
  ['Our authored slash (today, visible-side-v1)', bodyFrames('authored_slash', 'east', 8)],
  ['CC0 mocap slash, first retarget (per-joint deltas) with depth', seq(`${OUT}/X2/body_mocap_slash_east`, 8)],
  ['CC0 mocap slash, bone-rotation retarget with depth', seq(`${OUT}/X2/body_mocap_bone_slash_east`, 8)],
]);
for (const d of ['south', 'east']) await blind(`idle_${d}`, `Idle, facing ${d}`, 'Which idle looks more alive?', [
  ['Our authored idle (today)', stored('idle', d, 4)],
  ['PixelLab breathing-idle template, re-rendered on our skeleton', seq(`${OUT}/X2/body_tpl_idle_raw_${d}`, 4)],
]);
await show('hurt', 'Hurt (today, for reference)', 'Our authored hurt, south then east: the arms-only recoil.', [['Authored hurt south', await bodyFrames('authored_hurt', 'south', 6)], ['Authored hurt east', await bodyFrames('authored_hurt', 'east', 6)]]);
await show('pmx_east', 'PixelLab text chop, east (raw managed output)', 'Why the text chop was not used for east: the body turns to a back view mid-move.', [['pixminimax chop east (managed, not re-rendered)', (await seq(`${OUT}/X2/managed_pmx_chop_east.east_`, 9, '')).slice(1)]]);

// ---- X3: dresser (rest views) ----
const CLOAK = 'a long red cloak open at the front, hanging from the shoulders down to the calves', key = chroma.pickKey(CLOAK), views = ['south', 'east', 'north'];
const metrics: any = { x3: {} };
const ea2 = await Promise.all([0, 1, 2].map((i) => load(`out/c25e/U/c27man_cloak/dress.${i}.png`)));
const state = await Promise.all(views.map((d) => load(`${OUT}/X3/state_cloak.${d}.png`)));
for (const [name, outs] of [['edit-animation-v2', ea2], ['create-character-state', state]] as const) {
  metrics.x3[name] = await Promise.all(views.map(async (d, i) => {
    const c = items.extractCell({ key: `rest/${d}/0`, call: 0, base: chroma.toChroma(await BODY.rest(d), key), out: outs[i], route: key, band: items.bandOf('back', undefined, CELL.h) });
    return { dir: d, keyKept: +(c.keyKept ?? 1).toFixed(3), keyOutside: +(c.keyOutside ?? 0).toFixed(3), itemPx: c.area };
  }));
}
await blind('dresser', 'Cloak dress on the standing views (X3)', 'Which cloak is cleaner and more consistent across S / E / N? (each animation step = one direction)', [
  ['edit-animation-v2 (today, one call, 3 views)', ea2],
  ['create-character-state (one call, all rotations, on the imported green body)', state],
]);

// ---- X4: items posed on the new moves, composited over the body frames of the same move ----
const rigWith = (anim: string, d: string, kps: any[][]) => ({ ...RIG, animations: [...RIG.animations, { id: anim, cells: kps.length, loop: true, frames: kps.map((_, cell) => ({ cell, ms: 100 })), sources: { [d]: { keypoints: kps } } }] });
metrics.x4 = {};
const X4: [string, string, string, string][] = [['sword', 'main_hand', 'a steel longsword', 'slash'], ['cloak', 'back', CLOAK, 'slash'], ['hair', 'hair', 'shoulder-length dark brown hair, no hat', 'idle']];
for (const d of ['south', 'east']) {
  const strips: [string, Img[]][] = [];
  for (const [name, slot, prompt, anim] of X4) {
    const outsAll = await seq(`${OUT}/X4/pose_${name}_${d}`, 16);
    if (!outsAll.length) continue;
    const kps = anim === 'slash' ? mocapSeq(d) : JSON.parse(fs.readFileSync(`${OUT}/X2/seq_tpl_idle_${d}.json`, 'utf8'));
    const k = chroma.pickKey(prompt), pad = items.padOf(slot, 'skel', CELL);
    const outs = items.unrotate(outsAll, items.f0Last(slot, restKps(d) as any, clips.paddedPoses(kps), CELL)).slice(0, kps.length);
    const bases = anim === 'slash' ? await seq(`${OUT}/X2/body_mocap_slash_${d}`, 8) : await seq(`${OUT}/X2/body_tpl_idle_raw_${d}`, 4);
    const kf = name === 'cloak' ? await load(`${OUT}/X3/state_cloak.${d}.png`) : await load(`${OUT}/X4/dress_${name === 'hair' ? 'hair2' : name}.${['south', 'east'].indexOf(d)}.png`);
    const r: any = evaluate({ name, slot, key: k, pad, rig: rigWith(anim, d, kps), rest: { [d]: await BODY.rest(d) }, dress: { [d]: kf }, clips: [{ anim, dir: d, frames: bases.map((b, i) => ({ base: b, out: outs[i] })) }] } as any);
    metrics.x4[`${name}_${d}`] = { status: r.status, fails: r.fails, warnings: r.warnings.length, clips: r.clips };
    strips.push([`${name} on ${anim === 'slash' ? 'mocap slash (first retarget)' : 'template idle'}`, r.cells.map((c: any) => items.recompose(c))]);
  }
  await show(`items_${d}`, `Items posed on the new moves, facing ${d} (X4)`, 'Do the items follow the body and keep one design?', strips);
}
fs.writeFileSync(`${G}/gallery.json`, JSON.stringify({ cases, metrics }, null, 1));
console.log(JSON.stringify(metrics, null, 1).slice(0, 4000));
