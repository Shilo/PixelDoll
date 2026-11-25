<script lang="ts">
	import { t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import Lazy from './Lazy.svelte';
	import SettingsContent from './SettingsContent.svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { ui } from './state.svelte.ts';
	import type { ResetScope } from './resetSettings.ts';
	import { watchExportDefaults } from './settingsDefaults.svelte.ts';
	import {
		closeSettings,
		openSettingsExport,
		settingsLabels,
		settingsNavigation
	} from './settingsNavigation.svelte.ts';

	const loadExport = () => import('./ExportSheet.svelte');
	let saving = $state(false);
	let libraryBusy = $state(false);
	let reviewingBackup = $state(false);
	let resetScope = $state<ResetScope | null>(null);
	const busy = $derived(saving || libraryBusy || reviewingBackup || resetScope !== null);
	const canReset = $derived(!workspaceCopy && !settingsNavigation.fromExport);
	$effect(() => (canReset ? watchExportDefaults() : undefined));
	// Compact Settings drills into one page at a time, so a page steps back to the index; wide Settings shows both.
	const compact = new MediaQuery('(max-width: 659px), (max-height: 519px)');
	const back = $derived(
		compact.current && settingsNavigation.section && !settingsNavigation.fromExport
			? () => (settingsNavigation.section = null)
			: undefined
	);
</script>

<Sheet
	title={t('export.sheet.settings')}
	className="settings-sheet"
	overlay={ui.settingsOverlay}
	wide
	locked={busy}
	{back}
	backTo={t('export.sheet.settings')}
	onclose={closeSettings}
>
	{#snippet heading()}{#if settingsNavigation.section}<span class="settings-page-title"
				>{t(settingsLabels[settingsNavigation.section])}</span
			>{/if}{/snippet}
	<SettingsContent
		{busy}
		openExport={openSettingsExport}
		bind:libraryBusy
		bind:reviewingBackup
		bind:resetScope
	>
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
