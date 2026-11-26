<script lang="ts">
	import { t } from 'svelte-whisper';
	import { Minus, Plus } from '../icons.ts';
	import { zoomStep, type SceneZoom } from './zoom.ts';
	const description = $props.id();
	let {
		zoom,
		labels,
		step = zoomStep,
		onchange
	}: {
		zoom: SceneZoom;
		/** Words for something other than the scene (an image viewer); the scene's by default. */
		labels?: { group: string; hint: string; reset: string; resetHint: string; percent: string };
		/** The next scale either way; the scene's zoom ladder by default. */
		step?: (zoom: SceneZoom, direction: 1 | -1) => number;
		/** A chosen scale, or null to show the fit again. */
		onchange: (scale: number | null) => void;
	} = $props();
	const percent = $derived(Math.round(zoom.scale * 100));
	const words = $derived(
		labels ?? {
			group: t('zoomControls.sceneZoom'),
			hint: t('zoomControls.titleWheelOrPinchToZoomFocus'),
			reset: t('zoomControls.resetSceneZoom'),
			resetHint: t('zoomControls.titleResetToTheFit0Or'),
			percent: t('zoomControls.percentOfTheCharacterSTrueSize', { percent })
		}
	);
</script>

<div class="scene-zoom bu-floating" role="group" aria-label={words.group} title={words.hint}>
	<span class="sr" id={description}>{words.percent}</span>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label={t('common.zoomOut')}
		disabled={zoom.scale <= zoom.min + 1e-9}
		onclick={() => onchange(step(zoom, -1))}><Minus size={18} /></button
	>
	<button
		class="bu-action scene-zoom-reset num"
		data-variant="quiet"
		aria-label={words.reset}
		aria-describedby={description}
		title={words.resetHint}
		onclick={() => onchange(null)}>{percent}%</button
	>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label={t('common.zoomIn')}
		disabled={zoom.scale >= zoom.max - 1e-9}
		onclick={() => onchange(step(zoom, 1))}><Plus size={18} /></button
	>
</div>
