<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { ui, doc, store, deletionBlocked, removeProject } from './state.svelte.ts';
	import { downloadCharacterZip } from './download.svelte.ts';
	import { Trash, TriangleAlert } from './icons.ts';
	let busy = $state(false),
		error = $state('');
	const id = $derived(ui.deleting || doc.id);
	const reason = $derived(deletionBlocked(id));
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

<Sheet
	title="Delete character?"
	cancelDisabled={busy}
	onclose={() => {
		if (!busy) ui.sheet = null;
	}}
>
	<p>
		Delete <strong>{store.projects.find((project) => project.id === id)?.name}</strong> from this device?
	</p>
	<p class="muted">
		This removes its items, outfits, and local changes. This cannot be undone. Export a ZIP first if
		you want to keep a copy. Items copied to other characters stay.
	</p>
	<p class="faint small">Your original character in PixelLab stays in your PixelLab account.</p>
	{#if reason || error}<p class="notice warn small" role="alert">
			<TriangleAlert size={16} /><span>{error || reason}</span>
		</p>{/if}
	{#snippet footer()}
		<button
			class="bu-action btn"
			data-variant="outline"
			disabled={busy}
			onclick={() => void downloadCharacterZip(id)}>Download a copy</button
		>
		<button
			class="bu-action btn danger"
			data-variant="outline"
			disabled={busy || !!reason}
			onclick={remove}><Trash size={16} />{busy ? 'Deleting…' : 'Delete character'}</button
		>
	{/snippet}
</Sheet>
