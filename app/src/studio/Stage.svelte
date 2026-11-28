<script lang="ts">
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	import {
		displayDirection,
		displayDirectionInSentence,
		displayDirectionShort
	} from './displayDirection.ts';
	import { bakedFrame, composeCell } from '../lib/compose/compose.ts';
	import type { DirectionName } from '../lib/store/manifest.ts';
	import Sprite from './Sprite.svelte';
	import { ui, doc, store, view, stepPreviewFrame } from './state.svelte.ts';
	import { moveDirs } from '../lib/dress/dress.ts';
	import { displayMove } from './displayMove.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import {
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Grid2x2,
		Image,
		Minus,
		Pause,
		Play,
		Plus
	} from './icons.ts';

	let box: HTMLElement;
	let bar = $state<HTMLElement>();
	let w = $state(0),
		h = $state(0);
	let transportHeight = $state(64);
	let directionGrid = $state<HTMLElement>();
	let directionRowHeight = $state(0);
	let wrapped = $state(false);
	$effect(() => {
		const ro = new ResizeObserver(([e]) => {
			w = e.contentRect.width;
			h = e.contentRect.height;
		});
		ro.observe(box);
		return () => ro.disconnect();
	});
	$effect(() => {
		if (!bar) return;
		const toolbar = bar;
		const observer = new ResizeObserver(() => {
			transportHeight = toolbar.offsetHeight;
			// A wrapped bar would leave separators alone at a row's start or end, so it drops them. Hidden, they come
			// back only once the one-row bar has room for them again, so the bar never flips between the two.
			const items = [...toolbar.children].filter(
				(c): c is HTMLElement =>
					c instanceof HTMLElement &&
					!c.classList.contains('bar-sep') &&
					!!c.getClientRects().length
			);
			const first = items[0];
			const rows = first && items.some((c) => c.offsetTop >= first.offsetTop + first.offsetHeight);
			const room = (toolbar.offsetParent?.clientWidth ?? Infinity) - 16 - toolbar.offsetWidth;
			wrapped = !!rows || (wrapped && room < 24);
		});
		observer.observe(bar);
		if (bar.offsetParent) observer.observe(bar.offsetParent);
		return () => observer.disconnect();
	});

	$effect(() => {
		const grid = directionGrid;
		if (!grid) {
			directionRowHeight = 0;
			return;
		}
		const observer = new ResizeObserver(() => {
			directionRowHeight = Math.max(
				0,
				...Array.from(
					grid.querySelectorAll('figure'),
					(figure) => figure.getBoundingClientRect().height
				)
			);
		});
		observer.observe(grid);
		return () => observer.disconnect();
	});

	const m = $derived(store.project?.manifest);
	const moveRefs = $derived(m?.rig.animations ?? []);
	// oversize layers (96 px held items) show whole: the stage uses the union frame of every layer around the pivot
	const frame = $derived(m ? bakedFrame(m) : undefined);
	const cellW = $derived(frame?.w ?? 64);
	const cellH = $derived(frame?.h ?? 64);
	// Both desktop sidebars can leave less room than the full toolbar needs.
	const phone = $derived(
		ui.size !== 'expanded' || w < ((m?.rig.directions.length ?? 4) > 4 ? 620 : 440)
	);
	const barH = $derived(transportHeight + 28);
	const allDirs = $derived(m?.rig.directions ?? []);
	// B10: views the move has (the base has frames there); the others are disabled, not silently empty
	const made = $derived(m ? moveDirs(m, ui.anim) : []);
	const dirs = $derived(allDirs.filter((d) => made.includes(d.id)));
	// Fixed positions make views easy to compare. Eight directions face out from an empty center.
	const order = $derived<(DirectionName | null)[]>(
		allDirs.some((d) => d.id.includes('-'))
			? [
					'north-west',
					'north',
					'north-east',
					'west',
					null,
					'east',
					'south-west',
					'south',
					'south-east'
				]
			: ['south', 'north', 'west', 'east']
	);
	// Keep unavailable views blank; moves with just one view still get the whole stage.
	const grid = $derived(
		dirs.length === 1 ? dirs : order.map((id) => dirs.find((d) => d.id === id))
	);
	const cols = $derived(ui.all ? (grid.length === 1 ? 1 : order.length === 9 ? 3 : 2) : 1);
	const rows = $derived(ui.all ? Math.ceil(grid.length / cols) : 1);
	// integer device px per sprite px: largest that fits ("fit"), or the user's zoom
	const fit = $derived(
		Math.max(
			1,
			Math.min(
				Math.floor(
					(Math.min((w - 24 - (cols - 1) * 12) / cols, (h - barH - 24 - (rows - 1) * 30) / rows) *
						ui.dpr) /
						cellH
				),
				Math.round(10 * ui.dpr)
			)
		)
	);
	const k = $derived(Math.max(1, Math.min(fit, ui.zoom || fit)));
	const zoomLabel = $derived(
		`${formatNumber(k / ui.dpr, { maximumFractionDigits: 1, useGrouping: false })}×`
	);
	const step = $derived(Math.max(1, Math.round(ui.dpr)));

	const wearing = $derived(
		m
			? m.items
					.filter((it) => it.id !== m.rig.baseItem && doc.items[it.slot] === it.id)
					.map((it) => it.name)
			: []
	);
	const label = (direction: DirectionName) => {
		const name =
			store.projects.find((project) => project.id === doc.id)?.name.replace(/ \(demo\)$/, '') ??
			m?.name ??
			t('common.character');
		const move = displayMove(ui.anim, moveRefs);
		const facing = displayDirectionInSentence(direction);
		const locale = getLocale();
		return wearing.length
			? t('stage.characterWearing', {
					name,
					move,
					facing,
					items: locale === 'en' ? wearing.join(', ') : new Intl.ListFormat(locale).format(wearing)
				})
			: t('stage.characterFacing', { name, move, facing });
	};
	const cellImg = (d: DirectionName) =>
		view.project && view.anim
			? composeCell(view.project, view.items, ui.anim, d, view.cell, frame)
			: null;
