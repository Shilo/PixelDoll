<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ui } from './state.svelte.ts';
	import Sheet from './Sheet.svelte';
	import Lazy from './Lazy.svelte';
	import SettingsContent from './SettingsContent.svelte';
	import SettingsHeader from './SettingsHeader.svelte';
	import SettingsResetButton from './SettingsResetButton.svelte';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { isResettableSection, type ResetScope } from './resetSettings.ts';
	import { watchExportDefaults } from './settingsDefaults.svelte.ts';
	import { settingsLabels, settingsNavigation } from './settingsNavigation.svelte.ts';

	const loadExport = () => import('./ExportSheet.svelte');
	let saving = $state(false);
	let libraryBusy = $state(false);
	let reviewingBackup = $state(false);
	let resetScope = $state<ResetScope | null>(null);
	const busy = $derived(saving || libraryBusy || resetScope !== null);
	const section = $derived(settingsNavigation.section);
	const canReset = $derived(!workspaceCopy && !settingsNavigation.fromExport);
	$effect(() => (canReset ? watchExportDefaults() : undefined));
</script>

<Sheet
	title={t('export.sheet.settings')}
	className="settings-sheet"
	wide
	cancel="common.close"
	cancelDisabled={busy}
	onclose={() => (ui.sheet = null)}
>
	{#snippet leading()}<SettingsHeader
			busy={busy || reviewingBackup}
			onreset={canReset ? () => (resetScope = 'all') : undefined}
		/>{/snippet}
	{#snippet heading()}{#if settingsNavigation.section}<span class="settings-page-title"
				>{t(settingsLabels[settingsNavigation.section])}</span
			>{/if}{/snippet}
	{#snippet trailing()}
		<div class="settings-end">
			{#if canReset && isResettableSection(section)}
				<div class="compact-reset">
					<SettingsResetButton
						scope={section}
						disabled={busy}
						onclick={() => (resetScope = section)}
					/>
				</div>
			{/if}
			<button
				type="button"
				class="bu-action btn plain link done"
				data-variant="quiet"
				disabled={busy}
				onclick={() => (ui.sheet = null)}>{t('common.close')}</button
			>
		</div>
	{/snippet}
	<SettingsContent {busy} bind:libraryBusy bind:reviewingBackup bind:resetScope>
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
	.settings-end {
		display: flex;
		align-items: center;
		justify-content: end;
		min-width: 0;
	}
	.compact-reset {
		display: none;
	}
	.settings-page-title {
		display: none;
	}
	/* Compact pages show the open section in place of "Settings"; the hidden h2 keeps the dialog's name. */
	@media (max-width: 659px), (max-height: 519px) {
		.compact-reset {
			display: flex;
		}
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
