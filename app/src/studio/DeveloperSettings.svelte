<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import { message } from '../lib/message.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import ApiPeek from './ApiPeek.svelte';
	import {
		developerModeEnabled,
		localDeveloperToolsEnabled,
		setDeveloperMode
	} from './developerMode.svelte.ts';
	import { toast } from './state.svelte.ts';
	import { CodeXml, Copy } from './icons.ts';
	const localTools = import.meta.env.DEV ? () => import('./LocalDeveloperTools.svelte') : undefined;

	let {
		tools
	}: {
		/** Additional Developer rows, such as the backup-copy opener, rendered only while enabled. */
		tools?: Snippet;
	} = $props();

	function changeMode(event: Event & { currentTarget: HTMLInputElement }) {
		if (!setDeveloperMode(event.currentTarget.checked))
			toast(message('developer.notSaved'), { tone: 'warning' });
	}
</script>

<label class="row bu-check" data-setting="developer-mode">
	<span class="row-name settings-label">{t('developer.mode')}</span>
	<input
		class="bu-switch"
		type="checkbox"
		role="switch"
		checked={developerModeEnabled()}
		onchange={changeMode}
	/>
</label>
<p class="bu-muted settings-description">{t('developer.description')}</p>
{#if developerModeEnabled()}
	{#if !workspaceCopy}<ApiPeek all menu />{/if}
	{@render tools?.()}
	{#if localTools && localDeveloperToolsEnabled()}
		{#await localTools() then { default: LocalDeveloperTools }}
			<LocalDeveloperTools />
		{/await}
	{/if}
{:else}
	<figure class="developer-preview bu-floating">
		<figcaption class="settings-label">{t('import.preview')}</figcaption>
		<div class="preview-example">
			<span>{t('common.character')}</span>
			<span><CodeXml size={16} aria-hidden="true" /> {t('apiPeek.title')}</span>
		</div>
		<div class="preview-example">
			<span class="bu-number">rig-example</span>
			<span><Copy size={16} aria-hidden="true" /> {t('developer.copyId')}</span>
		</div>
	</figure>
{/if}

<style>
	.developer-preview {
		margin: 0;
		padding: 12px;
		display: grid;
		gap: 8px;
	}
	.preview-example {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 6px 12px;
	}
	.preview-example span:last-child {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
