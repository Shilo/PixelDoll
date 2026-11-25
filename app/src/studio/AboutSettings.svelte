<script lang="ts">
	import SettingsItemButton from './SettingsItemButton.svelte';
	import AffiliationNotice from './AffiliationNotice.svelte';
	import { onMount } from 'svelte';
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { repository } from '../lib/repository.ts';
	import { Copy, Download, ExternalLink, GitCommitHorizontal, Github, RefreshCw } from './icons.ts';
	import { checkForUpdate, pwa, requestUpdate } from '../lib/pwa.ts';
	import { updateNotice } from './updateNotice.svelte.ts';
	import PendingIndicator from './PendingIndicator.svelte';
	import { PRE_RELEASE } from './previewNotice.ts';
	import { toast } from './state.svelte.ts';

	const hasCommit = /^[a-f0-9]{7,40}$/i.test(__APP_COMMIT__);
	const commitUrl = `${repository}/commit/${__APP_COMMIT__}`;
	const id = $props.id();
	const externalHint = `${id}-external`;
	const statusId = `${id}-update-status`;
	const modeKey = import.meta.env.DEV
		? 'versionRow.development'
		: PRE_RELEASE
			? 'versionRow.preRelease'
			: undefined;
	const version = $derived(t('toolbar.version', { version: __APP_VERSION__ }));
	const mode = $derived(modeKey ? t(modeKey) : undefined);
	const ready = $derived($pwa.ready ? $pwa.available : null);
	const checking = $derived($pwa.checking && !ready);
	const updateAction = $derived(
		ready
			? t('toolbar.updateToVVersion', { version: ready.version })
			: checking
				? t('versionRow.checkingForUpdates')
				: t('versionRow.checkForUpdates')
	);
	const updateStatus = $derived.by(() => {
		if (ready) return '';
		if (!checking && $pwa.discovery === 'failed') return t('versionRow.updateFailed');
		if ($pwa.available)
			return $pwa.stagingFailed && !checking
				? t('versionRow.updateStuck')
				: t('versionRow.preparingUpdate', { version: $pwa.available.version });
		if (checking) return '';
		if ($pwa.discovery === 'checked') return t('versionRow.upToDate');
		return '';
	});

	onMount(updateNotice.showInAbout);

	function handleUpdate() {
		if (ready) requestUpdate('about');
		else if (!checking) void checkForUpdate();
	}

	async function copyDetails() {
		try {
			await navigator.clipboard.writeText(
				['PixelDoll', version, mode, repository, hasCommit ? commitUrl : undefined]
					.filter(Boolean)
					.join('\n')
			);
			toast(message('toolbar.copiedPrompt'));
		} catch {
			toast(message('versionRow.copyFailed'), { tone: 'warning' });
		}
	}
</script>

<div class="about-details" data-setting="about" tabindex="-1">
	<div class="build-summary">
		<strong>PixelDoll</strong>
		<span class="bu-muted">{version}</span>
		{#if mode}<span class="bu-muted">{mode}</span>{/if}
	</div>
	<p class="settings-description about-description">{t('versionRow.description')}</p>
	<AffiliationNotice />
	<div class="about-actions">
		{#if $pwa.enabled}
			<SettingsItemButton
				aria-labelledby={statusId + '-action'}
				aria-describedby={updateStatus ? statusId : undefined}
				aria-disabled={checking || undefined}
				aria-haspopup={ready ? 'dialog' : undefined}
				onclick={handleUpdate}
			>
				{#if ready}
					<Download size={18} aria-hidden="true" />
				{:else if checking}
					<span class="update-indicator" aria-hidden="true"><PendingIndicator /></span>
				{:else}
					<RefreshCw size={18} aria-hidden="true" />
				{/if}
				<span class="update-label">
					<span id={statusId + '-action'}>{updateAction}</span>
					{#if updateStatus}<span id={statusId} class="bu-muted bu-small">{updateStatus}</span>{/if}
				</span>
			</SettingsItemButton>
			<span class="sr" role="status"
				>{ready ? updateAction : updateStatus || (checking ? updateAction : '')}</span
			>
		{/if}
		<SettingsItemButton
			aria-describedby={externalHint}
			onclick={() => window.open(repository, '_blank', 'noopener,noreferrer')}
		>
			<Github size={18} />
			<span class="row-name">{t('versionRow.openSource')}</span>
			<span class="bu-muted">{new URL(repository).pathname.slice(1)}</span>
			<ExternalLink size={16} aria-hidden="true" />
		</SettingsItemButton>
		{#if hasCommit}
			<SettingsItemButton
				aria-describedby={externalHint}
				onclick={() => window.open(commitUrl, '_blank', 'noopener,noreferrer')}
			>
				<GitCommitHorizontal size={18} aria-hidden="true" />
				<span class="row-name">{t('versionRow.viewCommit')}</span>
				<span class="bu-muted bu-number">{__APP_COMMIT__.slice(0, 7)}</span>
				<ExternalLink size={16} aria-hidden="true" />
			</SettingsItemButton>
		{/if}
		<span id={externalHint} hidden>{t('noticeLink.opensInANewTab')}</span>
		<SettingsItemButton onclick={copyDetails}>
			<Copy size={18} aria-hidden="true" />{t('versionRow.copyDetails')}
		</SettingsItemButton>
	</div>
</div>

<style>
	.build-summary {
		display: grid;
		gap: 4px;
		margin-block-end: 12px;
	}
	.about-actions {
		display: grid;
		gap: 8px;
		margin-block-start: 12px;
	}
	.update-indicator {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: 18px;
	}
	.update-label {
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}
	.about-description {
		margin-block: 0 8px;
	}
</style>
