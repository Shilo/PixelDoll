<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ui } from './state.svelte.ts';
	import Sheet from './Sheet.svelte';
	import Lazy from './Lazy.svelte';
	import SettingsContent from './SettingsContent.svelte';
	import SettingsHeader from './SettingsHeader.svelte';

	const loadExport = () => import('./ExportSheet.svelte');
	let saving = $state(false);
</script>

<Sheet
	title={t('export.sheet.settings')}
	className="settings-sheet"
	wide
	cancel="common.close"
	cancelDisabled={saving}
	onclose={() => (ui.sheet = null)}
>
	{#snippet heading()}<SettingsHeader busy={saving} />{/snippet}
	<SettingsContent busy={saving}>
		{#snippet exportSettings(entry)}
			<Lazy
				load={loadExport}
				sheet={false}
				embedded
				focusEntry={entry}
				onSaving={(value: boolean) => (saving = value)}
			/>
		{/snippet}
	</SettingsContent>
</Sheet>
