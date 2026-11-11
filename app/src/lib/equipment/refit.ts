// A free, approximate fit of another character's held item (Main hand / Off hand) onto a different body of the same size:
// every frame's layers move by the offset between the two bodies' wrists, never resampled. It is offered only when both
// characters share the item's moves and every frame passes the grip checks below; head items never fit this way (head
// sizes differ by 2 to 5 px on the same canvas). Offline study, 2026-11-10: authored moves passed 23 of 27 frames, walks
// 24 to 30 of 36, and one imported character had its hand labels swapped. Never generates anything.
import { layerFrame } from '../compose/compose.ts';
import type { Img } from '../image/png.ts';
import { clipKeypoints, kpAt, poseDist, translate } from '../items/items.ts';
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
import type { Layer, Manifest, Preset } from '../store/manifest.ts';
import {
	bodyOf,
	cellId,
	covered,
	sameGeometry,
	sameSlot,
	type CellMatch
} from './compatibility.ts';
import { copyShell, flipper, type CopyCandidate } from './copy.ts';

/** Limits per frame, from the offline study. */
export const REFIT = {
	/** Elbow-to-wrist angle difference between the source and target frame (degrees). */
	maxForearmDeg: 15,
	/** Share of the item's pixels over the source body that stay over the target body once moved. */
	minKeptOnBody: 0.7,
	/** Item area against its standing frame in that direction (a frame where the body hid part of it). */
	minArea: 0.8,
	/** Mean joint distance (px) under which a frame counts as the standing pose. */
	nearStandingPx: 1
};
const HELD_ANCHOR: Record<string, 'LEFT' | 'RIGHT'> = { main_hand: 'RIGHT', off_hand: 'LEFT' };

const mirrorOf = (rig: Rig, dir: DirectionName) =>
	rig.directions.find((d) => d.id === dir)?.mirrorOf;
const flipped = (k: Keypoint[] | undefined) => k?.map((p) => ({ ...p, x: 1 - p.x }));
/** Keypoints of a direction's standing view (a mirrored view flips its drawn source view's). */
const standingKeypoints = (rig: Rig, dir: DirectionName): Keypoint[] | undefined => {
	const src = mirrorOf(rig, dir);
	return src ? flipped(standingKeypoints(rig, src)) : rig.rest?.[dir]?.keypoints;
};
/** The one-frame move showing a direction's standing view, if the character has one (Default first). */
function standingMove(m: Manifest, dir: DirectionName): string | undefined {
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
/** Requested keypoints of one cell; a standing move uses its standing view's. */
function keypointsAt(
	m: Manifest,
	anim: string,
	dir: DirectionName,
	i: number
): Keypoint[] | undefined {
	const src = mirrorOf(m.rig, dir);
	if (src) return flipped(keypointsAt(m, anim, src, i));
	return (
		clipKeypoints(m.rig, anim, dir)?.[i] ??
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
const pixels = (im: Img | null) => {
	let n = 0;
	for (let i = 3; im && i < im.data.length; i += 4) if (im.data[i]) n++;
	return n;
};

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
	const side = HELD_ANCHOR[original.slot];
	// Hidden body px and hidden slots belong to the source's body.
	if (!side || original.baseCut || original.hides?.length) return null;
	if (!sameGeometry(source, target) || !sameSlot(source, target, original.slot)) return null;
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

	const cell = target.rig.cell,
		frames = original.layers.map((l) => layerFrame(source.rig, l)),
		bodyFrame = layerFrame(target.rig, tb),
		{ pivot } = target.rig;
	const layerCells = original.layers.map(() => ({}) as NonNullable<Layer['cells']>),
		images = new Map<Sha256, Img>();
	for (const match of plan) {
		const [ta, td, ti] = match.target.split('/') as [string, DirectionName, string],
			[sa, , si] = match.source.split('/') as [string, DirectionName, string];
		const sk = keypointsAt(source, sa, td, +si),
			tk = keypointsAt(target, ta, td, +ti);
		if (!sk || !tk) return null;
		const sw = kpAt(sk, [`${side} ARM`], cell, 0),
			tw = kpAt(tk, [`${side} ARM`], cell, 0),
			sf = forearm(sk, side, cell),
			tf = forearm(tk, side, cell);
		if (!sw || !tw || sf == null || tf == null || angleBetween(sf, tf) > REFIT.maxForearmDeg)
			return null;
		const dx = Math.round(tw[0] - sw[0]),
			dy = Math.round(tw[1] - sw[1]);
		const layers = await Promise.all(original.layers.map((l) => image(source, l, sa, td, +si)));
		const [sBody, tBody] = await Promise.all([
			image(source, sb, sa, td, +si),
			image(target, tb, ta, td, +ti)
		]);
		// Front pixels over the source body stay over the target body (the grip and anything held across the torso).
		let over = 0,
			kept = 0;
		for (const [j, im] of layers.entries()) {
			if (!im || original.layers[j].role !== 'fg') continue;
			const ox = frames[j].x - pivot.x - (bodyFrame.x - pivot.x),
				oy = frames[j].y - pivot.y - (bodyFrame.y - pivot.y);
			for (let y = 0; y < im.h; y++)
				for (let x = 0; x < im.w; x++) {
					if (!opaque(im, x, y) || !opaque(sBody, x - ox, y - oy)) continue;
					over++;
					if (opaque(tBody, x - ox + dx, y - oy + dy)) kept++;
				}
		}
		if (over && kept / over < REFIT.minKeptOnBody) return null;
		const ref = await referenceArea(td);
		if (ref && (await area(sa, td, +si)) / ref < REFIT.minArea) return null;
		const n = target.rig.animations.find((a) => a.id === ta)!.cells;
		for (const [j, im] of layers.entries()) {
			const moved = im && translate(im, dx, dy);
			// A pixel moved off the layer's canvas would be lost.
			if (moved && pixels(moved) !== pixels(im)) return null;
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
	item.layers.forEach((layer, j) => {
		layer.cells = layerCells[j];
		delete layer.sheets;
	});
	// The standing references show the source's body.
	delete item.dressed;
	delete item.route;
	return { item, materials, assessment: { matches: plan, canExtend: false, fits: true }, images };
}
