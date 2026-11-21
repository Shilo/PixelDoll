<script lang="ts">
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { Copy, ExternalLink } from './icons.ts';
	import { PRE_RELEASE } from './previewNotice.ts';
	import { toast } from './state.svelte.ts';

	const repository = 'https://github.com/Shilo/PixelDoll';
	const hasCommit = /^[a-f0-9]{7,40}$/i.test(__APP_COMMIT__);
	const commitUrl = `${repository}/commit/${__APP_COMMIT__}`;
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
	<a
		class="row bu-action"
		data-variant="quiet"
		href={repository}
		target="_blank"
		rel="noreferrer"
		aria-label={`${t('versionRow.openSource')}: ${repository}`}
	>
		<span class="row-name">{repository}</span><ExternalLink size={16} aria-hidden="true" />
	</a>
	{#if hasCommit}
		<a
			class="row bu-action"
			data-variant="quiet"
			href={commitUrl}
			target="_blank"
			rel="noreferrer"
			aria-label={`${t('versionRow.viewCommit')}: ${__APP_COMMIT__}`}
		>
			<span class="row-name bu-number">{__APP_COMMIT__}</span><ExternalLink
				size={16}
				aria-hidden="true"
			/>
		</a>
	{/if}
	<button class="row bu-action" data-variant="quiet" type="button" onclick={copyDetails}>
		<Copy size={16} aria-hidden="true" /><span class="row-name">{t('versionRow.copyDetails')}</span>
	</button>
</div>

<style>
	.build-summary {
		display: grid;
		gap: 4px;
		margin-block-end: 8px;
	}
	.about-details :is(a, button) :global(svg) {
		flex: none;
	}
</style>
