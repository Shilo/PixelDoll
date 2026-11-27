<script lang="ts">
	// Every object menu's Rename… row. Like Move to Trash…, when `locked` gives a reason (the demo) it stays in its place,
	// unavailable, with the reason underneath, so every menu ends the same way.
	import { t } from 'svelte-whisper';
	import { Pencil } from './icons.ts';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';

	let {
		locked = '',
		onclick,
		class: className = ''
	}: { locked?: string; onclick: () => void; class?: string } = $props();
	const reason = $props.id();
</script>

<button
	class={['row', className]}
	data-variant="quiet"
	role="menuitem"
	aria-disabled={locked ? 'true' : undefined}
	aria-describedby={locked ? reason : undefined}
	onclick={() => {
		if (!locked) onclick();
	}}
	><Pencil size={16} aria-hidden="true" /><span class="row-name"
		>{openerLabel(t('toolbar.rename'))}{#if locked}<small class="row-reason" id={reason}
				>{locked}</small
			>{/if}</span
	><SurfaceChevron /></button
>
