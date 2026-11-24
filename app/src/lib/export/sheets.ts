// Sheets (manifest-spec §3 inv. 1–2, §5): one UNTRIMMED sheet per layer per animation. Rows = rig.directions (mirrored
// rows baked), cols = cells. Transparent cells stay in the grid. Each layer uses its own cell (v1.3.1 oversize); baked sheets use
// bakedFrame() (the union of every layer around the pivot).
import { makeImg, type Img } from '../image/png.ts';
import {
	actionClipsGear,
	actionFragment,
	actionLayerFragment,
	actionLowerSlot,
	actionPairFallback,
	actionPixelBounds,
	layerOffset,
	rigFrame,
	bakedFrame,
	cellImg,
	composeCell,
	layerFrame,
	over,
	type Frame
} from '../runtime/paperdoll.js';
import type {
	ActionLayers,
	DirectionName,
	Item,
	Layer,
	Manifest,
	Preset,
	Project
} from '../store/manifest.ts';
import { portablePathId } from './paths.ts';

export const sheetPath = (
	item: Pick<Item, 'id' | 'slot'>,
	layer: Pick<Layer, 'id'>,
	anim: string
) => `layers/${[item.slot, item.id, layer.id, anim].map(portablePathId).join('/')}.png`;

function grid(
	p: Project,
	anim: string,
	{ w, h }: Frame,
	cell: (dir: DirectionName, i: number) => Img | null
): Img {
	const { rig } = p.manifest;
	const a = rig.animations.find((x) => x.id === anim)!;
	const out = makeImg(a.cells * w, rig.directions.length * h);
	rig.directions.forEach((d, r) => {
		for (let c = 0; c < a.cells; c++) {
			const im = cell(d.id, c);
			if (im) over(out, im, c * w, r * h);
		}
	});
	return out;
}

export const layerSheet = (p: Project, layer: Layer, anim: string) =>
	grid(p, anim, layerFrame(p.manifest.rig, layer), (d, i) => cellImg(p, layer, anim, d, i));
export function bakedSheet(
	p: Project,
	items: Preset['items'],
	anim: string,
	f = bakedFrame(p.manifest)
) {
	return grid(p, anim, f, (d, i) => composeCell(p, items, anim, d, i, f));
}

export interface ActionSheetOptions {
	waist: number;
	walk: readonly string[];
	attacks: readonly string[];
}

/** Source-color sheets reuse each layer's atlas grid and pivot. Registration and gear checks are baked once. */
export function actionSheets(p: Project, manifest: Manifest, options: ActionSheetOptions) {
	const files: { name: string; data: Img }[] = [];
	const data: ActionLayers = { planes: [], pairs: [] };
	const { rig } = p.manifest;
	const base = rigFrame(rig),
		target = bakedFrame(manifest);
	const items = new Map(p.manifest.items.map((item) => [item.id, item]));
	function prepare(clip: string, part: 'lower' | 'upper') {
		const move = manifest.rig.animations.find(({ id }) => id === clip);
		if (!move) return undefined;
		const poses = Object.fromEntries(
			rig.directions.map(({ id: direction }) => [
				direction,
				Array.from({ length: move.cells }, (_, cell) =>
					actionFragment(p, { clip, direction, cell }, options.waist, part)
				)
			])
		);
		const checks = new Map<
			string,
			Map<
				string,
				{
					lost: number;
					bounds: ReturnType<typeof actionPixelBounds>;
					frame: Frame;
				}[]
			>
		>();
		const anchors = rig.directions.map(({ id: direction }) => ({
			direction,
			cells: poses[direction].map((pose): [number, number] | null =>
				pose ? [Math.round(pose.hip.x), Math.round(pose.hip.y)] : null
			)
		}));
		if (!anchors.some((d) => d.cells.some(Boolean))) return undefined;
		data.planes.push({ clip, part, anchors });
		for (const item of manifest.items) {
			const body = item.id === rig.baseItem || item.variantOf === rig.baseItem;
			if (!body && (part === 'lower') !== actionLowerSlot(item.slot)) continue;
			const source = items.get(item.id)!;
			for (const layer of item.layers) {
				const original = source.layers.find(({ id }) => id === layer.id)!;
				const frame = layerFrame(rig, original);
				const name = `action/${part}/${sheetPath(item, layer, clip)}`;
				const sheet = grid(p, clip, frame, (dir, cell) => {
					const pose = poses[dir][cell],
						image = cellImg(p, original, clip, dir, cell);
					if (!pose || !image) return null;
					const fragment = actionLayerFragment(image, frame, base, pose, part, body);
					if (!body) {
						const key = `${dir}/${cell}`;
						const found = checks.get(key) ?? new Map();
						const entries = found.get(item.id) ?? [];
						entries.push({
							frame,
							lost: part === 'lower' && actionLowerSlot(item.slot) ? fragment.lost : 0,
							bounds: part === 'upper' ? actionPixelBounds(fragment.image) : null
						});
						found.set(item.id, entries);
						checks.set(key, found);
					}
					return fragment.image;
				});
				layer.actionSheets ??= {};
				(layer.actionSheets[part] ??= {})[clip] = name;
				files.push({ name, data: sheet });
			}
		}
		return { clip, poses, checks, move };
	}
	const lower = [...new Set(options.walk)].flatMap((clip) => prepare(clip, 'lower') ?? []);
	const upper = [...new Set(options.attacks)].flatMap((clip) => prepare(clip, 'upper') ?? []);
	for (const walk of lower)
		for (const attack of upper) {
			if (walk.clip === attack.clip) continue;
			for (const { id: direction } of rig.directions) {
				if (walk.move.directions && !walk.move.directions.includes(direction)) continue;
				if (attack.move.directions && !attack.move.directions.includes(direction)) continue;
				const cells = walk.poses[direction].flatMap((lo, w) =>
					attack.poses[direction].map((hi, a) => {
						if (!lo || !hi) return null;
						const offset = layerOffset(lo, hi);
						if (actionPairFallback(offset.seam, 0)) return null;
						const blocked: string[] = [];
						for (const item of manifest.items) {
							if (item.id === rig.baseItem || item.variantOf === rig.baseItem) continue;
							const bottom = walk.checks.get(`${direction}/${w}`)?.get(item.id);
							const top = attack.checks.get(`${direction}/${a}`)?.get(item.id);
							const useBottom = actionLowerSlot(item.slot);
							if (
								useBottom
									? !bottom || bottom.some((entry) => entry.lost)
									: !top ||
										top.some((entry) =>
											actionClipsGear(entry.bounds ?? null, entry.frame, target, offset)
										)
							)
								blocked.push(item.id);
						}
						return {
							x: offset.x - (Math.round(lo.hip.x) - Math.round(hi.hip.x)),
							y: offset.y - (Math.round(lo.hip.y) - Math.round(hi.hip.y)),
							blocked
						};
					})
				);
				if (cells.some(Boolean))
					data.pairs.push({
						walk: walk.clip,
						action: attack.clip,
						direction,
						upperCells: attack.move.cells,
						cells
					});
			}
		}
	if (!data.pairs.length) {
		for (const item of manifest.items) for (const layer of item.layers) delete layer.actionSheets;
		return [];
	}
	manifest.actionLayers = data;
	return files;
}

