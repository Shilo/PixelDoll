<script lang="ts">
	// A move or State row with its ⋮ (and right-click) menu: the shared move and State actions, and the Trash confirmation.
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import RowActions from './RowActions.svelte';
	import ClipMenu from './ClipMenu.svelte';
	import TrashDialog from './TrashDialog.svelte';
	import { displayError } from '../lib/i18n.ts';
	import { doc, openPendingWork } from './state.svelte.ts';
	import { blockedByWork } from './state.svelte.ts';
	import { moveDeletionBlocked, removeMove } from './moveActions.svelte.ts';

	let {
		id,
		kind,
		name,
		children
	}: { id: string; kind: 'move' | 'state'; name: string; children: Snippet } = $props();
	let trashing = $state(false);
	const lock = $derived(moveDeletionBlocked(id));
</script>

<RowActions {name} {children}>
	{#snippet actions(close)}<ClipMenu
			{id}
			{kind}
			{close}
			ontrash={() => (trashing = true)}
		/>{/snippet}
</RowActions>
{#if trashing}
	<TrashDialog
		{name}
		body={t(
			kind === 'state' ? 'savedActions.removeState' : 'savedActions.thisRemovesTheMoveFromTheBody'
		)}
		locked={displayError(lock)}
		onlocked={blockedByWork(lock)
			? () =>
					void openPendingWork({
						projectId: doc.id,
						flows: !!lock && lock.translation.key !== 'moveRemoval.resolveDrafts'
					})
			: undefined}
		oncancel={() => (trashing = false)}
		onconfirm={async () => {
			await removeMove(id);
			trashing = false;
		}}
	/>
{/if}
