<script lang="ts">
	import { t, type WhisperKey } from 'svelte-whisper';
	import { onMount, untrack } from 'svelte';
	import { ui, doc, view, toast, stepPreviewFrame } from '../state.svelte.ts';
	import { experience, characters, setMode, sharedZoom } from './state.svelte.ts';
	import type { Ground, RenderOptions } from './ground.ts';
	import { MOTION, WORLDS, worldArt } from './config.ts';
	import {
		REFLECTION,
		drawReflection,
		reflectionCanvas,
		reflectionStyle,
		floorFlatness
	} from './reflection.ts';
	import {
		EYE,
		heroRoom,
		layout,
		liveFeetY,
		liveFrame,
		liveRoom,
		placeWorld,
		ringRadius
	} from './geometry.ts';
	import { floorRing, RING_GAP, RING_STROKE } from './floorRing.ts';
	import { LoaderCircle } from '../icons.ts';
	import { displayDirection, displayDirectionInSentence } from '../displayDirection.ts';
	import type { DirectionName, Item } from '../../lib/store/manifest.ts';
	import { bakedFrame, unionFrame, type Frame } from '../../lib/compose/compose.ts';
	import { paintedFrame, reachFrame, actorScale, previewBounds, framePosition } from './bounds.ts';
	import { inspectionLineup, planLineup } from './lineup.ts';
	import {
		cameraFramePosition,
		sceneArtFits,
		sceneCamera,
		zoomBox,
		zoomCeiling,
		zoomPoint
	} from './zoom.ts';
	import { sceneZoom } from './sceneZoom.ts';
	import { frameRecorder } from './paint.ts';
	import {
		MOUNT_HEIGHT_REASON,
		mountedFrame,
		placeRider,
		sampleMountFrame,
		type MountViewResult
	} from './mounts.ts';
	import type { Img } from '../../lib/image/png.ts';
	import { hideMountedLegs, mountLegGeometry } from './mountLegs.ts';
	import { activeRiderPose, legsKept } from './riderPose.ts';
	import { currentLiveClips } from './liveViews.ts';
	import { showMount } from '../mountPreview.ts';
	import { resolveAttack, type AttackFailure } from './attack.ts';
	import { LiveActions } from './liveActions.ts';
	import { airborne, JUMP, jumpReflection } from './jump.ts';
	import GameControls from './GameControls.svelte';
	import { displayMove } from '../displayMove.ts';
	import { mountPlacement } from './mountPlacement.ts';
	import { imageCanvas } from './imageCanvas.ts';
	// The floor ring: about a third of the body's width each way from the feet, flattened as the floor is there
	// (rows below the horizon over the world's focal length), and kept this far above the playback bar.
	const ringFlatness = (belowHorizon: number, worldScale: number, focal: number) =>
		floorFlatness(belowHorizon, worldScale * focal);
	import {
		buildPresentation,
		resolvePreview,
		resolveLive,
		renderPresentation,
		advancePlayback,
		livePlaybackDelta,
		type Presentation
	} from './presentation.ts';
	import { displayLoadingItems, displayPresentationNotice } from './displayPresentation.ts';
	import {
		IDLE,
		Joystick,
		joystickTravel,
		type JoystickSize,
		type JoystickSnapshot
	} from '../../lib/input/joystick.ts';
	import JoystickView from '../../lib/input/Joystick.svelte';
	import {
		directionInfo,
		keyboardVector,
		nearestDirection,
		integrateMovement,
		travelSpeed,
		travelDelta,
		unit,
		MOVEMENT_KEYS,
		type Vector
	} from './movement.ts';
	let {
		missing = $bindable(null),
		note = $bindable(''),
		playbackHeight = 0
	}: {
		missing: { clip: string; direction: DirectionName; items: Item[] } | null;
		note?: string;
		playbackHeight?: number;
	} = $props();
	let host: HTMLDivElement,
		canvas: HTMLCanvasElement,
		floor: HTMLCanvasElement,
		sky: HTMLCanvasElement;
	let loadingNote = $state(''),
		rendererWarning = $state<WhisperKey | null>(null);
	let pad: Joystick | null = null,
		padSize = $state.raw<JoystickSize>(MOTION.joystick.regular),
		stick = $state.raw(IDLE);
	// The touch Attack stick's aim while held (GameControls.svelte), in ground coordinates.
	let stickAim: Vector = { x: 0, y: 0 };
	// Sprint: the Sprint toggle, or either Shift key held (by physical key, so releasing one keeps the other's sprint).
	let sprintOn = $state(false);
	// The live stage's height, for sizing the touch controls to it.
	let stageHeight = $state(Infinity);
	const shifts = new Set<string>();
	// Attack and jump timing, stepped by the scene (liveActions.ts).
	const actions = new LiveActions();
	// The last input that pressed the stage: touch shows thumb buttons, a mouse the icon bar.
	let touchInput = $state(matchMedia('(pointer: coarse)').matches);
	// Mouse travel: a left press sets a floor destination; while right is held the cursor only aims.
	let destination: Vector | null = null,
		mouse = { left: false, right: false },
		cursor: { x: number; y: number } | null = null,
		// Whether a mouse press began on the live stage; captured moves after it was let go steer nothing.
		mouseOwned = false,
		// A right press on the stage claims the one menu it opens: on press (macOS, Linux) or on release (Windows).
		menuClaim: 'none' | 'held' | 'released' = 'none',
		menuUsed = false;
	// Where the actor is on screen, for aiming at the cursor and clicking on it to stop.
	let actorAt: { x: number; y: number; r: number } | null = null;
	let travel: Vector = { x: 0, y: 0 };
	let sceneOptions: RenderOptions | null = null;
	const secondaryTouches = new Map<number, { button: HTMLButtonElement; x: number; y: number }>();
	let consumedTouch: { x: number; y: number; until: number } | null = null;
	const availability = $derived.by(() => {
		void doc.rev;
		return view.project ? buildPresentation(view.project, { loading: doc.loading }) : null;
	});
	const bodyBounds = $derived.by(() => {
		void doc.rev;
		return view.project ? previewBounds(view.project) : null;
	});
	const grounding = $derived(bodyBounds);
	const drawingFrame = $derived.by(() => {
		void doc.rev;
		return view.project ? bakedFrame(view.project.manifest) : null;
	});
	const bodyFrame = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		return grounding?.body ?? (p ? paintedFrame(p, {}) : null);
	});
	const mountVisible = $derived(experience.testMount);
	// The saved Idle, Walk, Attack and Jump of the open character (Live views settings).
	const roles = $derived(currentLiveClips(doc.id, view.project?.manifest.rig.animations ?? []));
	const riderPose = $derived(
		mountVisible ? activeRiderPose(doc.id, view.project?.manifest) : undefined
	);
	// A State is drawn seated: cutting legs by standing or estimated joints would cut the wrong pixels.
	const legMode = (clip: string | null) =>
		legsKept(view.project?.manifest, clip) ? 'none' : experience.mountLegs;
	const previewMount = $derived.by(() => {
		if (experience.mode !== 'preview' || !availability) return null;
		return mountedPresentation(resolvePreview(availability, { clip: ui.anim, direction: ui.dir }));
	});
	const mountBounds = $derived.by(() => {
		if (!previewMount?.view || !bodyFrame || !availability) return null;
		return unionFrame(
			(lineupDirections.length ? lineupDirections : [ui.dir]).flatMap((direction) => {
				const mounted = mountedPresentation(
					resolvePreview(availability, { clip: ui.anim, direction })
				);
				return mounted?.view
					? [mountedFrame(bodyFrame, mounted.ground, mounted.view, mounted.contact)]
					: [];
			})
		);
	});
	const fitFrame = $derived(mountBounds ?? bodyFrame);
	let mountIssue = $state('');
	function displayMountIssue(failure: Extract<MountViewResult, { ok: false }>, direction: string) {
		if (failure.missingView) {
			const facing = directionInfo(direction);
			return t('worldStage.notice.mountViewMissing', {
				direction: facing ? displayDirection(facing.id) : direction
			});
		}
		return failure.reason === MOUNT_HEIGHT_REASON
			? t('worldStage.notice.mountHeight')
			: failure.reason;
	}
	function mountedPresentation(p: Presentation) {
		const project = view.project;
		if (!mountVisible || !project) return null;
		return mountPlacement(project, p, grounding);
	}
	// How far any of the character's gear can reach: Preview's lineup sizes and spaces its facings by it.
	const reach = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		if (mountedReach.size) return unionFrame([...mountedReach.values()]);
		return grounding?.reach ?? (p ? reachFrame(p) : null);
	});
	// How far the live actor can reach in any facing it may turn to: every wardrobe item standing, and riding when the
	// mount shows (its rider raised by the mount), so neither facing, outfit nor mounting reframes the scene mid-play.
	const liveEnvelope = $derived.by(() => {
		void doc.rev;
		const p = view.project;
		if (experience.mode === 'preview' || !p) return null;
		const frames = [grounding?.reach ?? reachFrame(p)];
		// Each mounted pose sits the rider on its own contact: the shown clip and the Attack and Jump it may play.
		const clips = [...new Set([ui.anim, ...roles.attack, ...roles.jump])];
		if (mountVisible && availability)
			for (const direction of availability.directions)
				for (const clip of clips) {
					const mounted = mountedPresentation(resolvePreview(availability, { clip, direction }));
					const frame = facingReach.get(direction);
					if (mounted?.view && frame)
						frames.push(mountedFrame(frame, mounted.ground, mounted.view, mounted.contact));
				}
		return unionFrame(frames);
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
	const mountedReach = $derived.by(() => {
		const bounds = new Map<DirectionName, Frame>();
		if (!mountVisible || !availability) return bounds;
		for (const direction of lineupDirections.length ? lineupDirections : [ui.dir]) {
			const mounted = mountedPresentation(
				resolvePreview(availability, { clip: ui.anim, direction })
			);
			const frame = facingReach.get(direction);
			if (mounted?.view && frame)
				bounds.set(direction, mountedFrame(frame, mounted.ground, mounted.view, mounted.contact));
		}
		return bounds;
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
		endMove();
	}
	function endMove() {
		const id = stick.pointerId;
		if (id !== null && host?.hasPointerCapture(id)) host.releasePointerCapture(id);
		pad = null;
		stick = IDLE;
		secondaryTouches.clear();
	}
	/** Lost focus, a sheet or a cancel: held attacks and mouse travel stop; a playing attack or jump finishes. */
	function letGo() {
		actions.letGo();
		mouse = { left: false, right: false };
		mouseOwned = false;
		menuClaim = 'none';
		destination = null;
		host?.classList.remove('aiming');
	}
	let reset = () => {
		interruptions++;
		keys.clear();
		shifts.clear();
		clearHover();
		release();
		letGo();
		actions.reset();
		actorAt = null;
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
	/** Why an attack could not play, once per gap until the character changes. */
	function attackWarning(failure: AttackFailure) {
		const key =
			failure.kind === 'no-attack' ? 'attack:none' : `attack:${failure.move}:${failure.direction}`;
		if (noticed.has(key)) return;
		const moves = view.project?.manifest.rig.animations ?? [];
		const text =
			failure.kind === 'no-attack'
				? t('liveViews.noAttack')
				: t('liveViews.noAttackDirection', {
						move: displayMove(failure.move, moves),
						direction: failure.direction ? displayDirectionInSentence(failure.direction) : ''
					});
		if (toast(text, { tone: 'warning' })) noticed.add(key);
	}
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
		sceneError: WhisperKey | null = null;
	$effect(() => {
		if (experience.mode !== 'preview')
			sceneLoad ??= import('./ground.ts').then(
				(m) => {
					scene = m;
					sceneError = null;
				},
				(error) => {
					console.error(error);
					sceneLoad = undefined;
					sceneError = 'worldStage.sceneUnavailable';
				}
			);
	});
	$effect(() => {
		if (ui.sheet) {
			keys.clear();
			release();
			letGo();
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
		const k = e.key.toLowerCase();
		keys.delete(k);
		if (k === 'x') actions.release('key');
		if (k === ' ') actions.releaseJump('key');
		if (k === 'shift') shifts.delete(e.code);
		previewFacing();
	}
	/** X attacks where the character travels, or along its facing while it stands. */
	const keyAim = () => travel;
	const playing = () => experience.mode !== 'preview' && !ui.sheet;
	/** Jumps now and on every landing while the source (Space, the Jump button) is held. */
	function jump(source: string) {
		if (playing()) actions.holdJump(source);
	}
	/** An attack along the travel or facing, repeating while the source (the Attack button) is held. */
	function attack(source: string) {
		if (playing()) actions.hold(source, keyAim);
	}
	/** The touch Attack stick: attacks at once along the facing, then wherever the stick points while it is held. */
	function attackStick(snapshot: JoystickSnapshot) {
		if (snapshot.pointerId === null) {
			actions.release('stick');
			return;
		}
		touchInput = true;
		stickAim = { x: snapshot.value.x, y: -snapshot.value.y };
		if (playing() && !actions.holds('stick')) actions.hold('stick', () => stickAim);
	}
	/** M and the Mount action, in every view; the live views mount only on the floor. */
	function toggleMount() {
		if (ui.sheet || (experience.mode !== 'preview' && !actions.grounded)) return;
		showMount(!experience.testMount);
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
		} else if (k === 'shift') {
			if (experience.mode !== 'preview') shifts.add(e.code);
		} else if (k === ' ' && experience.mode !== 'preview') {
			e.preventDefault();
			if (!e.repeat) jump('key');
		} else if (k === 'm') {
			e.preventDefault();
			if (!e.repeat) toggleMount();
		} else if (k === 'x' && experience.mode !== 'preview') {
			e.preventDefault();
			if (!e.repeat) actions.hold('key', keyAim);
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
		const live = experience.mode !== 'preview';
		if (ui.sheet || (e.button !== 0 && !(live && e.pointerType === 'mouse' && e.button === 2)))
			return;
		host.focus({ preventScroll: true });
		touchInput = e.pointerType !== 'mouse';
		const direction = picked(e);
		if (experience.mode === 'preview' && e.pointerType === 'touch') {
			pendingTap = e.isPrimary
				? { pointerId: e.pointerId, x: e.clientX, y: e.clientY, direction }
				: null;
			return;
		}
		if (direction) ui.dir = direction;
		if (!live) return;
		if (e.pointerType === 'mouse') {
			host.setPointerCapture(e.pointerId);
			mouseOwned = true;
			mouseButtons(e);
			return;
		}
		// The first finger anywhere on the stage moves, with a stick that appears under it and follows it until it lifts.
		if (pad) return;
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
	/** The floor point under the cursor; a press on the character itself stops mouse travel. */
	function setDestination(e: { clientX: number; clientY: number }) {
		const near = actorAt && Math.hypot(e.clientX - actorAt.x, e.clientY - actorAt.y) <= actorAt.r;
		const point =
			!near && scene && sceneOptions
				? scene.unproject({ x: e.clientX, y: e.clientY }, sceneOptions, position.y)
				: null;
		// A point the character already stands on is no destination, so a held press at its feet never jitters there.
		destination =
			point &&
			Math.hypot(point.x - position.x, experience.mode === 'side' ? 0 : point.y - position.y) >
				MOTION.arrival
				? point
				: null;
	}
	/** From the character toward the cursor in ground coordinates; on the character, its facing. */
	function mouseAim(): Vector {
		if (!cursor || !actorAt) return { x: 0, y: 0 };
		const dx = cursor.x - actorAt.x,
			dy = actorAt.y - cursor.y;
		if (Math.hypot(dx, dy) <= actorAt.r) return { x: 0, y: 0 };
		// Top-down aims at the floor point under the cursor, the same point a left click walks to. Side-scroller keeps
		// the screen direction, since aiming up or down there picks Attack up or Attack down.
		const floor =
			experience.mode === 'topdown' && scene && sceneOptions
				? scene.unproject(cursor, sceneOptions, position.y)
				: null;
		return floor ? { x: floor.x - position.x, y: floor.y - position.y } : { x: dx, y: dy };
	}
	/**
	 * Mouse buttons by their held state, since a second button pressed or released during the first sends a move, not a
	 * down or up (W3C chorded buttons). Left sets a destination, and while held keeps steering it to the floor under the
	 * cursor every frame (the scene moves under a still cursor); right attacks toward the cursor while held and
	 * owns the cursor until released, so the character keeps walking to the left-button destination meanwhile.
	 */
	function mouseButtons(e: PointerEvent) {
		if (ui.sheet || !mouseOwned) return;
		cursor = { x: e.clientX, y: e.clientY };
		const left = (e.buttons & 1) !== 0,
			right = (e.buttons & 2) !== 0;
		if (right !== mouse.right) {
			mouse.right = right;
			if (right) {
				menuClaim = 'held';
				menuUsed = false;
				actions.hold('mouse', mouseAim);
			} else {
				// A menu still to come opens on this release; one already suppressed on the press is done.
				menuClaim = menuUsed ? 'none' : 'released';
				requestAnimationFrame(() => {
					if (menuClaim === 'released') menuClaim = 'none';
				});
				actions.release('mouse');
			}
			host.classList.toggle('aiming', right);
		}
		if (left !== mouse.left) {
			mouse.left = left;
			if (left) setDestination(e);
		}
		if (!left && !right) {
			mouseOwned = false;
			if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
		}
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
		if (e.pointerType === 'mouse' && experience.mode !== 'preview') {
			// Leaving the playfield (over a panel or bar) ends held mouse travel and attacks until a new press.
			const over = document.elementFromPoint(e.clientX, e.clientY);
			if (mouseOwned && over && !host.contains(over)) {
				letGo();
				if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
			} else if (mouseOwned) mouseButtons(e);
			else cursor = { x: e.clientX, y: e.clientY };
		}
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
		if (e.pointerType === 'mouse' && experience.mode !== 'preview') {
			if (e.type === 'pointerup') mouseButtons(e);
			else if (mouse.left || mouse.right) letGo();
		}
		if (stick.pointerId !== e.pointerId) return;
		endMove();
	}
	/** Bumped when held input is interrupted, so held game controls (the Attack stick, a held Jump) let go too. */
	let interruptions = $state(0);
	function stop() {
		interruptions++;
		pendingTap = null;
		shifts.clear();
		endWalk();
		release();
		letGo();
		clearHover();
	}
	// A walk held on the keyboard continues through a plain mouse click on a control outside the stage (a wardrobe tile,
	// a tab). The click takes focus; while it does (`handoff`), movement keys stay the stage's, and one frame after the
	// button is released the stage takes focus back, so the held keys and the next ones still move the character.
	// Whatever needs the keyboard, or can keep a key release from the page, ends the walk instead: a field, a menu, a
	// dialog, another key, another mouse button (a native menu, autoscroll), a touch or pen press (a long press).
	let handoff = false,
		handback = 0;
	const typing = (target: EventTarget | null) =>
		target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]');
	function pressOutside(e: PointerEvent) {
		cancelAnimationFrame(handback);
		handoff = false;
		// Any press, a game button's or a panel's, shows the controls for the hand in use (hybrid devices).
		if (experience.mode !== 'preview') touchInput = e.pointerType !== 'mouse';
		if (
			experience.mode === 'preview' ||
			!keys.size ||
			ui.sheet ||
			!(e.target instanceof Node) ||
			host?.contains(e.target)
		)
			return;
		if (e.pointerType === 'mouse' && e.button === 0 && !typing(e.target)) handoff = true;
		else keys.clear();
	}
	/** The stage's own right press is an attack, not a menu; a menu opened any other way ends a keyboard walk. */
	function contextMenu(e: MouseEvent) {
		// A keyboard-opened menu (Shift+F10, the Menu key) reports button 0 and always stays native.
		if (
			menuClaim !== 'none' &&
			e.button === 2 &&
			e.target instanceof Node &&
			host?.contains(e.target)
		) {
			e.preventDefault();
			menuUsed = true;
			if (menuClaim === 'released') menuClaim = 'none';
			return;
		}
		endWalk();
	}
	function endWalk() {
		cancelAnimationFrame(handback);
		handoff = false;
		keys.clear();
	}
	/** A second mouse button pressed while the first is down sends no pointerdown of its own. */
	function otherButton(e: MouseEvent) {
		if (e.button !== 0 && keys.size && e.target instanceof Node && !host?.contains(e.target))
			endWalk();
	}
	function pressEnded() {
		if (!handoff) return;
		// The control's own click follows this event: the keys stay the stage's until it has run.
		cancelAnimationFrame(handback);
		handback = requestAnimationFrame(() => {
			handoff = false;
			if (document.activeElement === host) return;
			if (
				ui.sheet ||
				experience.mode === 'preview' ||
				typing(document.activeElement) ||
				document.querySelector('[popover]:popover-open, dialog[open]')
			)
				keys.clear();
			else host?.focus({ preventScroll: true });
		});
	}
	/** Keys pressed while the click holds focus. Movement keys, held or new, are the stage's and never reach the clicked
	 *  control (an arrow would move its tab or scroll its list). Any other key is the keyboard used on the interface. */
	function heldElsewhere(e: KeyboardEvent) {
		if (!handoff || e.target === host) return;
		const k = e.key.toLowerCase();
		if (MOVEMENT_KEYS.has(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			e.stopImmediatePropagation();
			if (!e.repeat || keys.has(k)) keys.add(k);
		} else if (
			e.ctrlKey ||
			e.metaKey ||
			e.altKey ||
			k.length === 1 ||
			['tab', 'enter', 'escape', 'contextmenu'].includes(k)
		)
			// A key that acts on the interface (not a lock, media or input-method key): the keyboard is in use there.
			endWalk();
	}
	// Non-primary touch taps do not consistently produce native clicks. Keep the
	// first world finger's capture while a deliberate second tap operates a button.
	function secondaryDown(e: PointerEvent) {
		const button =
			e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
		if (
			pad &&
			e.pointerType === 'touch' &&
			!e.isPrimary &&
			button &&
			!button.disabled &&
			!('gameAction' in button.dataset)
		)
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
		const skyContext = sky.getContext('2d')!;
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
				presentation: Presentation;
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
			const entry = {
				key,
				availability: a,
				canvas: image ? canvas : null,
				result,
				presentation: p
			};
			companions.set(direction, entry);
			return entry;
		};
		// The theme's accent for the lineup ring, read when the page's applied theme changes.
		let accent = '',
			accentTheme = '';
		// The mount's own clock: its gait runs on its own timeline while the rider plays the selected move.
		let mountElapsed = 0;
		const legResults = new Map<
			DirectionName,
			{
				key: string;
				image: Img;
				availability: NonNullable<typeof availability>;
				result: ReturnType<typeof hideMountedLegs>;
			}
		>();
		const mountCanvases = new WeakMap<Img, HTMLCanvasElement>();
		const mountCanvas = (image: Img) => imageCanvas(image, mountCanvases);
		const prepareActor = (
			available: NonNullable<typeof availability>,
			presentation: Presentation,
			result: ReturnType<typeof renderPresentation>,
			source: HTMLCanvasElement,
			requestedCell: number
		) => {
			const mounted = mountedPresentation(presentation);
			let legs: ReturnType<typeof hideMountedLegs> | null = null;
			if (mounted?.view && result.image && presentation.clip && presentation.direction) {
				const { clip, direction } = presentation;
				const cells =
					presentation.kind === 'animation'
						? presentation.sequence!.frames.map((frame) => frame.cell)
						: [presentation.cell];
				const cell = cells.includes(requestedCell) ? requestedCell : cells[0];
				const mode = legMode(clip);
				const key = JSON.stringify([clip, cell, mode, result.frame]);
				const cached = legResults.get(direction);
				if (
					cached?.key === key &&
					cached.image === result.image &&
					cached.availability === available
				) {
					legs = cached.result;
				} else {
					const rig = available.project.manifest.rig;
					legs = hideMountedLegs(
						result.image,
						result.frame,
						rig,
						clip,
						direction,
						cell,
						mode,
						mountLegGeometry(available.project, clip, direction, cell)
					);
					legResults.set(direction, {
						key,
						image: result.image,
						availability: available,
						result: legs
					});
				}
			}
			return { mounted, source: legs ? mountCanvas(legs.image) : source, legs };
		};
		const drawActor = (
			actor: ReturnType<typeof prepareActor>,
			left: number,
			top: number,
			scale: number
		) => {
			const mounted = actor.mounted;
			if (!mounted?.view) {
				g.drawImage(
					actor.source,
					left,
					top,
					actor.source.width * scale,
					actor.source.height * scale
				);
				return null;
			}
			const index = sampleMountFrame(mounted.view, mountElapsed);
			const pose = mounted.view.frames[index];
			const placement = placeRider(mounted.ground, mounted.contact, pose);
			const layer = (image: Img) =>
				g.drawImage(
					mountCanvas(image),
					left + placement.mount.x * scale,
					top + placement.mount.y * scale,
					image.w * scale,
					image.h * scale
				);
			layer(pose.back);
			g.drawImage(
				actor.source,
				left + placement.rider.x * scale,
				top + placement.rider.y * scale,
				actor.source.width * scale,
				actor.source.height * scale
			);
			layer(pose.front);
			return index;
		};
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
			if (place.stage.b - place.stage.t !== stageHeight)
				stageHeight = place.stage.b - place.stage.t;
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
			// The live views stand the body at the stage's middle with its whole reach in view: every wardrobe item (worn
			// or not, so dressing never reframes the scene), the mount and the jump's apex (geometry.ts liveFrame).
			const standing = bodyBounds?.facings.get(ui.dir)?.standingHeight ?? fitFrame?.h ?? 0;
			const envelope = live && fitFrame ? (liveEnvelope ?? fitFrame) : null;
			const liveReach = envelope
				? {
						above: Math.max(envelope.y, fitFrame!.y) + standing * JUMP.height,
						body: standing,
						below: Math.max(0, envelope.h - envelope.y)
					}
				: null;
			const fit =
				row?.scale ??
				(fitFrame
					? liveReach
						? // Never larger than Preview's own fit of the body, unless Preview has no room at all (a squat window).
							Math.min(
								actorScale(fitFrame, room, dpr) || Infinity,
								actorScale(liveFrame(fitFrame, liveReach), liveRoom(place), dpr)
							)
						: actorScale(fitFrame, room, dpr)
					: 0);
			const shared = sharedZoom('studio', fit);
			// The gear's height above the feet, without the jump allowance (art px).
			const gearAbove = envelope ? Math.max(envelope.y, fitFrame!.y) : 0;
			if (liveReach)
				anchor.y = liveFeetY(place, {
					above: liveReach.above * shared.scale,
					body: liveReach.body * shared.scale,
					below: liveReach.below * shared.scale
				});
			const magnification = !fit ? 1 : shared.scale / fit;
			// The world image, sky and side floor share one horizon: the eye line of the characters as drawn
			// (geometry.ts placeWorld), so a lineup's smaller scale pulls the whole world back with it.
			const heroNow = fitFrame ? Math.round(fitFrame.y * fit) : experience.heroHeight;
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
			if (fit > 0) {
				previewFit = fit;
				if (experience.zoomFits.studio !== fit) experience.zoomFits.studio = fit;
				if (experience.zoomFits[experience.mode] !== fit)
					experience.zoomFits[experience.mode] = fit;
				const ceiling = zoomCeiling(experience.zoomCeiling, fit);
				if (ceiling !== experience.zoomCeiling) experience.zoomCeiling = ceiling;
			}
			const reference = grounding?.facings.get(ui.dir);
			const bodyReference = bodyBounds?.facings.get(ui.dir);
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
				// The live views frame the actor themselves (liveFeetY at the drawn scale), so they zoom around its feet.
				framing: live ? undefined : clearance,
				centerX: inspecting ? (clearance.l + clearance.r) / 2 : undefined,
				backdrop,
				plate: art,
				viewport: { l: 0, t: 0, r: width, b: backdrop.coverBottom },
				center: live
					? groundedFocus
					: {
							x: groundedFocus.x + (mountBounds ? (mountBounds.w / 2 - mountBounds.x) * fit : 0),
							y:
								groundedFocus.y -
								(mountBounds
									? (mountBounds.y - mountBounds.h / 2) * fit
									: ((bodyReference?.standingHeight ?? fitFrame?.h ?? 0) * fit) / 2)
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
				const box =
					mountedReach.get(direction) ??
					shownReach.get(direction) ??
					facingReach.get(direction) ??
					reach ??
					fitFrame;
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
			const stamp = JSON.stringify(zoom);
			if (stamp !== cameraStamp) {
				cameraStamp = stamp;
				experience.sceneCamera = zoom;
			}
			if (!live) {
				if (zoom.value !== 1 || zoom.offset.x !== 0 || zoom.offset.y !== 0) {
					g.translate(zoom.anchor.x + zoom.offset.x, zoom.anchor.y + zoom.offset.y);
					g.scale(zoom.value, zoom.value);
					g.translate(-zoom.anchor.x, -zoom.anchor.y);
				}
			}
			host.dataset.sceneZoom = String(shared.scale);
			host.dataset.sceneFit = String(shared.fit);
			host.dataset.sceneCamera = String(zoom.value);
			host.dataset.sceneAnchor = `${zoom.anchor.x},${zoom.anchor.y}`;
			host.dataset.sceneOffset = `${zoom.offset.x},${zoom.offset.y}`;
			host.dataset.sceneMin = String(shared.min);
			host.dataset.sceneMax = String(shared.max);
			// A press on the stage that has not been dragged yet steers nothing: the keyboard keeps the walk.
			const sprinting = live && (sprintOn || shifts.size > 0);
			const speed =
					travelSpeed(experience.mode === 'side' ? 'side' : 'topdown', mountVisible) *
					(sprinting ? MOTION.sprintMultiplier : 1),
				travelRate = speed / MOTION.walkSpeed.topdown;
			// A paused scene (a sheet, a hidden page) stops time, so no takeoff, landing or attack is skipped.
			const paused = !!ui.sheet || document.hidden;
			let velocity =
				stick.origin && (stick.value.x || stick.value.y)
					? { x: stick.value.x, y: -stick.value.y }
					: keyboardVector(keys, experience.mode === 'side');
			// A held left button walks on toward the floor under the cursor, even while the mouse stays still.
			if (live && !paused && mouse.left && !mouse.right && cursor)
				setDestination({ clientX: cursor.x, clientY: cursor.y });
			// Direction keys and the stick own travel, even while opposite keys cancel out.
			if (keys.size || stick.origin) destination = null;
			else if (destination && live) {
				const dx = destination.x - position.x,
					dy = experience.mode === 'side' ? 0 : destination.y - position.y,
					distance = Math.hypot(dx, dy),
					reach = (speed * dt) / 1000;
				// The last step lands on the point exactly.
				velocity =
					distance > reach ? unit({ x: dx, y: dy }) : { x: dx / reach || 0, y: dy / reach || 0 };
				if (distance <= reach) destination = null;
			}
			if (paused) velocity = { x: 0, y: 0 };
			travel = velocity;
			if (live)
				({ position, camera } = integrateMovement(
					position,
					camera,
					velocity,
					dt / 1000,
					speed,
					MOTION.cameraResponse,
					// Zoomed in, each world unit spans more of the screen, so the camera leads closer to the actor and
					// a steady walk drifts no further on screen than at the fit.
					1 - (1 - MOTION.cameraLead) / Math.max(1, magnification)
				));
			const options: RenderOptions = (sceneOptions = {
				width,
				height,
				dpr,
				theme: ui.theme,
				mode: experience.mode,
				anchor,
				camera,
				eye: backdrop.eye,
				zoom: live
					? {
							value: zoom.backdrop.scale / backdrop.scale,
							anchor: zoom.anchor,
							offset: zoom.offset
						}
					: undefined
			});
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
				zoom.backdrop.scale,
				zoom.backdrop.x,
				zoom.backdrop.y
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
							const sky = zoom.backdrop;
							skyContext.setTransform(dpr, 0, 0, dpr, 0, 0);
							skyContext.imageSmoothingEnabled = false;
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
			rendererWarning = live ? (ground?.warning ?? sceneError) : null;
			experience.mountLegIssue = '';
			delete host.dataset.mountLegIssue;
			if (a) {
				// Locomotion is resolved on its own, so an attack east never replaces the remembered westward facing.
				const loco = live
					? resolveLive(a, {
							velocity,
							// Sprinting plays Run, or Walk faster (livePlaybackDelta scales Walk with the speed).
							clips: { idle: roles.idle, walk: sprinting ? roles.run : roles.walk },
							riding: mountVisible,
							riderPose,
							items: view.items,
							previous,
							defaultDirection:
								experience.mode === 'side'
									? (nearestDirection(a.directions, { x: 1, y: 0 }, ui.dir) ?? undefined)
									: ui.dir
						})
					: null;
				let p = loco ?? resolvePreview(a, { clip: ui.anim, direction: ui.dir }),
					actionCell: number | null = null;
				if (loco) {
					// A paused scene starts nothing: an attack asked for behind a sheet waits until it closes.
					const request = paused ? null : actions.step(dt);
					if (request) {
						const choice = resolveAttack(a, roles, request, {
							side: experience.mode === 'side',
							facing: loco.direction
						});
						// The last attack asked for: what played, or the aimed facing it lacked.
						host.dataset.attack =
							'sequence' in choice
								? `${choice.sequence.clip} ${choice.sequence.direction}`
								: `missing ${choice.failure.kind === 'no-direction' ? (choice.failure.direction ?? '') : ''}`;
						if ('sequence' in choice) actions.start(choice.sequence, choice.sector);
						else {
							actions.refused();
							attackWarning(choice.failure);
						}
					}
					// A held attack turns with its aim mid-swing and carries on from the same frame. An aim it has no art for,
					// or a centered one, keeps the facing it has; once let go, the swing finishes where it was last aimed.
					const swing = actions.attack,
						aim = swing && !paused ? actions.heldAim() : null;
					if (swing && aim && (aim.x || aim.y)) {
						const turned = resolveAttack(a, roles, aim, {
							side: experience.mode === 'side',
							facing: swing.sequence.direction,
							sector: swing.sector
						});
						if ('sequence' in turned && turned.sequence !== swing.sequence) {
							actions.turn(turned.sequence, turned.sector);
							host.dataset.attack = `${turned.sequence.clip} ${turned.sequence.direction}`;
						}
					}
					const flying = airborne(actions.jump);
					// The shown action: an attack, else the Jump art for the walking facing, else the walk itself.
					const flight =
						flying && loco.direction
							? roles.jump.map((clip) => a.animations.get(clip)?.get(loco.direction!)).find(Boolean)
							: undefined;
					const shown = actions.attack?.sequence ?? flight;
					if (shown) {
						p = resolvePreview(a, { clip: shown.clip, direction: shown.direction });
						actionCell = actions.attack ? actions.attackCell() : actions.jumpCell(shown);
					}
					// Without Jump art the body holds its pose in the air and resumes its gait on landing.
					// Walk standing in for Run (no Run art in this facing) still steps with the faster ground speed.
					const gait =
						sprinting && loco.clip === roles.walk[0] ? { ...loco, requestedClip: loco.clip } : loco;
					clock = advancePlayback(
						loco,
						clock,
						flying && !flight ? 0 : livePlaybackDelta(gait, velocity, dt, travelRate, roles.walk[0])
					);
				}
				experience.presentation = p.kind;
				const cell = live
					? (actionCell ?? clock?.cell ?? p.cell)
					: p.kind === 'animation'
						? view.cell
						: p.cell;
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
					p.notice
						? displayPresentationNotice(p.notice, view.project?.manifest.rig.animations)
						: '',
					live && result?.hiddenItems.length
						? t('worldStage.notice.equippedHidden', { count: result.hiddenItems.length })
						: ''
				].filter(Boolean);
				const mounted = mountedPresentation(p);
				mountIssue =
					mounted && !mounted.view ? displayMountIssue(mounted.failure, mounted.direction) : '';
				if (mounted?.view && !ui.sheet && !document.hidden)
					mountElapsed += live
						? airborne(actions.jump)
							? 0 // the mount's gait holds in the air
							: travelDelta(velocity, dt, travelRate)
						: ui.playing
							? dt
							: 0;
				delete host.dataset.mountLegs;
				delete host.dataset.mountLegSource;
				const actor = result ? prepareActor(a, p, result, source, cell) : null;
				const legResult = actor?.legs;
				if (legResult) {
					const axial =
						experience.mountLegs === 'far' && (p.direction === 'north' || p.direction === 'south');
					host.dataset.mountLegIssue = legResult.issue ?? '';
					experience.mountLegIssue = legResult.issue
						? axial
							? t('worldStage.notice.legsAxial')
							: t('worldStage.notice.legsPose')
						: '';
					if (legResult.issue) {
						if (
							experience.mountLegs !== 'far' ||
							(p.direction !== 'north' && p.direction !== 'south')
						)
							mountIssue = t('worldStage.notice.legsUnavailable');
					} else host.dataset.mountLegs = legMode(p.clip);
					if (legResult.source) host.dataset.mountLegSource = legResult.source;
				}
				const loadings = new Set(result ? displayLoadingItems(result.loadingItems) : []);
				if ((velocity.x || velocity.y) && !hasMoved) {
					hasMoved = true;
					hint = false;
				}
				if (live && hasMoved && !ui.sheet) {
					const issues: [string, string][] = [];
					for (const shown of [p, result])
						if (shown?.issueKey && shown.notice && !noticed.has(shown.issueKey))
							issues.push([
								shown.issueKey,
								displayPresentationNotice(shown.notice, view.project?.manifest.rig.animations)
							]);
					// An unresolved error can defer this batch; only consume warnings the toast accepts.
					if (
						issues.length &&
						toast([...new Set(issues.map(([, text]) => text))].join(' '), { tone: 'warning' })
					)
						for (const [id] of issues) noticed.add(id);
				}
				if (img && result) {
					const frame = result.frame,
						point = s
							? s.project(position, options)
							: options.zoom
								? zoomPoint(anchor, options.zoom.anchor, options.zoom.value, options.zoom.offset)
								: anchor;
					const fit = fitFrame ?? frame,
						scale = live ? shared.scale : (row?.scale ?? actorScale(fit, room, dpr)),
						hero = heroNow;
					if (hero !== experience.heroHeight) experience.heroHeight = hero;
					const snap = (n: number) => Math.round(n * dpr) / dpr;
					const facings = visibleFacings,
						at = (d: DirectionName) => point.x + (row?.offsets[row.facings.indexOf(d)] ?? 0);
					const origin = (d: DirectionName) => grounding?.facings.get(d),
						selectedOrigin = origin(p.direction ?? ui.dir);
					const { x, y } = drawPosition(
						{ x: frame.x + (selectedOrigin?.x ?? 0), y: frame.y + (selectedOrigin?.y ?? 0) },
						{ x: at(ui.dir), y: point.y },
						scale
					);
					// A jump lifts the drawn actor (and its mount) off the floor point; the pivot never moves.
					// One standing height for the whole flight, so turning or attacking in the air never changes the lift.
					const standing = (bodyBounds?.facings.get(ui.dir)?.standingHeight ?? fit.h) * scale;
					const lift = live ? snap(actions.jump.height * standing) : 0;
					actorAt = live
						? { x: point.x, y: point.y - lift - standing / 2, r: Math.max(12, standing / 5) }
						: null;
					picks = live
						? []
						: facings.map((direction) => {
								const box =
									mountedReach.get(direction) ?? facingReach.get(direction) ?? reach ?? fit;
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
					const others = facings
						.filter((direction) => direction !== ui.dir)
						.map((direction) => {
							const entry = companion(a, direction, view.cell);
							if (entry.result.notice)
								notes.push(
									displayPresentationNotice(
										entry.result.notice,
										view.project?.manifest.rig.animations
									)
								);
							for (const text of displayLoadingItems(entry.result.loadingItems)) loadings.add(text);
							const ground = origin(direction);
							const actor = entry.canvas
								? prepareActor(a, entry.presentation, entry.result, entry.canvas, view.cell)
								: null;
							if (actor?.mounted && !actor.mounted.view)
								notes.push(displayMountIssue(actor.mounted.failure, actor.mounted.direction));
							if (
								actor?.legs?.issue &&
								!(
									experience.mountLegs === 'far' &&
									(direction === 'north' || direction === 'south')
								)
							) {
								mountIssue = t('worldStage.notice.legsUnavailable');
								experience.mountLegIssue = t('worldStage.notice.legsPose');
							}
							return {
								entry,
								actor,
								ground,
								...drawPosition(
									{
										x: entry.result.frame.x + (ground?.x ?? 0),
										y: entry.result.frame.y + (ground?.y ?? 0)
									},
									{ x: at(direction), y: point.y },
									scale
								)
							};
						});
					// A mounted rider leaves the floor, so Preview's floor reflection would be wrong.
					const floorProjection = s?.projection(options);
					const reflected = jumpReflection(live ? actions.jump.height : 0, REFLECTION.fadeHeight);
					if (
						REFLECTION.enabled &&
						REFLECTION[experience.mode] &&
						!mounted?.view &&
						reflected > 0
					) {
						const reflect = (
							image: typeof img,
							frame: typeof result.frame,
							ground: typeof selectedOrigin,
							left: number,
							top: number
						) => {
							const groundRow = frame.y + (ground?.y ?? 0);
							// Styled by the real floor row, below a lifted actor's feet.
							const style = reflectionStyle(
								top + lift + groundRow * scale,
								floorProjection?.horizon ?? backdrop.eye,
								floorProjection?.focal ?? backdrop.scale * art.focal
							);
							drawReflection(
								g,
								reflectionCanvas(image, groundRow, ground?.standingHeight ?? fit.h),
								{ x: left, y: top, scale, groundRow, lift },
								{ ...style, opacity: style.opacity * reflected }
							);
						};
						for (const other of others) {
							const image = other.entry.result.image;
							if (image) reflect(image, other.entry.result.frame, other.ground, other.x, other.y);
						}
						reflect(img, frame, selectedOrigin, x, y - lift);
					}
					// A lineup marks its selected facing with a thin accent ring on the floor, anchored to the feet so it
					// never moves with the walk or collides with tall gear; the sprite is drawn over its back half. A circle
					// on the world floor looks as flat as the floor is foreshortened there: rows below the horizon over focal.
					if (row && facings.length > 1)
						for (const [d, alpha] of [
							[ui.dir, 0.85],
							[hovered, 0.3]
						] as const) {
							if (!d || !facings.includes(d) || (alpha < 0.5 && d === ui.dir)) continue;
							const ringZoom = inspecting ? magnification : 1;
							const { rx, ry, rise, stroke } = floorRing(
								fit.w,
								origin(d)?.standingHeight ?? 0,
								scale,
								ringZoom,
								point.y - backdrop.eye,
								backdrop.scale * art.focal,
								dpr
							);
							g.save();
							g.globalAlpha = alpha;
							g.strokeStyle = accent;
							g.lineWidth = stroke;
							g.beginPath();
							const center = inspecting
								? drawPosition({ x: 0, y: 0 }, { x: at(d), y: point.y - rise }, 1)
								: { x: snap(at(d)), y: snap(point.y) - rise };
							g.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
							g.stroke();
							g.restore();
						}
					// A quiet floor cue: where a click sends the character.
					if (live && s && destination) {
						const target = s.project(destination, options);
						g.save();
						g.globalAlpha = 0.6;
						g.strokeStyle = accent;
						g.lineWidth = 1.5;
						g.beginPath();
						g.ellipse(snap(target.x), snap(target.y), 9, 3.5, 0, 0, Math.PI * 2);
						g.stroke();
						g.restore();
					}
					for (const other of others)
						if (other.actor) drawActor(other.actor, other.x, other.y, scale);
					const mountIndex = actor ? drawActor(actor, x, y - lift, scale) : null;
					host.dataset.mountedLineup = facings
						.filter((direction) =>
							direction === ui.dir
								? mountIndex !== null
								: others.some(
										(other) =>
											other.entry.presentation.direction === direction && other.actor?.mounted?.view
									)
						)
						.join(' ');
					if (mounted?.view && mountIndex !== null) {
						host.dataset.mountContact = mounted.contact.source;
						host.dataset.mount = `${mounted.view.fixture} ${mounted.view.direction} ${mountIndex}`;
					} else {
						delete host.dataset.mount;
						delete host.dataset.mountContact;
					}
					host.dataset.position = `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
					host.dataset.camera = `${camera.x.toFixed(2)},${camera.y.toFixed(2)}`;
					host.dataset.presentation = p.kind;
					host.dataset.facing = p.direction ?? '';
					host.dataset.clip = p.clip ?? '';
					host.dataset.jump = live ? actions.jump.height.toFixed(3) : '';
					host.dataset.sprint = sprinting ? 'true' : '';
					host.dataset.cell = live ? String(cell) : '';
					// Where the live actor stands and how high its reach goes on screen, for framing checks.
					host.dataset.feetY = live ? point.y.toFixed(1) : '';
					// The gear's top as drawn now: the reach above the feet without the jump allowance, raised by the lift.
					host.dataset.reachTop = live ? (point.y - lift - gearAbove * scale).toFixed(1) : '';
					host.dataset.destination = destination
						? `${destination.x.toFixed(2)},${destination.y.toFixed(2)}`
						: '';
					host.dataset.lineup = facings.join(' ');
				}
				note = [...new Set(notes)].join(' · '); // each facing of the lineup can report the same thing
				loadingNote = [...loadings].join(' · ');
				previous = loco ?? p;
			}
			if (!picks.length) updateHover();
			paint.commit();
			raf = requestAnimationFrame(animate);
		};
		raf = requestAnimationFrame(animate);
		return () => {
			disposed = true;
			experience.mountLegIssue = '';
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

<svelte:window
	onkeyup={keyup}
	onblur={stop}
	onresize={stop}
	onpointerdowncapture={pressOutside}
	onpointerupcapture={pressEnded}
	onpointercancelcapture={pressEnded}
	onmousedowncapture={otherButton}
	oncontextmenucapture={contextMenu}
	onkeydowncapture={heldElsewhere}
/>
<svelte:document onvisibilitychange={stop} />
<!-- A focused game surface owns directional input; controls remain native outside it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="world-stage bu-focus"
	{@attach (node) => {
		const mode = experience.mode;
		const enabled = !ui.sheet;
		return sceneZoom(node, {
			get zoom() {
				return sharedZoom('studio', previewFit);
			},
			get stored() {
				return experience.sceneZoom;
			},
			get enabled() {
				return enabled && experience.mode === mode;
			},
			onpinch: () => {
				pad = null;
				stick = IDLE;
				pendingTap = null;
				secondaryTouches.clear();
			},
			onchange: (scale) => {
				experience.sceneZoom = scale;
			},
			modifiedWheel: 'zoom'
		});
	}}
	id="world-stage"
	bind:this={host}
	role="application"
	tabindex="0"
	aria-label={experience.mode === 'preview'
		? t('worldStage.characterPreviewWASDOrArrowsChangeFacing')
		: experience.mode === 'side'
			? t('liveViews.stageSide')
			: t('liveViews.stageTopDown')}
	onkeydown={key}
	onfocusout={() => {
		if (handoff) return;
		keys.clear();
		shifts.clear();
		actions.release('key');
		actions.releaseJump('key');
	}}
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
	{#if doc.loading}<span class="world-loading">{t('worldStage.loadingCharacter')}</span>{/if}
</div>
<!-- One bottom-anchored stack: the movement hint always sits above the fallback note, whatever the note wraps to.
     In Preview it also clears the playback bar, whose top is --playback-top. -->
{#if mountIssue || hint || (experience.mode !== 'preview' && note) || loadingNote || rendererWarning}<div
		class="world-notes"
		style:bottom={experience.mode === 'preview' && playbackHeight
			? 'max(calc(var(--stage-bottom) + 16px), calc(100% - var(--playback-top) + 8px))'
			: undefined}
		style:max-width={experience.mode !== 'preview'
			? // Stop short of the game controls at the stage's lower right (GameControls.svelte).
				`min(420px, calc(100vw - var(--stage-left) - var(--stage-right) - 2 * var(--edge) - ${touchInput ? 204 : 196}px))`
			: undefined}
	>
		{#if mountIssue}<p class="world-hint" role="status">{mountIssue}</p>{/if}
		{#if hint}<p class="world-hint">
				{touchInput
					? t('liveViews.hintTouch')
					: experience.mode === 'side'
						? t('liveViews.hintSide')
						: t('liveViews.hintTopDown')}
			</p>{/if}{#if loadingNote}<p class="world-coverage world-loading-items" role="status">
				<LoaderCircle size={14} class="spin" aria-hidden="true" />{loadingNote}
			</p>{/if}{#if experience.mode !== 'preview' && (note || rendererWarning)}<p
				class="world-coverage"
			>
				{[rendererWarning ? t(rendererWarning) : '', note].filter(Boolean).join(' · ')}
			</p>{/if}
	</div>{/if}
<JoystickView
	class="world-stick"
	snapshot={stick}
	size={padSize}
	axis={experience.mode === 'side' ? 'x' : 'xy'}
/>
{#if experience.mode !== 'preview' && view.project && !ui.sheet}{#key interruptions}
		<GameControls
			touch={touchInput}
			mounted={experience.testMount}
			sprinting={sprintOn}
			onattack={() => attack('button')}
			onattackrelease={() => actions.release('button')}
			onstick={attackStick}
			onjump={() => jump('button')}
			onjumprelease={() => actions.releaseJump('button')}
			onsprint={() => (sprintOn = !sprintOn)}
			onmount={toggleMount}
			compact={stageHeight < MOTION.actions.compactBelow}
		/>{/key}
{/if}

<style>
	/* A held right button aims at the cursor. */
	:global(.world-stage.live.aiming) .world-input {
		cursor: crosshair;
	}
</style>
