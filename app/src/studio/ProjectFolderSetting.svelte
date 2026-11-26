<script lang="ts">
	// Settings > Export's "Project folder" row for the open character. Nothing where the browser cannot write folders; in
	// Brave with the API switched off, a short hint on turning it on.
	import { t } from 'svelte-whisper';
	import type { Engine } from '../lib/store/manifest.ts';
	import { BRAVE_FLAG } from '../lib/project-folder/support.ts';
	import { exportFormatNames } from './exportFormatNames.ts';
	import { Copy, FolderOpen, TriangleAlert } from './icons.ts';
	import {
		checkFolderSupport,
		keepProjectFolderFiles,
		linkProjectFolder,
		loadFolderLink,
		projectFolder,
		publishProjectFolder,
		reconnectProjectFolder,
		releaseKeptFiles,
		setFolderAutoPublish,
		unlinkProjectFolder
	} from './projectFolder.svelte.ts';
	import { doc } from './state.svelte.ts';

	let { engine, disabled = false }: { engine: Engine; disabled?: boolean } = $props();

	let copied = $state(false);
	let busy = $state(false);

	$effect(() => {
		void checkFolderSupport();
		void loadFolderLink(doc.id);
	});

	const link = $derived(projectFolder.link);
	const status = $derived(projectFolder.status);
	const working = $derived(busy || status.kind === 'publishing');

	async function copyFlag() {
		try {
			await navigator.clipboard.writeText(BRAVE_FLAG);
			copied = true;
		} catch (error) {
			console.warn('Could not copy the Brave flag', error);
		}
	}
	/** Runs a click's action with the buttons disabled, without ever rejecting. */
	async function act(work: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		try {
			await work();
		} catch (error) {
			console.warn('Project folder action failed', error);
		} finally {
			busy = false;
		}
	}
	// Each runs synchronously from its click, so the browser still sees the user's gesture.
	const choose = () => act(() => linkProjectFolder(engine));
	const reconnect = () => act(() => reconnectProjectFolder());
	const conflicts = $derived(status.kind === 'blocked' ? status.conflicts : []);
	/** A folder sitting where a file belongs cannot be replaced by a file: the user moves it (or keeps it). */
	const replaceable = $derived(conflicts.every((c) => c.reason !== 'folder' && c.found));
	// Approves exactly the bytes listed here; anything changed after this list appeared pauses again.
	const conflictLink = $derived(status.kind === 'blocked' ? status.linkedAt : '');
	const replace = () =>
		act(() =>
			publishProjectFolder(new Map(conflicts.map((c) => [c.path, c.found!])), conflictLink)
		);
	const keep = () =>
		act(() =>
			keepProjectFolderFiles(
				conflicts.map((c) => c.path),
				conflictLink
			)
		);
	const problem = $derived.by(() => {
		switch (status.kind) {
			case 'reconnect':
				return t('projectFolder.status.reconnect');
			case 'missing':
				return t('projectFolder.status.missing');
			case 'taken':
				return t('projectFolder.status.taken');
			case 'blocked':
				return replaceable
					? t('projectFolder.status.blocked', { count: conflicts.length })
					: t('projectFolder.status.folder');
			case 'unavailable':
				return t('projectFolder.status.unavailable');
			case 'failed':
				return status.reason === 'locked'
					? t('projectFolder.status.locked')
					: status.reason === 'space'
						? t('projectFolder.status.space')
						: status.reason === 'permission'
							? t('projectFolder.status.permission')
							: t('projectFolder.status.failed');
			default:
				return '';
		}
	});
</script>

