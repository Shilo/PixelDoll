<script lang="ts">
	import { t } from 'svelte-whisper';
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
	aria-label={t('zoomControls.sceneZoom')}
	title={t('zoomControls.titleWheelOrPinchToZoomFocus')}
>
	<span class="sr" id={description}
		>{t('zoomControls.percentOfTheCharacterSTrueSize', { percent })}</span
	>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label={t('common.zoomOut')}
		disabled={zoom.scale <= zoom.min + 1e-9}
		onclick={() => onchange(zoomStep(zoom, -1))}><Minus size={18} /></button
	>
	<button
		class="bu-action scene-zoom-reset num"
		data-variant="quiet"
		aria-label={t('zoomControls.resetSceneZoom')}
		aria-describedby={description}
		title={t('zoomControls.titleResetToTheFit0Or')}
		onclick={() => onchange(null)}>{percent}%</button
	>
	<button
		class="bu-action"
		data-variant="quiet"
		aria-label={t('common.zoomIn')}
		disabled={zoom.scale >= zoom.max - 1e-9}
		onclick={() => onchange(zoomStep(zoom, 1))}><Plus size={18} /></button
	>
</div>
