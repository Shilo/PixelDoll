<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ui, doc, view, toast, stepPreviewFrame } from '../state.svelte.ts';
	import { experience, characters, setMode, sharedZoom } from './state.svelte.ts';
	import type { Ground, RenderOptions } from './ground.ts';
	import { MOTION, REFLECTION, WORLDS, worldArt } from './config.ts';
	import { EYE, heroRoom, layout, placeWorld, ringRadius, ringRise } from './geometry.ts';
	import { LoaderCircle } from '../icons.ts';
	import type { DirectionName, Item } from '../../lib/store/manifest.ts';
	import { bakedFrame } from '../../lib/compose/compose.ts';
	import { paintedFrame, reachFrame, actorScale, previewBounds, framePosition } from './bounds.ts';
	import { inspectionLineup, planLineup } from './lineup.ts';
	import { cameraFramePosition, sceneArtFits, sceneCamera, zoomBox, zoomCeiling } from './zoom.ts';
	import { sceneZoom } from './sceneZoom.ts';
	import { frameRecorder } from './paint.ts';
	// The floor ring: about a third of the body's width each way from the feet, flattened as the floor is there
	// (rows below the horizon over the world's focal length), and kept this far above the playback bar.
	const RING_GAP = 12;
	const RING_STROKE = 1.5;
	const ringFlatness = (belowHorizon: number, worldScale: number, focal: number) =>
		Math.min(1, Math.max(0, belowHorizon) / (worldScale * focal));
	import {
		buildPresentation,
		resolvePreview,
		resolveLive,
		renderPresentation,
		advancePlayback,
		livePlaybackDelta,
		type Presentation
	} from './presentation.ts';
	import { IDLE, Joystick, joystickTravel, type JoystickSize } from '../../lib/input/joystick.ts';
	import JoystickView from '../../lib/input/Joystick.svelte';
	import {
		keyboardVector,
		nearestDirection,
		integrateMovement,
		MOVEMENT_KEYS,
		type Vector
	} from './movement.ts';
	let {
		missing = $bindable(null),
		playbackHeight = 0
	}: {
		missing: { clip: string; direction: DirectionName; items: Item[] } | null;
		playbackHeight?: number;
	} = $props();
	let host: HTMLDivElement,
		canvas: HTMLCanvasElement,
		floor: HTMLCanvasElement,
		sky: HTMLCanvasElement;
	let note = $state(''),
		loadingNote = $state(''),
		rendererWarning = $state('');
	let pad: Joystick | null = null,
		padSize = $state.raw<JoystickSize>(MOTION.joystick.regular),
		stick = $state.raw(IDLE);
	const secondaryTouches = new Map<number, { button: HTMLButtonElement; x: number; y: number }>();
	let consumedTouch: { x: number; y: number; until: number } | null = null;
	const availability = $derived.by(() => {
		void doc.rev;
		return view.project ? buildPresentation(view.project, { loading: doc.loading }) : null;
	});
	const grounding = $derived.by(() => {
		void doc.rev;
		return view.project && experience.mode === 'preview' ? previewBounds(view.project) : null;
	});
	const drawingFrame = $derived.by(() => {
		void doc.rev;
		return view.project ? bakedFrame(view.project.manifest) : null;
	});
	// Scale and camera follow the bare base body only, so equipping a tall hat or a long weapon never resizes the character.
	const fitFrame = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return grounding?.body ?? (p ? paintedFrame(p, {}) : null);
	});
	// How far any of the character's gear can reach: Preview's lineup sizes and spaces its facings by it.
	const reach = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return grounding?.reach ?? (p ? reachFrame(p) : null);
	});
	// Each facing's own reach bounds its click target.
	const facingReach = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return new Map(
			p
				? (availability?.directions ?? []).map(
						(d) => [d, grounding?.facings.get(d)?.reach ?? reachFrame(p, d)] as const
					)
				: []
		);
	});
	const shownReach = $derived.by(() => {
		void doc.rev;
		const project = view.project;
		return new Map(
			(availability?.directions ?? []).map((direction) => {
				const frame = project ? paintedFrame(project, view.items, direction) : null;
				const origin = grounding?.facings.get(direction);
				return [
					direction,
					frame ? { ...frame, x: frame.x + (origin?.x ?? 0), y: frame.y + (origin?.y ?? 0) } : null
				] as const;
			})
		);
	});
	// Facings that can stand beside the selected one: they play the same move the same way (all animated, or all
	// still), so the lineup never shows a stand-in. A selected facing that itself falls back stands alone.
	const lineupDirections = $derived.by(() => {
		const a = availability;
		if (!a) return [];
		const selected = resolvePreview(a, { clip: ui.anim, direction: ui.dir });
		if (selected.direction !== ui.dir || selected.kind === 'unavailable') return [];
		return a.directions.filter((direction) => {
			const p = resolvePreview(a, { clip: ui.anim, direction });
			return p.direction === direction && p.kind === selected.kind && p.clip === selected.clip;
		});
	});
	const keys = new Set<string>();
	let position: Vector = { x: 0, y: 0 },
		camera: Vector = { x: 0, y: 0 },
		previous: Presentation | undefined;
	let hasMoved = false;
	// Preview's latest fit, so input reads the shared zoom as it is now rather than as the last frame drew it.
	let previewFit = 0;
	let clock: ReturnType<typeof advancePlayback> | undefined;
	const noticed = new Set<string>();
	function release() {
		const id = stick.pointerId;
		if (id !== null && host?.hasPointerCapture(id)) host.releasePointerCapture(id);
		pad = null;
		stick = IDLE;
		secondaryTouches.clear();
	}
	let reset = () => {
		keys.clear();
		clearHover();
		release();
		position = { x: 0, y: 0 };
		camera = { x: 0, y: 0 };
		previous = undefined;
		clock = undefined;
		noticed.clear();
		note = '';
		missing = null;
		hasMoved = false;
	};
	$effect(() => {
		void doc.id;
		void experience.mode;
		untrack(reset);
	});
	// Live views briefly name their movement controls, as in the approved prototype; moving or 6.5s dismisses it.
	let hint = $state(false);
	$effect(() => {
		void doc.id;
		const live = experience.mode !== 'preview';
		hint = live;
		if (!live) return;
		const t = setTimeout(() => (hint = false), 6500);
		return () => clearTimeout(t);
	});
	$effect(() => {
		void doc.rev;
		noticed.clear();
	});
	// The top-down and side-scroller renderer stays out of the startup bundle until a live view first opens.
	let scene: typeof import('./ground.ts') | undefined,
		sceneLoad: Promise<void> | undefined,
		sceneError = '';
	$effect(() => {
		if (experience.mode !== 'preview')
			sceneLoad ??= import('./ground.ts').then(
				(m) => {
					scene = m;
					sceneError = '';
				},
				(error) => {
					console.error(error);
					sceneLoad = undefined;
					sceneError = 'Test world unavailable — reload to try again.';
				}
			);
	});
	$effect(() => {
		if (ui.sheet) {
			keys.clear();
			release();
		}
	});
	function previewFacing() {
		if (
			experience.mode !== 'preview' ||
			!availability ||
			ui.sheet ||
			document.activeElement !== host
		)
			return;
		const direction = nearestDirection(availability.directions, keyboardVector(keys), ui.dir);
		if (direction) ui.dir = direction;
	}
	function keyup(e: KeyboardEvent) {
		keys.delete(e.key.toLowerCase());
		previewFacing();
	}
	function key(e: KeyboardEvent) {
		if (e.target !== host || ui.sheet || e.ctrlKey || e.metaKey || e.altKey || e.isComposing)
			return;
		const k = e.key.toLowerCase();
		if (k === 'escape' && document.fullscreenElement) return;
		if (MOVEMENT_KEYS.has(k)) {
			e.preventDefault();
			if (e.repeat && !keys.has(k)) return;
			keys.add(k);
			previewFacing();
		} else if (!e.repeat && ['1', '2', '3'].includes(k)) {
			e.preventDefault();
			setMode((['preview', 'topdown', 'side'] as const)[Number(k) - 1]);
		} else if (!e.repeat && (k === 'escape' || k === 'backspace')) {
			e.preventDefault();
			const popover = document.querySelector<HTMLElement>('[popover]:popover-open');
			if (popover) popover.hidePopover();
			else characters();
		} else if (!e.repeat && k === ' ' && experience.mode === 'preview') {
			e.preventDefault();
			ui.playing = !ui.playing;
		} else if ((k === ',' || k === '.') && experience.mode === 'preview') {
			e.preventDefault();
			stepPreviewFrame(k === '.' ? 1 : -1);
		}
	}
	// Where each Preview facing stands, so a click on a companion selects it.
	let picks: { direction: DirectionName; l: number; r: number; t: number; b: number }[] = [];
	let pendingTap: {
		pointerId: number;
		x: number;
		y: number;
		direction: DirectionName | undefined;
	} | null = null;
	const picked = (e: { clientX: number; clientY: number }) =>
		experience.mode === 'preview' && !ui.sheet
			? picks.find(
					(p) =>
						p.direction !== ui.dir &&
						e.clientX >= p.l &&
						e.clientX <= p.r &&
						e.clientY >= p.t &&
						e.clientY <= p.b
				)?.direction
			: undefined;
	function down(e: PointerEvent) {
		if (e.button !== 0 || ui.sheet) return;
		host.focus({ preventScroll: true });
		const direction = picked(e);
		if (experience.mode === 'preview' && e.pointerType === 'touch') {
			pendingTap = e.isPrimary
				? { pointerId: e.pointerId, x: e.clientX, y: e.clientY, direction }
				: null;
			return;
		}
		if (direction) ui.dir = direction;
		if (experience.mode === 'preview' || pad) return;
		host.setPointerCapture(e.pointerId);
		const { regular, compact, compactQuery, deadZone } = MOTION.joystick;
		padSize = matchMedia(compactQuery).matches ? compact : regular;
		pad = new Joystick({
			axis: experience.mode === 'side' ? 'x' : 'xy',
			travel: joystickTravel(padSize),
			deadZone,
			follow: true
		});
		stick = pad.begin(e.pointerId, { x: e.clientX, y: e.clientY });
	}
	// The companion under the pointer shows a faint ring: clicking it selects that facing.
	let hovered: DirectionName | undefined;
	let pointer: { clientX: number; clientY: number } | undefined;
	function updateHover() {
		hovered = pointer ? picked(pointer) : undefined;
		host.classList.toggle('pick', !!hovered);
	}
	function clearHover() {
		pointer = undefined;
		hovered = undefined;
		host?.classList.remove('pick');
	}
	function drag(e: PointerEvent) {
		if (
			pendingTap?.pointerId === e.pointerId &&
			Math.hypot(e.clientX - pendingTap.x, e.clientY - pendingTap.y) > 8
		)
			pendingTap = null;
		pointer = { clientX: e.clientX, clientY: e.clientY };
		updateHover();
		if (pad) stick = pad.move(e.pointerId, { x: e.clientX, y: e.clientY });
	}
	function up(e: PointerEvent) {
		if (pendingTap?.pointerId === e.pointerId) {
			const tap = pendingTap;
			pendingTap = null;
			if (
				e.type === 'pointerup' &&
				Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 8 &&
				tap.direction &&
				picked(e) === tap.direction
			)
				ui.dir = tap.direction;
		}
		if (stick.pointerId !== e.pointerId) return;
		release();
	}
	function stop() {
		pendingTap = null;
		keys.clear();
		release();
		clearHover();
	}
	// Non-primary touch taps do not consistently produce native clicks. Keep the
	// first world finger's capture while a deliberate second tap operates a button.
	function secondaryDown(e: PointerEvent) {
		const button =
			e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
		if (pad && e.pointerType === 'touch' && !e.isPrimary && button && !button.disabled)
			secondaryTouches.set(e.pointerId, { button, x: e.clientX, y: e.clientY });
	}
	function secondaryUp(e: PointerEvent) {
		const touch = secondaryTouches.get(e.pointerId);
		secondaryTouches.delete(e.pointerId);
		if (!touch || e.type === 'pointercancel') return;
		const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('button');
		if (
			under !== touch.button ||
			touch.button.disabled ||
			Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 8
		)
			return;
		e.preventDefault();
		touch.button.click();
		consumedTouch = { x: e.clientX, y: e.clientY, until: performance.now() + 500 };
	}
	function compatibilityClick(e: MouseEvent) {
		if (
			e.isTrusted &&
			consumedTouch &&
			performance.now() < consumedTouch.until &&
			Math.hypot(e.clientX - consumedTouch.x, e.clientY - consumedTouch.y) < 8
		) {
			consumedTouch = null;
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}
	onMount(() => {
		document.addEventListener('pointerdown', secondaryDown, true);
		document.addEventListener('pointerup', secondaryUp, true);
		document.addEventListener('pointercancel', secondaryUp, true);
		document.addEventListener('click', compatibilityClick, true);
		let ground: Ground | undefined;
		// The actors are drawn into a recording and painted only when the frame changes (paint.ts).
		const paint = frameRecorder(canvas.getContext('2d')!),
			g = paint.context,
			source = document.createElement('canvas'),
			sg = source.getContext('2d')!;
		const reflected = document.createElement('canvas'),
			rg = reflected.getContext('2d')!,
			skyContext = sky.getContext('2d')!;
		let skyStamp = '',
			disposed = false;
		const restored = () => paint.invalidate();
		canvas.addEventListener('contextrestored', restored);
		// One cached canvas per companion facing; recomposed only when its frame, outfit or project changes.
		const companions = new Map<
			DirectionName,
			{
				key: string;
				availability: unknown;
				canvas: HTMLCanvasElement | null;
				result: ReturnType<typeof renderPresentation>;
			}
		>();
		const companion = (
			a: NonNullable<typeof availability>,
			direction: DirectionName,
			playing: number
		) => {
			const p = resolvePreview(a, { clip: ui.anim, direction }),
				cell = p.kind === 'animation' ? playing : p.cell,
				key = JSON.stringify([p.kind, p.clip, cell, view.items, doc.rev]);
			const cached = companions.get(direction);
			if (cached?.key === key && cached.availability === a) return cached;
			const result = renderPresentation(a, view.items, p, cell),
				image = result.image;
			let canvas = cached?.canvas ?? null;
			if (image) {
				canvas ??= document.createElement('canvas');
				canvas.width = image.w;
				canvas.height = image.h;
				canvas
					.getContext('2d')!
					.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.w, image.h), 0, 0);
				paint.redrawn();
			}
			const entry = { key, availability: a, canvas: image ? canvas : null, result };
			companions.set(direction, entry);
			return entry;
		};
		// The theme's accent for the lineup ring, read when the page's applied theme changes.
		let accent = '',
			accentTheme = '';
		let raf = 0,
			last = performance.now(),
			renderKey = '',
			lastProject: unknown,
			cameraStamp = '',
			imageCache: ReturnType<typeof renderPresentation> | null = null;
		const animate = (now: number) => {
			const dt = Math.min(50, now - last);
			last = now;
			picks = [];
			const a = availability,
				dpr = devicePixelRatio || 1;
			const width = innerWidth,
				height = innerHeight;
			if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
				canvas.width = Math.round(width * dpr);
				canvas.height = Math.round(height * dpr);
				renderKey = '';
				paint.invalidate();
			}
			if (accentTheme !== document.documentElement.dataset.theme) {
				accentTheme = document.documentElement.dataset.theme ?? '';
				accent = getComputedStyle(host).getPropertyValue('--bu-accent').trim();
			}
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, width, height);
			g.imageSmoothingEnabled = false;
			// The feet sit just above the playback bar in every view; only a Preview lineup lifts them to clear its ring.
			const place = layout(width, height, 'studio', playbackHeight);
			const anchor = { x: place.feet.x, y: place.feet.y };
			const room = heroRoom(place);
			const live = experience.mode !== 'preview';
			const inspecting = !live && experience.sceneZoom !== null;
			// Preview fills a wide stage with a lineup of facings; the live views keep one moving actor.
			const fittedRow =
				!live && fitFrame
					? planLineup({
							available: lineupDirections,
							selected: ui.dir,
							body: fitFrame,
							reach: reach ?? fitFrame,
							room,
							width: place.stage.r - place.stage.l,
							dpr
						})
					: null;
			const row =
				inspecting && fittedRow && fitFrame
					? inspectionLineup({
							available: lineupDirections,
							selected: ui.dir,
							body: fitFrame,
							reach: reach ?? fitFrame,
							scale: fittedRow.scale
						})
					: fittedRow;
			const fit = row?.scale ?? (fitFrame ? actorScale(fitFrame, room, dpr) : 0);
			const shared = sharedZoom('studio', fit);
			const magnification = live || !fit ? 1 : shared.scale / fit;
			// The world image, sky and side floor share one horizon: the eye line of the characters as drawn
			// (geometry.ts placeWorld), so a lineup's smaller scale pulls the whole world back with it.
			const heroNow = fitFrame
				? Math.round(fitFrame.y * (row?.scale ?? actorScale(fitFrame, room, dpr)))
				: experience.heroHeight;
			const art = worldArt(ui.theme);
			let backdrop = placeWorld(place, art, anchor, heroNow),
				lift = 0;
			// A lineup's floor ring reaches below the feet; raise the characters (and the world with them) so the ring
			// keeps a comfortable gap above the playback bar.
			if (fittedRow && fitFrame && fittedRow.facings.length > 1) {
				const below =
					ringRadius(fitFrame.w, fittedRow.scale) *
					ringFlatness(EYE * heroNow, backdrop.scale, art.focal);
				lift = Math.max(
					0,
					Math.ceil(
						below + RING_STROKE / 2 + 1 / dpr + RING_GAP - (place.playbackTop - place.feet.y)
					)
				);
				if (lift) {
					anchor.y -= lift;
					backdrop = placeWorld(place, art, anchor, heroNow);
				}
			}
			if (lift !== experience.lift) experience.lift = lift;
			const clearance = {
				l: place.stage.l + 8,
				r: place.stage.r - 8,
				t: place.stage.t + (place.compactPlayback ? 66 : 16),
				b: place.playbackTop - 2
			};
			// Use the selected facing, not a lineup's center: even-count lineups place it away from the middle.
			const focus = {
				x: anchor.x + (row?.offsets[row.facings.indexOf(ui.dir)] ?? 0),
				y: anchor.y
			};
			// The selected facing's fit in CSS px per art px; the shared zoom is absolute (zoom.ts).
			if (!live && fit > 0) {
				previewFit = fit;
				if (experience.zoomFits.studio !== fit) experience.zoomFits.studio = fit;
				const ceiling = zoomCeiling(experience.zoomCeiling, fit);
				if (ceiling !== experience.zoomCeiling) experience.zoomCeiling = ceiling;
			}
			const reference = grounding?.facings.get(ui.dir);
			const framePivot = {
				x: (drawingFrame?.x ?? 0) + (reference?.x ?? 0),
				y: (drawingFrame?.y ?? 0) + (reference?.y ?? 0)
			};
			const drawn = framePosition(framePivot, focus, fit, dpr);
			const groundedFocus = inspecting
				? focus
				: {
						x: drawn.x + framePivot.x * fit,
						y: drawn.y + framePivot.y * fit
					};
			const zoom = sceneCamera({
				value: magnification,
				anchor: groundedFocus,
				framing: clearance,
				centerX: inspecting ? (clearance.l + clearance.r) / 2 : undefined,
				backdrop,
				plate: art,
				viewport: { l: 0, t: 0, r: width, b: backdrop.coverBottom },
				center: {
					x: groundedFocus.x,
					y:
						groundedFocus.y -
						((grounding?.facings.get(ui.dir)?.standingHeight ?? fitFrame?.h ?? 0) * fit) / 2
				}
			});
			const drawPosition = (
				frame: { x: number; y: number },
				point: { x: number; y: number },
				scale: number
			) =>
				inspecting
					? cameraFramePosition(frame, point, scale, zoom, dpr)
					: framePosition(frame, point, scale, dpr);
			const horizontal = { ...clearance, t: -Infinity, b: Infinity };
			const visibleFacings = (row?.facings ?? [ui.dir]).filter((direction) => {
				if (direction === ui.dir || !inspecting) return true;
				const box = shownReach.get(direction) ?? facingReach.get(direction) ?? reach ?? fitFrame;
				if (!box) return false;
				const reference = grounding?.facings.get(direction);
				const pivot = {
					x: (drawingFrame?.x ?? 0) + (reference?.x ?? 0),
					y: (drawingFrame?.y ?? 0) + (reference?.y ?? 0)
				};
				const point = {
					x: anchor.x + (row?.offsets[row.facings.indexOf(direction)] ?? 0),
					y: anchor.y
				};
				const drawn = drawPosition(pivot, point, fit);
				const ground = { x: drawn.x + pivot.x * fit, y: drawn.y + pivot.y * fit };
				const bounds = {
					l: ground.x - box.x * fit,
					r: ground.x + (box.w - box.x) * fit,
					t: 0,
					b: 0
				};
				const ring = drawPosition({ x: 0, y: 0 }, point, 1);
				const radius =
					ringRadius(fitFrame?.w ?? box.w, fit, magnification) +
					(RING_STROKE / 2 + 1 / dpr) / magnification;
				return (
					sceneArtFits(bounds, zoom, horizontal) &&
					sceneArtFits({ l: ring.x - radius, r: ring.x + radius, t: 0, b: 0 }, zoom, horizontal)
				);
			});
			if (!live) {
				const stamp = JSON.stringify(zoom);
				if (stamp !== cameraStamp) {
					cameraStamp = stamp;
					experience.sceneCamera = zoom;
				}
				if (zoom.value !== 1 || zoom.offset.x !== 0 || zoom.offset.y !== 0) {
					g.translate(zoom.anchor.x + zoom.offset.x, zoom.anchor.y + zoom.offset.y);
					g.scale(zoom.value, zoom.value);
					g.translate(-zoom.anchor.x, -zoom.anchor.y);
				}
			}
			host.dataset.sceneZoom = String(live ? fit : shared.scale);
			host.dataset.sceneFit = String(shared.fit);
			host.dataset.sceneCamera = String(zoom.value);
			host.dataset.sceneAnchor = `${zoom.anchor.x},${zoom.anchor.y}`;
			host.dataset.sceneOffset = `${zoom.offset.x},${zoom.offset.y}`;
			host.dataset.sceneMin = String(shared.min);
			host.dataset.sceneMax = String(shared.max);
			let velocity = stick.origin
				? { x: stick.value.x, y: -stick.value.y }
				: keyboardVector(keys, experience.mode === 'side');
			if (ui.sheet || document.hidden) velocity = { x: 0, y: 0 };
			if (live)
				({ position, camera } = integrateMovement(
					position,
					camera,
					velocity,
					dt / 1000,
					MOTION.speed,
					MOTION.cameraResponse
				));
			const options: RenderOptions = {
				width,
				height,
				dpr,
				theme: ui.theme,
				mode: experience.mode,
				anchor,
				camera,
				eye: backdrop.eye
			};
			const world = WORLDS[ui.theme],
				skyUrl = world.backgrounds[experience.mode],
				s = live ? scene : undefined;
			const horizon = s?.projection(options).horizon;
			const nextSky = [
				skyUrl,
				width,
				height,
				dpr,
				horizon ?? 'preview',
				backdrop.scale,
				backdrop.x,
				backdrop.y
			].join('|');
			if (nextSky !== skyStamp) {
				skyStamp = nextSky;
				// Resizing the backing store clears it, so returning to Preview never leaves a stale sky.
				sky.width = Math.round(width * dpr);
				sky.height = Math.round(height * dpr);
				if (s && horizon !== undefined)
					void s
						.loadBackground(skyUrl)
						.then((image) => {
							if (disposed || skyStamp !== nextSky) return;
							// The backdrop's own placement: uniform scale, image horizon on the eye line and the floor's horizon.
							const sky = backdrop;
							skyContext.setTransform(dpr, 0, 0, dpr, 0, 0);
							skyContext.clearRect(0, 0, width, height);
							skyContext.save();
							skyContext.beginPath();
							skyContext.rect(0, 0, width, Math.max(horizon + 24, 1));
							skyContext.clip();
							skyContext.drawImage(
								image,
								sky.x,
								sky.y,
								sky.scale * image.width,
								sky.scale * image.height
							);
							skyContext.restore();
						})
						.catch((error) => console.error('world sky', error));
			}
			if (scene) {
				ground ??= new scene.Ground(floor);
				ground.render(options);
			}
			// Floor warnings only concern the live views; Preview never draws the floor.
			rendererWarning = live ? (ground?.warning ?? sceneError) : '';
			if (a) {
				const p = live
					? resolveLive(a, {
							velocity,
							previous,
							defaultDirection:
								experience.mode === 'side'
									? (nearestDirection(a.directions, { x: 1, y: 0 }, ui.dir) ?? undefined)
									: ui.dir
						})
					: resolvePreview(a, { clip: ui.anim, direction: ui.dir });
				experience.presentation = p.kind;
				if (live) clock = advancePlayback(p, clock, livePlaybackDelta(p, velocity, dt));
				const cell = live ? clock?.cell : p.kind === 'animation' ? view.cell : p.cell;
				const nextKey = JSON.stringify([p.kind, p.clip, p.direction, cell, view.items, doc.rev]);
				if (lastProject !== a || nextKey !== renderKey) {
					imageCache = renderPresentation(a, view.items, p, cell);
					renderKey = nextKey;
					lastProject = a;
					if (imageCache.image) {
						source.width = imageCache.image.w;
						source.height = imageCache.image.h;
						sg.putImageData(
							new ImageData(
								new Uint8ClampedArray(imageCache.image.data),
								source.width,
								source.height
							),
							0,
							0
						);
						reflected.width = source.width;
						reflected.height = source.height;
						rg.drawImage(source, 0, 0);
						rg.globalCompositeOperation = 'destination-in';
						const fade = rg.createLinearGradient(0, 0, 0, imageCache.frame.y);
						fade.addColorStop(0, 'transparent');
						fade.addColorStop(0.3, 'transparent');
						fade.addColorStop(1, 'black');
						rg.fillStyle = fade;
						rg.fillRect(0, 0, source.width, source.height);
						rg.globalCompositeOperation = 'source-over';
						paint.redrawn();
					}
				}
				const result = imageCache,
					img = result?.image;
				// A view switch resets the indicator even if the new view reuses the same painted frame.
				if (!live) {
					const items = result?.hiddenItems;
					if (!a.loading && p.clip && p.direction && items?.length) {
						if (
							missing?.clip !== p.clip ||
							missing.direction !== p.direction ||
							(items !== missing.items &&
								(items.length !== missing.items.length ||
									items.some((item, i) => item !== missing?.items[i])))
						)
							missing = { clip: p.clip, direction: p.direction, items };
					} else if (missing) missing = null;
				}
				const notes = [
					p.issue,
					live && result?.hiddenItems.length
						? `${result.hiddenItems.length} equipped item${result.hiddenItems.length === 1 ? '' : 's'} hidden for this view`
						: ''
				].filter(Boolean);
				const loadings = new Set(result?.loading ? [result.loading] : []);
				if ((velocity.x || velocity.y) && !hasMoved) {
					hasMoved = true;
					hint = false;
				}
				if (live && hasMoved && !ui.sheet) {
					const issues = [
						[p.issueKey, p.issue],
						[result?.issueKey, result?.issue]
					].filter(([id, text]) => id && text && !noticed.has(id));
					// An unresolved error can defer this batch; only consume warnings the toast accepts.
					if (
						issues.length &&
						toast([...new Set(issues.map(([, text]) => text))].join(' '), { tone: 'warning' })
					)
						for (const [id] of issues) noticed.add(id!);
				}
				if (img && result) {
					const frame = result.frame,
						point = s ? s.project(position, options) : anchor;
					const fit = fitFrame ?? frame,
						scale = row?.scale ?? actorScale(fit, room, dpr),
						hero = Math.round(fit.y * scale);
					if (hero !== experience.heroHeight) experience.heroHeight = hero;
					const snap = (n: number) => Math.round(n * dpr) / dpr;
					// The selected facing keeps its reflection; the others stand beside it, sharing its move, frame and floor.
					const facings = visibleFacings,
						at = (d: DirectionName) => point.x + (row?.offsets[row.facings.indexOf(d)] ?? 0);
					const origin = (d: DirectionName) => grounding?.facings.get(d),
						selectedOrigin = origin(p.direction ?? ui.dir);
					const { x, y } = drawPosition(
						{ x: frame.x + (selectedOrigin?.x ?? 0), y: frame.y + (selectedOrigin?.y ?? 0) },
						{ x: at(ui.dir), y: point.y },
						scale
					);
					picks = live
						? []
						: facings.map((direction) => {
								const box = facingReach.get(direction) ?? reach ?? fit;
								const pivot = {
									x: frame.x + (origin(direction)?.x ?? 0),
									y: frame.y + (origin(direction)?.y ?? 0)
								};
								const drawn = drawPosition(pivot, { x: at(direction), y: point.y }, scale);
								const left = drawn.x + (pivot.x - box.x) * scale;
								const top = drawn.y + (pivot.y - box.y) * scale;
								return {
									direction,
									...zoomBox(
										{
											l: left,
											r: left + box.w * scale,
											t: top,
											b: top + box.h * scale
										},
										zoom.anchor,
										zoom.value,
										zoom.offset
									)
								};
							});
					updateHover();
					// A lineup marks its selected facing with a thin accent ring on the floor, anchored to the feet so it
					// never moves with the walk or collides with tall gear; the sprite is drawn over its back half. A circle
					// on the world floor looks as flat as the floor is foreshortened there: rows below the horizon over focal.
					const flat = ringFlatness(point.y - backdrop.eye, backdrop.scale, art.focal);
					if (row && facings.length > 1)
						for (const [d, alpha] of [
							[ui.dir, 0.85],
							[hovered, 0.3]
						] as const) {
							if (!d || !facings.includes(d) || (alpha < 0.5 && d === ui.dir)) continue;
							const ringZoom = inspecting ? magnification : 1;
							const rx = ringRadius(fit.w, scale, ringZoom),
								ry = rx * flat,
								rise =
									ringRise(origin(d)?.standingHeight ?? 0, scale * ringZoom, ry * ringZoom, dpr) /
									ringZoom;
							g.save();
							g.globalAlpha = alpha;
							g.strokeStyle = accent;
							g.lineWidth = RING_STROKE / (inspecting ? magnification : 1);
							g.beginPath();
							const center = inspecting
								? drawPosition({ x: 0, y: 0 }, { x: at(d), y: point.y - rise }, 1)
								: { x: snap(at(d)), y: snap(point.y) - rise };
							g.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
							g.stroke();
							g.restore();
						}
					for (const d of facings) {
						if (d === ui.dir) continue;
						const entry = companion(a, d, view.cell),
							other = entry.canvas;
						if (entry.result.issue) notes.push(entry.result.issue);
						if (entry.result.loading) loadings.add(entry.result.loading);
						if (other) {
							const position = drawPosition(
								{ x: frame.x + (origin(d)?.x ?? 0), y: frame.y + (origin(d)?.y ?? 0) },
								{ x: at(d), y: point.y },
								scale
							);
							g.drawImage(other, position.x, position.y, other.width * scale, other.height * scale);
						}
					}
					if (REFLECTION.enabled && REFLECTION[experience.mode]) {
						g.save();
						g.globalAlpha = REFLECTION.opacity;
						g.translate(
							0,
							inspecting ? y + (frame.y + (selectedOrigin?.y ?? 0)) * scale : snap(point.y)
						);
						g.scale(1, -REFLECTION.compression);
						g.drawImage(
							reflected,
							x,
							-(frame.y + (selectedOrigin?.y ?? 0)) * scale,
							img.w * scale,
							img.h * scale
						);
						g.restore();
					}
					g.drawImage(source, x, y, img.w * scale, img.h * scale);
					host.dataset.position = `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
					host.dataset.camera = `${camera.x.toFixed(2)},${camera.y.toFixed(2)}`;
					host.dataset.presentation = p.kind;
					host.dataset.facing = p.direction ?? '';
					host.dataset.lineup = facings.join(' ');
				}
				note = notes.join(' · ');
				loadingNote = [...loadings].join(' · ');
				previous = p;
			}
			if (!picks.length) updateHover();
			paint.commit();
			raf = requestAnimationFrame(animate);
		};
		raf = requestAnimationFrame(animate);
		return () => {
			disposed = true;
			experience.sceneCamera = null;
			cancelAnimationFrame(raf);
			canvas.removeEventListener('contextrestored', restored);
			ground?.destroy();
			document.removeEventListener('pointerdown', secondaryDown, true);
			document.removeEventListener('pointerup', secondaryUp, true);
			document.removeEventListener('pointercancel', secondaryUp, true);
			document.removeEventListener('click', compatibilityClick, true);
		};
	});
</script>

<svelte:window onkeyup={keyup} onblur={stop} onresize={stop} />
<svelte:document onvisibilitychange={stop} />
<!-- A focused game surface owns directional input; controls remain native outside it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="world-stage bu-focus"
	{@attach (node) =>
		sceneZoom(node, {
			get zoom() {
				return sharedZoom('studio', previewFit);
			},
			get stored() {
				return experience.sceneZoom;
			},
			get enabled() {
				return experience.mode === 'preview' && !ui.sheet;
			},
			onchange: (scale) => {
				experience.sceneZoom = scale;
			},
			modifiedWheel: 'zoom'
		})}
	id="world-stage"
	bind:this={host}
	role="application"
	tabindex="0"
	aria-label={experience.mode === 'preview'
		? 'Character preview. WASD or arrows change facing. Keys 1, 2, 3 switch views.'
		: experience.mode === 'side'
			? 'Side-scroller test world. A/D, left/right arrows or horizontal drag to move. Keys 1, 2, 3 switch views.'
			: 'Character test world. WASD, arrows or drag to move. Keys 1, 2, 3 switch views.'}
	onkeydown={key}
	onfocusout={() => keys.clear()}
	onpointerdown={down}
	onpointermove={drag}
	onpointerup={up}
	onpointercancel={up}
	onpointerleave={clearHover}
	onlostpointercapture={up}
	class:live={experience.mode !== 'preview'}
>
	<div class="world-input" aria-hidden="true"></div>
	<canvas class="world-sky" bind:this={sky} aria-hidden="true"></canvas>
	<canvas class="world-ground" bind:this={floor} aria-hidden="true"></canvas>
	<canvas class="world-actors" bind:this={canvas} aria-hidden="true"></canvas>
	{#if doc.loading}<span class="world-loading">Loading character…</span>{/if}
</div>
<!-- One bottom-anchored stack: the movement hint always sits above the fallback note, whatever the note wraps to. -->
{#if hint || note || loadingNote || rendererWarning}<div class="world-notes">
		{#if hint}<p class="world-hint">
				{matchMedia('(pointer:coarse)').matches
					? 'Drag in the world to move'
					: experience.mode === 'side'
						? 'Focus world · A/D or ←/→ to move'
						: 'Focus world · WASD or arrow keys to move'}
			</p>{/if}{#if loadingNote}<p class="world-coverage world-loading-items" role="status">
				<LoaderCircle size={14} class="spin" aria-hidden="true" />{loadingNote}
			</p>{/if}{#if note || rendererWarning}<p class="world-coverage">
				{[rendererWarning, note].filter(Boolean).join(' · ')}
			</p>{/if}
	</div>{/if}
<JoystickView
	class="world-stick"
	snapshot={stick}
	size={padSize}
	axis={experience.mode === 'side' ? 'x' : 'xy'}
/>
