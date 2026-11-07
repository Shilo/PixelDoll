// Review of the uncommitted move classification (isAction with decisiveAction, whole-word actionOf). Offline, no PixelLab.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/move-classification.ts [names|rigs|perturb|perf]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { decisiveAction, isAction } from '../../../../../app/src/lib/items/items.ts';
import { actionOf, moveWords } from '../../../../../app/src/lib/rig/clips.ts';
import { fromApi, hasAll } from '../../../../../app/src/lib/rig/poses.ts';
import { ACTIONS } from '../../../../../app/src/lib/rig/poses.ts';
import { BASE_ANIMS } from '../../../../../app/src/lib/pixellab/routes.ts';
import type { DirectionName, Keypoint, Rig } from '../../../../../app/src/lib/rig/rig.ts';

const ROOT = new URL('../../../../../', import.meta.url);
const oldIsAction = (key: string) => !/idle|walk|run/.test(key.split('/')[0]);
const oldActionOf = (anim: string) => (anim.includes('idle') ? 'breathing idle' : anim.includes('walk') ? 'walking' : anim.includes('run') ? 'running' : anim);
const want = process.argv[2];
const on = (s: string) => !want || want === s;

// ---------- 1. names ----------
// mannequin templates (docs/spikes/S2_clean_layers.md live 422 list), BASE_ANIMS, ACTIONS, starter presets, motion-lab clips,
// import-test ids, fixture ids, MoveSheet slugs of plausible descriptions, and look-alike / case / digit forms.
const TEMPLATES = ['backflip', 'breathing-idle', 'cross-punch', 'crouched-walking', 'crouching', 'drinking', 'falling-back-death', 'fight-stance-idle-8-frames', 'fireball', 'flying-kick', 'front-flip', 'getting-up', 'high-kick', 'hurricane-kick', 'jumping-1', 'jumping-2', 'lead-jab', 'leg-sweep', 'picking-up', 'pull-heavy-object', 'pushing', 'roundhouse-kick', 'running-4-frames', 'running-6-frames', 'running-8-frames', 'running-jump', 'running-slide', 'sad-walk', 'scary-walk', 'surprise-uppercut', 'taking-punch', 'throw-object', 'two-footed-jump', 'walk', 'walk-1', 'walk-2', 'walking', ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `walking-${n}`), 'walking-4-frames', 'walking-6-frames', 'walking-8-frames'];
const APP = [...BASE_ANIMS.map((a) => a.name), ...Object.keys(ACTIONS), 'slash', 'default', 'default-copy', 'walking-copy', 'armored-state-walking', 'test-adventurer-walking', 'right_punch', 'walking-south-east', 'walking-47c00e8a', 'walking-6fb9c602', 'rest', 'attack', 'hurt', 'death', 'run'];
const SLUGS = ['walk-slowly', 'quick-run', 'run-and', 'sneak-forward', 'sprint-forward', 'jog-in', 'march-in', 'strafe-left', 'sitting-idle', 'sit-down', 'crouch-idle', 'combat-idle', 'idle-look', 'run-slash', 'walk-cast', 'spin-attack', 'walks-forward', 'runs-away', 'idling', 'limp', 'dash', 'hop', 'skip', 'crawl', 'climb', 'swim', 'fly', 'hover', 'float', 'patrol', 'wander', 'stagger', 'moonwalk', 'sleepwalk', 'sidle-left', 'outrun', 'rune-blast', 'runic-cast', 'trunk-swing', 'grunt', 'brunch', 'sidewalk', 'walkie-talkie', 'bridle'];
const FORMS = ['Idle', 'Walk', 'Run', 'IdleLook', 'Walk_Cycle', 'RunFast', 'idle2', 'walk2', 'run1', 'walk01', 'walking8', 'idle_2', 'walk-2', 'Running_A', 'Walking_Backwards', 'Sneaking', 'Jump_Full_Long', 'Crouch_Idle', 'Sword_Idle'];
if (on('names')) {
  console.log('# names: id | old isAction -> new (name only) | old action word -> new');
  const seen = new Set<string>();
  for (const [group, ids] of [['template', TEMPLATES], ['app', APP], ['slug', SLUGS], ['form', FORMS]] as const) for (const id of ids) {
    if (seen.has(id)) continue; seen.add(id);
    const oa = oldIsAction(`${id}/south`), na = isAction(`${id}/south`), ow = oldActionOf(id), nw = actionOf(id);
    if (oa !== na || ow !== nw) console.log(`${group.padEnd(8)} ${id.padEnd(28)} action ${oa} -> ${na}${ow !== nw ? `   word "${ow}" -> "${nw}"` : ''}   words ${JSON.stringify(moveWords(id))}`);
  }
  console.log(`(${seen.size} ids checked; only flips printed)`);
}

