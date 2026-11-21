<script lang="ts">
	import { t } from 'svelte-whisper';
	import { app, refreshBalance } from '../lib/app.svelte.ts';
	import { KeyRound, RefreshCw } from './icons.ts';
	import { openerLabel } from './openerLabel.ts';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openSettingsAccount } from './settingsNavigation.svelte.ts';

	const connected = $derived(Boolean(app.key && !app.keyRejected));
	const connectionAction = $derived(
		t(
			app.keyRejected
				? 'connectSheet.reconnect'
				: connected
					? 'toolbar.pixelLabAccount'
					: 'toolbar.connectPixelLab2'
		)
	);
	let refreshing = $state(false);
	async function refresh() {
		if (refreshing || !connected) return;
		refreshing = true;
		try {
			await refreshBalance({ label: 'Refresh balance', background: false });
		} finally {
			refreshing = false;
		}
	}
</script>

<div data-setting="connection" tabindex="-1">
	<p class="bu-muted connection-status" role="status">
		{t(
			connected
				? app.remembered
					? 'connectSheet.connectedRemembered'
					: 'connectSheet.connectedForTab'
				: 'usage.notConnected'
		)}
	</p>
	<button class="row bu-action" data-variant="quiet" type="button" onclick={openSettingsAccount}>
		<KeyRound size={18} aria-hidden="true" />
		<span class="row-name">{openerLabel(connectionAction)}</span>
		<SurfaceChevron />
	</button>
</div>
{#if connected}
	<hr class="bu-separator" />
	<PixelLabUsage detailed>
		{#snippet actions()}
			<button
				class="bu-action btn icon plain"
				data-variant="quiet"
				type="button"
				disabled={refreshing}
				aria-label={t(refreshing ? 'usage.refreshing' : 'activity.refreshBalance')}
				title={t('activity.refreshBalance')}
				onclick={refresh}
			>
				<RefreshCw size={17} aria-hidden="true" />
			</button>
		{/snippet}
	</PixelLabUsage>
	{#if app.balanceError}<p class="notice bad small" role="status">{t('usage.loadFailed')}</p>{/if}
{/if}

<style>
	.connection-status {
		margin-block: 0 4px;
	}
</style>
