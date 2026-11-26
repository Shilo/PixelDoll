<script lang="ts" module>
	import type { Img } from '../lib/image/png.ts';
	/** One facing of the artwork: its frames in playback order, `null` where a frame is missing. */
	export type SpriteView = { id: string; label: string; short?: string; frames: (Img | null)[] };
</script>

<script lang="ts">
	// A full-window look at whole sprite frames over the sheet that opened it: Close, Escape and browser Back dismiss only
	// this viewer and give focus back to its opener. Frames keep their real numbers, and a missing frame says so in place.
	import { onMount, untrack } from 'svelte';
	import Sprite from './Sprite.svelte';
	import SurfaceHeader from './SurfaceHeader.svelte';
	import { ChevronLeft, ChevronRight, ImageOff } from './icons.ts';
	import { openingTrigger, restoreTrigger } from './experience/focus.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import { ui } from './state.svelte.ts';
	import { formatNumber, t } from 'svelte-whisper';

	let {
		title,
		context = '',
		views,
		view: initialView = 0,
		frame: initialFrame = 0,
		onclose
	}: {
		title: string;
		/** What the frames show, such as the move's name. */
		context?: string;
		views: SpriteView[];
		view?: number;
		frame?: number;
		onclose: () => void;
	} = $props();
	const titleId = $props.id();
	let dialog: HTMLDialogElement;
	let heading = $state<HTMLHeadingElement>();
	let width = $state(0);
	let height = $state(0);
	const clamp = (value: number, count: number) => Math.max(0, Math.min(value, count - 1));
	let at = $state(untrack(() => clamp(initialView, views.length)));
	let frame = $state(
		untrack(() => clamp(initialFrame, views[clamp(initialView, views.length)].frames.length))
	);
	const current = $derived(views[at]);
	const count = $derived(current.frames.length);
	const image = $derived(current.frames[clamp(frame, count)]);
	// Every frame of every facing shares one box, so stepping never rescales the sprite.
	const box = $derived.by(() => {
		let w = 1,
			h = 1;
		for (const entry of views)
			for (const img of entry.frames)
				if (img) {
					w = Math.max(w, img.w);
					h = Math.max(h, img.h);
				}
		return { w, h };
	});
	const fit = $derived(Math.min(width / box.w, height / box.h));
	const scale = $derived(Math.max(1, Math.floor(fit * ui.dpr)));
	const number = (value: number) => formatNumber(value, { useGrouping: false });
	const caption = $derived(
		[
			context,
			current.label,
			count > 1
				? t('spriteViewer.frameOf', {
						frame: number(clamp(frame, count) + 1),
						count: number(count)
					})
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);

	function step(delta: 1 | -1) {
		if (count < 2) return;
		frame = (clamp(frame, count) + delta + count) % count;
	}
	function show(index: number) {
		at = index;
		frame = clamp(frame, views[index].frames.length);
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
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		const delta = event.key === 'ArrowLeft' ? -1 : 1;
		event.preventDefault();
		if (count > 1) step(delta);
		else if (views.length > 1) show((at + delta + views.length) % views.length);
	}}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
>
	<SurfaceHeader {title} {titleId} {onclose} bind:titleElement={heading} />
	<div class="viewer-stage">
		<p class="viewer-caption" aria-live="polite">{caption}</p>
		<div class="viewer-fit" bind:clientWidth={width} bind:clientHeight={height}>
			{#if image && width && height}
				<Sprite
					img={image}
					k={scale}
					w={box.w}
					h={box.h}
					limit={fit * Math.max(box.w, box.h)}
					checker
					checkerSize={24}
					label={`${title} · ${caption}`}
				/>
			{:else if !image}
				<p class="viewer-missing">
					<ImageOff size={28} aria-hidden="true" /><span>{t('spriteViewer.missing')}</span>
				</p>
			{/if}
		</div>
		{#if views.length > 1 || count > 1}
			<div class="viewer-controls">
				{#if views.length > 1}
					<div class="viewer-views" role="group" aria-label={t('spriteViewer.direction')}>
						{#each views as entry, index (entry.id)}
							<button
								class="bu-action btn"
								data-variant={index === at ? 'primary' : 'outline'}
								aria-pressed={index === at}
								aria-label={entry.short ? entry.label : undefined}
								onclick={() => show(index)}>{entry.short ?? entry.label}</button
							>
						{/each}
					</div>
				{/if}
				{#if count > 1}
					<div class="viewer-frames" role="group" aria-label={t('spriteViewer.frames')}>
						<button
							class="bu-action btn icon"
							data-variant="outline"
							aria-label={t('stage.previousFrame')}
							onclick={() => step(-1)}><ChevronLeft size={18} aria-hidden="true" /></button
						>
						<span class="viewer-count">{number(clamp(frame, count) + 1)} / {number(count)}</span>
						<button
							class="bu-action btn icon"
							data-variant="outline"
							aria-label={t('stage.nextFrame')}
							onclick={() => step(1)}><ChevronRight size={18} aria-hidden="true" /></button
						>
					</div>
				{/if}
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
	.viewer-stage {
		flex: 1;
		min-height: 0;
		padding: clamp(12px, 4vmin, 32px);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.viewer-caption {
		flex: none;
		margin: 0;
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: center;
	}
	.viewer-fit {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		place-items: safe center;
	}
	.viewer-missing {
		display: grid;
		justify-items: center;
		gap: 8px;
		margin: 0;
		color: var(--text-3);
	}
	.viewer-controls {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 12px 24px;
	}
	.viewer-views,
	.viewer-frames {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.viewer-views :global(.btn) {
		min-width: 44px;
		min-height: 44px;
	}
	.viewer-frames :global(.btn) {
		width: 44px;
		height: 44px;
		min-height: 44px;
	}
	.viewer-count {
		min-width: 4.5ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
	}
</style>
