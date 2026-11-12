<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { ui, doc, view, toast, stepPreviewFrame } from '../state.svelte.ts';
	import { experience, characters, setMode } from './state.svelte.ts';
	import type { Ground, RenderOptions } from './ground.ts';
	import { MOTION, REFLECTION, WORLDS, worldArt } from './config.ts';
	import { EYE, heroRoom, layout, placeWorld } from './geometry.ts';
	import { LoaderCircle } from '../icons.ts';
	import type { DirectionName, Item } from '../../lib/store/manifest.ts';
	import { paintedFrame, reachFrame, actorScale } from './bounds.ts';
	import { planLineup } from './lineup.ts';
	// The floor ring: about a third of the body's width each way from the feet, flattened as the floor is there
	// (rows below the horizon over the world's focal length), and kept this far above the playback bar.
	const RING_GAP = 12;
	const ringRadius = (bodyWidth: number, scale: number) => Math.max(12, bodyWidth * scale * 0.35);
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
	import {
		keyboardVector,
		pointerVector,
		nearestDirection,
		integrateMovement,
		MOVEMENT_KEYS,
		type Vector
	} from './movement.ts';
	let {
		missing = $bindable(null)
	}: { missing: { clip: string; direction: DirectionName; items: Item[] } | null } = $props();
	let host: HTMLDivElement,
		canvas: HTMLCanvasElement,
		floor: HTMLCanvasElement,
		sky: HTMLCanvasElement;
	let note = $state(''),
		loadingNote = $state(''),
		rendererWarning = $state('');
	let stick = $state<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);
	const secondaryTouches = new Map<number, { button: HTMLButtonElement; x: number; y: number }>();
	let consumedTouch: { x: number; y: number; until: number } | null = null;
	const availability = $derived.by(() => {
		void doc.rev;
		return view.project ? buildPresentation(view.project, { loading: doc.loading }) : null;
	});
	// Scale and camera follow the bare base body only, so equipping a tall hat or a long weapon never resizes the character.
	const fitFrame = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return p ? paintedFrame(p, {}) : null;
	});
	// How far any of the character's gear can reach: Preview's lineup sizes and spaces its facings by it.
	const reach = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return p ? reachFrame(p) : null;
	});
	// Each facing's own reach packs the lineup tightly and bounds its click target.
	const facingReach = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return new Map(
			p ? (availability?.directions ?? []).map((d) => [d, reachFrame(p, d)] as const) : []
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
	let clock: ReturnType<typeof advancePlayback> | undefined;
	const noticed = new Set<string>();
	function release() {
		if (stick && host?.hasPointerCapture(stick.id)) host.releasePointerCapture(stick.id);
		stick = null;
		secondaryTouches.clear();
	}
	let reset = () => {
		keys.clear();
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
	const picked = (e: PointerEvent) =>
		experience.mode === 'preview'
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
		if (direction) ui.dir = direction;
		if (experience.mode === 'preview' || stick) return;
		host.setPointerCapture(e.pointerId);
		stick = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
	}
	// The companion under the pointer shows a faint ring: clicking it selects that facing.
	let hovered: DirectionName | undefined;
	function drag(e: PointerEvent) {
		hovered = picked(e);
		host.classList.toggle('pick', !!hovered);
		if (stick?.id === e.pointerId)
			stick = { ...stick, dx: e.clientX - stick.x, dy: e.clientY - stick.y };
	}
	function up(e: PointerEvent) {
		if (stick?.id === e.pointerId) {
			stick = null;
			if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
		}
	}
	function stop() {
		keys.clear();
		release();
	}
	// Non-primary touch taps do not consistently produce native clicks. Keep the
	// first world finger's capture while a deliberate second tap operates a button.
	function secondaryDown(e: PointerEvent) {
		const button =
			e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
		if (stick && e.pointerType === 'touch' && !e.isPrimary && button && !button.disabled)
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
		const g = canvas.getContext('2d')!,
			source = document.createElement('canvas'),
			sg = source.getContext('2d')!;
		const reflected = document.createElement('canvas'),
			rg = reflected.getContext('2d')!,
			skyContext = sky.getContext('2d')!;
		let skyStamp = '',
			disposed = false;
		// One cached canvas per companion facing; recomposed only when its frame, outfit or project changes.
		const companions = new Map<
			DirectionName,
			{ key: string; availability: unknown; canvas: HTMLCanvasElement | null }
		>();
		const companion = (
			a: NonNullable<typeof availability>,
			direction: DirectionName,
			playing: number
		): HTMLCanvasElement | null => {
			const p = resolvePreview(a, { clip: ui.anim, direction }),
				cell = p.kind === 'animation' ? playing : p.cell,
				key = JSON.stringify([p.kind, p.clip, cell, view.items, doc.rev]);
			const cached = companions.get(direction);
			if (cached?.key === key && cached.availability === a) return cached.canvas;
			const image = renderPresentation(a, view.items, p, cell).image;
			let canvas = cached?.canvas ?? null;
			if (image) {
				canvas ??= document.createElement('canvas');
				canvas.width = image.w;
				canvas.height = image.h;
				canvas
					.getContext('2d')!
					.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.w, image.h), 0, 0);
			}
			companions.set(direction, { key, availability: a, canvas: image ? canvas : null });
			return image ? canvas : null;
		};
		// The theme's accent for the lineup ring, read when the page's applied theme changes.
		let accent = '',
			accentTheme = '';
		let raf = 0,
			last = performance.now(),
			renderKey = '',
			lastProject: unknown,
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
			}
			if (accentTheme !== document.documentElement.dataset.theme) {
				accentTheme = document.documentElement.dataset.theme ?? '';
				accent = getComputedStyle(host).getPropertyValue('--bu-accent').trim();
			}
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, width, height);
			g.imageSmoothingEnabled = false;
			// The feet sit just above the playback bar in every view; only a Preview lineup lifts them to clear its ring.
			const place = layout(width, height, 'studio');
			const anchor = { x: place.feet.x, y: place.feet.y };
			const room = heroRoom(place);
			const live = experience.mode !== 'preview';
			// Preview fills a wide stage with a lineup of facings; the live views keep one moving actor.
			const row =
				!live && fitFrame
					? planLineup({
							available: lineupDirections,
							selected: ui.dir,
							body: fitFrame,
							reach: reach ?? fitFrame,
							facing: (d) => facingReach.get(d) ?? reach ?? fitFrame,
							room,
							width: place.stage.r - place.stage.l,
							dpr
						})
					: null;
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
			if (row && fitFrame && row.facings.length > 1) {
				const below =
					ringRadius(fitFrame.w, row.scale) *
					ringFlatness(EYE * heroNow, backdrop.scale, art.focal);
				lift = Math.max(0, Math.ceil(below + RING_GAP - (place.playbackTop - place.feet.y)));
				if (lift) {
					anchor.y -= lift;
					backdrop = placeWorld(place, art, anchor, heroNow);
				}
			}
			if (lift !== experience.lift) experience.lift = lift;
			let velocity = keyboardVector(keys, experience.mode === 'side');
			if (stick)
				velocity = pointerVector(
					stick.dx,
					stick.dy,
					MOTION.joystickRadius,
					MOTION.deadZone / MOTION.joystickRadius,
					experience.mode === 'side'
				);
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
				note = [
					p.issue,
					live && result?.hiddenItems.length
						? `${result.hiddenItems.length} equipped item${result.hiddenItems.length === 1 ? '' : 's'} hidden for this view`
						: ''
				]
					.filter(Boolean)
					.join(' · ');
				loadingNote = result?.loading ?? '';
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
					const facings = row?.facings ?? [ui.dir],
						at = (d: DirectionName) => point.x + (row?.offsets[facings.indexOf(d)] ?? 0);
					const x = snap(at(ui.dir) - frame.x * scale),
						y = snap(point.y - frame.y * scale);
					// A lineup marks its selected facing with a thin accent ring on the floor, anchored to the feet so it
					// never moves with the walk or collides with tall gear; the sprite is drawn over its back half. A circle
					// on the world floor looks as flat as the floor is foreshortened there: rows below the horizon over focal.
					const flat = ringFlatness(point.y - backdrop.eye, backdrop.scale, art.focal);
					if (facings.length > 1)
						for (const [d, alpha] of [
							[ui.dir, 0.85],
							[hovered, 0.3]
						] as const) {
							if (!d || !facings.includes(d) || (alpha < 0.5 && d === ui.dir)) continue;
							const rx = ringRadius(fit.w, scale);
							g.save();
							g.globalAlpha = alpha;
							g.strokeStyle = accent;
							g.lineWidth = 1.5;
							g.beginPath();
							g.ellipse(snap(at(d)), snap(point.y), rx, rx * flat, 0, 0, Math.PI * 2);
							g.stroke();
							g.restore();
						}
					for (const d of facings) {
						const box = facingReach.get(d) ?? reach ?? fit,
							left = at(d) - box.x * scale;
						picks.push({
							direction: d,
							l: left,
							r: left + box.w * scale,
							t: point.y - box.y * scale,
							b: point.y + (box.h - box.y) * scale
						});
						if (d === ui.dir) continue;
						const other = companion(a, d, view.cell);
						if (other)
							g.drawImage(
								other,
								snap(at(d) - frame.x * scale),
								y,
								other.width * scale,
								other.height * scale
							);
					}
					if (REFLECTION.enabled && REFLECTION[experience.mode]) {
						g.save();
						g.globalAlpha = REFLECTION.opacity;
						g.translate(0, snap(point.y));
						g.scale(1, -REFLECTION.compression);
						g.drawImage(reflected, x, -frame.y * scale, img.w * scale, img.h * scale);
						g.restore();
					}
					g.drawImage(source, x, y, img.w * scale, img.h * scale);
					host.dataset.position = `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
					host.dataset.camera = `${camera.x.toFixed(2)},${camera.y.toFixed(2)}`;
					host.dataset.presentation = p.kind;
					host.dataset.facing = p.direction ?? '';
					host.dataset.lineup = facings.join(' ');
				}
				previous = p;
			}
			raf = requestAnimationFrame(animate);
		};
		raf = requestAnimationFrame(animate);
		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
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
	onpointerleave={() => (hovered = undefined)}
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
{#if stick}<div
		class="world-stick"
		style:left="{stick.x}px"
		style:top="{stick.y}px"
		aria-hidden="true"
	>
		<span
			style:transform="translate({Math.max(-40, Math.min(40, stick.dx))}px,{Math.max(
				-40,
				Math.min(40, stick.dy)
			)}px)"
		></span>
	</div>{/if}
