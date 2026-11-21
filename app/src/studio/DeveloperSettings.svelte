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
	import { doc, openProject, store, toast, ui } from './state.svelte.ts';

	let {
		tools
	}: {
		/** Additional Developer rows, such as the backup-copy opener, rendered only while enabled. */
		tools?: Snippet;
	} = $props();
	const rigs = $derived(
		localDeveloperToolsEnabled() ? store.projects.filter((project) => project.dev) : []
	);

	function changeMode(event: Event & { currentTarget: HTMLInputElement }) {
		if (!setDeveloperMode(event.currentTarget.checked))
			toast(message('developer.notSaved'), { tone: 'warning' });
	}

	function pick(id: string) {
		if (!localDeveloperToolsEnabled()) return;
		ui.sheet = null;
		if (id !== doc.id) void openProject(id);
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
{#if developerModeEnabled()}
	{#if !workspaceCopy}<ApiPeek all menu />{/if}
	{@render tools?.()}
	{#if localDeveloperToolsEnabled()}
		<a class="row bu-action" data-variant="quiet" href="#/dev">{t('developer.pages')}</a>
		{#if rigs.length}
			<p class="menu-sec">{t('developer.rigs')}</p>
			{#each rigs as project (project.id)}
				<button
					type="button"
					class="row bu-action"
					data-variant="quiet"
					onclick={() => pick(project.id)}
				>
					<span class="row-name">{project.name}</span>
				</button>
			{/each}
		{/if}
	{/if}
{/if}
