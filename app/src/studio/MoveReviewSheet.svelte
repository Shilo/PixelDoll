<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { ChevronLeft, ChevronRight, Pause, Play, Shirt } from './icons.ts';
	import { displayDirection, displayDirectionShort } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { bodyQualityNote, thumbCell } from './model.ts';
	import { croppedBacking, croppedThumbnail } from './experience/thumbnails.svelte.ts';
	import {
		itemMoveOffer,
		missingItemMoves,
		moveMinimumTier,
		readMoveCandidateImages
	} from './create.ts';
	import { affectedMoveDirections, moveCandidateInput } from './replaceMove.ts';
	import { formDrafts } from './formDrafts.ts';
	import {
		doc,
		moveReviewBlocked,
		openProject,
		queueMoves,
		refreshMoveReviews,
		saveReviewedMove,
		store,
		ui,
		withKey
	} from './state.svelte.ts';
	import { app } from '../lib/app.svelte.ts';
	import { tierDecision } from '../lib/pixellab/plans.ts';
	import { displayError } from '../lib/i18n.ts';
	import type { Img } from '../lib/image/png.ts';
	import type { DirectionName } from '../lib/rig/rig.ts';

	const projectId = untrack(() => doc.id);
	const id = untrack(() => ui.moveReview);
	const candidate = untrack(() =>
		Object.hasOwn(store.moveReviews, id) ? store.moveReviews[id] : undefined
	);
	const project = $derived(doc.id === projectId ? store.project : null);
	const manifest = $derived(project?.manifest);
	const name = $derived(
		displayMove(id, [...(manifest?.rig.animations.map((move) => move.id) ?? []), id])
	);
	const directions = $derived.by(() => {
		if (!manifest || !candidate) return [];
		const affected = affectedMoveDirections(manifest.rig, candidate.dirs);
		return manifest.rig.directions.filter(
			({ id }) => affected.includes(id) && candidate.cells[id]?.some(Boolean)
		);
	});
	let direction = $state<DirectionName | null>(null);
	const facing = $derived(direction ?? directions[0]?.id);
	const playlist = candidate?.animation.frames ?? [];
	let frame = $state(0);
	let playing = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	let images = $state.raw<Map<string, Img> | null>(null);
	let busy = $state(false);
	let itemsStep = $state(false);
	let acceptedInput = $state<string>();
	let error = $state('');
	let selected = $state<string[]>([]);
	let itemList = $state<HTMLDivElement>();
	const currentImage = $derived(
		facing && playlist[frame]
			? (images?.get(candidate?.cells[facing]?.[playlist[frame].cell] ?? '') ?? null)
			: null
	);
	const hardFailure = !!candidate?.itemsBlocked;
	const blocked = $derived(moveReviewBlocked(projectId));
	const hasItems = $derived(!!manifest?.items.some((item) => item.id !== manifest.rig.baseItem));
	const changed = $derived(
		itemsStep &&
			(!store.exportRecord ||
				store.exportRecord.id !== projectId ||
				moveCandidateInput(store.exportRecord, id) !== acceptedInput)
	);
	const equipment = $derived.by(() => {
		if (!itemsStep || !project || !candidate || changed) return [];
		return project.manifest.items
			.filter((item) => item.id !== project.manifest.rig.baseItem)
			.map((item) => {
				const spec = missingItemMoves(project.manifest, item.id, candidate.spec.seed).find(
					(move) => move.id === id
				);
				const dirs = spec?.dirs?.filter(
					(dir) => candidate.dirs.includes(dir) && item.dressed?.[dir]
				);
				const offer =
					spec && dirs?.length
						? itemMoveOffer(project.manifest, [{ ...spec, dirs, reviewedMoveItems: true }])
						: null;
				const thumb = thumbCell(project, item);
				return { item, image: thumb && croppedThumbnail(thumb), offer };
			});
	});
	const chosen = $derived(
		equipment.filter(({ item, offer }) => offer?.specs.length && selected.includes(item.id))
	);
	const total = $derived(chosen.reduce((sum, row) => sum + (row.offer?.gens ?? 0), 0));
	const specs = $derived(chosen.flatMap(({ offer }) => offer?.specs ?? []));
	const access = $derived.by(() => {
		try {
			const minimumTier = manifest
				? Math.max(0, ...specs.map((spec) => moveMinimumTier(manifest, spec)))
				: 0;
			return {
				minimumTier,
				error:
					tierDecision(app.balance, { required: minimumTier }).kind === 'required'
						? t('moveSheet.checkpoint.tier')
						: ''
			};
		} catch (cause) {
			return { minimumTier: 0, error: displayError(cause) };
		}
	});

	onMount(() => {
		if (!candidate) return;
		let current = true;
		void readMoveCandidateImages(candidate)
			.then((result) => {
				if (current) images = result;
			})
			.catch((cause) => {
				if (current) error = displayError(cause);
			});
		return () => {
			current = false;
		};
	});
	$effect(() => {
		if (!playing || itemsStep || !images || playlist.length < 2) return;
		const next = (frame + 1) % playlist.length;
		const timer = setTimeout(() => (frame = next), playlist[frame].ms);
		return () => clearTimeout(timer);
	});

	function step(delta: number) {
		playing = false;
		frame = (frame + delta + playlist.length) % playlist.length;
	}
	function regenerate() {
		if (!candidate || blocked) return;
		const { spec } = candidate;
		formDrafts.move = {
			projectId,
			reopen: true,
			regeneration: { id, seed: spec.seed, activityScope: spec.activityScope },
			action: spec.replace ? id : (spec.action ?? ''),
			replace: !!spec.replace,
			text: spec.text ?? '',
			dirs: candidate.dirs,
			animation: spec.animation
		};
		ui.sheet = 'move';
	}
	async function decide(accept: boolean, choose = false) {
		if (busy || blocked || !candidate || !project || (accept && (!images || hardFailure))) return;
		busy = true;
		error = '';
		try {
			const input = await saveReviewedMove(projectId, candidate, accept);
			const current = () =>
				doc.id === projectId && ui.sheet === 'moveReview' && ui.moveReview === id;
			if (!current()) return;
			if (!accept) {
				await refreshMoveReviews(projectId);
				if (current()) ui.sheet = null;
				return;
			}
			await openProject(projectId, { quiet: true });
			if (!current()) return;
			ui.anim = id;
			ui.frame = 0;
			if (choose) {
				acceptedInput = input;
				itemsStep = true;
				await tick();
				itemList?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
			} else ui.sheet = null;
		} catch (cause) {
			error = displayError(cause);
		} finally {
			busy = false;
		}
	}
	function animate() {
		if (busy || !specs.length || access.error) return;
		const approved = $state.snapshot(specs);
		withKey(() => {
			if (doc.id !== projectId || busy) return;
			busy = true;
			void queueMoves(projectId, approved);
			ui.sheet = 'move';
		}, access.minimumTier);
	}
