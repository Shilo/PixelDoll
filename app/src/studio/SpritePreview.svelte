<script lang="ts">
	import type { Img } from '../lib/image/png.ts';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { ui } from './state.svelte.ts';

	let { image, title, onclose }: { image: Img; title: string; onclose: () => void } = $props();
	let width = $state(0);
	let height = $state(0);
	const scale = $derived(
		Math.max(1, Math.floor(Math.min(width / image.w, height / image.h) * ui.dpr))
	);
</script>

<Sheet {title} {onclose} overlay className="sprite-preview">
	<div class="preview-stage" bind:clientWidth={width} bind:clientHeight={height}>
		{#if width && height}
			<Sprite img={image} k={scale} checker checkerSize={24} label={title} />
		{/if}
	</div>
</Sheet>

<style>
	:global(dialog.sheet.sprite-preview) {
		inset: 0;
		width: 100%;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: 0;
		border-radius: 0;
	}
	:global(.sprite-preview > .sheet-body) {
		flex: 1;
		display: grid;
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
	}
	.preview-stage {
		display: grid;
		place-items: center;
		overflow: auto;
	}
</style>
