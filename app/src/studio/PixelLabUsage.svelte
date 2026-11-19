<script lang="ts">
	import type { Snippet } from 'svelte';
	import { app } from '../lib/app.svelte.ts';
	import { ExternalLink, Gauge } from './icons.ts';

	let { compact = true, actions }: { compact?: boolean; actions?: Snippet } = $props();
	const countFormat = new Intl.NumberFormat('en-US');
	const percentFormat = new Intl.NumberFormat('en-US', {
		style: 'percent',
		maximumFractionDigits: 1
	});
	const creditFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
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
			? creditFormat.format(creditBalance)
			: null
	);
</script>

<span class={['usage', { compact }]}>
	<span class="summary">
		<span class="label"><Gauge size={18} /><span>PixelLab usage</span></span>
		{#if usage}
			<span class="count bu-small bu-number">
				{countFormat.format(usage.used)}<span class="bu-muted"
					>{` / ${countFormat.format(usage.total)}`}</span
				>
			</span>
		{/if}
		<span class="actions">
			{#if compact}<ExternalLink size={16} />{:else}{@render actions?.()}{/if}
		</span>
		{#if !usage && (app.key || !compact)}
			<span class="detail bu-small bu-muted">
				{!app.key
					? 'Not connected'
					: app.balance || app.balanceError || app.keyRejected
						? 'Usage unavailable'
						: 'Checking usage…'}
			</span>
		{/if}
		{#if usage || credits !== null}
			<span class="meter">
				{#if usage}
					<progress class="bu-progress" value={usage.used} max={usage.total} aria-hidden="true"
					></progress>
					<span class="bu-small bu-muted bu-number">
						{percentFormat.format(usage.exhausted ? 1 : Math.min(0.999, usage.used / usage.total))} used
					</span>
				{/if}
				{#if credits !== null}
					{#if usage}<span class="bu-small bu-muted" aria-hidden="true">·</span>{/if}
					<span class="credits bu-small bu-muted"
						><span class="bu-number">{credits}</span> credits left</span
					>
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
