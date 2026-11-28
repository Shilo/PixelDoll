import type { Manifest } from '../lib/store/manifest.ts';
import { setPanelOpen } from './experience/state.svelte.ts';
import { doc, ui } from './state.svelte.ts';

/** Whether the item has colors to show in the Colors tab. */
export function canRecolor(m: Manifest, itemId: string) {
	return m.materials.some((material) => material.owner === itemId);
}

/** Recolor, from the item's menus: the Colors tab opens on the item's section, over any open sheet. */
export function recolorItem(itemId: string) {
	ui.colorsFocus = { project: doc.id, item: itemId };
	ui.tab = 'colors';
	setPanelOpen(true);
	ui.sheet = null;
}
