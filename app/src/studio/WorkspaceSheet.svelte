<script lang="ts">
	import { t } from 'svelte-whisper';
	import { workspaceInfo } from '../lib/store/workspace-mode.ts';
	import { ui } from './state.svelte.ts';
	import Sheet from './Sheet.svelte';

	const close = () => (ui.sheet = null);
</script>

<Sheet title={t('workspace.activityTitle')} onclose={close}>
	<p class="muted">{t('workspace.activityIntro', { build: workspaceInfo?.build ?? '' })}</p>
	{#if workspaceInfo?.missing.length}
		<p class="bu-notice" data-size="compact" data-tone="warning">
			{t('workspace.missing', { count: workspaceInfo.missing.length })}
		</p>
	{/if}
	{#if workspaceInfo?.omitted}
		<p class="bu-notice" data-size="compact" data-tone="warning">
			{t('workspace.skippedCharacters', { count: workspaceInfo.omitted })}
		</p>
	{/if}
</Sheet>
