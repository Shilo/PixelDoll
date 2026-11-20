<script lang="ts">
	import { t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import { errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { ChevronRight } from './icons.ts';
	import {
		defaultCharacterExportId,
		itemExportId,
		itemExportIdTaken,
		MAX_EXPORT_ID_LENGTH,
		validExportId
	} from '../lib/store/identity.ts';
	import { ui, doc, store, saveIdentity } from './state.svelte.ts';
	const target = ui.renameTarget ?? { projectId: doc.id };
	const item =
		target.itemId && store.project?.manifest.items.find((entry) => entry.id === target.itemId);
	const character = store.projects.find((entry) => entry.id === target.projectId);
	const missingItem = !!target.itemId && !item;
	const originalName = (item ? item.name : character?.name) ?? '';
	const originalId = item
		? itemExportId(item)
		: (character?.exportId ?? defaultCharacterExportId(target.projectId));
	let name = $state(originalName);
	let exportId = $state(originalId);
	let busy = $state(false),
		error = $state.raw<Message | null>(null);
	const nameChanged = $derived(name.trim() !== originalName);
	const idChanged = $derived(exportId !== originalId);
	const characterConflict = $derived(
		!target.itemId &&
			store.projects.some((entry) => entry.id !== target.projectId && entry.exportId === exportId)
	);
	const idError = $derived(
		!idChanged
			? ''
			: !validExportId(exportId)
				? t('renameSheet.invalidExportId')
				: target.itemId &&
					  store.project &&
					  itemExportIdTaken(store.project.manifest.items, target.itemId, exportId)
					? t('renameSheet.duplicateExportId')
					: ''
	);
	const canSave = $derived(
		!missingItem && !busy && !!name.trim() && !idError && (nameChanged || idChanged)
	);
	function close() {
		ui.renameTarget = null;
		ui.sheet = null;
	}
	async function save() {
		if (!canSave) return;
		busy = true;
		error = null;
		try {
			await saveIdentity(
				target.projectId,
				target.itemId,
				nameChanged ? name.trim() : undefined,
				idChanged ? exportId : undefined
			);
			if (ui.sheet === 'rename' && ui.renameTarget === target) close();
		} catch (e) {
			error = message('renameSheet.couldNotRename', { reason: errorMessage(e) });
		} finally {
			busy = false;
		}
	}
</script>

<Sheet
	title={target.itemId ? t('renameSheet.titleRenameItem') : t('renameSheet.titleRenameCharacter')}
	cancelDisabled={busy}
	onclose={close}
>
	{#if missingItem}
		<p class="notice bad small" role="alert">{t('renameSheet.itemMissing')}</p>
	{:else}
		<form
			class="form"
			id="rename-identity-form"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<label class="field"
				><span class="label">{t('renameSheet.displayName')}</span><input
					class="bu-input input"
					type="text"
					bind:value={name}
					maxlength="60"
					disabled={busy}
				/></label
			>
			<details class="disclosure">
				<summary>
					<span id="rename-export-id-label">{t('renameSheet.exportId')}</span>
					<ChevronRight size={14} aria-hidden="true" />
				</summary>
				<input
					class="bu-input input export-id"
					type="text"
					bind:value={exportId}
					maxlength={MAX_EXPORT_ID_LENGTH}
					disabled={busy}
					autocapitalize="off"
					autocomplete="off"
					spellcheck={false}
					aria-invalid={!!idError}
					aria-labelledby="rename-export-id-label"
					aria-describedby="rename-export-id-help"
				/>
				<p id="rename-export-id-help" class="small" aria-live="polite">
					{idError || t('renameSheet.exportIdHelp')}
				</p>
				{#if characterConflict}<p class="notice small" role="status">
						{t('renameSheet.characterIdConflict')}
					</p>{/if}
			</details>
		</form>
	{/if}
	{#if error}<p class="notice bad small" role="alert">{displayNestedMessage(error)}</p>{/if}
	{#snippet footer()}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			type="submit"
			form="rename-identity-form"
			disabled={!canSave}>{t('common.save')}</button
		>
	{/snippet}
</Sheet>

<style>
	summary {
		justify-content: space-between;
		min-block-size: 44px;
	}
	.export-id {
		font-family: var(--font-mono);
	}
</style>
