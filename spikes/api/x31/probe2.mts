// 0 gens: content extent per direction (body over every target frame, plus the dressed reference of every item).
import * as L from './lib.mts';
console.log(L.SRC, 'cell', L.rig.cell, 'moves', L.MOVES.join(','), 'items', L.ITEMS.join(','));
for (const d of L.DIRS) {
	const tg = await L.targets(d), refs = await Promise.all(L.ITEMS.map((i) => L.dressed(i, d)));
	const b = [...tg.map((t) => t.im), ...refs].map(L.bbox);
	const x0 = Math.min(...b.map((r) => r.x0)), x1 = Math.max(...b.map((r) => r.x1)), y0 = Math.min(...b.map((r) => r.y0)), y1 = Math.max(...b.map((r) => r.y1));
	console.log(d, 'targets', tg.length, 'content', x1 - x0 + 1, 'x', y1 - y0 + 1, JSON.stringify({ x0, y0, x1, y1 }));
}
for (const id of L.ITEMS) await L.save(`${L.OUT}/s2-ref-${id}.png`, L.pack(await Promise.all(L.DIRS.map((d) => L.dressed(id, d))), L.rig.cell.w, L.rig.cell.h, 3));
