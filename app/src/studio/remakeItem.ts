import type { Item, Manifest } from '../lib/store/manifest.ts';
import { extendable } from './movePricing.ts';
import { openCopyForSelf, openNewItem } from './state.svelte.ts';

/** An item without its own standing design cannot be posed onto more moves, so it is made again for this character
 *  in the priced New item form: a copy from another body keeps its art as the reference, an own item its prompt. */
export function remakeAction(m: Manifest, it: Item) {
	const copyOnly = !!it.copiedFrom && !extendable(m, it.id);
	return {
		copyOnly,
		label: copyOnly ? ('itemMenu.remake' as const) : ('stageNote.makeItAgain' as const),
		open: () =>
			copyOnly ? openCopyForSelf(it) : openNewItem(it.slot, { slot: it.slot, prompt: it.prompt })
	};
}
