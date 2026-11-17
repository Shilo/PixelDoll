// Experimental Preview-only mount host (docs/research/2026-11-16-mounts/live-trial-plan.md). The Studio acts as the
// host scene: it draws external fixture art behind and in front of the unchanged, canonically composed rider and
// translates the rider as a whole. Nothing here is exported, saved, or part of the paper-doll runtime.
import { sampleTimeline } from '../../lib/runtime/timeline.js';
import { makeImg, type Img } from '../../lib/image/png.ts';
import type { Frame } from '../../lib/compose/compose.ts';
import type { DirectionName, Rig } from '../../lib/store/manifest.ts';
import { directionLabel } from './movement.ts';

export type MountId = 'narrow-saddle' | 'shell';
type Point = { x: number; y: number };

/** One sampled mount pose: images share one size and ground point, so ground contact never bobs. */
export interface MountFrame {
	back: Img;
	front: Img;
	/** Ground contact in the images' pixel-edge coordinates. */
	ground: Point;
	/** Where the rider's contact point sits in this pose, in the images' pixel-edge coordinates. */
	seat: Point;
	ms: number;
}
export interface MountView {
	fixture: MountId;
	direction: DirectionName;
	frames: MountFrame[];
}
export type MountViewResult =
	{ ok: true; view: MountView } | { ok: false; reason: string; missingView: boolean };

interface Fixture {
	id: MountId;
	label: string;
	/** Plain words for what this seat tests, shown beside the preview. */
	detail: string;
	/** Directions with authored art. Anything else is reported missing, never borrowed from another facing. */
	views: readonly DirectionName[];
	/** The fixture's own gait: body rise per frame (negative is up) and its duration. */
	gait: readonly { dy: number; ms: number }[];
	draw(direction: DirectionName, height: number, dy: number): Omit<MountFrame, 'ms'>;
}

// Flat schematic colors: test fixtures, deliberately not production creature art.
const INK = [38, 34, 31, 255] as const,
	HIDE = [138, 128, 116, 255] as const,
	HIDE_FAR = [104, 96, 88, 255] as const,
	TACK = [112, 70, 46, 255] as const,
	SHELL = [96, 120, 92, 255] as const,
	SHELL_IN = [64, 82, 62, 255] as const,
	RIM = [150, 170, 132, 255] as const;
type Color = readonly [number, number, number, number];

