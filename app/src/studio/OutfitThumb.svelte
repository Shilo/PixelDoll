<script lang="ts">
	import type { Preset } from '../lib/store/manifest.ts';
	import { recolor } from '../lib/dress/dress.ts';
	import { settleHands } from '../lib/compose/compose.ts';
	import {
		renderPresentation,
		type PresentationAvailability,
		type Presentation
	} from './experience/presentation.ts';
	import { thumbBacking } from './experience/thumbnails.svelte.ts';
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
</script>

<span class="outfit-thumb" aria-hidden="true">
	{#if still.image}<Sprite
			img={still.image}
			k={thumbBacking(56, still, ui.dpr)}
			limit={56}
			label={preset.name}
		/>{:else}<PersonStanding size={24} />{/if}
</span>
