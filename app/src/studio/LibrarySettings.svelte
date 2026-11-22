<script lang="ts">
	import SettingsBackupCopy from './SettingsBackupCopy.svelte';
	import SettingsItemButton from './SettingsItemButton.svelte';
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { onMount, tick } from 'svelte';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import { Archive, Trash, TriangleAlert, Upload } from './icons.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DestructiveConfirmButton from './DestructiveConfirmButton.svelte';
	import { openerLabel } from './openerLabel.ts';
	import LibraryBackupButton from './LibraryBackupButton.svelte';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { app } from '../lib/app.svelte.ts';
	import { readSavedKey } from '../lib/shared-auth.ts';
	import { MAX_ZIP_BYTES } from '../lib/store/zip.ts';
	import {
		downloadArchivedBackup,
		listArchiveDownloads,
		planRestore,
		readRestoreSource,
		restoreCharacters,
		RestoreChangedError,
		type RestorePlan
	} from '../lib/store/backup.ts';
	import {
		deleteLocalWorkAndReload,
		localWorkDeletionBlocked,
		refreshRestoredLibrary
	} from './state.svelte.ts';
	import { workspaceCopy } from '../lib/store/workspace-mode.ts';
	import { downloadLibraryBackup } from './downloadLibraryBackup.ts';
	import { saveZip } from './download.svelte.ts';
	import { fileDrop } from './fileDrop.ts';

	type RestorePreview = {
		name: string;
		add: number;
		copies: number;
		skip: number;
		edited: number;
		archived: number;
		warning?: Message;
	};

	let {
		busy = $bindable(false),
		reviewing = $bindable(false)
	}: { busy?: boolean; reviewing?: boolean } = $props();
	let plan = $state.raw<RestorePlan>();
	$effect(() => {
		reviewing = !!plan;
		return () => (reviewing = false);
	});
	let archives = $state.raw({ localCount: 0, retainedIds: [] as string[] });
	const hasArchives = $derived(archives.localCount > 0 || archives.retainedIds.length > 0);
	let filename = $state('');
	let error = $state<Message | string>();
	let status = $state<Message>();
	const preview: RestorePreview | undefined = $derived(
		plan && {
			name: filename,
			add: plan.entries.filter((entry) => entry.action === 'add').length,
			copies: plan.entries.filter((entry) => entry.action === 'copy').length,
			skip: plan.entries.filter((entry) => entry.action === 'skip').length,
			edited: plan.warnings.filter((warning) => warning.code === 'editedRestore').length,
			archived: plan.source.archives?.reduce((count, pack) => count + pack.count, 0) ?? 0,
			warning: plan.source.unreadable
				? message('workspace.skippedCharacters', { count: plan.source.unreadable })
				: undefined
		}
	);
	let picker = $state<HTMLInputElement>();
	let openPicker = $state<HTMLButtonElement>();
	let review = $state<HTMLElement>();
	let keepArchived = $state(false);
	const additions = $derived(preview ? preview.add + preview.copies : 0);
	const heading = $props.id();
	const dropHint = `${heading}-drop`;
	const keys = () => [app.key, readSavedKey()];
	const today = () => new Date().toISOString().slice(0, 10);
	onMount(() => {
		void listArchiveDownloads().then(
			(downloads) => (archives = downloads),
			(cause) => (error = errorMessage(cause))
		);
	});

	async function perform(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		error = undefined;
		status = undefined;
		try {
			await action();
		} catch (cause) {
			error = errorMessage(cause);
		} finally {
			busy = false;
		}
	}

	function backup() {
		return perform(async () => {
			if (await downloadLibraryBackup()) status = message('librarySettings.backupOmissions');
		});
	}

	let confirmingDelete = $state(false);
	let deleteError = $state<Message | string>();
	let deleteNote = $state<Message>();
	let backingUp = $state(false);
	const deleteBlocked = $derived(confirmingDelete ? localWorkDeletionBlocked() : '');

	function openDeleteConfirm() {
		deleteError = undefined;
		deleteNote = undefined;
		confirmingDelete = true;
	}

	async function backupBeforeDelete() {
		deleteError = undefined;
		deleteNote = undefined;
		try {
			if (await downloadLibraryBackup()) deleteNote = message('librarySettings.backupOmissions');
		} catch (cause) {
			deleteError = errorMessage(cause);
		}
	}

	async function deleteWork() {
		if (busy || backingUp || deleteBlocked) return;
		busy = true;
		deleteError = undefined;
		try {
			await deleteLocalWorkAndReload(); // the page reloads, so busy stays set
		} catch (cause) {
			deleteError = errorMessage(cause);
			busy = false;
		}
	}

	function downloadArchive(id?: string, number?: number) {
		return perform(async () => {
			const bytes = await downloadArchivedBackup(keys(), id);
			if (bytes) saveZip(bytes, `pixeldoll-${today()}${number ? `-${number}` : ''}.archived.zip`);
			else archives = await listArchiveDownloads();
		});
	}

	let dragging = $state(false);
	const dropBlocked = () => busy || !!plan || confirmingDelete;
	const drop = fileDrop(
		dropBlocked,
		(active) => (dragging = active),
		(files) => void reviewFiles(files)
	);
	const dropActive = $derived(dragging && !dropBlocked());

	function selectFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (files.length) void reviewFiles(files);
	}

	async function reviewFiles(files: File[]) {
		if (dropBlocked()) return;
		keepArchived = false;
		await perform(async () => {
			const [file] = files;
			if (files.length !== 1 || !file) {
				error = message('openWorkspace.chooseOne');
				return;
			}
			if (file.size > MAX_ZIP_BYTES) {
				error = message('librarySettings.tooLarge');
				return;
			}
			filename = file.name;
			plan = await planRestore(
				await readRestoreSource(new Uint8Array(await file.arrayBuffer()), keys())
			);
		});
		await tick();
		(review ?? openPicker)?.focus();
	}

	async function leaveReview(save: boolean) {
		const reviewed = plan;
		if (save && reviewed && !reviewed.blockers.length) {
			await perform(async () => {
				try {
					const result = await restoreCharacters(reviewed, {
						keepArchived,
						keys: keys(),
						copyName: (name) => t('librarySettings.restoredName', { name })
					});
					plan = undefined;
					status = result.added.length
						? message('librarySettings.restored', { count: result.added.length })
						: message('librarySettings.archivedSaved');
					if (keepArchived) archives = await listArchiveDownloads();
					await refreshRestoredLibrary();
				} catch (cause) {
					if (!(cause instanceof RestoreChangedError)) throw cause;
					plan = cause.plan;
					error = message('librarySettings.changed');
				}
			});
		} else if (!save && !busy) {
			plan = undefined;
			error = undefined;
		}
		await tick();
		(review ?? openPicker)?.focus();
	}
