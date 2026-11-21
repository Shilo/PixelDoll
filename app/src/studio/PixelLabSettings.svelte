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
<hr class="bu-separator" />
<section data-setting="recent-activity" tabindex="-1" aria-labelledby={activityHeading}>
	<h4 id={activityHeading} class="settings-label">{t('activity.recent')}</h4>
	{#if recentJobs.length}
		<div class="recent-jobs" role="region" aria-labelledby={activityHeading}>
			<ul>
				{#each recentJobs as job (job.id)}
					<li>
						<span>{jobLabel(job)}</span> <span class="bu-muted">{jobStateText(job.state)}</span>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="bu-muted settings-description">{t('activity.nothing')}</p>
	{/if}
	<button
		class="row bu-action"
		data-variant="quiet"
		type="button"
		onclick={() => (ui.sheet = 'activity')}
	>
		<Activity size={18} aria-hidden="true" />
		<span class="row-name">{openerLabel(t('activity.title'))}</span>
		<SurfaceChevron />
	</button>
</section>

<style>
	.connection-status {
		margin-block: 0 4px;
	}
	.recent-jobs {
		max-block-size: 10rem;
		overflow: auto;
	}
	.recent-jobs ul {
		padding: 0 8px 0 0;
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
