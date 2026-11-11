<script lang="ts">
	// Another character's item as worn there: loads only the images of its first visible frame.
	import { sharedPreview, type SharedItem } from '../lib/equipment/shared.ts';
	import type { Project } from '../lib/store/manifest.ts';
	import { groupOf, thumbCells } from './model.ts';
	import Thumb from './Thumb.svelte';
	import GroupIcon from './GroupIcon.svelte';
	let { entry }: { entry: SharedItem } = $props();
	let project = $state.raw<Project | null>(null);
	$effect(() => {
		const e = entry,
			first = thumbCells(e.source, e.item).next();
		let stale = false;
		project = null;
		if (!first.done)
			sharedPreview(e, first.value.hashes)
				.then((p) => {
					if (!stale) project = p;
				})
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
