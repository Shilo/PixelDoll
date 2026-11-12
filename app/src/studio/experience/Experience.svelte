<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Toolbar from '../Toolbar.svelte';
	import CharacterActions from '../CharacterActions.svelte';
	import NewCharacterButton from '../NewCharacterButton.svelte';
	import PhonePanel from '../PhonePanel.svelte';
	import WorldStage from './WorldStage.svelte';
	import PopoverArrow from '../PopoverArrow.svelte';
	import CharacterThumb from './CharacterThumb.svelte';
	import CastCarousel from './CastCarousel.svelte';
	import ZoomControls from './ZoomControls.svelte';
	import { modifiedWheel, sceneZoom } from './sceneZoom.ts';
	import { sceneArtFits, sceneCamera, type SceneCamera } from './zoom.ts';
	import { castPose } from './carousel.ts';
	import {
		ui,
		doc,
		store,
		openProject,
		openingProjectId,
		refreshProjects,
		characterName,
		toast
	} from '../state.svelte.ts';
	import { experience, customize as enterCustomize, characters } from './state.svelte.ts';
	import { WORLDS, worldArt } from './config.ts';
	import { heroScale, layout, placeWorld } from './geometry.ts';
	import {
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Play,
		Pause,
		Grid2x2,
		TriangleAlert
	} from '../icons.ts';
	import { directionInfo, directionLabel } from './movement.ts';
	import { characterFacts, groupOf, moveLabel } from '../model.ts';
	import { popoverFocus } from './focus.ts';
	import type { DirectionName, Item } from '../../lib/store/manifest.ts';
	let search = $state('');
	let castDirection = $state(1);
	let selection = $state<HTMLDivElement>();
	let missing = $state.raw<{ clip: string; direction: DirectionName; items: Item[] } | null>(null);
	let coveragePopover = $state<HTMLElement>();
	let playbackHeight = $state(0);
	const previewHeight = $derived(experience.mode === 'preview' ? playbackHeight : 0);
	let viewportWidth = $state(1280),
		viewportHeight = $state(720);
	const m = $derived(store.project?.manifest);
	const moveIds = $derived(m?.rig.animations.map((a) => a.id) ?? []);
	const selectedMove = $derived(m?.rig.animations.find((animation) => animation.id === ui.anim));
	const canPlay = $derived(
		experience.presentation === 'animation' &&
			selectedMove?.frames.some((frame) => frame.cell !== selectedMove.frames[0]?.cell)
	);
	const name = $derived(characterName());
	// Facts for characters opened this session (the demo has no stored manifest summary).
	const openedFacts = new SvelteMap<string, string>();
	$effect(() => {
		if (m && doc.id && !doc.loading) openedFacts.set(doc.id, characterFacts(m));
	});
	const list = $derived(
		store.projects.filter((p) => !p.dev && p.name.toLowerCase().includes(search.toLowerCase()))
	);
	$effect(() => {
		if (search && list.length && !doc.loading && !list.some((p) => p.id === doc.id))
			void openProject(list[0].id);
	});
	const index = $derived(list.findIndex((p) => p.id === doc.id));
	const neighbors = $derived(
		list.length > 1
			? [-1, 0, 1]
					.filter((n) => !(list.length === 2 && n === 1))
					.map((offset) => ({
						offset,
						p: list[(Math.max(0, index) + offset + list.length) % list.length]
					}))
			: list.map((p) => ({ offset: 0, p }))
	);
	const MOVES_OFF = 'Moves are picked in Preview. Here, moving plays idle or walk.';
	const tabs = [
		['wardrobe', 'Wardrobe'],
		['colors', 'Colors'],
		['outfits', 'Outfits'],
		['moves', 'Moves']
	] as const;
	const g = $derived(layout(viewportWidth, viewportHeight, experience.screen, previewHeight));
	// The cast is drawn from 64 px frames whose bodies stand about 50 px tall and 48 px wide.
	const castScale = $derived(heroScale(g, 50, 48));
	const castSize = (offset: number) =>
		64 * (offset ? Math.max(1, Math.round(castScale * 0.56)) : castScale);
	const heroHeight = $derived(
		experience.screen === 'characters'
			? 50 * castScale * castPose(0, g.stage.r - g.stage.l, castSize(0), castSize(1)).scale
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
		return neighbors.map(({ offset }) => {
			const pose = castPose(offset, width, castSize(0), castSize(1));
			const size = castSize(0) * pose.scale;
			const bottom = g.feet.y + pose.y;
			return {
				offset,
				box: {
					l: g.stage.l + width / 2 + pose.x - size / 2,
					r: g.stage.l + width / 2 + pose.x + size / 2,
					t: bottom - size,
					b: bottom
				}
			};
		});
	});
	const selectionClearance = $derived({
		l: g.stage.l,
		r: g.stage.r,
		t: g.headerBottom + 16,
		b: g.sheet ? g.listTop : g.h
	});
	const selectionCamera = $derived(
		sceneCamera({
			value: experience.sceneZoom,
			anchor: g.feet,
			backdrop: baseWorld,
			plate: worldArt(ui.theme),
			viewport: { l: 0, t: 0, r: g.w, b: baseWorld.coverBottom },
			clearance: selectionClearance,
			art: selectionArt.filter(({ offset }) => !offset).map(({ box }) => box)
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
	const world = $derived(
		experience.screen === 'characters' || experience.mode === 'preview'
			? (activeCamera?.backdrop ?? baseWorld)
			: baseWorld
	);
	// The automatic fit needs no controls; they appear once the scene is zoomed, mainly to reset it.
	const zoomed = (camera: Pick<SceneCamera, 'value'>) => Math.abs(camera.value - 1) > 1e-4;
	function changeZoom(value: number) {
		const fromControls = document.activeElement?.closest('.scene-zoom');
		experience.sceneZoom = value;
		// Returning to the fit hides the controls, so keyboard focus moves to the scene they zoomed.
		if (fromControls && !zoomed({ value }))
			void tick().then(() =>
				(experience.screen === 'characters'
					? selection
					: document.querySelector<HTMLElement>('.world-stage')
				)?.focus({ preventScroll: true })
			);
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
			['--list-top', g.listTop],
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
	});
	onMount(() => () => {
		const root = document.documentElement.style;
		root.removeProperty('--scene-banner-bottom');
		root.removeProperty('--scene-edge');
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
	async function pick(id: string, activate = true) {
		resetWheel();
		if (doc.loading) return;
		if (id === doc.id) {
			if (activate) customize();
		} else {
			const distance =
				(list.findIndex((project) => project.id === id) - Math.max(0, index) + list.length) %
				list.length;
			castDirection = distance <= list.length / 2 ? 1 : -1;
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
				)
					enterCustomize();
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
		ui.group = groupOf(item.slot).id;
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
		if (experience.mode !== 'preview' && ui.tab === 'moves') ui.tab = 'wardrobe';
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
		const popover = document.querySelector<HTMLElement>('[popover]:popover-open');
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
	{#if experience.screen === 'characters'}
		<!-- Keyboard focus on this game region scopes selection shortcuts. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="selection-world bu-focus"
			{@attach (node) =>
				sceneZoom(node, {
					get value() {
						return selectionCamera.value;
					},
					get min() {
						return selectionCamera.min;
					},
					get max() {
						return selectionCamera.max;
					},
					get enabled() {
						return !ui.sheet;
					},
					onchange: changeZoom,
					onswipe: next,
					modifiedWheel: 'pass'
				})}
			data-scene-zoom={selectionCamera.value}
			data-scene-min={selectionCamera.min}
			data-scene-max={selectionCamera.max}
			role="application"
			aria-label="Character selection. WASD or arrows select; Enter customizes."
			tabindex="0"
			bind:this={selection}
			onkeydown={selectionKey}
		>
			<CastCarousel
				entries={neighbors}
				context={list.map((project) => project.id).join('\0')}
				size={castSize(0)}
				sideSize={castSize(1)}
				direction={castDirection}
				{name}
				zoom={selectionCamera.value}
				cameraX={g.feet.x - g.stage.l}
				{culledOffsets}
				select={pick}
			/>
			{#if list.length}<div class="selected-caption">
					<!-- The heading sits beside the menu button: a heading is not allowed inside a button. -->
					<h2 class="sr">{name}</h2>
					<button
						class="selected-name project-btn"
						popovertarget="project-menu"
						onclick={() => void refreshProjects()}
						><span class="selected-name-text">{name}</span>
						<ChevronDown size={16} /></button
					>
					{#if list.length > 1}<div class="selected-step">
							<button
								class="bu-action"
								data-variant="quiet"
								aria-label="Previous character"
								onclick={() => next(-1)}><ChevronLeft size={18} /></button
							><span class="num">{Math.max(0, index) + 1} / {list.length}</span><button
								class="bu-action"
								data-variant="quiet"
								aria-label="Next character"
								onclick={() => next(1)}><ChevronRight size={18} /></button
							>
						</div>{/if}
				</div>{:else}<p class="empty-cast">No matching characters</p>{/if}
		</div>
		{#if zoomed(selectionCamera)}
			<div class="scene-zoom-controls">
				<ZoomControls
					value={selectionCamera.value}
					min={selectionCamera.min}
					max={selectionCamera.max}
					onchange={changeZoom}
				/>
			</div>
		{/if}
		<aside class="cast-library" aria-label="Your characters">
			<div class="cast-search">
				<input
					class="bu-input"
					type="search"
					aria-label="Search characters"
					placeholder={g.sheet ? 'Search' : 'Search characters'}
					bind:value={search}
				/>
				{#if g.sheet}<NewCharacterButton compact />{/if}
			</div>
			<div class="character-rows">
				{#each list as p (p.id)}
					{@const facts = p.facts ?? openedFacts.get(p.id)}
					<CharacterActions id={p.id} name={p.name}>
						<button
							class="bu-action character-row"
							data-variant="row"
							aria-pressed={p.id === doc.id}
							onclick={() => pick(p.id)}
							><CharacterThumb id={p.id} name={p.name} /><span
								><strong>{p.name.replace(/ \(demo\)$/, '')}</strong>{#if facts}<small>{facts}</small
									>{/if}</span
							></button
						>
					</CharacterActions>
				{:else}<p class="muted">No matching characters</p>{/each}
				<NewCharacterButton row />
			</div>
			<button
				class="bu-action customize-action"
				data-variant="primary"
				onclick={customize}
				aria-label={`Customize ${name}`}
				title={`Customize ${name}`}
				aria-busy={doc.loading || !!openingProjectId() || !!wheelTarget}
				disabled={!m || !list.length}
				><span>Customize {name}</span><ChevronRight size={16} /></button
			>
		</aside>
	{:else}
		<div class="experience-stage">
			<WorldStage playbackHeight={previewHeight} bind:missing />
		</div>
		{#if experience.mode === 'preview' && activeCamera && zoomed(activeCamera)}
			<div class="scene-zoom-controls">
				<ZoomControls
					value={activeCamera.value}
					min={activeCamera.min}
					max={activeCamera.max}
					onchange={changeZoom}
				/>
			</div>
		{/if}
		{#if experience.mode === 'preview' && m}
			<div class="experience-playback">
				<div
					class="playback-bar bu-floating"
					role="toolbar"
					aria-label="Preview controls"
					bind:offsetHeight={playbackHeight}
				>
					{#if canPlay}
						<button
							class="bu-action"
							data-variant="quiet"
							aria-label={ui.playing ? 'Pause' : 'Play'}
							onclick={() => (ui.playing = !ui.playing)}
							>{#if ui.playing}<Pause size={18} />{:else}<Play size={18} />{/if}</button
						>
					{/if}
					<label class="playback-move"
						><span class="sr">Move</span><select
							class="bu-select"
							data-variant="quiet"
							title={moveLabel(ui.anim, moveIds)}
							bind:value={ui.anim}
							onchange={() => (ui.frame = 0)}
							>{#each m.rig.animations as a}<option value={a.id}>{moveLabel(a.id, moveIds)}</option
								>{/each}</select
						></label
					>
					{#if experience.presentation !== 'animation'}<span class="small muted playback-still"
							>{experience.presentation === 'unavailable' ? 'Unavailable' : 'Still'}</span
						>{/if}
					<span class="playback-sep" aria-hidden="true"></span>
					{#if g.cycleFacing}
						<!-- Too narrow for a button per direction: one button steps through them, so the bar stays one row. -->
						{@const dirs = m.rig.directions.map((d) => d.id)}
						<button
							class="bu-action facing-cycle"
							data-variant="direction"
							aria-label="Facing: {directionLabel(ui.dir)}"
							title="Facing {directionLabel(ui.dir)}. Next direction"
							onclick={() => (ui.dir = dirs[(dirs.indexOf(ui.dir) + 1) % dirs.length] ?? dirs[0])}
							>{directionInfo(ui.dir)?.short ?? ui.dir}</button
						>
					{:else}
						<div class="facing-buttons" role="group" aria-label="Direction">
							{#each m.rig.directions as d}<button
									class="bu-action"
									data-variant="direction"
									aria-pressed={ui.dir === d.id}
									aria-label="Face {d.id}"
									onclick={() => (ui.dir = d.id)}>{directionInfo(d.id)?.short ?? d.id}</button
								>{/each}
						</div>
					{/if}
					<span class="playback-sep" aria-hidden="true"></span>
					<button
						class="bu-action playback-inspect"
						data-variant="quiet"
						aria-label="Inspect"
						title="Inspect"
						onclick={() => (ui.sheet = 'inspect')}><Grid2x2 size={16} /></button
					>
					{#if missing}
						<button
							class="bu-action"
							data-variant="quiet"
							aria-label="{missing.items.length} equipped {missing.items.length === 1
								? 'item needs'
								: 'items need'} frames"
							popovertarget="preview-coverage"
							><TriangleAlert size={16} /><span>{missing.items.length}</span></button
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
								<p class="menu-sec">
									Missing frames for {moveLabel(missing.clip, moveIds)} · {directionLabel(
										missing.direction
									)}
								</p>
								{#each missing.items as item (item.id)}
									{@const saved = m.items.find((i) => i.id === (item.variantOf ?? item.id))}
									{#if saved}<button
											class="row bu-action"
											data-variant="quiet"
											onclick={() => showMissingItem(saved)}
											>{item.name}<ChevronRight size={16} /></button
										>
									{:else}<p class="menu-sec">{item.name}</p>{/if}
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
		<aside class="equipment-rail" aria-label="Customization">
			{#if g.sheet}<span class="sheet-handle" aria-hidden="true"></span>{/if}
			<div class="equipment-modes" role="tablist" aria-label="Customization panels">
				<!-- Moves stays in place in the live views, aria-disabled: there movement picks idle or walk. It stays in the Tab
				     order so keyboard and screen reader users reach its reason (arrows step past it, Studio.svelte). -->
				{#each tabs as [id, label]}{@const off =
						id === 'moves' && experience.mode !== 'preview'}<button
						class="bu-action"
						data-variant="tab"
						role="tab"
						id="customization-tab-{id}"
						aria-selected={ui.tab === id}
						aria-controls="customization-panel"
						aria-disabled={off || undefined}
						aria-describedby={off ? 'moves-tab-note' : undefined}
						title={off ? MOVES_OFF : undefined}
						tabindex={ui.tab === id || off ? 0 : -1}
						onclick={() => {
							if (off) toast(MOVES_OFF);
							else panel(id);
						}}><span class="bu-tab-label">{label}</span></button
					>{/each}
			</div>
			<span class="sr" id="moves-tab-note">{MOVES_OFF}</span>
			<PhonePanel />
		</aside>
	{/if}
	{#if doc.error}<p class="experience-error" role="alert">{doc.error}</p>{/if}
</div>
