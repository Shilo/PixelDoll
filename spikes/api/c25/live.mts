// Paid benchmark canary: re-runs a fixed set of PixelLab calls with production request builders and checks that PixelLab still
// behaves as measured (price, frame count, refusals, hard failures within the stored range for the same seeds). It does not
// score improvements; use a campaign for that. Default is a dry run (requests, estimate, balance). Spending requires
// `--confirm <exact estimate>`, which an agent may pass only after the user said yes in chat to that estimate.
// Usage (from spikes/api): node --env-file=../../.env c25/live.mts [--confirm 28]
import fs from 'node:fs';
import path from 'node:path';
const DATE = new Date().toISOString().slice(0, 10), ESTIMATE = 28;
process.env.C25_RUN ??= `bench-live-${DATE}`;
process.env.C25_CAP ??= String(ESTIMATE);
const { api, paid, b64, OUT, items, chroma, readOnly } = await import('./lib.mts');
const { poseTask } = await import('./arm_p.mts');
const { evaluate } = await import('./evaluate.mts');
const { rigA, baseA, restA, keyframeA, S4_ITEMS, padOf } = await import('./s4rig.mts');
const { rigB, restB, DRAWN } = await import('./bodyB.mts');
const { K_ITEMS } = await import('./arm_dk.mts');

const confirm = process.argv.indexOf('--confirm') > 0 ? +process.argv[process.argv.indexOf('--confirm') + 1] : null;
const POSES: [string, string, string][] = [['helmet', 'slash', 'east'], ['cape', 'slash', 'north'], ['sword', 'slash', 'east']];
const SEEDS = [7, 11];
const plan = [...POSES.flatMap(([i, a, d]) => SEEDS.map((s) => `pose ${i} ${a}/${d} s${s} (3 gens)`)), 'dress jester blue on body B, 5 views (10 gens)'];
console.log(`canary: ${plan.length} calls, estimate ${ESTIMATE} gens, folder out/${process.env.C25_RUN}`);
for (const p of plan) console.log('  ' + p);
if (api) { const b = await api.balance(); console.log(`balance ${b.subscription?.generations} gens`); }
if (confirm !== ESTIMATE) {
  console.log(confirm == null ? 'dry run: nothing sent. Ask the user, then re-run with --confirm ' + ESTIMATE : `refused: --confirm ${confirm} does not match the estimate ${ESTIMATE}`);
  readOnly();
  process.exit(0);
}

// stored range for the same requests (round 1, 2026-10-25): hard fails per item at seeds 7 and 11
const R1 = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../out/c25/P/eval.json'), 'utf8'));
const rows: string[] = [];
for (const [item, anim, dir] of POSES) for (const seed of SEEDS) {
  const out = await poseTask(item, 'ctrl', seed, anim, dir), slot = S4_ITEMS[item].slot;
  if (!out) { rows.push(`| pose ${item} ${anim}/${dir} s${seed} | refused or failed | | |`); continue; }
  const r = evaluate({ name: item, slot, key: 'green', pad: padOf(slot), rig: rigA(), rest: { [dir]: await restA(dir) }, dress: { [dir]: await keyframeA(item, dir) }, clips: [{ anim, dir, frames: await Promise.all(out.map(async (o, i) => ({ base: await baseA(dir, anim, i), out: o }))) }] });
  const stored = R1.find((x: any) => x.item === item && x.seed === seed)?.ctrl.fails.filter((f: string) => f.includes(`${anim}/${dir}`)).length;
  rows.push(`| pose ${item} ${anim}/${dir} s${seed} | ${out.length} frames | ${r.fails.length} hard fails (stored ${stored ?? '?'}) | ${Math.abs(r.fails.length - (stored ?? 0)) <= 2 ? 'in range' : 'outside range, investigate'} |`);
}
{ // the blue key on the Studio body: every view must pass G2 and G3
  const prompt = K_ITEMS.jester.prompt, rest = await Promise.all(DRAWN.map(restB));
  const swap = (im: any) => { const d = new Uint8ClampedArray(im.data); for (let i = 0; i < d.length; i += 4) { d[i + 1] = im.data[i + 2]; d[i + 2] = im.data[i + 1]; } return { ...im, data: d }; };
  const req = items.itemRoute.edit(await Promise.all(rest.map((r) => b64(chroma.toChroma(r, 'blue')))), items.itemPrompt(prompt, 'blue', DRAWN.map((d) => `rest/${d}/0`)), 7, rigB().cell);
  const out = await paid({ arm: 'live', label: 'live jester blue dress', file: `${OUT}/jester_blue_dress`, req: req as any, estimate: 10, armCap: ESTIMATE });
  const bad = out ? out.map((o, i) => items.extractCell({ key: `rest/${DRAWN[i]}/0`, call: 0, base: rest[i], out: o, route: 'blue', band: { x: 0, y: 0, w: o.w, h: o.h } })).filter((c) => items.g2Fails(c) || (c.keyOutside ?? 0) > items.GATES.keyOutside).length : null;
  rows.push(`| dress jester blue (body B) | ${out ? `${out.length} frames` : 'refused or failed'} | ${bad ?? '?'} views failing G2/G3 (stored 0) | ${bad === 0 ? 'in range' : 'outside range, investigate'} |`);
}
const spent = fs.readFileSync(`${OUT}/ledger.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).reduce((s, r) => s + (r.gens ?? 0), 0);
const doc = path.resolve(import.meta.dirname, '../../../docs/testing/bench-live.md');
if (!fs.existsSync(doc)) fs.writeFileSync(doc, '# Live benchmark canary\n\nOne section per paid run of `spikes/api/c25/live.mts` (outputs in the git-ignored `spikes/api/out/bench-live-<date>`). It checks\nthat PixelLab still behaves as measured on 2026-10-25; it does not score improvements.\n');
fs.appendFileSync(doc, `\n## ${DATE}\n\nSpent ${spent} gens (estimate ${ESTIMATE}).\n\n| Call | Result | Check | Verdict |\n|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(rows.join('\n'));
