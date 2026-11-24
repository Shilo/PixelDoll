// Template study (2026-11-24): every skeleton-v3 template on the managed mannequin benchmark through the Studio's
// Skeleton V3 pipeline: template motion (managed character) -> leading-echo drop -> normalize -> estimate-skeleton per
// frame -> motionJoints -> raw animate-with-skeleton-v3 re-render on the frozen standing art. Render seed = seed + 101.
// Usage (from spikes/api): C25_RUN=templates-2026-11-24 node --experimental-transform-types --env-file=<.env>
//   mocap-salvage/templates.mts <seed> <dirs comma list> <ids comma list | @screen | @walks> [--motion-only] [--dry]
// Paid calls use c25/lib.mts: ledger, caps, never resent. A template the mannequin lacks is a free 422 and is recorded.
import './env.mts';
import fs from 'node:fs';
import path from 'node:path';
import { paid, paidJson, save, spent, pool, OUT } from '../c25/lib.mts';
import { rawClip, poseCallGens } from '../../../app/src/lib/rig/clips.ts';
import { motionJoints, checkedKeypoints, bodyAction, moveMotionRequest, trimStandingSeam } from '../../../app/src/studio/create.ts';
import { skeletonInput, unpadSkeleton } from '../../../app/src/lib/rig/estimate.ts';
import { normalize } from '../../../app/src/lib/rig/normalize.ts';
import { routes, png } from '../../../app/src/lib/pixellab/routes.ts';
import { encodePngBytes, decodePngBytes } from '../../../app/src/lib/image/pngraw.ts';
import type { Keypoint, DirectionName } from '../../../app/src/lib/rig/rig.ts';

