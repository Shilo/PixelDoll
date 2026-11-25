<script lang="ts">
	import { onMount } from 'svelte';
	import type { Img } from '../lib/image/png.ts';
	import Sprite from './Sprite.svelte';
	import SurfaceHeader from './SurfaceHeader.svelte';
	import { openingTrigger, restoreTrigger } from './experience/focus.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import { ui } from './state.svelte.ts';

	let {
		image,
		title,
		note,
		onclose
	}: { image: Img; title: string; note?: string; onclose: () => void } = $props();
	const titleId = $props.id();
	let dialog: HTMLDialogElement;
	let heading = $state<HTMLHeadingElement>();
	let width = $state(0);
	let height = $state(0);
	const fit = $derived(Math.min(width / image.w, height / image.h));
	const scale = $derived(Math.max(1, Math.floor(fit * ui.dpr)));

	onMount(() => {
		const trigger = openingTrigger();
		const releaseExit = claimSheetExit({ close: () => onclose() });
		dialog.showModal();
		heading?.focus({ preventScroll: true });
		return () => {
			releaseExit();
			dialog.close();
			restoreTrigger(trigger);
		};
	});
</script>

<dialog
	class="sheet sprite-preview"
	bind:this={dialog}
	aria-labelledby={titleId}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
>
	<SurfaceHeader {title} {titleId} {onclose} bind:titleElement={heading} />
	<div class="preview-stage">
		{#if note}<p class="preview-context">{note}</p>{/if}
		<div class="preview-fit" bind:clientWidth={width} bind:clientHeight={height}>
			{#if width && height}
				<Sprite
					img={image}
					k={scale}
					limit={fit * Math.max(image.w, image.h)}
					checker
					checkerSize={24}
					label={title}
				/>
			{/if}
		</div>
	</div>
</dialog>

<style>
	dialog.sprite-preview {
		box-sizing: border-box;
		inset: 0;
		width: 100%;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom);
		border-radius: 0;
	}
	.preview-stage {
		flex: 1;
		min-height: 0;
		padding: clamp(12px, 4vmin, 32px);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.preview-context {
		flex: none;
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: center;
	}
	.preview-fit {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		place-items: safe center;
	}
</style>
