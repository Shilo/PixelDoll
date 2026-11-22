<script lang="ts">
	// While an agent holds an approved budget, the person always sees what is left and can end it.
	import { formatNumber, t } from 'svelte-whisper';
	import { app } from '../../lib/app.svelte.ts';
	import { usdText } from '../displayCost.ts';
	import type { BudgetState } from './contract.ts';
	import { checkBudget, endBudget, rateUsd, watchBudget } from './budget.ts';
	let state = $state<BudgetState | null>(null);
	$effect(() => watchBudget((next) => (state = next)));
	// A new or forgotten PixelLab connection ends the budget at once, not at the agent's next call.
	$effect(() => {
		void app.key;
		checkBudget();
	});
</script>

{#if state && state.remaining > 0}
	<div class="agent-budget bu-floating" role="status">
		<span
			>{t('agentBudget.left', {
				usd: usdText(rateUsd(state.remaining)),
				count: formatNumber(state.remaining, { maximumFractionDigits: 2 })
			})}</span
		>
		<button class="bu-btn" data-variant="ghost" onclick={endBudget}>{t('agentBudget.end')}</button>
	</div>
{/if}

<style>
	.agent-budget {
		position: fixed;
		top: max(8px, env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		z-index: 2147482000;
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: calc(100vw - 32px);
		padding: 2px 2px 2px 12px;
		border-radius: 999px;
		font-size: 13px;
	}
	span {
		overflow-wrap: anywhere;
	}
</style>
