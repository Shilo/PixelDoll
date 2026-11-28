<script lang="ts">
	// The one way back to a sheet's previous pane, at the logical start of its header. It never closes the sheet.
	import { t } from 'svelte-whisper';
	import { ChevronLeft } from './icons.ts';
	let {
		onclick,
		disabled = false,
		to,
		describedBy,
		ref = $bindable()
	}: {
		onclick: () => void;
		disabled?: boolean;
		/** Where Back goes when that is another sheet, such as Settings: named "Back to Settings". */
		to?: string;
		/** A note about what leaving does, read with the button's name. */
		describedBy?: string;
		ref?: HTMLButtonElement;
	} = $props();
</script>

<button
	type="button"
	class="bu-action btn plain surface-back"
	data-trail="sheet.back"
	data-variant="quiet"
	aria-label={to ? t('common.backTo', { place: to }) : undefined}
	aria-describedby={describedBy}
	bind:this={ref}
	{disabled}
	{onclick}
	><ChevronLeft size={20} aria-hidden="true" /><span class="surface-back-label"
		>{t('common.back')}</span
	></button
>