// ---------- 2. every stored rig on disk ----------
const rigFiles = [
  ...['A', 'B', 'C', 'N'].map((b) => `app/test/fixtures/bench/body${b}.json`), 'app/test/fixtures/helmet-occlusion.json',
  ...(() => { const d = 'docs/testing/img/audit-worktree-39533f7/testing-img/professional-audit/'; return existsSync(new URL(d, ROOT)) ? readdirSync(new URL(d, ROOT)).map((x) => `${d}${x}/export/manifest.json`).filter((f) => existsSync(new URL(f, ROOT))) : []; })(),
];
const rigOf = (f: string): Rig => { const j = JSON.parse(readFileSync(new URL(f, ROOT), 'utf8')); return j.rig ?? j.manifest?.rig; };
type P = Record<string, { x: number; y: number }>;
const mid = (p: P, a: string, b: string) => [(p[a].x + p[b].x) / 2, (p[a].y + p[b].y) / 2];
/** Same measures as decisiveAction, returned as the clip maxima (moved, rise, lean) and the source used. */
function metrics(rig: Rig, anim: string, dir: DirectionName, seqOverride?: Keypoint[][]) {
  const a = rig.animations.find((x) => x.id === anim), measured = a?.sources?.[dir]?.measured as Keypoint[][] | undefined;
  const useM = !seqOverride && !!measured?.length && measured.every(hasAll);
  const k = a?.sources?.[dir]?.keypoints;
  const seq = seqOverride ?? (useM ? measured : k && k.length === a!.cells && k.every(hasAll) ? k : undefined);
  const r = rig.rest?.[dir]?.keypoints;
  if (!seq || !r || !hasAll(r)) return undefined;
  const rest = fromApi(r, rig.cell) as P, frames = seq.map((f) => fromApi(f, rig.cell) as P);
  const feet = mid(rest, 'RIGHT LEG', 'LEFT LEG'), H = Math.hypot(feet[0] - rest.NOSE.x, feet[1] - rest.NOSE.y);
  const leanOf = (p: P) => { const h = mid(p, 'RIGHT HIP', 'LEFT HIP'); return Math.abs(Math.atan2(p.NECK.x - h[0], h[1] - p.NECK.y)) * 180 / Math.PI; };
  let moved = 0, rise = -Infinity, lean = 0;
  for (const p of frames) {
    moved = Math.max(moved, ...Object.keys(rest).map((l) => Math.hypot(p[l].x - rest[l].x, p[l].y - rest[l].y) / H));
    rise = Math.max(rise, ...['RIGHT ARM', 'LEFT ARM'].map((l) => (rest[l].y - p[l].y) / H));
    lean = Math.max(lean, leanOf(p));
  }
  return { src: seqOverride ? 'synthetic' : useM ? 'measured' : 'requested', moved: +moved.toFixed(2), rise: +rise.toFixed(2), lean: Math.round(lean), restLean: Math.round(leanOf(rest)), H: +H.toFixed(1), frames, rest };
}
if (on('rigs')) {
  console.log('\n# rigs: file | clip/dir | source | moved rise lean (rest lean) | decisive | old -> new isAction');
  for (const f of rigFiles) {
    const rig = rigOf(f), short = f.split('/').slice(-3, -1).join('/') || f;
    for (const a of rig.animations) for (const d of Object.keys(rig.rest ?? {}) as DirectionName[]) {
      const m = metrics(rig, a.id, d), dec = decisiveAction(rig, a.id, d), o = oldIsAction(`${a.id}/${d}`), n = isAction(`${a.id}/${d}`, rig);
      if (!m && !a.sources?.[d]) continue;
      console.log(`${short.padEnd(34)} ${`${a.id}/${d}`.padEnd(26)} ${(m?.src ?? 'none').padEnd(9)} ${m ? `${m.moved.toFixed(2)} ${m.rise.toFixed(2)} ${String(m.lean).padStart(3)} (${m.restLean})` : '-'.padEnd(17)} ${String(dec).padEnd(5)} ${o} -> ${n}${o !== n ? '   FLIP' : ''}`);
    }
  }
}

