<script lang="ts">
	// An outfit row with its ⋮ (and right-click) menu. Like every object's menu it ends with Rename, Download ZIP and Move to
	// Trash, which asks first like a move's (docs/design/menus-and-details.md).
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import RowActions from './RowActions.svelte';
	import RenameRow from './RenameRow.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import TrashDialog from './TrashDialog.svelte';
	import { Download } from './icons.ts';
	import { doc, openRename } from './state.svelte.ts';
	import { downloadOutfitZip } from './download.svelte.ts';
	import { outfitTrashLocked, removeOutfit } from './outfitActions.svelte.ts';

	let { id, name, children }: { id: string; name: string; children: Snippet } = $props();
	let trashing = $state(false);
</script>

<RowActions {name} {children}>
	{#snippet actions(close)}
		<RenameRow
			onclick={() => {
				close();
				openRename(doc.id, { outfitId: id });
			}}
		/>
		<button
			class="row"
			role="menuitem"
			onclick={() => {
				close();
				void downloadOutfitZip(id);
			}}><Download size={16} />{t('common.downloadZip')}</button
		>
		<hr class="bu-separator" />
		<DeleteRow
			opens
			label={t('savedActions.labelDeleteOutfit')}
			locked={outfitTrashLocked() ? t('savedActions.demoOutfitLocked') : ''}
			onclick={() => {
				close();
				trashing = true;
			}}
		/>
	{/snippet}
</RowActions>
{#if trashing}
	<TrashDialog
		{name}
		body={t('savedActions.removeOutfit')}
		oncancel={() => (trashing = false)}
		onconfirm={async () => {
			await removeOutfit(id);
			trashing = false;
		}}
	/>
{/if}
