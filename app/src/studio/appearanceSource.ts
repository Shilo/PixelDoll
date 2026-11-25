import { cellImg, composeCell, layerFrame, over } from '../lib/compose/compose.ts';
import { splitFgBg } from '../lib/compose/split.ts';
import { KEYS, referenceKey, referenceKeyCollisions, toChroma } from '../lib/image/chroma.ts';
import { stableStringify } from '../lib/image/hash.ts';
import { LocalizedError } from '../lib/message.ts';
import { makeImg, type Img } from '../lib/image/png.ts';
import { neckY } from '../lib/items/items.ts';
import { behaviorOf, requireSlot } from '../lib/items/slots.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import { hasAll } from '../lib/rig/poses.ts';
import {
	DEFAULT_MOVE,
	baseHashOf,
	cellHash,
	playlist,
	storedCellHashes,
	type Rig,
	type Sha256
} from '../lib/rig/rig.ts';
import { setupRestAnimation } from '../lib/rig/setup.ts';
import type { CellKey, Item, Layer, Manifest, Project, Provenance } from '../lib/store/manifest.ts';
import type { StateGenerationSource } from './stateGenerationSource.ts';
import { BASE_CLOTHES, UNDERWEAR_CLOTHES } from './model.ts';

export interface AppearanceTarget {
	projectId: string;
	itemId?: string;
	clip?: string;
}

export interface AppearanceSource extends StateGenerationSource {
	name: string;
	clip: string;
	cell: number;
	item?: Item;
}

export type AppearanceChoice = 'underwear' | 'bare' | 'custom';

export const appearanceReviewHold = () =>
	new LocalizedError(
		'Save or discard the appearance preview before changing its source.',
		'appearance.reviewPending'
	);

export function canEditItemAppearance({ rig }: Manifest, item: Item) {
	const first = item.layers[0];
	if (
		!first ||
		item.status !== 'accepted' ||
		item.variantOf ||
		item.id === rig.baseItem ||
		item.baseHash !== rig.baseHash
	)
		return false;
	const hasSource = item.layers.some((layer) =>
		Object.values(layer.cells ?? {}).some((views) => Object.values(views).some((cells) => cells[0]))
	);
	return (
		hasSource &&
		(item.layers.length === 1 ||
			(item.layers.length === 2 &&
				item.layers[0].role !== item.layers[1].role &&
				stableStringify(layerFrame(rig, first)) ===
					stableStringify(layerFrame(rig, item.layers[1]))))
	);
}

export function appearancePrompt(choice: AppearanceChoice, custom: string, item: boolean) {
	const change =
		choice === 'custom'
			? custom.trim()
			: `Replace the baked-in clothing and footwear. Leave the character ${choice === 'underwear' ? UNDERWEAR_CLOTHES : BASE_CLOTHES}. Keep the hair, face, skin tone, and pixel-art style.`;
	if (!change) return '';
	return `${change} Apply the same change to all supplied views. Preserve each view's facing, pose, scale, canvas, and placement.${item ? ' Draw only the equipment on a transparent background.' : ''}`;
}

export async function appearanceSource(
	project: Project,
	target: AppearanceTarget
): Promise<AppearanceSource | null> {
	const m = project.manifest;
	const { rig } = m;
	const base = m.items.find(({ id }) => id === rig.baseItem);
	const item = target.itemId ? m.items.find(({ id }) => id === target.itemId) : undefined;
	if (!base || (target.itemId && (!item || !canEditItemAppearance(m, item)))) return null;
	const first = item?.layers[0];
	const frame = first ? layerFrame(rig, first) : { ...rig.cell, ...rig.pivot };
	const selected = item ? { [item.slot]: item.id } : {};
	const itemOnly = item ? { ...project, manifest: { ...m, items: [item] } } : undefined;
	const clips = rig.animations.map(({ id }) => id);
	const ids = new Set(
		item
			? [DEFAULT_MOVE, target.clip, ...clips]
			: [target.clip, DEFAULT_MOVE, setupRestAnimation(rig)?.id, ...clips]
	);
	for (const id of ids) {
		const clip = rig.animations.find((candidate) => candidate.id === id);
		const cell = clip?.frames[0]?.cell;
		if (!clip || cell === undefined) continue;
		const views: AppearanceSource['views'] = [];
		for (const { id: direction, mirrorOf } of rig.directions) {
			if (mirrorOf && !item?.layers.some((layer) => layer.cells?.[clip.id]?.[direction])) continue;
			const image = itemOnly
				? composeCell(itemOnly, selected, clip.id, direction, cell, frame)
				: cellImg(project, base.layers[0], clip.id, direction, cell);
			if (!image || !opaqueBox(image)) continue;
			views.push({ direction, image, hash: await cellHash(image) });
		}
		if (
			!views.length ||
			(!item && views.length !== rig.directions.filter(({ mirrorOf }) => !mirrorOf).length)
		)
			continue;
		const size = { width: frame.w, height: frame.h };
		return {
			name: item?.name ?? m.name,
			clip: clip.id,
			cell,
			item,
			size,
			views,
			version: stableStringify({
				clip: clip.id,
				cell,
				frame,
				rig: {
					cell: rig.cell,
					pivot: rig.pivot,
					view: rig.view,
					directions: rig.directions,
					...(item && { baseHash: rig.baseHash })
				},
				item: item && {
					slot: item.slot,
					layers: item.layers.map(({ id, z, role, cell, pivot }) => ({ id, z, role, cell, pivot })),
					hides: item.hides
				},
				views: views.map(({ direction, hash }) => [direction, hash])
			})
		};
	}
	return null;
}

