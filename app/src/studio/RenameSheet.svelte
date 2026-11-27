<script lang="ts">
	import { t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import Sheet from './Sheet.svelte';
	import { errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { ChevronRight } from './icons.ts';
	import { displayMove } from './displayMove.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import {
		CURRENT_OUTFIT_ID,
		defaultCharacterExportId,
		itemExportId,
		itemExportIdTaken,
		MAX_EXPORT_ID_LENGTH,
		moveExportId,
		moveExportIdTaken,
		clearsStandingAlias,
		outfitExportIdTaken,
		reservedMoveExportId,
		validExportId
	} from '../lib/store/identity.ts';
	import { ui, doc, store, saveIdentity, renameOutfit } from './state.svelte.ts';
	const target = ui.renameTarget ?? { projectId: doc.id };
	const m = store.project?.manifest;
	const item = target.itemId && m?.items.find((entry) => entry.id === target.itemId);
	const outfit = target.outfitId && m?.presets.find((entry) => entry.id === target.outfitId);
	const move = target.moveId && m?.rig.animations.find((entry) => entry.id === target.moveId);
	const character = store.projects.find((entry) => entry.id === target.projectId);
	const missing = target.itemId
		? !item && t('renameSheet.itemMissing')
		: target.outfitId
			? !outfit && t('renameSheet.outfitMissing')
			: target.moveId
				? !move && t('renameSheet.moveMissing')
				: false;
	const originalName =
		(item
			? item.name
			: outfit
				? outfit.name
				: move
					? (move.name ?? displayMove(move.id))
					: character?.name) ?? '';
	const originalId = item
		? itemExportId(item)
		: outfit
			? outfit.id
			: move
				? moveExportId(move, m?.rig.animations)
				: (character?.exportId ?? defaultCharacterExportId(target.projectId));
	// Engines and RPG Maker sheets start from the standing move's fixed ID.
	const idLocked = !!move && move.id === DEFAULT_MOVE;
	let name = $state(originalName);
	let exportId = $state(originalId);
	let busy = $state(false),
		error = $state.raw<Message | null>(null);
	const nameChanged = $derived(name.trim() !== originalName);
	const idChanged = $derived(exportId !== originalId);
	const characterConflict = $derived(
		!target.itemId &&
			!target.outfitId &&
			!target.moveId &&
			store.projects.some((entry) => entry.id !== target.projectId && entry.exportId === exportId)
	);
	const idError = $derived(
		!idChanged
			? ''
			: move &&
				  exportId === 'standing' &&
				  !clearsStandingAlias(m?.rig.animations ?? [], move.id, exportId)
				? t('renameSheet.defaultMoveExportId')
				: !validExportId(exportId) ||
					  (outfit && exportId === CURRENT_OUTFIT_ID) ||
					  (move &&
							reservedMoveExportId(exportId) &&
							!clearsStandingAlias(m?.rig.animations ?? [], move.id, exportId))
					? t('renameSheet.invalidExportId')
					: item && m && itemExportIdTaken(m.items, item.id, exportId)
						? t('renameSheet.duplicateExportId')
						: outfit && m && outfitExportIdTaken(m.presets, outfit.id, exportId)
							? t('renameSheet.duplicateOutfitExportId')
							: move && m && moveExportIdTaken(m.rig.animations, move.id, exportId)
								? t('renameSheet.duplicateMoveExportId')
								: ''
	);
	const canSave = $derived(
		!missing && !busy && !!name.trim() && !idError && (nameChanged || idChanged)
	);
	function close() {
		ui.renameTarget = null;
		ui.sheet = null;
	}
	/** Back to the sheet Rename was opened from (item details), as after a save. */
	function back() {
		const to = target.back;
		ui.renameTarget = null;
		ui.sheet = to ?? null;
	}
	async function save() {
		if (!canSave) return;
		busy = true;
		error = null;
		const newName = nameChanged ? name.trim() : undefined,
			newId = idChanged ? exportId : undefined;
		try {
			if (outfit) renameOutfit(outfit.id, newName, newId);
			else
				await saveIdentity(
					target.projectId,
					{ itemId: target.itemId, moveId: target.moveId },
					newName,
					newId
				);
			if (ui.sheet === 'rename' && ui.renameTarget === target) back();
		} catch (e) {
			error = message('renameSheet.couldNotRename', { reason: errorMessage(e) });
		} finally {
			busy = false;
		}
	}
</script>

<Sheet
	title={target.itemId
		? t('renameSheet.titleRenameItem')
		: target.outfitId
			? t('renameSheet.titleRenameOutfit')
			: target.moveId
				? t('renameSheet.titleRenameMove')
				: t('renameSheet.titleRenameCharacter')}
	locked={busy}
	back={target.back ? back : undefined}
	backDiscards
	backTo={target.back === 'item'
		? t('studio.titleItem')
		: target.back === 'details'
			? (store.projects.find((project) => project.id === target.projectId)?.name ?? name)
			: target.back === 'clip'
				? name
				: undefined}
	dirty={nameChanged || idChanged}
	onclose={close}
>
	{#if missing}
		<p class="bu-notice" data-size="compact" data-tone="danger" role="alert">{missing}</p>
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
					readonly={idLocked}
					autocapitalize="off"
					autocomplete="off"
					spellcheck={false}
					aria-invalid={!!idError}
					aria-labelledby="rename-export-id-label"
					aria-describedby="rename-export-id-help"
				/>
				<p id="rename-export-id-help" class="small" aria-live="polite">
					{idError ||
						(idLocked ? t('renameSheet.defaultMoveExportId') : t('renameSheet.exportIdHelp'))}
				</p>
				{#if characterConflict}<p
						class="bu-notice"
						data-size="compact"
						data-tone="neutral"
						role="status"
					>
						{t('renameSheet.characterIdConflict')}
					</p>{/if}
			</details>
		</form>
	{/if}
	{#if error}<p class="bu-notice" data-size="compact" data-tone="danger" role="alert">
			{displayNestedMessage(error)}<ReportButton {error} />
		</p>{/if}
	{#snippet footer()}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			type="submit"
			form="rename-identity-form"
			disabled={!canSave}>{busy ? t('directionsSheet.saving') : t('common.save')}</button
		>
	{/snippet}
</Sheet>

<style>
	summary {
		justify-content: space-between;
		min-block-size: 44px;
	}
	.disclosure[open] > summary > :global(svg) {
		transform: rotate(90deg);
	}
	.export-id {
		font-family: var(--font-mono);
	}
</style>
