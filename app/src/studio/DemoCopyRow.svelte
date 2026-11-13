<script lang="ts">
	import { copyDemo, doc, openProject, toast } from './state.svelte.ts';
	import { Copy } from './icons.ts';
	let { id, close }: { id: string; close: () => void } = $props();
	let busy = $state(false);
	async function editCopy() {
		if (busy) return;
		busy = true;
		close();
		try {
			if (doc.id !== id) await openProject(id);
			if (doc.id !== id || doc.loading || doc.error) return;
			const copyId = await copyDemo();
			if (doc.id === copyId) toast('Opened your editable copy of the demo. No generations used.');
		} catch (error) {
			toast(`Could not copy the demo: ${(error as Error).message}`, { tone: 'danger' });
		} finally {
			busy = false;
		}
	}
</script>

{#if id.startsWith('fixture:')}
	<button class="row" role="menuitem" disabled={busy} onclick={editCopy}>
		<Copy size={16} /><span class="row-name">Edit a copy</span>
	</button>
{/if}
