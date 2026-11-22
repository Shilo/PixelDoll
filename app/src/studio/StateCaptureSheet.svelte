<script module lang="ts">
	// Connect closes this sheet; the draft (source, frame, name and edit fields) comes back with it.
	type Draft = {
		projectId: string;
		source: StateSourceFrame;
		name: string;
		named: boolean;
		description: string;
		model: StateGenerationModel;
		reference?: PickedReference;
	};
	let connectionDraft: Draft | undefined;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { formatNumber, t } from 'svelte-whisper';
	import PromptField from './PromptField.svelte';
	import PromptSuggestions from './PromptSuggestions.svelte';
	import { POSE_IDEAS } from './promptIdeas.ts';
	import type { EnhanceSpec } from './promptEnhance.ts';
	import { app, getKeyRevision } from '../lib/app.svelte.ts';
	import { cellImg } from '../lib/compose/compose.ts';
	import { flipH } from '../lib/rig/mirror.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import type { PickedReference } from '../lib/image/reference.ts';
	import { errorMessage, LocalizedError, type Message } from '../lib/message.ts';
	import { DEFAULT_MOVE, DIRECTIONS, type DirectionName } from '../lib/rig/rig.ts';
	import { moveLabel } from './model.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { ChevronRight } from './icons.ts';
	import {
		captureState,
		stateCaptureId,
		stateCaptureNameIssue,
		stateCaptureSource,
		stateSourceClips
	} from './moveActions.svelte.ts';
	import ReferenceField from './ReferenceField.svelte';
	import Sheet from './Sheet.svelte';
	import PromptLine from './PromptLine.svelte';
	import SourcePreview from './SourcePreview.svelte';
	import Sprite from './Sprite.svelte';
	import { croppedBacking } from './experience/thumbnails.svelte.ts';
	import type { Img } from '../lib/image/png.ts';
	import DirectionCompass from './DirectionCompass.svelte';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import { bodyClipThumbnail } from './moveThumbnails.ts';
	import { doc, openProject, store, ui, withKey } from './state.svelte.ts';
	import {
		continueState,
		discardState,
		hasStateContinuation,
		pendingState,
		prepareState,
		quoteStateContinuation,
		saveState,
		startState,
		type PreparedState,
		type StateContinuationQuote,
		type StateReview
	} from './stateGeneration.ts';
	import type { StateGenerationCost, StateGenerationModel } from './stateGenerationPlan.ts';
	import { stateGenerationSource, type StateSourceFrame } from './stateGenerationSource.ts';

	const formId = $props.id();
	const projectId = doc.id;
	const referenceMax = { width: 512, height: 512 };
	const restored = connectionDraft?.projectId === projectId ? connectionDraft : undefined;
	connectionDraft = undefined;

	const project = $derived(doc.id === projectId ? store.project : null);
	const manifest = $derived(project?.manifest);
	const clipIds = $derived(manifest?.rig.animations.map(({ id }) => id) ?? []);
	const clips = $derived(stateSourceClips(manifest));
	const pickerClips = $derived(playbackClips(clips));
	const body = $derived(manifest?.items.find(({ id }) => id === manifest.rig.baseItem)?.layers[0]);
	const clipName = (id: string) => displayMove(id, clipIds);
	const lastFrame = (id: string) =>
		Math.max(0, (manifest?.rig.animations.find((clip) => clip.id === id)?.frames.length ?? 1) - 1);

	function initialClip() {
		const sources = stateSourceClips(store.project?.manifest);
		const has = (id: string) => sources.some((clip) => clip.id === id);
		if (ui.stateCaptureMove && has(ui.stateCaptureMove)) return ui.stateCaptureMove;
		return has(DEFAULT_MOVE) ? DEFAULT_MOVE : (sources[0]?.id ?? DEFAULT_MOVE);
	}
	function suggestedName(sourceId: string) {
		const current = store.project?.manifest;
		const root = stateCaptureId(sourceId === DEFAULT_MOVE ? 'standing' : sourceId).slice(0, 48);
		let candidate = (root || 'state') + '-pose';
		for (
			let suffix = 2;
			current &&
			(stateCaptureNameIssue(current, candidate) || Object.hasOwn(store.moveReviews, candidate));
			suffix++
		)
			candidate = (root || 'state') + '-pose-' + suffix;
		return moveLabel(candidate);
	}

	const startClip = restored?.source.clip ?? initialClip();
	let clip = $state(startClip);
	let frame = $state(restored?.source.frame ?? lastFrame(startClip));
	let name = $state(restored?.name ?? suggestedName(startClip));
	// A typed name sticks; an untouched suggestion follows the chosen source.
	let named = $state(restored?.named ?? false);
	let editing = $state(!!restored);
	let description = $state(restored?.description ?? '');
	let model = $state<StateGenerationModel>(restored?.model ?? 'pro');
	let advancedOpen = $state(!!restored && restored.model !== 'pro');
	let reference = $state.raw(restored?.reference);
	let referenceLoading = $state(false);

	// The free copy compares against the version seen when this source was chosen.
	let pinned = $state(
		store.project && stateCaptureSource(store.project.manifest, startClip)?.version
	);
	let stale = $state(false);
	let busy = $state<
		| 'common.loading'
		| 'stateGeneration.quoting'
		| 'stateGeneration.generating'
		| 'stateCapture.saving'
		| null
	>(null);
	let failure = $state<Message | string>('');
	let checkedPending = $state(false);
	let review = $state.raw<StateReview | null>(null);
	let reviewFacing = $state<DirectionName | null>(null);
	let keepGrounded = $state(true);
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
	// The generate button disappears when its review arrives: move focus to the review once per result.
	let focusedReview = '';
	$effect(() => {
		const token = review?.token;
		if (!reviewHeading || !token || token === focusedReview) return;
		focusedReview = token;
		reviewHeading.focus();
	});
	let confirmDiscard = $state(false);
	let canContinue = $state(false);
	let continuation = $state.raw<StateContinuationQuote | null>(null);
	let quoted = $state.raw<{ prepared: PreparedState; draft: Omit<Draft, 'named'> } | null>(null);

	const source = $derived<StateSourceFrame>({ clip, frame });
	const capture = $derived(manifest && stateCaptureSource(manifest, clip));
	const views = $derived(project && stateGenerationSource(project, source));
	const total = $derived(capture?.move.frames.length ?? 0);
	const changed = $derived(
		stale || doc.id !== projectId || (!!pinned && capture?.version !== pinned)
	);
	// Every facing the State will have, mirrored ones included, in compass order for the turntable.
	const previews = $derived.by(() => {
		const cell = capture?.move.frames[frame]?.cell;
		if (!views || !project || !body || cell === undefined) return [];
		const drawn = new Set(views.views.map(({ direction }) => direction));
		return project.manifest.rig.directions
			.filter(({ id, mirrorOf }) => drawn.has(mirrorOf ?? id))
			.sort((left, right) => DIRECTIONS.indexOf(left.id) - DIRECTIONS.indexOf(right.id))
			.map(({ id }) => ({ direction: id, image: cellImg(project, body, clip, id, cell) ?? null }));
	});
	const id = $derived(stateCaptureId(name));
	// PixelLab has no enhancer for edit instructions. The animation enhancer is the one that reads images: it grounds the
	// text in the source frame and, with a reference, describes the change from the source pose toward it.
	const enhanceSpec = $derived.by((): EnhanceSpec | null => {
		const image = (
			previews.find(({ direction }) => direction === ui.dir) ?? previews.find(({ image }) => image)
		)?.image;
		return image ? { kind: 'pose', first: image, last: reference?.base64 } : null;
	});
	const enhanceScope = `state-enhance:${projectId}:${crypto.randomUUID()}`;
	const nameIssue = $derived(
		project &&
			(stateCaptureNameIssue(project.manifest, id) ??
				(Object.hasOwn(store.moveReviews, id) ? 'stateCapture.takenName' : undefined))
	);
	const connected = $derived(!!app.key && !app.keyRejected);
	const flashReference = $derived(model === 'pro-flash' && !!reference);
	const sourceReady = $derived(!!views && !changed);
	const editReady = $derived(
		!!(description.trim() || (model !== 'pixen' && reference)) && !referenceLoading
	);
	const quote = $derived(
		quoted &&
			editing &&
			connected &&
			quoted.prepared.keyRevision === getKeyRevision() &&
			quoted.prepared.sourceVersion === views?.version &&
			quoted.draft.source.clip === clip &&
			quoted.draft.source.frame === frame &&
			quoted.draft.name === name &&
			quoted.draft.description === description &&
			quoted.draft.model === model &&
			quoted.draft.reference === reference
			? quoted.prepared
			: null
	);
	const formReady = $derived(
		checkedPending && sourceReady && !nameIssue && (!editing || editReady)
	);
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
	const discardable = $derived(
		!checkedPending &&
			(canContinue ||
				(typeof failure !== 'string' &&
					(failure.key === 'stateGeneration.unfinished' ||
						failure.key === 'stateGeneration.invalidResult' ||
						failure.key === 'stateGeneration.outdated')))
	);

	function chooseClip(next: string, reloading = false) {
		if ((busy && !reloading) || !project) return;
		clip = next;
		frame = lastFrame(next);
		pinned = stateCaptureSource(project.manifest, next)?.version;
		stale = false;
		failure = '';
		if (!named) name = suggestedName(next);
	}
	// Reads the saved character again (paid quotes read storage), keeping the draft.
	function reloadSource() {
		void run('common.loading', async () => {
			await openProject(projectId, { quiet: true });
			const current = doc.id === projectId ? store.project?.manifest : undefined;
			if (!current) return;
			quoted = null;
			const latest = stateCaptureSource(current, clip);
			if (!latest) {
				const fallback = stateSourceClips(current);
				const next = fallback.find(({ id }) => id === DEFAULT_MOVE) ?? fallback[0];
				if (next) chooseClip(next.id, true);
				return;
			}
			pinned = latest.version;
			frame = Math.min(frame, latest.move.frames.length - 1);
			stale = false;
		});
	}
	function step(delta: number) {
		frame = Math.max(0, Math.min(total - 1, frame + delta));
		failure = '';
	}

	async function run(action: NonNullable<typeof busy>, work: () => Promise<void>) {
		if (busy) return;
		busy = action;
		failure = '';
		try {
			await work();
		} catch (error) {
			failure = errorMessage(error);
			// A saved source that changed or vanished elsewhere offers Reload source instead of retrying it.
			if (
				!review &&
				typeof failure !== 'string' &&
				(failure.key === 'stateGeneration.changed' ||
					failure.key === 'stateGeneration.sourceUnavailable')
			)
				stale = true;
		} finally {
			busy = null;
		}
	}

	function checkPending() {
		confirmDiscard = false;
		continuation = null;
		return run('common.loading', async () => {
			canContinue = false;
			try {
				review = await pendingState(projectId);
				checkedPending = true;
			} catch (cause) {
				canContinue = await hasStateContinuation(projectId).catch(() => false);
				if (!canContinue) throw cause;
			}
		});
	}
	onMount(() => {
		void checkPending();
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!formReady || busy || review) return;
		if (!editing) return void createCopy();
		if (!quote) checkCost();
	}

	function createCopy() {
		const version = pinned;
		if (!version) return;
		void run('stateCapture.saving', async () => {
			try {
				await captureState(projectId, clip, frame, id, version);
				if (ui.sheet === 'stateCapture') ui.sheet = null;
			} catch (cause) {
				const error = errorMessage(cause);
				if (typeof error === 'string' || error.key !== 'stateCapture.concurrentEdit') throw cause;
				// The changed-source notice explains this; choosing the source again refreshes it.
				stale = true;
				if (doc.id === projectId) await openProject(projectId, { quiet: true });
			}
		});
	}

	function checkCost() {
		if (!views) return;
		const draft = { projectId, source: { clip, frame }, name, description, model, reference };
		const version = views.version;
		quoted = null;
		if (!connected) {
			// Published only when Connect succeeds, so a canceled Connect leaves no draft behind.
			const saved = { ...draft, named };
			withKey(() => {
				if (doc.id !== projectId) return;
				connectionDraft = saved;
				ui.stateCaptureMove = '';
				ui.sheet = 'stateCapture';
			});
			return;
		}
		void run('stateGeneration.quoting', async () => {
			const prepared = await prepareState(
				projectId,
				draft.source,
				id,
				draft.model === 'pro-flash' && draft.reference ? '' : draft.description.trim(),
				draft.model,
				draft.model === 'pixen' ? undefined : draft.reference
			);
			if (prepared.sourceVersion !== version)
				throw new LocalizedError(
					'The source or quote changed. Check the cost again before generating.',
					'stateGeneration.changed'
				);
			quoted = { prepared, draft };
		});
	}

	function generate() {
		if (!quote || !formReady || busy || review) return;
		const prepared = quote;
		quoted = null;
		checkedPending = false;
		void run('stateGeneration.generating', async () => {
			try {
				review = await startState(prepared);
			} catch (cause) {
				canContinue = await hasStateContinuation(projectId).catch(() => false);
				// Nothing was saved or sent (a preflight check failed): return to the form and its draft.
				if (!canContinue && (await pendingState(projectId).catch(() => true)) === null)
					checkedPending = true;
				throw cause;
			}
			checkedPending = true;
			reviewFacing = null;
			keepGrounded = true;
		});
	}

	function checkContinuationCost() {
		void run('stateGeneration.quoting', async () => {
			continuation = await quoteStateContinuation(projectId);
		});
	}

	function generateRemaining() {
		const approved = continuation;
		if (!approved) return;
		continuation = null;
		void run('stateGeneration.generating', async () => {
			try {
				review = await continueState(approved);
			} catch (cause) {
				canContinue = await hasStateContinuation(projectId).catch(() => false);
				throw cause;
			}
			canContinue = false;
			checkedPending = true;
			reviewFacing = null;
			keepGrounded = true;
		});
	}

	function save() {
		if (!reviewed) return;
		const pending = reviewed;
		void run('stateCapture.saving', async () => {
			await saveState(pending);
			if (ui.sheet === 'stateCapture') ui.sheet = null;
		});
	}

	function discard() {
		if (!confirmDiscard) {
			confirmDiscard = true;
			return;
		}
		void run('common.loading', async () => {
			await discardState(projectId);
			confirmDiscard = false;
			canContinue = false;
			continuation = null;
			review = null;
			reviewFacing = null;
			keepGrounded = true;
			checkedPending = true;
		});
	}
