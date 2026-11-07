// Review of the staged measured-key change: property check that the new fitKey (keyFor with tolerance 0 and floor KT) picks
// the same key, and throws in the same cases, as the old fitKey (first candidate on which every color scores below KT).
// Both bodies are reproduced from equipment/generate.ts (old from HEAD, new from the staged diff) around the production
// keyScore/keyFor. Random colorways (0..12 colors, uniform RGB plus near-key and ramp colors), random preferred key.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/fitkey-equivalence.ts
import { keyFor, KEYS, keyScore, KT, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';

function oldFit(colors: number[], preferred?: Key): Key {
  const candidates: Key[] = preferred ? [preferred, ...KEYS.filter((k) => k !== preferred)] : KEYS;
  const key = candidates.find((k) => colors.every((c) => keyScore(k, c >> 16, (c >> 8) & 255, c & 255) < KT));
  if (!key) throw new Error('overlap');
  return key;
}
function newFit(colors: number[], preferred?: Key): Key {
  const candidates: Key[] = preferred ? [preferred, ...KEYS.filter((k) => k !== preferred)] : KEYS;
  const fit = keyFor(colors.map((c) => [c >> 16, (c >> 8) & 255, c & 255]), candidates, 0, KT);
  if (fit.share) throw new Error('overlap');
  return fit.key;
}
// colors that sit on or near each key ramp, so every branch (first, later, none) is exercised
const ramp: number[] = [];
for (const k of KEYS) { const g = makeImg(32, 1); for (let i = 0; i < 32; i++) g.data.set([i * 8, i * 8, i * 8, 255], i * 4); const K = toChroma(g, k); for (let i = 0; i < 32; i++) ramp.push((K.data[i * 4] << 16) | (K.data[i * 4 + 1] << 8) | K.data[i * 4 + 2]); }
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const color = () => { const u = rnd(); if (u < 0.3) return ramp[(rnd() * ramp.length) | 0] ^ ((rnd() * 8) | 0); return ((rnd() * 256) << 16) | ((rnd() * 256) << 8) | (rnd() * 256); };
let n = 0, diff = 0, thrown = 0, nonFirst = 0;
for (let t = 0; t < 200_000; t++) {
  const colors = Array.from({ length: (rnd() * 13) | 0 }, color), pref = rnd() < 0.5 ? undefined : KEYS[(rnd() * 4) | 0];
  let a: string, b: string;
  try { a = oldFit(colors, pref); } catch { a = 'throw'; }
  try { b = newFit(colors, pref); } catch { b = 'throw'; }
  n++;
  if (a !== b) { diff++; if (diff <= 5) console.log('DIFF', colors.map((c) => c.toString(16)), pref, a, b); }
  if (a === 'throw') thrown++; else if (a !== (pref ?? 'green')) nonFirst++;
}
console.log(`${n} colorways: ${diff} differences (old throws ${thrown}, picks a later candidate ${nonFirst})`);
