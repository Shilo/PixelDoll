<script lang="ts">
	import { ui } from '../state.svelte.ts';
	import { castPose } from './carousel.ts';
	import { floorRing } from './floorRing.ts';
	import { groundedThumb, stills, thumbScale } from './thumbnails.svelte.ts';
	let {
		size,
		span = 1,
		width,
		zoom = 1,
		floorHorizon,
		floorFocal,
		selectedId
	}: {
		size: number;
		span?: number;
		width: number;
		zoom?: number;
		floorHorizon: number;
		floorFocal: number;
		selectedId: string | null;
	} = $props();
	const still = $derived(stills.get(selectedId ?? ''));
	const art = $derived(groundedThumb(size, still, ui.dpr));
	const pose = $derived(castPose(0, width, size, span, { hero: art, side: art }));
	const scale = $derived(thumbScale(size, still, ui.dpr) * art.scale * pose.scale);
	const ring = $derived(
		floorRing(
			still?.body.w ?? 64,
			still?.body.h ?? 50,
			scale,
			zoom,
			-floorHorizon,
			floorFocal,
			ui.dpr
		)
	);
	const halfStroke = $derived(ring.stroke / 2);
</script>

{#if selectedId}
	<svg
		class="selection-ring"
		aria-hidden="true"
		data-selected-id={selectedId}
		data-ring-rx={ring.rx}
		data-ring-ry={ring.ry}
		data-ring-rise={ring.rise}
		data-ring-stroke={ring.stroke}
		data-ring-left={-ring.rx - halfStroke}
		data-ring-right={ring.rx + halfStroke}
		data-ring-top={-ring.rise - ring.ry - halfStroke}
		data-ring-bottom={-ring.rise + ring.ry + halfStroke}
		width={2 * (ring.rx + halfStroke)}
		height={2 * (ring.ry + halfStroke)}
		style:bottom="{ring.rise - ring.ry - halfStroke}px"
		style:margin-left="{-ring.rx - halfStroke}px"
	>
		<ellipse
			cx={ring.rx + halfStroke}
			cy={ring.ry + halfStroke}
			rx={ring.rx}
			ry={ring.ry}
			stroke-width={ring.stroke}
		/>
	</svg>
{/if}

<style>
	.selection-ring {
		position: absolute;
		left: 50%;
		z-index: 0;
		fill: none;
		stroke: var(--bu-accent);
		opacity: 0.85;
		pointer-events: none;
	}
</style>
