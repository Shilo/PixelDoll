<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ui } from './state.svelte.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import { Download, Info } from './icons.ts';
	import DeleteRow, { DEMO_CHARACTER_LOCKED } from './DeleteRow.svelte';
	import RowActions from './RowActions.svelte';
	import DemoCopyRow from './DemoCopyRow.svelte';
	let { id, name, children }: { id: string; name: string; children: Snippet } = $props();
</script>

<RowActions {name} {children}>
	{#snippet actions(close)}
		<DemoCopyRow {id} {close} />
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				close();
				void downloadCharacterZip(id);
			}}><Download size={16} />Download ZIP</button
		>
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				close();
				document
					.querySelectorAll<HTMLElement>('[popover]:popover-open')
					.forEach((popover) => popover.hidePopover());
				ui.details = id;
				ui.sheet = 'details';
			}}><Info size={16} />Details…</button
		>
		<hr class="bu-separator" />
		<DeleteRow
			label="Delete character…"
			locked={id.startsWith('fixture:') ? DEMO_CHARACTER_LOCKED : ''}
			onclick={() => {
				close();
				document
					.querySelectorAll<HTMLElement>('[popover]:popover-open')
					.forEach((popover) => popover.hidePopover());
				ui.deleting = id;
				ui.sheet = 'delete';
			}}
		/>
	{/snippet}
</RowActions>
