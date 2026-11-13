<script lang="ts">
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { pwa, requestUpdate } from '../lib/pwa.ts';
	import { app } from '../lib/app.svelte.ts';
	import { updateNotice } from './updateNotice.svelte.ts';
	let { paused = false, ondismiss }: { paused?: boolean; ondismiss: () => void } = $props();
	$effect(() => {
		const phase = updateNotice.phase;
		if (!updateNotice.visible || (!$pwa.ready && !$pwa.error)) return;
		if (paused) {
			updateNotice.pause(phase);
			return;
		}
		// The shared clock survives sheet remounts. Only readiness or a new release starts a fresh window.
		const timer = setTimeout(() => updateNotice.expire(phase), updateNotice.delay(phase));
		return () => clearTimeout(timer);
	});
	function dismiss() {
		ondismiss();
		updateNotice.dismiss();
	}
</script>

{#if $pwa.available && updateNotice.visible}
	<Notice
		class="bu-toast"
		title={`Update to v${$pwa.available.version}`}
		tone="info"
		live
		onactivate={$pwa.ready ? requestUpdate : undefined}
		ondismiss={dismiss}
	>
		{#if $pwa.ready}Ready to update. Reloads this tab; saved work stays. View and undo history
			reset.
		{:else if !$pwa.error}<span class="bu-spinner" aria-hidden="true"></span>{' '}Downloading
			update...{/if}
		{#if $pwa.ready && app.key && !app.remembered}Reconnect PixelLab after updating.{/if}
		{#if $pwa.error}<span>{$pwa.error}</span>{/if}
		Update later in More options.
	</Notice>
{/if}
