// A free, approximate fit of another character's held item (Main hand / Off hand) onto a different body on the same canvas
// size: every frame's layers move by the offset between the two bodies' wrists, never resampled. Each rig maps its keypoints
// to the layer canvas through its own pivot, so the pivots may differ. It is offered only when both characters share the
// item's views (drawn or mirrored alike) and moves, and at most a quarter of the frames fail a grip check below; head items
// never fit this way (head sizes differ by 2 to 5 px on the same canvas). The offline check over stored characters
// (2026-11-10) is recorded in docs/known-issues.md under Shared items. Never generates anything.
import { layerFrame, type Frame } from '../compose/compose.ts';
import type { Img } from '../image/png.ts';
import { kpAt, observedKeypoints, poseDist, translate } from '../items/items.ts';
import { actionOf } from '../rig/clips.ts';
import {
	cellHash,
	cellKey,
	DEFAULT_MOVE,
	matchesStanding,
	type DirectionName,
	type Keypoint,
	type Rig,
	type Sha256
} from '../rig/rig.ts';
import type { Item, Layer, Manifest, Preset, RefitNote } from '../store/manifest.ts';
import { stableStringify } from '../image/hash.ts';
import { bodyOf, cellId, covered, sameSlot, type CellMatch } from './compatibility.ts';
import { copyShell, flipper, type CopyCandidate } from './copy.ts';

/** Limits from the offline study. */
export const REFIT = {
	/** Elbow-to-wrist angle difference between the source and target frame (degrees). */
	maxForearmDeg: 15,
	/** Share of the item's pixels over the source body that stay over or beside the target body once moved. */
	minKeptOnBody: 0.7,
	/** How far (px, either axis) a moved front pixel may sit from the target body and still count as on it: slimmer bodies
	 *  put a correct grip 1 to 2 px off their outline (live 2026-11-10). */
	keptReachPx: 2,
	/** Item area against its standing frame in that direction (a frame where the body hid part of it). */
	minArea: 0.8,
	/** Mean joint distance (px) under which a frame counts as the standing pose. */
	nearStandingPx: 1,
	/** Share of the target's frames that may fail the checks above and still be offered, marked for a look. */
	maxFailing: 0.25
};
const HELD_ANCHOR: Record<string, 'LEFT' | 'RIGHT'> = { main_hand: 'RIGHT', off_hand: 'LEFT' };
/** A pure side view: one arm hides the other there, so its grip side is unreliable (live 2026-11-10: a sword visibly in the
 *  right hand facing east was judged left in every east move). Front, back and diagonal views show both hands. */
const sideView = (clip: string) => /\/(east|west)$/.test(clip);
/** The source's own checks found the item in the other hand or changing hands (G8) in a view that shows both hands: a moved
 *  copy would keep that. Item-wide verdicts mix every view, so they decide only when no move recorded its own hand. */
const wrongHand = (item: Item) => {
	const want = HELD_ANCHOR[item.slot] === 'RIGHT' ? 'r' : 'l',
		q = item.qa;
	if (!q) return !!item.designWarnings?.some((w) => w.includes('expects hand_'));
	const clips = Object.entries(q.clips),
		decided = (c: { hand?: string }) => c.hand === 'r' || c.hand === 'l';
	if (
		clips.some(
			([clip, c]) =>
				!sideView(clip) && ((decided(c) && c.hand !== want) || c.handedness === 'switched')
		) ||
		(q.inherited?.summary?.handedness === 'switched' &&
			q.inherited.clips.some((clip) => !sideView(clip)))
	)
		return true;
	if (clips.some(([, c]) => decided(c))) return false;
	return (
		!!item.designWarnings?.some((w) => w.includes('expects hand_')) || q.handedness === 'switched'
	);
};
/** The item may re-fit onto other bodies: a held item in its own hand that hides nothing of its own body and was drawn for
 *  it (a re-fit is never re-fitted again: its approximations would add up). */
export const refittable = (item: Item) =>
	!!HELD_ANCHOR[item.slot] &&
	!item.baseCut &&
	!item.hides?.length &&
	!item.refit &&
	!item.unfitted &&
	!wrongHand(item);