</script>

<svelte:window
	ondragenter={drop.enter}
	ondragleave={drop.leave}
	ondragover={drop.over}
	ondrop={drop.drop}
/>

<div class="library-settings" aria-busy={busy}>
	{#if preview}
		<section
			class="restore-review"
			aria-labelledby={heading}
			data-setting="restore"
			tabindex="-1"
			bind:this={review}
		>
			<h4 class="settings-label" id={heading}>{t('librarySettings.review')}</h4>
			<p class="bu-muted settings-description filename">{preview.name}</p>
			<dl class="restore-counts">
				<div>
					<dt>{t('librarySettings.add')}</dt>
					<dd>{formatNumber(preview.add)}</dd>
				</div>
				<div>
					<dt>{t('librarySettings.copies')}</dt>
					<dd>{formatNumber(preview.copies)}</dd>
				</div>
				<div>
					<dt>{t('librarySettings.skip')}</dt>
					<dd>{formatNumber(preview.skip)}</dd>
				</div>
				{#if preview.archived}
					<div>
						<dt>{t('librarySettings.archived')}</dt>
						<dd>{formatNumber(preview.archived)}</dd>
					</div>
				{/if}
			</dl>
			{#if preview.edited}<p class="bu-muted settings-description">
					{t('librarySettings.edited')}
				</p>{/if}
			{#if preview.warning}<p class="notice warn small">
					<TriangleAlert size={14} aria-hidden="true" />{displayMessage(preview.warning)}
				</p>{/if}
			{#if plan?.blockers.length}<p class="notice bad small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />
					{t('librarySettings.incomplete')}
				</p>{/if}
			{#if preview.archived}
				<label class="check">
					<input type="checkbox" bind:checked={keepArchived} disabled={busy} />
					{t('librarySettings.keepArchived')}
				</label>
			{/if}
			<p class="bu-muted settings-description">
				{t('librarySettings.restoreHint')}
				{#if preview.archived}
					{t('librarySettings.restoreArchivedHint')}{/if}
			</p>
			<div class="restore-actions">
				<button
					type="button"
					class="btn bu-action"
					data-variant="quiet"
					disabled={busy}
					onclick={() => leaveReview(false)}
				>
					{t('common.cancel')}
				</button>
				<button
					type="button"
					class="btn primary bu-action"
					data-variant="primary"
					disabled={busy ||
						!!plan?.blockers.length ||
						(!additions && !(preview.archived && keepArchived))}
					onclick={() => leaveReview(true)}
					>{t(additions ? 'librarySettings.restore' : 'common.save')}</button
				>
			</div>
		</section>
	{:else}
		<section class="library-task">
			<LibraryBackupButton settings disabled={busy} onbackup={backup} />
			<div class="backup-notes">
				<p class="bu-muted settings-description">{t('librarySettings.scope')}</p>
			</div>
		</section>
		<hr class="bu-separator" />
		<section class="library-task">
			<input
				type="file"
				accept=".zip,application/zip"
				bind:this={picker}
				onchange={selectFile}
				oncancel={(event) => {
					event.stopPropagation();
					openPicker?.focus();
				}}
				hidden
			/>
			<SettingsItemButton
				data-setting="restore"
				disabled={busy}
				variant={dropActive ? 'primary' : 'outline'}
				aria-describedby={dropHint}
				bind:element={openPicker}
				onclick={() => picker?.click()}
			>
				<Upload size={18} aria-hidden="true" />
				{t('librarySettings.restoreFromBackup')}
				<SurfaceChevron />
			</SettingsItemButton>
			<p id={dropHint} class={['settings-description', { 'bu-muted': !dropActive }]} role="status">
				{t(dropActive ? 'openWorkspace.release' : 'librarySettings.dropHint')}
			</p>
			<p class="bu-muted settings-description">{t('librarySettings.restoreHint')}</p>
		</section>
		{#if hasArchives}
			<hr class="bu-separator" />
			<section class="library-task">
				<h4 class="settings-label">{t('librarySettings.archived')}</h4>
				{#if archives.localCount}
					<p class="bu-muted settings-description">
						{t('librarySettings.archivedHint', { count: archives.localCount })}
					</p>
				{/if}
				{#each [...(archives.localCount ? [undefined] : []), ...archives.retainedIds] as id, index (id)}
					{@const number = id ? index + (archives.localCount ? 0 : 1) : undefined}
					<SettingsItemButton disabled={busy} onclick={() => downloadArchive(id, number)}>
						<Archive size={18} aria-hidden="true" />
						{t('librarySettings.downloadArchived')}{#if number}
							({formatNumber(number)}){/if}
					</SettingsItemButton>
				{/each}
			</section>
		{/if}
	{/if}
	{#if !preview}<SettingsBackupCopy separated />{/if}
	{#if !preview && !workspaceCopy}
		<hr class="bu-separator" />
		<section class="library-task" data-setting="delete-work">
			<p class="bu-muted settings-description">{t('librarySettings.deleteWork.description')}</p>
			<button
				type="button"
				class="bu-btn delete-work"
				data-variant="danger"
				disabled={busy}
				onclick={openDeleteConfirm}
			>
				<Trash size={16} aria-hidden="true" />
				<span class="row-name">{openerLabel(t('librarySettings.deleteWork.action'))}</span>
				<SurfaceChevron />
			</button>
		</section>
	{/if}
	{#if confirmingDelete}
		<ConfirmDialog
			title={t('librarySettings.deleteWork.title')}
			action={t('librarySettings.deleteWork.deleteAll')}
			busyAction={backingUp ? t('librarySettings.deleteWork.deleteAll') : t('common.deleting')}
			busy={busy || backingUp}
			problem={deleteError
				? displayMessage(deleteError)
				: deleteBlocked
					? displayError(deleteBlocked)
					: ''}
			blocked={!!deleteBlocked}
			oncancel={() => (confirmingDelete = false)}
			onconfirm={() => void deleteWork()}
		>
			<p>{t('librarySettings.deleteWork.body')}</p>
			{#snippet actionButton(label, disabled, onconfirm)}
				{#key disabled}
					<DestructiveConfirmButton
						{label}
						confirmLabel={t('librarySettings.deleteWork.confirm')}
						{disabled}
						{onconfirm}
					/>
				{/key}
			{/snippet}
			<p class="bu-muted">{t('librarySettings.deleteWork.kept')}</p>
			<!-- While it runs, the dialog stays open and Delete waits, so the deletion never races its own backup. -->
			<LibraryBackupButton disabled={busy} bind:pending={backingUp} onbackup={backupBeforeDelete} />
			{#if deleteNote}<p class="notice warn small" role="status">
					<TriangleAlert size={14} aria-hidden="true" />{displayMessage(deleteNote)}
				</p>{/if}
		</ConfirmDialog>
	{/if}
	{#if busy}<p class="bu-muted settings-description" role="status">{t('common.preparing')}</p>{/if}
	{#if error}<p class="notice bad small" role="alert">
			<TriangleAlert size={14} aria-hidden="true" />{displayMessage(error)}
		</p>{/if}
	{#if status}<p class="settings-description" role="status">{displayMessage(status)}</p>{/if}
</div>

<style>
	.library-settings,
	.restore-review {
		display: grid;
		gap: 16px;
	}
	.library-task {
		display: grid;
		gap: 8px;
	}
	.backup-notes {
		display: grid;
		gap: 6px;
	}
	.library-settings .notice {
		margin: 0;
	}
	.library-settings hr {
		margin-block: 0;
	}
	.filename {
		overflow-wrap: anywhere;
	}
	.restore-counts {
		margin: 0;
	}
	.restore-counts div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}
	.restore-counts dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.delete-work {
		display: flex;
		align-items: center;
		gap: 8px;
		inline-size: 100%;
		min-height: 44px;
		text-align: start;
		white-space: normal;
	}
	.restore-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.restore-actions .btn {
		min-inline-size: 0;
		max-inline-size: 100%;
		height: auto;
		min-height: var(--ctl-h);
		padding-block: 8px;
		white-space: normal;
	}
</style>
