import type { Manifest } from '../lib/store/manifest.ts';
import { setPanelOpen } from './experience/state.svelte.ts';
import { ui } from './state.svelte.ts';

/** Colors only lists the materials of what is worn, so an item can be recolored while it is worn and has any. */
/** Whether the item has colors to change. The Colors tab shows worn items only, so an unworn one's Recolor row stays in
 *  its menu, unavailable with the reason, rather than appearing and vanishing as the item is worn and taken off. */
export function canRecolor(m: Manifest, itemId: string) {
	return m.materials.some((material) => material.owner === itemId);
}

/** Recolor, from the item's menus: the Colors tab opens on the item's section, over any open sheet. */
export function recolorItem(itemId: string) {
	ui.colorsFocus = itemId;
	ui.tab = 'colors';
	setPanelOpen(true);
	ui.sheet = null;
}