const mirrorOf = (rig: Rig, dir: DirectionName) =>
	rig.directions.find((d) => d.id === dir)?.mirrorOf;
const flipped = (k: Keypoint[] | undefined) => k?.map((p) => ({ ...p, x: 1 - p.x }));
/** Keypoints of a direction's standing view (a mirrored view flips its drawn source view's). */
const standingKeypoints = (rig: Rig, dir: DirectionName): Keypoint[] | undefined => {
	const src = mirrorOf(rig, dir);
	return src ? flipped(standingKeypoints(rig, src)) : rig.rest?.[dir]?.keypoints;
};
/** The one-frame move showing a direction's standing view, if the character has one (Default first). */
export function standingMove(m: Manifest, dir: DirectionName): string | undefined {
	const drawn = mirrorOf(m.rig, dir) ?? dir,
		body = bodyOf(m)?.layers[0];
	return m.rig.animations
		.filter((a) => a.cells === 1)
		.sort((a, b) => +(b.id === DEFAULT_MOVE) - +(a.id === DEFAULT_MOVE))
		.find(
			(a) =>
				a.id === DEFAULT_MOVE ||
				matchesStanding(m.rig, a, drawn, body?.cells?.[a.id]?.[drawn]?.[0] ?? null)
		)?.id;
}
/** Joints of one cell as drawn (measured, else requested); a standing move uses its standing view's. */
function keypointsAt(
	m: Manifest,
	anim: string,
	dir: DirectionName,
	i: number
): Keypoint[] | undefined {
	const src = mirrorOf(m.rig, dir);
	if (src) return flipped(keypointsAt(m, anim, src, i));
	return (
		observedKeypoints(m.rig, anim, dir, i) ??
		(standingMove(m, dir) === anim ? m.rig.rest?.[dir]?.keypoints : undefined)
	);
}
/** The character's right hand on the viewer's left when facing south. A swapped pair moves the item to the other hand. */
const rightHanded = (m: Manifest) => {
	const k = standingKeypoints(m.rig, 'south'),
		r = kpAt(k, ['RIGHT ARM'], m.rig.cell, 0),
		l = kpAt(k, ['LEFT ARM'], m.rig.cell, 0);
	return !!r && !!l && r[0] < l[0];
};
const forearm = (k: Keypoint[], side: string, cell: Rig['cell']) => {
	const e = kpAt(k, [`${side} ELBOW`], cell, 0),
		w = kpAt(k, [`${side} ARM`], cell, 0);
	return e && w ? (Math.atan2(w[1] - e[1], w[0] - e[0]) * 180) / Math.PI : undefined;
};
const angleBetween = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const opaque = (im: Img | null, x: number, y: number) =>
	!!im && x >= 0 && y >= 0 && x < im.w && y < im.h && im.data[(y * im.w + x) * 4 + 3] >= 128;
/** Some opaque pixel lies within `r` px of (x, y) on both axes. */
const near = (im: Img | null, x: number, y: number, r: number) => {
	for (let b = -r; b <= r; b++)
		for (let a = -r; a <= r; a++) if (opaque(im, x + a, y + b)) return true;
	return false;
};
const pixels = (im: Img | null) => {
	let n = 0;
	for (let i = 3; im && i < im.data.length; i += 4) if (im.data[i]) n++;
	return n;
};
/** No visible pixel of `im` leaves its canvas when moved by (dx, dy). */
const staysOn = (im: Img, dx: number, dy: number) => {
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			if (im.data[(y * im.w + x) * 4 + 3]) {
				const X = x + dx,
					Y = y + dy;
				if (X < 0 || Y < 0 || X >= im.w || Y >= im.h) return false;
			}
	return true;
};
/** Every view of the target exists on the source and is drawn, or mirrored from the same view, there too. A mirrored view
 *  flips its drawn view's art (the hands swap), so a view drawn on one character and mirrored on the other would put the
 *  item in the other hand; a view the source never drew has nothing to move. */
const sameViews = (source: Manifest, target: Manifest) =>
	target.rig.directions.every((d) => {
		const s = source.rig.directions.find((x) => x.id === d.id);
		return !!s && s.mirrorOf === d.mirrorOf;
	});
