<script lang="ts">
	// The Mount settings preview: the test mount always walks in place and turns through its facings. With Show mount on,
	// the open character (or the demo, when none is open) rides it exactly as on stage, following every mount setting.
	// Clicking pauses and plays. Its loop and image caches live only while Settings shows this page.
	import { t } from 'svelte-whisper';
	import type { Img } from '../lib/image/png.ts';
	import { DIRECTIONS, type DirectionName } from '../lib/rig/rig.ts';
	import type { Preset, Project } from '../lib/store/manifest.ts';
	import { displayDirection } from './displayDirection.ts';
	import { previewBounds } from './experience/bounds.ts';
	import { hideMountedLegs, mountLegGeometry } from './experience/mountLegs.ts';
	import { imageCanvas } from './experience/imageCanvas.ts';
	import { mountPlacement } from './experience/mountPlacement.ts';
	import { mountView, placeRider, sampleMountFrame, TEST_MOUNT } from './experience/mounts.ts';
	import {
		advancePlayback,
		buildPresentation,
		renderPresentation,
		resolveLive,
		type PlaybackClock
	} from './experience/presentation.ts';
	import { activeRiderPose, legsKept } from './experience/riderPose.ts';
	import { currentLiveClips } from './experience/liveViews.ts';
	import { experience } from './experience/state.svelte.ts';
	import { Pause, Play } from './icons.ts';
	import { openFixture } from '../lib/dress/project.ts';
	import { DEMO, doc, view } from './state.svelte.ts';

	const TURN_MS = 1400;
	let canvas = $state<HTMLCanvasElement>();
	let playing = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	let facing = $state<DirectionName>('south-east');

	// The open character, else the demo with its saved outfit, read once while this page is shown.
	let demo = $state.raw<{ project: Project; items: Preset['items'] } | null>(null);
	$effect(() => {
		if (view.project || demo) return;
		let live = true;
		void openFixture(DEMO).then(({ project, current }) => {
			if (live)
				demo = { project, items: current?.items ?? project.manifest.presets[0]?.items ?? {} };
		});
		return () => void (live = false);
	});
	const rider = $derived(
		view.project
			? { id: doc.id, project: view.project, items: view.items }
			: demo && { id: DEMO, ...demo }
	);
	const availability = $derived(rider && buildPresentation(rider.project));
	const grounding = $derived(rider ? previewBounds(rider.project) : null);
	const pose = $derived(rider ? activeRiderPose(rider.id, rider.project.manifest) : undefined);
	const riding = $derived(experience.testMount && !!rider);
	// Mounted, the turn follows the rider's own facings; the mount alone shows all eight.
	const facings = $derived<readonly DirectionName[]>(
		riding && availability?.directions.length ? availability.directions : DIRECTIONS
	);
	const shown = $derived(facings.includes(facing) ? facing : facings[0]);
	const standingHeight = $derived(grounding?.facings.get(shown)?.standingHeight ?? 48);

	const canvases = new WeakMap<Img, HTMLCanvasElement>();
	// Kept across play, pause and setting changes, so pausing freezes the current frame instead of restarting.
	let clock: PlaybackClock | undefined,
		clockRider = '',
		elapsed = 0,
		turned = 0;

	$effect(() => {
		const target = canvas,
			a = availability,
			current = rider,
			direction = shown,
			mounted = riding,
			ridingPose = pose,
			legs = experience.mountLegs,
			height = standingHeight,
			running = playing,
			turning = facings;
		if (!target) return;
		const g = target.getContext('2d')!;
		if (current?.id !== clockRider) {
			clock = undefined;
			clockRider = current?.id ?? '';
		}
		// The rider is composed only when its clip, facing or frame changes, not on every animation frame.
		let composed: { key: string; image: Img } | null = null,
			last = performance.now(),
			frameId = 0;
		const draw = (now: number) => {
			const dt = running ? now - last : 0;
			last = now;
			elapsed += dt;
			turned += dt;
			if (turned >= TURN_MS && turning.length > 1) {
				turned = 0;
				facing = turning[(turning.indexOf(direction) + 1) % turning.length];
				return;
			}
			const layers: { image: Img | HTMLCanvasElement; x: number; y: number }[] = [];
			let place = null;
			if (mounted && a && current) {
				const p = resolveLive(a, {
					velocity: { x: 0, y: 0 },
					riding: true,
					riderPose: ridingPose,
					items: current.items,
					defaultDirection: direction,
					clips: currentLiveClips(current.id, current.project.manifest.rig.animations)
				});
				clock = advancePlayback(p, clock, dt);
				place = mountPlacement(current.project, direction, p, grounding);
				const key = JSON.stringify([p.clip, p.direction, clock.cell]);
				if (composed?.key !== key && place?.view && p.clip && p.direction) {
					const result = renderPresentation(a, current.items, p, clock.cell);
					const mode = legsKept(current.project.manifest, p.clip) ? 'none' : legs;
					composed = result.image
						? {
								key,
								image: hideMountedLegs(
									result.image,
									result.frame,
									current.project.manifest.rig,
									p.clip,
									p.direction,
									clock.cell,
									mode,
									mode === 'none'
										? undefined
										: mountLegGeometry(current.project, p.clip, p.direction, clock.cell)
								).image
							}
						: null;
				}
				if (composed && place?.view) {
					const pose = place.view.frames[sampleMountFrame(place.view, elapsed)];
					const at = placeRider(place.ground, place.contact, pose);
					layers.push(
						{ image: pose.back, x: at.mount.x, y: at.mount.y },
						{ image: composed.image, x: at.rider.x, y: at.rider.y },
						{ image: pose.front, x: at.mount.x, y: at.mount.y }
					);
				}
			}
			if (!layers.length) {
				const alone = mountView(TEST_MOUNT, direction, height);
				if (alone.ok) {
					const pose = alone.view.frames[sampleMountFrame(alone.view, elapsed)];
					layers.push({ image: pose.back, x: 0, y: 0 }, { image: pose.front, x: 0, y: 0 });
				}
			}
			const box = layers.reduce(
				(b, l) => {
					const w = 'w' in l.image ? l.image.w : l.image.width,
						h = 'h' in l.image ? l.image.h : l.image.height;
					return {
						l: Math.min(b.l, l.x),
						t: Math.min(b.t, l.y),
						r: Math.max(b.r, l.x + w),
						b: Math.max(b.b, l.y + h)
					};
				},
				{ l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }
			);
			const width = Math.round(target.clientWidth * devicePixelRatio),
				tall = Math.round(target.clientHeight * devicePixelRatio);
			if (target.width !== width || target.height !== tall) {
				target.width = width;
				target.height = tall;
			}
			g.clearRect(0, 0, width, tall);
			if (layers.length) {
				// Whole-pixel scale, the same for the walk's rise and fall, centered on the stage.
				const scale = Math.max(
					1,
					Math.floor(Math.min((width * 0.85) / (box.r - box.l), (tall * 0.85) / (box.b - box.t)))
				);
				const left = Math.round((width - (box.r - box.l) * scale) / 2) - box.l * scale,
					top = Math.round((tall - (box.b - box.t) * scale) / 2) - box.t * scale;
				g.imageSmoothingEnabled = false;
				for (const l of layers) {
					const image = 'data' in l.image ? imageCanvas(l.image, canvases) : l.image;
					g.drawImage(
						image,
						left + l.x * scale,
						top + l.y * scale,
						image.width * scale,
						image.height * scale
					);
				}
			}
			target.dataset.facing = direction;
			target.dataset.rider = mounted && layers.length > 2 ? (current?.id ?? '') : '';
			// Paused, the frame stays drawn; a settings change reruns this effect and draws once more.
			if (running) frameId = requestAnimationFrame(draw);
		};
		frameId = requestAnimationFrame(draw);
		// A paused preview redraws once when its box changes size, so the pixel scale stays whole.
		const resized = new ResizeObserver(() => {
			if (running) return;
			cancelAnimationFrame(frameId);
			frameId = requestAnimationFrame(draw);
		});
		resized.observe(target);
		return () => {
			cancelAnimationFrame(frameId);
			resized.disconnect();
		};
	});
</script>

<button
	class="mount-preview"
	type="button"
	aria-label={t(playing ? 'settings.mountPreviewPause' : 'settings.mountPreviewPlay')}
	aria-describedby="mount-preview-facing"
	onclick={() => (playing = !playing)}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<span class="mount-play" aria-hidden="true">
		{#if playing}<Pause size={18} />{:else}<Play size={18} />{/if}
	</span>
</button>
<p class="mount-caption" id="mount-preview-facing">{displayDirection(shown)}</p>

<style>
	.mount-preview {
		position: relative;
		display: grid;
		inline-size: 100%;
		block-size: min(240px, 32dvh);
		padding: 0;
		overflow: hidden;
		cursor: pointer;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	.mount-preview:hover {
		border-color: var(--bu-border);
	}
	canvas {
		inline-size: 100%;
		block-size: 100%;
		image-rendering: pixelated;
	}
	.mount-play {
		position: absolute;
		inset-block-end: 0;
		inset-inline-end: 0;
		min-block-size: 44px;
		min-inline-size: 44px;
		display: grid;
		place-items: center;
		color: var(--bu-text);
	}
	.mount-caption {
		margin: 4px 0 8px;
		text-align: center;
		font-size: 12px;
		color: var(--bu-muted);
	}
</style>
