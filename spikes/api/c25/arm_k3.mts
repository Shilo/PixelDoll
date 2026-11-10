// Keys 3 stage 1 (R0 robustness): does flat green (fg) still match production's green ramp (prod) on a second body B seed, a
// 128 px body, a deep-skin body and a held sword? Plan: keys3 PLAN-v2.md (scratchpad), section 5. Both arms of every pair are
// sent in the same invocation, interleaved, on the same API base; the base, HEAD and the chroma.ts hash are logged per session.
// Production edit-animation-v2 dress builders; prompts identical (KEY_NAME.green is already "bright green"). fg mannequin and
// detector: k3_flat.mts. Every call stores the exact inputs it sent (<file>.input.<i>.png) so eval_k3 never rebuilds them.
// Usage (from spikes/api): C25_RUN=keys3-2026-11-10 C25_CAP=280 node c25/arm_k3.mts dry|stage1 [cell filter]
import './y_env.mts'; // must stay first: local API base and agent key for this process (see the file)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { items, chroma, paid, pool, b64, save, load, spent, OUT, TOTAL_CAP, type Img } from './lib.mts';
import { API_BASE } from './y_env.mts';
import { rigA, restA } from './s4rig.mts';
import { rigB, restB, studioBody } from './bodyB.mts';
import { flatMannequin, darkSkin } from './k3_flat.mts';

/** prod = the item's production key (pickKey: ramp green, magenta, blue or azure); the rest are flat keys (k3_flat). */
export type Arm = 'prod' | 'fg' | 'fm' | 'fb' | 'fa';
export const HUE: Record<Arm, number> = { prod: 120, fg: 120, fm: 300, fb: 240, fa: 210 }; // prod's hue is per item: keyHue()
export const NAME: Record<Exclude<Arm, 'prod'>, string> = { fg: 'bright green', fm: 'bright magenta', fb: 'bright blue', fa: 'bright azure blue' };
const KEY_HUE: Record<string, number> = { green: 120, magenta: 300, blue: 240, azure: 210 };
/** The key hue an arm's output is measured against (prod: its production key). */
export const keyHue = (c: { arm: Arm; item: string }) => (c.arm === 'prod' ? KEY_HUE[chroma.pickKey(ITEMS[c.item].prompt)] : HUE[c.arm]);
export const ITEMS: Record<string, { slot: string; prompt: string }> = {
  // stage 2 (PLAN-v2 section 5): R1 green items, R2 green plus red or pink, R3 green plus purple; P5 controls reuse helm, cloak
  tunic: { slot: 'torso_outer', prompt: 'an emerald green cloth tunic covering the torso down to the hips' },
  forest: { slot: 'back', prompt: 'a forest green hooded cloak with a steel clasp, hanging from the shoulders behind the back, hood down' },
  vest: { slot: 'torso_outer', prompt: 'a green leather vest with brass buckles covering the torso' },
  tabard: { slot: 'torso_outer', prompt: 'a teal and navy tabard covering the torso down to the hips' },
  jesterR2: { slot: 'head', prompt: 'a green and pink jester hat on the head, face visible' },
  holly: { slot: 'torso_outer', prompt: 'a red and green holly tunic covering the torso down to the hips' },
  tabardR2: { slot: 'torso_outer', prompt: 'a red and green tabard over steel plate armor covering the torso' },
  jesterR3: { slot: 'head', prompt: 'a green and purple jester hat on the head, face visible' },
  striped: { slot: 'torso_outer', prompt: 'a green and purple striped tunic covering the torso down to the hips' },
  plume: { slot: 'head', prompt: 'a steel helmet with a green and purple plume, face visible' },
  helm: { slot: 'head', prompt: 'a steel great helm covering the whole head, cold grey steel with bright metallic highlights' },
  plate: { slot: 'torso_outer', prompt: 'a polished silver plate armor chestpiece covering the torso' },
  hair: { slot: 'hair', prompt: 'long blonde hair in two braids hanging over the shoulders, face visible, no hat' },
  cloak: { slot: 'back', prompt: 'a long red hooded cloak hanging from the shoulders behind the back, hood down' },
  sword: { slot: 'main_hand', prompt: 'a steel longsword with a brass crossguard' }, // arm N wording; also a future bench case
};
const b128 = studioBody('body128');
export const VIEWS = ['south', 'east', 'north'];
/** Bodies: A (48 px in 64), B (80 px elf), Bdark (B with deep skin, darkSkin), body128 (160 px frame). */
export const BODY: Record<string, { rig: any; rest: (d: string) => Promise<Img>; est: number }> = {
  A: { rig: rigA(), rest: restA, est: 10 },
  B: { rig: rigB(), rest: restB, est: 10 },
  Bdark: { rig: rigB(), rest: async (d) => darkSkin(await restB(d)), est: 10 },
  body128: { rig: b128.rig, rest: b128.rest, est: 15 }, // arm N receipts: 15 per 160 px dress
};
export type Cell = { body: string; item: string; seed: number; arm: Arm };
const pairs = (body: string, its: string[], seed: number): Cell[] => its.flatMap((item) => (['fg', 'prod'] as Arm[]).map((arm) => ({ body, item, seed, arm })));
/** Stage 1, 22 calls: B s11 and body128 s7 x {helm, plate, braids, cloak}; deep-skin B s7 x {helm, braids}; A s7 sword. */
export const STAGE1: Cell[] = [...pairs('B', ['helm', 'plate', 'hair', 'cloak'], 11), ...pairs('body128', ['helm', 'plate', 'hair', 'cloak'], 7), ...pairs('Bdark', ['helm', 'hair'], 7), ...pairs('A', ['sword'], 7)];
export const fileOf = (c: Cell) => `${OUT}/K3/${c.body}/${c.item}/${c.arm}_dress_s${c.seed}`;
export const labelOf = (c: Cell) => `K3 ${c.body} ${c.item} ${c.arm} dress s${c.seed}`;
const arms = (body: string, its: string[], seed: number, as: Arm[]): Cell[] => its.flatMap((item) => as.map((arm) => ({ body, item, seed, arm })));
/** Stage 2 (dry-run only until stage 1 passes), A s7, 32 calls: P2 R1 x {prod magenta, fm} + fg on the three green-only items;
 * P3 R2 x {prod blue, fb, fa}; P4 R3 x {prod azure, fa}; P5 helm and cloak x {fm, fa} + their paired fg. */
