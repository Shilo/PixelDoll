<script lang="ts">
	import { t } from 'svelte-whisper';
	import { Download, Play, X } from './icons.ts';

	let {
		step,
		move,
		heading = $bindable(),
		onskip,
		onaction
	}: {
		step: 'gear' | 'move' | 'export';
		move: string;
		heading?: HTMLHeadingElement;
		onskip: () => void;
		onaction: () => void;
	} = $props();
</script>

<section
	class="quickstart bu-floating"
	class:followup={step !== 'gear'}
	aria-label={t('welcome.quickstart')}
>
	<div class="quickstart-top">
		<div class="quickstart-copy" role="status">
			<h2 bind:this={heading} tabindex="-1">
				{t(
					step === 'gear' ? 'welcome.gear' : step === 'move' ? 'welcome.motion' : 'welcome.layers'
				)}
			</h2>
			<p class="bu-muted">
				{t(
					step === 'gear'
						? 'welcome.gearHint'
						: step === 'move'
							? 'welcome.motionHint'
							: 'welcome.layersHint'
				)}
			</p>
		</div>
		<button
			type="button"
			class="bu-action quickstart-close"
			data-variant="quiet"
			aria-label={t('welcome.dismissQuickstart')}
			title={t('welcome.dismissQuickstart')}
			onclick={onskip}><X size={16} aria-hidden="true" /></button
		>
	</div>
	{#if step !== 'gear'}
		<button
			type="button"
			class="bu-action quickstart-action"
			data-variant="outline"
			aria-haspopup={step === 'export' ? 'dialog' : undefined}
			onclick={onaction}
		>
			{#if step === 'move'}
				<Play size={16} aria-hidden="true" />{t('welcome.playMove', { move })}
			{:else}
				<Download size={16} aria-hidden="true" />{t('welcome.exportDemo')}
			{/if}
		</button>
	{/if}
</section>

<style>
	.quickstart {
		display: grid;
		gap: 8px;
		padding: 12px;
		margin: 5px 0 12px;
	}
	.quickstart-top {
		display: flex;
		align-items: flex-start;
		gap: 4px;
	}
	.followup {
		flex: none;
		margin: 0 0 8px;
	}
	.quickstart-copy {
		flex: 1;
		min-width: 0;
	}
	h2 {
		margin: 0 0 3px;
		font-size: var(--fs-md);
		line-height: 1.3;
		font-weight: 600;
		text-wrap: balance;
	}
	p {
		margin: 0;
		font-size: var(--fs-sm);
		line-height: 1.4;
		text-wrap: pretty;
	}
	.quickstart-close {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		padding: 0;
		margin: -8px -8px 0 0;
	}
	.quickstart-action {
		justify-self: start;
		min-height: 44px;
		max-width: 100%;
		gap: 8px;
		white-space: normal;
	}
	@media (max-width: 360px) {
		.quickstart:not(.followup) {
			margin-block: 2px 6px;
			padding: 8px;
		}
	}
</style>
