<!-- Jump and Mount for the live views. Touch shows round thumb buttons by the right (aim) thumb; a mouse shows a compact
     icon bar with shortcut tooltips. Neither ever takes keyboard focus: Space and M stay the stage's (gameAction.ts). A
     press in the air does nothing, without dimming the buttons on every jump. -->
<script lang="ts">
	import { t } from 'svelte-whisper';
	import { gameAction } from '../../lib/input/gameAction.ts';
	import TouchActionButton from '../../lib/input/TouchActionButton.svelte';
	import { ArrowBigUp, PawPrint } from '../icons.ts';

	let {
		touch,
		mounted,
		onjump,
		onmount
	}: {
		touch: boolean;
		mounted: boolean;
		onjump: () => void;
		onmount: () => void;
	} = $props();
	const jump = $derived(t('liveViews.jump')),
		mount = $derived(t('liveViews.mount'));
	const space = $derived(t('liveViews.spaceKey'));
</script>

{#if touch}
	<div class="game-touch" role="group" aria-label={t('liveViews.actions')}>
		<TouchActionButton label={mount} size={48} pressed={mounted} onactivate={onmount}
			><PawPrint aria-hidden="true" /></TouchActionButton
		>
		<TouchActionButton label={jump} size={60} onactivate={onjump}
			><ArrowBigUp aria-hidden="true" /></TouchActionButton
		>
	</div>
{:else}
	<div class="game-bar bu-floating" role="group" aria-label={t('liveViews.actions')}>
		<button
			type="button"
			class="bu-action"
			data-variant="quiet"
			tabindex="-1"
			aria-label={jump}
			aria-keyshortcuts="Space"
			title={t('liveViews.withShortcut', { action: jump, key: space })}
			{@attach gameAction(() => onjump())}><ArrowBigUp size={18} aria-hidden="true" /></button
		>
		<button
			type="button"
			class="bu-action"
			data-variant="quiet"
			tabindex="-1"
			aria-label={mount}
			aria-pressed={mounted}
			aria-keyshortcuts="M"
			title={t('liveViews.withShortcut', { action: mount, key: 'M' })}
			{@attach gameAction(() => onmount())}><PawPrint size={18} aria-hidden="true" /></button
		>
	</div>
{/if}

<style>
	.game-touch {
		position: fixed;
		z-index: 4;
		right: calc(var(--stage-right, 0px) + max(16px, env(safe-area-inset-right)));
		bottom: calc(var(--stage-bottom, 0px) + max(20px, env(safe-area-inset-bottom)));
		display: flex;
		align-items: flex-end;
		gap: 20px;
	}
	.game-bar {
		position: fixed;
		z-index: 4;
		/* Centered on the stage, between any side panels. */
		left: calc((var(--stage-left, 0px) + 100vw - var(--stage-right, 0px)) / 2);
		translate: -50% 0;
		bottom: calc(var(--stage-bottom, 0px) + 16px);
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
	}
	.game-bar .bu-action {
		min-inline-size: 40px;
		min-block-size: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.game-bar .bu-action:global([data-pressed]) {
		scale: 0.94;
	}
</style>
