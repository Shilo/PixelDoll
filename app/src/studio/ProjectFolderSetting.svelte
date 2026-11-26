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
		linkProjectFolder,
		loadFolderLink,
		projectFolder,
		publishProjectFolder,
		reconnectProjectFolder,
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
	const replace = () =>
		status.kind === 'blocked' &&
		act(() =>
			publishProjectFolder(
				new Map(status.conflicts.map((c) => [c.path, c.found ?? '']) as [string, string][])
			)
		);
	const problem = $derived.by(() => {
		switch (status.kind) {
			case 'reconnect':
				return t('projectFolder.status.reconnect');
			case 'missing':
				return t('projectFolder.status.missing');
			case 'blocked':
				return t('projectFolder.status.blocked', { count: status.conflicts.length });
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
			<p class="folder-actions">
				<button type="button" class="bu-action btn" disabled={disabled || working} onclick={choose}
					><FolderOpen size={16} aria-hidden="true" />{t('projectFolder.choose')}</button
				>
			</p>
			{#if problem}<p class="notice warn small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />{problem}
				</p>{/if}
		{:else}
			<p class="small mono folder-text">
				{t('projectFolder.linked', {
					path: `${link.handle.name}/${link.subfolder}/`,
					format: exportFormatNames[link.engine as keyof typeof exportFormatNames] ?? link.engine
				})}
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
						{#if status.kind === 'blocked'}<ul class="mono conflicts">
								{#each status.conflicts as conflict (conflict.path)}<li>{conflict.path}</li>{/each}
							</ul>{/if}
					</div>
				</div>
			{/if}
			{#if projectFolder.unsaved}<p class="notice warn small">{t('projectFolder.unsaved')}</p>{/if}
			<p class="folder-actions">
				{#if status.kind === 'reconnect'}
					<button type="button" class="bu-action btn primary" disabled={working} onclick={reconnect}
						>{t('projectFolder.reconnect')}</button
					>
				{:else if status.kind === 'blocked'}
					<button type="button" class="bu-action btn" disabled={working} onclick={replace}
						>{t('projectFolder.replace')}</button
					>
				{:else if status.kind !== 'missing'}
					<button
						type="button"
						class="bu-action btn"
						disabled={disabled || working}
						onclick={() => act(() => publishProjectFolder())}
						>{t('projectFolder.publishNow')}</button
					>
				{/if}
				<button
					type="button"
					class="bu-action btn plain"
					disabled={disabled || working}
					onclick={choose}>{t('projectFolder.change')}</button
				>
				<button
					type="button"
					class="bu-action btn plain"
					disabled={working}
					onclick={() => act(() => unlinkProjectFolder())}>{t('projectFolder.stop')}</button
				>
			</p>
		{/if}
	</div>
{/if}

<style>
	.project-folder p {
		margin: 0;
	}
	.folder-text {
		overflow-wrap: anywhere;
	}
	.folder-text:empty {
		display: none;
	}
	.folder-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.conflicts {
		margin: 4px 0 0;
		padding-left: 16px;
		max-height: 120px;
		overflow: auto;
		overflow-wrap: anywhere;
	}
</style>
