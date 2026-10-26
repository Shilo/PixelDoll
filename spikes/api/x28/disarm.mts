// Round 9e: a weapon attack animated WITH the weapon (the weapon picks the hand; x28/body.mts slash_armed), then split into
// a bare body and a weapon layer. ea = edit-animation-v2 "remove the sword" on the 8 armed frames (+ the bare rest as frame 1);
// ip = inpaint-v3 sheet of two clips where only the non-body-colored px (weapon, trail) are masked and refilled.
// The weapon layer = armed px that changed. Usage (spikes/api): node --env-file=<repo root>/.env x28/disarm.mts <ea|ip> <clip_dir...>
// e.g. ea pm_slash_armed_s11_south   |   ip pm_slash_armed_s11_south v3_slash_armed_east
import { b64, call, save, OUT, BODY, SEED, framesOf, spent, TOTAL_CAP, clips, chroma, type Img } from './lib.mts';
import { ITEMS } from './dress.mts';

const C = 80, size = { width: C, height: C };
const img = async (im: Img) => ({ type: 'base64', base64: await b64(im), format: 'png' });
const armed = async (id: string) => (await framesOf(`${OUT}/B/${id}`))!.slice(1);
const dirOf = (id: string) => (id.endsWith('south') ? 'south' : 'east');
const REMOVE = 'Remove the sword and every slash trail or effect from the character in every frame. The hand that held it stays a closed empty fist in the same place. Keep the body, the pose, every other pixel and the transparent background exactly unchanged. No weapons, no props.';

/** Opaque px whose color is not within `tol` of any rest-view color: the weapon, its trail and their outlines. */
function foreignMask(rest: Img, f: Img, tol = 40, grow = 1) {
  const ref = new Set<number>(); for (let i = 0; i < rest.data.length; i += 4) if (rest.data[i + 3]) ref.add((rest.data[i] << 16) | (rest.data[i + 1] << 8) | rest.data[i + 2]);
  const pal = [...ref].map((c) => [c >> 16, (c >> 8) & 255, c & 255]), m = new Uint8Array(C * C);
  for (let p = 0; p < C * C; p++) { const i = p * 4; if (!f.data[i + 3]) continue;
    if (!pal.some((q) => Math.abs(q[0] - f.data[i]) + Math.abs(q[1] - f.data[i + 1]) + Math.abs(q[2] - f.data[i + 2]) <= tol)) m[p] = 1; }
  const g = new Uint8Array(m); // grow by `grow` px so outlines and anti-aliased edges go too
  for (let p = 0; p < C * C; p++) if (m[p]) for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) { const x = (p % C) + dx, y = ((p / C) | 0) + dy; if (x >= 0 && y >= 0 && x < C && y < C) g[y * C + x] = 1; }
  return g;
}
const sheet = (cells: Img[], cols: number) => { const rows = Math.ceil(cells.length / cols), W = cols * C, o = new Uint8ClampedArray(W * rows * C * 4);
  cells.forEach((c, i) => { const ox = (i % cols) * C, oy = Math.floor(i / cols) * C; for (let y = 0; y < C; y++) o.set(c.data.subarray(y * C * 4, (y + 1) * C * 4), ((oy + y) * W + ox) * 4); });
  return { w: W, h: rows * C, data: o }; };
const cut = (S: Img, i: number, cols: number): Img => { const ox = (i % cols) * C, oy = Math.floor(i / cols) * C, o = new Uint8ClampedArray(C * C * 4);
  for (let y = 0; y < C; y++) o.set(S.data.subarray(((oy + y) * S.w + ox) * 4, ((oy + y) * S.w + ox + C) * 4), y * C * 4); return { w: C, h: C, data: o }; };

