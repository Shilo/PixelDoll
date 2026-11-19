import { formatNumber, t } from 'svelte-whisper';
import type { RecordedCost } from '../lib/store/generation.ts';

/**
 * PixelLab reports dollars to a tenth of a cent, so keep three decimals, or four
 * below $0.001 where three would hide a real charge.
 */
export function usdText(value: number): string {
	const digits = value < 0.001 ? 4 : 3;
	return formatNumber(value, {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}

export function displayCost(cost: RecordedCost): string {
	return (
		[
			cost.generations
				? t('generationDetails.gens', {
						value: formatNumber(cost.generations, { maximumFractionDigits: 2 })
					})
				: '',
			cost.usd ? usdText(cost.usd) : '',
			cost.unknown ? t('generationDetails.unknownCount', { count: cost.unknown }) : ''
		]
			.filter(Boolean)
			.join(' · ') || (cost.calls ? t('common.free') : '')
	);
}
