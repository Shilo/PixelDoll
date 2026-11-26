import type { Manifest } from '../lib/store/manifest.ts';
import { setPanelOpen } from './experience/state.svelte.ts';
import { ui } from './state.svelte.ts';

/** Colors only lists the materials of what is worn, so an item can be recolored while it is worn and has any. */
export function canRecolor(m: Manifest, itemId: string, worn: boolean) {
	return worn && m.materials.some((material) => material.owner === itemId);
}

/** Recolor, from the item's menus: the Colors tab opens on the item's section, over any open sheet. */
export function recolorItem(itemId: string) {
	ui.colorsFocus = itemId;
	ui.tab = 'colors';
	setPanelOpen(true);
	ui.sheet = null;
}