export const STAGE2: Cell[] = [
  ...arms('A', ['tunic', 'forest', 'vest', 'tabard'], 7, ['fm', 'prod']), ...arms('A', ['tunic', 'forest', 'vest'], 7, ['fg']),
  ...arms('A', ['jesterR2', 'holly', 'tabardR2'], 7, ['fb', 'fa', 'prod']),
  ...arms('A', ['jesterR3', 'striped', 'plume'], 7, ['fa', 'prod']),
  ...arms('A', ['helm', 'cloak'], 7, ['fm', 'fa', 'fg']),
];
/** Expected production key per stage 2 item (the dry run asserts pickKey still routes them so). */
export const ROLE_KEY: Record<string, string> = { tunic: 'magenta', forest: 'magenta', vest: 'magenta', tabard: 'magenta', jesterR2: 'blue', holly: 'blue', tabardR2: 'blue', jesterR3: 'azure', striped: 'azure', plume: 'azure', helm: 'green', cloak: 'green' };
/** Stage 3 poses (dry-run only), 3 gens each, keyframes = the stage 1 dress outputs (S/E/N only: SE/NE were never dressed).
 * R0 walks: body B s11 hair and cloak, body128 s7 hair and cloak, A s7 sword, x {fg, prod}; slash S/E/N on A s7 for fg helm,
 * hair, cloak (keyframes from arm S, a replicate run) and sword. Fallback seed 11, walks and body B cells are added per role only
 * if stage 2 leaves that role in the tie band. */
export type Pose = Cell & { anim: 'walk' | 'slash'; dir: string; kf: string };
const SRUN = `${OUT}/../chroma-strategies-2026-11-10/S`;
const poses = (c: Cell[], anim: Pose['anim'], kf: (c: Cell) => string): Pose[] => c.flatMap((x) => VIEWS.map((dir) => ({ ...x, anim, dir, kf: kf(x) })));
export const STAGE3: Pose[] = [
  ...poses([...arms('B', ['hair', 'cloak'], 11, ['fg', 'prod']), ...arms('body128', ['hair', 'cloak'], 7, ['fg', 'prod']), ...arms('A', ['sword'], 7, ['fg', 'prod'])], 'walk', (c) => fileOf(c)),
  ...poses(arms('A', ['helm', 'hair', 'cloak'], 7, ['fg']), 'slash', (c) => `${SRUN}/A/${c.item}/fg_dress_s7`),
  ...poses(arms('A', ['sword'], 7, ['fg']), 'slash', (c) => fileOf(c)),
];
export const STAGE_CAP = { stage1: 280, stage2: 620, stage3: 1100 } as const; // stage 2 raised to 620 for the paired controls

