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
	import { app, getKeyRevision } from '../lib/app.svelte.ts';
	import { cellImg } from '../lib/compose/compose.ts';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import type { PickedReference } from '../lib/image/reference.ts';
	import { errorMessage, LocalizedError, type Message } from '../lib/message.ts';
	import { DEFAULT_MOVE, DIRECTIONS, type DirectionName } from '../lib/rig/rig.ts';
	import { moveLabel } from './model.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { ChevronLeft, ChevronRight, Pause, Play } from './icons.ts';
	import {
		captureState,
		stateCaptureId,
		stateCaptureNameIssue,
		stateCaptureSource,
		stateSourceClips
	} from './moveActions.svelte.ts';
	import ReferenceField from './ReferenceField.svelte';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import StateSourcePicker from './StateSourcePicker.svelte';
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
	let reviewIndex = $state(0);
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
	const studioFacing = (drawn: readonly DirectionName[]) =>
		drawn.includes(ui.dir) ? ui.dir : (drawn[0] ?? ui.dir);
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
	let facing = $state<DirectionName | null>(null);
	let rotating = $state(!matchMedia('(prefers-reduced-motion: reduce)').matches);
	const canRotate = $derived(previews.length > 1);
	// Starts on the Studio's facing; stepping frames keeps the facing the user is looking at.
	const shown = $derived(
		previews.find(({ direction }) => direction === facing) ??
			previews.find(({ direction }) => direction === ui.dir) ??
			previews[0]
	);
	$effect(() => {
		const count = previews.length;
		if (!rotating || count < 2) return;
		const timer = window.setInterval(() => {
			const at = previews.findIndex(({ direction }) => direction === shown?.direction);
			facing = previews[(at + 1) % count].direction;
		}, 700);
		return () => window.clearInterval(timer);
	});
	function clipThumbnail(id: string, position = lastFrame(id)) {
		const cells = body?.cells?.[id];
		const cell = manifest?.rig.animations.find((entry) => entry.id === id)?.frames[position]?.cell;
		if (!project || !body || !cells || cell === undefined) return null;
		const drawn = (manifest?.rig.directions ?? [])
			.filter(({ id: direction, mirrorOf }) => !mirrorOf && cells[direction]?.[cell])
			.map(({ id: direction }) => direction);
		return cellImg(project, body, id, studioFacing(drawn), cell) ?? null;
	}
	const triggerImage = $derived(clipThumbnail(clip, frame));

	const id = $derived(stateCaptureId(name));
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
	const view = $derived(review?.views[reviewIndex]);
	const reviewSource = $derived(review && project && stateGenerationSource(project, review.source));
	const sourceView = $derived(
		reviewSource?.version === review?.sourceVersion
			? reviewSource?.views.find(({ direction }) => direction === view?.direction)
			: undefined
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
			reviewIndex = 0;
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
			reviewIndex = 0;
		});
	}

	function save() {
		if (!review) return;
		const pending = review;
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
			reviewIndex = 0;
			checkedPending = true;
		});
	}
</script>

