<script lang="ts">
	// The Mount settings preview walks in place and turns while the seat editor is closed. With Show mount on,
	// the open character (or the demo, when none is open) rides it exactly as on stage, following every mount setting.
	// Clicking pauses and plays. Its loop and image caches live only while Settings shows this page.
	import { onDestroy, tick, type Snippet } from 'svelte';
	import { t } from 'svelte-whisper';
	import Armchair from '@lucide/svelte/icons/armchair';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import { bakedFrame } from '../lib/compose/compose.ts';
	import { openFixture } from '../lib/dress/project.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import type { Img } from '../lib/image/png.ts';
	import { DIRECTIONS, type DirectionName, type MountSeatOffsets } from '../lib/rig/rig.ts';
	import {
		AUTOMATIC_MOUNT_SEAT,
		mountSeatOffset,
		validMountSeatOffset
	} from '../lib/rig/riderSeat.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import type { Preset, Project } from '../lib/store/manifest.ts';
	import { displayDirection } from './displayDirection.ts';
	import { previewBounds } from './experience/bounds.ts';
	import { splitMountedRider } from './experience/mountLegs.ts';
	import { imageCanvas } from './experience/imageCanvas.ts';
	import { mountPlacement, offsetMountSeat } from './experience/mountPlacement.ts';
	import {
		mountedFrame,
		mountView,
		mountedLayers,
		placeRider,
		sampleMountFrame,
		TEST_MOUNT
	} from './experience/mounts.ts';
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
	import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Pencil, Play } from './icons.ts';
	import {
		DEMO,
		doc,
		openingProjectId,
		saveMountSeatOffsets,
		store,
		toast,
		view
	} from './state.svelte.ts';
	import SettingsItemButton from './SettingsItemButton.svelte';

	let {
		visibility,
		poseControls
	}: { visibility: Snippet; poseControls: Snippet<[string | null]> } = $props();
	const TURN_MS = 1400;
	const REPEAT_DELAY_MS = 350;
	const REPEAT_EVERY_MS = 75;
	let canvas = $state<HTMLCanvasElement>();
	let marker = $state<HTMLSpanElement>();
	let playing = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	let chosenFacing = $state<DirectionName>('south');

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
	const facings = $derived(availability?.directions.length ? availability.directions : DIRECTIONS);
	const facing = $derived(facings.includes(chosenFacing) ? chosenFacing : facings[0]);
	const grounding = $derived(rider ? previewBounds(rider.project) : null);
	const pose = $derived(rider ? activeRiderPose(rider.id, rider.project.manifest) : undefined);
	const riding = $derived(experience.testMount && !!rider);
	const authored = $derived(store.project?.manifest);
	const editable = $derived(!!authored && !!doc.id);
	const opening = $derived(!!openingProjectId());
	const standingHeight = $derived(grounding?.facings.get(facing)?.standingHeight ?? 48);
	const presentation = $derived(
		rider && availability && (riding || editable)
			? resolveLive(availability, {
					velocity: { x: 0, y: 0 },
					riding: true,
					riderPose: pose,
					items: rider.items,
					defaultDirection: facing,
					clips: currentLiveClips(rider.id, rider.project.manifest.rig.animations)
				})
			: null
	);
	const placement = $derived(
		rider && presentation ? mountPlacement(rider.project, facing, presentation, grounding) : null
	);
	const frame = $derived(rider ? bakedFrame(rider.project.manifest) : null);
	type Draft = {
		id: string;
		before: MountSeatOffsets;
		offsets: MountSeatOffsets;
		playing: boolean;
	};
	let draft = $state.raw<Draft | null>(null);
	const editing = $derived(editable && draft?.id === doc.id ? draft : null);
	const previewPlaying = $derived(editing?.playing ?? playing);
	$effect.pre(() => {
		if (draft && !editing) draft = null;
	});
	const savedOffset = $derived.by(() => {
		void doc.rev;
		return mountSeatOffset(authored?.rig, facing);
	});
	const offset = $derived(editing?.offsets[facing] ?? editing?.before[facing] ?? savedOffset);
	const automatic = $derived(offset.x === 0 && offset.y === 0);
	const draftPlacement = $derived(
		editing && rider && presentation
			? mountPlacement(rider.project, facing, presentation, grounding, offset)
			: placement
	);
	const changes = $derived(
		editing
			? DIRECTIONS.flatMap((facing) => {
					const before = editing.before[facing],
						after = editing.offsets[facing];
					return before && after && (before.x !== after.x || before.y !== after.y)
						? [{ facing, before, after }]
						: [];
				})
			: []
	);
	const controlsId = $props.id();
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

	async function beginEdit() {
		if (!editable || editing || opening) return;
		chosenFacing = facing;
		turned = 0;
		failure = '';
		draft = {
			id: doc.id,
			before: Object.fromEntries(
				DIRECTIONS.map((dir) => [dir, mountSeatOffset(authored?.rig, dir)])
			),
			offsets: {},
			playing: false
		};
		await tick();
		nudgeControls?.querySelector<HTMLButtonElement>('[data-nudge="left"]')?.focus();
	}
	async function endEdit() {
		stopRepeat();
		heldPointer = null;
		draft = null;
		turned = 0;
		await tick();
		adjustButton?.focus({ preventScroll: true });
	}
	function nudge(x: number, y: number) {
		setOffset({ x: offset.x + x, y: offset.y + y });
	}
	function setOffset(point: typeof offset) {
		if (!editing || !editing.before[facing] || busy || !validMountSeatOffset(point)) return;
		draft = { ...editing, offsets: { ...editing.offsets, [facing]: point } };
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
	let repeatDelay = 0,
		repeatEvery = 0,
		heldPointer: number | null = null;
	function stopRepeat() {
		clearTimeout(repeatDelay);
		clearInterval(repeatEvery);
		repeatDelay = repeatEvery = 0;
	}
	// Press and hold (mouse, pen or touch) keeps nudging after a short delay; the click that ends the press is ignored.
	function holdNudge(event: PointerEvent, x: number, y: number) {
		if (event.button !== 0 || busy) return;
		event.preventDefault();
		const button = event.currentTarget as HTMLElement;
		button.focus();
		try {
			button.setPointerCapture(event.pointerId);
		} catch {
			// A synthetic pointer may not be capturable; the press still nudges once.
		}
		heldPointer = event.pointerId;
		nudge(x, y);
		stopRepeat();
		repeatDelay = window.setTimeout(() => {
			repeatDelay = 0;
			repeatEvery = window.setInterval(() => nudge(x, y), REPEAT_EVERY_MS);
		}, REPEAT_DELAY_MS);
	}
	function releaseNudge(event: PointerEvent) {
		if (heldPointer !== event.pointerId) return;
		stopRepeat();
		const id = event.pointerId;
		// Click follows pointerup, so clear only after it had the chance to be ignored.
		window.setTimeout(() => {
			if (heldPointer === id) heldPointer = null;
		}, 0);
	}
	function clickNudge(x: number, y: number) {
		if (heldPointer === null) nudge(x, y);
	}
	onDestroy(stopRepeat);
	async function saveSeat() {
		if (!editing || !changes.length || busy || opening) return;
		busy = true;
		failure = '';
		try {
			await saveMountSeatOffsets(editing.id, changes);
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
			direction = facing,
			mounted = riding,
			p = presentation,
			place = draftPlacement,
			savedPlacement = editing ? placement : null,
			legs = experience.mountLegs,
			height = standingHeight,
			running = previewPlaying,
			turning = facings,
			autoTurn = !editing && turning.length > 1,
			seatOffset = offset;
		if (!target) return;
		// Fit the full gait envelope, not a single bob frame. A stationary edit keeps its saved framing
		// unless the draft needs more room.
		const envelope = (placement: typeof place) =>
			placement?.view && bodyFrame
				? mountedFrame(
						{ ...bodyFrame, ...placement.riderGround },
						placement.ground,
						placement.view,
						placement.contact,
						placement.riderGround
					)
				: null;
		const bounds = envelope(place);
		const fixed = envelope(savedPlacement) ?? bounds;
		const alone = place?.view ? null : mountView(TEST_MOUNT, direction, height);
		const view = place?.view ?? (alone?.ok ? offsetMountSeat(alone.view, seatOffset) : null);
		const g = target.getContext('2d')!;
		if (current?.id !== clockRider) {
			clock = undefined;
			clockRider = current?.id ?? '';
		}
		// The rider is composed only when its clip, facing or frame changes, not on every animation frame.
		let composed: { key: string; rider: ReturnType<typeof splitMountedRider> } | null = null,
			last = performance.now(),
			frameId = 0;
		const draw = (now: number) => {
			const dt = running ? now - last : 0;
			last = now;
			elapsed += dt;
			if (autoTurn) turned += dt;
			if (autoTurn && turned >= TURN_MS) {
				turned = 0;
				chosenFacing = turning[(turning.indexOf(direction) + 1) % turning.length];
				return;
			}
			if (mounted && a && current && p) {
				clock = advancePlayback(p, clock, dt);
				const key = JSON.stringify([p.clip, p.direction, clock.cell]);
				if (composed?.key !== key && place?.view && p.clip && p.direction) {
					const result = renderPresentation(a, current.items, p, clock.cell);
					const mode = legsKept(current.project.manifest, p.clip) ? 'none' : legs;
					composed = result.image
						? {
								key,
								rider: splitMountedRider(
									current.project,
									result.image,
									result.frame,
									p.clip,
									p.direction,
									result.composition,
									mode
								)
							}
						: null;
				}
			}
			const gait = view?.frames[sampleMountFrame(view, elapsed)];
			const origin = { x: 0, y: 0 };
			const at = gait && place?.view ? placeRider(place.ground, place.contact, gait) : null;
			const shownRider = mounted && at ? composed?.rider : undefined;
			const layers = gait
				? mountedLayers(
						gait,
						at ?? { mount: origin, rider: origin },
						shownRider?.image ?? null,
						shownRider?.behind
					)
				: [];
			const contact = gait
				? { x: (at?.mount.x ?? 0) + gait.seat.x, y: (at?.mount.y ?? 0) + gait.seat.y }
				: undefined;
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
								const { w, h } = l.image;
								return {
									l: Math.min(b.l, l.x),
									t: Math.min(b.t, l.y),
									r: Math.max(b.r, l.x + w),
									b: Math.max(b.b, l.y + h)
								};
							},
							contactMarker && contact
								? { l: contact.x, t: contact.y, r: contact.x, b: contact.y }
								: { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }
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
					const image = imageCanvas(l.image, canvases);
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
			target.dataset.rider = shownRider ? (current?.id ?? '') : '';
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
	class:editing={!!editing}
	type="button"
	aria-label={t(previewPlaying ? 'settings.mountPreviewPause' : 'settings.mountPreviewPlay')}
	onclick={() => {
		if (editing) draft = { ...editing, playing: !editing.playing };
		else playing = !playing;
	}}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	{#if editing}
		<span class="seat-marker" bind:this={marker} aria-hidden="true" hidden>
			<Crosshair size={16} strokeWidth={2} />
		</span>
	{/if}
	<span class="mount-play" aria-hidden="true">
		{#if previewPlaying}<Pause size={18} />{:else}<Play size={18} />{/if}
	</span>
</button>

{@render visibility()}

<div class="seat-setting" class:editing={!!editing} data-setting="rider-seat">
	<SettingsItemButton
		aria-label={t('settings.seatPosition')}
		title={t('settings.adjustSeat')}
		aria-expanded={!!editing}
		aria-controls={editing ? controlsId : undefined}
		aria-describedby={editable ? `${controlsId}-value` : `${controlsId}-help`}
		disabled={!editable || busy || (opening && !editing)}
		bind:element={adjustButton}
		onclick={() => void (editing ? endEdit() : beginEdit())}
	>
		<Armchair size={18} aria-hidden="true" />
		<span class="seat-label">{t('settings.seatPosition')}</span>
		{#if editable}
			<span class="seat-detail" id={`${controlsId}-value`}>
				{#if !editing}<span>{displayDirection(facing)} · </span>{/if}
				<output class="seat-value" aria-live={editing ? 'polite' : 'off'}>
					{t('settings.seatOffset', offset)}
				</output>
			</span>
		{/if}
		<Pencil size={16} aria-hidden="true" />
	</SettingsItemButton>
	{#if !editable}
		<p class="seat-help" id={`${controlsId}-help`}>
			{t('settings.seatNeedsCharacter')}
		</p>
	{/if}
</div>

{#if editing}
	<div class="seat-editor" id={controlsId}>
		<div class="seat-controls">
			<div class="direction-select">
				{#each facings as direction (direction)}
					<span class="direction-measure" aria-hidden="true">{displayDirection(direction)}</span>
				{/each}
				<select
					class="bu-select select"
					aria-label={t('settings.seatFacing')}
					value={facing}
					disabled={busy}
					onchange={(event) => {
						stopRepeat();
						chosenFacing = event.currentTarget.value as DirectionName;
					}}
				>
					{#each facings as direction (direction)}
						<option value={direction}>{displayDirection(direction)}</option>
					{/each}
				</select>
			</div>
			<div class="seat-nudges" dir="ltr" bind:this={nudgeControls}>
				{#each nudges as step, index (step.area)}
					{#if index === 2}
						<button
							type="button"
							class="bu-action"
							data-variant="outline"
							style:grid-area="reset"
							aria-label={t('settings.seatAuto')}
							title={t('settings.seatAuto')}
							aria-pressed={automatic}
							disabled={busy}
							onkeydown={padKey}
							onclick={() => setOffset(AUTOMATIC_MOUNT_SEAT)}
							><LocateFixed size={18} aria-hidden="true" /></button
						>
					{/if}
					<button
						type="button"
						class="bu-action"
						data-variant="outline"
						data-nudge={step.area}
						style:grid-area={step.area}
						aria-label={t(step.label)}
						title={t(step.label)}
						disabled={busy}
						onpointerdown={(event) => holdNudge(event, step.x, step.y)}
						onpointerup={releaseNudge}
						onpointercancel={releaseNudge}
						onlostpointercapture={stopRepeat}
						oncontextmenu={(event) => event.preventDefault()}
						onkeydown={padKey}
						onclick={() => clickNudge(step.x, step.y)}
					>
						<step.icon size={18} aria-hidden="true" />
					</button>
				{/each}
			</div>
		</div>
		{#if failure}<p class="bu-notice" data-size="compact" data-tone="danger" role="alert">
				{displayNestedMessage(failure)}
			</p>{/if}
		<div class="seat-footer">
			<p class="seat-help">
				<span>{t('settings.seatMarkerHelp')}</span><br />
				<span>{t('settings.seatDirectionHelp', { direction: displayDirection(facing) })}</span>
			</p>
			<div class="seat-actions">
				<button
					type="button"
					class="bu-action"
					data-variant="quiet"
					disabled={busy}
					onclick={endEdit}>{t('common.cancel')}</button
				>
				<button
					type="button"
					class="bu-action"
					data-variant="primary"
					disabled={!changes.length || busy || opening}
					onclick={saveSeat}
				>
					{t(busy ? 'directionsSheet.saving' : 'common.save')}
				</button>
			</div>
		</div>
	</div>
{/if}

{@render poseControls(presentation?.clip ?? null)}

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
	@media (max-height: 700px) {
		:global(.sheet-body):has(.mount-preview.editing) {
			--compact-stage: clamp(88px, 22dvh, 140px);
			scroll-padding-block-start: calc(var(--compact-stage) + 68px);
		}
		.mount-preview.editing,
		.seat-setting.editing {
			position: sticky;
			z-index: 1;
		}
		.mount-preview.editing {
			inset-block-start: 0;
			block-size: var(--compact-stage);
		}
		.seat-setting.editing {
			inset-block-start: var(--compact-stage);
			background: var(--bu-surface);
		}
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
	.seat-label {
		min-inline-size: 0;
	}
	.seat-detail {
		margin-inline-start: auto;
		text-align: end;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.seat-controls {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.direction-select {
		display: grid;
		min-inline-size: 0;
		max-inline-size: 46%;
		align-items: center;
	}
	.direction-select > * {
		grid-area: 1 / 1;
	}
	.direction-select select {
		inline-size: 100%;
		min-inline-size: 0;
	}
	/* The customizable select sizes to the selected label. Reserve room for every translated label and the arrow. */
	.direction-measure {
		visibility: hidden;
		white-space: nowrap;
		padding-inline: 8px calc(26px + 1.25em + 2px);
	}
	.seat-value {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.seat-setting .seat-help {
		margin-block: 6px 0;
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
	}
	.seat-nudges button {
		inline-size: 44px;
		block-size: 44px;
		min-inline-size: 0;
		justify-content: center;
		touch-action: manipulation;
		user-select: none;
		-webkit-touch-callout: none;
	}
	.seat-footer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		margin-block: 8px 12px;
	}
	.seat-footer .seat-help {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.seat-actions {
		display: flex;
		gap: 4px;
	}
	.seat-actions button {
		min-block-size: 44px;
		padding-inline: 12px;
	}
</style>
