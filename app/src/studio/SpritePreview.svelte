<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Img } from '../lib/image/png.ts';
	import Sprite from './Sprite.svelte';
	import SurfaceHeader from './SurfaceHeader.svelte';
	import { ChevronLeft, ChevronRight } from './icons.ts';
	import { openingTrigger, restoreTrigger } from './experience/focus.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import { ui } from './state.svelte.ts';
	import { t } from 'svelte-whisper';

	let {
		images,
		notes,
		title,
		index: initialIndex,
		onclose
	}: {
		images: Img[];
		notes: string[];
		title: string;
		index: number;
		onclose: () => void;
	} = $props();
	const titleId = $props.id();
	let dialog: HTMLDialogElement;
	let heading = $state<HTMLHeadingElement>();
	let width = $state(0);
	let height = $state(0);
	let at = $state(untrack(() => Math.max(0, Math.min(initialIndex, images.length - 1))));
	const image = $derived(images[at]);
	const note = $derived(notes[at]);
	const fit = $derived(Math.min(width / image.w, height / image.h));
	const scale = $derived(Math.max(1, Math.floor(fit * ui.dpr)));

	function step(delta: 1 | -1) {
		if (images.length < 2) return;
		at = (at + delta + images.length) % images.length;
	}

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
	onkeydown={(event) => {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step(-1);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			step(1);
		}
	}}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
>
	<SurfaceHeader {title} {titleId} {onclose} bind:titleElement={heading} />
	<div class="preview-stage">
		<p class="preview-context" aria-live="polite">{note}</p>
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
		{#if images.length > 1}
			<div class="preview-transport">
				<button
					class="bu-action btn icon"
					data-variant="outline"
					aria-label={t('stage.previousFrame')}
					onclick={() => step(-1)}
				>
					<ChevronLeft size={18} aria-hidden="true" />
				</button>
				<button
					class="bu-action btn icon"
					data-variant="outline"
					aria-label={t('stage.nextFrame')}
					onclick={() => step(1)}
				>
					<ChevronRight size={18} aria-hidden="true" />
				</button>
			</div>
		{/if}
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
	.preview-transport {
		flex: none;
		display: flex;
		justify-content: center;
		gap: 12px;
	}
	.preview-transport :global(.btn) {
		width: 44px;
		height: 44px;
		min-height: 44px;
	}
</style>
