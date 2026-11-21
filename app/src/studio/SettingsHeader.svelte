<script lang="ts">
	import { t } from 'svelte-whisper';
	import { ChevronLeft } from './icons.ts';
	import { settingsNavigation } from './settingsNavigation.svelte.ts';
	import SettingsResetButton from './SettingsResetButton.svelte';

	let { busy, onreset }: { busy: boolean; onreset?: () => void } = $props();
</script>

<!-- Sheet's leading column: equal side columns keep the centered title independent of this button's width. -->
<span class="settings-leading" class:with-reset={Boolean(onreset)}>
	{#if settingsNavigation.section && !settingsNavigation.fromExport}
		<button
			class="settings-back bu-action btn plain link"
			data-variant="quiet"
			aria-label={t('export.sheet.settings')}
			disabled={busy}
			onclick={() => (settingsNavigation.section = null)}
			><ChevronLeft size={18} aria-hidden="true" /><span>{t('export.sheet.settings')}</span></button
		>
	{/if}
	{#if onreset}<SettingsResetButton scope="all" disabled={busy} onclick={onreset} />{/if}
</span>

<style>
	.settings-leading {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.settings-back {
		display: none;
	}
	@media (max-width: 659px), (max-height: 519px) {
		.settings-back {
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
		.settings-back::after {
			content: '';
			position: absolute;
			inset: calc((100% - 44px) / 2) 0;
		}
		.settings-back span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.with-reset .settings-back span {
			display: none;
		}
	}
	@media (min-width: 600px) and ((max-width: 659px) or (max-height: 519px)) {
		.settings-back {
			margin-inline-start: 2px;
		}
	}
</style>
