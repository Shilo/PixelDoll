<script lang="ts">
	// The turning start-pose preview shared by Create State and Add a move: the stored cell fills the box, the whole
	// box plays and pauses the turn through every facing, and the frame stepper sits outside it.
	import { tick } from 'svelte';
	import { t } from 'svelte-whisper';
	import type { Img } from '../lib/image/png.ts';
	import type { DirectionName } from '../lib/rig/rig.ts';
	import { displayDirection } from './displayDirection.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import { ChevronLeft, ChevronRight, Pause, Play } from './icons.ts';
	import Sprite from './Sprite.svelte';
	import { ui } from './state.svelte.ts';

	let {
		previews,
		source,
		frame,
		frames,
		disabled = false,
		onstep
	}: {
		previews: readonly { direction: DirectionName; image: Img | null }[];
		/** The source's display name, for the preview's accessible name. */
		source: string;
		/** Position and count of the frames the stepper moves through. */
		frame: number;
		frames: number;
		disabled?: boolean;
		onstep: (delta: number) => void;
	} = $props();

	const id = $props.id();
	let previous = $state<HTMLButtonElement>();
	let next = $state<HTMLButtonElement>();
	// Reaching either end disables the pressed arrow, so focus moves to the other one instead of being lost.
	async function step(delta: number) {
		onstep(delta);
		const at = frame + delta;
		await tick();
		if (at <= 0) next?.focus();
		else if (at >= frames - 1) previous?.focus();
	}
	let facing = $state<DirectionName | null>(null);
	let rotating = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	const canRotate = $derived(previews.length > 1);
	// Starts on the Studio's facing; stepping frames keeps the facing the user is looking at.
	const shown = $derived(
		previews.find(({ direction }) => direction === facing) ??
			previews.find(({ direction }) => direction === ui.dir) ??
			previews[0]
	);
	$effect(() => {
		const count = previews.length;
		if (!rotating || count < 2) return;
		const timer = window.setInterval(() => {
			const at = previews.findIndex(({ direction }) => direction === shown?.direction);
			facing = previews[(at + 1) % count].direction;
		}, 700);
		return () => window.clearInterval(timer);
	});
</script>

{#if shown}
	{@const facingName = displayDirection(shown.direction)}
	{#snippet sprite()}
		<span class="cell-frame" data-facing={shown.direction}>
			<Sprite
				img={shown.image}
				k={shown.image ? croppedBacking(280, shown.image, ui.dpr) : 1}
				fitToBox
				checker
				label={t('stateCapture.preview', { source, facing: facingName })}
			/>
		</span>
	{/snippet}
	{#if canRotate}
		<button
			class="source-preview"
			type="button"
			aria-label={t(rotating ? 'common.pause' : 'common.play')}
			aria-describedby="{id}-facing"
			onclick={() => (rotating = !rotating)}
		>
			{@render sprite()}
			<span class="source-play" aria-hidden="true">
				{#if rotating}<Pause size={18} />{:else}<Play size={18} />{/if}
			</span>
		</button>
	{:else}
		<div class="source-preview">{@render sprite()}</div>
	{/if}
	<p class="cell-caption" id="{id}-facing">{facingName}</p>
{/if}
{#if frames > 1}
	<div class="source-nav">
		<button
			class="bu-action"
			data-variant="quiet"
			type="button"
			aria-label={t('stage.previousFrame')}
			disabled={disabled || frame === 0}
			bind:this={previous}
			onclick={() => step(-1)}><ChevronLeft size={20} /></button
		>
		<strong aria-live="polite"
			>{t('stage.framePosition', { frame: frame + 1, total: frames })}</strong
		>
		<button
			class="bu-action"
			data-variant="quiet"
			type="button"
			aria-label={t('stage.nextFrame')}
			disabled={disabled || frame >= frames - 1}
			bind:this={next}
			onclick={() => step(1)}><ChevronRight size={20} /></button
		>
	</div>
{/if}

<style>
	/* The stored cell fills the preview: the box edge is the cell edge. */
	.source-preview {
		position: relative;
		display: grid;
		justify-self: center;
		inline-size: min(100%, 280px, 36dvh);
		aspect-ratio: 1;
		padding: 0;
		overflow: hidden;
		color: inherit;
		font: inherit;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	button.source-preview {
		cursor: pointer;
	}
	button.source-preview:hover {
		border-color: var(--bu-border);
	}
	.cell-frame {
		display: grid;
		inline-size: 100%;
		block-size: 100%;
	}
	.cell-caption {
		margin: -4px 0 0;
		text-align: center;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.source-play {
		position: absolute;
		inset-block-end: 0;
		inset-inline-end: 0;
		min-block-size: 44px;
		min-inline-size: 44px;
		display: grid;
		place-items: center;
	}
	.source-nav {
		margin-block-start: -4px;
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) 44px;
		align-items: center;
		justify-self: center;
		inline-size: min(100%, 248px);
		gap: 8px;
		text-align: center;
	}
	.source-nav button {
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
	.source-nav strong {
		font-variant-numeric: tabular-nums;
	}
</style>
