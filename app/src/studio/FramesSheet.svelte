<script lang="ts">
	// Fix frames: every frame of one item (or the body) in one move, as the PNG it downloads as. Download, edit anywhere,
	// import, review what changed, then replace. Free and local; Undo in the toast and Restore originals here.
	import { formatNumber, t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import DemoCopyRow from './DemoCopyRow.svelte';
	import PasteButton from './PasteButton.svelte';
	import { fileDrop, preventFileNavigation } from './fileDrop.ts';
	import { displayDirection, displayDirectionShort } from './displayDirection.ts';
	import { formatList } from './displayDirectionProblem.ts';
	import { displayMove } from './displayMove.ts';
	import { downloadFrames } from './download.svelte.ts';
	import { displayError } from '../lib/i18n.ts';
	import { errorTranslation } from '../lib/message.ts';
	import { Download, RotateCcw, TriangleAlert, Upload } from './icons.ts';
	import {
		doc,
		frames,
		framesBlocked,
		isDemo,
		prepareFrames,
		replaceFrames,
		revertFrames,
		store,
		ui
	} from './state.svelte.ts';
	import { bakedFrame, composeCell, layerFrame } from '../lib/compose/compose.ts';
	import { recolor } from '../lib/dress/dress.ts';
	import { applyPlan, editedCount, editedFrames, frameTile } from '../lib/frames/fix.ts';
	import type { PreparedFrames } from '../lib/frames/save.ts';
	import type { DirectionName, Project } from '../lib/store/manifest.ts';

	const p = $derived(store.project);
	const m = $derived(p?.manifest);
	const base = $derived(m?.items.find((i) => i.id === m.rig.baseItem));
	const targets = $derived(
		m && base ? [base, ...m.items.filter((i) => i.id !== base.id && !i.variantOf)] : []
	);
	const item = $derived(m?.items.find((i) => i.id === frames.item));
	const isBody = $derived(!!item && item.id === base?.id);
	const name = $derived(isBody ? t('fixFrames.body') : (item?.name ?? ''));
	const moveRefs = $derived(m?.rig.animations ?? []);
	const move = $derived(m?.rig.animations.find((a) => a.id === frames.anim));
	const demo = $derived(isDemo());
	const blocked = $derived(framesBlocked());
	const frame = $derived(m && item ? layerFrame(m.rig, item.layers[0]) : undefined);

	let prepared = $state.raw<PreparedFrames | null>(null);
	let working = $state<'' | 'reading' | 'saving' | 'restoring'>('');
	const busy = $derived(!!working);
	let error = $state<unknown>(null);
	let dragging = $state(false);
	let confirmRestore = $state(false);
	let selected = $state('');
	let fileInput = $state<HTMLInputElement>();
	let width = $state(0);

	// A review belongs to the character, item and move it was made for.
	$effect(() => {
		if (prepared && (prepared.projectId !== doc.id || !item || !move)) reset();
	});

	// The review shows the item as it would be saved.
	const shown = $derived.by((): Project | undefined => {
		if (!prepared) return p ?? undefined;
		const { project, plan } = prepared;
		const next = applyPlan(project, plan, 'review');
		return {
			manifest: {
				...project.manifest,
				items: project.manifest.items.map((i) => (i.id === next.id ? next : i))
			},
			images: new Map([...project.images, ...plan.images])
		};
	});
	const changed = $derived(new Set(prepared?.plan.changed.map((c) => `${c.dir}/${c.cell}`) ?? []));
	const edited = $derived(
		m && item && !prepared ? editedFrames(m, item, frames.anim) : new Set<string>()
	);
	const restorable = $derived(m && item ? editedCount(m, item) : 0);
	const rows = $derived.by(() => {
		const q = shown;
		if (!q || !item || !move) return [];
		return q.manifest.rig.directions.map((d) => ({
			dir: d.id,
			mirror: d.mirrorOf,
			tiles: Array.from({ length: move.cells }, (_, c) => frameTile(q, item.id, move.id, d.id, c))
		}));
	});
	const tileW = $derived(rows[0]?.tiles[0]?.w ?? 64);
	// Tiles shrink so a whole row fits the sheet (phones included): each column adds 10 px of padding, border and gap, after
	// the direction labels.
	const tileLimit = $derived(
		move && width ? Math.max(24, Math.min(56, Math.floor((width - 40) / move.cells) - 10)) : 56
	);
	const k = $derived(Math.max(1, Math.floor(Math.min(56 / tileW, 4) * ui.dpr)));

	// Review previews: the selected changed frame before and after, and the move playing with the change, worn in the current
	// outfit and colors (the target worn even when it is not).
	const selection = $derived.by(() => {
		const [dir, cell] = (selected || [...changed][0] || '').split('/');
		return dir ? { dir: dir as DirectionName, cell: Number(cell) } : null;
	});
	const colored = (q: Project | undefined) => q && recolor(q, $state.snapshot(doc.variants));
	const beforeColored = $derived(prepared ? colored(prepared.project) : undefined);
	const afterColored = $derived(prepared ? colored(shown) : undefined);
	const worn = (q: Project | undefined, cell: number) => {
		if (!q || !item || !move || !selection) return null;
		const items = isBody ? { ...doc.items } : { ...doc.items, [item.slot]: item.id };
		return composeCell(q, items, move.id, selection.dir, cell, bakedFrame(q.manifest));
	};
	const before = $derived(selection ? worn(beforeColored, selection.cell) : null);
	const after = $derived(selection ? worn(afterColored, selection.cell) : null);
	// Its own clock: the reviewed move may not be the one the stage plays.
	let step = $state(0);
	$effect(() => {
		if (!prepared || !move || !ui.playing) return;
		const timer = setTimeout(() => step++, move.frames[step % move.frames.length].ms);
		return () => clearTimeout(timer);
	});
	const playing = $derived(
		selection && move ? worn(afterColored, move.frames[step % move.frames.length].cell) : null
	);
	const bigK = $derived(Math.max(1, Math.floor(3 * ui.dpr)));

	function reset() {
		prepared = null;
		error = null;
		selected = '';
	}
	function pick(id: string) {
		frames.item = id;
		reset();
	}
	function pickMove(id: string) {
		frames.anim = id;
		reset();
	}
	const failure = (e: unknown, fallback: 'importFailed' | 'saveFailed') =>
		errorTranslation(e) ? e : new Error(t(`fixFrames.errors.${fallback}`));

	async function importFiles(list: File[]) {
		if (!item || !move || busy) return;
		const target = { project: doc.id, item: item.id, anim: move.id };
		working = 'reading';
		error = null;
		try {
			const files = await Promise.all(
				list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
			);
			const next = await prepareFrames(target.project, target.item, target.anim, files);
			// A late result for another character, item or move is dropped.
			if (doc.id !== target.project || frames.item !== target.item || frames.anim !== target.anim)
				return;
			prepared = next;
			selected = '';
		} catch (e) {
			console.error('fix frames import', e);
			error = failure(e, 'importFailed');
		} finally {
			working = '';
		}
	}
	const drop = fileDrop(
		() => busy || demo || !!blocked || !!prepared,
		(active) => (dragging = active),
		(files) => void importFiles(files)
	);
	function chosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const list = Array.from(input.files ?? []);
		input.value = '';
		if (list.length) void importFiles(list);
	}
	async function replace() {
		if (!prepared || busy) return;
		working = 'saving';
		error = null;
		try {
			await replaceFrames(prepared, name);
			reset();
		} catch (e) {
			console.error('fix frames save', e);
			error = failure(e, 'saveFailed');
		} finally {
			working = '';
		}
	}
	async function restore() {
		if (!item || busy) return;
		working = 'restoring';
		error = null;
		try {
			await revertFrames(doc.id, item.id, 'restore');
		} finally {
			working = '';
			confirmRestore = false;
		}
	}
	const noteText = (n: PreparedFrames['plan']['notes'][number]) =>
		n.kind === 'mirrored'
			? t('fixFrames.notes.mirrored', {
					dir: displayDirection(n.dir),
					of: displayDirection(n.of)
				})
			: n.kind === 'noBodyRow'
				? t('fixFrames.notes.noBodyRow', { dir: displayDirection(n.dir) })
				: n.kind === 'missingLayer'
					? t('fixFrames.notes.missingLayer', { layer: n.layer })
					: t('fixFrames.notes.emptiedBody');
	const frameName = (dir: DirectionName, c: number) => ({
		dir: displayDirection(dir),
		n: formatNumber(c + 1)
	});