{#if projectFolder.support === 'brave-disabled' || projectFolder.support === 'supported'}
	<hr class="bu-separator export-divider" />
	<div class="export-dressed project-folder" data-setting="project-folder" tabindex="-1">
		<span class="settings-label" id="project-folder-label">{t('projectFolder.title')}</span>
		<p class="bu-muted settings-description">{t('projectFolder.hint')}</p>
		{#if projectFolder.support === 'brave-disabled'}
			<p class="small folder-text">
				{t('projectFolder.brave', { flag: BRAVE_FLAG })}
				<button type="button" class="bu-action btn sm plain" onclick={copyFlag}
					><Copy size={14} aria-hidden="true" />{copied
						? t('projectFolder.copied')
						: t('projectFolder.copy')}</button
				>
			</p>
		{:else if !link}
			<button type="button" class="bu-action btn sm" disabled={disabled || working} onclick={choose}
				><FolderOpen size={16} aria-hidden="true" />{t('projectFolder.choose')}</button
			>
			{#if problem}<p class="notice warn small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />{problem}
				</p>{/if}
		{:else}
			<p class="small folder-text">
				<span class="folder-path">{link.handle.name}/{link.subfolder}/</span>
				<span class="bu-muted"
					>· {exportFormatNames[link.engine as keyof typeof exportFormatNames] ?? link.engine}</span
				>
			</p>
			<label class="check">
				<input
					type="checkbox"
					checked={link.auto}
					disabled={working}
					onchange={(e) => void setFolderAutoPublish(e.currentTarget.checked)}
				/>
				<span>{t('projectFolder.auto')}</span>
			</label>
			<p class="small folder-text" role="status" aria-live="polite">
				{status.kind === 'publishing'
					? t('projectFolder.status.publishing')
					: status.kind === 'done'
						? t('projectFolder.status.done')
						: ''}
			</p>
			{#if problem}
				<div class="notice warn small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />
					<div>
						{problem}
						{#if conflicts.length}<ul class="mono conflicts">
								{#each conflicts as conflict (conflict.path)}<li>{conflict.path}</li>{/each}
							</ul>{/if}
					</div>
				</div>
			{/if}
			{#if status.kind === 'done' && status.kept}
				<p class="small folder-text">
					{t('projectFolder.kept', { count: status.kept })}
					<button
						type="button"
						class="bu-action btn sm plain"
						disabled={working}
						onclick={() => act(() => releaseKeptFiles())}>{t('projectFolder.updateKept')}</button
					>
				</p>
			{/if}
			<div class="folder-actions">
				{#if status.kind === 'reconnect'}
					<button
						type="button"
						class="bu-action btn sm primary"
						disabled={working}
						onclick={reconnect}>{t('projectFolder.reconnect')}</button
					>
				{:else if status.kind === 'blocked'}
					{#if replaceable}<button
							type="button"
							class="bu-action btn sm"
							disabled={working}
							onclick={replace}>{t('projectFolder.replace')}</button
						>{/if}
					<button type="button" class="bu-action btn sm" disabled={working} onclick={keep}
						>{t('projectFolder.keep')}</button
					>
				{:else if status.kind !== 'missing'}
					<button
						type="button"
						class="bu-action btn sm"
						disabled={disabled || working}
						onclick={() => act(() => publishProjectFolder())}
						>{t('projectFolder.publishNow')}</button
					>
				{/if}
				<button
					type="button"
					class="bu-action btn sm plain"
					disabled={disabled || working}
					onclick={choose}>{t('projectFolder.change')}</button
				>
				<button
					type="button"
					class="bu-action btn sm plain"
					disabled={working}
					onclick={() => act(() => unlinkProjectFolder())}>{t('projectFolder.stop')}</button
				>
			</div>
		{/if}
	</div>
{/if}

<style>
	.project-folder {
		display: grid;
		gap: 8px;
		justify-items: start;
	}
	.project-folder p {
		margin: 0;
	}
	.folder-text {
		overflow-wrap: anywhere;
	}
	.folder-text:empty {
		display: none;
	}
	.folder-path {
		font-family: var(--mono, ui-monospace, monospace);
		word-break: break-all;
	}
	.folder-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
	}
	.conflicts {
		margin: 4px 0 0;
		padding-left: 16px;
		max-height: 120px;
		overflow: auto;
		overflow-wrap: anywhere;
	}
</style>