/** One sheet row (= one direction) as a strip image. */
export function sheetRow(sheet: Img, row: number, h: number): Img {
	const w = sheet.w;
	return { w, h, data: sheet.data.slice(row * h * w * 4, (row + 1) * h * w * 4) };
}

export function selfTest() {
	const im: Img = { w: 2, h: 1, data: new Uint8ClampedArray([1, 0, 0, 255, 0, 0, 0, 0]) };
	const m = {
		rig: {
			cell: { w: 2, h: 1 },
			baseItem: 'base',
			directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
			animations: [{ id: 'walk', cells: 3 }]
		},
		slots: [{ id: 'body', z: 10 }],
		items: []
	};
	const layer = {
		id: 'main',
		role: 'fg',
		z: 10,
		cells: { walk: { east: [null, 'sha256:a', null] } }
	} as Layer;
	const p = { manifest: m, images: new Map([['sha256:a', im]]) } as unknown as Project;
	const s = layerSheet(p, layer, 'walk');
	console.assert(s.w === 6 && s.h === 3, `sheet size ${s.w}x${s.h} = cells*w x dirs*h`);
	const at = (x: number, y: number) =>
		s.data.slice((y * s.w + x) * 4, (y * s.w + x) * 4 + 4).join();
	console.assert(at(2, 1) === '1,0,0,255' && at(3, 1) === '0,0,0,0', 'east cell 1 placed at col 1');
	console.assert(
		at(3, 2) === '1,0,0,255' && at(2, 2) === '0,0,0,0',
		'west row = baked flip of east'
	);
	console.assert(
		[...s.data.slice(0, 6 * 4)].every((v) => v === 0),
		'south row transparent (no cells), still present'
	);
	console.assert(sheetRow(s, 1, 1).data.join() === s.data.slice(24, 48).join(), 'sheetRow');
	console.assert(
		sheetPath({ id: 'cape', slot: 'back' }, { id: 'bg' }, 'walk') ===
			'layers/back/cape/bg/walk.png',
		'sheetPath'
	);
	const big = layerSheet(
		p,
		{ ...layer, cell: { w: 4, h: 3 }, cells: { walk: { east: [null, null, null] } } },
		'walk'
	);
	console.assert(
		big.w === 12 && big.h === 9,
		`oversize layer sheet ${big.w}x${big.h} = cells*layer.w x dirs*layer.h`
	);
}
