<script lang="ts">
	import { t } from 'svelte-whisper';
	import { workspaceCopy, workspaceUrl } from '../lib/store/workspace-mode.ts';
	import { developerModeEnabled } from './developerMode.svelte.ts';
	import { Archive, ExternalLink } from './icons.ts';
	import SettingsItemButton from './SettingsItemButton.svelte';
	let { separated = false }: { separated?: boolean } = $props();
	const description = $props.id();
</script>

{#if !workspaceCopy && developerModeEnabled()}
	{#if separated}<hr class="bu-separator" />{/if}
	<SettingsItemButton
		aria-describedby={description}
		onclick={() => window.open(workspaceUrl(true), '_blank', 'noopener,noreferrer')}
	>
		<Archive size={18} aria-hidden="true" />
		<span class="row-name">{t('workspaceCopy.title')}</span>
		<ExternalLink size={16} aria-hidden="true" />
	</SettingsItemButton>
	<span id={description} hidden>{t('noticeLink.opensInANewTab')}</span>
{/if}
