<script lang="ts" module>
	import type { Img } from '../lib/image/png.ts';
	/** One facing of the artwork: its frames in playback order, `null` where a frame is missing. */
	export type SpriteView = { id: string; label: string; frames: (Img | null)[] };
</script>

<script lang="ts">
	// Sprite frames in the image viewer. The move or state and the direction are pickers in its header, and the arrows on
	// the image's sides (or Left and Right) walk every view. The move plays at its own timing; a tap on the image, the corner button or
	// Space pauses it, and , and . step frames. A missing frame says so in place.
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import type { playbackClips } from '../lib/runtime/timeline.js';
	import ImageViewer from './ImageViewer.svelte';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import type { MoveRef } from './model.ts';
	import { Pause, Play } from './icons.ts';

	let {
		title,
		views,
		view: initialView,
		frame: initialFrame = 0,
		durations,
		moves,
		onclose
	}: {
		title: string;
		views: SpriteView[];
		/** The facing to open on, by id; the first by default. */
		view?: string;
		frame?: number;
		/** How long each frame shows, in ms (the move's timeline); 100 ms each by default. */
		durations?: readonly number[];
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
	// Every frame of every facing shares one box, so playing never rescales the sprite.
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

	// It plays unless the player asked for less motion.
	let playing = $state(
		typeof matchMedia === 'undefined' || !matchMedia('(prefers-reduced-motion: reduce)').matches
	);
	$effect(() => {
		if (!playing || count < 2) return;
		const ms = durations?.[shown] ?? 100;
		const timer = setTimeout(() => (frame = (shown + 1) % count), ms > 0 ? ms : 100);
		return () => clearTimeout(timer);
	});
	function step(delta: 1 | -1) {
		if (count < 2) return;
		playing = false;
		frame = (shown + delta + count) % count;
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
	label={[title, current?.label].filter(Boolean).join(' · ')}
	missing={t('spriteViewer.missing')}
	{onclose}
	step={canCycle
		? {
				previous: t('spriteViewer.previousView'),
				next: t('spriteViewer.nextView'),
				previousHint: t('spriteViewer.previousViewHint'),
				nextHint: t('spriteViewer.nextViewHint'),
				go: cycle
			}
		: undefined}
	ontap={count > 1 ? () => (playing = !playing) : undefined}
	corner={count > 1 ? playButton : undefined}
	onkeydown={(event) => {
		// Left and Right walk the views, , and . step frames and Space plays or pauses, anywhere but the pickers (and the
		// image, where the arrows pan).
		const target = event.target as HTMLElement;
		if (target.closest('select, [role=menu], [popover]')) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const onImage = !!target.closest('.viewer-stage');
		if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !onImage) {
			if (!canCycle) return;
			cycle(event.key === 'ArrowLeft' ? -1 : 1);
		} else if (event.key === ',' || event.key === '.') step(event.key === ',' ? -1 : 1);
		else if (event.key === ' ' && count > 1 && !target.closest('button')) playing = !playing;
		else return;
		event.preventDefault();
	}}
>
	{#snippet controls()}
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
		</div>
	{/snippet}
</ImageViewer>

{#snippet playButton()}
	<div class="viewer-play scene-zoom bu-floating">
		<button
			class="bu-action"
			data-variant="quiet"
			aria-label={playing ? t('common.pause') : t('common.play')}
			title={playing ? t('spriteViewer.pauseHint') : t('spriteViewer.playHint')}
			onclick={() => (playing = !playing)}
			>{#if playing}<Pause size={18} aria-hidden="true" />{:else}<Play
					size={18}
					aria-hidden="true"
				/>{/if}</button
		>
	</div>
{/snippet}

<style>
	/* Exactly its longest choice's width (the theme's fitSelects), not the chosen one's, so nothing beside it shifts. */
	.viewer-direction {
		inline-size: var(--bu-select-fit, auto);
		min-height: 40px;
		padding-block: 6px;
	}
	@media (pointer: coarse) {
		.viewer-direction {
			min-height: 44px;
			font-size: 16px;
		}
	}
	/* The pickers keep one line at every width; each keeps its longest choice's width. */
	.viewer-pickers {
		display: flex;
		flex: none;
		gap: 8px;
	}
	/* The play control matches the zoom controls across the image (same floating material and target size). */
	.viewer-play {
		position: static;
	}
</style>