function put(img: Img, x: number, y: number, c: Color) {
	if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
	img.data.set(c, (y * img.w + x) * 4);
}
function rect(img: Img, x: number, y: number, w: number, h: number, c: Color) {
	for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(img, x + i, y + j, c);
}
/** Ellipse inside the box [x, x + w) × [y, y + h); `keep` limits it to part of the box. */
function ellipse(
	img: Img,
	x: number,
	y: number,
	w: number,
	h: number,
	c: Color,
	keep: (px: number, py: number) => boolean = () => true
) {
	const cx = x + w / 2,
		cy = y + h / 2;
	for (let j = 0; j < h; j++)
		for (let i = 0; i < w; i++) {
			const dx = (x + i + 0.5 - cx) / (w / 2),
				dy = (y + j + 0.5 - cy) / (h / 2);
			if (dx * dx + dy * dy <= 1 && keep(x + i, y + j)) put(img, x + i, y + j, c);
		}
}
/** A one-pixel dark outline around the layer's own silhouette, drawn in its empty neighbors. */
function outline(img: Img) {
	const solid = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < img.w && y < img.h && img.data[(y * img.w + x) * 4 + 3] > 0;
	const edge: Point[] = [];
	for (let y = 0; y < img.h; y++)
		for (let x = 0; x < img.w; x++)
			if (
				!solid(x, y) &&
				(solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
			)
				edge.push({ x, y });
	for (const p of edge) put(img, p.x, p.y, INK);
}

const r = Math.round;

/** A long-bodied creature with a narrow saddle: the rider straddles, the pommel and neck can overlap the lap. */
function drawSaddle(direction: DirectionName, H: number, dy: number) {
	const diagonal = direction === 'south-east';
	const L = r(H * (diagonal ? 0.95 : 1.15)),
		bodyH = r(H * (diagonal ? 0.36 : 0.32)),
		leg = r(H * 0.3),
		legW = Math.max(2, r(H / 16)),
		pad = Math.max(2, r(H / 8));
	const W = L + 2 * pad + r(H * 0.25),
		Hh = leg + bodyH + r(H * 0.5) + 2;
	const back = makeImg(W, Hh),
		front = makeImg(W, Hh);
	// Feet end one row above the bottom outline row; the ground edge is the image bottom.
	const floor = Hh - 1,
		ground = { x: pad + r(L / 2), y: Hh };
	const bodyX = pad,
		bodyY = floor - leg - bodyH + dy,
		legTop = bodyY + bodyH - 2;
	const legs = diagonal
		? [0.18, 0.42, 0.62, 0.86].map((t, i) => ({ x: bodyX + r(L * t), far: i % 2 === 1 }))
		: [0.14, 0.26, 0.72, 0.84].map((t, i) => ({ x: bodyX + r(L * t), far: i % 2 === 1 }));
	for (const l of legs.filter((l) => l.far))
		rect(back, l.x, legTop, legW, floor - legTop, HIDE_FAR);
	// tail, behind the body
	rect(back, bodyX - pad + 1, bodyY + 2, pad, Math.max(2, r(bodyH * 0.7)), HIDE_FAR);
	ellipse(back, bodyX, bodyY, L, bodyH, HIDE);
	for (const l of legs.filter((l) => !l.far)) rect(back, l.x, legTop, legW, floor - legTop, HIDE);
	// narrow saddle on the back, centered just behind the middle
	const seatX = bodyX + r(L * 0.46),
		saddleW = Math.max(4, r(H * 0.22));
	rect(back, seatX - r(saddleW / 2), bodyY - 1, saddleW, 3, TACK);
	rect(back, seatX - r(saddleW / 2) - 1, bodyY - 3, 2, 3, TACK); // cantle
	// neck and head ahead of the seat; in the diagonal view they come toward the camera and overlap the rider
	const neckX = bodyX + L - r(H * 0.2),
		neckW = Math.max(3, r(H * 0.14)),
		neckH = r(H * 0.42);
	const neckLayer = diagonal ? front : back;
	rect(
		neckLayer,
		neckX,
		bodyY - neckH + r(bodyH / 2) + (diagonal ? r(H * 0.12) : 0),
		neckW,
		neckH,
		HIDE
	);
	rect(
		neckLayer,
		neckX,
		bodyY - neckH + r(bodyH / 2) + (diagonal ? r(H * 0.12) : 0),
		neckW + r(H * 0.16),
		Math.max(3, r(H * 0.1)),
		HIDE
	);
	// pommel: the only part that always sits in front of the rider's lap
	rect(front, seatX + r(saddleW / 2) - 1, bodyY - 3, 2, 4, TACK);
	outline(back);
	outline(front);
	return { back, front, ground, seat: { x: seatX, y: bodyY - Math.max(1, r(H * 0.06)) } };
}

/** A broad shell carrier: the rider sits down into a bowl whose front wall hides the lower body. */
function drawShell(direction: DirectionName, H: number, dy: number) {
	const diagonal = direction === 'south-east';
	const S = r(H * (diagonal ? 1.15 : 1.3)),
		shellH = r(H * 0.42),
		rimH = Math.max(3, r(H * (diagonal ? 0.12 : 0.06))),
		leg = r(H * 0.12),
		legW = Math.max(3, r(H / 10)),
		pad = Math.max(2, r(H / 8));
	const W = S + 2 * pad + r(H * 0.2),
		Hh = leg + shellH + rimH + 4;
	const back = makeImg(W, Hh),
		front = makeImg(W, Hh);
	const floor = Hh - 1,
		ground = { x: pad + r(S / 2), y: Hh };
	const shellX = pad,
		rimY = floor - leg - shellH + dy;
	// far feet and head stub behind everything
	rect(back, shellX + r(S * 0.3), floor - leg - 1, legW, leg + 1, HIDE_FAR);
	rect(back, shellX + r(S * 0.78), floor - leg - 1, legW, leg + 1, HIDE_FAR);
	rect(back, shellX + S - 2, rimY + r(shellH * 0.4), r(H * 0.18), Math.max(3, r(H * 0.12)), HIDE);
	// back wall (upper half of the rim ellipse) and the dark basin the rider sits into
	ellipse(back, shellX, rimY - rimH, S, rimH * 2 + 1, SHELL_IN);
	ellipse(back, shellX, rimY - rimH - 2, S, rimH * 2 + 1, SHELL, (_, py) => py < rimY - rimH + 1);
	// front wall: the rim's near half and the hull below it
	ellipse(front, shellX, rimY - rimH, S, rimH * 2 + 1, RIM, (_, py) => py >= rimY);
	ellipse(front, shellX, rimY - shellH, S, shellH * 2, SHELL, (_, py) => py > rimY);
	rect(front, shellX + r(S * 0.14), floor - leg - 1, legW, leg + 1, HIDE);
	rect(front, shellX + r(S * 0.62), floor - leg - 1, legW, leg + 1, HIDE);
	outline(back);
	outline(front);
	return { back, front, ground, seat: { x: ground.x, y: rimY + r(H * 0.04) } };
}

const FIXTURES: readonly Fixture[] = [
	{
		id: 'narrow-saddle',
		label: 'Open seat',
		detail:
			"Open seat: an open saddle, so the legs would straddle it; here they keep the selected move's pose.",
		views: ['east', 'south-east'],
		gait: [
			{ dy: 0, ms: 140 },
			{ dy: -1, ms: 140 },
			{ dy: 0, ms: 140 },
			{ dy: 1, ms: 140 }
		],
		draw: drawSaddle
	},
	{
		id: 'shell',
		label: 'Covered seat',
		detail: "Covered seat: the enclosing front wall hides the rider's legs.",
		views: ['east', 'south-east'],
		gait: [
			{ dy: 0, ms: 320 },
			{ dy: 1, ms: 320 }
		],
		draw: drawShell
	}
];
export const MOUNTS: readonly {
	id: MountId;
	label: string;
	detail: string;
	views: readonly DirectionName[];
}[] = FIXTURES;

const views = new Map<string, MountView>();
/** Draw a fixture's view at the rider's own pixel size (never rescaled). Missing views are reported, not borrowed. */
export function mountView(id: MountId, direction: DirectionName, height: number): MountViewResult {
	const fixture = FIXTURES.find((f) => f.id === id);
	if (!fixture) return { ok: false, reason: `Unknown mount fixture: ${id}`, missingView: false };
	if (!fixture.views.includes(direction))
		return {
			ok: false,
			reason: `${fixture.label} has no ${directionLabel(direction)} view; mount hidden`,
			missingView: true
		};
	if (!Number.isFinite(height) || height < 8)
		return {
			ok: false,
			reason: `${fixture.label} needs a standing height of at least 8 px`,
			missingView: false
		};
	const H = Math.round(height),
		key = `${id}/${direction}/${H}`;
	let view = views.get(key);
	if (!view) {
		view = {
			fixture: id,
			direction,
			frames: fixture.gait.map(({ dy, ms }) => ({ ...fixture.draw(direction, H, dy), ms }))
		};
		views.set(key, view);
	}
	return { ok: true, view };
}

/** The mount's own frame at `elapsedMs` on its own looping timeline, independent of the rider's move. */
export function sampleMountFrame(view: MountView, elapsedMs: number): number {
	return sampleTimeline(
		view.frames.map((f, cell) => ({ cell, ms: f.ms })),
		elapsedMs
	);
}

export interface RiderContact extends Point {
	/** `hip` is the rig's estimated hip anchor, a candidate, not reviewed saddle contact. */
	source: 'hip' | 'estimate';
}
/** Fraction of standing height above the feet used when no hip anchor exists. A disclosed estimate. */
export const ESTIMATED_HIP = 0.45;
/**
 * The rider's contact point in composed-image pixel-edge coordinates. `frame` is the composed image's frame (pivot at
 * frame.x, frame.y) and `ground` the standing feet in that image. One contact per move and facing, taken from the
 * move's first cell, so the move's own motion is preserved rather than pinned at the hip.
 */
export function riderContact(
	rig: Pick<Rig, 'pivot' | 'anchors'>,
	frame: Pick<Frame, 'x' | 'y'>,
	clip: string,
	direction: DirectionName,
	cell: number,
	ground: Point,
	standingHeight: number
): RiderContact {
	const hip = rig.anchors?.hip?.[clip]?.[direction]?.[cell];
	if (hip && hip.every(Number.isFinite))
		return {
			x: frame.x + hip[0] + 0.5 - rig.pivot.x,
			y: frame.y + hip[1] + 0.5 - rig.pivot.y,
			source: 'hip'
		};
	return { x: ground.x, y: ground.y - standingHeight * ESTIMATED_HIP, source: 'estimate' };
}

export interface MountPlacement {
	/** Top-left of the mount images, in rider-image pixels. Constant across the gait. */
	mount: Point;
	/** Whole-rider translation in rider-image pixels; layers and pivots are untouched. */
	rider: Point;
}
/**
 * Integer placement in the rider image's own pixel grid, so mount and rider pixels stay aligned at any scale: mount
 * ground on the rider's standing ground, rider contact on the frame's seat.
 */
export function placeRider(ground: Point, contact: Point, frame: MountFrame): MountPlacement {
	const mount = {
		x: Math.round(ground.x - frame.ground.x),
		y: Math.round(ground.y - frame.ground.y)
	};
	return {
		mount,
		rider: {
			x: Math.round(mount.x + frame.seat.x - contact.x),
			y: Math.round(mount.y + frame.seat.y - contact.y)
		}
	};
}

/**
 * The ground-relative frame (x, y = standing ground) holding the mount and the shifted rider body across every gait
 * frame, so Preview fits the whole mounted group without resizing as it bobs.
 */
export function mountedFrame(body: Frame, ground: Point, view: MountView, contact: Point): Frame {
	let l = Infinity,
		t = Infinity,
		right = -Infinity,
		b = -Infinity;
	for (const f of view.frames) {
		const { mount, rider } = placeRider(ground, contact, f);
		const bodyL = ground.x - body.x + rider.x,
			bodyT = ground.y - body.y + rider.y;
		l = Math.min(l, mount.x, bodyL);
		t = Math.min(t, mount.y, bodyT);
		right = Math.max(right, mount.x + f.back.w, bodyL + body.w);
		b = Math.max(b, mount.y + f.back.h, bodyT + body.h);
	}
	return { w: right - l, h: b - t, x: ground.x - l, y: ground.y - t };
}

/** Opacity of the mount's front layer in the diagnostic Show hidden parts view. Display only. */
export const GHOST_ALPHA = 0.35;
