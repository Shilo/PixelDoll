<script lang="ts">
	import { t } from 'svelte-whisper';
	import { displayMessage, displayError, errorMessage } from '../lib/i18n.ts';
	import type { Message } from '../lib/message.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { ui, doc, store, deletionBlocked, removeProject } from './state.svelte.ts';
	let busy = $state(false),
		error = $state<string | Message>('');
	const id = $derived(ui.deleting || doc.id);
	const reason = $derived(deletionBlocked(id));
	// Like a sheet, a deletion in progress holds browser Back and app updates until it settles.
	$effect(() => {
		ui.sheetBusy = busy;
		return () => {
			ui.sheetBusy = false;
		};
	});
	async function remove() {
		if (busy || reason) return;
		busy = true;
		error = '';
		try {
			await removeProject(id);
			ui.sheet = null;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

<ConfirmDialog
	title={t('common.deleteNamed', {
		name: store.projects.find((project) => project.id === id)?.name ?? t('deleteSheet.character')
	})}
	action={t('common.delete')}
	busyAction={t('common.deleting')}
	{busy}
	problem={error ? displayMessage(error) : displayError(reason)}
	blocked={!!reason}
	oncancel={() => (ui.sheet = null)}
	onconfirm={() => void remove()}
	><p>
		{t('deleteSheet.itsOutfitsAndChangesAreRemovedFrom')}
	</p></ConfirmDialog
>