/** Same canvas size and the same camera when both record one; the pivots may differ. */
export const sameCanvas = (source: Manifest, target: Manifest) =>
	stableStringify(source.rig.cell) === stableStringify(target.rig.cell) &&
	(!source.rig.view || !target.rig.view || source.rig.view === target.rig.view) &&
	(!source.rig.template || !target.rig.template || source.rig.template === target.rig.template);
/** A copied layer on the target: an own pivot keeps its padding around the target's pivot, so its pixels keep their place in
 *  the frame and a layer centered on the source cell stays centered (mirrored views flip the whole layer cell). */
export const onTarget = (source: Manifest, target: Manifest, layer: Layer): Layer =>
	layer.pivot
		? {
				...layer,
				pivot: {
					x: layer.pivot.x - source.rig.pivot.x + target.rig.pivot.x,
					y: layer.pivot.y - source.rig.pivot.y + target.rig.pivot.y
				}
			}
		: layer;
/** A body-cell point (px) on a layer's canvas: both place the same body point at their pivot. */
const onLayer = (p: [number, number], body: Frame, layer: Frame): [number, number] => [
	p[0] - body.x + layer.x,
	p[1] - body.y + layer.y
];

interface Fitted {
	plan: CellMatch[];
	/** Per planned cell: the item's layer images there on the source and how far each moves (layer canvas px). */
	moves: { layers: (Img | null)[]; shifts: [number, number][] }[];
	notes: RefitNote[];
}

/** Where every target cell takes its art from and how far it moves, or null when the item cannot fit this body without being
 *  made for it. Loads images only through `load`. */
