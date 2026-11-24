// A synthetic 92 px character for the item-on-move sheet (lib/items/run.ts sheetItemMove), drawn in code: a flat mannequin
// with a 6-frame walk and a pair of jeans that has only its standing design. `answer` plays PixelLab: it draws the jeans on
// every frame cell of a sent sheet, so tests need no stored provider output.
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { over } from '../../src/lib/compose/compose.ts';
import { cellHash, type Sha256 } from '../../src/lib/rig/rig.ts';
import { SLOTS } from '../../src/lib/items/slots.ts';
import {
	CURRENT_FORMAT,
	type DirectionName,
	type Item,
	type Manifest
} from '../../src/lib/store/manifest.ts';

export const FRAME = 92;
const SKIN = [224, 172, 140, 255],
	DENIM = [58, 84, 150, 255],
	SEAM = [38, 56, 104, 255];
/** Horizontal foot swing per walk frame. */
const SWING = [0, 2, 3, 1, -2, -3];

function fill(im: Img, x0: number, y0: number, x1: number, y1: number, c: number[]) {
	for (let y = y0; y <= y1; y++)
		for (let x = x0; x <= x1; x++)
			if (x >= 0 && x < im.w && y >= 0 && y < im.h) im.data.set(c, (y * im.w + x) * 4);
}
const side = (dir: DirectionName) => dir === 'east' || dir === 'west';
/** The legs of a frame: two columns (one in a side view), their feet swung by `s` px. */
function legs(dir: DirectionName, s: number): [number, number, number][] {
	return side(dir)
		? [[43 + s, 49 + s, 0]]
		: [
				[38 - s, 44 - s, 0],
				[48 + s, 54 + s, 0]
			];
}
/** The mannequin in one view and frame; `wide` spreads the arms (a view much wider than the others). */
function body(dir: DirectionName, s: number, wide = false): Img {
	const im = makeImg(FRAME, FRAME),
		[x0, x1] = side(dir) ? [40, 52] : [37, 55];
	fill(im, 41, 8, 51, 20, SKIN); // head
	fill(im, x0, 21, x1, 50, SKIN); // torso
	if (wide) fill(im, 8, 26, 84, 30, SKIN);
	else if (!side(dir)) {
		fill(im, 32, 23, 35, 46, SKIN);
		fill(im, 57, 23, 60, 46, SKIN);
	}
	for (const [a, b] of legs(dir, s)) fill(im, a, 51, b, 84, SKIN);
	return im;
}
/** The jeans: a hip band and the legs down to the ankles, with a darker seam on each leg's outer column. */
function jeans(dir: DirectionName, s: number): Img {
	const im = makeImg(FRAME, FRAME),
		[x0, x1] = side(dir) ? [40, 52] : [37, 55];
	fill(im, x0, 46, x1, 52, DENIM);
	for (const [a, b] of legs(dir, s)) {
		fill(im, a, 51, b, 78, DENIM);
		fill(im, a, 51, a, 78, SEAM);
	}
	return im;
}
const flip = (im: Img) => {
	const o = makeImg(im.w, im.h);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			o.data.set(
				im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4),
				(y * im.w + im.w - 1 - x) * 4
			);
	return o;
};

/** The character: south, east and north drawn (west mirrors east unless `west`), Standing and a 6-frame walk; the jeans are
 *  an accepted posed item with its dressed chroma keyframes, so walk is a move it is missing. */
