<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import ProblemNotice from './ProblemNotice.svelte';
	import Sheet from './Sheet.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import PromptLine from './PromptLine.svelte';
	import Sprite from './Sprite.svelte';
	import { ChevronLeft, ChevronRight, Pause, Play, Shirt } from './icons.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { bodyQualityNote, thumbCell } from './model.ts';
	import { croppedBacking, croppedThumbnail } from './experience/thumbnails.svelte.ts';
	import {
		itemMoveOffer,
		missingItemMoves,
		moveMinimumTier,
		readMoveCandidateImages,
		skeletonMoveReview
	} from './create.ts';
	import { moveAnimationModel, moveFrames } from './movePricing.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { moveTemplatePrompt } from './moveAnimationOptions.ts';
	import {
		moveCandidateHasStructuralFailure,
		moveCandidateInput,
		movePlaybackChanged
	} from './replaceMove.ts';
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
	import { flipH } from '../lib/rig/mirror.ts';
	import type { Img } from '../lib/image/png.ts';
	import type { ImageReference } from '../lib/image/reference.ts';
	import type { DirectionName } from '../lib/rig/rig.ts';

	const projectId = untrack(() => doc.id);
	const id = untrack(() => ui.moveReview);
	const candidate = untrack(() =>
		Object.hasOwn(store.moveReviews, id) ? store.moveReviews[id] : undefined
	);
	const project = $derived(doc.id === projectId ? store.project : null);
	const manifest = $derived(project?.manifest);
	const name = $derived(displayMove(id, [...(manifest?.rig.animations ?? []), id]));
	const directions = $derived.by(() => {
		if (!manifest || !candidate) return [];
		return manifest.rig.directions.filter(
			({ id, mirrorOf }) =>
				candidate.cells[id]?.some(Boolean) || (mirrorOf && candidate.cells[mirrorOf]?.some(Boolean))
		);
	});
	let direction = $state<DirectionName | null>(null);
	const facing = $derived(
		direction ?? directions.find(({ id }) => candidate?.dirs.includes(id))?.id ?? directions[0]?.id
	);
	const mirrors = $derived(
		Object.fromEntries(directions.flatMap(({ id, mirrorOf }) => (mirrorOf ? [[id, mirrorOf]] : [])))
	);
	const playlist = candidate?.animation.frames ?? [];
	let frame = $state(0);
	let playing = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	let images = $state.raw<Map<string, Img> | null>(null);
	let busy = $state(false);
	let itemsStep = $state(false);
	let acceptedInput = $state<string>();
	let error = $state<unknown>();
	let selected = $state<string[]>([]);
	let itemList = $state<HTMLDivElement>();
	const currentImage = $derived.by(() => {
		const cell = playlist[frame]?.cell;
		if (!facing || cell == null || !images || !candidate) return null;
		const stored = images.get(candidate.cells[facing]?.[cell] ?? '');
		if (stored) return stored;
		const source = mirrors[facing];
		const original = source && images.get(candidate.cells[source]?.[cell] ?? '');
		return original ? flipH(original) : null;
	});
	const hardFailure = !!candidate && moveCandidateHasStructuralFailure(candidate);
	const blocked = $derived(moveReviewBlocked(projectId));
	const skeletonOffer = $derived.by(() => {
		const record = store.exportRecord;
		if (
			!candidate ||
			record?.id !== projectId ||
			moveCandidateInput(record, id) !== candidate.input
		)
			return;
		const offer = skeletonMoveReview(record, candidate.spec, undefined, [], candidate);
		if (offer && tierDecision(app.balance, { required: offer.tier }).kind !== 'required')
			return offer;
	});
	const changed = $derived(
		!!acceptedInput &&
			(!store.exportRecord ||
				store.exportRecord.id !== projectId ||
				moveCandidateInput(store.exportRecord, id) !== acceptedInput)
	);
	const equipment = $derived.by(() => {
		if (!acceptedInput || !project || !candidate || changed) return [];
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
				if (current) error = cause;
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
	function regenerate(skeletonRetry?: typeof skeletonOffer) {
		if (!candidate || blocked) return;
		const { spec } = candidate;
		const animation = skeletonRetry?.review.animation;
		const saved = manifest?.rig.animations.find((move) => move.id === id);
		const picked = (reference: ImageReference, kind: 'startFrame' | 'endFrame') => ({
			...reference,
			name: t(kind === 'startFrame' ? 'moveSheet.startFrame' : 'moveSheet.endFrame'),
			previewBox: `0 0 ${reference.width} ${reference.height}`
		});
		formDrafts.move = {
			projectId,
			reopen: true,
			regeneration: { id, seed: spec.seed, activityScope: spec.activityScope },
			skeletonRetry,
			action: spec.replace ? id : (spec.action ?? ''),
			replace: !!spec.replace,
			text:
				skeletonRetry?.review.text ??
				spec.text ??
				moveTemplatePrompt(spec.action ?? id, !!(animation?.loop ?? spec.animation?.loop)),
			dirs: candidate.dirs,
			source:
				spec.startFrom && !spec.startFrom.replacement
					? { clip: spec.startFrom.clip, cell: spec.startFrom.cell }
					: skeletonRetry && !spec.startFrom && spec.replace
						? { clip: DEFAULT_MOVE }
						: undefined,
			animation: animation ??
				spec.animation ?? {
					model: moveAnimationModel(spec),
					frameCount: manifest ? moveFrames(manifest, spec) : undefined
				},
			loop: movePlaybackChanged(candidate.basePlayback, saved)
				? (saved?.moveLoop ?? saved?.loop)
				: (animation?.loop ?? spec.animation?.loop),
			frameReferences: Object.fromEntries(
				Object.entries(spec.animation?.references ?? {}).map(([dir, { start, end }]) => [
					dir,
					{ start: start && picked(start, 'startFrame'), end: end && picked(end, 'endFrame') }
				])
			)
		};
		ui.sheet = 'move';
	}
	async function decide(accept: boolean) {
		if (busy || blocked || !candidate || !project || (accept && (!images || hardFailure))) return;
		busy = true;
		error = undefined;
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
			acceptedInput = input;
			if (changed || equipment.some(({ offer }) => offer?.specs.length)) itemsStep = true;
			else ui.sheet = null;
		} catch (cause) {
			error = cause;
		} finally {
			busy = false;
		}
		if (itemsStep) {
			await tick();
			itemList?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
		}
	}
	function animate() {
		if (busy || ui.waitingForTab || !specs.length || access.error) return;
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
	<div class="checkpoint-footer">
		{#if itemsStep}
			<p class="muted small checkpoint-note" id="move-item-cost">{t('moveSheet.costNotice')}</p>
			<div class="checkpoint-actions checkpoint-item-actions">
				<b class="checkpoint-total" aria-live="polite" aria-atomic="true"
					>{t('moveSheet.checkpoint.total', { gens: formatNumber(total) })}</b
				>
				<button
					class="bu-action btn primary checkpoint-primary"
					data-variant="primary"
					disabled={busy || ui.waitingForTab || !specs.length || !!access.error}
					aria-describedby="move-item-cost"
					onclick={animate}
				>
					{chosen.length
						? t('moveSheet.checkpoint.animateCount', {
								count: chosen.length,
								n: formatNumber(chosen.length)
							})
						: t('moveSheet.checkpoint.titleItems')}
				</button>
			</div>
		{:else if candidate}
			{#if candidate.spec.replace && !hardFailure}
				<p class="muted small checkpoint-note" id="move-replace-note">
					{t('moveSheet.checkpoint.replaceNote', { move: name })}
				</p>
			{/if}
			<div class="checkpoint-actions">
				<button
					class="bu-action btn checkpoint-discard"
					data-variant="quiet"
					disabled={busy || !!blocked}
					onclick={() => void decide(false)}>{t('moveSheet.checkpoint.discardDraft')}</button
				>
				<button
					class={['bu-action btn', { 'primary checkpoint-primary': hardFailure }]}
					data-variant={hardFailure ? 'primary' : 'outline'}
					disabled={busy || !!blocked}
					onclick={() => regenerate()}>{t('moveSheet.checkpoint.regenerate')}</button
				>
				{#if !hardFailure}
					<button
						class="bu-action btn primary checkpoint-primary"
						data-variant="primary"
						disabled={busy || !!blocked || !images}
						aria-describedby={[
							candidate.spec.replace && 'move-replace-note',
							candidate.warnings.length && 'move-quality-notes'
						]
							.filter(Boolean)
							.join(' ') || undefined}
						onclick={() => void decide(true)}
						>{t(
							candidate.spec.replace ? 'moveSheet.checkpoint.replace' : 'moveSheet.checkpoint.save'
						)}</button
					>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<Sheet
	title={t(itemsStep ? 'moveSheet.checkpoint.titleItems' : 'moveSheet.checkpoint.review')}
	locked={busy}
	className={itemsStep ? '' : 'move-review'}
	onclose={() => (ui.sheet = null)}
	footer={candidate ? foot : undefined}
>
	{#if error}<ProblemNotice {error} />{/if}
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
					disabled={busy || ui.waitingForTab || !offer?.specs.length}
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
	{:else if candidate}
		{#if candidate.warnings.length}
			<div class="notice warn small quality-notice">
				<details class="disclosure" open={hardFailure}>
					<summary id="move-quality-notes"
						><ChevronRight size={14} />{t('moveSheet.checkpoint.findings')}</summary
					>
					<ul>
						{#each candidate.warnings as warning, index (index)}<li>
								{bodyQualityNote(warning, t)}
							</li>{/each}
					</ul>
				</details>
				{#if skeletonOffer}
					<p>{t('moveSheet.skeleton.hint')}</p>
					<button
						class="bu-action btn"
						data-variant="outline"
						disabled={busy || !!blocked}
						onclick={() => regenerate(skeletonOffer)}
					>
						{t('moveSheet.skeleton.title')}
						<span class="cost"
							>{t('moves.estimate', {
								gens: formatNumber(Math.ceil(skeletonOffer.estimate.gens))
							})}</span
						>
					</button>
				{/if}
			</div>
		{/if}
		<div class="checkpoint-preview">
			<div class="checkpoint-motion">
				<div class="checkpoint-stage" aria-busy={!images && !error}>
					{#if currentImage && facing}<span class="checkpoint-cell"
							><Sprite
								img={currentImage}
								k={croppedBacking(280, currentImage, ui.dpr)}
								fitToBox
								checker
								label={t('moves.preview', { move: name }) + ', ' + displayDirection(facing)}
							/></span
						>
					{:else if !error}<span class="muted small">{t('stage.loading')}</span>{/if}
				</div>
				{#if images && playlist.length > 1}
					<div class="checkpoint-group" role="group" aria-label={t('stage.previewControls')}>
						<button
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label={t(playing ? 'common.pause' : 'common.play')}
							title={t(playing ? 'common.pause' : 'common.play')}
							onclick={() => (playing = !playing)}
							>{#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}</button
						>
						<button
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label={t('stage.previousFrame')}
							title={t('stage.previousFrame')}
							onclick={() => step(-1)}><ChevronLeft size={16} /></button
						>
						<span class="small muted checkpoint-frame"
							>{t('stage.framePosition', {
								frame: formatNumber(frame + 1),
								total: formatNumber(playlist.length)
							})}</span
						>
						<button
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label={t('stage.nextFrame')}
							title={t('stage.nextFrame')}
							onclick={() => step(1)}><ChevronRight size={16} /></button
						>
					</div>
				{/if}
			</div>
			{#if directions.length}
				<DirectionCompass
					label={t('common.directions')}
					available={directions.map(({ id }) => id)}
					selected={facing ? [facing] : []}
					{mirrors}
					compact
					preview
					ontoggle={(option) => (direction = option)}
				/>
			{/if}
		</div>
		<PromptLine
			text={candidate.spec.text ??
				moveTemplatePrompt(candidate.spec.action ?? id, !!candidate.spec.animation?.loop)}
		/>
		{#if !candidate.spec.replace && !hardFailure}
			<p class="checkpoint-note muted small">
				{t('moveSheet.checkpoint.reviewNote', { move: name })}
			</p>
		{/if}
		{#if hardFailure}<p class="notice warn small">{t('moveSheet.checkpoint.hardFailure')}</p>{/if}
		{#if blocked && !busy}<p class="notice small" role="status">{t(blocked)}</p>{/if}
	{:else}
		<p class="notice small">{t('moveSheet.checkpoint.changed')}</p>
	{/if}
</Sheet>

<style>
	/* Notes, the Skeleton V3 hint and its button stack so the narrow review keeps them readable. */
	.quality-notice {
		display: grid;
		justify-items: start;
		gap: 8px;
	}
	.quality-notice p {
		margin: 0;
	}
	/* The stage is exactly the square stored cell, so the review has no letterbox bars. */
	:global(dialog.sheet.center.move-review) {
		width: min(480px, calc(100vw - 32px));
	}
	.checkpoint-stage {
		display: grid;
		place-items: center;
		justify-self: center;
		inline-size: 240px;
		aspect-ratio: 1;
		overflow: hidden;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	.checkpoint-cell {
		display: grid;
		inline-size: 100%;
		block-size: 100%;
	}
	.checkpoint-preview {
		display: grid;
		grid-template-columns: auto auto;
		justify-content: center;
		align-items: center;
		gap: 16px;
	}
	.checkpoint-group {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
		margin-top: 4px;
	}
	.checkpoint-group button {
		min-width: 44px;
		min-height: 44px;
		padding-inline: 6px;
	}
	.checkpoint-frame,
	.checkpoint-price,
	.checkpoint-total {
		font-variant-numeric: tabular-nums;
	}
	.checkpoint-note {
		margin-block: 10px;
	}
	.checkpoint-footer {
		display: grid;
		gap: 8px;
		width: 100%;
	}
	.checkpoint-footer .checkpoint-note {
		margin: 0;
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
		max-inline-size: 9ch;
		overflow-wrap: anywhere;
	}
	.checkpoint-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 6px;
		width: 100%;
	}
	.checkpoint-item-actions {
		justify-content: space-between;
	}
	.checkpoint-discard {
		margin-inline-end: auto;
	}
	.checkpoint-actions button {
		min-block-size: 44px;
		max-inline-size: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
	}
	:global(dialog.sheet.bottom) .checkpoint-actions .btn.checkpoint-primary {
		width: auto;
	}
	@media (max-width: 599px) and (orientation: portrait) {
		.checkpoint-preview {
			grid-template-columns: minmax(0, 1fr);
			justify-items: center;
			gap: 8px;
		}
		.checkpoint-motion {
			width: 100%;
		}
		.checkpoint-stage {
			inline-size: min(100%, 280px, 36dvh);
		}
	}
	@media (orientation: landscape) and (max-height: 499px) {
		.checkpoint-stage {
			inline-size: 144px;
		}
	}
	@media (max-width: 680px) and (orientation: landscape) and (max-height: 499px) {
		.checkpoint-preview {
			column-gap: 8px;
			row-gap: 4px;
		}
		.checkpoint-motion {
			display: contents;
		}
		.checkpoint-group {
			grid-column: 1 / -1;
			grid-row: 2;
			margin-top: 0;
		}
		.checkpoint-actions button {
			padding-inline: 8px;
		}
	}
	@media (max-width: 365px) {
		.checkpoint-actions:not(.checkpoint-item-actions) .checkpoint-primary {
			flex-basis: 100%;
		}
	}
</style>
