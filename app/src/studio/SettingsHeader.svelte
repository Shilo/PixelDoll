<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ChevronLeft } from './icons.ts';
	import { settingsNavigation } from './settingsNavigation.svelte.ts';

	let { busy }: { busy: boolean } = $props();
</script>

<!-- Sheet's leading column: equal side columns keep the centered title independent of this button's width. -->
<span class="settings-back">
	{#if settingsNavigation.section && !settingsNavigation.fromExport}
		<button
			class="bu-action btn plain link"
			data-variant="quiet"
			disabled={busy}
			onclick={() => (settingsNavigation.section = null)}
			><ChevronLeft size={18} aria-hidden="true" /><span>{t('export.sheet.settings')}</span></button
		>
	{/if}
</span>

<style>
	.settings-back {
		display: flex;
		min-width: 0;
	}
	.settings-back button {
		display: none;
	}
	@media (max-width: 659px), (max-height: 519px) {
		.settings-back button {
			display: inline-flex;
			gap: 2px;
			max-width: 100%;
			min-width: 0;
			min-height: 0;
			position: relative;
			/* The chevron's drawn stroke starts 6px into its 18px box; line that stroke up with the body's
			   16px (phone) or 20px content edge from the header's 12px padding. */
			padding-inline-start: 0;
			margin-inline-start: -2px;
		}
		.settings-back button::after {
			content: '';
			position: absolute;
			inset: calc((100% - 44px) / 2) 0;
		}
		.settings-back button span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
	@media (min-width: 600px) and ((max-width: 659px) or (max-height: 519px)) {
		.settings-back button {
			margin-inline-start: 2px;
		}
	}
</style>
