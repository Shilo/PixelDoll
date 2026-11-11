import type { Manifest, Preset } from '../store/manifest.ts';
import type { CopyCandidate } from './copy.ts';

/** Free approximate fit of another character's item onto a different body (main_hand / off_hand re-anchored by joints),
 *  without generating. Not available yet: always null, so the item must be made for the target. A candidate is kept like an
 *  exact copy, with a "Needs a look" status. */
export async function refitShared(
	_source: Manifest,
	_itemId: string,
	_variants: Preset['variants'],
	_target: Manifest
): Promise<CopyCandidate | null> {
	return null;
}
