<script lang="ts">
	import { Minus, Plus } from '../icons.ts';
	import { zoomStep, type SceneZoom } from './zoom.ts';
	const description = $props.id();
	let {
		zoom,
		onchange
	}: {
		zoom: SceneZoom;
		/** A chosen scale, or null to show the fit again. */
		onchange: (scale: number | null) => void;
	} = $props();
	const percent = $derived(Math.round(zoom.scale * 100));
</script>

<div
	class="scene-zoom bu-floating"
	role="group"
	aria-label="Scene zoom"
	title="Wheel or pinch to zoom. Focus the scene for +, -, and 0. Middle-click resets."
>
	<span class="sr" id={description}>{percent}% of the character's true size</span>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label="Zoom out"
		disabled={zoom.scale <= zoom.min + 1e-9}
		onclick={() => onchange(zoomStep(zoom, -1))}><Minus size={18} /></button
	>
	<button
		class="bu-action scene-zoom-reset num"
		data-variant="quiet"
		aria-label="Reset scene zoom"
		aria-describedby={description}
		title="Reset to the fit (0 or middle-click in the scene)"
		onclick={() => onchange(null)}>{percent}%</button
	>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label="Zoom in"
		disabled={zoom.scale >= zoom.max - 1e-9}
		onclick={() => onchange(zoomStep(zoom, 1))}><Plus size={18} /></button
	>
</div>
