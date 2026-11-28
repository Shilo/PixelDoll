<script lang="ts">
	// Full screen and More, always the last two controls of whichever bar is on top (the top bar, or the New character
	// screen that covers it), in the same place on every screen.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import AudioSettingsButton from './AudioSettingsButton.svelte';
	import FullscreenButton from './FullscreenButton.svelte';
	import { Ellipsis } from './icons.ts';
	import { activityStatus } from './activityStatus.svelte.ts';
	// Activity lives in More on every screen, so More carries its status: a dot while work runs, a warning dot when
	// stopped work needs attention (which wins), and the same status for screen readers. Work the Moves and States
	// tabs already mark is left to their dots.
	const activity = $derived(activityStatus.elsewhere);
	const statusId = $props.id();
	/** A control that belongs between Full screen and More, which stays last (the Studio's panel toggle). */
	let { showAudio = true, beforeMore }: { showAudio?: boolean; beforeMore?: Snippet } = $props();
</script>

<span class="global-actions">
	{#if showAudio}<AudioSettingsButton />{/if}
	<FullscreenButton />
	{@render beforeMore?.()}
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label={t('toolbar.moreOptions')}
		title={t('toolbar.moreOptions')}
		data-popover-fallback="share-popover"
		data-trail="toolbar.more"
		data-activity={activity}
		aria-describedby={activity ? statusId : undefined}
		popovertarget="experience-options"><Ellipsis size={20} /></button
	>
	{#if activity}<span id={statusId} class="sr"
			>{t(activity === 'stopped' ? 'toolbar.activityAttention' : 'toolbar.activityRunning')}</span
		>{/if}
</span>

<style>
	.global-actions {
		display: flex;
		align-items: center;
		flex: none;
		/* The same gap as the top bar's other action groups. */
		gap: 4px;
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
	[data-activity] {
		position: relative;
	}
	/* The same 6px dot as the Moves and States tabs, the same 4px after the icon's last dot (the 20px Ellipsis draws to
	   7.5px right of its center), and centered on it. */
	[data-activity]::after {
		content: '';
		position: absolute;
		top: 50%;
		left: calc(50% + 7.5px + 4px);
		width: 6px;
		height: 6px;
		margin-top: -3px;
		border-radius: 50%;
		background: var(--bu-accent);
	}
	[data-activity='stopped']::after {
		background: var(--bu-danger);
	}
</style>
