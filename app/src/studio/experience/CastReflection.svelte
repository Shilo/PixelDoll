<script lang="ts">
	import { ui } from '../state.svelte.ts';
	import { stills, thumbScale } from './thumbnails.svelte.ts';
	import { REFLECTION, drawReflection, reflectionCanvas, reflectionStyle } from './reflection.ts';
	let {
		id,
		size,
		horizon,
		focal
	}: {
		id: string;
		size: number;
		horizon: number;
		focal: number;
	} = $props();
	const still = $derived(stills.get(id));
	const scale = $derived(thumbScale(size, still, ui.dpr));
	const groundRow = $derived(still ? still.frame.y + still.body.h - still.body.y : 0);
	const floor = $derived((groundRow - (still?.image?.h ?? 0)) * scale);
	const style = $derived(reflectionStyle(floor, horizon, focal));
	const source = $derived(
		still?.image ? reflectionCanvas(still.image, groundRow, still.body.h) : null
	);
	const width = $derived((still?.image?.w ?? 0) * scale);
	const height = $derived(Math.max(0, groundRow * scale * style.compression));
	let canvas: HTMLCanvasElement;
	$effect(() => {
		const context = canvas.getContext('2d')!;
		context.clearRect(0, 0, canvas.width, canvas.height);
		if (!REFLECTION.enabled || !REFLECTION.selection || !source) return;
		context.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
		drawReflection(context, source, { x: 0, y: -groundRow * scale, scale, groundRow }, style);
	});
</script>

<canvas
	bind:this={canvas}
	class="cast-reflection"
	aria-hidden="true"
	width={Math.ceil(width * ui.dpr)}
	height={Math.ceil(height * ui.dpr)}
	style:width="{Math.ceil(width * ui.dpr) / ui.dpr}px"
	style:height="{Math.ceil(height * ui.dpr) / ui.dpr}px"
	style:left="{(size - width) / 2}px"
	style:top="{floor}px"
></canvas>

<style>
	.cast-reflection {
		position: absolute;
		pointer-events: none;
		image-rendering: pixelated;
	}
</style>