</script>

{#snippet foot()}
	{#if itemsStep}
		<div class="checkpoint-total" aria-live="polite" aria-atomic="true">
			<b>{t('moveSheet.checkpoint.total', { gens: formatNumber(total) })}</b>
			<span class="muted small"
				>{t('moveSheet.checkpoint.count', { count: formatNumber(chosen.length) })}</span
			>
		</div>
		<button
			class="bu-action btn primary checkpoint-animate"
			data-variant="primary"
			disabled={busy || !specs.length || !!access.error}
			onclick={animate}
		>
			{t('moveSheet.checkpoint.animate')}
		</button>
	{:else if candidate && !hardFailure}
		<div class="checkpoint-actions">
			<button
				class="bu-action btn"
				data-variant={hasItems ? 'outline' : 'primary'}
				disabled={busy || !!blocked || !images}
				onclick={() => void decide(true)}>{t('moveSheet.checkpoint.keep')}</button
			>
			{#if hasItems}
				<button
					class="bu-action btn primary"
					data-variant="primary"
					disabled={busy || !!blocked || !images}
					onclick={() => void decide(true, true)}>{t('moveSheet.checkpoint.choose')}</button
				>
			{/if}
		</div>
	{/if}
{/snippet}

<Sheet
	title={t(itemsStep ? 'moveSheet.checkpoint.titleItems' : 'moveSheet.checkpoint.review')}
	cancel="common.close"
	cancelDisabled={busy}
	onclose={() => (ui.sheet = null)}
	footer={itemsStep || (candidate && !hardFailure) ? foot : undefined}
>
	{#if error}<p class="notice bad small" role="alert">{error}</p>{/if}
	{#if changed}
		<p class="notice small">{t('moveSheet.checkpoint.changed')}</p>
	{:else if itemsStep}
		<p class="muted small checkpoint-note">{t('moveSheet.checkpoint.chooseFor', { move: name })}</p>
		<div
			class="checkpoint-items"
			bind:this={itemList}
			role="group"
			aria-label={t('moveSheet.checkpoint.titleItems')}
		>
			{#each equipment as { item, image, offer } (item.id)}
				<button
					class="bu-action checkpoint-item"
					data-variant="tile"
					disabled={busy || !offer?.specs.length}
					aria-pressed={selected.includes(item.id)}
					onclick={() =>
						(selected = selected.includes(item.id)
							? selected.filter((value) => value !== item.id)
							: [...selected, item.id])}
				>
					<span class="checkpoint-thumb" aria-hidden="true">
						{#if image}<Sprite
								img={image}
								k={croppedBacking(42, image, ui.dpr)}
								fitToBox={image.w > 42 || image.h > 42}
								label=""
							/>{:else}<Shirt size={20} />{/if}
					</span>
					<span class="checkpoint-name"
						><b>{item.name}</b>{#if selected.includes(item.id)}<span
								class="small"
								aria-hidden="true">{t('moveSheet.checkpoint.selected')}</span
							>{/if}</span
					>
					<span class="muted small checkpoint-price"
						>{offer?.gens != null
							? t('generationDetails.gens', { value: formatNumber(offer.gens) })
							: t('moveSheet.checkpoint.unavailable')}</span
					>
				</button>
			{/each}
		</div>
		{#if access.error}<p class="notice warn small" role="status">{access.error}</p>{/if}
		<p class="muted small checkpoint-note">{t('moveSheet.costNotice')}</p>
	{:else if candidate}
		<div class="checkpoint-stage" aria-busy={!images && !error}>
			{#if currentImage && facing}<Sprite
					img={currentImage}
					k={croppedBacking(192, currentImage, ui.dpr)}
					limit={192}
					label={t('moves.preview', { move: name }) + ', ' + displayDirection(facing)}
				/>
			{:else if !error}<span class="muted small">{t('stage.loading')}</span>{/if}
		</div>
		<div class="checkpoint-controls">
			<div class="checkpoint-group" role="group" aria-label={t('stage.previewControls')}>
				<button
					class="bu-action btn"
					data-variant="quiet"
					disabled={!images || playlist.length < 2}
					aria-label={t(playing ? 'common.pause' : 'common.play')}
					onclick={() => (playing = !playing)}
					>{#if playing}<Pause size={17} />{:else}<Play size={17} />{/if}</button
				>
				<button
					class="bu-action btn"
					data-variant="quiet"
					disabled={!images || playlist.length < 2}
					aria-label={t('stage.previousFrame')}
					onclick={() => step(-1)}><ChevronLeft size={17} /></button
				>
				<span class="small muted checkpoint-frame"
					>{t('stage.framePosition', {
						frame: formatNumber(frame + 1),
						total: formatNumber(playlist.length)
					})}</span
				>
				<button
					class="bu-action btn"
					data-variant="quiet"
					disabled={!images || playlist.length < 2}
					aria-label={t('stage.nextFrame')}
					onclick={() => step(1)}><ChevronRight size={17} /></button
				>
			</div>
			<div
				class="checkpoint-group checkpoint-directions"
				role="group"
				aria-label={t('common.directions')}
			>
				{#each directions as option (option.id)}<button
						class="bu-action btn"
						data-variant="outline"
						aria-pressed={facing === option.id}
						aria-label={displayDirection(option.id)}
						onclick={() => (direction = option.id)}>{displayDirectionShort(option.id)}</button
					>{/each}
			</div>
		</div>
		<p class="checkpoint-note muted small">
			{t(
				candidate.spec.replace
					? 'moveSheet.checkpoint.replaceNote'
					: 'moveSheet.checkpoint.reviewNote',
				{ move: name }
			)}
		</p>
		{#if candidate.warnings.length}
			<details class="disclosure" open={hardFailure}>
				<summary><ChevronRight size={14} />{t('moveSheet.checkpoint.findings')}</summary>
				<ul>
					{#each candidate.warnings as warning, index (index)}<li>
							{bodyQualityNote(warning, t)}
						</li>{/each}
				</ul>
			</details>
		{/if}
		{#if hardFailure}<p class="notice warn small">{t('moveSheet.checkpoint.hardFailure')}</p>{/if}
		{#if blocked && !busy}<p class="notice small" role="status">{t(blocked)}</p>{/if}
		<div class="checkpoint-actions checkpoint-alternatives">
			<button
				class="bu-action btn"
				data-variant={hardFailure ? 'outline' : 'quiet'}
				disabled={busy || !!blocked}
				onclick={regenerate}
			>
				{t('moveSheet.checkpoint.regenerate')}
			</button>
			<button
				class="bu-action btn"
				data-variant="quiet"
				disabled={busy || !!blocked}
				onclick={() => void decide(false)}
			>
				{t(candidate.spec.replace ? 'moveSheet.checkpoint.keepCurrent' : 'common.discard')}
			</button>
		</div>
	{:else}
		<p class="notice small">{t('moveSheet.checkpoint.changed')}</p>
	{/if}
</Sheet>

<style>
	.checkpoint-stage {
		display: grid;
		place-items: center;
		min-height: 208px;
		background: var(--stage);
		border-radius: var(--r-ctl);
	}
	.checkpoint-controls {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 6px 12px;
		margin-top: 8px;
	}
	.checkpoint-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.checkpoint-controls button {
		min-width: 44px;
		min-height: 44px;
		padding-inline: 6px;
	}
	.checkpoint-directions {
		flex-wrap: wrap;
		gap: 4px;
	}
	.checkpoint-frame,
	.checkpoint-price,
	.checkpoint-total {
		font-variant-numeric: tabular-nums;
	}
	.checkpoint-note {
		margin-block: 10px;
	}
	.checkpoint-items {
		display: grid;
		gap: 6px;
	}
	.checkpoint-item {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) auto;
		align-items: center;
		text-align: start;
		gap: 10px;
		min-height: 54px;
		padding: 5px 10px 5px 7px;
		width: 100%;
	}
	.checkpoint-thumb {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
	}
	.checkpoint-name {
		display: grid;
		overflow-wrap: anywhere;
	}
	.checkpoint-price {
		text-align: end;
	}
	.checkpoint-total {
		display: grid;
		margin-inline-end: auto;
	}
	:global(dialog.sheet.bottom) .checkpoint-animate {
		order: -1;
	}
	.checkpoint-actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 6px;
		width: 100%;
	}
	.checkpoint-alternatives {
		justify-content: flex-start;
	}
</style>
