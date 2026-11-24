<script lang="ts">
	import { currentItemDrawing } from './settingsDefaults.svelte.ts';
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import ItemGenerationList, { type ItemGenerationRow } from './ItemGenerationList.svelte';
	import ItemGenerationFooter from './ItemGenerationFooter.svelte';
	import { displayMove } from './displayMove.ts';
	import { clipItemOffer, clipMissingItems, pickedOffers, seeded } from './itemGeneration.ts';
	import { itemOfferAccess } from './itemOfferAccess.ts';
	import { doc, pendingMoves, queueMoves, store, ui, withKey } from './state.svelte.ts';
	import { setupRedoMoves } from '../lib/rig/setup.ts';
	import { unposedItemMoves } from './create.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';

	// Equipment for a saved move or State, chosen together after the fact (its row menu in Moves or States).
	const projectId = untrack(() => doc.id);
	const clipId = untrack(() => ui.itemGeneration);
	const project = $derived(doc.id === projectId ? store.project : null);
	const manifest = $derived(project?.manifest);
	const name = $derived(displayMove(clipId, manifest?.rig.animations ?? []));
	let selected = $state<string[]>([]);
	let list = $state<HTMLDivElement>();
	const busyFor = (itemId: string) =>
		pendingMoves(projectId, itemId).some((spec) => spec.id === clipId);
	const rows = $derived.by((): ItemGenerationRow[] => {
		if (!manifest) return [];
		return clipMissingItems(manifest, clipId).map((item) =>
			busyFor(item.id)
				? { item, offer: null, note: t('itemGeneration.inProgress') }
				: {
						item,
						offer: clipItemOffer(manifest, item.id, clipId, currentItemDrawing(), {
							redo: setupRedoMoves(store.exportRecord)
						})
					}
		);
	});
	// Views kept without poses get no equipment: name them once instead of skipping them silently.
	const unposedNotes = $derived.by(() => {
		const offered = rows.find(({ offer }) => offer?.unposed.length)?.offer?.unposed;
		if (offered || !manifest) return offered ?? [];
		const redo = setupRedoMoves(store.exportRecord);
		const entry = rows
			.flatMap(({ item }) => unposedItemMoves(manifest, item.id, currentItemDrawing(), redo))
			.find((unposed) => unposed.move === clipId);
		return entry ? [entry.note] : [];
	});
	const { chosen, gens: total, specs } = $derived(pickedOffers(rows, selected));
	const access = $derived(itemOfferAccess(manifest, specs));
	const available = $derived(rows.some(({ offer }) => offer?.specs.length));

	function generate() {
		if (ui.waitingForTab || !specs.length || access.error) return;
		const approved = $state.snapshot(specs);
		withKey(() => {
			// Connecting or another tab's handoff can take a while: skip items queued or finished meanwhile, so a stale
			// request cannot stop the rest of the batch.
			const missing = new Set(
				manifest ? clipMissingItems(manifest, clipId).map((item) => item.id) : []
			);
			const fresh = approved.filter(
				(spec) => spec.items.every((id) => missing.has(id)) && !spec.items.some(busyFor)
			);
			if (doc.id !== projectId || !fresh.length) return;
			void queueMoves(projectId, seeded(fresh));
			ui.sheet = 'move';
		}, access.minimumTier);
	}
	let focused = false;
	$effect(() => {
		// Focus the first item that can be chosen once the rows are in, and only then: later updates leave focus alone.
		if (focused || !list || !available) return;
		focused = true;
		untrack(() => list?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
	});
</script>

{#snippet foot()}
	<ItemGenerationFooter
		count={chosen.length}
		gens={total}
		disabled={!!ui.waitingForTab || !specs.length || !!access.error}
		onsubmit={generate}
	/>
{/snippet}

<Sheet
	title={t('itemGeneration.title', { move: name })}
	onclose={() => (ui.sheet = null)}
	footer={available ? foot : undefined}
>
	{#if !manifest}
		<p class="notice small">{t('moveSheet.checkpoint.changed')}</p>
	{:else if !rows.length}
		<p class="notice small">{t('itemGeneration.allDrawn', { move: name })}</p>
	{:else}
		<p class="muted small note">
			{t(available ? 'moveSheet.checkpoint.chooseFor' : 'itemGeneration.noneAvailable', {
				move: name
			})}
		</p>
		{#if project}<ItemGenerationList
				{project}
				{rows}
				bind:selected
				bind:list
				disabled={!!ui.waitingForTab}
				label={t('moveSheet.checkpoint.titleItems')}
			/>{/if}
		{#if access.error}<p class="notice warn small" role="status">{access.error}</p>{/if}
		{#each unposedNotes as note, i (i)}<p class="notice warn small">
				{displayNestedMessage(note)}
			</p>{/each}
	{/if}
</Sheet>

<style>
	.note {
		margin-block: 0 10px;
	}
</style>
