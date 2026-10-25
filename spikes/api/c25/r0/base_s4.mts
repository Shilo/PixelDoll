// R0 baseline: current production extraction/cleanup/QA on the stored S4 Q3e skeleton-posed items (6 items, walk + slash, S/E/N).
import { OUTR0 } from './lib.mts';
import { load, s4Rig, s4Base, s4Rest, has } from './lib.mts';
import { evaluate, sheetOf, type Case } from './evaluate.mts';
const SLOT: Record<string, string> = { helmet: 'head', cape: 'back', chest: 'torso_outer', boots: 'feet', hair: 'hair', sword: 'main_hand' };
const OUT = OUTR0;
export async function s4Case(item: string, route = 'ea2'): Promise<Case> {
  const rig = s4Rig(), dirs = ['south', 'east', 'north'], rest: any = {}, dress: any = {}, clips: Case['clips'] = [];
  for (const d of dirs) { rest[d] = await s4Rest(d); dress[d] = await load(`s4_q3e/dress_${route}_${item}_${d}.png`); }
  for (const anim of ['walk', 'slash']) for (const d of dirs) {
    if (!has(`s4_q3e/pose_${route}_${item}_${anim}_${d}_0.png`)) continue;
    const frames = [];
    for (let i = 0; i < 8; i++) frames.push({ base: await s4Base(d, anim, i), out: await load(`s4_q3e/pose_${route}_${item}_${anim}_${d}_${i}.png`) });
    clips.push({ anim, dir: d, frames });
  }
  return { name: `${route}_${item}`, slot: SLOT[item], key: 'green', pad: 0, rig, rest, dress, clips };
}
if (import.meta.main) for (const item of Object.keys(SLOT)) {
  const c = await s4Case(item), r = evaluate(c);
  console.log(r.name, "FAILS", JSON.stringify(r.fails), "WARN", JSON.stringify([...new Set(r.warnings.map((w: string) => w.replace(/[0-9]+/g, "#")))]));
  if (0) console.log(JSON.stringify({ name: r.name, status: r.status, fails: r.fails.length, warn: r.warnings.length, kf: r.keyframes, clips: r.clips.map((x) => [x.clip, x.areaCV, x.colors, x.offPalette, x.keyKeptMin, x.stray, x.empty].join(' ')) }));
  await sheetOf(OUT + `base_${item}.png`, r, c);
}
