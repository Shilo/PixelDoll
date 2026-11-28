import type { Item } from '../lib/store/manifest.ts';
import { itemReferenceFrame } from './model.ts';
import { openNewItem, store } from './state.svelte.ts';

/** An item without a saved design to pose cannot be drawn onto more moves. Redraw makes it again in the priced New item
 *  form from its prompt and current art, and keeping the result replaces it (outfits follow; the old one goes to Trash). */
export function redrawItem(it: Item) {
	const p = store.project;
	openNewItem(it.slot, {
		slot: it.slot,
		prompt: it.prompt,
		name: it.name,
		...(p ? { referenceFrom: itemReferenceFrame(p, it) } : {}),
		supersedes: { id: it.id, name: it.name }
	});
}
