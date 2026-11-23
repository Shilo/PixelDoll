<script lang="ts">
	import { formatNumber, t } from 'svelte-whisper';
	import ProblemNotice from './ProblemNotice.svelte';
	import { cellImg } from '../lib/compose/compose.ts';
	import type { Img } from '../lib/image/png.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { flipH } from '../lib/rig/mirror.ts';
	import { DIRECTIONS, type DirectionName } from '../lib/rig/rig.ts';
	import DirectionCompass from './DirectionCompass.svelte';
	import { displayDirection } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import { RIDING_STATE } from './experience/presentation.ts';
	import { moveLabel } from './model.ts';
	import PromptLine from './PromptLine.svelte';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { doc, store, ui } from './state.svelte.ts';
	import {
		discardState,
		hasStateContinuation,
		pendingState,
		quoteStateContinuation,
		saveState,
		type StateContinuationQuote,
		type StateReview
	} from './stateGeneration.ts';
	import { stateCostText } from './stateCost.ts';
	import { stateGenerationSource } from './stateGenerationSource.ts';
	import {
		continueStateRun,
		refreshStateAttempts,
		stateProgress,
		stateRuns,
		stateStatusText
	} from './stateJobs.svelte.ts';

	const formId = $props.id();
	const projectId = doc.id;
	const token = ui.stateReview;

	const project = $derived(doc.id === projectId ? store.project : null);
	const manifest = $derived(project?.manifest);
	const clipIds = $derived(manifest?.rig.animations.map(({ id }) => id) ?? []);
	const body = $derived(manifest?.items.find(({ id }) => id === manifest.rig.baseItem)?.layers[0]);
	const clipName = (id: string) => displayMove(id, clipIds);

	const attempt = $derived(doc.id === projectId ? store.stateAttempts[token] : undefined);
	const progress = $derived(attempt && stateProgress(attempt, $queue.jobs));
	const status = $derived(progress?.status);
	const runError = $derived(progress?.error);

	let busy = $state<'common.loading' | 'stateGeneration.quoting' | 'stateCapture.saving' | null>(
		null
	);
	let failure = $state<Message | string>('');
	let review = $state.raw<StateReview | null>(null);
	let reviewFacing = $state<DirectionName | null>(null);
	let keepGrounded = $state(true);
	let confirmDiscard = $state(false);
	let canContinue = $state(false);
	let continuation = $state.raw<StateContinuationQuote | null>(null);
	// Read the result once each time the attempt settles; Try again reads it again.
	let loadedFor = $state('');

	// Grounded views by default; the user can keep PixelLab's placement, e.g. for a jump.
	const reviewed = $derived.by(() => {
		const current = review;
		if (!current || keepGrounded) return current;
		return {
			...current,
			views: current.views.map((view) => ({
				...view,
				image: current.ungrounded[view.direction] ?? view.image
			}))
		};
	});
	let reviewHeading = $state<HTMLElement>();
	let focusedReview = '';
	$effect(() => {
		const current = review?.token;
		if (!reviewHeading || !current || current === focusedReview) return;
		focusedReview = current;
		reviewHeading.focus();
	});
	// Mounted riding uses the State saved as `riding`, whatever prompt made it.
	const reviewRiding = $derived(!!review?.riding || review?.id === RIDING_STATE);
	const reviewSource = $derived(review && project && stateGenerationSource(project, review.source));
	const sourceCurrent = $derived(!!review && reviewSource?.version === review.sourceVersion);
	// Every facing the saved State will have: generated views plus the rig's mirrors of them.
	const reviewViews = $derived.by(() => {
		const current = reviewed;
		if (!current || !project || !body) return [];
		const generated = new Map(current.views.map(({ direction, image }) => [direction, image]));
		const sent = new Map(
			sourceCurrent
				? (reviewSource?.views.map(({ direction, image }) => [direction, image]) ?? [])
				: []
		);
		return project.manifest.rig.directions
			.filter(({ id, mirrorOf }) => generated.has(id) || (mirrorOf && generated.has(mirrorOf)))
			.sort((left, right) => DIRECTIONS.indexOf(left.id) - DIRECTIONS.indexOf(right.id))
			.map(({ id, mirrorOf }) => ({
				direction: id,
				mirrorOf: generated.has(id) ? undefined : mirrorOf,
				image: generated.get(id) ?? flipH(generated.get(mirrorOf!)!),
				source: sent.get(id) ?? (mirrorOf && sent.has(mirrorOf) ? flipH(sent.get(mirrorOf)!) : null)
			}));
	});
	// Starts on the Studio facing, else the first view in compass order.
	const view = $derived(
		reviewViews.find(({ direction }) => direction === reviewFacing) ??
			reviewViews.find(({ direction }) => direction === ui.dir) ??
			reviewViews[0]
	);
	const reviewMirrors = $derived(
		Object.fromEntries(
			reviewViews.flatMap(({ direction, mirrorOf }) => (mirrorOf ? [[direction, mirrorOf]] : []))
		)
	);
	// While it generates, the source frame stands in for the result.
	const sourcePreview = $derived.by((): Img | null => {
		if (!attempt || !project || !body) return null;
		const clip = project.manifest.rig.animations.find(({ id }) => id === attempt.source.clip);
		const cell = clip?.frames[attempt.source.frame]?.cell;
		if (cell === undefined) return null;
		return cellImg(project, body, attempt.source.clip, ui.dir, cell) ?? null;
	});
	const discardable = $derived(
		!review &&
			(canContinue ||
				(typeof failure !== 'string' &&
					(failure.key === 'stateGeneration.unfinished' ||
						failure.key === 'stateGeneration.invalidResult' ||
						failure.key === 'stateGeneration.outdated')))
	);

	$effect(() => {
		// Saved or discarded here or in another tab: nothing is left to review.
		if (!attempt && !busy) ui.sheet = null;
	});
	$effect(() => {
		const settled = status === 'ready' || status === 'attention';
		const key = `${status}:${runError ? 'error' : ''}`;
		if (!settled || busy || review || loadedFor === key) return;
		loadedFor = key;
		void load();
	});

	async function run(action: NonNullable<typeof busy>, work: () => Promise<void>) {
		if (busy) return;
		busy = action;
		failure = '';
		try {
			await work();
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			busy = null;
		}
	}

	function load() {
		confirmDiscard = false;
		continuation = null;
		return run('common.loading', async () => {
			canContinue = false;
			try {
				review = await pendingState(projectId, token);
				// Saved or discarded in another tab: refreshing the list closes this sheet.
				if (!review) return void (await refreshStateAttempts(projectId));
				reviewFacing = null;
				keepGrounded = true;
			} catch (cause) {
				canContinue = await hasStateContinuation(projectId, token).catch(() => false);
				if (!canContinue) throw cause;
			}
		});
	}

	function checkContinuationCost() {
		void run('stateGeneration.quoting', async () => {
			continuation = await quoteStateContinuation(projectId, token);
		});
	}

	// Like the first run it carries on in the background: this sheet can close, and reloads the result when it settles.
	function generateRemaining() {
		const approved = continuation;
		if (!approved || !attempt || busy) return;
		continuation = null;
		canContinue = false;
		failure = '';
		loadedFor = '';
		continueStateRun(approved, attempt.id);
	}

	function save() {
		if (!reviewed) return;
		const pending = reviewed;
		void run('stateCapture.saving', async () => {
			await saveState(pending, reviewRiding);
			delete stateRuns[token];
			await refreshStateAttempts(projectId);
		});
	}

	function discard() {
		if (!confirmDiscard) {
			confirmDiscard = true;
			return;
		}
		void run('common.loading', async () => {
			await discardState(projectId, token);
			delete stateRuns[token];
			await refreshStateAttempts(projectId);
		});
	}
