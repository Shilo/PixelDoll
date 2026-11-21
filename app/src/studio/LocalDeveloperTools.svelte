<script lang="ts">
	import { t } from 'svelte-whisper';
	import { localDeveloperToolsEnabled } from './developerMode.svelte.ts';
	import { doc, openProject, store, ui } from './state.svelte.ts';

	const rigs = $derived(store.projects.filter((project) => project.dev));

	function pick(id: string) {
		if (!localDeveloperToolsEnabled()) return;
		ui.sheet = null;
		if (id !== doc.id) void openProject(id);
	}
</script>

{#if localDeveloperToolsEnabled()}
	<a class="row bu-action" data-variant="quiet" href="#/dev">{t('developer.pages')}</a>
	{#if rigs.length}
		<p class="menu-sec" data-local-developer-rigs>{t('developer.rigs')}</p>
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
