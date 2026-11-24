// E0 live (DeepSeek's proposal): the skeleton route's raw outputs, built with the app's own itemRoute.pose request (dressed
// keyframe posed through the walk's stored keypoints by /animate-with-skeleton-v3), so eval.mts can score them as the app does
// (POSED=1, +-1 registration) and with a widened whole-body registration (WIDE=4).
// usage: node --experimental-transform-types --no-warnings skeleton.mts [items|all] [seed]
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const { items, b64, rig } = L;
const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : L.ITEMS, seed = +(process.argv[3] ?? 7);
const arm = 'skeleton-live', dir = path.join(L.OUT, arm), tasks: (() => Promise<unknown>)[] = [];
fs.mkdirSync(dir, { recursive: true });
for (const id of ids) for (const [n, d] of L.DIRS.entries()) {
	const keys = Array.from({ length: 6 }, (_, i) => `walk/${d}/${i}`);
	const req = items.itemRoute.pose({
		keyframePngB64: await b64(await L.dressed(id, d)),
		rest: rig.rest[d].keypoints,
		poses: keys.map((k) => items.cellKeypoints(rig, k)),
		item: L.item(id).prompt,
		slot: L.slotOf(id),
		key: 'green',
		anim: 'walk',
		dir: d,
		seed,
		cell: rig.cell,
		pad: 0,
		view: rig.view
	});
	const file = path.join(dir, `${id}.s${seed}.${n}`);
	const estimate = L.clips.poseGensFor(6);
	const strip = JSON.parse(JSON.stringify(req.body, (k, v) => (typeof v === 'string' && v.length > 300 ? `<${v.length} chars>` : v)));
	fs.writeFileSync(`${file}.plan.json`, JSON.stringify({ arm, item: id, seed, out: 'frames', estimate, req: { path: req.path, body: strip }, cells: keys.map((key) => ({ key, dir: d, x: 0, y: 0, win: { x: 0, y: 0, w: rig.cell.w, h: rig.cell.h } })) }, null, 1));
	tasks.push(() => L.paid({ arm, label: `${arm} ${id} ${d} s${seed}`, file, req: { path: req.path, body: req.body }, estimate, armCap: 60 }));
}
console.log(`${arm}: ${tasks.length} calls; ledger ${L.spent()}`);
await L.pool(tasks, 6);
console.log(`ledger now ${L.spent()}`);
