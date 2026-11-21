<script lang="ts">
	import SettingsItemButton from './SettingsItemButton.svelte';
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { repository } from '../lib/repository.ts';
	import { Copy, ExternalLink, GitCommitHorizontal, Github } from './icons.ts';
	import { PRE_RELEASE } from './previewNotice.ts';
	import { toast } from './state.svelte.ts';

	const hasCommit = /^[a-f0-9]{7,40}$/i.test(__APP_COMMIT__);
	const commitUrl = `${repository}/commit/${__APP_COMMIT__}`;
	const externalHint = $props.id();
	const modeKey = import.meta.env.DEV
		? 'versionRow.development'
		: PRE_RELEASE
			? 'versionRow.preRelease'
			: undefined;
	const version = $derived(t('toolbar.version', { version: __APP_VERSION__ }));
	const mode = $derived(modeKey ? t(modeKey) : undefined);

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
	<div class="about-actions">
		<SettingsItemButton
			aria-describedby={externalHint}
			onclick={() => window.open(repository, '_blank', 'noopener,noreferrer')}
		>
			<Github size={18} />
			<span class="row-name">{t('versionRow.openSource')}</span>
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
	}
</style>
