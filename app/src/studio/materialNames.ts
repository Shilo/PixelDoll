import { materialNames } from '../lib/dress/dress.ts';
import type { SlotSource } from '../lib/items/slots.ts';
import type { Item, Material } from '../lib/store/manifest.ts';

/** An item's material labels, shared by the Colors panel and its search. A region-split base (B15) names its own materials
 * (Shirt, Shorts, then Skin); every other item derives them from its description and slot ("Metal", "Leather"), also for
 * projects saved with the old hue labels. */
export function itemMaterialNames(
	it: Pick<Item, 'regions' | 'slot' | 'prompt' | 'name'>,
	mats: readonly Material[],
	manifest: SlotSource = []
): string[] {
	return it.regions
		? mats.map((mat) => mat.label)
		: materialNames(
				it,
				mats.map((mat) => mat.ramp),
				manifest
			);
}
