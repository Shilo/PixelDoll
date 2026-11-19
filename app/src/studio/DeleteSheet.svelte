<script lang="ts">
	import ConfirmDialog from './ConfirmDialog.svelte';
	import {
		DELETE_GENERATION_BLOCK,
		ui,
		doc,
		store,
		deletionBlocked,
		removeProject
	} from './state.svelte.ts';
	let busy = $state(false),
		error = $state('');
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
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet viewPending()}
	<button class="bu-btn" onclick={() => (ui.sheet = 'activity')}>View pending work</button>
{/snippet}

<ConfirmDialog
	title="Delete {store.projects.find((project) => project.id === id)?.name ?? 'character'}?"
	action="Delete"
	busyAction="Deleting…"
	{busy}
	problem={error || reason}
	problemAction={reason === DELETE_GENERATION_BLOCK ? viewPending : undefined}
	blocked={!!reason}
	oncancel={() => (ui.sheet = null)}
	onconfirm={() => void remove()}
	><p>
		Its outfits and changes are removed from this device. Items copied to other characters stay.
		This can't be undone.
	</p></ConfirmDialog
>
