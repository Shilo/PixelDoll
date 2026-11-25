<script lang="ts">
	// The Mount settings preview: the test mount always walks in place and turns through its facings. With Show mount on,
	// the open character (or the demo, when none is open) rides it exactly as on stage, following every mount setting.
	// Clicking pauses and plays. Its loop and image caches live only while Settings shows this page.
	import { tick, type Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import Armchair from '@lucide/svelte/icons/armchair';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import { bakedFrame } from '../lib/compose/compose.ts';
	import { openFixture } from '../lib/dress/project.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import type { Img } from '../lib/image/png.ts';
	import { DIRECTIONS, type DirectionName, type RiderSeatPoint } from '../lib/rig/rig.ts';
	import {
		reviewedSeatPoint,
		riderSeatArt,
		riderSeatOffset,
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
	import {
		mountedFrame,
		mountView,
		placeRider,
		sampleMountFrame,
		TEST_MOUNT
	} from './experience/mounts.ts';
	import {
		advancePlayback,
		buildPresentation,
		renderPresentation,
		resolveLive,
		RIDE_MOVE,
		RIDING_STATE,
		type PlaybackClock
	} from './experience/presentation.ts';
	import { activeRiderPose, legsKept } from './experience/riderPose.ts';
	import { currentLiveClips } from './experience/liveViews.ts';
	import { experience } from './experience/state.svelte.ts';
	import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Pencil, Play } from './icons.ts';
	import {
		DEMO,
		doc,
		openingProjectId,
		saveRiderSeat,
		store,
		toast,
		view
	} from './state.svelte.ts';

	let { controls, hasSeatPose }: { controls: Snippet; hasSeatPose: boolean } = $props();
	const TURN_MS = 1400;
	let canvas = $state<HTMLCanvasElement>();
	let marker = $state<HTMLSpanElement>();
	let facingControl = $state<HTMLSelectElement>();
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
	const frame = $derived(rider ? bakedFrame(rider.project.manifest) : null);
	// With Automatic selected, only actual riding art is eligible. Idle and Standing are display fallbacks.
	const presentedClip = $derived(presentation?.clip);
	const seatClip = $derived(
		pose ??
			(presentedClip === RIDE_MOVE || presentedClip === RIDING_STATE ? presentedClip : undefined)
	);
	const selected = $derived(authored?.rig.animations.find(({ id }) => id === seatClip));
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
	const seatHint = $derived(
		!doc.id || doc.id.startsWith('fixture:')
			? 'settings.seatNeedsCharacter'
			: !riding
				? 'settings.seatNeedsMount'
				: seatPose(selected)
					? 'settings.seatNeedsFrame'
					: hasSeatPose
						? 'settings.seatNeedsPose'
						: 'settings.seatNeedsNewPose'
	);

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
	const point = $derived(editing ? editing.point : target?.saved);
	const offset = $derived(point && authored ? riderSeatOffset(point, authored.rig.pivot) : null);
	let busy = $state(false);
	let failure = $state<string | Message>('');
	let adjustButton = $state<HTMLButtonElement>();
	let nudgeControls = $state<HTMLDivElement>();
	const nudges = [
		{ area: 'up', label: 'settings.seatUp', icon: ArrowUp, x: 0, y: -1 },
		{ area: 'left', label: 'settings.seatLeft', icon: ArrowLeft, x: -1, y: 0 },
		{ area: 'right', label: 'settings.seatRight', icon: ArrowRight, x: 1, y: 0 },
		{ area: 'down', label: 'settings.seatDown', icon: ArrowDown, x: 0, y: 1 }
	] as const;
	const nudgeOrigin = $derived.by(() => {
		if (!editing || !authored || !frame || !draftPlacement?.view) return null;
		const { pivot } = authored.rig;
		const contact = draftPlacement.contact;
		// Match placeRider's half-pixel tie before applying the first whole-pixel nudge.
		return {
			x: Math.ceil(contact.x - frame.x + pivot.x - 0.5),
			y: Math.ceil(contact.y - frame.y + pivot.y - 0.5)
		};
	});

	async function beginEdit() {
		if (!target) return;
		playing = false;
		failure = '';
		draft = { id: doc.id, target, point: target.saved ?? null };
		await tick();
		nudgeControls?.querySelector<HTMLButtonElement>('[data-nudge="left"]')?.focus();
	}
	async function endEdit() {
		draft = null;
		playing = false;
		await tick();
		adjustButton?.focus({ preventScroll: true });
	}
	function nudge(x: number, y: number) {
		if (!editing || !authored || !nudgeOrigin || busy) return;
		const { cell } = authored.rig;
		draft = {
			...editing,
			point: {
				x: Math.max(0, Math.min(cell.w, nudgeOrigin.x - x)),
				y: Math.max(0, Math.min(cell.h, nudgeOrigin.y - y))
			}
		};
	}
	function padKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && !busy) {
			event.preventDefault();
			event.stopPropagation();
			void endEdit();
			return;
		}
		const step = nudges.find(({ area }) => event.key.toLowerCase() === 'arrow' + area);
		if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		nudge(step.x, step.y);
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
			contactMarker = marker,
			bodyFrame = frame,
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
			turning = facings,
			selector = facingControl;
		if (!target) return;
		// Fit the full gait envelope, not a single bob frame. A stationary edit keeps its saved framing
		// unless the draft needs more room.
		const envelope = (contact: Point) =>
			place?.view && bodyFrame
				? mountedFrame(
						{ ...bodyFrame, ...place.riderGround },
						place.ground,
						place.view,
						contact,
						place.riderGround
					)
				: null;
		const bounds = place?.view ? envelope(place.contact) : null;
		const fixed = savedPlacement?.view ? envelope(savedPlacement.contact) : bounds;
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
			const autoTurn = !savedPlacement && document.activeElement !== selector;
			if (autoTurn) turned += dt;
			if (autoTurn && turned >= TURN_MS && turning.length > 1) {
				turned = 0;
				facing = turning[(turning.indexOf(direction) + 1) % turning.length];
				return;
			}
			const layers: { image: Img | HTMLCanvasElement; x: number; y: number }[] = [];
			let contact: Point | undefined;
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
					contact = { x: at.mount.x + pose.seat.x, y: at.mount.y + pose.seat.y };
				}
			}
			if (!layers.length) {
				const alone = mountView(TEST_MOUNT, direction, height);
				if (alone.ok) {
					const pose = alone.view.frames[sampleMountFrame(alone.view, elapsed)];
					layers.push({ image: pose.back, x: 0, y: 0 }, { image: pose.front, x: 0, y: 0 });
				}
			}
			const box =
				bounds && place?.view && contact
					? {
							l: place.ground.x - bounds.x,
							t: place.ground.y - bounds.y,
							r: place.ground.x - bounds.x + bounds.w,
							b: place.ground.y - bounds.y + bounds.h
						}
					: layers.reduce(
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
				const center =
					fixed && place?.view && contact
						? {
								x: place.ground.x - fixed.x + fixed.w / 2,
								y: place.ground.y - fixed.y + fixed.h / 2
							}
						: { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 };
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
				target.dataset.scale = String(scale);
				if (contactMarker && contact) {
					contactMarker.style.left = `${((left + contact.x * scale) / width) * 100}%`;
					contactMarker.style.top = `${((top + contact.y * scale) / tall) * 100}%`;
				}
			}
			if (contactMarker) contactMarker.hidden = !contact || !width || !tall;
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
	aria-describedby={editing ? 'mount-preview-facing' : undefined}
	onclick={() => (playing = !playing)}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	{#if editing}
		<span class="seat-marker" bind:this={marker} aria-hidden="true" hidden>
			<Crosshair size={16} strokeWidth={2} />
		</span>
	{/if}
	<span class="mount-play" aria-hidden="true">
		{#if playing}<Pause size={18} />{:else}<Play size={18} />{/if}
	</span>
</button>
<div class="mount-caption">
	{#if editing}
		<span>{t('settings.seatFacing')}</span>
		<span id="mount-preview-facing">{displayDirection(shown)}</span>
	{:else}
		<label for="mount-preview-facing">{t('settings.seatFacing')}</label>
		<div class="direction-select">
			{#each facings as direction (direction)}
				<span class="direction-measure" aria-hidden="true">{displayDirection(direction)}</span>
			{/each}
			<select
				id="mount-preview-facing"
				class="bu-select select"
				bind:this={facingControl}
				value={shown}
				onchange={(event) => {
					playing = false;
					turned = 0;
					facing = event.currentTarget.value as DirectionName;
				}}
			>
				{#each facings as direction (direction)}
					<option value={direction}>{displayDirection(direction)}</option>
				{/each}
			</select>
		</div>
	{/if}
</div>
<hr class="bu-separator preview-divider" />

{#if !editing}{@render controls()}{/if}

<div data-setting="rider-seat">
	<div class="seat-row">
		<Armchair size={18} aria-hidden="true" />
		<span>{t('settings.seatPosition')}</span>
		{#if target}
			<output
				class="seat-value"
				title={t('settings.seatOffsetHelp')}
				aria-live={editing ? 'polite' : 'off'}
				>{offset ? t('settings.seatOffset', offset) : t('creationSettings.automatic')}</output
			>
		{/if}
		{#if !editing}
			<button
				type="button"
				class="bu-action"
				data-variant="field"
				aria-describedby={target ? undefined : 'mount-seat-help'}
				disabled={!target}
				bind:this={adjustButton}
				onclick={beginEdit}
			>
				<Pencil size={16} aria-hidden="true" />{t('settings.adjustSeat')}
			</button>
		{/if}
	</div>
	{#if !target}
		<p class="seat-help" id="mount-seat-help">
			{seatHint === 'settings.seatNeedsNewPose'
				? t(seatHint, { states: t('experience.tabStates'), add: t('moves.addState') })
				: seatHint === 'settings.seatNeedsPose'
					? t(seatHint, { pose: t('toolbar.riderPose') })
					: t(seatHint)}
		</p>
	{/if}
</div>

{#if editing}
	<p class="seat-help">{t('settings.seatMarkerHelp')}</p>
	<div class="seat-nudges" dir="ltr" bind:this={nudgeControls}>
		{#each nudges as step, index (step.area)}
			{#if index === 2}
				<button
					type="button"
					class="bu-action"
					data-variant="field"
					style:grid-area="reset"
					aria-label={t('settings.seatAuto')}
					title={t('settings.seatAuto')}
					aria-pressed={!editing.point}
					disabled={busy}
					onkeydown={padKey}
					onclick={() => {
						if (editing?.point) draft = { ...editing, point: null };
					}}><LocateFixed size={18} aria-hidden="true" /></button
				>
			{/if}
			<button
				type="button"
				class="bu-action"
				data-variant="field"
				data-nudge={step.area}
				style:grid-area={step.area}
				aria-label={t(step.label)}
				title={t(step.label)}
				disabled={busy}
				onkeydown={padKey}
				onclick={() => nudge(step.x, step.y)}
			>
				<step.icon size={18} aria-hidden="true" />
			</button>
		{/each}
	</div>
	{#if failure}<p class="notice bad small" role="alert">{displayNestedMessage(failure)}</p>{/if}
	<div class="seat-actions">
		<button type="button" class="bu-action" data-variant="quiet" disabled={busy} onclick={endEdit}
			>{t('common.cancel')}</button
		>
		<button
			type="button"
			class="bu-action"
			data-variant="primary"
			disabled={!changed || busy}
			onclick={saveSeat}
		>
			{t(busy ? 'directionsSheet.saving' : 'common.save')}
		</button>
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
		min-inline-size: 0;
		min-block-size: 0;
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
	.seat-marker {
		position: absolute;
		translate: -50% -50%;
		pointer-events: none;
		line-height: 0;
		color: var(--bu-text);
		filter: drop-shadow(0 0 1px var(--bu-canvas)) drop-shadow(0 0 1px var(--bu-canvas));
	}
	.mount-caption,
	.seat-row,
	.seat-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.mount-caption {
		flex-wrap: wrap;
		justify-content: space-between;
		margin-block: 4px 8px;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.direction-select {
		display: grid;
		max-inline-size: 100%;
	}
	.direction-select > * {
		grid-area: 1 / 1;
	}
	.direction-select select {
		inline-size: 100%;
	}
	/* The customizable select sizes to the selected label. Reserve room for every translated label and the arrow. */
	.direction-measure {
		visibility: hidden;
		white-space: nowrap;
		padding-inline: 8px calc(26px + 1.25em + 2px);
	}
	.preview-divider {
		margin-block: 4px 8px;
	}
	.seat-row {
		flex-wrap: wrap;
		min-block-size: 44px;
	}
	.seat-row button {
		margin-inline-start: auto;
		min-inline-size: 44px;
		min-block-size: 44px;
		justify-content: center;
	}
	.seat-value + button {
		margin-inline-start: 0;
	}
	.seat-value {
		margin-inline-start: auto;
		font-variant-numeric: tabular-nums;
		color: var(--bu-muted);
	}
	.seat-help {
		margin-block: 0 8px;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.seat-nudges {
		display: grid;
		grid-template-areas: '. up .' 'left reset right' '. down .';
		grid-template-columns: repeat(3, 44px);
		grid-template-rows: repeat(3, 44px);
		gap: 6px;
		inline-size: max-content;
		margin-inline: auto;
	}
	.seat-nudges button {
		inline-size: 44px;
		block-size: 44px;
		min-inline-size: 0;
		justify-content: center;
	}
	.seat-actions {
		justify-content: flex-end;
		flex-wrap: wrap;
		margin-block: 8px 12px;
	}
	.seat-actions button {
		min-block-size: 44px;
		padding-inline: 12px;
	}
</style>
