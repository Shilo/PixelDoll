<script lang="ts">
	// Full screen and More, always the last two controls of whichever bar is on top (the top bar, or the New character
	// screen that covers it), in the same place on every screen.
	import { t } from 'svelte-whisper';
	import FullscreenButton from './FullscreenButton.svelte';
	import { Ellipsis } from './icons.ts';
	import { activityStatus } from './activityStatus.svelte.ts';
	// Work running or needing attention: bars without an Activity slot (phones, New character) mark More instead.
	const activity = $derived(
		activityStatus.busy ? 'busy' : activityStatus.stopped ? 'stopped' : undefined
	);
</script>

<span class="global-actions">
	<FullscreenButton />
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label={t('toolbar.moreOptions')}
		title={t('toolbar.moreOptions')}
		data-popover-fallback="share-popover"
		data-activity={activity}
		popovertarget="experience-options"><Ellipsis size={20} /></button
	>
</span>

<style>
	.global-actions {
		display: flex;
		align-items: center;
		flex: none;
	}
	/* The same 44px targets in the top bar and in the New character screen's bar. */
	.global-actions :global(.bu-action) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		padding: 0;
	}
	:global(:is(.phone-layout, dialog.sheet)) [data-activity] {
		position: relative;
	}
	:global(:is(.phone-layout, dialog.sheet)) [data-activity]::after {
		content: '';
		position: absolute;
		top: 9px;
		right: 9px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--bu-accent);
	}
	:global(:is(.phone-layout, dialog.sheet)) [data-activity='stopped']::after {
		background: var(--bu-danger);
	}
</style>
