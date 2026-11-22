<script lang="ts">
	// The one place a person approves paid agent work: generations for the whole task, not each call.
	import { formatNumber, t } from 'svelte-whisper';
	import ConfirmDialog from '../ConfirmDialog.svelte';
	import { usdText } from '../displayCost.ts';
	let {
		generations,
		usd,
		purpose,
		onanswer
	}: {
		generations: number;
		usd: number;
		/** The agent's own words: shown as a quote, never as the app's. */
		purpose: string;
		onanswer: (allowed: boolean) => void;
	} = $props();
	const count = $derived(formatNumber(generations, { maximumFractionDigits: 2 }));
</script>

{#snippet allow(label: string, disabled: boolean, activate: () => void)}
	<button class="bu-btn" data-variant="primary" {disabled} onclick={activate}>{label}</button>
{/snippet}

<ConfirmDialog
	title={t('agentBudget.title')}
	action={t('agentBudget.allow')}
	cancel={t('agentBudget.deny')}
	actionButton={allow}
	onconfirm={() => onanswer(true)}
	oncancel={() => onanswer(false)}
>
	<p>{t('agentBudget.body', { usd: usdText(usd), count })}</p>
	{#if purpose.trim()}
		<p class="purpose">
			<span class="label">{t('agentBudget.reason')}</span>
			<q>{purpose.trim().slice(0, 300)}</q>
		</p>
	{/if}
	<p class="note">{t('agentBudget.note')}</p>
</ConfirmDialog>

<style>
	.purpose {
		margin-top: 12px;
		text-align: left;
		overflow-wrap: anywhere;
	}
	.label {
		display: block;
		font-size: 12px;
	}
	.note {
		margin-top: 12px;
		font-size: 12px;
	}
</style>
