<script lang="ts" module>
	type Tool = 'frames' | 'redraw' | 'capture' | 'items';
	/** Where the window was when one of its tools (or Rename) opened, so coming back returns to the same place. */
	let resume: {
		projectId: string;
		id: string;
		open: Record<'frames' | 'items' | 'about', boolean>;
		from: Tool | 'menu';
	} | null = null;
</script>

<script lang="ts">
	// A move's or State's View and edit window, laid out like an item's and a character's: the character as dressed now in
	// every facing of it (the first frame; any facing opens it playing), then Frames & Quality, Items and About, each tool
	// beside what it changes. Its footer shows it on the stage.
	import { untrack } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import ObjectWindow from './ObjectWindow.svelte';
	import { rowOf, selectedTab, successorFocus } from './experience/focus.ts';
	import WindowSection from './WindowSection.svelte';
	import FacingStrip from './FacingStrip.svelte';
	import ToolRow from './ToolRow.svelte';
	import ClipMenu from './ClipMenu.svelte';
	import TrashDialog from './TrashDialog.svelte';
	import SpritePreview, { type SpriteView } from './SpritePreview.svelte';
	import {
		ui,
		doc,
		store,
		view,
		isDemo,
		openFrames,
		openPendingWork,
		blockedByWork
	} from './state.svelte.ts';
	import { composeCell } from '../lib/compose/compose.ts';
	import { clipKind } from '../lib/runtime/timeline.js';
	import { clipItemCoverage, clipMissingItems } from './itemGeneration.ts';
	import { savedClipItemGeneration } from './savedClipItemGeneration.ts';
	import { moveDeletionBlocked, removeMove, stateCaptureSource } from './moveActions.svelte.ts';
	import { setupRedoMoves, unposedView } from '../lib/rig/setup.ts';
	import { moveExportId } from '../lib/store/identity.ts';
	import { cropAll } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayError, displayNestedMessage } from '../lib/i18n.ts';
	import type { Img } from '../lib/image/png.ts';
	import type { RigDirection } from '../lib/store/manifest.ts';
	import {
		Check,
		TriangleAlert,
		Footprints,
		Grid2x2,
		Image,
		Plus,
		RefreshCw,
		Sparkles
	} from './icons.ts';

	const id = untrack(() => ui.clip);
	// The window is for one character's move: switching characters closes it rather than showing another one's.
	const projectId = untrack(() => doc.id);
	$effect(() => {
		if (doc.id !== projectId) ui.sheet = null;
	});
	const m = $derived(store.project?.manifest);
	const clip = $derived(m?.rig.animations.find((entry) => entry.id === id));
	const kind = $derived(clip ? clipKind(clip) : 'move');
	const name = $derived(displayMove(id, m?.rig.animations ?? []));
	const base = $derived(m?.items.find((item) => item.id === m.rig.baseItem));

	const resumed = untrack(() =>
		ui.returnTo === 'clip' && resume?.id === id && resume.projectId === projectId ? resume : null
	);
	resume = null;
	const open = $state(resumed?.open ?? { frames: false, items: false, about: false });
	let body = $state<HTMLElement>();
	let itemSection = $state<HTMLDetailsElement>();
	$effect(() => {
		if (!resumed || !body) return;
		const target =
			resumed.from === 'menu'
				? body.closest('dialog')?.querySelector<HTMLElement>('.sheet-head [aria-haspopup="menu"]')
				: body.querySelector<HTMLElement>(`[data-tool="${resumed.from}"] button`);
		(target ?? (resumed.from === 'items' ? itemSection?.querySelector('summary') : null))?.focus();
	});
	/** Remembers this window's place before something opens over it whose Back returns here. */
	function remember(from: Tool | 'menu') {
		resume = { projectId, id, open: { ...open }, from };
		ui.returnTo = 'clip';
	}
	function tool(from: Tool, go: () => void) {
		remember(from);
		go();
	}

	// ---------- preview: the character as dressed now, every facing, one shared crop ----------
	const rows = $derived.by((): Img[][] => {
		void doc.rev;
		const project = view.project;
		if (!project || !clip || !m) return [];
		const cells = clip.frames.flatMap((frame) =>
			m.rig.directions.map((direction) =>
				composeCell(project, view.items, clip.id, direction.id, frame.cell)
			)
		);
		const cropped = cropAll(cells),
			n = m.rig.directions.length;
		return clip.frames.map((_, index) => cropped.slice(index * n, (index + 1) * n));
	});
	/** The body has its own (or mirrored) frame here: the facing exists in this move, whatever is worn. */
	const bodyAt = (direction: RigDirection, cell: number) =>
		!!base?.layers.some(
			(layer) =>
				!!(layer.cells?.[id]?.[direction.id] ??
					layer.cells?.[id]?.[direction.mirrorOf ?? direction.id])?.[cell]
		);
	const directions = $derived(
		m?.rig.directions.filter((direction) =>
			clip?.frames.some((frame) => bodyAt(direction, frame.cell))
		) ?? []
	);
	const strip = $derived(rows[0] ?? []);
	const k = $derived(
		strip.length
			? Math.max(1, Math.floor(Math.min(60 / strip[0].w, 64 / strip[0].h, 6) * ui.dpr))
			: 1
	);
	const tile = $derived(ui.size === 'landscape' ? 40 : 64);
	let viewerView = $state<string | null>(null);
	const viewerViews = $derived.by((): SpriteView[] => {
		if (!viewerView || !m || !clip) return [];
		return directions.map((direction) => ({
			id: direction.id,
			label: displayDirection(direction.id),
			frames: rows.map((row, index) =>
				bodyAt(direction, clip.frames[index].cell)
					? (row[m.rig.directions.indexOf(direction)] ?? null)
					: null
			)
		}));
	});

	// ---------- frames, quality and items ----------
	const redo = $derived(setupRedoMoves(store.exportRecord));
	const needsRedo = $derived(
		!!clip &&
			!!m?.rig.directions.some(
				(direction) => !direction.mirrorOf && unposedView(redo, clip, direction.id)
			)
	);
	const items = $derived(m && clip ? clipItemCoverage(m, id) : null);
	const itemRows = $derived.by(() => {
		if (!m || !clip) return [];
		const missing = new Set(clipMissingItems(m, id).map((item) => item.id));
		return m.items
			.filter((item) => item.id !== m.rig.baseItem)
			.map((item) => ({ item, drawn: !missing.has(item.id) }))
			.sort((a, b) => Number(b.drawn) - Number(a.drawn));
	});
	const generation = $derived(savedClipItemGeneration(store.project, projectId, id));
	const unavailableReason = $derived(generation.unavailableReason ?? generation.unposedNote);
	const canCapture = $derived(!isDemo() && !!m && !!stateCaptureSource(m, id));
	const length = $derived(clip?.frames.reduce((sum, frame) => sum + frame.ms, 0) ?? 0);

	// ---------- Trash ----------
	let trashing = $state(false);
	const lock = $derived(moveDeletionBlocked(id));