// The mannequin's 49 templates as listed by PixelLab on 2026-11-24 (attack*, angry and dying are rejected for it).
export const SCREEN = [
	'breathing-idle', 'fight-stance-idle-8-frames', 'crouching',
	'cross-punch', 'lead-jab', 'surprise-uppercut',
	'high-kick', 'flying-kick', 'hurricane-kick', 'roundhouse-kick', 'leg-sweep', 'fireball', 'throw-object',
	'taking-punch', 'falling-back-death', 'getting-up',
	'running-4-frames', 'running-6-frames', 'running-8-frames', 'running-jump', 'running-slide',
	'jumping-1', 'jumping-2', 'two-footed-jump', 'backflip', 'front-flip',
	'drinking', 'picking-up', 'pull-heavy-object', 'pushing', 'crouched-walking', 'sad-walk', 'scary-walk'
];
export const WALKS = [
	'walk', 'walk-1', 'walk-2', 'walking', 'walking-2', 'walking-3', 'walking-4', 'walking-5', 'walking-6', 'walking-7',
	'walking-8', 'walking-9', 'walking-10', 'walking-4-frames', 'walking-6-frames', 'walking-8-frames'
];
const CHARACTER = 'f69d3f89-043e-4e04-b904-dd97871c5d06';
const LOOKS = 'a bald human man with plain bare skin, barefoot and empty hands';
const MAX_RENDER = 15; // the Studio's Skeleton V3 frame counts are 3-15 (moveFrameCounts)
const [seedArg, dirsArg, idsArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SEED = Number(seedArg);
const DIRS = dirsArg.split(',') as DirectionName[];
const IDS = idsArg === '@screen' ? SCREEN : idsArg === '@walks' ? WALKS : idsArg.split(',');
const MOTION_ONLY = process.argv.includes('--motion-only'), DRY = process.argv.includes('--dry');
const CAP = 1000;
const fx = JSON.parse(fs.readFileSync(path.join(OUT, '../mocap-salvage-2026-11-23/benchmark84.json'), 'utf8'));
const strip = (k: Keypoint[]) => k.map(({ label, x, y }) => ({ label, x, y }));
const b64 = async (im: { w: number; h: number; data: Uint8ClampedArray }) => Buffer.from(await encodePngBytes(im)).toString('base64');
const opaque = (im: { data: Uint8ClampedArray }, i: number) => im.data[i * 4 + 3] > 127;
const results: Record<string, unknown> = {};
const resultFile = path.join(OUT, `results-s${SEED}.json`);
if (fs.existsSync(resultFile)) Object.assign(results, JSON.parse(fs.readFileSync(resultFile, 'utf8')));

async function one(id: string, dir: DirectionName) {
	const key = `${id}/${dir}`, stem = path.join(OUT, id, `${dir}_s${SEED}`);
	// `described-walk`: the Studio's managed described walk (text only, 8 frames), the route a Walk pill took before templates.
	const described = id === 'described-walk';
	const req = described
		? moveMotionRequest({ manifest: { name: 'bench64', rig: { cell: fx.cell, view: 'low top-down', directions: fx.directions, rest: {} } }, character: { id: CHARACTER, looks: LOOKS } } as never, { id: 'walk', text: 'walking, continuous even strides, no stopping or settling into a standing pose', frames: 8, motionSource: 'managed', seed: SEED, poseStyle: 'visible-side-v1', items: [], animation: { model: 'skeleton-v3', loop: true } } as never, dir as never)
		: routes.animateCharacter({ character_id: CHARACTER, mode: 'skeleton-v3', template_animation_id: id, animation_name: id, directions: [dir as never], seed: SEED });
	if (DRY) return console.log('DRY', key, req.path, JSON.stringify(req.body));
	const raw = await paid({ arm: 'templates', label: `T ${id} ${dir} s${SEED}`, file: `${stem}.motion`, req, estimate: 4, armCap: CAP });
	if (!raw) return (results[key] = { status: 'no-result (invalid template, cap or error; see ledger)' });
	// A leading frame equal to the registered standing art (placed at 10, 10 on the 84 px canvas) is the managed echo.
	const ref = await decodePngBytes(new Uint8Array(Buffer.from(fx.references[dir].png, 'base64')));
	const first = raw[0];
	let mismatch = 0;
	if (first.w === ref.w && first.h === ref.h) for (let p = 0; p < ref.w * ref.h; p++) mismatch += +(opaque(first, p) !== opaque(ref, p));
	else mismatch = Infinity;
	const echo = mismatch <= 8;
	const normalized = (echo ? raw.slice(1) : raw).map((im) => normalize(im, fx.cell.w, fx.cell.h, 128, fx.cell.w, 0));
	// A looping described motion drops seam frames that repeat the standing pose, as the Studio now does.
	const kept = described ? trimStandingSeam(normalized.map((f) => f.img), ref, true) : normalized.map((f) => f.img);
	const frames = normalized.filter((f) => kept.includes(f.img));
	const cut = frames.reduce((s, f) => s + f.cutPx, 0);
	const info: Record<string, unknown> = { trimmed: normalized.length - frames.length, returned: raw.length, canvas: `${raw[0].w}x${raw[0].h}`, echo, frames: frames.length, cutPx: cut };
	results[key] = info;
	for (const [i, f] of frames.entries()) await save(`${stem}.norm.${i}.png`, f.img);
	if (MOTION_ONLY) return;
	if (cut) return (info.status = 'motion leaves the 84 px frame');
	const measured: (Keypoint[] | undefined)[] = [];
	for (const [i, f] of frames.entries()) {
		const input = skeletonInput(f.img);
		const res = await paidJson({ arm: 'templates', label: `T ${id} joints ${dir} s${SEED} f${i}`, file: `${stem}.joints.${i}`, req: routes.estimateSkeleton(png(await b64(input.image))), estimate: 0.1, armCap: CAP });
		const pts = res && checkedKeypoints(res.keypoints);
		measured.push(pts ? checkedKeypoints(unpadSkeleton(pts, input, f.img)) : undefined);
	}
	const kps = motionJoints(measured);
	info.missingJoints = measured.filter((m) => !m).length;
	if (!kps) return (info.status = 'joint checks failed on more than one interior frame');
	// The Studio samples a move to its frame count (3-15); longer templates are sampled evenly, keeping the last pose.
	const n = Math.min(kps.length, MAX_RENDER);
	const poses = n === kps.length ? kps : Array.from({ length: n }, (_, i) => kps[Math.round((i * (kps.length - 1)) / (n - 1))]);
	info.rendered = n;
	const r = fx.references[dir];
	const action = bodyAction({ id: described ? 'walk' : id, poseStyle: 'visible-side-v1' });
	const out = await paid({ arm: 'templates', label: `T ${id} render ${dir} s${SEED}`, file: path.join(OUT, id, `T_${dir}_s${SEED}`), req: rawClip({ first: r.png, rest: strip(r.keypoints), keypoints: poses.map(strip), description: LOOKS, action, dir: dir as never, seed: SEED + 101 }), estimate: poseCallGens(n), armCap: CAP });
	info.status = out ? 'rendered' : 'render failed (see ledger)';
}

console.log('spent so far', spent('templates'));
await pool(IDS.flatMap((id) => DIRS.map((d) => () => one(id, d).catch((e) => { console.log('ERR', id, d, String(e.message).slice(0, 300)); results[`${id}/${d}`] = { status: `error: ${String(e.message).slice(0, 200)}` }; }))), 6);
if (!DRY) fs.writeFileSync(resultFile, JSON.stringify(results, null, 1));
console.log('spent total', spent('templates'));
