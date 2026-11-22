<script lang="ts">
	// The one way out of a sheet or panel: an X at the logical end of its header, named Close (docs/design/2026-11-21-app-bars/plan.md).
	import { t } from 'svelte-whisper';
	import { X } from './icons.ts';
	let {
		onclick,
		disabled = false,
		label
	}: { onclick: () => void; disabled?: boolean; label?: string } = $props();
	const name = $derived(label ?? t('common.close'));
</script>

<button
	type="button"
	class="bu-action btn plain icon surface-close"
	data-variant="quiet"
	aria-label={name}
	title={name}
	{disabled}
	{onclick}><X size={20} aria-hidden="true" /></button
>
