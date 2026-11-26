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

	/** The moves and states the arrows walk through, in the picker's order (moves, then states), skipping ones with
	 *  nothing to show. */
	const sequence = $derived(
		moves
			? [
					...moves.clips.filter((clip) => clip.kind === 'move'),
					...moves.clips.filter((clip) => clip.kind === 'state')
				]
					.map((clip) => clip.key)
					.filter((key) => !moves.unavailable?.has(key))
			: []
	);
	/** Which end of the next move's directions to land on once its views arrive. */
	let landing = $state<'first' | 'last' | null>(null);
	/** Every direction of the shown move or state in turn, then on into the next (or previous) one, wrapping around. */
	function cycle(delta: 1 | -1) {
		const at = Math.max(
			0,
			views.findIndex((entry) => entry.id === current?.id)
		);
		const next = at + delta;
		if (next >= 0 && next < views.length) {
			facing = views[next].id;
			return;
		}
		if (!moves || sequence.length < 2) {
			if (views.length) facing = views[(next + views.length) % views.length].id;
			return;
		}
		const from = Math.max(0, sequence.indexOf(moves.selected));
		landing = delta > 0 ? 'first' : 'last';
		moves.onselect(sequence[(from + delta + sequence.length) % sequence.length]);
	}
	$effect(() => {
		const edge = landing;
		if (!edge || !views.length) return;
		untrack(() => {
			facing = (edge === 'first' ? views[0] : views[views.length - 1]).id;
			landing = null;
		});
	});
	const canCycle = $derived(views.length > 1 || sequence.length > 1);
</script>

<ImageViewer
	{title}
	{image}
	{box}
	label={[title, current?.label, frameText].filter(Boolean).join(' · ')}
	missing={t('spriteViewer.missing')}
	{onclose}
	onkeydown={(event) => {
		// Left and Right walk the views and , and . step frames, anywhere but the pickers and the image (where the arrows
		// pan).
		const target = event.target as HTMLElement;
		if (target.closest('select, [role=menu], [popover], .viewer-stage')) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			if (!canCycle) return;
			cycle(event.key === 'ArrowLeft' ? -1 : 1);
		} else if (event.key === ',' || event.key === '.') step(event.key === ',' ? -1 : 1);
		else return;
		event.preventDefault();
	}}
>
	{#snippet controls()}
		{#if canCycle}<button
				class="bu-action btn icon viewer-cycle"
				data-variant="outline"
				aria-label={t('spriteViewer.previousView')}
				title={t('spriteViewer.previousViewHint')}
				onclick={() => cycle(-1)}><ChevronLeft size={18} aria-hidden="true" /></button
			>{/if}
		<div class="viewer-pickers">
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
			{#if count > 1}<select
					class="bu-input viewer-direction"
					aria-label={t('spriteViewer.frame')}
					value={shown}
					onchange={(event) => (frame = Number(event.currentTarget.value))}
				>
					{#each current?.frames ?? [] as _, index (index)}
						<option value={index}>{t('spriteViewer.frameOption', { n: number(index + 1) })}</option>
					{/each}
				</select>{/if}
		</div>
		{#if canCycle}<button
				class="bu-action btn icon viewer-cycle"
				data-variant="outline"
				aria-label={t('spriteViewer.nextView')}
				title={t('spriteViewer.nextViewHint')}
				onclick={() => cycle(1)}><ChevronRight size={18} aria-hidden="true" /></button
			>{/if}
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
	/* The pickers stay on one line between the arrows; a phone wraps them on their own row. */
	.viewer-pickers {
		display: flex;
		flex: none;
		flex-wrap: nowrap;
		justify-content: center;
		gap: 8px;
		min-width: 0;
	}
	/* A phone moves the arrows up beside Close and gives the pickers the whole second row. */
	@media (max-width: 600px) {
		:global(dialog.image-viewer .sheet-head) {
			grid-template-columns: minmax(0, 1fr) auto auto auto;
		}
		:global(dialog.image-viewer .sheet-head .sheet-heading) {
			display: contents;
		}
		:global(dialog.image-viewer .sheet-head .sheet-start) {
			grid-area: 1 / 1;
		}
		.viewer-cycle:first-child {
			grid-area: 1 / 2;
		}
		.viewer-cycle:last-child {
			grid-area: 1 / 3;
		}
		:global(dialog.image-viewer .sheet-head .sheet-end) {
			grid-area: 1 / 4;
		}
		.viewer-pickers {
			grid-area: 2 / 1 / 3 / -1;
			flex-wrap: wrap;
		}
	}
	.viewer-cycle {
		flex: none;
		width: 40px;
		height: 40px;
		min-height: 40px;
		padding: 0;
	}
	@media (pointer: coarse) {
		.viewer-cycle {
			width: 44px;
			height: 44px;
			min-height: 44px;
		}
	}
</style>