</script>

<svelte:window ondragover={preventFileNavigation} ondrop={preventFileNavigation} />

<Sheet
	title={prepared ? t('fixFrames.reviewTitle') : t('fixFrames.title')}
	locked={busy}
	wide
	back={prepared ? reset : undefined}
	backDiscards
	dirty={!!prepared}
	onclose={() => (ui.sheet = null)}
>
	{#if m && item && move && frame}
		<div
			class="frames"
			role="region"
			aria-label={t('fixFrames.title')}
			aria-busy={busy}
			bind:clientWidth={width}
			ondragenter={drop.enter}
			ondragleave={drop.leave}
			ondragover={drop.over}
			ondrop={drop.drop}
		>
			{#if !prepared}
				<div class="pickers">
					<select
						class="bu-input input"
						aria-label={t('fixFrames.target')}
						value={item.id}
						disabled={busy}
						onchange={(e) => pick(e.currentTarget.value)}
					>
						{#each targets as target (target.id)}
							<option value={target.id}
								>{target.id === base?.id ? t('fixFrames.body') : target.name}</option
							>
						{/each}
					</select>
					<select
						class="bu-input input"
						aria-label={t('fixFrames.move')}
						value={move.id}
						disabled={busy}
						onchange={(e) => pickMove(e.currentTarget.value)}
					>
						{#each moveRefs as { id } (id)}
							<option value={id}>{displayMove(id, moveRefs)}</option>
						{/each}
					</select>
					{#if item.layers.length === 1}
						<PasteButton
							class="paste-end"
							disabled={busy || demo || !!blocked}
							onfiles={(files) => void importFiles(files)}
							onerror={(e) => (error = e)}
						/>
					{/if}
				</div>
			{:else}
				{#if isBody && prepared.fitted.length && prepared.plan.changed.length}
					<p class="notice warn small" role="status">
						<TriangleAlert size={16} /><span
							>{t('fixFrames.notes.fitted', { names: formatList(prepared.fitted) })}</span
						>
					</p>
				{/if}
				<p class="summary" role="status">
					{prepared.plan.changed.length
						? t('fixFrames.changedCount', {
								count: prepared.plan.changed.length,
								n: formatNumber(prepared.plan.changed.length)
							})
						: t('fixFrames.nothingChanged')}
				</p>
			{/if}

			<div
				class="grid"
				style:--cols={move.cells}
				aria-label={t('fixFrames.gridLabel', { name, move: displayMove(move.id, moveRefs) })}
				role="group"
			>
				<span></span>
				{#each { length: move.cells } as _, c (c)}<span class="num" aria-hidden="true"
						>{formatNumber(c + 1)}</span
					>{/each}
				{#each rows as row (row.dir)}
					<span class="dir" title={displayDirection(row.dir)} aria-hidden="true"
						>{displayDirectionShort(row.dir)}</span
					>
					{#each row.tiles as tile, c (c)}
						{@const key = `${row.dir}/${c}`}
						{#if changed.has(key)}
							<button
								class="tile changed"
								aria-pressed={selection?.dir === row.dir && selection.cell === c}
								aria-label={t('fixFrames.changedFrame', frameName(row.dir, c))}
								onclick={() => (selected = key)}
							>
								<Sprite img={tile} {k} limit={tileLimit} checker label="" />
							</button>
						{:else}
							<span class="tile" class:mirror={!!row.mirror}>
								<Sprite
									img={tile}
									{k}
									limit={tileLimit}
									checker
									label={t(
										edited.has(key) ? 'fixFrames.editedFrame' : 'fixFrames.frameLabel',
										frameName(row.dir, c)
									)}
								/>
								{#if edited.has(key)}<i class="dot" title={t('fixFrames.editedByYou')}></i>{/if}
							</span>
						{/if}
					{/each}
					{#if row.mirror}<span></span><span class="mirror-note"
							>{t('fixFrames.mirrors', { of: displayDirection(row.mirror) })}</span
						>{/if}
				{/each}
			</div>

			{#if prepared}
				{#if selection && before && after && playing}
					<div class="compare">
						<figure>
							<Sprite
								img={before}
								k={bigK}
								limit={150}
								checker
								label={t('fixFrames.beforeFrame', frameName(selection.dir, selection.cell))}
							/>
							<figcaption>
								{t('fixFrames.beforeFrame', frameName(selection.dir, selection.cell))}
							</figcaption>
						</figure>
						<figure>
							<Sprite
								img={after}
								k={bigK}
								limit={150}
								checker
								label={t('fixFrames.afterFrame', frameName(selection.dir, selection.cell))}
							/>
							<figcaption>
								{t('fixFrames.afterFrame', frameName(selection.dir, selection.cell))}
							</figcaption>
						</figure>
						<figure>
							<Sprite
								img={playing}
								k={bigK}
								limit={150}
								checker
								label={t('fixFrames.playing', { move: displayMove(move.id, moveRefs) })}
							/>
							<figcaption>
								{t('fixFrames.playing', { move: displayMove(move.id, moveRefs) })}
							</figcaption>
						</figure>
					</div>
				{/if}
				<ul class="notes small">
					{#if prepared.plan.softAlpha}<li>
							<TriangleAlert size={14} />{t('fixFrames.notes.softAlpha', {
								count: prepared.plan.softAlpha,
								n: formatNumber(prepared.plan.softAlpha)
							})}
						</li>{/if}
					{#if prepared.plan.newColors}<li>
							<TriangleAlert size={14} />{t('fixFrames.notes.newColors', {
								count: prepared.plan.newColors,
								n: formatNumber(prepared.plan.newColors)
							})}
						</li>{/if}
					{#each prepared.plan.notes as note, i (i)}<li>
							<TriangleAlert size={14} />{noteText(note)}
						</li>{/each}
					{#if prepared.ignored}<li>
							<TriangleAlert size={14} />{t('fixFrames.notes.ignored', {
								count: prepared.ignored,
								n: formatNumber(prepared.ignored)
							})}
						</li>{/if}
				</ul>
			{:else}
				<p class="muted small">
					{t(item.layers.length > 1 ? 'fixFrames.hintLayers' : 'fixFrames.hint', {
						w: frame.w,
						h: frame.h
					})}
				</p>
				{#if demo}
					<p class="muted small">{t('fixFrames.demoNote')}</p>
					<div class="demo" role="menu">
						<DemoCopyRow id={doc.id} close={() => (ui.sheet = null)} />
					</div>
				{/if}
				{#if dragging}<p class="drop-note" aria-live="polite">{t('fixFrames.release')}</p>{/if}
			{/if}
			{#if blocked && !demo}<p class="notice warn small" role="status">
					{displayError(blocked)}
				</p>{/if}
			{#if error}<p class="notice bad small" role="alert">{displayError(error)}</p>{/if}
		</div>
		<input
			hidden
			type="file"
			multiple
			accept=".png,.zip,image/png,application/zip"
			aria-label={t(item.layers.length > 1 ? 'fixFrames.importFiles' : 'fixFrames.import')}
			bind:this={fileInput}
			onchange={chosen}
		/>
	{/if}
	{#snippet footer()}
		{#if item && move}
			{#if prepared}
				{#if prepared.plan.changed.length}<button
						class="bu-action btn primary"
						data-variant="primary"
						disabled={busy || !!blocked}
						onclick={() => void replace()}
						>{t('fixFrames.replace', {
							count: prepared.plan.changed.length,
							n: formatNumber(prepared.plan.changed.length)
						})}<small class="row-aside">{t('common.free')}</small></button
					>{/if}
			{:else}
				{#if restorable}
					<button
						class="bu-action btn plain"
						data-variant="quiet"
						disabled={busy || demo || !!blocked}
						onclick={() => (confirmRestore = true)}
						><RotateCcw size={16} />{working === 'restoring'
							? t('fixFrames.restoring')
							: t('fixFrames.restore', {
									count: restorable,
									n: formatNumber(restorable)
								})}</button
					>
				{/if}
				<button
					class="bu-action btn"
					data-variant="outline"
					disabled={busy}
					onclick={() => void downloadFrames(item.id, move.id)}
					><Download size={16} />{t(
						item.layers.length > 1 ? 'fixFrames.downloadZip' : 'fixFrames.downloadPng'
					)}</button
				>
				<button
					class="bu-action btn primary"
					data-variant="primary"
					disabled={busy || demo || !!blocked}
					onclick={() => fileInput?.click()}
					><Upload size={16} />{working === 'reading'
						? t('fixFrames.reading')
						: t(item.layers.length > 1 ? 'fixFrames.importFiles' : 'fixFrames.import')}</button
				>
			{/if}
		{/if}
	{/snippet}
</Sheet>

{#if confirmRestore && item}
	<ConfirmDialog
		title={t('fixFrames.restoreTitle', { count: restorable, n: formatNumber(restorable) })}
		action={t('fixFrames.restoreAction')}
		{busy}
		oncancel={() => (confirmRestore = false)}
		onconfirm={() => void restore()}><p>{t('fixFrames.restoreBody', { name })}</p></ConfirmDialog
	>
{/if}

<style>
	.frames {
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.pickers {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pickers :global(.paste-end) {
		margin-inline-start: auto;
		align-self: center;
	}
	.pickers select {
		width: auto;
		min-width: 0;
		max-width: 100%;
	}
	.summary {
		margin: 0;
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: auto repeat(var(--cols), max-content);
		gap: 4px;
		align-items: center;
		justify-content: start;
		overflow-x: auto;
		padding: 2px;
	}
	.num,
	.dir,
	.mirror-note {
		font-size: 0.75rem;
		color: var(--text-2);
		text-align: center;
	}
	.mirror-note {
		grid-column: 2 / -1;
		text-align: start;
	}
	.tile {
		position: relative;
		display: grid;
		place-items: center;
		padding: 2px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
	}
	.tile.mirror {
		opacity: 0.45;
	}
	button.tile.changed {
		border-color: var(--accent);
		cursor: pointer;
	}
	button.tile[aria-pressed='true'] {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
	}
	.compare {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.compare figure {
		margin: 0;
		display: grid;
		justify-items: center;
		gap: 4px;
	}
	.compare figcaption {
		font-size: 0.8rem;
	}
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.notes li {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}
	.drop-note {
		margin: 0;
		font-weight: 600;
	}
	.demo {
		display: grid;
	}
</style>