{#snippet costLabel(cost: StateGenerationCost)}
	{@const low = formatNumber(cost.minGenerations)}
	{@const high = formatNumber(cost.maxGenerations)}
	{cost.kind === 'fixed'
		? t('stateGeneration.fixedCost', { generations: high })
		: t('moves.estimate', { gens: low === high ? high : `${low}–${high}` })}
{/snippet}

<Sheet
	title={t('stateCapture.title')}
	className="state-capture-sheet"
	cancelDisabled={!!busy}
	onclose={() => (ui.sheet = null)}
	footer={review || checkedPending ? footer : recoveryFooter}
>
	{#if review}
		<div class="state-panel" aria-busy={!!busy}>
			<p>{t('stateGeneration.review', { name: moveLabel(review.id) })}</p>
			{#if view}
				{#if review.views.length > 1}
					<label class="field">
						<span class="label">{t('common.direction')}</span>
						<select class="bu-input input" bind:value={reviewIndex} disabled={!!busy}>
							{#each review.views as { direction }, index (direction)}
								<option value={index}>{displayDirection(direction)}</option>
							{/each}
						</select>
					</label>
				{/if}
				<div class="state-compare">
					{#if sourceView}
						{@const sourceName = clipName(review.source.clip)}
						<figure>
							<Sprite img={sourceView.image} k={3} limit={128} checker label={sourceName} />
							<figcaption>{sourceName}</figcaption>
						</figure>
					{/if}
					<figure>
						<Sprite
							img={view.image}
							k={3}
							limit={128}
							checker
							label={displayDirection(view.direction)}
						/>
						<figcaption>{t('stateGeneration.generated')}</figcaption>
					</figure>
				</div>
			{/if}
			{#if confirmDiscard}<p class="notice warn small" role="status">
					{t('stateGeneration.discardWarning')}
				</p>{/if}
		</div>
	{:else if checkedPending}
		<form id={formId} class="state-panel" onsubmit={submit} aria-busy={!!busy}>
			<StateSourcePicker
				{clips}
				selected={clip}
				label={clipName}
				thumbnail={(entry) => clipThumbnail(entry)}
				{triggerImage}
				disabled={!!busy}
				onselect={chooseClip}
			/>
			{#if shown}
				{@const facingName = displayDirection(shown.direction)}
				{#snippet sprite()}
					<span class="source-sprite" data-facing={shown.direction}>
						<Sprite
							img={shown.image}
							k={1}
							fitToBox
							label={t('stateCapture.preview', { source: clipName(clip), facing: facingName })}
						/>
					</span>
					<span class="source-facing" aria-hidden="true">{facingName}</span>
				{/snippet}
				{#if canRotate}
					<button
						class="source-preview"
						type="button"
						aria-label={t(rotating ? 'common.pause' : 'common.play')}
						onclick={() => (rotating = !rotating)}
					>
						{@render sprite()}
						<span class="source-play" aria-hidden="true">
							{#if rotating}<Pause size={18} />{:else}<Play size={18} />{/if}
						</span>
					</button>
				{:else}
					<div class="source-preview">{@render sprite()}</div>
				{/if}
			{/if}
			{#if total > 1}
				<div class="source-nav">
					<button
						class="bu-action"
						data-variant="quiet"
						type="button"
						aria-label={t('stage.previousFrame')}
						disabled={!!busy || frame === 0}
						onclick={() => step(-1)}><ChevronLeft size={20} /></button
					>
					<strong aria-live="polite">{t('stage.framePosition', { frame: frame + 1, total })}</strong
					>
					<button
						class="bu-action"
						data-variant="quiet"
						type="button"
						aria-label={t('stage.nextFrame')}
						disabled={!!busy || frame >= total - 1}
						onclick={() => step(1)}><ChevronRight size={20} /></button
					>
				</div>
			{/if}
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
					<span>{t('stateCapture.editWithPixelLab')}</span>
					<span id="{formId}-edit-hint" class="faint small">{t('stateCapture.editHint')}</span>
				</span>
				<input
					class="bu-switch"
					type="checkbox"
					role="switch"
					bind:checked={editing}
					disabled={!!busy}
					aria-label={t('stateCapture.editWithPixelLab')}
					aria-describedby="{formId}-edit-hint"
				/>
			</label>
			{#if editing}
				<div class="edit-fields">
					{#if !flashReference}
						<label class="field">
							<span class="label">{t('stateGeneration.description')}</span>
							<textarea class="bu-input input" bind:value={description} rows={3} disabled={!!busy}
							></textarea>
						</label>
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
				<button type="button" class="bu-btn" data-variant="primary" disabled={!!busy} onclick={save}
					>{t('common.save')}</button
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
	.state-panel {
		display: grid;
		gap: 12px;
	}
	.state-panel p,
	.state-footer p {
		margin: 0;
	}
	/* The whole stage is the play/pause target; the frame stepper sits outside it. */
	.source-preview {
		position: relative;
		display: grid;
		place-items: center;
		inline-size: 100%;
		padding: 8px 44px;
		color: inherit;
		font: inherit;
		background: var(--stage);
		border: 1px solid var(--bu-line);
		border-radius: var(--r-ctl);
	}
	button.source-preview {
		cursor: pointer;
	}
	button.source-preview:hover {
		border-color: var(--bu-border);
	}
	.source-sprite {
		inline-size: min(100%, 208px, 30dvh);
		aspect-ratio: 1;
	}
	.source-facing,
	.source-play {
		position: absolute;
		inset-block-end: 0;
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
	.source-facing {
		inset-inline-start: 12px;
		font-size: 12px;
		color: var(--bu-muted);
	}
	.source-play {
		inset-inline-end: 0;
		min-inline-size: 44px;
	}
	.source-nav {
		margin-block-start: -4px;
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) 44px;
		align-items: center;
		justify-self: center;
		inline-size: min(100%, 248px);
		gap: 8px;
		text-align: center;
	}
	.source-nav button {
		min-block-size: 44px;
		display: grid;
		place-items: center;
	}
	.source-nav strong {
		font-variant-numeric: tabular-nums;
	}
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
	.edit-fields {
		display: grid;
		gap: 12px;
	}
	.state-compare {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
	}
	.state-compare figure {
		display: grid;
		justify-items: center;
		gap: 4px;
		margin: 0;
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
