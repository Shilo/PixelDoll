<script lang="ts">
	// A full-window look at one image over whatever opened it. It opens fitted; the wheel, a trackpad pinch and a two-finger
	// pinch zoom around the pointer, dragging pans, and the focused image takes +, -, 0 and the arrows. Close, Escape and
	// browser Back dismiss only this viewer and give focus back to its opener. Hosts add their own header controls (a
	// sprite's move, direction and frame). Zoom and pan stay while the image changes within the same box, so the
	// same spot can be compared across frames; a different box fits again.
	import { onMount, untrack, type Snippet } from 'svelte';
	import { on } from 'svelte/events';
	import { formatNumber, t } from 'svelte-whisper';
	import type { Img } from '../lib/image/png.ts';
	import SurfaceHeader from './SurfaceHeader.svelte';
	import ZoomControls from './experience/ZoomControls.svelte';
	import { resolveZoom, settleZoom } from './experience/zoom.ts';
	import { openingTrigger, restoreTrigger } from './experience/focus.ts';
	import { claimSheetExit } from './sheetExit.ts';
	import { ChevronLeft, ChevronRight, ImageOff } from './icons.ts';
	import { ui } from './state.svelte.ts';
	import {
		centered,
		clampViewport,
		fitScale,
		viewerZoomStep,
		zoomAround,
		type Size,
		type Viewport
	} from './imageViewport.ts';

	let {
		title,
		image,
		box,
		label,
		missing = t('imageViewer.missing'),
		controls,
		corner,
		step,
		ontap,
		onkeydown,
		onclose
	}: {
		title: string;
		/** The image shown, or null for a gap (a missing frame), which says so in place. */
		image: Img | null;
		/** The box every image of a set shares (frames of one sprite), so changing images never rescales; the image's own
		 *  size by default. */
		box?: Size;
		/** What the image shows, for assistive technology. */
		label: string;
		missing?: string;
		/** Controls in the header beside the title, such as pickers. */
		controls?: Snippet;
		/** A control floating at the bottom right of the image, such as play and pause. */
		corner?: Snippet;
		/** Previous and next buttons on the image's left and right edges, as in a gallery. */
		step?: {
			previous: string;
			next: string;
			/** Tooltips, such as their keys. */
			previousHint?: string;
			nextHint?: string;
			go: (delta: 1 | -1) => void;
		};
		/** A tap or click on the image that did not drag or pinch, such as pausing an animation. */
		ontap?: () => void;
		/** Keys the image area did not use, such as frame stepping. */
		onkeydown?: (event: KeyboardEvent) => void;
		onclose: () => void;
	} = $props();

	const titleId = $props.id();
	let dialog: HTMLDialogElement;
	let stage = $state<HTMLDivElement>();
	let canvas = $state<HTMLCanvasElement>();
	let heading = $state<HTMLHeadingElement>();
	let width = $state(0);
	let height = $state(0);
	/** Null while the viewer shows its fit, which then follows the window as it resizes. */
	let stored = $state<number | null>(null);
	/** The image's top-left corner once someone moved it; centered until then. */
	let moved = $state<{ x: number; y: number } | null>(null);
	let announcement = $state('');

	const size = $derived<Size>(box ?? (image ? { w: image.w, h: image.h } : { w: 1, h: 1 }));
	// A little air around the fitted image.
	const room = $derived<Size>({ w: Math.max(0, width - 32), h: Math.max(0, height - 32) });
	const fit = $derived(fitScale(room, size, ui.dpr));
	const zoom = $derived(resolveZoom(stored, fit, [fit], 32));
	const view = $derived<Size>({ w: width, h: height });
	const viewport = $derived<Viewport>(
		moved
			? clampViewport({ scale: zoom.scale, ...moved }, view, size)
			: centered(view, size, zoom.scale)
	);
	const percent = (scale: number) => formatNumber(Math.round(scale * 100));

	function show(next: Viewport) {
		const scale = Math.min(zoom.max, Math.max(zoom.min, next.scale));
		const placed = clampViewport({ ...next, scale }, view, size);
		stored = scale;
		moved = { x: placed.x, y: placed.y };
	}
	function showFit() {
		stored = null;
		moved = null;
	}
	function zoomTo(scale: number, point = { x: width / 2, y: height / 2 }) {
		show(zoomAround(viewport, point, Math.min(zoom.max, Math.max(zoom.min, scale))));
		announce();
	}
	let announceTimer = 0;
	/** Says the zoom once a gesture or key settles, not on every wheel tick. */
	function announce() {
		clearTimeout(announceTimer);
		announceTimer = window.setTimeout(() => {
			announcement = t('imageViewer.zoomed', { percent: percent(zoom.scale) });
		}, 400);
	}
	// A different box (another move's frames) fits again: a kept zoom would point at a different spot.
	$effect(() => {
		void size.w;
		void size.h;
		untrack(showFit);
	});

	$effect(() => {
		const g = canvas?.getContext('2d');
		if (!canvas || !g) return;
		g.clearRect(0, 0, canvas.width, canvas.height);
		if (!image) return;
		const pixels = new ImageData(new Uint8ClampedArray(image.data), image.w, image.h);
		g.putImageData(pixels, Math.floor((size.w - image.w) / 2), Math.floor((size.h - image.h) / 2));
	});

	const point = (event: { clientX: number; clientY: number }) => {
		const rect = stage!.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	};
	// The wheel zooms around the pointer; a trackpad pinch arrives as a wheel with Ctrl and moves in finer steps.
	$effect(() => {
		if (!stage) return;
		return on(
			stage,
			'wheel',
			(event) => {
				event.preventDefault();
				const lines = event.deltaMode === 1 ? 16 : 1;
				const factor = Math.exp(-event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.002));
				zoomTo(viewport.scale * factor, point(event));
			},
			{ passive: false }
		);
	});

	// Pointers: one drags, two pinch around their midpoint (and pan as it moves). A released pinch settles on a fit or a
	// whole multiple nearby, as the stage's zoom does.
	const pointers = new Map<number, { x: number; y: number }>();
	let gesture: { start: Viewport; points: Map<number, { x: number; y: number }> } | null = null;
	let dragging = $state(false);
	/** A press that has not moved or met a second pointer yet: releasing it soon is a tap. */
	let tap: { x: number; y: number; at: number } | null = null;
	const begin = () => {
		gesture = pointers.size ? { start: viewport, points: new Map(pointers) } : null;
		dragging = pointers.size > 0;
	};
	function pointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// Pressing a floating control is not a drag or a tap on the image (capturing it would also swallow the click).
		if ((event.target as Element).closest('.viewer-zoom, .viewer-corner, .viewer-side')) return;
		pointers.set(event.pointerId, point(event));
		stage?.setPointerCapture(event.pointerId);
		tap = pointers.size === 1 ? { ...point(event), at: event.timeStamp } : null;
		begin();
	}
	function pointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId) || !gesture) return;
		pointers.set(event.pointerId, point(event));
		const now = point(event);
		if (tap && Math.hypot(now.x - tap.x, now.y - tap.y) > 6) tap = null;
		const ids = [...gesture.points.keys()].filter((id) => pointers.has(id)).slice(0, 2);
		const { start } = gesture;
		if (ids.length === 2) {
			const [a0, b0] = ids.map((id) => gesture!.points.get(id)!);
			const [a, b] = ids.map((id) => pointers.get(id)!);
			const before = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
			const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 },
				mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const scale = Math.min(
				zoom.max,
				Math.max(zoom.min, (start.scale * Math.hypot(b.x - a.x, b.y - a.y)) / before)
			);
			const zoomed = zoomAround(start, mid0, scale);
			show({ scale, x: zoomed.x + mid.x - mid0.x, y: zoomed.y + mid.y - mid0.y });
		} else if (ids.length === 1) {
			const from = gesture.points.get(ids[0])!,
				to = pointers.get(ids[0])!;
			show({ scale: start.scale, x: start.x + to.x - from.x, y: start.y + to.y - from.y });
		}
	}
	function pointerUp(event: PointerEvent) {
		if (!pointers.delete(event.pointerId)) return;
		if (tap && !pointers.size && event.type === 'pointerup' && event.timeStamp - tap.at < 500)
			ontap?.();
		tap = null;
		const pinched = (gesture?.points.size ?? 0) > 1;
		if (pinched) {
			const settled = settleZoom(zoom, viewport.scale);
			if (settled !== viewport.scale) zoomTo(settled);
			else announce();
		}
		begin();
	}

	function keydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const step = event.shiftKey ? 160 : 40;
		const pan = (dx: number, dy: number) =>
			show({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
		if (event.key === '+' || event.key === '=') zoomTo(viewerZoomStep(zoom, 1));
		else if (event.key === '-' || event.key === '_') zoomTo(viewerZoomStep(zoom, -1));
		else if (event.key === '0') {
			showFit();
			announce();
		} else if (event.key === 'ArrowLeft') pan(step, 0);
		else if (event.key === 'ArrowRight') pan(-step, 0);
		else if (event.key === 'ArrowUp') pan(0, step);
		else if (event.key === 'ArrowDown') pan(0, -step);
		else return;
		event.preventDefault();
		event.stopPropagation();
	}

	onMount(() => {
		const trigger = openingTrigger();
		const releaseExit = claimSheetExit({ close: () => onclose() });
		dialog.showModal();
		heading?.focus({ preventScroll: true });
		return () => {
			clearTimeout(announceTimer);
			releaseExit();
			dialog.close();
			restoreTrigger(trigger);
		};
	});
</script>

<dialog
	class="sheet image-viewer"
	bind:this={dialog}
	aria-labelledby={titleId}
	onkeydown={(event) => onkeydown?.(event)}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
>
	<SurfaceHeader
		{title}
		{titleId}
		titleAtStart
		heading={controls}
		{onclose}
		bind:titleElement={heading}
	/>
	<!-- An application region with its own keys and gestures, as the stage is. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="viewer-stage"
		bind:this={stage}
		bind:clientWidth={width}
		bind:clientHeight={height}
		data-dragging={dragging || undefined}
		role="application"
		aria-roledescription={t('imageViewer.role')}
		aria-label={`${label}. ${t('imageViewer.keys')}`}
		tabindex="0"
		onkeydown={keydown}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
	>
		{#if image}
			<canvas
				bind:this={canvas}
				class="viewer-canvas sprite checker"
				width={size.w}
				height={size.h}
				style:transform="translate({viewport.x}px, {viewport.y}px) scale({viewport.scale})"
				style:--chk="8px"
			></canvas>
		{:else}
			<p class="viewer-missing">
				<ImageOff size={28} aria-hidden="true" /><span>{missing}</span>
			</p>
		{/if}
		<!-- Bottom right: the host's control (play and pause), then previous and next at the edge, where they stay put
			 whether or not the host shows a control. -->
		{#if corner || step}<div class="viewer-corner">
				{#if corner}{@render corner()}{/if}
				{#if step}<div class="viewer-side bu-floating">
						<button
							class="bu-action"
							data-variant="quiet"
							aria-label={step.previous}
							title={step.previousHint ?? step.previous}
							onclick={() => step?.go(-1)}><ChevronLeft size={18} aria-hidden="true" /></button
						>
						<button
							class="bu-action"
							data-variant="quiet"
							aria-label={step.next}
							title={step.nextHint ?? step.next}
							onclick={() => step?.go(1)}><ChevronRight size={18} aria-hidden="true" /></button
						>
					</div>{/if}
			</div>{/if}
		<div class="viewer-zoom">
			<ZoomControls
				{zoom}
				step={viewerZoomStep}
				labels={{
					group: t('imageViewer.zoom'),
					hint: t('imageViewer.hint'),
					reset: t('imageViewer.fit'),
					resetHint: t('imageViewer.fitHint'),
					percent: t('imageViewer.percent', { percent: percent(zoom.scale) })
				}}
				onchange={(scale) => {
					if (scale === null) showFit();
					else zoomTo(scale);
					announce();
				}}
			/>
		</div>
		<p class="sr" aria-live="polite">{announcement}</p>
	</div>
</dialog>

<style>
	dialog.image-viewer {
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
	/* The title keeps one line beside the pickers and truncates first. */
	dialog.image-viewer :global(.sheet-start) {
		min-width: 0;
		padding-inline-start: 8px;
	}
	dialog.image-viewer :global(.sheet-start .sheet-title) {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	/* Pickers sit in the header's middle; a phone gives them their own row under the title and Close. */
	dialog.image-viewer :global(.sheet-heading) {
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	@media (max-width: 600px) {
		dialog.image-viewer :global(.sheet-head) {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		dialog.image-viewer :global(.sheet-heading) {
			grid-row: 2;
			grid-column: 1 / -1;
		}
	}
	/* The image fills the window: it moves by transform only, so panning and zooming never relayout. */
	.viewer-stage {
		container: viewer / inline-size;
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
		user-select: none;
		--bu-focus-offset: -3px;
	}
	.viewer-stage[data-dragging] {
		cursor: grabbing;
	}
	.viewer-canvas {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		transform-origin: 0 0;
		image-rendering: pixelated;
	}
	.viewer-missing {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 8px;
		margin: 0;
		color: var(--text-3);
	}
	/* The zoom controls float at the bottom right, clear of the image's center. */
	/* Zoom floats at the bottom left and the host's control (play and pause) at the bottom right, clear of the image's
	   center. */
	.viewer-zoom :global(.scene-zoom) {
		position: absolute;
		top: auto;
		right: auto;
		bottom: 12px;
		left: 12px;
	}
	.viewer-corner {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	/* Where zoom and this row would meet (about 360px wide), the host's control stacks above previous and next, which
	   keep the corner. */
	@container viewer (max-width: 360px) {
		.viewer-corner {
			flex-direction: column;
			align-items: flex-end;
		}
	}
	/* Previous and next share one floating group, each a 44px square like the zoom and play buttons. */
	.viewer-side {
		display: flex;
		padding: 2px;
		border-radius: var(--bu-radius-control);
	}
	.viewer-side .bu-action {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
	}
	.viewer-zoom,
	.viewer-corner,
	.viewer-side {
		cursor: auto;
	}
</style>
