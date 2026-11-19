<script lang="ts">
	import { t } from 'svelte-whisper';
	import type { Snippet } from 'svelte';
	import { ui } from './state.svelte.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import { Compass, Download, Info } from './icons.ts';
	import DeleteRow from './DeleteRow.svelte';
	import RowActions from './RowActions.svelte';
	import DemoCopyRow from './DemoCopyRow.svelte';
	let { id, name, children }: { id: string; name: string; children: Snippet } = $props();
</script>

<RowActions {name} {children}>
	{#snippet actions(close)}
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
			}}><Info size={16} />{t('common.detailsMenu')}</button
		>
		{#if id.startsWith('rig-')}
			<button
				class="row"
				role="menuitem"
				onclick={() => {
					close();
					document
						.querySelectorAll<HTMLElement>('[popover]:popover-open')
						.forEach((popover) => popover.hidePopover());
					ui.directionProject = id;
					ui.sheet = 'directions';
				}}><Compass size={16} />{t('characterActions.directions')}</button
			>
		{/if}
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				close();
				void downloadCharacterZip(id);
			}}><Download size={16} />{t('common.downloadZip')}</button
		>
		<DemoCopyRow {id} {close} />
		<hr class="bu-separator" />
		<DeleteRow
			label={t('characterActions.labelDeleteCharacter')}
			locked={id.startsWith('fixture:') ? t('characterActions.demoDeleteLocked') : ''}
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
