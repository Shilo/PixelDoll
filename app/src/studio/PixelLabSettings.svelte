<script lang="ts">
	import { t } from 'svelte-whisper';
	import { app, refreshBalance } from '../lib/app.svelte.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { jobLabel, jobStateText } from './activityLabels.ts';
	import { Activity, KeyRound, RefreshCw } from './icons.ts';
	import { openerLabel } from './openerLabel.ts';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openSettingsAccount } from './settingsNavigation.svelte.ts';
	import { ui } from './state.svelte.ts';

	const recentJobs = $derived($queue.jobs.slice(-12).reverse());
	const activityHeading = $props.id();
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
				: app.keyRejected
					? 'connectSheet.keyRejected'
					: 'usage.notConnected'
		)}
	</p>
	<button
		class="bu-action settings-action"
		data-variant="outline"
		type="button"
		onclick={openSettingsAccount}
	>
		<KeyRound size={18} aria-hidden="true" />
		<span class="row-name">{openerLabel(connectionAction)}</span>
		<SurfaceChevron />
	</button>
</div>
{#if connected}
	<hr class="bu-separator" />
	<PixelLabUsage detailed />
	<button
		class="bu-action settings-action"
		data-variant="outline"
		type="button"
		aria-disabled={refreshing}
		onclick={refresh}
	>
		<RefreshCw size={18} aria-hidden="true" />
		{t(refreshing ? 'usage.refreshing' : 'activity.refreshBalance')}
	</button>
	{#if app.balanceError}<p class="notice bad small" role="status">{t('usage.loadFailed')}</p>{/if}
{/if}
<hr class="bu-separator" />
<div class="settings-activity" data-setting="recent-activity">
	<button
		class="bu-action settings-action"
		data-variant="outline"
		type="button"
		onclick={() => (ui.sheet = 'activity')}
	>
		<Activity size={18} aria-hidden="true" />
		<span class="row-name">{openerLabel(t('activity.title'))}</span>
		<SurfaceChevron />
	</button>
	<h4 id={activityHeading} class="settings-label">{t('activity.recentSettings')}</h4>
	<div
		class="recent-jobs"
		role="region"
		aria-labelledby={activityHeading}
		{@attach (element) => {
			element.tabIndex = recentJobs.length ? 0 : -1;
		}}
	>
		{#if recentJobs.length}
			<ul>
				{#each recentJobs as job (job.id)}
					<li>
						<span>{jobLabel(job)}</span> <span class="bu-muted">{jobStateText(job.state)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="bu-muted settings-description">{t('activity.noRecentSettings')}</p>
		{/if}
	</div>
</div>

<style>
	.connection-status {
		margin-block: 0 4px;
	}
	/* Fills the rest of the page; the list scrolls inside it. */
	.settings-activity {
		flex: 1 1 0;
		min-block-size: 14rem;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.settings-activity h4 {
		margin-block-start: 4px;
	}
	.recent-jobs {
		flex: 1 1 0;
		min-block-size: 0;
		overflow: auto;
	}
	.recent-jobs ul {
		padding: 0;
		padding-inline-end: 8px;
		margin: 0;
		list-style: none;
	}
	.recent-jobs li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
		padding-block: 4px;
		overflow-wrap: anywhere;
	}
</style>
