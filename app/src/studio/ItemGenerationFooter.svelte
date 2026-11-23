<script lang="ts">
	import { formatNumber, t } from 'svelte-whisper';

	// The priced submit row under an item picker, with an optional way to leave without spending.
	let {
		count,
		gens,
		disabled,
		onsubmit,
		dismiss
	}: {
		/** Items chosen. */
		count: number;
		/** Their combined estimate. */
		gens: number;
		disabled: boolean;
		onsubmit: () => void;
		dismiss?: { label: string; disabled?: boolean; onclick: () => void };
	} = $props();
	const costId = $props.id();
</script>

<div class="checkpoint-footer">
	<p class="muted small" id={costId}>{t('moveSheet.costNotice')}</p>
	<div class="checkpoint-actions">
		{#if dismiss}<button
				class="bu-action btn checkpoint-dismiss"
				data-variant="quiet"
				disabled={dismiss.disabled}
				onclick={dismiss.onclick}>{dismiss.label}</button
			>{/if}
		<b class="checkpoint-total" aria-live="polite" aria-atomic="true"
			>{t('moveSheet.checkpoint.total', { gens: formatNumber(gens) })}</b
		>
		<button
			class="bu-action btn primary checkpoint-primary"
			data-variant="primary"
			{disabled}
			aria-describedby={costId}
			onclick={onsubmit}
		>
			{count
				? t('moveSheet.checkpoint.animateCount', { count, n: formatNumber(count) })
				: t('moveSheet.checkpoint.titleItems')}
		</button>
	</div>
</div>

<style>
	.checkpoint-footer {
		display: grid;
		gap: 8px;
		width: 100%;
	}
	.checkpoint-footer p {
		margin: 0;
	}
	.checkpoint-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 6px 12px;
		width: 100%;
	}
	/* Leaving sits on the left, apart from the price and the paid action. */
	.checkpoint-dismiss {
		margin-inline-end: auto;
	}
	.checkpoint-total {
		font-variant-numeric: tabular-nums;
	}
	.checkpoint-actions:not(:has(.checkpoint-dismiss)) .checkpoint-total {
		margin-inline-end: auto;
	}
	.checkpoint-actions button {
		min-block-size: 44px;
		max-inline-size: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
	}
	:global(dialog.sheet.bottom) .checkpoint-actions .btn.checkpoint-primary {
		width: auto;
	}
</style>
