<script lang="ts">
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { pwa, requestUpdate } from '../lib/pwa.ts';
	import { updateNotice } from './updateNotice.svelte.ts';
	import PendingIndicator from './PendingIndicator.svelte';
	let { paused = false, ondismiss }: { paused?: boolean; ondismiss: () => void } = $props();
	$effect(() => {
		const phase = updateNotice.phase;
		if (!updateNotice.visible || $pwa.reloading || (!$pwa.ready && !$pwa.error)) return;
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

{#snippet pendingIndicator()}<PendingIndicator />{/snippet}

{#if $pwa.available && updateNotice.visible}
	<Notice
		class="bu-toast"
		title={$pwa.ready || $pwa.error ? `Update to v${$pwa.available.version}` : undefined}
		tone="info"
		indicator={$pwa.reloading || (!$pwa.ready && !$pwa.error) ? pendingIndicator : undefined}
		live
		onactivate={$pwa.ready && !$pwa.reloading ? requestUpdate : undefined}
		ondismiss={$pwa.reloading ? undefined : dismiss}
	>
		{#if $pwa.reloading}Ready to update. Reloading...{:else if $pwa.ready}Ready to update.{:else if !$pwa.error}Downloading
			update...{/if}
		{#if $pwa.error && !$pwa.reloading}<span>{$pwa.error}</span>{/if}
	</Notice>
{/if}
