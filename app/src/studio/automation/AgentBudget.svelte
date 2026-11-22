<script lang="ts">
	// While an agent holds an approved budget, the person always sees what is left and can end it.
	import { formatNumber, t } from 'svelte-whisper';
	import { usdText } from '../displayCost.ts';
	import { budgetView, endBudget, rateUsd } from './budget.ts';
</script>

{#if $budgetView.active}
	<div class="agent-budget bu-floating" role="status">
		<span
			>{t('agentBudget.left', {
				usd: usdText(rateUsd($budgetView.remaining)),
				count: formatNumber($budgetView.remaining, { maximumFractionDigits: 2 })
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
