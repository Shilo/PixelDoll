<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ui } from './state.svelte.ts';
	import Sheet from './Sheet.svelte';
	import Lazy from './Lazy.svelte';
	import SettingsContent from './SettingsContent.svelte';
	import SettingsHeader from './SettingsHeader.svelte';
	import { settingsLabels, settingsNavigation } from './settingsNavigation.svelte.ts';

	const loadExport = () => import('./ExportSheet.svelte');
	let saving = $state(false);
	let libraryBusy = $state(false);
	let resetOpen = $state(false);
	const busy = $derived(saving || libraryBusy || resetOpen);
</script>

<Sheet
	title={t('export.sheet.settings')}
	className="settings-sheet"
	wide
	cancel="common.close"
	cancelDisabled={busy}
	onclose={() => (ui.sheet = null)}
>
	{#snippet leading()}<SettingsHeader {busy} />{/snippet}
	{#snippet heading()}{#if settingsNavigation.section}<span class="settings-page-title"
				>{t(settingsLabels[settingsNavigation.section])}</span
			>{/if}{/snippet}
	<SettingsContent {busy} bind:libraryBusy bind:resetOpen>
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

<style>
	.settings-page-title {
		display: none;
	}
	/* Compact pages show the open section in place of "Settings"; the hidden h2 keeps the dialog's name. */
	@media (max-width: 659px), (max-height: 519px) {
		:global(.sheet-heading:has(.settings-page-title) .sheet-title) {
			position: absolute;
			clip-path: inset(50%);
		}
		.settings-page-title {
			display: block;
			min-width: 0;
			font-size: 18px;
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
