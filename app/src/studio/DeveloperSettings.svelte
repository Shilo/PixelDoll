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
	<span class="row-name">{t('developer.mode')}</span>
	<input
		class="bu-switch"
		type="checkbox"
		role="switch"
		checked={developerModeEnabled()}
		onchange={changeMode}
	/>
</label>
<p class="bu-muted">{t('developer.description')}</p>
{#if developerModeEnabled()}
	{#if !workspaceCopy}<ApiPeek all menu />{/if}
	{@render tools?.()}
	{#if localTools && localDeveloperToolsEnabled()}
		{#await localTools() then { default: LocalDeveloperTools }}
			<LocalDeveloperTools />
		{/await}
	{/if}
{/if}