/** Weapon layer = armed px that changed AND are not body-colored (the edit also redraws the body by a px here and there). */
async function split(tag: string, id: string, A: Img[], bare: Img[]) {
  const d = dirOf(id), rest = await BODY.rest(d), rows = [], key = chroma.pickKey(ITEMS.sword.prompt);
  // the weapon's own colors (from its dressed rest view) catch the gold hilt, which sits within skin tolerance
  const W = chroma.chromaLayer(await ITEMS.sword.anchor(d), key, chroma.toChroma(rest, key)).layer, wpal: number[][] = [];
  for (let i = 0; i < W.data.length; i += 4) if (W.data[i + 3]) wpal.push([W.data[i], W.data[i + 1], W.data[i + 2]]);
  const weaponColor = (a: Img, j: number) => wpal.some((q) => Math.abs(q[0] - a.data[j]) + Math.abs(q[1] - a.data[j + 1]) + Math.abs(q[2] - a.data[j + 2]) <= 24);
  for (const [i, a] of A.entries()) {
    const b = bare[i], L = { w: C, h: C, data: new Uint8ClampedArray(C * C * 4) }, fm = foreignMask(rest, a), near = foreignMask(rest, a, 40, 3); let n = 0;
    for (let p = 0; p < C * C; p++) { const j = p * 4; if (!a.data[j + 3] || !(fm[p] || (near[p] && weaponColor(a, j)))) continue; // hilt colors only next to the blade
      if (Math.abs(a.data[j] - b.data[j]) + Math.abs(a.data[j + 1] - b.data[j + 1]) + Math.abs(a.data[j + 2] - b.data[j + 2]) + Math.abs(a.data[j + 3] - b.data[j + 3]) > 40) { L.data.set(a.data.subarray(j, j + 4), j); n++; } }
    await save(`${OUT}/S/${tag}_${id}.bare.${i}.png`, b); await save(`${OUT}/S/${tag}_${id}.weapon.${i}.png`, L);
    rows.push({ weaponPx: n, bareForeign: Math.round(C * C * 0 + (1 - clips.paletteFit(rest, [b], 24)) * b.data.filter((v, k) => k % 4 === 3 && v > 0).length) });
  }
  console.log(tag, id, JSON.stringify(rows));
}

if (import.meta.main) {
  const [tool, ...ids] = process.argv.slice(2);
  if (tool === 'ea') for (const id of ids) {
    const A = await armed(id), rest = await BODY.rest(dirOf(id));
    const req = { path: '/edit-animation-v2', body: { description: `Frame 1 is the reference: the same character with no sword. ${REMOVE}`, frames: await Promise.all([rest, ...A].map(async (f) => ({ image: await img(f), size }))), image_size: size, no_background: true, seed: SEED } };
    const r = await call({ arm: 'Sea', label: `disarm ea ${id}`, file: `${OUT}/S/ea_${id}`, req, estimate: 10, armCap: 200 });
    if (r) { const o = Object.keys(r.imgs).sort((a, b) => +a.split('/').pop()! - +b.split('/').pop()!).map((k) => r.imgs[k]).slice(1); await split('ea', id, A, o); }
  }
  else {
    const per = await Promise.all(ids.map(async (id) => ({ id, A: await armed(id), rest: await BODY.rest(dirOf(id)) })));
    const cells = per.flatMap((p) => p.A), cols = 6; // inpaint-v3 takes at most 512 px per side
    const masks = per.flatMap((p) => p.A.map((a) => { const m = foreignMask(p.rest, a), o = new Uint8ClampedArray(C * C * 4);
      for (let q = 0; q < C * C; q++) { const v = m[q] ? 255 : 0; o[q * 4] = o[q * 4 + 1] = o[q * 4 + 2] = v; o[q * 4 + 3] = 255; } return { w: C, h: C, data: o }; }));
    const S = sheet(cells, cols), M = sheet(masks, cols);
    await save(`${OUT}/S/ip_mask_${ids.join('+')}.png`, M);
    const desc = `A grid of ${cells.length} pixel-art frames of a bald bare-skinned man, ${cols} per row. In every masked area, remove the sword and the slash trails: paint the hidden parts of the arm, hand (a closed empty fist), body and the transparent background, matching the rest of each frame. No weapons, no props, no effects.`;
    const r = await call({ arm: 'Sip', label: `disarm ip ${ids.join('+')}`, file: `${OUT}/S/ip_${ids.join('+')}`, estimate: 25, armCap: 200,
      req: { path: '/inpaint-v3', body: { description: desc, inpainting_image: { image: await img(S), size: { width: S.w, height: S.h } }, mask_image: { image: await img(M), size: { width: M.w, height: M.h } }, no_background: true, seed: SEED } } });
    if (r) { const out = Object.values(r.imgs)[0]; let k = 0;
      for (const p of per) { await split('ip', p.id, p.A, p.A.map(() => cut(out, k++, cols))); } }
  }
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
