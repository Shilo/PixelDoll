<script lang="ts">
	// Export's Project folder control: one clear button below the formats, under its own heading, that shows the folder's state and opens
	// Settings > Export at the Project folder section. Absent where the browser cannot write folders.
	import { t } from 'svelte-whisper';
	import { ChevronRight, FolderSync } from './icons.ts';
	import {
		checkFolderSupport,
		folderNeedsAttention,
		loadFolderLink,
		projectFolder,
		updatedLabel
	} from './projectFolder.svelte.ts';
	import { doc } from './state.svelte.ts';

	let { onopen }: { onopen: () => void } = $props();

	$effect(() => {
		void checkFolderSupport();
		void loadFolderLink(doc.id);
	});

	// Refreshes "Updated 2 minutes ago" while Export stays open.
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	const attention = $derived(folderNeedsAttention(projectFolder.status));
	const summary = $derived.by(() => {
		const link = projectFolder.link;
		if (!link) return t('projectFolder.state.off');
		if (attention) return t('projectFolder.state.attention');
		if (projectFolder.status.kind === 'publishing') return t('projectFolder.state.updating');
		const mode = t(link.auto ? 'projectFolder.state.on' : 'projectFolder.state.manual');
		return link.publishedAt ? `${mode} · ${updatedLabel(link.publishedAt, now)}` : mode;
	});
</script>

{#if projectFolder.support === 'supported' || projectFolder.support === 'brave-disabled'}
	<section class="folder-section" aria-labelledby="project-folder-section">
		<h3 class="label" id="project-folder-section">{t('projectFolder.section')}</h3>
		<!-- A stable name with the changing state as its description, so a ticking timestamp is not re-announced as a new name. -->
		<button
			type="button"
			class="bu-action btn folder-button"
			data-variant="field"
			aria-label={t('projectFolder.title')}
			aria-describedby="project-folder-summary"
			onclick={onopen}
		>
			<FolderSync size={18} aria-hidden="true" />
			<span class="folder-text">
				<span class="folder-title">{t('projectFolder.title')}</span>
				<span class="folder-state" id="project-folder-summary" class:attention>{summary}</span>
			</span>
			<ChevronRight size={16} aria-hidden="true" />
		</button>
	</section>
{/if}

<style>
	.folder-section {
		display: grid;
		gap: 8px;
	}
	.folder-section h3 {
		margin: 0;
	}
	.folder-button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		padding-block: 8px;
		text-align: start;
	}
	.folder-text {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.folder-title {
		font-weight: 600;
	}
	.folder-state {
		font-size: 0.8125rem;
		font-weight: 400;
		opacity: 0.75;
		overflow-wrap: anywhere;
	}
	.folder-state.attention {
		color: var(--warn);
		opacity: 1;
	}
</style>
