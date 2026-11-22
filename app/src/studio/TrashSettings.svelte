<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getLocale, t } from 'svelte-whisper';
	import { TriangleAlert } from './icons.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { clipKind } from '../lib/runtime/timeline.js';
	import type { RecentlyDeleted } from '../lib/store/recently-deleted.ts';
	import {
		deleted,
		deleteDeletedForever,
		refreshRecentlyDeleted,
		restoreDeleted
	} from './state.svelte.ts';

	/** One entry being restored or deleted for good. */
	let busy = $state('');
	let confirming = $state<string>();
	let failure = $state<Message | string>();
	let section = $state<HTMLElement>();
	let emptyNote = $state<HTMLElement>();

	onMount(() => void refreshRecentlyDeleted());
	const KIND = {
		character: 'recentlyDeleted.kind.character',
		item: 'recentlyDeleted.kind.items',
		category: 'recentlyDeleted.kind.category',
		move: 'recentlyDeleted.kind.move',
		state: 'recentlyDeleted.kind.state'
	} as const;
	/** A State is a clip like a move; its row says what it was, not how it is stored. */
	function kindOf(entry: RecentlyDeleted): keyof typeof KIND {
		if (entry.kind === 'items') return 'item';
		if (entry.kind === 'category') return 'category';
		if (entry.kind === 'character') return 'character';
		const clip = entry.before.manifest.rig.animations.find(
			(anim) => anim.id === entry.scope.moveId
		);
		return clip && clipKind(clip) === 'state' ? 'state' : 'move';
	}
	const kindLabel = (entry: RecentlyDeleted) => t(KIND[kindOf(entry)]);
	const dateOf = (iso: string) =>
		new Date(iso).toLocaleDateString(getLocale(), { dateStyle: 'medium' });

	async function restoreEntry(id: string) {
		if (busy) return;
		const at = deleted.entries.findIndex((entry) => entry.id === id);
		busy = id;
		try {
			if (await restoreDeleted(id)) {
				await tick();
				afterRow(at);
			}
		} finally {
			busy = '';
		}
	}

	async function deleteForever(id: string) {
		if (busy) return;
		const at = deleted.entries.findIndex((entry) => entry.id === id);
		busy = id;
		failure = undefined;
		try {
			await deleteDeletedForever(id);
			confirming = undefined;
			await tick();
			afterRow(at);
		} catch (cause) {
			// The dialog is still open: focus stays on its own controls.
			failure = errorMessage(cause);
		} finally {
			busy = '';
		}
	}

	/** Keep the keyboard where the work happened: the row that took its place, else the one above, else the note. */
	function afterRow(index: number) {
		const buttons = [
			...(section?.querySelectorAll<HTMLButtonElement>('.trash-restore') ?? [])
		].filter((button) => !button.disabled);
		const next = buttons[Math.min(index, buttons.length - 1)];
		if (next) next.focus();
		else emptyNote?.focus();
	}
</script>

<div class="trash-settings" tabindex="-1" bind:this={section}>
	<p class="bu-muted settings-description">{t('recentlyDeleted.kept')}</p>
	{#if !deleted.entries.length}
		<p class="bu-muted settings-description" tabindex="-1" bind:this={emptyNote}>
			{t('recentlyDeleted.empty')}
		</p>
	{:else}
		<ul class="trash-list">
			{#each deleted.entries as entry (entry.id)}
				<li class="trash-row">
					<div class="trash-text">
						<span class="trash-name">{entry.name}</span>
						<span class="bu-muted trash-meta"
							>{kindLabel(entry)}{entry.context ? ` · ${entry.context}` : ''} ·
							{dateOf(entry.deletedAt)}</span
						>
					</div>
					<div class="trash-actions">
						<button
							type="button"
							class="btn bu-action trash-restore"
							data-variant="outline"
							disabled={!!busy}
							aria-label={t('recentlyDeleted.restoreNamed', { name: entry.name })}
							onclick={() => void restoreEntry(entry.id)}
						>
							{busy === entry.id ? t('recentlyDeleted.restoring') : t('recentlyDeleted.restore')}
						</button>
						<button
							type="button"
							class="btn bu-action"
							data-variant="quiet"
							disabled={!!busy}
							aria-label={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
							onclick={() => (confirming = entry.id)}>{t('recentlyDeleted.deleteForever')}</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	{#if failure}<p class="notice bad small" role="alert">
			<TriangleAlert size={14} aria-hidden="true" />{displayMessage(failure)}
		</p>{/if}
</div>

{#if confirming}
	{@const entry = deleted.entries.find((e) => e.id === confirming)}
	{#if entry}
		<ConfirmDialog
			title={t('recentlyDeleted.confirmTitle', { name: entry.name })}
			action={t('recentlyDeleted.confirmAction')}
			busyAction={t('common.deleting')}
			busy={!!busy}
			problem={failure ? displayMessage(failure) : ''}
			oncancel={() => (confirming = undefined)}
			onconfirm={() => void deleteForever(entry.id)}
		>
			<p>
				{t(
					entry.kind === 'character'
						? 'recentlyDeleted.confirmBodyCharacter'
						: 'recentlyDeleted.confirmBody'
				)}
			</p>
		</ConfirmDialog>
	{/if}
{/if}

<style>
	.trash-settings {
		display: grid;
		gap: 8px;
	}
	.trash-settings:focus {
		outline: none;
	}
	.trash-list {
		display: grid;
		gap: 4px;
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
	}
	.trash-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 44px;
		padding-block: 6px;
		border-block-start: 1px solid var(--bu-line);
	}
	.trash-row:first-child {
		border-block-start: none;
	}
	.trash-text {
		display: grid;
		gap: 2px;
		min-inline-size: 0;
	}
	.trash-name {
		overflow-wrap: anywhere;
	}
	.trash-meta {
		font-size: 0.875em;
	}
	.trash-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.trash-actions .btn {
		min-inline-size: 0;
		height: auto;
		min-height: var(--ctl-h);
		padding-block: 6px;
	}
</style>