// ---------- 3. perturbations of real locomotion clips: how much error flips a walk or idle to an action ----------
if (on('perturb')) {
  console.log('\n# perturb: smallest error that makes decisiveAction true, per real walk/idle clip (bench + audit exports)');
  const toApi = (p: P, cell: Rig['cell']): Keypoint[] => Object.entries(p).map(([label, v]) => ({ label, x: v.x / cell.w, y: v.y / cell.h }) as Keypoint);
  // decisiveAction on a synthetic sequence: install it as requested keypoints of a scratch clip (no measured), so production code runs.
  const decide = (rig: Rig, dir: DirectionName, frames: P[]) => {
    const id = '__probe', seq = frames.map((p) => toApi(p, rig.cell));
    const clamp = seq.map((f) => f.map((k) => ({ ...k, x: Math.min(1, Math.max(0, k.x)), y: Math.min(1, Math.max(0, k.y)) })));
    const r: Rig = { ...rig, animations: [...rig.animations.filter((a) => a.id !== id), { id, cells: seq.length, loop: true, frames: [], sources: { [dir]: { keypoints: clamp } } } as never] };
    return decisiveAction(r, id, dir);
  };
  const clone = (p: P): P => Object.fromEntries(Object.entries(p).map(([l, v]) => [l, { ...v }]));
  const SIDES = ['SHOULDER', 'ELBOW', 'ARM', 'HIP', 'KNEE', 'LEG', 'EYE', 'EAR'];
  const swap = (p: P, parts: string[]) => { const o = clone(p); for (const s of parts) { const r = p[`RIGHT ${s}`], l = p[`LEFT ${s}`]; o[`RIGHT ${s}`] = { ...l }; o[`LEFT ${s}`] = { ...r }; } return o; };
  const search = (f: (t: number) => boolean, hi: number) => { if (!f(hi)) return Infinity; let lo = 0; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(m)) hi = m; else lo = m; } return hi; };
  const rows: string[] = [];
  const summary: Record<string, number[]> = {};
  const note = (k: string, v: number) => (summary[k] ??= []).push(v);
  for (const f of rigFiles) {
    const rig = rigOf(f), short = f.split('/').slice(-3, -1).join('/');
    for (const a of rig.animations) {
      if (!/^(idle|walk|walking)/.test(a.id)) continue;
      for (const d of Object.keys(a.sources ?? {}) as DirectionName[]) {
        const m = metrics(rig, a.id, d); if (!m) continue;
        const H = m.H, frames = m.frames;
        // root motion: the whole body translated up (jump), down (crouch drop) or sideways, on one frame
        const lift = search((t) => decide(rig, d, frames.map((p, i) => i ? p : Object.fromEntries(Object.entries(p).map(([l, v]) => [l, { x: v.x, y: v.y - t * H }])))), 1.5);
        const slide = search((t) => decide(rig, d, frames.map((p, i) => i ? p : Object.fromEntries(Object.entries(p).map(([l, v]) => [l, { x: v.x + t * H, y: v.y }])))), 1.5);
        // scale: one frame drawn larger, about the feet (imported clip at a different scale than its rotation)
        const feet = mid(m.rest, 'RIGHT LEG', 'LEFT LEG');
        const scale = search((t) => decide(rig, d, frames.map((p, i) => i ? p : Object.fromEntries(Object.entries(p).map(([l, v]) => [l, { x: feet[0] + (v.x - feet[0]) * (1 + t), y: feet[1] + (v.y - feet[1]) * (1 + t) }])))), 1.5);
        // estimator left/right swap of every paired joint on one frame (common in side and back views)
        const swapAll = decide(rig, d, frames.map((p, i) => i ? p : swap(p, SIDES)));
        // one wrist misplaced toward the head (estimator picks the wrong blob): fraction of the wrist-to-nose distance
        const toHead = search((t) => decide(rig, d, frames.map((p, i) => { if (i) return p; const o = clone(p); o['RIGHT ARM'] = { x: p['RIGHT ARM'].x + (p.NOSE.x - p['RIGHT ARM'].x) * t, y: p['RIGHT ARM'].y + (p.NOSE.y - p['RIGHT ARM'].y) * t }; return o; })), 1);
        // crouched or sneaking walk: upper body (neck, head, shoulders, arms) rotated forward about the hips on every frame
        const UPPER = ['NOSE', 'NECK', 'RIGHT SHOULDER', 'RIGHT ELBOW', 'RIGHT ARM', 'LEFT SHOULDER', 'LEFT ELBOW', 'LEFT ARM', 'RIGHT EYE', 'LEFT EYE', 'RIGHT EAR', 'LEFT EAR'];
        const sign = d.includes('west') ? -1 : 1;
        const crouch = search((deg) => decide(rig, d, frames.map((p) => { const h = mid(p, 'RIGHT HIP', 'LEFT HIP'), o = clone(p), r = sign * deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); for (const l of UPPER) { const x = p[l].x - h[0], y = p[l].y - h[1]; o[l] = { x: h[0] + x * c - y * s, y: h[1] + x * s + y * c }; } return o; })), 90);
        rows.push(`${short.padEnd(34)} ${`${a.id}/${d}`.padEnd(22)} ${m.src.padEnd(9)} base ${m.moved.toFixed(2)}/${m.rise.toFixed(2)}/${m.lean}  lift ${lift.toFixed(2)}H  slide ${slide.toFixed(2)}H  scale +${(scale * 100).toFixed(0)}%  LRswap ${swapAll}  wrist->head ${(toHead * 100).toFixed(0)}%  crouch ${crouch.toFixed(0)} deg`);
        if (d === 'east' || d === 'west') note('crouch deg (side views)', crouch);
        note('lift H', lift); note('slide H', slide); note('scale', scale); note('wrist->head', toHead); note('LRswap flips', +swapAll);
      }
    }
  }
  for (const r of rows) console.log(r);
  for (const [k, v] of Object.entries(summary)) console.log(`summary ${k}: min ${Math.min(...v).toFixed(2)} max ${Math.max(...v).toFixed(2)} n ${v.length}${k === 'LRswap flips' ? ` (flips ${v.reduce((s, x) => s + x, 0)})` : ''}`);
}

