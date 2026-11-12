<script lang="ts">
	// Customization content for the desktop rail and the phone sheet: one tab at a time.
	import { ui } from './state.svelte.ts';
	import Wardrobe from './Wardrobe.svelte';
	import ColorSections from './ColorSections.svelte';
	import Moves from './Moves.svelte';
	import Outfits from './Outfits.svelte';
</script>

<div
	class="customize-panel"
	id="customization-panel"
	role="tabpanel"
	aria-labelledby="customization-tab-{ui.tab}"
>
	{#if ui.tab === 'wardrobe'}
		<Wardrobe />
	{:else if ui.tab === 'outfits'}
		<div class="equipment-scroll panel-list"><Outfits /></div>
	{:else if ui.tab === 'colors'}
		<ColorSections />
	{:else}
		<div class="equipment-scroll panel-list"><Moves /></div>
	{/if}
</div>
