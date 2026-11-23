<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getLocale, t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
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
	import { ignoreKeyRepeat, TwoStepConfirm } from './twoStepConfirm.svelte.ts';
	import { displayMessage, errorMessage } from '../lib/i18n.ts';
	import { message, type Message } from '../lib/message.ts';
	import { clipKind } from '../lib/runtime/timeline.js';
	import { KEEP_MS, type RecentlyDeleted } from '../lib/store/recently-deleted.ts';
	import {
		deleted,
		deleteDeletedForever,
		refreshRecentlyDeleted,
		restoreDeleted
	} from './state.svelte.ts';

	/** One entry being restored or deleted for good. */
	let busy = $state('');
	let confirmDelete = $state<string>();
	/** A row restores on its second press within a few seconds; the first only asks. */
	const restoreConfirm = new TwoStepConfirm<string>({ expireMs: 4000 });
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
	/** Whole days left, at least one: expired entries are already out of the list. */
	const daysLeft = (iso: string) =>
		Math.max(1, Math.ceil((Date.parse(iso) + KEEP_MS - Date.now()) / 86_400_000));

	const armedEntry = $derived(deleted.entries.find((e) => e.id === restoreConfirm.armed));

	function pressRow(id: string, event: MouseEvent) {
		if (!busy && restoreConfirm.press(id, event)) void restoreEntry(id);
	}

	async function restoreEntry(id: string) {
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
			busy = '';
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
	{#if deleted.loadFailed}
		<p class="notice bad small" role="alert">
			{t('recentlyDeleted.loadFailed')}
			<button
				class="bu-action btn sm"
				data-variant="outline"
				onclick={() => void refreshRecentlyDeleted()}>{t('common.tryAgain')}</button
			><ReportButton message={message('recentlyDeleted.loadFailed')} />
		</p>
	{/if}
	{#if !deleted.entries.length && !deleted.loadFailed}
		<div class="trash-empty" tabindex="-1" bind:this={emptyNote}>
			<Trash size={28} aria-hidden="true" />
			<p class="bu-muted settings-description">{t('recentlyDeleted.empty')}</p>
		</div>
	{:else}
		<ul class="trash-list">
			{#each deleted.entries as entry (entry.id)}
				{@const kind = KIND[kindOf(entry)]}
				{@const armed = restoreConfirm.armed === entry.id}
				{@const Icon = armed ? RotateCcw : kind.icon}
				<li class="trash-row">
					<button
						type="button"
						class="bu-action trash-restore"
						data-variant="outline"
						data-active={armed ? '' : undefined}
						disabled={!!busy}
						aria-busy={busy === entry.id}
						aria-label={t(
							armed ? 'recentlyDeleted.confirmRestoreNamed' : 'recentlyDeleted.restoreNamed',
							{ name: entry.name }
						)}
						onclick={(event) => pressRow(entry.id, event)}
						onblur={() => armed && restoreConfirm.disarm()}
						onkeydown={(event) => {
							ignoreKeyRepeat(event);
							if (armed && event.key === 'Escape') {
								// Escape takes back the question, not the whole Settings sheet.
								event.preventDefault();
								event.stopPropagation();
								restoreConfirm.disarm();
							}
						}}
					>
						<span class="trash-title">
							<Icon size={18} aria-hidden="true" />
							<span class="trash-name">{entry.name}</span>
						</span>
						<span class="bu-muted trash-meta"
							>{kindLabel(entry)}{entry.context ? ` · ${entry.context}` : ''}</span
						>
						{#if busy === entry.id}
							<span class="trash-date trash-confirm" role="status"
								>{t('recentlyDeleted.restoring')}</span
							>
						{:else if armed}
							<span class="trash-date trash-confirm">{t('recentlyDeleted.confirmRestore')}</span>
						{:else}
							<time class="bu-muted trash-date" datetime={entry.deletedAt}
								>{dateOf(entry.deletedAt)} · {t('recentlyDeleted.daysLeft', {
									count: daysLeft(entry.deletedAt)
								})}</time
							>
						{/if}
					</button>
					<button
						type="button"
						class="bu-btn trash-delete"
						data-variant="danger"
						data-icon
						disabled={!!busy}
						aria-label={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
						title={t('recentlyDeleted.deleteForeverNamed', { name: entry.name })}
						onclick={() => {
							failure = undefined;
							confirmDelete = entry.id;
						}}
					>
						<Trash2 size={18} aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
		<p class="bu-sr" aria-live="polite">
			{#if armedEntry}{t('recentlyDeleted.confirmRestoreNamed', { name: armedEntry.name })}{/if}
		</p>
	{/if}
	{#if failure}<p class="notice bad small" role="alert">
			<TriangleAlert size={14} aria-hidden="true" />{displayMessage(failure)}<ReportButton
				error={failure}
			/>
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
			oncancel={() => {
				failure = undefined;
				confirmDelete = undefined;
			}}
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
		gap: 8px;
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
	}
	.trash-row {
		display: grid;
	}
	/* The delete button sits inside the row's surface, on top of it in the same grid cell. */
	.trash-row > * {
		grid-area: 1 / 1;
	}
	.trash-restore {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-content: center;
		justify-items: start;
		gap: 2px;
		min-inline-size: 0;
		min-block-size: 64px;
		padding: 10px calc(44px + 20px) 10px 12px;
		text-align: start;
	}
	/* Asking to restore is a question about a safe action, not a status: no hue, which would claim
	   success or warning. The swapped glyph, the bold prompt and a brighter neutral edge carry it.
	   This selector outranks Bronze's outline hover, so the row stays armed under the pointer. */
	.trash-row
		> .trash-restore[data-variant='outline'][data-active]:not(:disabled):not(
			[aria-disabled='true']
		) {
		color: var(--bu-text);
		border-color: color-mix(in srgb, var(--bu-text) 75%, var(--bu-surface));
		background: var(--bu-hover);
	}
	.trash-restore[data-active] .trash-meta {
		color: inherit;
	}
	.trash-restore[aria-busy='true'] {
		cursor: progress;
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
	}
	.trash-restore:not([data-active]) .trash-title > :global(svg) {
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
	.trash-confirm {
		color: var(--bu-success);
		font-weight: 600;
		opacity: 1;
	}
	.trash-delete {
		justify-self: end;
		align-self: center;
		margin-inline-end: 10px;
		inline-size: var(--bu-control);
		block-size: var(--bu-control);
		padding: 0;
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