</script>

<div
	class="stage"
	bind:this={box}
	style:min-height={ui.all ? `${Math.ceil(barH + directionRowHeight) + 2}px` : undefined}
>
	{#if doc.loading && !m}
		<div class="stage-msg">
			<span class="bu-ring ring spin" aria-hidden="true"></span><span class="sr"
				>{t('stage.loading')}</span
			>
		</div>
	{:else if m}
		<div class="stage-art" style:margin-bottom="{barH}px">
			{#if ui.all}
				<div class="all-dirs" bind:this={directionGrid} style:--cols={cols}>
					{#each grid as d, i (i)}
						{#if d}
							<figure>
								<button
									class="bu-action btn plain"
									data-variant="quiet"
									style="height:auto;padding:0"
									onclick={() => {
										ui.dir = d.id;
										ui.all = false;
									}}
									aria-label={t('stage.showIdOnly', { id: displayDirectionInSentence(d.id) })}
								>
									<Sprite
										img={cellImg(d.id)}
										{k}
										w={cellW}
										h={cellH}
										checker={ui.bg === 'checker'}
										label={label(d.id)}
									/>
								</button>
								<figcaption>
									{d.mirrorOf
										? t('stage.mirroredDirection', { direction: displayDirection(d.id) })
										: displayDirection(d.id)}
								</figcaption>
							</figure>
						{:else}
							<div aria-hidden="true"></div>
						{/if}
					{/each}
				</div>
			{:else}
				<Sprite
					img={cellImg(ui.dir)}
					{k}
					w={cellW}
					h={cellH}
					checker={ui.bg === 'checker'}
					label={label(ui.dir)}
				/>
			{/if}
		</div>

		<div
			class="canvas-bar"
			bind:this={bar}
			data-wrapped={wrapped || undefined}
			role="toolbar"
			aria-label={t('stage.previewControls')}
		>
			<button
				class="bu-action btn icon plain"
				data-variant="quiet"
				aria-label={ui.playing ? t('common.pause') : t('common.play')}
				title={t('stage.titlePlayPauseSpace')}
				onclick={() => (ui.playing = !ui.playing)}
			>
				{#if ui.playing}<Pause size={16} />{:else}<Play size={16} />{/if}
			</button>
			<button
				class="bu-action btn icon plain"
				data-variant="quiet"
				aria-label={t('stage.previousFrame')}
				title={t('stage.titlePreviousFrame')}
				disabled={(view.anim?.frames.length ?? 0) < 2}
				onclick={() => stepPreviewFrame(-1)}><ChevronLeft size={16} /></button
			>
			<span class="small muted"
				>{t('stage.framePosition', {
					frame: formatNumber(view.anim ? (ui.frame % view.anim.frames.length) + 1 : 0),
					total: formatNumber(view.anim?.frames.length ?? 0)
				})}</span
			>
			<button
				class="bu-action btn icon plain"
				data-variant="quiet"
				aria-label={t('stage.nextFrame')}
				title={t('stage.titleNextFrame')}
				disabled={(view.anim?.frames.length ?? 0) < 2}
				onclick={() => stepPreviewFrame(1)}><ChevronRight size={16} /></button
			>
			<label class="select-wrap move-select">
				<span class="sr">{t('common.move')}</span>
				<select
					class="bu-select select"
					title={displayMove(ui.anim, moveRefs)}
					bind:value={ui.anim}
					onchange={() => (ui.frame = 0)}
				>
					{#each m.rig.animations as a (a.id)}<option value={a.id}
							>{displayMove(a.id, moveRefs)}</option
						>{/each}
				</select>
				<ChevronDown size={12} />
			</label>
			<span class="bar-sep" aria-hidden="true"></span>
			{#if phone}
				<!-- Available space, not direction count, determines the compact control. -->
				<label class="select-wrap">
					<span class="sr">{t('common.direction')}</span>
					<select
						class="bu-select select dir-select"
						value={ui.dir}
						onchange={(e) => {
							ui.all = false;
							ui.dir = e.currentTarget.value as DirectionName;
						}}
					>
						{#each allDirs as d (d.id)}<option value={d.id} disabled={!made.includes(d.id)}
								>{displayDirection(d.id)}</option
							>{/each}
					</select>
					<ChevronDown size={12} />
				</label>
			{:else}
				<div class="seg" role="group" aria-label={t('common.direction')}>
					{#each allDirs as d, i (d.id)}
						<button
							aria-pressed={!ui.all && ui.dir === d.id}
							aria-label={t('stage.faceId', { id: displayDirectionInSentence(d.id) })}
							disabled={!made.includes(d.id)}
							title={made.includes(d.id)
								? t('stage.faceShortcut', {
										direction: displayDirectionInSentence(d.id),
										shortcut: i + 1
									})
								: t('stage.directionUnavailable', { direction: displayDirectionInSentence(d.id) })}
							onclick={() => {
								ui.all = false;
								ui.dir = d.id;
							}}>{displayDirectionShort(d.id)}</button
						>
					{/each}
				</div>
			{/if}
			<button
				class="bu-action btn icon plain"
				data-variant="quiet"
				aria-pressed={ui.all}
				aria-label={t('stage.allDirections')}
				data-all-directions
				title={t('stage.titleAllDirections0')}
				onclick={() => (ui.all = !ui.all)}><Grid2x2 size={16} /></button
			>
			{#if !phone}
				<span class="bar-sep" aria-hidden="true"></span>
				<button
					class="bu-action btn icon plain"
					data-variant="quiet"
					aria-label={t('common.zoomOut')}
					title={t('stage.titleZoomOut')}
					disabled={k <= 1}
					onclick={() => (ui.zoom = Math.max(1, k - step))}><Minus size={14} /></button
				>
				<button
					class="bu-action btn plain sm zoom-val num"
					data-variant="quiet"
					title={t('stage.titleFit')}
					aria-label={t('stage.zoomZoomLabelClickToFit', { zoomLabel })}
					onclick={() => (ui.zoom = 0)}>{zoomLabel}</button
				>
				<button
					class="bu-action btn icon plain"
					data-variant="quiet"
					aria-label={t('common.zoomIn')}
					title={t('stage.titleZoomIn')}
					disabled={k >= fit}
					onclick={() => (ui.zoom = Math.min(fit, k + step))}><Plus size={14} /></button
				>
				<button
					class="bu-action btn icon plain"
					data-variant="quiet"
					aria-pressed={ui.bg === 'solid'}
					aria-label={t(ui.bg === 'solid' ? 'stage.backgroundSolid' : 'stage.backgroundChecker')}
					title={t('stage.titleBackgroundCheckerPlain')}
					onclick={() => (ui.bg = ui.bg === 'checker' ? 'solid' : 'checker')}
					><Image size={16} /></button
				>
			{/if}
		</div>
	{:else}
		<div class="stage-msg">{doc.error ? displayNestedMessage(doc.error) : 'Nothing to show'}</div>
	{/if}
</div>

<style>
	.canvas-bar {
		width: max-content;
		flex-wrap: wrap;
		justify-content: center;
	}
	.canvas-bar > :global(*) {
		flex-shrink: 0;
	}
	.canvas-bar[data-wrapped] .bar-sep {
		display: none;
	}
	.canvas-bar .move-select {
		min-width: 0;
		max-width: 100%;
	}
	.canvas-bar .move-select select {
		max-width: 180px;
		overflow: hidden;
		white-space: nowrap;
	}
	.canvas-bar .move-select select::picker(select) {
		max-width: calc(100vw - 24px);
	}
	.canvas-bar .move-select option {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.canvas-bar [data-all-directions] {
		display: inline-flex;
	}
	.canvas-bar .select.dir-select {
		min-width: 100px;
		max-width: 124px;
	}
	/* 16 px keeps phones from zooming into the field, like every other phone field. */
	@media (pointer: coarse), (max-width: 760px) {
		.canvas-bar select {
			font-size: 16px;
		}
	}
</style>
