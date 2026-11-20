<script lang="ts">
	import type { Snippet } from 'svelte';
	import { app } from '../lib/app.svelte.ts';
	import { ChevronRight, Gauge } from './icons.ts';
	import { formatNumber, formatPercent, t } from 'svelte-whisper';

	let {
		label,
		compact = false,
		actions
	}: { label?: string; compact?: boolean; actions?: Snippet } = $props();
	const balance = $derived(app.keyRejected || app.balanceError ? null : app.balance);
	const usage = $derived.by(() => {
		if (!balance?.subscription) return null;
		const { generations: remaining, total, status } = balance.subscription;
		if (status === 'expired' || status === 'none') return null;
		if (
			!Number.isFinite(total) ||
			!Number.isFinite(remaining) ||
			total <= 0 ||
			remaining < 0 ||
			remaining > total
		)
			return null;
		return { used: total - remaining, total, exhausted: remaining === 0 };
	});
	const creditBalance = $derived(balance?.credits?.usd);
	const credits = $derived(
		typeof creditBalance === 'number' &&
			Number.isFinite(creditBalance) &&
			(usage?.exhausted || ((!compact || !usage) && creditBalance > 0))
			? formatNumber(creditBalance, { style: 'currency', currency: 'USD' })
			: null
	);
</script>

<span class={['usage', { compact }]}>
	<span class="summary">
		<span class="label"><Gauge size={18} /><span>{label ?? t('usage.title')}</span></span>
		{#if usage}
			<span class="count bu-small bu-number">
				{formatNumber(usage.used)}<span class="bu-muted">{` / ${formatNumber(usage.total)}`}</span>
			</span>
		{/if}
		<span class="actions">
			{#if compact}<ChevronRight size={16} aria-hidden="true" />{:else}{@render actions?.()}{/if}
		</span>
		{#if !usage && (app.key || !compact)}
			<span class="detail bu-small bu-muted">
				{!app.key
					? t('usage.notConnected')
					: app.balance || app.balanceError || app.keyRejected
						? t('usage.unavailable')
						: t('usage.checking')}
			</span>
		{/if}
		{#if usage || credits !== null}
			<span class="meter">
				{#if usage}
					<progress class="bu-progress" value={usage.used} max={usage.total} aria-hidden="true"
					></progress>
					<span class="bu-small bu-muted bu-number">
						{t('usage.used', {
							percent: formatPercent(
								usage.exhausted ? 1 : Math.min(0.999, usage.used / usage.total),
								1
							)
						})}
					</span>
				{/if}
				{#if credits !== null}
					{#if usage}<span class="bu-small bu-muted" aria-hidden="true">·</span>{/if}
					<span class="credits bu-small bu-muted bu-number">{t('usage.credits', { credits })}</span>
				{/if}
			</span>
		{/if}
	</span>
</span>

<style>
	.usage {
		display: block;
		width: 100%;
		min-width: 0;
		container-type: inline-size;
	}
	.summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 4px 8px;
	}
	.label,
	.meter {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.label :global(svg) {
		flex: none;
	}
	.compact .label {
		column-gap: var(--menu-row-gap, 8px);
	}
	.compact .label > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count,
	.meter {
		white-space: nowrap;
	}
	.count {
		grid-column: 2;
		grid-row: 1;
	}
	.actions {
		display: flex;
		grid-column: 3;
		grid-row: 1;
	}
	.meter,
	.detail {
		grid-column: 1 / -1;
	}
	.credits {
		margin-inline-start: auto;
	}
	.meter progress {
		flex: 1;
		min-width: 0;
	}
	.usage:not(.compact) .detail {
		margin-inline-start: 26px;
	}
	@container (max-width: 21rem) {
		.usage:not(.compact) .count {
			grid-column: 1 / -1;
			grid-row: 2;
			margin-inline-start: 26px;
		}
	}
</style>
