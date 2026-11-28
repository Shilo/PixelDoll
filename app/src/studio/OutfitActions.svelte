<script lang="ts">
	// An outfit row with its ⋮ (and right-click) menu. Like every object's menu it ends with Rename, Download ZIP and Move to
	// Trash, which asks first like a move's (docs/design/menus-and-details.md). An outfit saved on a demo has no Trash: Delete
	// asks first too, and Undo brings it back until a reload.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import RowActions from './RowActions.svelte';
	import RenameRow from './RenameRow.svelte';
	import DeleteRow from './DeleteRow.svelte';
	import TrashDialog from './TrashDialog.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { successorFocus } from './experience/focus.ts';
	import { Download } from './icons.ts';
	import { doc, openRename } from './state.svelte.ts';
	import { downloadOutfitZip } from './download.svelte.ts';
	import {
		outfitHasTrash,
		outfitLocked,
		deleteDemoOutfit,
		removeOutfit
	} from './outfitActions.svelte.ts';

	let {
		id,
		name,
		fallback,
		children
	}: {
		id: string;
		name: string;
		/** Takes focus when the last outfit goes. */
		fallback: () => HTMLElement | undefined;
		children: Snippet;
	} = $props();
	let entry = $state<HTMLElement>();
	let trashing = $state(false),
		deleting = $state(false);
</script>

<RowActions {name} key={id} bind:entry {children}>
	{#snippet actions(close)}
		<RenameRow
			trail="outfitActions.rename"
			onclick={() => {
				close();
				openRename(doc.id, { outfitId: id });
			}}
		/>
		<button
			class="row"
			role="menuitem"
			data-trail="outfitActions.download"
			onclick={() => {
				close();
				void downloadOutfitZip(id);
			}}><Download size={16} />{t('common.downloadZip')}</button
		>
		<hr class="bu-separator" />
		{#if outfitHasTrash()}
			<DeleteRow
				opens
				label={t('savedActions.labelDeleteOutfit')}
				trail="outfitActions.delete"
				onclick={() => {
					close();
					trashing = true;
				}}
			/>
		{:else}
			<DeleteRow
				opens
				label={t('savedActions.labelDeleteDemoOutfit')}
				trail="outfitActions.deleteDemo"
				locked={outfitLocked(id) ? t('savedActions.demoOutfitLocked') : ''}
				onclick={() => {
					close();
					deleting = true;
				}}
			/>
		{/if}
	{/snippet}
</RowActions>
{#if deleting}
	<ConfirmDialog
		title={t('savedActions.deleteDemoOutfitTitle', { name })}
		action={t('common.delete')}
		oncancel={() => (deleting = false)}
		onconfirm={() => {
			const land = successorFocus(entry, fallback);
			deleteDemoOutfit(id);
			deleting = false;
			void land();
		}}><p>{t('savedActions.deleteDemoOutfit')}</p></ConfirmDialog
	>
{/if}
{#if trashing}
	<TrashDialog
		{name}
		body={t('savedActions.removeOutfit')}
		oncancel={() => (trashing = false)}
		onconfirm={async () => {
			const land = successorFocus(entry, fallback);
			await removeOutfit(id);
			trashing = false;
			await land();
		}}
	/>
{/if}
