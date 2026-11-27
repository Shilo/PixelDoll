<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import ItemGenerationList, { type ItemGenerationRow } from './ItemGenerationList.svelte';
	import ItemGenerationFooter from './ItemGenerationFooter.svelte';
	import { displayMove } from './displayMove.ts';
	import { clipMissingItems, pickedOffers, seeded } from './itemGeneration.ts';
	import { pendingClipItems, savedClipItemGeneration } from './savedClipItemGeneration.ts';
	import { itemOfferAccess } from './itemOfferAccess.ts';
	import { doc, queueMoves, store, ui, withKey } from './state.svelte.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';

	// Equipment for a saved move or State, chosen together from its View and edit window.
	const projectId = untrack(() => doc.id);
	const clipId = untrack(() => ui.itemGeneration);
	const project = $derived(doc.id === projectId ? store.project : null);
	const manifest = $derived(project?.manifest);
	const name = $derived(displayMove(clipId, manifest?.rig.animations ?? []));
	let selected = $state<string[]>([]);
	let list = $state<HTMLDivElement>();
	const generation = $derived(savedClipItemGeneration(project, projectId, clipId));
	const rows: ItemGenerationRow[] = $derived(
		generation.rows.map(({ item, offer, pending }) => ({
			item,
			offer,
			note: pending ? t('itemGeneration.inProgress') : undefined
		}))
	);
	const { available, unposedNote, unavailableReason } = $derived(generation);
	const { chosen, gens: total, specs } = $derived(pickedOffers(rows, selected));
	const access = $derived(itemOfferAccess(manifest, specs));

	function generate() {
		if (ui.waitingForTab || !specs.length || access.error) return;
		const approved = $state.snapshot(specs);
		withKey(() => {
			// Connecting or another tab's handoff can take a while: skip items queued or finished meanwhile, so a stale
			// request cannot stop the rest of the batch.
			const missing = new Set(
				manifest ? clipMissingItems(manifest, clipId).map((item) => item.id) : []
			);
			const pending = pendingClipItems(projectId, clipId);
			const fresh = approved.filter((spec) =>
				spec.items.every((id) => missing.has(id) && !pending.has(id))
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
	back={ui.returnTo === 'clip' ? () => (ui.sheet = 'clip') : undefined}
	backTo={ui.returnTo === 'clip' ? name : undefined}
	onclose={() => (ui.sheet = null)}
	footer={available ? foot : undefined}
>
	{#if !manifest}
		<p class="bu-notice" data-size="compact" data-tone="neutral">
			{t('moveSheet.checkpoint.changed')}
		</p>
	{:else if !rows.length}
		<p class="bu-notice" data-size="compact" data-tone="neutral">
			{t('itemGeneration.allDrawn', { move: name })}
		</p>
	{:else}
		<p class="muted small note">
			{#if available}{t('moveSheet.checkpoint.chooseFor', { move: name })}
			{:else if unavailableReason}{displayNestedMessage(unavailableReason)}
			{:else}{t('itemGeneration.noneAvailable', { move: name })}{/if}
		</p>
		{#if project}<ItemGenerationList
				{project}
				{rows}
				bind:selected
				bind:list
				disabled={!!ui.waitingForTab}
				label={t('moveSheet.checkpoint.titleItems')}
			/>{/if}
		{#if access.error}<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
				{access.error}
			</p>{/if}
		{#if unposedNote}<p class="bu-notice" data-size="compact" data-tone="warning">
				{displayNestedMessage(unposedNote)}
			</p>{/if}
	{/if}
</Sheet>

<style>
	.note {
		margin-block: 0 10px;
	}
</style>
