// Task 1: census of real PixelLab dressed keyframes. Item px = opaque output px that are off the base silhouette or differ from
// the mannequin input (the keyed base, or the real base for the "none" diff route) by more than 32 (Chebyshev RGB).
// Px that score as the GENERATION key (>= KT) are kept apart as "ambiguous" (a redrawn mannequin shade or a key-colored item
// px: indistinguishable), so cross-key comparisons use only the unambiguous set. Writes census.json.
import fs from 'node:fs';
import { chroma, load, exists, pad, cheb, classify, hueOf, KEYDEFS, KT, type Img, type RGB } from './lib.mts';
const OUT = 'C:/Programming_Files/Shilocity/PixelLab/PixelDoll/spikes/api/out/';
const DIRS3 = ['south', 'east', 'north'];

// ---------- bases ----------
const restA = (d: string) => load(`${OUT}s3_k6/rot_base_${d}.png`);
const { decodePngBytes } = await import('file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/src/lib/image/pngraw.ts');
function studio(name: string) {
  const J = JSON.parse(fs.readFileSync(`${OUT}c25/${name}.json`, 'utf8'));
  return {
    drawn: J.rig.directions.filter((d: any) => !d.mirrorOf).map((d: any) => d.id) as string[],
    rest: (d: string): Promise<Img> => decodePngBytes(new Uint8Array(Buffer.from(J.images[J.rig.rest[d].image], 'base64'))),
  };
}
const bodies: Record<string, { drawn: string[]; rest: (d: string) => Promise<Img> }> = {
  A: { drawn: DIRS3, rest: restA },
  B: studio('bodyB'), body128: studio('body128'), chibi: studio('chibi'),
  c26man: studio('c26man'), c26woman: studio('c26woman'), c27man: studio('c27man'), c27woman: studio('c27woman'),
};

// ---------- item list ----------
interface Src { id: string; prompt: string; body: string; files: string[]; test: boolean } // test = prompt deliberately names key-colliding colors
const S: Src[] = [];
const add = (id: string, prompt: string, body: string, prefix: string, test = false, sep = '.') => {
  const files = bodies[body].drawn.map((d, i) => (sep === '_' ? `${OUT}${prefix}_${d}.png` : `${OUT}${prefix}.${i}.png`));
  if (files.every(exists)) S.push({ id, prompt, body, files, test }); else console.error('missing', id, files.find((f) => !exists(f)));
};
const S4: Record<string, string> = {
  helmet: 'a simple grey steel knight helmet covering the top and sides of the head, face visible',
  cape: 'a long red cloth cape hanging from the shoulders behind the back, visible at both sides of the figure',
  chest: 'a brown leather chest armor vest covering the torso',
  boots: 'a pair of brown leather boots on the feet, reaching up to just below the knees',
  hair: 'short messy dark brown hair covering the top, back and sides of the head, face visible, no hat',
  sword: 'a steel longsword',
};
for (const [k, p] of Object.entries(S4)) add(`s4 ${k}`, p, 'A', `s4_q3e/dress_ea2_${k}`, false, '_');
const D: Record<string, [string, boolean]> = {
  greathelm: ['a steel great helm with a narrow eye slit, covering the whole head', false],
  cloak: ['a long red hooded cloak with the hood up over the head, hanging down the back to the calves', false],
  tunic: ['an emerald green tunic with gold trim, covering the torso down to the hips', true],
  blackboots: ['black leather boots reaching up to just below the knees', false],
  crown: ['a small gold crown with a white fur rim', false],
  robe: ['a long white wizard robe with long sleeves, covering the body from the shoulders down to the ankles', false],
};
for (const [k, [p, t]] of Object.entries(D)) for (const v of ['ctrl', 'view']) for (const s of [7, 11]) add(`D ${k} ${v} s${s}`, p, 'A', `c25/D/${k}/${v}_s${s}`, t);
const K: Record<string, string> = { jester: 'a green and pink jester hat with three bells', holly: 'a red and green holly-trimmed tunic covering the torso down to the hips' };
for (const [k, p] of Object.entries(K)) for (const v of ['magenta', 'blue', 'none']) for (const s of [7, 11]) add(`K ${k} ${v} s${s}`, p, 'A', `c25/K/${k}/${v}_s${s}`, true);
const Z: Record<string, string> = { jester: 'a green and purple jester hat with three bells', stripes: 'a green and purple striped tunic covering the torso down to the hips', hood: 'a green and violet mage hood' };
for (const [k, p] of Object.entries(Z)) { for (const s of [7, 11]) add(`Z ${k} azure s${s}`, p, 'A', `c25b/Z/${k}/azure_dress_s${s}`, true); if (k !== 'hood') add(`Z ${k} magenta s7`, p, 'A', `c25b/Z/${k}/magenta_dress_s7`, true); }
const SI: Record<string, string> = { plume: 'a steel helmet with a green and purple plume', tabard: 'a green and purple tabard over steel plate armor' };
for (const [k, p] of Object.entries(SI)) for (const s of [7, 11]) add(`S ${k} s${s}`, p, 'A', `c25c/S/${k}/dress_s${s}`, true);
const G: Record<string, string> = { helmet: S4.helmet, cape: S4.cape, chest: S4.chest, bow: 'a wooden longbow with a leather grip' };
for (const [k, p] of Object.entries(G)) for (const v of ['old', 'new']) add(`G ${k} ${v}`, p, 'A', `c25d/G/${k}/${v}_dress`);
add('T earrings', 'small gold hoop earrings', 'A', 'c25e/T/earrings/dress');
add('T glasses', 'round wire-rimmed glasses', 'A', 'c25e/T/glasses/dress');
const C: Record<string, [string, boolean]> = { greathelm: [D.greathelm[0], false], cloak: [D.cloak[0], false], tunic: [D.tunic[0], true], jester: [K.jester, true] };
for (const [k, [p, t]] of Object.entries(C)) { add(`C ${k} ctrl`, p, 'B', `c25/C/${k}/ctrl_dress`, t); if (k === 'jester') add(`C ${k} blue`, p, 'B', `c25/C/${k}/blue_dress`, t); }
const N: Record<string, [string, string, boolean]> = {
  helm128: ['body128', D.greathelm[0], false], cloak128: ['body128', D.cloak[0], false], sword128: ['body128', 'a steel longsword with a brass crossguard', false],
  helmChibi: ['chibi', D.greathelm[0], false], jesterChibi: ['chibi', Z.jester, true],
};
for (const [k, [b, p, t]] of Object.entries(N)) add(`N ${k}`, p, b, `c25b/N/${k}/dress`, t);
const U: Record<string, [string, boolean]> = {
  tunic: [D.tunic[0], true], vest: ['a sleeveless brown leather vest, open at the neck, arms bare', false],
  cloak: ['a long red cloak open at the front, hanging from the shoulders down to the calves', false],
};
for (const b of ['c26man', 'c26woman', 'c27man', 'c27woman']) for (const [k, [p, t]] of Object.entries(U)) add(`U ${b} ${k}`, p, b, `c25e/U/${b}_${k}/dress`, t);

