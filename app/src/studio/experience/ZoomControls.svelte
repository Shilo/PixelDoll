<script lang="ts">
	import { Minus, Plus } from '../icons.ts';
	const description = $props.id();
	let {
		value,
		min,
		max,
		onchange
	}: {
		value: number;
		min: number;
		max: number;
		onchange: (value: number) => void;
	} = $props();
</script>

<div
	class="scene-zoom bu-floating"
	role="group"
	aria-label="Scene zoom"
	title="Wheel or pinch to zoom. Focus the scene for +, -, and 0. Middle-click resets."
>
	<span class="sr" id={description}>{Math.round(value * 100)}% of automatic fit</span>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label="Zoom out"
		disabled={value <= min + 0.0001}
		onclick={() => onchange(Math.max(min, value / 1.1))}><Minus size={18} /></button
	>
	<button
		class="bu-action scene-zoom-reset num"
		data-variant="quiet"
		aria-label="Reset scene zoom"
		aria-describedby={description}
		title="Reset zoom (0 or middle-click in the scene)"
		onclick={() => onchange(1)}>{Math.round(value * 100)}%</button
	>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label="Zoom in"
		disabled={value >= max - 0.0001}
		onclick={() => onchange(Math.min(max, value * 1.1))}><Plus size={18} /></button
	>
</div>