// ---------- 4. cost of isAction per cell on an 8-direction rig ----------
if (on('perf')) {
  const base = rigOf('app/test/fixtures/bench/bodyB.json');
  const dirs: DirectionName[] = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  const restKp = Object.values(base.rest ?? {})[0]!.keypoints, walk = base.animations.find((a) => a.id === 'walk')!;
  const kp = Object.values(walk.sources ?? {})[0]!.keypoints!;
  const frames15 = Array.from({ length: 15 }, (_, i) => kp[i % kp.length]);
  const anims = ['idle', 'walk', 'run', 'jog', 'sneak', 'march'].map((id) => ({ id, cells: 15, loop: true, frames: [], sources: Object.fromEntries(dirs.map((d) => [d, { keypoints: frames15, measured: frames15 }])) }));
  const rig = { ...base, rest: Object.fromEntries(dirs.map((d) => [d, { ...Object.values(base.rest ?? {})[0], keypoints: restKp }])), animations: anims } as unknown as Rig;
  const cells = anims.flatMap((a) => dirs.flatMap((d) => Array.from({ length: 15 }, (_, i) => `${a.id}/${d}/${i}`)));
  for (let i = 0; i < 2; i++) for (const c of cells) isAction(c, rig);
  const t0 = performance.now(); let n = 0;
  for (let rep = 0; rep < 5; rep++) for (const c of cells) { isAction(c, rig); n++; }
  const per = (performance.now() - t0) / n;
  console.log(`\n# perf: ${cells.length} cells (6 locomotion clips x 8 dirs x 15 frames): isAction ${(per * 1000).toFixed(1)} us per call, ${(per * cells.length).toFixed(1)} ms per dirGate pass over every cell`);
}
