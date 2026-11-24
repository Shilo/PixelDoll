// The Studio's authored tables (Idle, Slash, Hurt, Death, Cast pills) rendered on the managed benchmark exactly as the body
// render builds them, through the same raw skeleton-v3 request as the template study. Render seed = seed + 101.
// Usage: C25_RUN=templates-2026-11-24 node --experimental-transform-types --env-file=<.env> mocap-salvage/authored.mts <seed> <dirs> <actions>
import './env.mts';
import fs from 'node:fs';
import path from 'node:path';
import { paid, pool, spent, OUT } from '../c25/lib.mts';
import { rawClip, poseCallGens } from '../../../app/src/lib/rig/clips.ts';
import { authoredPoses, armDepth, fromApi, toApi } from '../../../app/src/lib/rig/poses.ts';
import { bodyAction } from '../../../app/src/studio/create.ts';
import type { DirectionName } from '../../../app/src/lib/rig/rig.ts';
const [seedArg, dirsArg, actsArg] = process.argv.slice(2);
const SEED = Number(seedArg), DIRS = dirsArg.split(',') as DirectionName[], ACTS = actsArg.split(',');
const LOOKS = 'a bald human man with plain bare skin, barefoot and empty hands';
const fx = JSON.parse(fs.readFileSync(path.join(OUT, '../mocap-salvage-2026-11-23/benchmark84.json'), 'utf8'));
const strip = (k: { label: string; x: number; y: number }[]) => k.map(({ label, x, y }) => ({ label, x, y }));
await pool(ACTS.flatMap((a) => DIRS.map((d) => async () => {
	const r = fx.references[d];
	const kps = authoredPoses(a, fromApi(r.keypoints, fx.cell), d, fx.cell.w, 'visible-side-v1').map((p) => armDepth(toApi(p, fx.cell), d));
	await paid({ arm: 'templates', label: `A ${a} ${d} s${SEED}`, file: path.join(OUT, 'authored', `A_${a}_${d}_s${SEED}`), req: rawClip({ first: r.png, rest: strip(r.keypoints), keypoints: kps, description: LOOKS, action: bodyAction({ id: a, action: a, poseStyle: 'visible-side-v1' }), dir: d as never, seed: SEED + 101 }), estimate: poseCallGens(kps.length), armCap: 1000 });
})), 6);
console.log('spent total', spent('templates'));
