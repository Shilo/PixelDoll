<script lang="ts">
	// Another character's item as worn there: loads only the images of its first visible frame.
	import { untrack } from 'svelte';
	import { sharedPreview, type SharedItem } from '../lib/equipment/shared.ts';
	import type { Project } from '../lib/store/manifest.ts';
	import { groupOf, thumbCell, thumbCells } from './model.ts';
	import Thumb from './Thumb.svelte';
	import GroupIcon from './GroupIcon.svelte';
	let { entry }: { entry: SharedItem } = $props();
	let project = $state.raw<Project | null>(null);
	// A refreshed list brings new entry objects for unchanged items: reload only when the source was saved again or its colors
	// changed (the bundled demo keeps its colors apart from a save time).
	const key = $derived(
		`${entry.sourceId}/${entry.item.id}/${entry.savedAt}/${JSON.stringify(entry.variants)}`
	);
	$effect(() => {
		void key;
		const e = untrack(() => entry);
		let stale = false;
		project = null;
		void (async () => {
			// Like Thumb, skip frames where the item is fully transparent (a hand item hidden behind the body).
			for (const cell of thumbCells(e.source, e.item)) {
				const p = await sharedPreview(e, cell.hashes);
				if (stale) return;
				if (thumbCell(p, e.item)) return (project = p);
			}
		})()
			// The tile keeps its group icon and still names the item; the failure stays visible in the console.
			.catch((error: unknown) => console.error('shared thumbnail', error));
		return () => {
			stale = true;
		};
	});
</script>

{#if project}<Thumb {project} item={entry.item} />{:else}<GroupIcon
		group={groupOf(entry.item.slot).id}
		size={24}
	/>{/if}
