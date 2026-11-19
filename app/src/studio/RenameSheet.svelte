<script lang="ts">
	import { t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import { errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { ui, doc, store, renameProject } from './state.svelte.ts';
	let name = $state(store.projects.find((p) => p.id === doc.id)?.name ?? '');
	let busy = $state(false),
		error = $state.raw<Message | null>(null);
	async function save() {
		if (!name.trim() || busy) return;
		busy = true;
		error = null;
		try {
			await renameProject(name.trim());
			ui.sheet = null;
		} catch (e) {
			error = message('renameSheet.couldNotRename', { reason: errorMessage(e) });
		} finally {
			busy = false;
		}
	}
</script>

<Sheet
	title={t('renameSheet.titleRenameCharacter')}
	cancelDisabled={busy}
	onclose={() => (ui.sheet = null)}
>
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault();
			void save();
		}}
	>
		<label class="field"
			><span class="label">{t('common.name')}</span><input
				class="bu-input input"
				type="text"
				bind:value={name}
				maxlength="60"
				disabled={busy}
			/></label
		>
	</form>
	{#if error}<p class="notice bad small" role="alert">{displayNestedMessage(error)}</p>{/if}
	{#snippet footer()}
		<span class="foot-note">{t('renameSheet.alsoTheNameInYourExports')}</span>
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={!name.trim() || busy}
			onclick={save}>{t('common.save')}</button
		>
	{/snippet}
</Sheet>
