<script lang="ts">
	// Full screen and More, always the last two controls of whichever bar is on top (the top bar, or the New character
	// screen that covers it), in the same place on every screen.
	import { t } from 'svelte-whisper';
	import FullscreenButton from './FullscreenButton.svelte';
	import { Ellipsis } from './icons.ts';
	import { activityStatus } from './activityStatus.svelte.ts';
	import { cloudNeedsAttention } from './cloudAttention.svelte.ts';
	// Activity lives in More on every screen, so More carries its status: a dot while work runs, a warning dot when
	// stopped work needs attention (which wins), and the same status for screen readers.
	const activity = $derived(
		activityStatus.stopped ? 'stopped' : activityStatus.busy ? 'busy' : undefined
	);
	const statusId = $props.id();
	// Settings (in More) holds Cloud Save, so More also carries its cue when it needs the user.
	const cloud = $derived(cloudNeedsAttention());
	const describedBy = $derived(
		[activity && statusId, cloud && `${statusId}-cloud`].filter(Boolean).join(' ') || undefined
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
		data-cloud={cloud || undefined}
		aria-describedby={describedBy}
		popovertarget="experience-options"><Ellipsis size={20} /></button
	>
	{#if activity}<span id={statusId} class="sr"
			>{t(activity === 'stopped' ? 'toolbar.activityAttention' : 'toolbar.activityRunning')}</span
		>{/if}
	{#if cloud}<span id="{statusId}-cloud" class="sr">{t('cloudSave.attention')}</span>{/if}
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
	[data-activity],
	[data-cloud] {
		position: relative;
	}
	:is([data-activity], [data-cloud])::after {
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
