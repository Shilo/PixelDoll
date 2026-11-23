import { hasCompleteCells, moveDirs } from '../lib/dress/dress.ts';
import type { DirectionName, Item, Manifest } from '../lib/store/manifest.ts';
import { itemMoveOffer, missingItemMoves, type MoveSpec } from './create.ts';

/** Equipment that has every frame in every view the body has for the move or State. */
const drawnFor = (m: Manifest, it: Item, clipId: string, dirs: DirectionName[]) =>
	dirs.every((dir) => hasCompleteCells(m, it, clipId, dir));

/** How many of the character's items (not the body) are drawn for a move or State; null when the body has no view of it.
 *  A partly drawn item counts as missing: the stage hides an incomplete view whole. */
export function clipItemCoverage(
	m: Manifest,
	clipId: string
): { drawn: number; total: number } | null {
	const dirs = moveDirs(m, clipId);
	if (!dirs.length) return null;
	const items = m.items.filter((it) => it.id !== m.rig.baseItem);
	return {
		drawn: items.filter((it) => drawnFor(m, it, clipId, dirs)).length,
		total: items.length
	};
}

/** The character's items missing frames for a move or State, in Wardrobe order. */
export function clipMissingItems(m: Manifest, clipId: string): Item[] {
	const dirs = moveDirs(m, clipId);
	return dirs.length
		? m.items.filter((it) => it.id !== m.rig.baseItem && !drawnFor(m, it, clipId, dirs))
		: [];
}

/** The priced request that draws one item for one move or State, or null when the item cannot be generated there (a
 *  copy without its own design, no joints). A reviewed move passes the views it accepted, and only views the item has a
 *  standing design for are posed onto it, as before. */
export function clipItemOffer(
	m: Manifest,
	itemId: string,
	clipId: string,
	options: { seed?: number; dirs?: readonly DirectionName[]; reviewedMoveItems?: boolean } = {}
) {
	const item = m.items.find((it) => it.id === itemId);
	const spec = item && missingItemMoves(m, itemId, options.seed ?? 0).find((s) => s.id === clipId);
	const dirs = options.dirs
		? spec?.dirs?.filter((dir) => options.dirs!.includes(dir) && item?.dressed?.[dir])
		: spec?.dirs;
	if (!spec || !dirs?.length) return null;
	return itemMoveOffer(m, [
		{ ...spec, dirs, ...(options.reviewedMoveItems ? { reviewedMoveItems: true } : {}) }
	]);
}

/** Fresh seeds for approved requests, so a repeat attempt is not the same draw. */
export const seeded = (specs: MoveSpec[]) =>
	specs.map((spec) => ({ ...spec, seed: 1 + Math.floor(Math.random() * 1_000_000) }));

/** The chosen rows that can be generated, their requests and their combined estimate. */
export function pickedOffers<Row extends { item: Item; offer: ReturnType<typeof clipItemOffer> }>(
	rows: Row[],
	selected: string[]
) {
	const chosen = rows.filter(
		({ item, offer }) => offer?.specs.length && selected.includes(item.id)
	);
	return {
		chosen,
		gens: chosen.reduce((sum, row) => sum + (row.offer?.gens ?? 0), 0),
		specs: chosen.flatMap(({ offer }) => offer?.specs ?? [])
	};
}
