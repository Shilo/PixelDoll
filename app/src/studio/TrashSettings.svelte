<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getLocale, t } from 'svelte-whisper';
	import {
		Clapperboard,
		Layers2,
		PersonStanding,
		RotateCcw,
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
	let confirming = $state<string>();
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
					<span class="trash-kind"><Icon size={18} aria-hidden="true" /></span>
					<div class="trash-text">
						<span class="trash-name">{entry.name}</span>
						<span class="bu-muted trash-meta"
							>{kindLabel(entry)}{entry.context ? ` · ${entry.context}` : ''}</span
						>
						<time class="bu-muted trash-date" datetime={entry.deletedAt}
							>{dateOf(entry.deletedAt)}</time
						>
					</div>
					<div class="trash-actions">
						<button
							type="button"
							class="bu-btn trash-restore"
							disabled={!!busy}
							aria-label={t('recentlyDeleted.restoreNamed', { name: entry.name })}
							title={t('recentlyDeleted.restoreNamed', { name: entry.name })}
							onclick={() => void restoreEntry(entry.id)}
						>
							<RotateCcw size={18} aria-hidden="true" />
						</button>
						<button
							type="button"
							class="bu-btn"
							data-variant="danger"
							disabled={!!busy}
							aria-label={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
							title={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
							onclick={() => (confirming = entry.id)}
						>
							<Trash2 size={18} aria-hidden="true" />
						</button>
					</div>
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
		grid-template-columns: 18px minmax(0, 1fr);
		column-gap: 10px;
		align-items: start;
		min-height: 56px;
		padding: 8px;
		margin-inline: -8px;
		border-block-start: 1px solid var(--bu-line);
		border-radius: var(--bu-radius-control, 8px);
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
	.trash-kind {
		display: grid;
		place-items: center;
		margin-block-start: 2px;
		opacity: 0.65;
	}
	.trash-text {
		display: grid;
		gap: 1px;
		min-inline-size: 0;
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
	}
	.trash-date {
		font-variant-numeric: tabular-nums;
		opacity: 0.85;
	}
	.trash-actions {
		display: flex;
		grid-column: 2;
		justify-content: end;
		gap: 4px;
		margin-block-start: 4px;
	}
	.trash-actions .bu-btn {
		display: grid;
		place-items: center;
		inline-size: 44px;
		block-size: 44px;
		padding: 0;
	}
	/* A pointer device reveals the actions on the row it is working on; the text keeps its full width at rest. */
	@media (hover: hover) and (pointer: fine) {
		.trash-actions {
			position: absolute;
			inset-block-start: 50%;
			inset-inline-end: 4px;
			transform: translateY(-50%);
			margin-block-start: 0;
			padding-inline: 4px;
			border-radius: var(--bu-radius-control, 8px);
			background: var(--bu-hover);
			opacity: 0;
			pointer-events: none;
			transition: opacity 120ms ease;
		}
		.trash-row:hover .trash-actions,
		.trash-row:focus-within .trash-actions {
			opacity: 1;
			pointer-events: auto;
		}
	}
	.trash-status {
		position: absolute;
		inset-inline-end: 4px;
		inset-block-end: -10px;
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