</script>

{#snippet cell(image: Img | null, box: number, label: string)}
	<Sprite img={image} k={image ? croppedBacking(box, image, ui.dpr) : 1} fitToBox checker {label} />
{/snippet}

<Sheet
	title={attempt ? moveLabel(attempt.id) : t('moves.addState')}
	className="state-review-sheet"
	locked={!!busy}
	onclose={() => (ui.sheet = null)}
	footer={review ? footer : !busy && (failure || canContinue) ? recoveryFooter : undefined}
>
	{#if review}
		<div class="state-panel" aria-busy={!!busy}>
			<h3 class="muted small review-heading" tabindex="-1" bind:this={reviewHeading}>
				{t('stateGeneration.review', { name: moveLabel(review.id) })}
			</h3>
			{#if view}
				{@const facingName = displayDirection(view.direction)}
				{@const sourceName = clipName(review.source.clip)}
				<div class="review-preview">
					<div class="review-pair">
						<figure>
							<span class="review-stage">
								{#if view.source}<span class="cell-frame"
										>{@render cell(
											view.source,
											144,
											t('stateCapture.preview', { source: sourceName, facing: facingName })
										)}</span
									>{:else}<span class="muted small">{t('stateGeneration.sourceMissing')}</span>{/if}
							</span>
							<figcaption>{sourceName}</figcaption>
						</figure>
						<figure>
							<span class="review-stage"
								><span class="cell-frame"
									>{@render cell(
										view.image,
										144,
										t('stateCapture.preview', {
											source: t('stateGeneration.generated'),
											facing: facingName
										})
									)}</span
								></span
							>
							<figcaption>{t('stateGeneration.generated')}</figcaption>
						</figure>
					</div>
					{#if reviewViews.length > 1}
						<DirectionCompass
							label={t('common.directions')}
							available={reviewViews.map(({ direction }) => direction)}
							selected={[view.direction]}
							mirrors={reviewMirrors}
							compact
							preview
							disabled={!!busy}
							ontoggle={(option) => (reviewFacing = option)}
						/>
					{/if}
				</div>
			{/if}
			{#if review.description?.trim()}<PromptLine text={review.description.trim()} />{/if}
			{#if reviewRiding}<p class="muted small">{t('stateGeneration.ridingCheck')}</p>{/if}
			{#if !sourceCurrent}
				<p class="notice warn small" role="status">{t('stateGeneration.sourceChanged')}</p>
			{:else if Object.keys(review.ungrounded).length}
				<label class="bu-check review-ground">
					<span class="edit-copy">
						<span>{t('stateGeneration.keepGrounded')}</span>
						<span id="{formId}-ground-hint" class="faint small"
							>{t('stateGeneration.groundedHint')}</span
						>
					</span>
					<input
						class="bu-switch"
						type="checkbox"
						role="switch"
						bind:checked={keepGrounded}
						disabled={!!busy}
						aria-label={t('stateGeneration.keepGrounded')}
						aria-describedby="{formId}-ground-hint"
					/>
				</label>
			{/if}
			{#if confirmDiscard}<p class="notice warn small" role="status">
					{t('stateGeneration.discardWarning')}
				</p>{/if}
		</div>
	{:else if status === 'generating'}
		<div class="state-panel generating">
			<span class="review-stage source-stage">
				{#if sourcePreview}<span class="cell-frame"
						>{@render cell(
							sourcePreview,
							144,
							t('stateCapture.preview', {
								source: clipName(attempt!.source.clip),
								facing: displayDirection(ui.dir)
							})
						)}</span
					>{/if}
			</span>
			<p role="status">
				<span class="bu-ring spin" aria-hidden="true"></span>{progress && stateStatusText(progress)}
			</p>
			<p class="muted small">{t('stateGeneration.background')}</p>
			{#if attempt?.description?.trim()}<PromptLine text={attempt.description.trim()} />{/if}
		</div>
	{:else if !busy && (failure || canContinue)}
		<div class="state-panel">
			{#if canContinue}
				<p>{t('stateGeneration.continueIntro')}</p>
				{#if continuation}
					{@const { keptViews, remainingViews, cost } = continuation}
					<div class="notice small" role="status">
						<p>
							{t('stateGeneration.continueViews', {
								kept: formatNumber(keptViews),
								remaining: formatNumber(remainingViews)
							})}
						</p>
						<p>{t('stateGeneration.localOnly')}</p>
						<strong>{stateCostText(cost)}</strong>
					</div>
				{/if}
			{/if}
			{#if confirmDiscard}<p class="notice warn small" role="status">
					{t('stateGeneration.discardWarning')}
				</p>{/if}
		</div>
	{/if}
	<p class="faint small" role="status">{busy ? t(busy) : ''}</p>
	{#if runError && !review}<ProblemNotice error={runError} />{/if}
	{#if failure && failure !== runError}<ProblemNotice error={failure} />{/if}
</Sheet>

{#snippet footer()}
	<div class="state-footer">
		<p class="muted small">{t('stateCapture.noEquipment')}</p>
		<div class="state-actions">
			<button
				type="button"
				class="bu-btn"
				data-variant="outline"
				disabled={!!busy}
				onclick={discard}
				>{t(confirmDiscard ? 'stateGeneration.confirmDiscard' : 'common.discard')}</button
			>
			<button
				type="button"
				class="bu-btn"
				data-variant="primary"
				disabled={!!busy || !sourceCurrent}
				onclick={save}>{t('common.save')}</button
			>
		</div>
	</div>
{/snippet}

{#snippet recoveryFooter()}
	<div class="state-actions">
		{#if discardable}
			<button type="button" class="bu-btn" data-variant="outline" onclick={discard}
				>{t(confirmDiscard ? 'stateGeneration.confirmDiscard' : 'common.discard')}</button
			>
		{/if}
		{#if continuation}
			<button type="button" class="bu-btn" data-variant="primary" onclick={generateRemaining}
				>{t('stateGeneration.generateRemaining')}</button
			>
		{:else if canContinue}
			<button type="button" class="bu-btn" data-variant="primary" onclick={checkContinuationCost}
				>{t('stateGeneration.checkRemainingCost')}</button
			>
		{:else}
			<button type="button" class="bu-btn" data-variant="outline" onclick={load}
				>{t('common.tryAgain')}</button
			>
		{/if}
	</div>
{/snippet}

<style>
	:global(dialog.state-review-sheet.center) {
		max-inline-size: 560px;
	}
	.state-panel {
		display: grid;
		gap: 12px;
	}
	.state-panel p,
	.state-footer p {
		margin: 0;
	}
	.generating {
		justify-items: center;
		text-align: center;
	}
	.generating p[role='status'] {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.source-stage {
		inline-size: min(100%, 160px);
		opacity: 0.6;
	}
	.edit-copy {
		display: grid;
		gap: 2px;
		min-inline-size: 0;
	}
	/* Like Move review: the pair beside the direction compass when the sheet has room, stacked otherwise. */
	.state-panel:has(.review-preview) {
		container-type: inline-size;
	}
	.review-preview {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		justify-items: center;
		gap: 8px;
	}
	.review-pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		inline-size: 100%;
	}
	.review-pair figure {
		display: grid;
		gap: 4px;
		margin: 0;
		min-inline-size: 0;
	}
	.review-stage {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		overflow: hidden;
		text-align: center;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	/* The stored cell fills its review box: the box edge is the cell edge. */
	.cell-frame {
		display: grid;
		inline-size: 100%;
		block-size: 100%;
	}
	.review-pair figcaption {
		overflow-wrap: anywhere;
		text-align: center;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.review-heading {
		margin: 0;
		font-weight: 400;
	}
	.review-heading:focus:not(:focus-visible) {
		outline: none;
	}
	@container (min-width: 480px) {
		.review-preview {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			gap: 16px;
		}
	}
	.state-footer {
		flex: 1;
		min-inline-size: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
	}
	.state-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
