<script lang="ts">
	import type { Preset } from '../lib/store/manifest.ts';
	import { recolor } from '../lib/dress/dress.ts';
	import { settleHands } from '../lib/compose/compose.ts';
	import {
		renderPresentation,
		type PresentationAvailability,
		type Presentation
	} from './experience/presentation.ts';
	import { croppedBacking, croppedThumbnail } from './experience/thumbnails.svelte.ts';
	import { ui } from './state.svelte.ts';
	import { PersonStanding } from './icons.ts';
	import Sprite from './Sprite.svelte';
	let {
		preview,
		preset
	}: {
		preview: { assets: PresentationAvailability; pose: Presentation };
		preset: Preset;
	} = $props();
	const still = $derived(
		renderPresentation(
			{ ...preview.assets, project: recolor(preview.assets.project, preset.variants) },
			settleHands(preview.assets.project.manifest, preset.items, 'main_hand').items,
			preview.pose
		)
	);
	const image = $derived(still.image && croppedThumbnail(still.image));
	const backing = $derived(image ? croppedBacking(56, image, ui.dpr) : 1);
	const fitToBox = $derived(!!image && (image.w > 56 || image.h > 56));
</script>

<span class="outfit-thumb" aria-hidden="true">
	{#if image}<Sprite
			img={image}
			k={backing}
			limit={56}
			{fitToBox}
			label={preset.name}
		/>{:else}<PersonStanding size={24} />{/if}
</span>
