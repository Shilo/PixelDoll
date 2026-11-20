<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ChevronLeft } from './icons.ts';
	import { settingsLabels, settingsNavigation } from './settingsNavigation.svelte.ts';

	let { busy }: { busy: boolean } = $props();
</script>

{#if settingsNavigation.section}
	<div class="settings-compact-heading">
		{#if !settingsNavigation.fromExport}
			<button
				class="bu-action btn plain link"
				data-variant="quiet"
				disabled={busy}
				onclick={() => (settingsNavigation.section = null)}
				><ChevronLeft size={16} aria-hidden="true" />{t('export.sheet.settings')}</button
			>
		{/if}
		<span>{t(settingsLabels[settingsNavigation.section])}</span>
	</div>
{/if}

<style>
	.settings-compact-heading {
		display: none;
	}
	@media (max-width: 659px), (max-height: 519px) {
		:global(.sheet-head:has(.settings-compact-heading)) {
			grid-template-columns: auto minmax(0, 1fr) auto;
			column-gap: 8px;
		}
		:global(.sheet-heading:has(.settings-compact-heading) .sheet-title) {
			position: absolute;
			clip-path: inset(50%);
		}
		.settings-compact-heading {
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			min-width: 0;
			font-weight: 600;
		}
		.settings-compact-heading button {
			flex: none;
			min-height: 0;
			position: relative;
		}
		.settings-compact-heading button::after {
			content: '';
			position: absolute;
			inset: calc((100% - 44px) / 2) 0;
		}
		.settings-compact-heading span {
			flex: 1;
			text-align: center;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
