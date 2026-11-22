<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getLocale, t } from 'svelte-whisper';
	import {
		Clapperboard,
		Layers2,
		PersonStanding,
		Shirt,
		Trash,
		Trash2,
		TriangleAlert,
		UserRound
	} from './icons.ts';
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
	let confirmDelete = $state<string>();
	let confirmRestore = $state<string>();
	let failure = $state<Message | string>();
	let section = $state<HTMLElement>();
	let emptyNote = $state<HTMLElement>();

	onMount(() => void refreshRecentlyDeleted());

	/** A bare type glyph stands in for artwork: decoding every entry's cells to draw a thumbnail would cost more than it gives. */
	const KIND = {
		character: { key: 'recentlyDeleted.kind.character', icon: UserRound },
		item: { key: 'recentlyDeleted.kind.items', icon: Shirt },
		category: { key: 'recentlyDeleted.kind.category', icon: Layers2 },
		move: { key: 'recentlyDeleted.kind.move', icon: Clapperboard },
		state: { key: 'recentlyDeleted.kind.state', icon: PersonStanding }
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
	const kindLabel = (entry: RecentlyDeleted) => t(KIND[kindOf(entry)].key);
	const dateOf = (iso: string) =>
		new Date(iso).toLocaleDateString(getLocale(), { dateStyle: 'medium' });

	async function restoreEntry(id: string) {
		if (busy) return;
		const at = deleted.entries.findIndex((entry) => entry.id === id);
		busy = id;
		try {
			const restored = await restoreDeleted(id);
			busy = '';
			if (restored) {
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
			confirmDelete = undefined;
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
		const rows = [...(section?.querySelectorAll<HTMLButtonElement>('.trash-restore') ?? [])].filter(
			(button) => !button.disabled
		);
		const next = rows[Math.min(index, rows.length - 1)];
		if (next) next.focus();
		else emptyNote?.focus();
	}
</script>

<div class="trash-settings" tabindex="-1" bind:this={section}>
	<p class="bu-muted settings-description">{t('recentlyDeleted.kept')}</p>
	{#if !deleted.entries.length}
		<div class="trash-empty" tabindex="-1" bind:this={emptyNote}>
			<Trash size={28} aria-hidden="true" />
			<p class="bu-muted settings-description">{t('recentlyDeleted.empty')}</p>
		</div>
	{:else}
		<ul class="trash-list">
			{#each deleted.entries as entry (entry.id)}
				{@const kind = KIND[kindOf(entry)]}
				{@const Icon = kind.icon}
				<li class="trash-row" class:trash-busy={busy === entry.id}>
					<button
						type="button"
						class="trash-recover trash-restore"
						disabled={!!busy}
						aria-label={t('recentlyDeleted.restoreNamed', { name: entry.name })}
						onclick={() => (confirmRestore = entry.id)}
					>
						<span class="trash-title">
							<Icon size={18} aria-hidden="true" />
							<span class="trash-name">{entry.name}</span>
						</span>
						<span class="bu-muted trash-meta"
							>{kindLabel(entry)}{entry.context ? ` · ${entry.context}` : ''}</span
						>
						<time class="bu-muted trash-date" datetime={entry.deletedAt}
							>{dateOf(entry.deletedAt)}</time
						>
					</button>
					<button
						type="button"
						class="trash-delete"
						disabled={!!busy}
						aria-label={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
						title={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
						onclick={() => (confirmDelete = entry.id)}
					>
						<Trash2 size={18} aria-hidden="true" />
					</button>
					{#if busy === entry.id}
						<span class="trash-status" role="status">{t('recentlyDeleted.restoring')}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if failure}<p class="notice bad small" role="alert">
			<TriangleAlert size={14} aria-hidden="true" />{displayMessage(failure)}
		</p>{/if}
</div>

{#if confirmDelete}
	{@const entry = deleted.entries.find((e) => e.id === confirmDelete)}
	{#if entry}
		<ConfirmDialog
			title={t('recentlyDeleted.confirmTitle', { name: entry.name })}
			action={t('recentlyDeleted.confirmAction')}
			busyAction={t('common.deleting')}
			busy={!!busy}
			problem={failure ? displayMessage(failure) : ''}
			oncancel={() => (confirmDelete = undefined)}
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

{#if confirmRestore}
	{@const entry = deleted.entries.find((e) => e.id === confirmRestore)}
	{#if entry}
		<ConfirmDialog
			title={t('recentlyDeleted.restoreTitle', { name: entry.name })}
			action={t('recentlyDeleted.restore')}
			busyAction={t('recentlyDeleted.restoring')}
			busy={!!busy}
			problem={failure ? displayMessage(failure) : ''}
			oncancel={() => (confirmRestore = undefined)}
			onconfirm={() => void restoreEntry(entry.id)}
		>
			<p>{t('recentlyDeleted.restoreBody')}</p>
		</ConfirmDialog>
	{/if}
{/if}

<style>
	.trash-settings {
		display: grid;
	}
	.trash-settings:focus {
		outline: none;
	}
	.trash-list {
		display: grid;
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
	}
	.trash-row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px;
		align-items: stretch;
		min-height: 56px;
		margin-inline: -8px;
		border-block-start: 1px solid var(--bu-line);
		border-radius: var(--bu-radius-control, 8px);
		overflow: hidden;
	}
	.trash-row:first-child {
		border-block-start: none;
	}
	.trash-row:hover,
	.trash-row:has(:focus-visible) {
		background: var(--bu-hover);
	}
	.trash-busy {
		opacity: 0.55;
	}
	/* The whole left side is the recovery target; the right edge is the permanent delete. */
	.trash-recover {
		display: grid;
		align-content: center;
		justify-items: start;
		gap: 1px;
		min-inline-size: 0;
		padding: 8px;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}
	.trash-title {
		display: flex;
		align-items: center;
		gap: 6px;
		max-inline-size: 100%;
		min-inline-size: 0;
	}
	.trash-title > :global(svg) {
		flex: none;
		opacity: 0.65;
	}
	.trash-name {
		font-size: 0.9375rem;
		font-weight: 500;
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.trash-meta,
	.trash-date {
		font-size: 0.8125rem;
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-inline-size: 100%;
	}
	.trash-date {
		font-variant-numeric: tabular-nums;
		opacity: 0.85;
	}
	.trash-delete {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-inline-start: 1px solid var(--bu-line);
		background: color-mix(in srgb, var(--bu-danger) 14%, transparent);
		color: var(--bu-danger);
		cursor: pointer;
	}
	.trash-delete:hover,
	.trash-delete:focus-visible {
		background: color-mix(in srgb, var(--bu-danger) 26%, transparent);
	}
	.trash-status {
		position: absolute;
		inset-block-end: 2px;
		inset-inline-start: 34px;
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.trash-empty {
		display: grid;
		justify-items: center;
		gap: 10px;
		padding-block: 32px;
		text-align: center;
	}
	.trash-empty > :global(svg) {
		opacity: 0.45;
	}
	.trash-empty:focus {
		outline: none;
	}
</style>
