<script lang="ts">
	import { applyRiderPose } from '../mountPreview.ts';
	import SurfaceChevron from '../SurfaceChevron.svelte';
	import { openerLabel } from '../openerLabel.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayMessage, displayNestedMessage } from '../../lib/i18n.ts';
	import { message } from '../../lib/message.ts';
	import { tabActivity, workTabs } from '../activityStatus.svelte.ts';
	import { onMount, tick, untrack } from 'svelte';
	import Toolbar from '../Toolbar.svelte';
	import CharacterActions from '../CharacterActions.svelte';
	import CharacterName from '../CharacterName.svelte';
	import NewCharacterButton from '../NewCharacterButton.svelte';
	import PhonePanel from '../PhonePanel.svelte';
	import WorldStage from './WorldStage.svelte';
	import PopoverArrow from '../PopoverArrow.svelte';
	import CharacterThumb from './CharacterThumb.svelte';
	import Sprite from '../Sprite.svelte';
	import { CREATE_STEPS } from '../characterConfig.ts';
	import CastCarousel from './CastCarousel.svelte';
	import PlaybackPicker from './PlaybackPicker.svelte';
	import { lookClipThumbnail } from '../moveThumbnails.ts';
	import ZoomControls from './ZoomControls.svelte';
	import { modifiedWheel, sceneZoom } from './sceneZoom.ts';
	import { sceneArtFits, sceneCamera, zoomCeiling } from './zoom.ts';
	import { castStill } from './castMount.ts';
	import { stills, groundedThumb, thumbScale } from './thumbnails.svelte.ts';
	import { castPose } from './carousel.ts';
	import { floorRing, RING_GAP } from './floorRing.ts';
	import {
		ui,
		doc,
		store,
		creates,
		openProject,
		openingProjectId,
		reviewFailedCreate,
		refreshProjects,
		characterName,
		showStanding,
		toast,
		view,
		matchStateColors
	} from '../state.svelte.ts';
	import { stateColorDrift } from '../../lib/dress/stateColors.ts';
	import {
		experience,
		customize as enterCustomize,
		characters,
		sharedZoom
	} from './state.svelte.ts';
	import { WORLDS, worldArt } from './config.ts';
	import { heroScale, layout, placeWorld } from './geometry.ts';
	import {
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Play,
		Pause,
		Grid2x2,
		PersonStanding,
		TriangleAlert
	} from '../icons.ts';
	import {
		displayDirection,
		displayDirectionInSentence,
		displayDirectionShort
	} from '../displayDirection.ts';
	import { displayMove } from '../displayMove.ts';
	import { playbackClips } from '../../lib/runtime/timeline.js';
	import { pixelSize } from '../model.ts';
	import { popoverFocus } from './focus.ts';
	import type { DirectionName, Item } from '../../lib/store/manifest.ts';
	import { workspaceCopy } from '../../lib/store/workspace-mode.ts';
	import { app } from '../../lib/app.svelte.ts';
	let search = $state('');
	let castDirection = $state(1);
	let selection = $state<HTMLDivElement>();
	let missing = $state.raw<{ clip: string; direction: DirectionName; items: Item[] } | null>(null);
	let coveragePopover = $state<HTMLElement>();
	let playbackHeight = $state(0);
	let stageNote = $state('');
	let selectionCaptionHeight = $state(0);
	const previewHeight = $derived(experience.mode === 'preview' ? playbackHeight : 0);
	let viewportWidth = $state(1280),
		viewportHeight = $state(720);
	const m = $derived(store.project?.manifest);
	const clips = $derived(playbackClips(m?.rig.animations ?? []));
	const moveRefs = $derived(m?.rig.animations ?? []);
	const selectedMove = $derived(m?.rig.animations.find((animation) => animation.id === ui.anim));
	// A State saved before States were matched to the body's colors: recolors miss most of it (stateColors.ts).
	const colorDrift = $derived(
		!!store.project &&
			doc.id.startsWith('rig-') &&
			selectedMove?.kind === 'state' &&
			stateColorDrift(store.project, selectedMove.id)
	);
	let matchingColors = $state(false);
	const problems = $derived((missing?.items.length ?? 0) + (colorDrift ? 1 : 0));
	// A shown mount has its own gait, so Play/Pause stays useful even over a single-frame move.
	const canPlay = $derived(
		(experience.presentation === 'animation' &&
			selectedMove?.frames.some((frame) => frame.cell !== selectedMove.frames[0]?.cell)) ||
			experience.testMount
	);
	const name = $derived(characterName());
	const query = $derived(search.toLowerCase());
	const list = $derived(
		store.projects.filter((p) => !p.dev && p.name.toLowerCase().includes(query))
	);
	const pending = $derived(
		creates.filter(
			(run) =>
				!run.projectId &&
				!store.projects.some((project) => project.id === run.spec.projectId) &&
				run.spec.name.toLowerCase().includes(query)
		)
	);
	$effect(() => {
		if (search && list.length && !doc.loading && !list.some((p) => p.id === doc.id))
			void openProject(list[0].id);
	});
	const index = $derived(list.findIndex((p) => p.id === doc.id));
	const neighbors = $derived(
		index < 0
			? []
			: list.length > 1
				? [-1, 0, 1]
						.filter((n) => !(list.length === 2 && n === 1))
						.map((offset) => ({
							offset,
							p: list[(Math.max(0, index) + offset + list.length) % list.length]
						}))
				: list.map((p) => ({ offset: 0, p }))
	);
	const movesOff = $derived(
		message(experience.testMount ? 'experience.movesOffMounted' : 'experience.movesOffWalking')
	);
	// Wardrobe, Moves and States carry a dot for this character's work there, red when some failed (activityStatus.svelte.ts);
	// disabled Moves and States leave theirs to More.
	const tabWork = $derived({
		wardrobe: tabActivity('wardrobe'),
		moves: tabActivity('moves'),
		states: tabActivity('states')
	});
	// While a tab is on screen and usable, More's dot leaves its work to it: not without a panel, under a sheet or on
	// another screen, and not Moves or States outside Preview, where they are disabled.
	$effect(() => {
		const shown = experience.screen === 'studio' && !(g.sheet && !g.sheetHeight) && !ui.sheet,
			clips = shown && experience.mode === 'preview';
		Object.assign(workTabs, { wardrobe: shown, moves: clips, states: clips });
		return () => Object.assign(workTabs, { wardrobe: false, moves: false, states: false });
	});
	const tabs = [
		['wardrobe', 'experience.tabWardrobe'],
		['colors', 'experience.tabColors'],
		['outfits', 'experience.tabOutfits'],
		['moves', 'experience.tabMoves'],
		['states', 'experience.tabStates']
	] as const;
	const g = $derived(layout(viewportWidth, viewportHeight, experience.screen, previewHeight));
	// The cast is drawn from 64 px frames whose bodies stand about 50 px tall and 48 px wide.
	const castScale = $derived(heroScale(g, 50, 48));
	const castSize = $derived(64 * castScale);
	const castSpan = $derived(
		Math.max(
			...list.map(({ id }) => {
				const art = groundedThumb(castSize, castStill(id), ui.dpr);
				return (2 * Math.max(-art.l, art.r)) / castSize;
			}),
			0.01
		)
	);
	const heroHeight = $derived(
		experience.screen === 'characters'
			? 50 * castScale * castPose(0, g.stage.r - g.stage.l, castSize, castSpan).scale
			: experience.heroHeight || 50 * castScale
	);
	// The world rises with Preview's lifted feet (WorldStage), so its horizon stays on the characters' eye line.
	const baseWorld = $derived(
		placeWorld(
			g,
			worldArt(ui.theme),
			{ x: g.feet.x, y: g.feet.y - (experience.screen === 'studio' ? experience.lift : 0) },
			heroHeight
		)
	);
	const selectionArt = $derived.by(() => {
		const width = g.stage.r - g.stage.l;
		const hero = groundedThumb(castSize, selectedStill, ui.dpr);
		return neighbors.map(({ offset, p }) => {
			const art = groundedThumb(castSize, castStill(p.id), ui.dpr);
			const pose = castPose(offset, width, castSize, castSpan, { hero, side: art });
			const bottom = g.feet.y + pose.y;
			return {
				offset,
				box: {
					l: g.stage.l + width / 2 + pose.x + art.l * pose.scale,
					r: g.stage.l + width / 2 + pose.x + art.r * pose.scale,
					t: bottom + art.t * pose.scale,
					b: bottom + art.b * pose.scale
				}
			};
		});
	});
	const selectedStill = $derived(
		castStill(neighbors.find(({ offset }) => !offset)?.p.id ?? doc.id)
	);
	const selectionFocus = $derived.by(() => {
		const size = castSize;
		const pose = castPose(0, g.stage.r - g.stage.l, size, castSpan);
		const art = groundedThumb(size, selectedStill, ui.dpr);
		const place = (point: { x: number; y: number }) => ({
			x: (g.stage.l + g.stage.r) / 2 + pose.x + point.x * pose.scale,
			y: g.feet.y + pose.y + point.y * pose.scale
		});
		return { ground: place({ x: 0, y: 0 }), center: place({ x: 0, y: art.center }) };
	});
	// The selected character's fit in CSS px per art px, exactly as its thumbnail draws it: the shared zoom is absolute,
	// and the camera multiplies this fit by the shown scale / fit.
	const selectionFit = $derived.by(() => {
		const size = castSize;
		return (
			thumbScale(size, selectedStill, ui.dpr) *
			groundedThumb(size, selectedStill, ui.dpr).scale *
			castPose(0, g.stage.r - g.stage.l, size, castSpan).scale
		);
	});
	const selectionZoom = $derived(sharedZoom('characters', selectionFit));
	const selectionCaptionGap = $derived.by(() => {
		const ring = floorRing(
			selectedStill?.body.w ?? 64,
			selectedStill?.body.h ?? 50,
			selectionFit,
			1,
			g.feet.y - baseWorld.eye,
			baseWorld.scale * worldArt(ui.theme).focal,
			ui.dpr
		);
		return Math.max(14, ring.ry - ring.rise + ring.stroke / 2 + RING_GAP);
	});
	const selectionListTop = $derived(
		Math.max(
			g.listTop,
			list.length ? g.feet.y + selectionCaptionGap + selectionCaptionHeight + RING_GAP : 0
		)
	);
	const selectionClearance = $derived({
		l: g.stage.l,
		r: g.stage.r,
		t: g.headerBottom + 16,
		b: g.sheet ? selectionListTop : g.h
	});
	$effect(() => {
		if (experience.screen !== 'characters') return;
		const fit = selectionFit;
		untrack(() => {
			if (experience.zoomFits.characters !== fit) experience.zoomFits.characters = fit;
			const ceiling = zoomCeiling(experience.zoomCeiling, fit);
			if (ceiling !== experience.zoomCeiling) experience.zoomCeiling = ceiling;
		});
	});
	const selectionCamera = $derived(
		sceneCamera({
			value: selectionZoom.scale / selectionFit,
			anchor: selectionFocus.ground,
			center: selectionFocus.center,
			framing: { ...selectionClearance, b: Math.min(selectionClearance.b, g.feet.y) },
			backdrop: baseWorld,
			plate: worldArt(ui.theme),
			viewport: { l: 0, t: 0, r: g.w, b: baseWorld.coverBottom }
		})
	);
	const culledOffsets = $derived(
		selectionCamera.value > 1
			? selectionArt
					.filter(
						({ offset, box }) => offset && !sceneArtFits(box, selectionCamera, selectionClearance)
					)
					.map(({ offset }) => offset)
			: []
	);
	const activeCamera = $derived(
		experience.screen === 'characters' ? selectionCamera : experience.sceneCamera
	);
	const world = $derived(activeCamera?.backdrop ?? baseWorld);
	// The automatic fit needs no controls; they appear once the person zooms, mainly to reset it.
	// Preview's zoom, read from the shared state rather than its last drawn frame, so its controls follow input at once.
	const previewZoom = $derived(sharedZoom('studio', experience.zoomFits.studio));
	function changeZoom(scale: number | null) {
		const fromControls = document.activeElement?.closest('.scene-zoom');
		experience.sceneZoom = scale;
		// Returning to the fit hides the controls, so keyboard focus moves to the scene they zoomed.
		if (fromControls)
			void tick().then(() => {
				if (document.querySelector('.scene-zoom')) return;
				(experience.screen === 'characters'
					? selection
					: document.querySelector<HTMLElement>('.world-stage')
				)?.focus({ preventScroll: true });
			});
	}
	const sceneIsZoomed = $derived(
		activeCamera &&
			activeCamera.value !== 1 &&
			(experience.screen === 'characters' || experience.mode === 'preview')
	);
	const px = (n: number) => `${Math.round(n * 100) / 100}px`;
	const vars = $derived(
		[
			['--edge', g.edge],
			['--header-top', g.top],
			['--header-row', g.row],
			['--header-bottom', g.headerBottom],
			['--rail', g.rail],
			['--rail-top', g.railTop],
			['--sheet-height', g.sheetHeight],
			['--stage-left', g.stage.l],
			['--stage-right', g.w - g.stage.r],
			['--stage-top', g.stage.t],
			['--stage-bottom', g.h - g.stage.b],
			['--feet-x', g.feet.x],
			['--feet-y', g.feet.y],
			['--playback-top', g.playbackTop],
			['--playback-height', g.playbackHeight],
			['--list-top', selectionListTop],
			['--world-w', world.scale * worldArt(ui.theme).width],
			['--world-h', world.scale * worldArt(ui.theme).height],
			['--world-x', world.x],
			['--world-y', world.y],
			['--world-cover', world.coverBottom]
		]
			.map(
				([k, v]) =>
					`${k}:${typeof k === 'string' && k.startsWith('--world-') && sceneIsZoomed ? `${v}px` : px(v as number)}`
			)
			.join(';')
	);
	// The offline banner lives outside the scene: just above the playback bar on Customize, above Customize on a
	// phone's cast list, else at the bottom left, clear of the caption, actions and toasts.
	$effect(() => {
		const bottom =
			experience.screen === 'studio' ? g.h - g.playbackTop + 8 : g.sheet ? g.edge + 56 : 12;
		const root = document.documentElement.style;
		root.setProperty('--scene-banner-bottom', `${bottom}px`);
		root.setProperty('--scene-edge', `${g.edge}px`);
		// The New character screen lines its own bar up with this one (Full screen and More stay put).
		root.setProperty('--scene-header-top', `${g.top}px`);
		root.setProperty('--scene-header-row', `${g.row}px`);
	});
	onMount(() => () => {
		const root = document.documentElement.style;
		root.removeProperty('--scene-banner-bottom');
		root.removeProperty('--scene-edge');
		root.removeProperty('--scene-header-top');
		root.removeProperty('--scene-header-row');
	});
	const background = $derived(
		WORLDS[ui.theme].backgrounds[
			ui.sheet === 'create'
				? 'creation'
				: experience.screen === 'characters'
					? 'selection'
					: experience.mode
		]
	);
	async function pick(id: string, activate = true, side?: number) {
		resetWheel();
		if (doc.loading) return;
		if (id === doc.id) {
			if (activate) customize();
		} else {
			const distance =
				(list.findIndex((project) => project.id === id) - Math.max(0, index) + list.length) %
				list.length;
			// A clicked card turns the way its side suggests, like the arrows; the character list keeps the
			// shorter route.
			castDirection = Math.sign(side || 0) || (distance <= list.length / 2 ? 1 : -1);
			await openProject(id);
		}
	}
	function next(delta: number) {
		resetWheel();
		if (list.length < 2 || doc.loading) return;
		castDirection = Math.sign(delta);
		void openProject(list[(Math.max(0, index) + delta + list.length) % list.length].id);
	}
	function selectionKey(e: KeyboardEvent) {
		if (e.target !== selection || ui.sheet || e.ctrlKey || e.metaKey || e.altKey || e.repeat)
			return;
		const k = e.key.toLowerCase();
		if (['a', 'w', 'arrowleft', 'arrowup', 'd', 's', 'arrowright', 'arrowdown'].includes(k)) {
			e.preventDefault();
			next(['a', 'w', 'arrowleft', 'arrowup'].includes(k) ? -1 : 1);
		} else if (k === 'enter' && list.length) {
			e.preventDefault();
			customize();
		}
	}
	onMount(() => {
		window.addEventListener('wheel', wheel, { passive: false });
		window.addEventListener('beforetoggle', openingPopover, true);
		return () => {
			window.removeEventListener('wheel', wheel);
			window.removeEventListener('beforetoggle', openingPopover, true);
		};
	});
	let wheelAmount = 0,
		lastWheelAt = -Infinity,
		wheelDirection = 0,
		wheelTargetDirection = 1,
		wheelIntent = 0,
		wheelContext = '';
	let wheelTarget = $state(''),
		customizeRequested = $state('');
	function customize() {
		customizeRequested = wheelTarget || openingProjectId() || doc.id;
	}
	function resetWheel() {
		wheelAmount = wheelDirection = 0;
		wheelIntent++;
		lastWheelAt = -Infinity;
		wheelTarget = '';
		customizeRequested = '';
	}
	function openingPopover(e: Event) {
		if (e instanceof ToggleEvent && e.newState === 'open') resetWheel();
	}
	$effect(() => {
		const context = [experience.screen, ui.sheet, search, ...list.map((p) => p.id)].join('\0');
		if (context !== wheelContext) {
			wheelContext = context;
			resetWheel();
		}
	});
	$effect(() => {
		if (doc.loading || openingProjectId()) return;
		if (!wheelTarget || wheelTarget === doc.id) {
			if (customizeRequested) {
				const target = customizeRequested;
				customizeRequested = '';
				if (
					doc.id === target &&
					m &&
					list.length &&
					experience.screen === 'characters' &&
					!ui.sheet
				) {
					// Customize opens on the standing move, also for the character already shown, or mounted on its Riding pose.
					showStanding();
					applyRiderPose();
					enterCustomize();
				}
			}
			return;
		}
		const target = wheelTarget,
			intent = wheelIntent,
			direction = wheelTargetDirection;
		const frame = requestAnimationFrame(() => {
			castDirection = direction;
			void openProject(target).then(() => {
				if (wheelIntent === intent) wheelTarget = '';
			});
		});
		return () => cancelAnimationFrame(frame);
	});
	// A plain wheel zooms the scene (sceneZoom); a wheel turned while Ctrl or Cmd is held steps through the characters
	// anywhere on this screen, instead of zooming the page.
	function wheel(e: WheelEvent) {
		if (
			experience.screen !== 'characters' ||
			list.length < 2 ||
			ui.sheet ||
			!modifiedWheel(e) ||
			e.altKey ||
			e.shiftKey ||
			document.querySelector(':popover-open')
		) {
			resetWheel();
			return;
		}
		if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			resetWheel();
			return;
		}
		e.preventDefault();
		const now = performance.now(),
			delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
		if (now - lastWheelAt > 500 || Math.sign(delta) !== wheelDirection) wheelAmount = 0;
		lastWheelAt = now;
		wheelDirection = Math.sign(delta);
		wheelAmount += delta;
		const stepDistance = 200,
			steps = Math.trunc(wheelAmount / stepDistance);
		if (!steps) return;
		wheelAmount -= steps * stepDistance;
		const distance = Math.max(1 - list.length, Math.min(list.length - 1, steps));
		const start = Math.max(
			0,
			list.findIndex((p) => p.id === (wheelTarget || doc.id))
		);
		wheelIntent++;
		wheelTargetDirection = Math.sign(distance);
		wheelTarget = list[(start + distance + list.length) % list.length].id;
		if (customizeRequested) customizeRequested = wheelTarget;
	}
	function panel(id: typeof ui.tab) {
		document
			.querySelectorAll<HTMLElement>('[popover]:popover-open')
			.forEach((el) => el.hidePopover());
		ui.tab = id;
	}
	function showMissingItem(item: Item) {
		if (!missing) return;
		coveragePopover?.hidePopover();
		ui.group = item.slot;
		ui.tab = 'wardrobe';
		ui.selected = item.id;
		if (ui.anim !== missing.clip) {
			ui.anim = missing.clip;
			ui.frame = 0;
		}
		ui.dir = missing.direction;
		ui.sheet = 'item';
	}
	$effect(() => {
		if (experience.mode !== 'preview' && (ui.tab === 'moves' || ui.tab === 'states'))
			ui.tab = 'wardrobe';
	});
	$effect(() => {
		const screen = experience.screen;
		void tick().then(() => {
			if (!ui.sheet)
				(screen === 'characters'
					? selection
					: document.querySelector<HTMLElement>('.world-stage')
				)?.focus({ preventScroll: true });
		});
	});

	function back(e: KeyboardEvent) {
		// Let the browser use Escape to leave fullscreen without also leaving the character.
		if (e.key === 'Escape' && document.fullscreenElement) return;
		if (
			e.repeat ||
			!['Escape', 'Backspace'].includes(e.key) ||
			ui.sheet ||
			e.defaultPrevented ||
			e.ctrlKey ||
			e.metaKey ||
			e.altKey
		)
			return;
		if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
		const popover = document.querySelector<HTMLElement>(
			'[popover]:popover-open:not(:has([popover]:popover-open))'
		);
		if (popover) {
			if (e.key === 'Backspace') {
				popover.hidePopover();
				e.preventDefault();
			}
			return;
		}
		// Backspace on ordinary controls stays native; the focused world owns Back.
		if (e.key === 'Backspace') return;
		if (experience.screen === 'studio') {
			characters();
			e.preventDefault();
		}
	}
	$effect(() => {
		void doc.id;
		void search;
		void tick().then(() => {
			const row = document.querySelector<HTMLElement>('.character-row[aria-pressed="true"]');
			if (row?.getClientRects().length) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		});
	});
