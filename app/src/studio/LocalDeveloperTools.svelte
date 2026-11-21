<script lang="ts">
	import { t } from 'svelte-whisper';
	import { localDeveloperToolsEnabled } from './developerMode.svelte.ts';
	import { Terminal } from './icons.ts';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { doc, openProject, store, ui } from './state.svelte.ts';

	const rigs = $derived(store.projects.filter((project) => project.dev));

	function pick(id: string) {
		if (!localDeveloperToolsEnabled()) return;
		ui.sheet = null;
		if (id !== doc.id) void openProject(id);
	}
</script>

{#if localDeveloperToolsEnabled()}
	<button
		type="button"
		class="bu-action settings-action"
		data-variant="outline"
		onclick={() => {
			if (localDeveloperToolsEnabled()) location.hash = '/dev';
		}}
	>
		<Terminal size={18} aria-hidden="true" />
		<span class="row-name">{t('developer.pages')}</span>
		<SurfaceChevron />
	</button>
	{#if rigs.length}
		<h4 class="settings-label" data-local-developer-rigs>{t('developer.rigs')}</h4>
		{#each rigs as project (project.id)}
			<button
				type="button"
				class="bu-action settings-action"
				data-variant="outline"
				onclick={() => pick(project.id)}
			>
				<span class="row-name">{project.name}</span>
			</button>
		{/each}
	{/if}
{/if}