/** The exact model inputs of a cell (padded and hand-marked for held items, as production run.ts builds them). */
export async function inputsOf(c: Cell) {
  const B = BODY[c.body], { slot, prompt } = ITEMS[c.item], pad = items.padOf(slot, 'skel', B.rig.cell);
  const ims: Img[] = [];
  for (const d of VIEWS) {
    const base = await B.rest(d), m = c.arm === 'prod' ? chroma.toChroma(base, chroma.pickKey(prompt)) : flatMannequin(base, HUE[c.arm]);
    const im = items.padImg(m, pad);
    ims.push(pad ? items.markHand(im, B.rig.rest[d].keypoints, slot, B.rig.cell, pad) : im);
  }
  const key = chroma.pickKey(prompt), cells = VIEWS.map((d) => `rest/${d}/0`), item = items.dressItem({ prompt, slot, method: 'skel' });
  // flat arms: the green template with the flat key's name (arm S); green's production name is already "bright green", so fg's
  // prompt equals prod's on green-routed items
  const desc = c.arm === 'prod' ? items.itemPrompt(item, key, cells) : items.itemPrompt(item, 'green', cells).replaceAll(chroma.KEY_NAME.green, NAME[c.arm]);
  return { ims, pad, key, desc, cell: { w: B.rig.cell.w + 2 * pad, h: B.rig.cell.h + 2 * pad } };
}
/** A stage 3 pose request: production pose builder on the stored dressed keyframe of that view, the flat name for flat arms. */
export async function poseRequest(p: Pose, kf: Img) {
  const B = BODY[p.body], { slot, prompt } = ITEMS[p.item], pad = items.padOf(slot, 'skel', B.rig.cell), key = chroma.pickKey(prompt);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf), rest: B.rig.rest[p.dir].keypoints, poses: items.clipKeypoints(B.rig, p.anim, p.dir as any)!, item: prompt, slot, key: p.arm === 'prod' ? key : 'green', anim: p.anim, dir: p.dir as any, seed: 7, cell: B.rig.cell, pad, view: B.rig.view });
  if (p.arm !== 'prod') req.body.description = req.body.description.replaceAll(chroma.KEY_NAME.green, NAME[p.arm]);
  return req;
}
export const poseFile = (p: Pose) => `${OUT}/K3/${p.body}/${p.item}/${p.arm}_${p.anim}_${p.dir}_s${p.seed}`;
async function request(c: Cell) {
  const x = await inputsOf(c);
  return { x, req: items.itemRoute.edit(await Promise.all(x.ims.map(b64)), x.desc, c.seed, x.cell) as any };
}
/** The request with every image replaced by its hash and size (the description and settings stay readable). */
const shortB64 = (v: any): any => Array.isArray(v) ? v.map(shortB64) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, y]) => [k, k === 'base64' && typeof y === 'string' ? `<png ${crypto.createHash('sha256').update(y).digest('hex').slice(0, 8)}, ${y.length} chars>` : shortB64(y)])) : v;
function session(stage: string) {
  const head = execSync('git rev-parse --short HEAD', { cwd: import.meta.dirname }).toString().trim();
  const chromaTs = fs.readFileSync(new URL('../../../app/src/lib/image/chroma.ts', import.meta.url));
  const s = { t: new Date().toISOString(), stage, base: API_BASE.startsWith('http://localhost') ? 'local' : 'public', head, chromaSha: crypto.createHash('sha256').update(chromaTs).digest('hex').slice(0, 12), spent: spent(), cap: TOTAL_CAP };
  fs.mkdirSync(`${OUT}/K3`, { recursive: true });
  const log = `${OUT}/K3/sessions.jsonl`, prev = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const other = prev.find((p: any) => !p.stage.startsWith('dry') && !stage.startsWith('dry') && p.base !== s.base);
  if (other) throw new Error(`API base changed (${other.base} earlier, ${s.base} now): pairs must share one base; ask the owner`);
  fs.appendFileSync(log, JSON.stringify(s) + '\n');
  return s;
}
const ARM_CAP = 1060; // the campaign's cumulative cap (PLAN-v2 section 5); C25_CAP holds the stage's cumulative cap

