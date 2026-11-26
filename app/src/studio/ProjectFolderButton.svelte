<script lang="ts">
	// Export's one Project folder control: opens Settings > Export, where the folder is chosen and managed. Absent where the
	// browser cannot write folders.
	import { t } from 'svelte-whisper';
	import { FolderOpen } from './icons.ts';
	import {
		checkFolderSupport,
		folderNeedsAttention,
		loadFolderLink,
		projectFolder
	} from './projectFolder.svelte.ts';
	import { doc } from './state.svelte.ts';

	let { onopen }: { onopen: () => void } = $props();

	$effect(() => {
		void checkFolderSupport();
		void loadFolderLink(doc.id);
	});

	const summary = $derived(
		!projectFolder.link
			? t('projectFolder.state.off')
			: folderNeedsAttention(projectFolder.status)
				? t('projectFolder.state.attention')
				: t('projectFolder.state.on')
	);
</script>

{#if projectFolder.support === 'supported' || projectFolder.support === 'brave-disabled'}
	<button type="button" class="bu-action btn plain folder-button" onclick={onopen}
		><FolderOpen size={16} aria-hidden="true" />{t('projectFolder.title')}<span
			class="bu-muted folder-state"
			class:attention={folderNeedsAttention(projectFolder.status)}>{summary}</span
		></button
	>
{/if}

<style>
	.folder-button {
		align-self: flex-start;
	}
	.folder-state {
		margin-left: 4px;
	}
	.folder-state::before {
		content: '· ';
	}
	.folder-state.attention {
		color: var(--warn);
	}
</style>