</script>

{#snippet clipMenu(close: () => void)}
	<div role="menu" aria-label={t('clipWindow.actions')}>
		<ClipMenu
			{id}
			{kind}
			{close}
			inWindow
			leave={() => remember('menu')}
			ontrash={() => (trashing = true)}
		/>
	</div>
{/snippet}

<ObjectWindow
	title={name}
	className="clip-window"
	kind={kind === 'state' ? t('clipWindow.state') : t('clipWindow.move')}
	status={needsRedo ? { tone: 'warn', label: t('moves.needsRedo') } : undefined}
	menuLabel={t('clipWindow.actions')}
	menu={clip ? clipMenu : undefined}
	onclose={() => (ui.sheet = null)}
>
	{#snippet icon()}{#if kind === 'state'}<Image size={18} />{:else}<Footprints
				size={18}
			/>{/if}{/snippet}
	{#snippet footer()}
		{#if clip}<button
				class="bu-action btn on-stage"
				data-variant="primary"
				onclick={() => {
					ui.anim = id;
					ui.frame = 0;
					// The stage faces a direction the move has frames for: the current one when it has them, else its first.
					const facing = m?.rig.directions.find((direction) => direction.id === ui.dir);
					if (!facing || !clip?.frames.some((frame) => bodyAt(facing, frame.cell)))
						ui.dir = directions[0]?.id ?? ui.dir;
					if (kind === 'move') ui.playing = true;
					ui.sheet = null;
				}}>{kind === 'state' ? t('clipWindow.showOnStage') : t('clipWindow.playOnStage')}</button
			>{/if}
	{/snippet}

	{#if m && clip}
		<div class="clip-body" bind:this={body}>
			<FacingStrip
				label={t('itemPane.availableDirectionsFor', { name })}
				{directions}
				image={(direction) => strip[m.rig.directions.indexOf(direction)]}
				drawn={(direction) => bodyAt(direction, clip.frames[0].cell)}
				{name}
				{tile}
				{k}
				empty={t('itemPane.previewUnavailable')}
				onopen={(direction) => (viewerView = direction)}
			/>
			<div class="window-sections">
				<WindowSection
					label={t('clipWindow.framesSection')}
					state={needsRedo
						? { text: t('moves.needsRedo'), tone: 'warn' }
						: {
								text: `${t('moves.frames', { count: clip.frames.length })} · ${t('export.count.directions', { count: directions.length })}`,
								tone: 'neutral'
							}}
					bind:open={open.frames}
				>
					<div class="window-body">
						<div class="tool-list">
							<div class="tool-slot" data-tool="frames">
								<ToolRow
									{...{
										icon: Grid2x2,
										label: t('fixFrames.open'),
										detail: t('clipWindow.fixFramesDetail', { move: name }),
										aside: t('common.free'),
										opens: true,
										onclick: () => tool('frames', () => openFrames('', id, 'clip'))
									}}
								/>
							</div>
							{#if kind === 'move' && !isDemo()}<div class="tool-slot" data-tool="redraw">
									<ToolRow
										{...{
											icon: RefreshCw,
											label: t('moves.redraw'),
											detail: t('clipWindow.redrawDetail', { move: name }),
											aside: '',
											opens: true,
											onclick: () =>
												tool('redraw', () => {
													ui.redrawMove = id;
													ui.sheet = 'move';
												})
										}}
									/>
								</div>{/if}
							{#if canCapture}<div class="tool-slot" data-tool="capture">
									<ToolRow
										{...{
											icon: Plus,
											label: t('stateCapture.add'),
											detail: t('clipWindow.captureDetail', { move: name }),
											aside: '',
											opens: true,
											onclick: () =>
												tool('capture', () => {
													ui.stateCaptureMove = id;
													ui.sheet = 'stateCapture';
												})
										}}
									/>
								</div>{/if}
						</div>
					</div>
				</WindowSection>
				{#if items?.total}<WindowSection
						label={t('clipWindow.itemsSection')}
						state={{
							text: t('moves.itemsDrawn', {
								count: items.total,
								drawn: formatNumber(items.drawn),
								n: formatNumber(items.total)
							}),
							tone: items.drawn < items.total ? 'warn' : 'ok'
						}}
						bind:open={open.items}
						bind:element={itemSection}
					>
						<div class="window-body">
							<!-- Which items have frames for it: drawn ones, then the ones still missing, in Wardrobe order. -->
							<ul class="clip-items" aria-label={t('clipWindow.itemsSection')}>
								{#each itemRows as row (row.item.id)}<li data-missing={!row.drawn || undefined}>
										{#if row.drawn}<Check
												size={16}
												strokeWidth={2.5}
												aria-hidden="true"
											/>{:else}<TriangleAlert size={16} aria-hidden="true" />{/if}<span
											>{row.item.name}</span
										><span class="sr"
											>{row.drawn ? t('clipWindow.itemDrawn') : t('clipWindow.itemMissing')}</span
										>
									</li>{/each}
							</ul>
							{#if generation.available}<div class="tool-list">
									<div class="tool-slot" data-tool="items">
										<ToolRow
											{...{
												icon: Sparkles,
												label: t('itemGeneration.open'),
												detail: t('clipWindow.itemsDetail', { move: name }),
												aside: '',
												opens: true,
												onclick: () =>
													tool('items', () => {
														ui.itemGeneration = id;
														ui.sheet = 'itemGeneration';
													})
											}}
										/>
									</div>
								</div>{:else if items.drawn >= items.total}<p class="muted small">
									{t('clipWindow.itemsComplete')}
								</p>{:else}<p class="muted small" role="status">
									{unavailableReason
										? displayNestedMessage(unavailableReason)
										: t('clipWindow.itemsUnavailable')}
								</p>{/if}
						</div>
					</WindowSection>{/if}
				<WindowSection label={t('itemPane.aboutSection')} bind:open={open.about}>
					<div class="window-body">
						<dl class="kv">
							<dt>{t('clipWindow.frames')}</dt>
							<dd>{formatNumber(clip.frames.length)}</dd>
							<dt>{t('clipWindow.length')}</dt>
							<dd>{t('clipWindow.ms', { ms: formatNumber(length) })}</dd>
							<dt>{t('common.directions')}</dt>
							<dd>{directions.map((direction) => displayDirection(direction.id)).join(', ')}</dd>
							<dt>{t('clipWindow.exportId')}</dt>
							<dd class="mono">{moveExportId(clip)}</dd>
						</dl>
					</div>
				</WindowSection>
			</div>
		</div>
	{:else}<p class="faint small" role="status">{t('clipWindow.gone')}</p>{/if}

	{#if viewerView && m && clip}
		<SpritePreview
			title={name}
			views={viewerViews}
			view={viewerView}
			durations={clip.frames.map((frame) => frame.ms)}
			onclose={() => (viewerView = null)}
		/>
	{/if}
	{#if trashing}
		<TrashDialog
			{name}
			body={t(
				kind === 'state' ? 'savedActions.removeState' : 'savedActions.thisRemovesTheMoveFromTheBody'
			)}
			locked={displayError(lock)}
			onlocked={blockedByWork(lock)
				? () =>
						void openPendingWork({
							projectId: doc.id,
							flows: !!lock && lock.translation.key !== 'moveRemoval.resolveDrafts'
						})
				: undefined}
			oncancel={() => (trashing = false)}
			onconfirm={async () => {
				const land = successorFocus(rowOf(id), selectedTab);
				await removeMove(id);
				trashing = false;
				ui.sheet = null;
				await land();
			}}
		/>
	{/if}
</ObjectWindow>

<style>
	.clip-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}
	.window-sections {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		border-block-start: 1px solid var(--bu-line);
	}
	.tool-list {
		display: grid;
		gap: 8px;
	}
	.clip-items {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.clip-items li {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 36px;
		border-block-end: 1px solid var(--bu-line);
	}
	.clip-items li :global(svg) {
		flex: none;
		color: var(--ok);
	}
	.clip-items li[data-missing] :global(svg) {
		color: var(--warn);
	}
	.tool-slot {
		display: contents;
	}
	.on-stage {
		min-width: 140px;
		min-height: 44px;
	}
</style>