</script>

<svelte:window onkeydown={back} bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
<div
	class="experience"
	class:selection={experience.screen === 'characters'}
	class:sheet-layout={g.sheet}
	class:short-layout={g.short}
	class:phone-layout={g.phone}
	class:compact-playback={g.compactPlayback}
	class:no-panel={experience.screen === 'studio' && g.sheet && !g.sheetHeight}
	style:--world-image="url('{background}')"
	style={vars}
>
	<div class="scene-backdrop" aria-hidden="true"></div>
	<div class="scene-reading" aria-hidden="true"></div>
	<Toolbar />
	{#if workspaceCopy}<div class="workspace-banner bu-floating" role="status">
			{t(
				app.key && !app.keyRejected
					? 'studio.titleWorkspaceCopy'
					: 'experience.workspaceCopyPixelLabOff'
			)}
		</div>{/if}
	{#if experience.screen === 'characters'}
		<!-- Keyboard focus on this game region scopes selection shortcuts. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="selection-world bu-focus"
			{@attach (node) =>
				sceneZoom(node, {
					get zoom() {
						return selectionZoom;
					},
					get stored() {
						return experience.sceneZoom;
					},
					get enabled() {
						return !ui.sheet;
					},
					onchange: changeZoom,
					onswipe: next,
					modifiedWheel: 'pass'
				})}
			data-scene-zoom={selectionZoom.scale}
			data-scene-fit={selectionZoom.fit}
			data-scene-min={selectionZoom.min}
			data-scene-max={selectionZoom.max}
			role="application"
			aria-label={t('experience.characterSelectionWASDOrArrowsSelectEnter')}
			tabindex="0"
			bind:this={selection}
			onkeydown={selectionKey}
		>
			<CastCarousel
				entries={neighbors}
				context={list.map((project) => project.id).join('\0')}
				size={castSize}
				span={castSpan}
				direction={castDirection}
				{name}
				zoom={selectionCamera.value}
				cameraX={selectionCamera.anchor.x - g.stage.l}
				cameraRise={g.feet.y - selectionCamera.anchor.y}
				cameraOffset={selectionCamera.offset}
				{culledOffsets}
				floorHorizon={baseWorld.eye - g.feet.y}
				floorFocal={baseWorld.scale * worldArt(ui.theme).focal}
				select={pick}
			/>
			{#if list.length}<div
					class="selected-caption"
					bind:offsetHeight={selectionCaptionHeight}
					style:top="{g.feet.y + selectionCaptionGap}px"
				>
					<!-- The heading sits beside the menu button: a heading is not allowed inside a button. -->
					<h2 class="sr">{name}</h2>
					<button
						class="selected-name project-btn"
						popovertarget="project-menu"
						onclick={() => void refreshProjects()}
						><span class="selected-name-text"><CharacterName id={doc.id} {name} /></span>
						<ChevronDown size={16} aria-hidden="true" /></button
					>
					{#if list.length > 1}<div class="selected-step">
							<button
								class="bu-action"
								data-variant="quiet"
								aria-label={t('experience.previousCharacter')}
								onclick={() => next(-1)}><ChevronLeft size={18} /></button
							><span class="num">{Math.max(0, index) + 1} / {list.length}</span><button
								class="bu-action"
								data-variant="quiet"
								aria-label={t('experience.nextCharacter')}
								onclick={() => next(1)}><ChevronRight size={18} /></button
							>
						</div>{/if}
				</div>{:else}<p class="empty-cast">{t('experience.noMatchingCharacters')}</p>{/if}
		</div>
		{#if selectionZoom.zoomed}
			<div class="scene-zoom-controls">
				<ZoomControls zoom={selectionZoom} onchange={changeZoom} />
			</div>
		{/if}
		<aside class="cast-library" aria-label={t('experience.yourCharacters')}>
			<div class="cast-search">
				<input
					class="bu-input"
					type="search"
					aria-label={t('experience.searchCharacters')}
					placeholder={g.sheet
						? t('experience.placeholderSearch')
						: t('experience.searchCharacters')}
					bind:value={search}
				/>
				{#if g.sheet}<NewCharacterButton compact />{/if}
			</div>
			<div class="character-rows">
				{#each pending as run (run.id)}
					{@const spec = run.spec}
					{@const step = CREATE_STEPS.findIndex((stage) => stage.id === run.progress?.step)}
					{@const createProgress = Math.max(0, step)}
					{@const createStatus = run.error
						? t('generation.status.needsAttention')
						: step < 0
							? t('activity.state.queued')
							: displayMessage(CREATE_STEPS[step].label)}
					<div class="character-row pending-character">
						<span class="character-thumbnail" aria-hidden="true">
							{#if run.views[0]}
								<Sprite img={run.views[0].img} k={1} limit={64} label={spec.name} />
							{:else}<PersonStanding size={24} />{/if}
						</span>
						<span>
							<strong>{spec.name}</strong>
							<small class="character-sizes">
								{#if spec.frame}<span
										>{t('characterFacts.frame', {
											measure: pixelSize({ w: spec.frame, h: spec.frame })
										})} ·</span
									>{/if}
								<span>{t('export.count.directions', { count: spec.directions?.length ?? 0 })}</span>
							</small>
							{#if run.error}
								<button
									class="bu-action btn sm"
									data-variant="quiet"
									onclick={() =>
										run.running ? (ui.sheet = 'activity') : reviewFailedCreate(run.id)}
								>
									{openerLabel(createStatus)}<SurfaceChevron />
								</button>
							{:else}
								<small class="pending-character-status">{createStatus}</small>
								<progress
									class="bu-progress"
									value={createProgress}
									max={CREATE_STEPS.length}
									aria-label={t('wardrobe.nameProgress', { name: spec.name })}
									aria-valuetext={createStatus}
								></progress>
							{/if}
						</span>
					</div>
				{/each}
				{#each list as p (p.id)}
					{@const still = stills.get(p.id)}
					{@const facts = p.facts ?? still?.facts}
					<CharacterActions id={p.id} name={p.name}>
						<button
							class="bu-action character-row"
							data-variant="row"
							aria-pressed={p.id === doc.id}
							onclick={() => pick(p.id)}
							><CharacterThumb id={p.id} name={p.name} trim /><span
								><strong><CharacterName id={p.id} name={p.name} /></strong>{#if facts}
									<small class="character-sizes">
										{#if still?.bodySize}<span
												>{t('characterFacts.body', { measure: pixelSize(still.bodySize) })}</span
											>{/if}
										<span
											>{still?.bodySize ? '· ' : ''}{t('characterFacts.frame', {
												measure: facts.frame
											})}</span
										>
									</small>
									<small class="character-counts"
										>{#each facts.counts as fact, index}<span class="character-fact"
												>{index ? ' · ' : ''}{displayMessage(fact)}</span
											>{/each}</small
									>
								{/if}</span
							></button
						>
					</CharacterActions>
				{:else}{#if !pending.length}<p class="muted">
							{t('experience.noMatchingCharacters')}
						</p>{/if}{/each}
				<NewCharacterButton row />
			</div>
			<button
				class="bu-action customize-action"
				data-variant="primary"
				onclick={customize}
				aria-label={t('experience.customizeName', { name })}
				title={t('experience.customizeName', { name })}
				aria-busy={doc.loading || !!openingProjectId() || !!wheelTarget}
				disabled={!m || !list.length}
				><span>{t('experience.customizeName', { name })}</span><ChevronRight size={16} /></button
			>
		</aside>
	{:else}
		<div class="experience-stage">
			<WorldStage playbackHeight={previewHeight} bind:missing bind:note={stageNote} />
		</div>
		{#if experience.zoomFits.studio && experience.sceneZoom !== null}
			<div class="scene-zoom-controls">
				<ZoomControls zoom={previewZoom} onchange={changeZoom} />
			</div>
		{/if}
		{#if experience.mode === 'preview' && m}
			<div class="experience-playback" bind:offsetHeight={playbackHeight}>
				<div
					class="playback-bar bu-floating"
					role="toolbar"
					aria-label={t('stage.previewControls')}
				>
					{#if canPlay}
						<button
							class="bu-action"
							data-variant="quiet"
							aria-label={ui.playing ? t('common.pause') : t('common.play')}
							onclick={() => (ui.playing = !ui.playing)}
							>{#if ui.playing}<Pause size={18} />{:else}<Play size={18} />{/if}</button
						>
					{/if}
					<PlaybackPicker
						{clips}
						{moveRefs}
						selected={ui.anim}
						compact={g.compactPlayback}
						thumbnail={(key) =>
							view.project && lookClipThumbnail(view.project, view.items, key, ui.dir)}
						onselect={(clip) => {
							ui.anim = clip;
							ui.frame = 0;
						}}
					/>
					{#if experience.presentation !== 'animation'}<span class="small muted playback-still"
							>{experience.presentation === 'unavailable'
								? t('common.unavailable')
								: t('experience.still')}</span
						>{/if}
					<span class="playback-sep" aria-hidden="true"></span>
					{#if g.cycleFacing}
						<!-- Too narrow for a button per direction: one button steps through them, so the bar stays one row. -->
						{@const dirs = m.rig.directions.map((d) => d.id)}
						<button
							class="bu-action facing-cycle"
							data-variant="direction"
							aria-label={t('experience.facing', { direction: displayDirection(ui.dir) })}
							title={t('experience.nextDirection', { direction: displayDirection(ui.dir) })}
							onclick={() => (ui.dir = dirs[(dirs.indexOf(ui.dir) + 1) % dirs.length] ?? dirs[0])}
							>{displayDirectionShort(ui.dir)}</button
						>
					{:else}
						<div class="facing-buttons" role="group" aria-label={t('common.direction')}>
							{#each m.rig.directions as d}<button
									class="bu-action"
									data-variant="direction"
									aria-pressed={ui.dir === d.id}
									aria-label={t('stage.faceId', { id: displayDirectionInSentence(d.id) })}
									onclick={() => (ui.dir = d.id)}>{displayDirectionShort(d.id)}</button
								>{/each}
						</div>
					{/if}
					<span class="playback-sep" aria-hidden="true"></span>
					<button
						class="bu-action playback-inspect"
						data-variant="quiet"
						aria-label={t('experience.inspect')}
						title={t('experience.inspect')}
						onclick={() => (ui.sheet = 'inspect')}><Grid2x2 size={16} /></button
					>
					{#if problems}
						{@const coverageLabel =
							missing && !colorDrift
								? t('experience.missingEquippedFrames', {
										count: missing.items.length,
										n: formatNumber(missing.items.length)
									})
								: t('experience.previewProblems', { count: problems, n: formatNumber(problems) })}
						<button
							class="bu-action"
							data-variant="quiet"
							aria-label={coverageLabel}
							title={coverageLabel}
							popovertarget="preview-coverage"
							><TriangleAlert size={16} /><span>{formatNumber(problems)}</span></button
						>
						<div
							id="preview-coverage"
							class="menu preview-coverage bu-popover-anchor"
							data-placement="top-end"
							popover
							bind:this={coveragePopover}
							ontoggle={popoverFocus}
						>
							<PopoverArrow />
							<div class="menu-surface bu-popover-surface bu-floating">
								{#if missing}
									<p class="menu-sec">
										{t('experience.missingFramesForMove', {
											move: displayMove(missing.clip, moveRefs),
											direction: displayDirection(missing.direction)
										})}
									</p>
									{#each missing.items as item (item.id)}
										{@const saved = m.items.find((i) => i.id === (item.variantOf ?? item.id))}
										{#if saved}<button
												class="row bu-action"
												data-variant="quiet"
												onclick={() => showMissingItem(saved)}
												>{item.name}<ChevronRight size={16} aria-hidden="true" /></button
											>
										{:else}<p class="menu-sec">{item.name}</p>{/if}
									{/each}
								{/if}
								{#if colorDrift && selectedMove}
									{@const stateName = displayMove(selectedMove.id, moveRefs)}
									<p class="menu-sec">{t('stateColors.drift', { name: stateName })}</p>
									<button
										class="row bu-action"
										data-variant="quiet"
										disabled={matchingColors}
										onclick={async () => {
											coveragePopover?.hidePopover();
											matchingColors = true;
											try {
												await matchStateColors(selectedMove.id, stateName);
											} finally {
												matchingColors = false;
											}
										}}>{t('stateColors.match')}<span class="cost">{t('common.free')}</span></button
									>
								{/if}
							</div>
						</div>
					{/if}
				</div>
				{#if stageNote}<p class="world-coverage preview-note">{stageNote}</p>{/if}
			</div>
		{/if}
		<aside class="equipment-rail" aria-label={t('experience.customization')}>
			{#if g.sheet}<span class="sheet-handle" aria-hidden="true"></span>{/if}
			<div class="equipment-modes" role="tablist" aria-label={t('experience.customizationPanels')}>
				<!-- Moves stays in place in the live views, aria-disabled: there movement picks idle or walk. It stays in the Tab
				     order so keyboard and screen reader users reach its reason (arrows step past it, Studio.svelte). -->
				{#each tabs as [id, label]}{@const off =
						(id === 'moves' || id === 'states') && experience.mode !== 'preview'}{@const work =
						!off && id in tabWork ? tabWork[id as keyof typeof tabWork] : undefined}<button
						class="bu-action"
						data-variant="tab"
						role="tab"
						id="customization-tab-{id}"
						aria-selected={ui.tab === id}
						aria-controls="customization-panel"
						aria-disabled={off || undefined}
						aria-describedby={[off && 'moves-tab-note', work && `tab-work-${work}`]
							.filter(Boolean)
							.join(' ') || undefined}
						data-activity={work}
						title={off ? displayMessage(movesOff) : undefined}
						tabindex={ui.tab === id || off ? 0 : -1}
						onclick={() => {
							if (off) toast(movesOff);
							else panel(id);
						}}><span class="bu-tab-label">{t(label)}</span></button
					>{/each}
			</div>
			<span class="sr" id="moves-tab-note">{displayMessage(movesOff)}</span>
			<span hidden id="tab-work-busy">{t('experience.tabWorkRunning')}</span>
			<span hidden id="tab-work-stopped">{t('experience.tabWorkAttention')}</span>
			<PhonePanel />
		</aside>
	{/if}
	{#if doc.error}<p class="experience-error" role="alert">{displayNestedMessage(doc.error)}</p>{/if}
</div>

<style>
	.pending-character > .character-thumbnail {
		width: 64px;
		flex: none;
	}
	.pending-character > span:last-child {
		flex: 1;
		padding-block: 4px;
	}
	.pending-character-status {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.character-row:has(.character-sizes) > span:last-child {
		line-height: 1.1;
	}
	.character-row > span > .character-sizes {
		display: flex;
		flex-wrap: wrap;
		flex-shrink: 0;
		column-gap: 4px;
	}
	.workspace-banner {
		position: absolute;
		z-index: 6;
		top: calc(var(--stage-top) + 8px);
		right: calc(var(--stage-right) + var(--edge));
		padding: 4px 10px;
		font-size: var(--fs-sm);
		pointer-events: none;
	}
</style>
