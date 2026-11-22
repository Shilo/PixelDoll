<script lang="ts">
	import SettingsItemButton from './SettingsItemButton.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { tick } from 'svelte';
	import { t } from 'svelte-whisper';
	import { app, forgetKey, getKeyRevision, refreshBalance } from '../lib/app.svelte.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { jobLabel, jobStateText } from './activityLabels.ts';
	import { clearPendingConnection } from './state.svelte.ts';
	import {
		Activity,
		Calculator,
		Compass,
		ExternalLink,
		KeyRound,
		LogOut,
		RefreshCw
	} from './icons.ts';
	import { openerLabel } from './openerLabel.ts';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import {
		openSettingsAccount,
		openSettingsActivity,
		openSettingsCost
	} from './settingsNavigation.svelte.ts';
	let { forgetRevision = $bindable(-1) }: { forgetRevision: number } = $props();

	const recentJobs = $derived(
		$queue.jobs
			.filter((job) => typeof job.id === 'string' && typeof job.label === 'string')
			.slice(-12)
			.reverse()
	);
	const id = $props.id();
	const activityHeading = `${id}-activity`;
	const externalHint = `${id}-external`;
	const connected = $derived(Boolean(app.key && !app.keyRejected));
	const connectionAction = $derived(
		t(
			app.keyRejected
				? 'connectSheet.reconnect'
				: connected
					? 'connectSheet.replaceKey'
					: 'toolbar.connectPixelLab2'
		)
	);
	let connectionButton = $state<HTMLButtonElement>();
	let refreshing = $state(false);
	const refreshLabel = $derived(t(refreshing ? 'usage.refreshing' : 'activity.refreshBalance'));
	async function refresh() {
		if (refreshing || !connected) return;
		refreshing = true;
		try {
			await refreshBalance({ label: 'Refresh balance', background: false });
		} finally {
			refreshing = false;
		}
		// A rejected key removes the usage block and its button; Reconnect takes focus instead.
		if (app.keyRejected) await focusConnection();
	}
	// The question belongs to the key it was asked about: a Forget from another tab or app, or any new key, dismisses it.
	const confirmingForget = $derived(!!app.key && forgetRevision === getKeyRevision());
	async function forget() {
		forgetRevision = -1;
		clearPendingConnection();
		forgetKey();
		await focusConnection();
	}
	async function focusConnection() {
		await tick();
		connectionButton?.focus();
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
	<div class="connection-actions">
		<SettingsItemButton
			bind:element={connectionButton}
			onclick={() => openSettingsAccount(connected)}
		>
			<KeyRound size={18} aria-hidden="true" />
			<span class="row-name">{openerLabel(connectionAction)}</span>
			<SurfaceChevron />
		</SettingsItemButton>
		{#if app.key}
			<SettingsItemButton onclick={() => (forgetRevision = getKeyRevision())}>
				<LogOut size={18} aria-hidden="true" />
				<span class="row-name">{openerLabel(t('connectSheet.forgetKey'))}</span>
				<SurfaceChevron />
			</SettingsItemButton>
		{/if}
	</div>
</div>
<div data-setting="cost-estimate">
	<SettingsItemButton onclick={openSettingsCost}>
		<Calculator size={18} aria-hidden="true" />
		<span class="row-name">{openerLabel(t('costSheet.title'))}</span>
		<SurfaceChevron />
	</SettingsItemButton>
</div>
<SettingsItemButton
	data-setting="pixellab-website"
	aria-describedby={externalHint}
	onclick={() => window.open('https://pixellab.ai', '_blank', 'noopener,noreferrer')}
>
	<Compass size={18} aria-hidden="true" />
	<span class="row-name">{t('settings.pixelLabWebsite')}</span>
	<ExternalLink size={16} aria-hidden="true" />
</SettingsItemButton>
<span id={externalHint} hidden>{t('noticeLink.opensInANewTab')}</span>
{#if connected}
	<hr class="bu-separator" />
	<PixelLabUsage detailed>
		{#snippet actions()}
			<button
				type="button"
				class="bu-action btn icon plain usage-refresh"
				data-variant="quiet"
				aria-label={refreshLabel}
				title={refreshLabel}
				aria-disabled={refreshing}
				onclick={refresh}><RefreshCw size={18} aria-hidden="true" /></button
			>
		{/snippet}
	</PixelLabUsage>
	{#if app.balanceError}<p class="notice bad small" role="status">{t('usage.loadFailed')}</p>{/if}
{/if}
{#if confirmingForget}
	<ConfirmDialog
		title={t('connectSheet.forgetTitle')}
		action={t('connectSheet.forgetKey')}
		oncancel={() => (forgetRevision = -1)}
		onconfirm={() => void forget()}
	>
		<p>{t(workspaceCopy ? 'connectSheet.forgetTab' : 'connectSheet.forgetShared')}</p>
	</ConfirmDialog>
{/if}
<hr class="bu-separator" />
<div class="settings-activity" data-setting="recent-activity">
	<SettingsItemButton onclick={openSettingsActivity}>
		<Activity size={18} aria-hidden="true" />
		<span class="row-name">{openerLabel(t('activity.title'))}</span>
		<SurfaceChevron />
	</SettingsItemButton>
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
	.connection-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
		gap: 8px;
	}
	/* Keeps the heading row at its text height; the icon only spins while refreshing, so nothing moves. */
	.usage-refresh {
		flex: none;
		position: relative;
		inset-block-start: 3px;
		margin-block: calc((0.9375rem * 1.4 - var(--ctl-h)) / 2);
		margin-inline-end: -8px;
	}
	.usage-refresh[aria-disabled='true'] :global(svg) {
		animation: spin 1s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.usage-refresh[aria-disabled='true'] :global(svg) {
			animation: none;
		}
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