async function fit(
	source: Manifest,
	original: Item,
	target: Manifest,
	load: (hash: Sha256) => Promise<Img>
): Promise<Fitted | null> {
	const side = HELD_ANCHOR[original.slot];
	// Hidden body px and hidden slots belong to the source's body.
	if (!side || !refittable(original)) return null;
	if (
		!sameCanvas(source, target) ||
		!sameViews(source, target) ||
		!sameSlot(source, target, original.slot)
	)
		return null;
	if (!rightHanded(source) || !rightHanded(target)) return null;
	const sb = bodyOf(source)?.layers[0],
		tb = bodyOf(target)?.layers[0];
	if (!sb || !tb) throw new Error('A character is missing its frozen body.');
	const loaded = new Map<Sha256, Promise<Img>>(),
		cached = (h: Sha256) => {
			let im = loaded.get(h);
			if (!im) loaded.set(h, (im = load(h)));
			return im;
		};
	const { flip, made } = flipper(cached);
	const image = async (m: Manifest, layer: Layer, anim: string, dir: DirectionName, i: number) => {
		const h = await cellId(m, layer, anim, dir, i, flip);
		return h ? (made.get(h) ?? (await cached(h))) : null;
	};

	// Which source frame each target cell takes.
	const plan: CellMatch[] = [];
	const draws = (dir: DirectionName) =>
		source.rig.animations.some((a) =>
			Array.from({ length: a.cells }, (_, i) => i).some((i) =>
				covered(source, original, a.id, dir, i)
			)
		);
	for (const ta of target.rig.animations)
		for (const { id: dir } of target.rig.directions.filter((d) => !d.mirrorOf)) {
			const bodies = tb.cells?.[ta.id]?.[dir] ?? [],
				cells = Array.from({ length: ta.cells }, (_, i) => i).filter((i) => bodies[i]);
			// No body here, or the item has no view facing this way on its source either: a gap, as on an exact copy.
			if (!cells.length || !draws(dir)) continue;
			const sa =
				source.rig.animations.find((a) => a.id === ta.id && a.cells === ta.cells) ??
				source.rig.animations.find(
					(a) => a.cells === ta.cells && actionOf(a.id) === actionOf(ta.id)
				);
			if (sa) {
				// The item lacks this move here, as on its source: a gap, as on an exact copy.
				if (!cells.every((i) => covered(source, original, sa.id, dir, i))) continue;
				for (const i of cells)
					plan.push({ target: cellKey(ta.id, dir, i), source: cellKey(sa.id, dir, i) });
				continue;
			}
			// A move the source does not have fits only where it stands still.
			const standing = standingMove(source, dir),
				rest = standingKeypoints(target.rig, dir);
			for (const i of cells) {
				const k = keypointsAt(target, ta.id, dir, i);
				if (
					!standing ||
					!covered(source, original, standing, dir, 0) ||
					!k ||
					!rest ||
					poseDist(k, rest, target.rig.cell) > REFIT.nearStandingPx
				)
					return null;
				plan.push({ target: cellKey(ta.id, dir, i), source: cellKey(standing, dir, 0) });
			}
		}
	if (!plan.length) return null;

	// Item area of one source cell (its layers split it by depth, so they do not overlap), and its standing frame's in each
	// direction (a character without a standing move skips this check: a swing's frames legitimately differ in size).
	const area = async (anim: string, dir: DirectionName, i: number) =>
		(await Promise.all(original.layers.map((l) => image(source, l, anim, dir, i)))).reduce(
			(n, im) => n + pixels(im),
			0
		);
	const standingArea = new Map<DirectionName, Promise<number>>();
	const referenceArea = (dir: DirectionName) => {
		let ref = standingArea.get(dir);
		if (!ref) {
			const standing = standingMove(source, dir);
			ref =
				standing && covered(source, original, standing, dir, 0)
					? area(standing, dir, 0)
					: Promise.resolve(0);
			standingArea.set(dir, ref);
		}
		return ref;
	};

	// Each rig places its body and the item's layers around its own pivot.
	const cell = target.rig.cell,
		sBody = layerFrame(source.rig, sb),
		tBody = layerFrame(target.rig, tb),
		sFrames = original.layers.map((l) => layerFrame(source.rig, l)),
		tFrames = original.layers.map((l) => layerFrame(target.rig, onTarget(source, target, l)));
	const moves: Fitted['moves'] = [],
		failing = new Map<string, Set<RefitNote['checks'][number]>>();
	for (const match of plan) {
		const [ta, td, ti] = match.target.split('/') as [string, DirectionName, string],
			[sa, , si] = match.source.split('/') as [string, DirectionName, string];
		const sk = keypointsAt(source, sa, td, +si),
			tk = keypointsAt(target, ta, td, +ti);
		const sw = sk && kpAt(sk, [`${side} ARM`], cell, 0),
			tw = tk && kpAt(tk, [`${side} ARM`], cell, 0),
			sf = sk && forearm(sk, side, cell),
			tf = tk && forearm(tk, side, cell);
		// Without both wrists and forearms the item has nowhere to go.
		if (!sw || !tw || sf == null || tf == null) return null;
		const shifts = sFrames.map((sFrame, j): [number, number] => {
			const from = onLayer(sw, sBody, sFrame),
				to = onLayer(tw, tBody, tFrames[j]);
			return [Math.round(to[0] - from[0]), Math.round(to[1] - from[1])];
		});
		const layers = await Promise.all(original.layers.map((l) => image(source, l, sa, td, +si)));
		// A pixel moved off its layer's canvas would be lost.
		if (layers.some((im, j) => im && !staysOn(im, ...shifts[j]))) return null;
		moves.push({ layers, shifts });
		const checks = new Set<RefitNote['checks'][number]>();
		if (angleBetween(sf, tf) > REFIT.maxForearmDeg) checks.add('angle');
		const [sBodyIm, tBodyIm] = await Promise.all([
			image(source, sb, sa, td, +si),
			image(target, tb, ta, td, +ti)
		]);
		// Front pixels over the source body stay over or beside the target body (the grip and anything held across the torso).
		let over = 0,
			kept = 0;
		for (const [j, im] of layers.entries()) {
			if (!im || original.layers[j].role !== 'fg') continue;
			const [dx, dy] = shifts[j];
			for (let y = 0; y < im.h; y++)
				for (let x = 0; x < im.w; x++) {
					if (!opaque(im, x, y)) continue;
					if (!opaque(sBodyIm, x - sFrames[j].x + sBody.x, y - sFrames[j].y + sBody.y)) continue;
					over++;
					if (
						near(
							tBodyIm,
							x + dx - tFrames[j].x + tBody.x,
							y + dy - tFrames[j].y + tBody.y,
							REFIT.keptReachPx
						)
					)
						kept++;
				}
		}
		if (over && kept / over < REFIT.minKeptOnBody) checks.add('body');
		const ref = await referenceArea(td);
		if (ref && (await area(sa, td, +si)) / ref < REFIT.minArea) checks.add('hidden');
		if (checks.size) failing.set(match.target, checks);
	}
	if (failing.size > plan.length * REFIT.maxFailing) return null;
	// One note per move and direction, frames in order.
	const notes = new Map<string, RefitNote>();
	for (const [key, checks] of failing) {
		const [anim, dir, i] = key.split('/') as [string, DirectionName, string],
			note = notes.get(`${anim}/${dir}`) ?? { anim, dir, frames: [], checks: [] };
		note.frames.push(+i);
		note.checks = [...new Set([...note.checks, ...checks])];
		notes.set(`${anim}/${dir}`, note);
	}
	return { plan, moves, notes: [...notes.values(), ...designNotes(original, plan)] };
}

