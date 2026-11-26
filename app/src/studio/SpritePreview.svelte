<script lang="ts" module>
	import type { Img } from '../lib/image/png.ts';
	/** One facing of the artwork: its frames in playback order, `null` where a frame is missing. */
	export type SpriteView = { id: string; label: string; frames: (Img | null)[] };
</script>

<script lang="ts">
	// Sprite frames in the image viewer: the move or state and the direction are pickers in its header, the frame steps in
	// its footer (and with the arrow keys outside the image). Frames keep their true numbers, and a missing frame says so in
	// place. Changing direction or move keeps the frame and the zoom where they still fit.
	import { untrack } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import type { playbackClips } from '../lib/runtime/timeline.js';
	import ImageViewer from './ImageViewer.svelte';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import type { MoveRef } from './model.ts';
	import { ChevronLeft, ChevronRight } from './icons.ts';

	let {
		title,
		views,
		view: initialView,
		frame: initialFrame = 0,
		moves,
		onclose
	}: {
		title: string;
		views: SpriteView[];
		/** The facing to open on, by id; the first by default. */
		view?: string;
		frame?: number;
		/** The move or state shown, which the header's picker changes (the host then passes that move's views). */
		moves?: {
			clips: readonly Pick<ReturnType<typeof playbackClips>[number], 'id' | 'key' | 'kind'>[];
			moveRefs: readonly MoveRef[];
			selected: string;
			/** Moves with nothing to show, with the reason. */
			unavailable?: ReadonlyMap<string, string>;
			onselect: (key: string) => void;
		};
		onclose: () => void;
	} = $props();

	let facing = $state(untrack(() => initialView ?? views[0]?.id ?? ''));
	let frame = $state(untrack(() => initialFrame));
	const current = $derived(views.find((entry) => entry.id === facing) ?? views[0]);
	const count = $derived(current?.frames.length ?? 0);
	const shown = $derived(count ? Math.min(Math.max(0, frame), count - 1) : 0);
	const image = $derived(current?.frames[shown] ?? null);
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
	const number = (value: number) => formatNumber(value, { useGrouping: false });
	const frameText = $derived(
		count > 1 ? t('spriteViewer.frameOf', { frame: number(shown + 1), count: number(count) }) : ''
	);

	function step(delta: 1 | -1) {
		if (count > 1) frame = (shown + delta + count) % count;
	}
</script>

{#snippet frames()}
	{#if count > 1}
		<div class="viewer-frames" role="group" aria-label={t('spriteViewer.frames')}>
			<button
				class="bu-action btn icon"
				data-variant="outline"
				aria-label={t('stage.previousFrame')}
				onclick={() => step(-1)}><ChevronLeft size={18} aria-hidden="true" /></button
			>
			<span class="viewer-count" aria-live="polite">{number(shown + 1)} / {number(count)}</span>
			<button
				class="bu-action btn icon"
				data-variant="outline"
				aria-label={t('stage.nextFrame')}
				onclick={() => step(1)}><ChevronRight size={18} aria-hidden="true" /></button
			>
		</div>
	{/if}
{/snippet}

<ImageViewer
	{title}
	{image}
	{box}
	label={[title, current?.label, frameText].filter(Boolean).join(' · ')}
	missing={t('spriteViewer.missing')}
	{onclose}
	footer={count > 1 ? frames : undefined}
	onkeydown={(event) => {
		// Frames step with the arrows anywhere but the pickers and the image (where they pan).
		const target = event.target as HTMLElement;
		if (target.closest('select, [role=menu], [popover], .viewer-stage')) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		step(event.key === 'ArrowLeft' ? -1 : 1);
	}}
>
	{#snippet controls()}
		{#if moves}<PlaybackPicker
				clips={moves.clips}
				moveRefs={moves.moveRefs}
				selected={moves.selected}
				unavailable={moves.unavailable}
				placement="bottom-start"
				boxed
				onselect={moves.onselect}
			/>{/if}
		{#if views.length > 1}<select
				class="bu-input viewer-direction"
				aria-label={t('spriteViewer.direction')}
				value={current?.id}
				onchange={(event) => (facing = event.currentTarget.value)}
			>
				{#each views as entry (entry.id)}
					<option value={entry.id}>{entry.label}</option>
				{/each}
			</select>{/if}
	{/snippet}
</ImageViewer>

<style>
	.viewer-direction {
		width: auto;
		min-height: 40px;
		padding-block: 6px;
	}
	@media (pointer: coarse) {
		.viewer-direction {
			min-height: 44px;
			font-size: 16px;
		}
	}
	.viewer-frames {
		display: flex;
		align-items: center;
		gap: 6px;
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
