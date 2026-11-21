<script lang="ts" generics="Option extends PaidOption">
	// What a stopped paid attempt bought, why it stopped and every way on, each priced from the request cache: paid results are
	// shown and reusable, and only what is still missing is charged again.
	import Sprite from './Sprite.svelte';
	import { CircleAlert } from './icons.ts';
	import type { PaidOption, PaidReview } from '../lib/pixellab/paid-results.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import { downloadPaidResults } from './download.svelte.ts';
	import { ui } from './state.svelte.ts';
	import { formatNumber, t } from 'svelte-whisper';

	let {
		review,
		name,
		busy = false,
		blocked = false,
		onchoose
	}: {
		review: PaidReview & { options: Option[] };
		/** Names the download. */
		name: string;
		busy?: boolean;
		/** A paid option is unavailable (no key, plan tier or another tab manages the queue); free ones stay available. */
		blocked?: boolean;
		onchoose: (option: Option) => void;
	} = $props();
	const STATE = {
		ready: 'paidReview.state.ready',
		pending: 'paidReview.state.pending',
		running: 'paidReview.state.running',
		failed: 'paidReview.state.failed'
	} as const;
	// Choices wait for requests still at PixelLab: their results decide what each choice costs and whether the frame can change.
	const running = $derived(review.views.some((view) => view.state === 'running'));
	const k = $derived(Math.max(1, Math.floor(ui.dpr * (ui.size === 'compact' ? 1 : 1.5))));
	const cost = (gens: number) =>
		gens
			? t('moves.estimate', {
					gens: formatNumber(gens, { maximumFractionDigits: 1 })
				})
			: t('paidReview.free');
</script>

<section class="paid-review" aria-label={t('paidReview.title')}>
	<p class="small">
		{t('paidReview.spent', { gens: formatNumber(review.spent, { maximumFractionDigits: 1 }) })}
	</p>
	{#each review.views as view, index (index)}
		<div class="paid-view">
			<span class="small" style="font-weight:600"
				>{displayNestedMessage(view.label)} · {t(STATE[view.state])}</span
			>
			{#if view.frames.length}<div class="paid-frames">
					{#each view.frames as frame, i (i)}<Sprite
							img={frame.img}
							{k}
							checker
							label={displayNestedMessage(frame.label)}
						/>{/each}
				</div>{/if}
			{#each view.notes as note, i (i)}<p class="notice small" class:warn={view.state !== 'ready'}>
					{#if view.state === 'failed'}<CircleAlert size={14} />{/if}{displayNestedMessage(note)}
				</p>{/each}
		</div>
	{/each}
	{#if running}<p class="muted small" role="status">{t('paidReview.waiting')}</p>{/if}
	<div class="paid-actions">
		{#each review.options as option (option.id)}<button
				class="bu-action btn"
				class:primary={option.primary}
				data-variant={option.primary ? 'primary' : 'outline'}
				disabled={busy || running || (option.paid && blocked)}
				onclick={() => onchoose(option)}
				>{displayNestedMessage(option.label)} <span class="cost">{cost(option.gens)}</span></button
			>{/each}
		{#if review.recordIds.length}<button
				class="bu-action btn"
				data-variant="outline"
				onclick={() => void downloadPaidResults(review.recordIds, name)}
				>{t('paidReview.download')}</button
			>{/if}
	</div>
	{#each review.options.filter((option) => option.detail) as option (option.id)}<p
			class="muted small"
		>
			{displayNestedMessage(option.detail!)}
		</p>{/each}
</section>

<style>
	.paid-review,
	.paid-view {
		display: grid;
		gap: 6px;
	}
	.paid-frames,
	.paid-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.paid-actions {
		gap: 8px;
	}
</style>