/** The source's own design findings (D1: gray smudges or a dark patch in one view's keyframe) move with the item into every
 *  frame of that view: one note each, on the first frame that view takes here. They are not fit failures, so they never count
 *  toward the limit. */
function designNotes(original: Item, plan: CellMatch[]): RefitNote[] {
	const out: RefitNote[] = [];
	for (const w of original.designWarnings ?? []) {
		const found = /^D1 keyframe [^/]+\/([a-z-]+)\/\d+: (.*)$/.exec(w);
		const first = found && plan.find((m) => m.target.split('/')[1] === found[1]);
		if (!found || !first) continue;
		const [anim, dir, i] = first.target.split('/') as [string, DirectionName, string],
			check = found[2].includes('dark patch') ? 'dark' : 'smudge';
		if (!out.some((n) => n.dir === dir && n.checks[0] === check))
			out.push({ anim, dir, frames: [+i], checks: [check] });
	}
	return out;
}

/** The target cells a free re-fit would cover, or null when there is none (the same checks as refitShared, without making the
 *  moved images). */
export async function refitCells(
	source: Manifest,
	item: Item,
	target: Manifest,
	load: (hash: Sha256) => Promise<Img>
): Promise<string[] | null> {
	return (await fit(source, item, target, load))?.plan.map((m) => m.target) ?? null;
}

/** The re-fitted copy, or null when the item cannot fit this body without being made for it. */
export async function refitShared(
	source: Manifest,
	itemId: string,
	variants: Preset['variants'],
	target: Manifest,
	load: (hash: Sha256) => Promise<Img>
): Promise<CopyCandidate | null> {
	const original = source.items.find((it) => it.id === itemId);
	if (!original || original.slot === 'body' || original.variantOf)
		throw new Error('That item is no longer available.');
	const fitted = await fit(source, original, target, load);
	if (!fitted) return null;
	const { plan, moves, notes } = fitted;
	const layerCells = original.layers.map(() => ({}) as NonNullable<Layer['cells']>),
		images = new Map<Sha256, Img>();
	for (const [p, match] of plan.entries()) {
		const [ta, td, ti] = match.target.split('/') as [string, DirectionName, string],
			n = target.rig.animations.find((a) => a.id === ta)!.cells;
		for (const [j, im] of moves[p].layers.entries()) {
			const moved = im && translate(im, ...moves[p].shifts[j]);
			const h = moved && pixels(moved) ? await cellHash(moved) : null;
			if (h) images.set(h, moved!);
			((layerCells[j][ta] ??= {})[td] ??= Array(n).fill(null))[+ti] = h;
		}
	}
	const { item, materials } = copyShell(
		source,
		original,
		variants,
		target,
		plan.map((m) => m.target)
	);
	item.layers = item.layers.map((layer, j) => {
		const placed = onTarget(source, target, layer);
		placed.cells = layerCells[j];
		delete placed.sheets;
		return placed;
	});
	item.refit = notes;
	// The standing references show the source's body.
	delete item.dressed;
	delete item.route;
	return { item, materials, assessment: { matches: plan, canExtend: false, fits: true }, images };
}
