<script lang="ts">
	import { message } from '../lib/message.ts';
	import { t } from 'svelte-whisper';
	import { copyDemo, doc, openProject, toast, ui } from './state.svelte.ts';
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
			if (doc.id !== copyId) return;
			// The demo's View and edit window would hide the copy it just opened.
			if (ui.sheet === 'details') ui.sheet = null;
			toast(message('demoCopyRow.openedYourEditableCopyOfTheDemo'));
		} catch (error) {
			toast(message('state.couldNotCopyTheDemoReason', { reason: (error as Error).message }), {
				tone: 'danger',
				error
			});
		} finally {
			busy = false;
		}
	}
</script>

{#if id.startsWith('fixture:')}
	<button class="row" role="menuitem" data-trail="demo.editCopy" disabled={busy} onclick={editCopy}>
		<Copy size={16} /><span class="row-name">{t('demoCopyRow.editACopy')}</span>
	</button>
{/if}
