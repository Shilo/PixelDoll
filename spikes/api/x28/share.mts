// Round 9f: shared equipment without skeleton. The man's dressed rest views (round 6) carry the design to a second body
// (c27woman): one edit-animation-v2 call [man S, E, (N) dressed | woman S, E, (N) green] dresses her rest views; then her own
// text-animated walk is dressed with her anchor exactly like the man's (x28/dress.mts ea).
// Usage (spikes/api): node --env-file=<repo root>/.env x28/share.mts anchors|walk|dress|eval
import fs from 'node:fs';
import { b64, call, save, load, OUT, items, chroma, SEED, BODY, framesOf, spent, TOTAL_CAP, pool, type Img } from './lib.mts';
import { ITEMS } from './dress.mts';
const { studioBody } = await import('../c25/bodyB.mts');

const W = studioBody('c27woman'), C = 80, size = { width: C, height: C };
const img = async (im: Img) => ({ type: 'base64', base64: await b64(im), format: 'png' });
const DIRS: Record<string, string[]> = { cloak: ['south', 'east', 'north'], sword: ['south', 'east'] };
const F = (s: string) => `${OUT}/W/${s}`;
const sorted = (r: { imgs: Record<string, Img> }) => Object.keys(r.imgs).sort((a, b) => +a.split('/').pop()! - +b.split('/').pop()!).map((k) => r.imgs[k]);

/** Her dressed rest views: the man's dressed views as reference cells, then her green views. */
async function anchors(item: string) {
  const it = ITEMS[item], key = chroma.pickKey(it.prompt), ds = DIRS[item];
  const man = await Promise.all(ds.map((d) => it.anchor(d))), her = await Promise.all(ds.map(async (d) => chroma.toChroma(await W.rest(d), key)));
  const say = items.slotOf(it.slot).class === 'held' ? items.heldPhrase(it.prompt, it.slot) : it.prompt;
  const desc = `Frames 1-${ds.length} are the reference: a ${chroma.KEY_NAME[key]} mannequin facing ${ds.join(', ')} wearing ${say}. Frames ${ds.length + 1}-${2 * ds.length} are a different ${chroma.KEY_NAME[key]} mannequin facing ${ds.join(', ')}: dress each in exactly the same ${item} design, colors and details as the reference frame of the same facing, fitted to this body. Keep the mannequins' poses, silhouettes, ${chroma.KEY_NAME[key]} color and the transparent background exactly; no other clothing, weapons or effects.`;
  const r = await call({ arm: 'Wa', label: `share anchors ${item}`, file: F(`anchor_${item}`), estimate: 10, armCap: 200,
    req: { path: '/edit-animation-v2', body: { description: desc, frames: await Promise.all([...man, ...her].map(async (f) => ({ image: await img(f), size }))), image_size: size, no_background: true, seed: SEED } } });
  return r && sorted(r).slice(ds.length);
}
const walk = (d: string) => (async () => call({ arm: 'Wb', label: `share woman walk ${d}`, file: F(`pm_walk_${d}`), estimate: 1, armCap: 200,
  req: { path: '/animate-pixminimax', body: { first_frame: await img(await W.rest(d)), description: 'walking in place, a full stride cycle with arms swinging opposite the legs; only this one character, empty hands, no weapon, no props, no other people, no effects', frame_count: 8, seed: SEED, no_background: true, direction: d, view: 'low top-down', subject_description: 'a bald bare-skinned human woman, barefoot, empty hands', initial_pose: 'standing upright, arms at the sides' } } }))();
async function dressWalk(item: string, d: string) {
  const it = ITEMS[item], key = chroma.pickKey(it.prompt), anchor = await load(F(`anchor_${item}.${DIRS[item].length + DIRS[item].indexOf(d)}.png`));
  const frames = (await framesOf(F(`pm_walk_${d}`)))!.slice(1).map((f) => chroma.toChroma(f, key));
  const cells = frames.map((_, i) => `walk/${d}/${i + 1}`);
  return call({ arm: 'Wd', label: `share dress ${item} walk ${d}`, file: F(`ea_${item}_walk_${d}`), estimate: 10, armCap: 200,
    req: { path: '/edit-animation-v2', body: { description: items.itemPrompt(items.slotOf(it.slot).class === 'held' ? items.heldPhrase(it.prompt, it.slot) : it.prompt, key, cells, `rest/${d}/0`), frames: await Promise.all([anchor, ...frames].map(async (f) => ({ image: await img(f), size }))), image_size: size, no_background: true, seed: SEED } } });
}
/** Composite her walk + item layer, and the item's palette distance to the MAN's anchor item (the shared design). */
async function evaluate(item: string, d: string) {
  const it = ITEMS[item], key = chroma.pickKey(it.prompt);
  const manL = chroma.chromaLayer(await it.anchor(d), key, chroma.toChroma(await BODY.rest(d), key)).layer, ref: number[][] = [];
  for (let i = 0; i < manL.data.length; i += 4) if (manL.data[i + 3]) ref.push([manL.data[i], manL.data[i + 1], manL.data[i + 2]]);
  const pal = (L: Img) => { let s = 0, n = 0; for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3]) { s += Math.min(...ref.map((q) => Math.hypot(q[0] - L.data[i], q[1] - L.data[i + 1], q[2] - L.data[i + 2]))); n++; } return { pal: n ? +(s / n).toFixed(1) : null, area: n }; };
  const herAnchor = await load(F(`anchor_${item}.${DIRS[item].length + DIRS[item].indexOf(d)}.png`)), herRestG = chroma.toChroma(await W.rest(d), key);
  const a = pal(chroma.chromaLayer(herAnchor, key, herRestG).layer), out: any = { anchor: { ...a, manArea: ref.length } };
  if (fs.existsSync(F(`ea_${item}_walk_${d}.json`))) {
    const bodies = (await framesOf(F(`pm_walk_${d}`)))!.slice(1), outs = (await framesOf(F(`ea_${item}_walk_${d}`)))!.slice(1), rows = [];
    for (const [i, o] of outs.entries()) { const base = chroma.toChroma(bodies[i], key), L = chroma.chromaLayer(o, key, base).layer;
      const comp = { w: C, h: C, data: new Uint8ClampedArray(bodies[i].data) }; for (let p = 0; p < C * C; p++) if (L.data[p * 4 + 3]) comp.data.set(L.data.subarray(p * 4, p * 4 + 4), p * 4);
      await save(F(`ea_${item}_walk_${d}.comp.${i}.png`), comp); rows.push(pal(L)); }
    out.walk = { palMean: +(rows.reduce((s, r) => s + (r.pal ?? 99), 0) / rows.length).toFixed(1), areas: rows.map((r) => r.area).join(' ') };
  }
  return out;
}

if (import.meta.main) {
  const step = process.argv[2];
  if (step === 'anchors') await Promise.all(['cloak', 'sword'].map(anchors));
  if (step === 'walk') await pool(['south', 'east', 'north'].map((d) => () => walk(d)), 3);
  if (step === 'dress') await pool([...DIRS.cloak.map((d) => () => dressWalk('cloak', d)), ...DIRS.sword.map((d) => () => dressWalk('sword', d))], 5);
  if (step === 'eval') for (const item of ['cloak', 'sword']) for (const d of DIRS[item]) console.log(item, d, JSON.stringify(await evaluate(item, d)));
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
