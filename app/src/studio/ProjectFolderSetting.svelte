<script lang="ts">
	// Settings > Export's "Project folder" section for the open character: where it publishes, its state, and actions.
	// Nothing where the browser cannot write folders; in Brave with the API switched off, a short hint on turning it on.
	import { t } from 'svelte-whisper';
	import type { Engine } from '../lib/store/manifest.ts';
	import type { PlanAction } from '../lib/project-folder/plan.ts';
	import { BRAVE_FLAG } from '../lib/project-folder/support.ts';
	import { exportFormatNames } from './exportFormatNames.ts';
	import {
		Check,
		Copy,
		FileCheck,
		FolderOpen,
		Link,
		ListChecks,
		RefreshCw,
		Replace,
		RotateCcw,
		TriangleAlert,
		Unlink
	} from './icons.ts';
	import {
		adoptMatchingFiles,
		checkFolderSupport,
		keepProjectFolderFiles,
		leaveMatchingFiles,
		linkProjectFolder,
		loadFolderLink,
		projectFolder,
		publishProjectFolder,
		reconnectProjectFolder,
		releaseKeptFiles,
		setFolderAutoPublish,
		unlinkProjectFolder,
		updatedLabel
	} from './projectFolder.svelte.ts';
	import { doc } from './state.svelte.ts';

	let { engine, disabled = false }: { engine: Engine; disabled?: boolean } = $props();

	let copied = $state('');
	let busy = $state(false);
	let now = $state(Date.now());

	$effect(() => {
		void checkFolderSupport();
		void loadFolderLink(doc.id);
	});
	// Keeps "Updated 2 minutes ago" current while Settings stays open.
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	const link = $derived(projectFolder.link);
	const status = $derived(projectFolder.status);
	// Only this row's own click disables its buttons: a background update leaves them usable (a click then queues
	// behind it), so keyboard focus is never dropped by a button turning disabled under it.
	const working = $derived(busy);
	const conflicts = $derived(status.kind === 'blocked' ? status.conflicts : []);
	const offer = $derived(
		projectFolder.offer && projectFolder.offer.linkedAt === link?.linkedAt
			? projectFolder.offer
			: null
	);
	const conflictLink = $derived(status.kind === 'blocked' ? status.linkedAt : '');
	/** A folder sitting where a file belongs cannot be replaced by a file: the user moves it (or keeps it). */
	const replaceable = $derived(conflicts.every((c) => c.reason !== 'folder' && c.found));
	const formatName = $derived(
		link ? (exportFormatNames[link.engine as keyof typeof exportFormatNames] ?? link.engine) : ''
	);

	/** Copies a value, showing "Copied" on the button that asked. Where the clipboard is blocked, the shown text is
	 *  selected instead, ready for Ctrl+C. */
	async function copy(value: string, key: string, shown?: Element | null) {
		try {
			await navigator.clipboard.writeText(value);
			copied = key;
		} catch (error) {
			console.warn('Could not copy', error);
			if (shown) getSelection()?.selectAllChildren(shown);
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
	const update = () => act(() => publishProjectFolder());
	// Approves exactly the bytes listed here; anything changed after this list appeared asks again.
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
	const reason = (c: PlanAction) =>
		t(
			c.reason === 'deleted'
				? 'projectFolder.reason.deleted'
				: c.reason === 'folder'
					? 'projectFolder.reason.folder'
					: c.reason === 'not-ours'
						? 'projectFolder.reason.notOurs'
						: 'projectFolder.reason.edited'
		);
	const fullPath = (path: string) =>
		link ? `${link.handle.name}/${link.subfolder}/${path}` : path;
	const problem = $derived.by(() => {
		switch (status.kind) {
			case 'reconnect':
				return t('projectFolder.status.reconnect');
			case 'missing':
				return t('projectFolder.status.missing');
			case 'taken':
				return t('projectFolder.status.taken');
			case 'blocked':
				return t('projectFolder.status.blocked');
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
	/** Announced when it changes: Updating…, Up to date, Already up to date, kept files. */
	const summary = $derived.by(() => {
		if (status.kind === 'publishing') return t('projectFolder.status.publishing');
		// Only a finished check says "Up to date"; a link that was just loaded has not been checked yet.
		if (status.kind !== 'done') return '';
		const parts = [
			status.already ? t('projectFolder.status.already') : t('projectFolder.status.done')
		];
		if (status.kept) parts.push(t('projectFolder.kept', { count: status.kept }));
		return parts.join(' · ');
	});
	/** Shown beside it but never announced, since it changes every minute on its own. */
	const updated = $derived(
		(status.kind === 'done' || status.kind === 'idle') && link?.publishedAt
			? updatedLabel(link.publishedAt, now)
			: ''
	);
</script>

{#if projectFolder.support === 'brave-disabled' || projectFolder.support === 'supported'}
	<hr class="bu-separator export-divider" />
	<section
		class="export-dressed project-folder"
		data-setting="project-folder"
		tabindex="-1"
		aria-labelledby="project-folder-title"
	>
		<h3 class="settings-label" id="project-folder-title" tabindex="-1" data-reveal-focus>
			{t('projectFolder.title')}
		</h3>
		{#if projectFolder.support === 'brave-disabled'}
			<p class="bu-muted settings-description">{t('projectFolder.hint')}</p>
			<p class="small">
				{t('projectFolder.brave', { flag: BRAVE_FLAG })}
			</p>
			<button
				type="button"
				class="bu-action btn sm"
				data-variant="outline"
				onclick={() => copy(BRAVE_FLAG, 'flag')}
				><Copy size={14} aria-hidden="true" />{copied === 'flag'
					? t('projectFolder.copied')
					: t('projectFolder.copy')}</button
			>
		{:else if !link}
			<p class="bu-muted settings-description">{t('projectFolder.hint')}</p>
			<button
				type="button"
				class="bu-action btn"
				data-variant="outline"
				disabled={disabled || working}
				onclick={choose}
				><FolderOpen size={16} aria-hidden="true" />{t('projectFolder.choose')}</button
			>
			{#if problem}<p class="notice warn small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />{problem}
				</p>{/if}
		{:else}
			<div class="destination">
				<FolderOpen size={16} aria-hidden="true" />
				<div class="destination-text">
					<span class="destination-name">{link.handle.name} · {formatName}</span>
					<span class="destination-path">{link.subfolder}/</span>
				</div>
			</div>
			<label class="check">
				<input
					type="checkbox"
					checked={link.auto}
					disabled={working}
					onchange={(e) => void setFolderAutoPublish(e.currentTarget.checked)}
				/>
				<span>{t('projectFolder.auto')}</span>
			</label>
			<p class="small summary">
				<span role="status" aria-live="polite">{summary}</span>{#if updated}<span class="bu-muted"
						>{summary ? ' · ' : ''}{updated}</span
					>{/if}
			</p>
			{#if offer}
				<div class="notice small offer" role="status">
					<p>{t('projectFolder.matching', { count: offer.files.length })}</p>
					<div class="offer-actions">
						<button
							type="button"
							class="bu-action btn sm primary"
							disabled={working}
							onclick={() => act(adoptMatchingFiles)}
							><RefreshCw size={14} aria-hidden="true" />{t('projectFolder.adopt')}</button
						>
						<button
							type="button"
							class="bu-action btn sm"
							data-variant="outline"
							disabled={working}
							onclick={leaveMatchingFiles}>{t('projectFolder.leave')}</button
						>
					</div>
				</div>
			{/if}
			{#if problem}
				<div class="notice warn small" role="alert">
					<TriangleAlert size={14} aria-hidden="true" />
					<div class="problem">
						<p>{problem}</p>
						{#if conflicts.length}<ul class="conflicts">
								{#each conflicts as conflict (conflict.path)}
									<li>
										<span class="conflict-path">{conflict.path}</span>
										<span class="conflict-reason">{reason(conflict)}</span>
										<button
											type="button"
											class="bu-action btn sm plain icon"
											aria-label={copied === conflict.path
												? t('projectFolder.pathCopied')
												: t('projectFolder.copyPath')}
											title={t('projectFolder.copyPath')}
											onclick={(e) =>
												copy(
													fullPath(conflict.path),
													conflict.path,
													e.currentTarget.parentElement?.querySelector('.conflict-path')
												)}
											>{#if copied === conflict.path}<Check
													size={14}
													aria-hidden="true"
												/>{:else}<Copy size={14} aria-hidden="true" />{/if}</button
										>
									</li>
								{/each}
							</ul>{/if}
					</div>
				</div>
			{/if}
			<div class="primary-action">
				{#if status.kind === 'reconnect'}
					<button type="button" class="bu-action btn primary" disabled={working} onclick={reconnect}
						><Link size={16} aria-hidden="true" />{t('projectFolder.reconnect')}</button
					>
				{:else if status.kind === 'blocked'}
					{#if replaceable}
						<button
							type="button"
							class="bu-action btn"
							data-variant="outline"
							disabled={working}
							onclick={replace}
							><Replace size={16} aria-hidden="true" />{t('projectFolder.replace')}</button
						>
						<button
							type="button"
							class="bu-action btn"
							data-variant="outline"
							disabled={disabled || working}
							onclick={update}
							><RotateCcw size={16} aria-hidden="true" />{t('projectFolder.tryAgain')}</button
						>
					{:else}
						<button
							type="button"
							class="bu-action btn"
							data-variant="outline"
							disabled={disabled || working}
							onclick={update}
							><RotateCcw size={16} aria-hidden="true" />{t('projectFolder.tryAgain')}</button
						>
					{/if}
					<button
						type="button"
						class="bu-action btn"
						data-variant="outline"
						disabled={working}
						onclick={keep}
						><FileCheck size={16} aria-hidden="true" />{t('projectFolder.keep')}</button
					>
				{:else if status.kind === 'missing'}
					<!-- A folder moved back into place is picked up again without waiting for the next change. -->
					<button
						type="button"
						class="bu-action btn"
						data-variant="outline"
						disabled={disabled || working}
						onclick={update}
						><RotateCcw size={16} aria-hidden="true" />{t('projectFolder.tryAgain')}</button
					>
				{:else}
					<button
						type="button"
						class="bu-action btn"
						data-variant="outline"
						disabled={disabled || working}
						onclick={update}
						><RefreshCw size={16} aria-hidden="true" />{t('projectFolder.publishNow')}</button
					>
					{#if status.kind === 'done' && status.kept}
						<button
							type="button"
							class="bu-action btn"
							data-variant="outline"
							disabled={working}
							onclick={() => act(() => releaseKeptFiles())}
							><ListChecks size={16} aria-hidden="true" />{t('projectFolder.updateKept')}</button
						>
					{/if}
				{/if}
			</div>
			<div class="secondary-actions">
				<button
					type="button"
					class="bu-action btn sm plain"
					disabled={disabled || working}
					onclick={choose}
					><FolderOpen size={14} aria-hidden="true" />{t('projectFolder.change')}</button
				>
				<button
					type="button"
					class="bu-action btn sm plain"
					disabled={working}
					onclick={() => act(() => unlinkProjectFolder())}
					><Unlink size={14} aria-hidden="true" />{t('projectFolder.stop')}</button
				>
			</div>
		{/if}
	</section>
{/if}

<style>
	.project-folder {
		display: grid;
		gap: 10px;
		justify-items: start;
	}
	.project-folder h3,
	.project-folder p {
		margin: 0;
	}
	.destination {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		min-width: 0;
		max-width: 100%;
	}
	.destination :global(svg) {
		flex: none;
		margin-top: 2px;
	}
	.destination-text {
		display: grid;
		min-width: 0;
	}
	.destination-name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.destination-path {
		font-family: var(--mono, ui-monospace, monospace);
		font-size: 0.8125rem;
		opacity: 0.8;
		overflow-wrap: anywhere;
	}
	.summary:has(> [role='status']:empty:only-child) {
		display: none;
	}
	.problem {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.offer {
		display: grid;
		gap: 8px;
		justify-self: stretch;
	}
	.offer-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.conflicts {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 200px;
		overflow: auto;
	}
	.conflicts li {
		display: grid;
		grid-template-columns: 1fr auto;
		column-gap: 8px;
		align-items: center;
	}
	.conflict-path {
		grid-column: 1 / -1;
	}
	.conflict-path {
		font-family: var(--mono, ui-monospace, monospace);
		overflow-wrap: anywhere;
		user-select: text;
	}
	.conflict-reason {
		grid-column: 1;
		grid-row: 2;
		opacity: 0.75;
	}
	.conflicts li button {
		grid-column: 2;
		grid-row: 2;
	}
	.primary-action,
	.secondary-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.secondary-actions {
		gap: 4px;
	}
</style>
