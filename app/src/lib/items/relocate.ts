import type { Item, Layer, Manifest, Slot } from '../store/manifest.ts';
import { putItem } from './items.ts';
import { retargetLayerDepth, slotLadder } from './slots.ts';

const wearable = (slot?: Slot) => slot?.class === 'rigid' || slot?.class === 'worn';

export function canRelocateItem(manifest: Manifest, item: Item, target?: Slot) {
	const source = manifest.slots.find((slot) => slot.id === item.slot);
	if (
		item.status !== 'accepted' ||
		item.pending?.length ||
		item.id === manifest.rig.baseItem ||
		item.variantOf ||
		!source?.anchor ||
		!wearable(source) ||
		!item.layers.some((layer) => layer.role === 'fg')
	)
		return false;
	if (!target) return true;
	if (target.class !== source.class || target.anchor !== source.anchor || target.id === item.slot)
		return false;
	return (
		target.bgZ != null ||
		!item.layers.some(
			(layer) =>
				layer.role === 'bg' &&
				(layer.sheets ||
					layer.sourceSheets ||
					Object.values(layer.cells ?? {}).some((directions) =>
						Object.values(directions).some((cells) => cells.some(Boolean))
					))
		)
	);
}

export function relocateWornItem(
	items: Record<string, string | null>,
	id: string,
	from: string,
	to: string,
	{ replace = false } = {}
) {
	if (items[from] !== id) return false;
	items[from] = null;
	if (replace || items[to] == null) items[to] = id;
	return true;
}

export function relocateItem(manifest: Manifest, item: Item, target: Slot): Item | undefined {
	const front = item.layers.find((layer) => layer.role === 'fg');
	const source = manifest.slots.find((slot) => slot.id === item.slot);
	if (!front || !source || !canRelocateItem(manifest, item, target)) return;
	const layers: Layer[] = [
		{
			...front,
			id: target.bgZ == null ? 'main' : 'fg',
			z: retargetLayerDepth(front, source, target)
		}
	];
	if (target.bgZ != null) {
		const back = item.layers.find((layer) => layer.role === 'bg');
		const cells: NonNullable<Layer['cells']> = {};
		if (!back)
			for (const [animation, directions] of Object.entries(front.cells ?? {}))
				cells[animation] = Object.fromEntries(
					Object.entries(directions).map(([direction, row]) => [direction, row.map(() => null)])
				);
		layers.push({
			...(back ?? {
				cells,
				...(front.cell ? { cell: front.cell } : {}),
				...(front.pivot ? { pivot: front.pivot } : {})
			}),
			id: 'bg',
			role: 'bg',
			z: back ? retargetLayerDepth(back, source, target) : target.bgZ
		});
	}
	const next = { ...item, slot: target.id, layers };
	if (next.hides) next.hides = next.hides.filter((slot) => slot !== target.id);
	putItem(manifest, next, slotLadder(manifest.rig));
	for (const outfit of manifest.presets)
		relocateWornItem(outfit.items, item.id, item.slot, target.id);
	return next;
}
