import { t } from 'svelte-whisper';
import { app } from '../lib/app.svelte.ts';
import { displayError } from '../lib/i18n.ts';
import { tierDecision } from '../lib/pixellab/plans.ts';
import type { Manifest } from '../lib/store/manifest.ts';
import { moveMinimumTier, type MoveSpec } from './create.ts';

/** The plan tier the chosen requests need, and why they cannot start on this plan. */
export function itemOfferAccess(
	m: Manifest | undefined,
	specs: MoveSpec[]
): { minimumTier: number; error: string } {
	try {
		const minimumTier = m ? Math.max(0, ...specs.map((spec) => moveMinimumTier(m, spec))) : 0;
		return {
			minimumTier,
			error:
				tierDecision(app.balance, { required: minimumTier }).kind === 'required'
					? t('moveSheet.checkpoint.tier')
					: ''
		};
	} catch (cause) {
		return { minimumTier: 0, error: displayError(cause) };
	}
}