export async function editedCharacter(
	project: Project,
	views: AppearanceSource['views'],
	description: string,
	provenance: Provenance[]
) {
	const { rig, app, format, slots, name } = project.manifest;
	const images = new Map<Sha256, Img>(views.map(({ hash, image }) => [hash, image]));
	const drawn = Object.fromEntries(views.map(({ direction, hash }) => [direction, [hash]]));
	const cells = { [DEFAULT_MOVE]: drawn };
	const targetRig: Rig = {
		cell: rig.cell,
		pivot: rig.pivot,
		directions: rig.directions,
		view: rig.view,
		template: rig.template,
		pixelsPerUnit: rig.pixelsPerUnit,
		animations: [{ id: DEFAULT_MOVE, cells: 1, loop: true, frames: playlist(1, 150) }],
		baseItem: rig.baseItem,
		baseHash: rig.baseHash
	};
	targetRig.baseHash = await baseHashOf(targetRig, storedCellHashes(targetRig, cells));
	const base: Item = {
		id: rig.baseItem,
		name,
		slot: 'body',
		prompt: description,
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		baseHash: targetRig.baseHash,
		layers: [{ id: 'main', role: 'fg', z: 0, cells }],
		provenance
	};
	return {
		manifest: {
			format,
			app,
			name,
			rig: targetRig,
			slots,
			items: [base],
			materials: [],
			presets: [{ id: 'default', name: 'Default', items: {}, variants: {} }]
		},
		images
	} satisfies Project;
}

export async function editedItem(
	project: Project,
	source: AppearanceSource,
	views: AppearanceSource['views'],
	id: string,
	name: string,
	description: string,
	provenance: Provenance[]
) {
	const original = source.item!;
	const { rig } = project.manifest;
	const hair = behaviorOf(requireSlot(project.manifest, original.slot)) === 'hair';
	const baseLayer = project.manifest.items.find(({ id }) => id === rig.baseItem)!.layers[0];
	const coverage: CellKey[] = [];
	const images = new Map<Sha256, Img>();
	const layers: Layer[] = original.layers.map(({ id, role, z, cell, pivot }) => ({
		id,
		role,
		z,
		cell,
		pivot,
		cells: { [source.clip]: {} }
	}));
	for (const { direction, image } of views) {
		const compatibleBase = makeImg(image.w, image.h);
		const base = cellImg(project, baseLayer, source.clip, direction, source.cell);
		const frame = layerFrame(rig, layers[0]);
		if (base) over(compatibleBase, base, frame.x - rig.pivot.x, frame.y - rig.pivot.y);
		const split =
			layers.length < 2
				? undefined
				: base
					? splitFgBg(
							image,
							compatibleBase,
							hair
								? neckY(rig, `${source.clip}/${direction}/${source.cell}`, frame.y - rig.pivot.y)
								: undefined
						)
					: { fg: image, bg: compatibleBase };
		for (const layer of layers) {
			const pixels = split ? split[layer.role === 'bg' ? 'bg' : 'fg'] : image;
			const hash = opaqueBox(pixels) ? await cellHash(pixels) : null;
			if (hash) images.set(hash, pixels);
			const cells = Array.from({ length: source.cell + 1 }, () => null as Sha256 | null);
			cells[source.cell] = hash;
			layer.cells![source.clip]![direction] = cells;
		}
		coverage.push(`${source.clip}/${direction}/${source.cell}`);
	}
	const item: Item = {
		id,
		name,
		prompt: description,
		slot: original.slot,
		status: 'accepted',
		mirror: original.mirror,
		baseHash: rig.baseHash,
		materials: [],
		layers,
		coverage,
		hides: original.hides,
		provenance
	};
	// A standing edit can seed the ordinary fitting workflow once the saved artwork has a collision-free mannequin key.
	// Padded held items need the exact same registered reference and placement the existing skeleton route uses.
	if (source.clip === DEFAULT_MOVE) {
		const frame = layerFrame(rig, layers[0]);
		const padded = frame.w !== rig.cell.w || frame.h !== rig.cell.h;
		const pad = (frame.w - rig.cell.w) / 2;
		const aligned =
			Number.isInteger(pad) &&
			pad >= 0 &&
			frame.h === rig.cell.h + 2 * pad &&
			frame.x === rig.pivot.x + pad &&
			frame.y === rig.pivot.y + pad;
		const collisions = { green: 0, magenta: 0, blue: 0, azure: 0 };
		for (const { image } of views) {
			const count = referenceKeyCollisions(image);
			for (const color of KEYS) collisions[color] += count[color];
		}
		const key = referenceKey(description, collisions);
		const dressed: NonNullable<Item['dressed']> = {};
		if (aligned && !collisions[key])
			for (const { direction, image } of views) {
				const base = cellImg(project, baseLayer, source.clip, direction, source.cell);
				if (!base) continue;
				const rest = rig.rest?.[direction];
				if (padded && (!rest || !hasAll(rest.keypoints) || rest.image !== (await cellHash(base))))
					continue;
				const reference = makeImg(image.w, image.h);
				over(reference, toChroma(base, key), pad, pad);
				over(reference, image);
				const hash = await cellHash(reference);
				images.set(hash, reference);
				dressed[direction] = hash;
			}
		if (Object.keys(dressed).length)
			Object.assign(item, {
				key,
				dressed,
				standing: source.clip,
				route: padded ? 'skeleton-pose' : 'ea2-anchor'
			});
	}
	return { item, images };
}