if (import.meta.main) {
  const [mode = 'dry', filter] = process.argv.slice(2), cells = STAGE1.filter((c) => !filter || labelOf(c).includes(filter));
  const s = session(mode);
  console.log(`session ${JSON.stringify(s)}`);
  if (mode === 'dry') {
    let est = 0;
    for (const c of cells) {
      const { x, req } = await request(c), e = BODY[c.body].est;
      est += e;
      console.log(`\n${labelOf(c)} | est ${e} gens | canvas ${x.cell.w}x${x.cell.h} pad ${x.pad} | key ${x.key} | ${fs.existsSync(`${fileOf(c)}.json`) ? 'STORED' : fs.existsSync(`${fileOf(c)}.sent`) ? 'SENT, NO RESULT' : 'new'}`);
      console.log(`  ${req.path} ${JSON.stringify(shortB64(req.body))}`);
      for (const [i, im] of x.ims.entries()) await save(`${OUT}/K3/dry/${c.body}_${c.item}_${c.arm}_${VIEWS[i]}.png`, im);
    }
    console.log(`\n${cells.length} calls, estimate ${est} gens; ledger spent ${spent()}; C25_CAP ${TOTAL_CAP} (stage 1 cumulative cap ${STAGE_CAP.stage1}); dress concurrency 6`);
    if (TOTAL_CAP > STAGE_CAP.stage1) console.log(`WARNING: C25_CAP ${TOTAL_CAP} is above the stage 1 cap ${STAGE_CAP.stage1}`);
  } else if (mode === 'stage1') {
    if (!TOTAL_CAP || TOTAL_CAP > STAGE_CAP.stage1) throw new Error(`set C25_CAP to at most ${STAGE_CAP.stage1} for stage 1`);
    // pairs are adjacent in STAGE1, so the pool sends fg and prod of a cell back to back
    await pool(cells.map((c) => async () => {
      const { x, req } = await request(c);
      for (const [i, im] of x.ims.entries()) await save(`${fileOf(c)}.input.${i}.png`, im);
      return paid({ arm: 'K3', label: labelOf(c), file: fileOf(c), req, estimate: BODY[c.body].est, armCap: ARM_CAP });
    }), 6);
    console.log(`stage 1 done: ledger spent ${spent()} of ${TOTAL_CAP}`);
  } else if (mode === 'dry2') {
    // dry run only: stage 2 has no paid mode until stage 1 passes and the owner approves it
    let est = 0;
    for (const c of STAGE2.filter((x) => !filter || labelOf(x).includes(filter))) {
      const { x, req } = await request(c), e = BODY[c.body].est;
      est += e;
      if (x.key !== ROLE_KEY[c.item]) console.log(`WARNING ${c.item}: pickKey routes it to ${x.key}, the plan expects ${ROLE_KEY[c.item]}`);
      console.log(`\n${labelOf(c)} | est ${e} | key ${x.key} | ${c.arm === 'prod' ? 'ramp' : `flat ${HUE[c.arm]}`}\n  ${req.path} ${JSON.stringify(shortB64(req.body))}`);
      for (const [i, im] of x.ims.entries()) await save(`${OUT}/K3/dry/${c.body}_${c.item}_${c.arm}_${VIEWS[i]}.png`, im);
    }
    console.log(`\nstage 2: ${STAGE2.length} calls, estimate ${est} gens; cumulative cap ${STAGE_CAP.stage2}; ledger spent ${spent()}`);
  } else if (mode === 'dry3') {
    let n = 0, missing = 0;
    for (const p of STAGE3.filter((x) => !filter || labelOf(x).includes(filter))) {
      const kfs = fs.existsSync(`${p.kf}.json`) ? JSON.parse(fs.readFileSync(`${p.kf}.json`, 'utf8')).frames : 0;
      const label = `K3 ${p.body} ${p.item} ${p.arm} ${p.anim}/${p.dir} s${p.seed} | est 3`;
      if (kfs !== VIEWS.length) { missing++; console.log(`${label} | NO KEYFRAME (${p.kf})`); continue; }
      const req = await poseRequest(p, await load(`${p.kf}.${VIEWS.indexOf(p.dir)}.png`));
      n++;
      console.log(`${label}\n  ${req.path} ${JSON.stringify(shortB64({ ...req.body, keypoints: `<${req.body.keypoints?.length} poses>` }))}`);
    }
    console.log(`\nstage 3 (listed part): ${STAGE3.length} pose calls, ${STAGE3.length * 3} gens, ${missing} waiting for keyframes; pose pool at most 6`);
  } else throw new Error(`unknown mode ${mode}`);
}