// ---------- per item ----------
const GEN = ['green', 'magenta', 'blue', 'azure', 'none'] as const;
const KD = Object.fromEntries(KEYDEFS.map((k) => [k.id, k]));
const genDef = { green: KD.green120, magenta: KD.magenta300, blue: KD.blue240, azure: KD.azure210 } as const;
const res: any[] = [];
// S tabard s7 covers most of the body, so the fit is low (0.26 none vs 0.18 azure); arm S generated it on azure (pickKey: green + purple).
const FORCE: Record<string, string> = { 'S tabard s7': 'azure' };
export const SAMPLES: Record<string, RGB[]> = {};
for (const s of S) {
  const b = bodies[s.body], outs = await Promise.all(s.files.map(load)), bases = await Promise.all(b.drawn.map(async (d, i) => pad(await b.rest(d), outs[i].w, outs[i].h)));
  // infer the generation key: the mannequin input that most base px still match
  const fit = GEN.map((g) => {
    let n = 0, m = 0;
    outs.forEach((o, i) => { const B = bases[i], In = g === 'none' ? B : chroma.toChroma(B, g);
      for (let p = 0; p < B.w * B.h; p++) if (B.data[p * 4 + 3]) { n++; if (o.data[p * 4 + 3] >= 128 && cheb(o.data, p * 4, In.data, p * 4) <= 24) m++; } });
    return { g, f: m / n };
  }).sort((a, b) => b.f - a.f);
  const gen = (FORCE[s.id] ?? fit[0].g) as (typeof GEN)[number];
  const items: RGB[] = [], amb: RGB[] = [], ambOff: RGB[] = [];
  outs.forEach((o, i) => {
    const B = bases[i], In = gen === 'none' ? B : chroma.toChroma(B, gen);
    for (let p = 0; p < B.w * B.h; p++) {
      const q = p * 4;
      if (o.data[q + 3] < 128) continue;
      const onBody = B.data[q + 3] > 0;
      if (onBody && cheb(o.data, q, In.data, q) <= 32) continue;
      const c: RGB = [o.data[q], o.data[q + 1], o.data[q + 2]];
      if (gen !== 'none' && genDef[gen].score(c) >= KT) { amb.push(c); if (chroma.rampDistance(gen, ...c) > 24) ambOff.push(c); }
      else items.push(c);
    }
  });
  SAMPLES[s.id] = items; SAMPLES[s.id + ' ambOff'] = ambOff;
  const per: Record<string, { lost: number; near: number }> = {};
  for (const k of KEYDEFS) { let lost = 0, near = 0; for (const c of items) { const r = classify(k, c); if (r === 'lost') lost++; else if (r === 'near') near++; } per[k.id] = { lost, near }; }
  const hist = new Array(24).fill(0); let sat = 0;
  for (const c of items) if (Math.max(...c) - Math.min(...c) >= 24) { sat++; hist[Math.floor(hueOf(...c) / 15) % 24]++; }
  res.push({ id: s.id, prompt: s.prompt, body: s.body, test: s.test, gen, fit: +fit[0].f.toFixed(3), fit2: `${fit[1].g} ${fit[1].f.toFixed(3)}`, n: items.length, amb: amb.length, ambOff: ambOff.length, per, hist, sat,
    ambHist: (() => { const h = new Array(24).fill(0); for (const c of ambOff) if (Math.max(...c) - Math.min(...c) >= 24) h[Math.floor(hueOf(...c) / 15) % 24]++; return h; })() });
  console.log(s.id.padEnd(28), gen.padEnd(8), fit[0].f.toFixed(2), 'n', items.length, 'amb', amb.length, 'ambOff', ambOff.length, KEYDEFS.map((k) => `${k.id}:${per[k.id].lost}/${per[k.id].near}`).join(' '));
}
fs.writeFileSync(new URL('samples.json', import.meta.url), JSON.stringify(SAMPLES));
fs.writeFileSync(new URL('census.json', import.meta.url), JSON.stringify(res, null, 1));