</script>

{#snippet cell(image: Img | null, box: number, label: string)}
	<Sprite img={image} k={image ? croppedBacking(box, image, ui.dpr) : 1} fitToBox checker {label} />
{/snippet}

{#snippet costLabel(cost: StateGenerationCost)}
	{@const low = formatNumber(cost.minGenerations)}
	{@const high = formatNumber(cost.maxGenerations)}
	{cost.kind === 'fixed'
		? t('stateGeneration.fixedCost', { generations: high })
		: t('moves.estimate', { gens: low === high ? high : `${low}–${high}` })}
{/snippet}

<Sheet
	title={t('moves.addState')}
	className={['state-capture-sheet', review ? 'reviewing' : checkedPending && editing && 'split']
		.filter(Boolean)
		.join(' ')}
	wide={!review && checkedPending && editing}
	cancelDisabled={!!busy}
	onclose={() => (ui.sheet = null)}
	footer={review || checkedPending
		? footer
		: !busy && (failure || canContinue)
			? recoveryFooter
			: undefined}
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
	{:else if checkedPending}
		<form id={formId} class="state-form" onsubmit={submit} aria-busy={!!busy}>
			<div class="state-panel state-main">
				<PlaybackPicker
					clips={pickerClips}
					moveRefs={clipIds}
					selected={clip}
					field={t('stateCapture.source')}
					disabled={!!busy}
					thumbnail={(key) => project && bodyClipThumbnail(project, key, ui.dir)}
					onselect={chooseClip}
				/>
				<SourcePreview
					{previews}
					source={clipName(clip)}
					{frame}
					frames={total}
					disabled={!!busy}
					onstep={step}
				/>
				{#if changed}
					<div class="notice warn small source-changed" role="status">
						<p>{t('stateCapture.concurrentEdit')}</p>
						<button class="bu-btn" data-variant="outline" type="button" onclick={reloadSource}
							>{t('stateCapture.reload')}</button
						>
					</div>
				{:else if !views}
					<p class="notice warn small" role="status">{t('stateCapture.unavailable')}</p>
				{/if}
				<label class="field">
					<span class="label">{t('stateCapture.name')}</span>
					<input
						class="bu-input input"
						type="text"
						bind:value={name}
						disabled={!!busy}
						maxlength="64"
						aria-invalid={!!nameIssue}
						oninput={() => {
							named = true;
							failure = '';
						}}
					/>
				</label>
				{#if nameIssue}
					<p class="notice warn small" role="status">{t(nameIssue)}</p>
				{:else if name.trim() !== moveLabel(id)}
					<p class="muted small">{t('stateCapture.savedAs', { name: moveLabel(id) })}</p>
				{/if}
				<label class="bu-check edit-switch">
					<span class="edit-copy">
						<span>{t('stateCapture.changePose')}</span>
						<span id="{formId}-edit-hint" class="faint small">{t('stateCapture.changeHint')}</span>
					</span>
					<input
						class="bu-switch"
						type="checkbox"
						role="switch"
						bind:checked={editing}
						disabled={!!busy}
						aria-label={t('stateCapture.changePose')}
						aria-describedby="{formId}-edit-hint"
					/>
				</label>
			</div>
			{#if editing}
				<div class="state-panel state-edit">
					{#if !flashReference}
						<div class="field">
							<label class="label" for="{formId}-instructions"
								>{t('stateGeneration.description')}</label
							>
							<PromptField
								id="{formId}-instructions"
								value={description}
								onvalue={(text) => (description = text)}
								spec={enhanceSpec}
								activity={{ scope: enhanceScope, label: 'Enhance State instructions' }}
								maxOutput={model === 'pixen' ? 500 : 2000}
								enhanceDisabled={!!busy}
								disabled={!!busy}
							/>
							<PromptSuggestions
								label={t('stateCapture.poseIdeas')}
								value={description}
								suggestions={POSE_IDEAS.map((idea) => ({
									id: idea.id,
									label: t(idea.caption),
									prompt: idea.prompt
								}))}
								onpick={(idea) => (description = idea.prompt)}
							/>
						</div>
					{/if}
					<ReferenceField
						bind:value={reference}
						bind:loading={referenceLoading}
						max={referenceMax}
						hint={t(
							model === 'pixen'
								? 'stateGeneration.pixenReference'
								: model === 'pro-flash'
									? 'stateGeneration.flashReference'
									: 'stateGeneration.reference'
						)}
						disabled={!!busy || model === 'pixen'}
					/>
					<details class="disclosure" bind:open={advancedOpen}>
						<summary><ChevronRight size={14} />{t('common.advanced')}</summary>
						<label class="field">
							<span class="label">{t('create.form.model')}</span>
							<select
								class="bu-input input"
								bind:value={model}
								disabled={!!busy || referenceLoading}
							>
								<option value="pro">{t('stateGeneration.defaultModel')}</option>
								<option value="pro-flash">{t('create.form.models.proFlash.label')}</option>
								<option value="pixen">V3 (Pixen)</option>
							</select>
						</label>
					</details>
					{#if quote}
						{@const managed = quote.plan.endpoint === '/create-character-state'}
						<div class="notice small" role="status">
							<div>
								{#if managed}
									<p>
										{t('stateGeneration.managed', { parent: quote.parentName || clipName(clip) })}
									</p>
								{:else}
									<p>{t('stateGeneration.localOnly')}</p>
								{/if}
								{#if quote.plan.endpoint === '/transfer-outfit-v2'}<p>
										{t('stateGeneration.transfer')}
									</p>{/if}
								{#if quote.plan.warnings.includes('sheet-quality-unverified')}<p>
										{t('stateGeneration.sheetWarning')}
									</p>{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</form>
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
						<strong>{@render costLabel(cost)}</strong>
					</div>
				{/if}
			{/if}
			{#if confirmDiscard}<p class="notice warn small" role="status">
					{t('stateGeneration.discardWarning')}
				</p>{/if}
		</div>
	{/if}
	<p class="faint small" role="status">{busy ? t(busy) : ''}</p>
	{#if failure}<p class="notice bad small" role="alert">{displayNestedMessage(failure)}</p>{/if}
</Sheet>

{#snippet footer()}
	<div class="state-footer">
		{#if review}
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
		{:else}
			<p class="muted small">
				{#if !editing}
					<span>{t('stateCapture.noCredits')}</span>
				{:else if quote}
					<strong>{@render costLabel(quote.plan.cost)}</strong>
				{:else}
					<span>{t('stateGeneration.costFirst')}</span>
				{/if}
				<span>{t('stateCapture.noEquipment')}</span>
			</p>
			{#if editing && quote}
				<button
					class="bu-btn"
					data-variant="primary"
					type="button"
					disabled={!!busy || !formReady}
					onclick={generate}>{t('stateGeneration.generate')}</button
				>
			{:else}
				<button
					class="bu-btn"
					data-variant="primary"
					type="submit"
					form={formId}
					disabled={!!busy || !formReady}
					>{t(
						busy === 'stateCapture.saving'
							? 'stateCapture.saving'
							: !editing
								? 'stateCapture.title'
								: connected
									? 'stateGeneration.checkCost'
									: 'connectSheet.titleConnectPixelLab'
					)}</button
				>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet recoveryFooter()}
	{#if !busy && (failure || canContinue)}
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
				<button type="button" class="bu-btn" data-variant="outline" onclick={checkPending}
					>{t('common.tryAgain')}</button
				>
			{/if}
		</div>
	{/if}
{/snippet}

<style>
	:global(dialog.state-capture-sheet:is(.center, .side)) {
		max-inline-size: 360px;
	}
	.state-form {
		display: grid;
		gap: 12px;
	}
	/* Editing on a centered sheet with room: the pose and its switch stay left, the edit opens a right column. */
	@media (min-width: 760px) {
		:global(dialog.state-capture-sheet.center.split) {
			max-inline-size: 720px;
		}
		:global(dialog.center.split) .state-form {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
			gap: 24px;
		}
		:global(dialog.center.split) .state-edit {
			padding-inline-start: 24px;
			border-inline-start: 1px solid var(--bu-line);
		}
	}
	:global(dialog.state-capture-sheet.center.reviewing) {
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
	/* The whole stage is the play/pause target; the frame stepper sits outside it. */
	.source-changed {
		display: grid;
		gap: 8px;
		justify-items: start;
	}
	.edit-switch {
		justify-content: space-between;
		gap: 12px;
		padding-block-start: 12px;
		border-block-start: 1px solid var(--bu-line);
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
	.state-footer p span,
	.state-footer p strong {
		display: block;
		overflow-wrap: anywhere;
	}
	.state-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
