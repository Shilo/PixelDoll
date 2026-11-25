<script lang="ts">
	import { t } from 'svelte-whisper';
	import { Notice } from '@shilo/bronze-ui/svelte';
	import { pwa, requestUpdate } from '../lib/pwa.ts';
	import { displayPwaError } from './pwaText.ts';
	import { updateNotice } from './updateNotice.svelte.ts';
	import PendingIndicator from './PendingIndicator.svelte';
	let { ondismiss }: { ondismiss: () => void } = $props();
	function dismiss() {
		ondismiss();
		updateNotice.dismiss();
	}
</script>

{#snippet pendingIndicator()}<PendingIndicator />{/snippet}

{#if $pwa.available && updateNotice.visible}
	<Notice
		class="bu-toast"
		title={t('toolbar.updateToVVersion', { version: $pwa.available.version })}
		tone="info"
		indicator={$pwa.reloading || (!$pwa.ready && !$pwa.error) ? pendingIndicator : undefined}
		live
		onactivate={$pwa.ready && !$pwa.reloading ? () => requestUpdate() : undefined}
		ondismiss={$pwa.reloading ? undefined : dismiss}
	>
		{#if $pwa.reloading}{t('pwaNotice.readyToUpdateReloading')}{:else if $pwa.ready}{t(
				'pwaNotice.readyToUpdate'
			)}{:else if !$pwa.error}{t('pwaNotice.downloadingUpdate')}{/if}
		{#if $pwa.error && !$pwa.reloading}<span>{displayPwaError($pwa.error)}</span>{/if}
	</Notice>
{/if}
