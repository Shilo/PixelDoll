<script lang="ts">
	// Static item-only art. Crop once per source change; CSS fits the native pixels without resize observers or playback work.
	import type { Item, Project } from '../lib/store/manifest.ts';
	import { crop, groupOf, thumbCell } from './model.ts';
	import { ui } from './state.svelte.ts';
	import Sprite from './Sprite.svelte';
	import GroupIcon from './GroupIcon.svelte';
	// `box`: a square art box in CSS px. Art that fits draws at the largest whole device-pixel scale inside it, so every
	// pixel stays the same size; art larger than the box (big bodies) shrinks to fit instead.
	let { project, item, box }: { project: Project; item: Item; box?: number } = $props();
	const im = $derived.by(() => {
		const c = thumbCell(project, item);
		return c && crop(c);
	});
	const k = $derived(
		im && box && im.w <= box && im.h <= box
			? Math.max(1, Math.floor(Math.min(box / im.w, box / im.h) * ui.dpr))
			: 0
	);
</script>

{#if im && k}<Sprite img={im} {k} w={im.w} h={im.h} label={item.name} />{:else if im}<Sprite
		img={im}
		k={1}
		w={im.w}
		h={im.h}
		fitToBox
		label={item.name}
	/>{:else}<GroupIcon group={groupOf(item.slot).id} size={24} />{/if}
