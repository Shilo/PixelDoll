import { SvelteMap } from 'svelte/reactivity';
import type { Img } from '../../lib/image/png.ts';
import type { Frame } from '../../lib/compose/compose.ts';

// One still per character, shared by every thumbnail (cast, its reflection, the list and the name menu): stepping to
// another character or opening the menu reuses it instead of reading and decoding the character again, so nothing blinks.
// look is the listed revision it was drawn from; a newer one redraws it in the background, keeping the old one shown.
export const stills = new SvelteMap<string, { look: string; image: Img | null; frame: Frame }>();
// Per character, the newest write: a live look or a read. Only the newest read may publish, and none after a live look.
// Plain on purpose: finishing a read must not rerun the effects (a failed read would retry in a loop).
export const newest = new Map<string, { look: string; reading: boolean }>();

/** Drop the stills of characters no longer listed (deleted here or in another tab); a read still running for one is
 *  discarded when it finishes. Call only with a complete listing. */
export function keepThumbnails(listed: ReadonlySet<string>) {
	for (const id of [...stills.keys(), ...newest.keys()])
		if (!listed.has(id)) {
			stills.delete(id);
			newest.delete(id);
		}
}
