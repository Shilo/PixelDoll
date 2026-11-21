<script lang="ts">
	import type { Snippet } from 'svelte';
	import { app } from '../lib/app.svelte.ts';
	import { ChevronRight, Gauge } from './icons.ts';
	import { formatNumber, formatPercent, t } from 'svelte-whisper';

	let {
		label,
		compact = false,
		detailed = false,
		actions
	}: { label?: string; compact?: boolean; detailed?: boolean; actions?: Snippet } = $props();
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
		return { used: total - remaining, total, remaining, exhausted: remaining === 0 };
	});
	const creditBalance = $derived(balance?.credits?.usd);
	const credits = $derived(
		typeof creditBalance === 'number' &&
			Number.isFinite(creditBalance) &&
			(detailed || usage?.exhausted || ((!compact || !usage) && creditBalance > 0))
			? formatNumber(creditBalance, { style: 'currency', currency: 'USD' })
			: null
	);
</script>

{#if detailed}
	<div class="usage detailed-usage">
		{#if actions}
			<div class="usage-heading">
				<h4 class="settings-label">{t('usage.title')}</h4>
				{@render actions()}
			</div>
		{:else}
			<h4 class="settings-label">{t('usage.title')}</h4>
		{/if}
		{#if balance?.subscription?.plan}<span class="bu-muted">{balance.subscription.plan}</span>{/if}
		{#if usage}
			<div class="usage-stat">
				<span>{t('usage.generations')}</span>
				<span class="bu-number">{formatNumber(usage.used)} / {formatNumber(usage.total)}</span>
			</div>
			<progress
				class="bu-progress"
				value={usage.used}
				max={usage.total}
				aria-label={t('usage.generations')}
			></progress>
			<div class="usage-stat bu-muted bu-small">
				<span>{t('usage.used', { percent: formatPercent(usage.used / usage.total, 1) })}</span>
				<span>{t('usage.remaining', { n: formatNumber(usage.remaining) })}</span>
			</div>
		{:else}
			<span class="bu-muted bu-small"
				>{t(app.balance || app.balanceError ? 'usage.unavailable' : 'usage.checking')}</span
			>
		{/if}
		{#if credits !== null}
			<div class="usage-stat">
				<span>{t('usage.creditBalance')}</span><span class="bu-number">{credits}</span>
			</div>
		{/if}
	</div>
{:else}
	<span class={['usage', { compact }]}>
		<span class="summary">
			<span class="label"><Gauge size={18} /><span>{label ?? t('usage.title')}</span></span>
			{#if usage}
				<span class="count bu-small bu-number">
					{formatNumber(usage.used)}<span class="bu-muted">{` / ${formatNumber(usage.total)}`}</span
					>
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
						<span class="credits bu-small bu-muted bu-number"
							>{t('usage.credits', { credits })}</span
						>
					{/if}
				</span>
			{/if}
		</span>
	</span>
{/if}

<style>
	.detailed-usage {
		display: grid;
		gap: 8px;
	}
	.usage-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.detailed-usage progress {
		width: 100%;
	}
	.usage-stat {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
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
