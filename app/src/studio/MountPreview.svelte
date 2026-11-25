<script lang="ts">
	// The Mount settings preview: the test mount always walks in place and turns through its facings. With Show mount on,
	// the open character (or the demo, when none is open) rides it exactly as on stage, following every mount setting.
	// Clicking pauses and plays. Its loop and image caches live only while Settings shows this page.
	import { tick } from 'svelte';
	import { t } from 'svelte-whisper';
	import { bakedFrame } from '../lib/compose/compose.ts';
	import { openFixture } from '../lib/dress/project.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import type { Img } from '../lib/image/png.ts';
	import { DIRECTIONS, type DirectionName, type RiderSeatPoint } from '../lib/rig/rig.ts';
	import {
		reviewedSeatPoint,
		riderSeatArt,
		seatPose,
		type RiderSeatEdit
	} from '../lib/rig/riderSeat.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
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
	import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play } from './icons.ts';
	import {
		DEMO,
		doc,
		openingProjectId,
		saveRiderSeat,
		store,
		toast,
		view
	} from './state.svelte.ts';

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
	const presentation = $derived(
		riding && rider && availability
			? resolveLive(availability, {
					velocity: { x: 0, y: 0 },
					riding: true,
					riderPose: pose,
					items: rider.items,
					defaultDirection: shown,
					clips: currentLiveClips(rider.id, rider.project.manifest.rig.animations)
				})
			: null
	);
	const placement = $derived(
		rider && presentation ? mountPlacement(rider.project, shown, presentation, grounding) : null
	);
	const authored = $derived(store.project?.manifest);
	const selected = $derived(authored?.rig.animations.find(({ id }) => id === pose));
	const selectable = $derived(
		riding && doc.id && !doc.id.startsWith('fixture:') && !openingProjectId() && seatPose(selected)
	);
	const target = $derived.by((): RiderSeatEdit | null => {
		if (
			!selectable ||
			!authored ||
			!selected ||
			!placement?.view ||
			presentation?.clip !== selected.id ||
			presentation.direction !== shown
		)
			return null;
		const art = riderSeatArt(authored, selected, shown);
		if (!art || !store.project?.images.has(art.body)) return null;
		return {
			clip: selected.id,
			facing: shown,
			art,
			saved: reviewedSeatPoint(authored, selected, shown)
		};
	});

	type Point = Pick<RiderSeatPoint, 'x' | 'y'>;
	let draft = $state.raw<{ id: string; target: RiderSeatEdit; point: Point | null } | null>(null);
	const editing = $derived(
		draft &&
			target &&
			draft.id === doc.id &&
			draft.target.clip === target.clip &&
			draft.target.facing === target.facing &&
			draft.target.art.body === target.art.body &&
			draft.target.art.source === target.art.source
			? draft
			: null
	);
	$effect.pre(() => {
		if (draft && !editing) draft = null;
	});
	const draftPlacement = $derived(
		editing && rider && presentation
			? mountPlacement(rider.project, shown, presentation, grounding, editing.point)
			: placement
	);
	const changed = $derived(
		editing &&
			(editing.point?.x !== editing.target.saved?.x || editing.point?.y !== editing.target.saved?.y)
	);
	let busy = $state(false);
	let failure = $state<string | Message>('');
	let adjustButton = $state<HTMLButtonElement>();
	let nudgeControls = $state<HTMLDivElement>();
	const nudges = $derived([
		{ label: t('settings.seatLeft'), icon: ArrowLeft, x: -1, y: 0 },
		{ label: t('settings.seatUp'), icon: ArrowUp, x: 0, y: -1 },
		{ label: t('settings.seatDown'), icon: ArrowDown, x: 0, y: 1 },
		{ label: t('settings.seatRight'), icon: ArrowRight, x: 1, y: 0 }
	]);

	async function beginEdit() {
		if (!target) return;
		playing = false;
		failure = '';
		draft = { id: doc.id, target, point: target.saved ?? null };
		await tick();
		nudgeControls?.querySelector('button')?.focus();
	}
	async function endEdit() {
		draft = null;
		await tick();
		adjustButton?.focus({ preventScroll: true });
	}
	function nudge(x: number, y: number) {
		if (!editing || !authored || !rider || !draftPlacement?.view) return;
		const { cell, pivot } = authored.rig;
		const frame = bakedFrame(rider.project.manifest);
		const contact = draftPlacement.contact;
		// Match placeRider's half-pixel tie before applying the first whole-pixel nudge.
		draft = {
			...editing,
			point: {
				x: Math.max(0, Math.min(cell.w, Math.ceil(contact.x - frame.x + pivot.x - 0.5) - x)),
				y: Math.max(0, Math.min(cell.h, Math.ceil(contact.y - frame.y + pivot.y - 0.5) - y))
			}
		};
	}
	async function saveSeat() {
		if (!editing || !changed || busy) return;
		busy = true;
		failure = '';
		try {
			await saveRiderSeat(editing.id, editing.target, editing.point);
			await endEdit();
		} catch (error) {
			if (editing) failure = errorMessage(error);
			else toast(errorMessage(error), { tone: 'danger', error });
		} finally {
			busy = false;
		}
	}

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
			p = presentation,
			place = draftPlacement,
			savedPlacement = editing ? placement : null,
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
			let center: Point | undefined;
			if (mounted && a && current && p) {
				clock = advancePlayback(p, clock, dt);
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
					if (savedPlacement?.view) {
						const { rider: rest } = placeRider(place.ground, savedPlacement.contact, pose);
						center = {
							x:
								(Math.min(at.mount.x, rest.x) +
									Math.max(at.mount.x + pose.back.w, rest.x + composed.image.w)) /
								2,
							y:
								(Math.min(at.mount.y, rest.y) +
									Math.max(at.mount.y + pose.back.h, rest.y + composed.image.h)) /
								2
						};
					}
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
				center ??= { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 };
				const spanX = 2 * Math.max(center.x - box.l, box.r - center.x),
					spanY = 2 * Math.max(center.y - box.t, box.b - center.y);
				const scale = Math.max(
					1,
					Math.floor(Math.min((width * 0.85) / spanX, (tall * 0.85) / spanY))
				);
				const left = Math.round(width / 2 - center.x * scale),
					top = Math.round(tall / 2 - center.y * scale);
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
	aria-describedby={!selectable || editing ? 'mount-preview-facing' : undefined}
	disabled={!!editing}
	onclick={() => (playing = !playing)}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<span class="mount-play" aria-hidden="true" hidden={!!editing}>
		{#if playing}<Pause size={18} />{:else}<Play size={18} />{/if}
	</span>
</button>
{#if !selectable || editing}
	<p class="mount-caption" id="mount-preview-facing">{displayDirection(shown)}</p>
{/if}
{#if selectable}
	<div class="seat-controls">
		{#if editing}
			<div class="seat-nudges" dir="ltr" bind:this={nudgeControls}>
				{#each nudges as nudgeButton (nudgeButton.icon)}
					<button
						type="button"
						class="bu-btn"
						aria-label={nudgeButton.label}
						disabled={busy}
						onclick={() => nudge(nudgeButton.x, nudgeButton.y)}
					>
						<nudgeButton.icon size={18} aria-hidden="true" />
					</button>
				{/each}
			</div>
			<div class="seat-actions">
				<button
					type="button"
					class="bu-btn bu-quiet"
					aria-pressed={!editing.point}
					disabled={busy}
					onclick={() => {
						if (editing?.point) draft = { ...editing, point: null };
					}}>{t('settings.seatAuto')}</button
				>
				<button type="button" class="bu-btn" disabled={busy} onclick={endEdit}
					>{t('common.cancel')}</button
				>
				<button type="button" class="btn primary" disabled={!changed || busy} onclick={saveSeat}>
					{t(busy ? 'directionsSheet.saving' : 'common.save')}
				</button>
			</div>
			{#if failure}<p class="notice bad small" role="alert">{displayNestedMessage(failure)}</p>{/if}
		{:else}
			<select
				class="bu-select select"
				aria-label={t('settings.seatFacing')}
				value={shown}
				onfocus={() => (playing = false)}
				onchange={(event) => {
					playing = false;
					facing = event.currentTarget.value as DirectionName;
				}}
			>
				{#each facings as direction (direction)}
					<option value={direction}>{displayDirection(direction)}</option>
				{/each}
			</select>
			{#if target}
				<button type="button" class="bu-btn" bind:this={adjustButton} onclick={beginEdit}
					>{t('settings.adjustSeat')}</button
				>
			{/if}
		{/if}
	</div>
{/if}

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
	.mount-play[hidden] {
		display: none;
	}
	.mount-caption {
		margin: 4px 0 8px;
		text-align: center;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.seat-controls,
	.seat-actions,
	.seat-nudges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.seat-controls {
		align-items: center;
		justify-content: center;
		margin-block: 8px 12px;
	}
	.seat-nudges button {
		min-inline-size: 44px;
		min-block-size: 44px;
	}
</style>
