import { formatNumber, t } from 'svelte-whisper';
import type { StateGenerationCost } from './stateGenerationPlan.ts';

export function stateCostText(cost: StateGenerationCost) {
	const low = formatNumber(cost.minGenerations);
	const high = formatNumber(cost.maxGenerations);
	if (cost.kind === 'fixed')
		return cost.maxGenerations === 1
			? t('stateGeneration.fixedCostOne')
			: t('stateGeneration.fixedCost', { generations: high });
	return t('moves.estimate', { gens: low === high ? high : `${low}–${high}` });
}