export async function sheetCharacter(o: { west?: boolean; wideEast?: boolean } = {}) {
	const images = new Map<string, Img>(),
		put = async (im: Img) => {
			const h = await cellHash(im);
			images.set(h, im);
			return h as Sha256;
		};
	const drawn: DirectionName[] = ['south', 'east', 'north', ...(o.west ? ['west' as const] : [])];
	const view = (dir: DirectionName, s: number, of: (d: DirectionName, s: number) => Img) =>
		dir === 'west' ? flip(of('east', -s)) : of(dir, s);
	const mannequin = (dir: DirectionName, s: number) =>
		view(dir, s, (d, sw) => body(d, sw, !!o.wideEast && d === 'east'));
	const cells = { default: {}, walk: {} } as Record<
			string,
			Partial<Record<DirectionName, Sha256[]>>
		>,
		rest: Manifest['rig']['rest'] = {},
		dressed: Partial<Record<DirectionName, Sha256>> = {},
		standing: Partial<Record<DirectionName, Sha256[]>> = {};
	for (const dir of drawn) {
		const still = mannequin(dir, 0),
			design = view(dir, 0, jeans);
		cells.default[dir] = [await put(still)];
		cells.walk[dir] = await Promise.all(SWING.map((s) => put(mannequin(dir, s))));
		rest[dir] = { image: cells.default[dir]![0], keypoints: [] };
		const key = toChroma(still, 'green');
		over(key, design);
		dressed[dir] = await put(key);
		standing[dir] = [await put(design)];
	}
	const baseHash = `sha256:${'5'.repeat(64)}` as Sha256;
	const legsSlot = SLOTS.find((s) => s.id === 'legs')!;
	const pants: Item = {
		id: 'jeans',
		name: 'Jeans',
		slot: 'legs',
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: 'blue jeans',
		layers: [{ id: 'main', role: 'fg', z: legsSlot.z, cells: { default: standing } }],
		baseHash,
		route: 'skeleton-pose',
		key: 'green',
		standing: 'default',
		dressed,
		coverage: drawn.map((d) => `default/${d}/0` as const),
		provenance: []
	};
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		name: 'Sheet character',
		app: 'test',
		rig: {
			cell: { w: FRAME, h: FRAME },
			pivot: { x: 46, y: 86 },
			view: 'low top-down',
			baseHash,
			baseItem: 'base',
			directions: [
				{ id: 'south' },
				{ id: 'east' },
				{ id: 'north' },
				o.west ? { id: 'west' } : { id: 'west', mirrorOf: 'east' }
			],
			animations: [
				{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
				{ id: 'walk', cells: 6, loop: true, frames: SWING.map((_, cell) => ({ cell, ms: 100 })) }
			],
			rest
		},
		materials: [],
		slots: SLOTS.filter((s) => s.id === 'body' || s.id === 'legs'),
		items: [
			{
				id: 'base',
				name: 'Body',
				slot: 'body',
				status: 'accepted',
				mirror: 'flip',
				materials: [],
				prompt: 'mannequin',
				layers: [{ id: 'main', role: 'fg', z: 10, cells }],
				baseHash,
				provenance: []
			},
			pants
		],
		presets: []
	};
	return {
		manifest,
		images,
		swing: SWING,
		jeans: (dir: DirectionName, i: number) => view(dir, SWING[i], jeans)
	};
}

/** PixelLab's answer to a sent sheet: `draw(row, frame)` returns what the model drew on that frame cell, in frame
 *  coordinates ('jeans', 'erase' for an empty cell, or 'keep'); the whole sheet then moves by `offset`. */
export function answer(
	sent: Img,
	plan: {
		key: string;
		dir: DirectionName;
		ref: boolean;
		x: number;
		y: number;
		window: { x: number; y: number };
	}[],
	cell: { w: number; h: number },
	art: (dir: DirectionName, i: number) => Img,
	draw: (dir: DirectionName, i: number) => 'jeans' | 'erase' | 'keep' | 'naked',
	offset: [number, number] = [0, 0]
): Img {
	const out = makeImg(sent.w, sent.h);
	out.data.set(sent.data);
	for (const c of plan) {
		const how = c.ref ? 'keep' : draw(c.dir, +c.key.split('/')[2]);
		if (how === 'keep') continue;
		const item = art(c.dir, +c.key.split('/')[2]);
		for (let y = 0; y < cell.h; y++)
			for (let x = 0; x < cell.w; x++) {
				const p = ((c.y + y) * out.w + c.x + x) * 4,
					q = ((c.window.y + y) * item.w + c.window.x + x) * 4,
					ink = !!item.data[q + 3];
				// 'naked': the jeans are drawn but the mannequin around them is gone (a redrawn body: fails G2, still usable)
				if (how === 'erase' || (how === 'naked' && !ink)) out.data.fill(0, p, p + 4);
				else if (ink) out.data.set(item.data.subarray(q, q + 4), p);
			}
	}
	const moved = makeImg(out.w, out.h);
	for (let y = 0; y < out.h; y++)
		for (let x = 0; x < out.w; x++) {
			const X = x + offset[0],
				Y = y + offset[1];
			if (X >= 0 && Y >= 0 && X < out.w && Y < out.h)
				moved.data.set(
					out.data.subarray((y * out.w + x) * 4, (y * out.w + x) * 4 + 4),
					(Y * out.w + X) * 4
				);
		}
	return moved;
}
