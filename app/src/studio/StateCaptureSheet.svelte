<script module lang="ts">
	// Connect closes this sheet; the draft (source, frame, name and edit fields) comes back with it.
	type Draft = {
		projectId: string;
		source: StateSourceFrame;
		name: string;
		named: boolean;
		description: string;
		/** The Riding pose idea is pressed, so the State is named and reviewed as a riding stance. */
		riding: boolean;
		model: StateGenerationModel;
		reference?: PickedReference;
	};
	let connectionDraft: Draft | undefined;
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import PromptField from './PromptField.svelte';
	import PromptSuggestions from './PromptSuggestions.svelte';
	import { promptSuggestions } from './promptSuggestions.svelte.ts';
	import type { PromptSuggestion } from './promptSuggestions.ts';
	import { RIDING_STATE } from './experience/presentation.ts';
	import type { EnhanceSpec } from './promptEnhance.ts';
	import { app, getKeyRevision } from '../lib/app.svelte.ts';
	import { cellImg } from '../lib/compose/compose.ts';
	import { playbackClips } from '../lib/runtime/timeline.js';
	import { displayNestedMessage } from '../lib/i18n.ts';
	import type { PickedReference } from '../lib/image/reference.ts';
	import { errorMessage, LocalizedError, type Message } from '../lib/message.ts';
	import { DEFAULT_MOVE, DIRECTIONS } from '../lib/rig/rig.ts';
	import { moveLabel } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { ChevronRight, Import } from './icons.ts';
	import ImportMovesPane from './ImportMovesPane.svelte';
	import ImportFoot from './ImportFoot.svelte';
	import { MoveImporter } from './moveImporter.svelte.ts';
	import { leaveSheetForm, showSheetPage } from './sheetPage.ts';
	import {
		captureState,
		stateCaptureId,
		stateCaptureNameIssue,
		stateCaptureSource,
		stateId,
		stateSourceClips
	} from './moveActions.svelte.ts';
	import ReferenceField from './ReferenceField.svelte';
	import Sheet from './Sheet.svelte';
	import SourcePreview from './SourcePreview.svelte';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import { bodyClipThumbnail } from './moveThumbnails.ts';
	import { doc, isDemo, openProject, store, takeImport, ui, withKey } from './state.svelte.ts';
	import {
		prepareState,
		quoteStateModels,
		stateModelInput,
		type PreparedState
	} from './stateGeneration.ts';
	import type { StateGenerationCost, StateGenerationModel } from './stateGenerationPlan.ts';
	import ModelSelect from './ModelSelect.svelte';
	import { stateCostText } from './stateCost.ts';
	import { ridingStatePlan } from './ridingStatePlan.ts';
	import { generateState } from './stateJobs.svelte.ts';
	import { stateAttempts } from './stateRecovery.ts';
	import { openingCreationSettings, resolveStateModelPreference } from './creationSettings.ts';
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

	// Moves awaiting review and States still generating keep their names.
	const reservedNames = () => [
		...Object.keys(store.moveReviews),
		...stateAttempts({ stateGenerations: store.stateAttempts }).map(({ id }) => id)
	];
	function initialClip() {
		const sources = stateSourceClips(store.project?.manifest);
		const has = (id: string) => sources.some((clip) => clip.id === id);
		if (ui.stateCaptureMove && has(ui.stateCaptureMove)) return ui.stateCaptureMove;
		return has(DEFAULT_MOVE) ? DEFAULT_MOVE : (sources[0]?.id ?? DEFAULT_MOVE);
	}
	function suggestedName(sourceId: string, chosen = '') {
		const current = store.project?.manifest;
		const root =
			chosen ||
			(stateCaptureId(sourceId === DEFAULT_MOVE ? 'standing' : moveLabel(sourceId)).slice(0, 48) ||
				'state') + '-pose';
		let candidate = root;
		for (
			let suffix = 2;
			current && stateCaptureNameIssue(current, candidate, reservedNames());
			suffix++
		)
			candidate = root + '-' + suffix;
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
	// The Riding idea stays pressed through edits, like a move template, until it is pressed again, another pose is
	// picked or the instructions are cleared. The instructions stay editable and are sent as shown.
	let ridingIdea = $state(restored?.riding ?? false);
	const savedModel = restored ? undefined : openingCreationSettings('states').model;
	const initialModel =
		restored?.model ??
		untrack(() => {
			const current = store.project;
			const source = current && stateGenerationSource(current, { clip: startClip, frame });
			return resolveStateModelPreference(
				savedModel ?? 'pro',
				source
					? {
							cellSize: source.size,
							facingIds: source.views.map(({ direction }) => direction)
						}
					: undefined
			);
		});
	let model = $state<StateGenerationModel>(initialModel);
	let advancedOpen = $state(
		initialModel !== 'pro' || (savedModel !== undefined && savedModel !== initialModel)
	);
	let modelEdited = $state(false);
	let reference = $state.raw(restored?.reference);
	let referenceLoading = $state(false);

	// The free copy compares against the version seen when this source was chosen.
	let pinned = $state(
		store.project && stateCaptureSource(store.project.manifest, startClip)?.version
	);
	let stale = $state(false);
	let busy = $state<'common.loading' | 'stateGeneration.generating' | 'stateCapture.saving' | null>(
		null
	);
	let failure = $state<Message | string>('');
	let quoted = $state.raw<{ prepared: PreparedState; draft: Omit<Draft, 'named'> } | null>(null);
	// The edit is priced for free as the form settles; Generate State only enables once the shown price matches it.
	let pricing = $state(false);
	let priceFailure = $state<Message | string>('');
	/** The exception behind `priceFailure`, for Report. */
	let priceCause = $state.raw<unknown>();
	let priceRetry = $state(0);

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
	const id = $derived(stateId(name));
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
		project && stateCaptureNameIssue(project.manifest, id, reservedNames())
	);
	const connected = $derived(!!app.key && !app.keyRejected);
	const flashReference = $derived(model === 'pro-flash' && !!reference);
	const guided = $derived(
		!!(
			ridingIdea &&
			!reference &&
			manifest &&
			views &&
			ridingStatePlan(manifest.rig, source, views)
		)
	);
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
			Boolean(quoted.prepared.guided) === guided &&
			quoted.draft.reference === reference
			? quoted.prepared
			: null
	);
	const formReady = $derived(sourceReady && !nameIssue && (!editing || editReady));
	function chooseClip(next: string, reloading = false) {
		if ((busy && !reloading) || !project) return;
		clip = next;
		frame = lastFrame(next);
		pinned = stateCaptureSource(project.manifest, next)?.version;
		stale = false;
		failure = '';
		if (!named) name = autoName(next);
	}
	// An untyped name follows the pressed idea: Riding keeps the id mounted riding looks for in every language; other
	// ideas use their title, and the source's default name returns once none applies.
	function autoName(sourceId: string) {
		if (ridingIdea) return suggestedName(sourceId, RIDING_STATE);
		const idea = promptSuggestions('state.pose').find(
			({ action, prompt }) => !action && prompt.trim() === description.trim()
		);
		return suggestedName(sourceId, idea ? stateCaptureId(idea.title).slice(0, 48) : '');
	}
	function pickIdea(idea: PromptSuggestion) {
		if (busy) return;
		failure = '';
		if (idea.action === RIDING_STATE && ridingIdea) ridingIdea = false;
		else {
			description = idea.prompt;
			ridingIdea = idea.action === RIDING_STATE;
		}
		if (!named) name = autoName(clip);
	}
	function describe(text: string) {
		description = text;
		if (!text.trim()) ridingIdea = false;
		if (!named) name = autoName(clip);
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
			markStale(failure);
		} finally {
			busy = null;
		}
	}
	// A saved source that changed or vanished elsewhere offers Reload source instead of retrying it.
	function markStale(error: Message | string) {
		if (
			typeof error !== 'string' &&
			(error.key === 'stateGeneration.changed' || error.key === 'stateGeneration.sourceUnavailable')
		)
			stale = true;
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!formReady || busy) return;
		if (!editing) return void createCopy();
		// Enter never spends credits: only the Generate State button does.
		if (!connected) connect();
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

	function connect() {
		// Published only when Connect succeeds, so a canceled Connect leaves no draft behind.
		const saved = {
			projectId,
			source: { clip, frame },
			name,
			description,
			riding: ridingIdea,
			model,
			reference,
			named
		};
		withKey(() => {
			if (doc.id !== projectId) return;
			connectionDraft = saved;
			ui.stateCaptureMove = '';
			ui.sheet = 'stateCapture';
		});
	}

	$effect(() => {
		if (!editing || !connected || !formReady || busy || !views) return;
		// Reprice after any change the quote depends on, once typing pauses.
		void [clip, frame, name, description, model, reference, guided, views.version, priceRetry];
		const timer = setTimeout(() => void price(), 400);
		return () => clearTimeout(timer);
	});

	let priceRequest = 0;
	async function price() {
		if (!views) return;
		const draft = {
			projectId,
			source: { clip, frame },
			name,
			description,
			riding: ridingIdea,
			model,
			reference
		};
		const version = views.version;
		const request = ++priceRequest;
		pricing = true;
		priceFailure = '';
		priceCause = undefined;
		try {
			const input = stateModelInput(draft.model, draft.description, draft.reference);
			const prepared = await prepareState(
				projectId,
				draft.source,
				id,
				input.description,
				draft.model,
				input.reference,
				guided
			);
			if (request !== priceRequest) return;
			if (prepared.sourceVersion !== version)
				throw new LocalizedError(
					'The source or quote changed. Check the cost again before generating.',
					'stateGeneration.changed'
				);
			quoted = { prepared, draft };
		} catch (error) {
			if (request !== priceRequest) return;
			priceFailure = errorMessage(error);
			priceCause = error;
			markStale(priceFailure);
		} finally {
			if (request === priceRequest) pricing = false;
		}
	}

	// The open Model list prices every model for this draft, once per draft; it is checked again when opened after a change.
	type ModelCosts = Partial<Record<StateGenerationModel, StateGenerationCost | null>>;
	const MODELS: readonly StateGenerationModel[] = ['pro', 'pro-flash', 'pixen'];
	const listDraft = () => ({
		key: app.key,
		version: views?.version,
		clip,
		frame,
		reference,
		// Only very long instructions change a model's route (the managed Pro State takes up to 1000 characters).
		long: Array.from(description.trim()).length > 1000
	});
	type ListDraft = ReturnType<typeof listDraft>;
	const sameDraft = (left: ListDraft, right: ListDraft) =>
		(Object.keys(left) as (keyof ListDraft)[]).every((key) => left[key] === right[key]);
	let modelCosts = $state.raw<{ draft: ListDraft; costs?: ModelCosts }>();

	function priceModels() {
		if (!connected || !sourceReady) return;
		const draft = listDraft();
		if (modelCosts && sameDraft(modelCosts.draft, draft)) return;
		modelCosts = { draft };
		void quoteStateModels(projectId, { clip, frame }, description, reference, MODELS).then(
			(costs) => {
				if (modelCosts?.draft === draft) modelCosts = { draft, costs };
			},
			// The saved character could not be read: every model shows Unavailable, and Generate's own quote explains why.
			() => {
				if (modelCosts?.draft === draft) modelCosts = { draft, costs: {} };
			}
		);
	}
	function modelCost(option: StateGenerationModel) {
		if (!connected || !modelCosts || !sameDraft(modelCosts.draft, listDraft())) return;
		if (!modelCosts.costs) return t('stateGeneration.quoting');
		const cost = modelCosts.costs[option];
		return cost ? stateCostText(cost) : t('common.unavailable');
	}

	function generate() {
		if (!quote || !formReady || busy) return;
		const prepared = quote;
		quoted = null;
		void run('stateGeneration.generating', async () => {
			// Pro Flash with a reference sends no instructions, so the Riding idea was not used.
			await generateState(prepared, ridingIdea && !flashReference);
			// Like a Move, it carries on in the background: the States list shows it until it is reviewed.
			ui.tab = 'states';
			if (ui.sheet === 'stateCapture') ui.sheet = null;
		});
	}

	// Import: a page of this sheet (a ZIP dropped on States opens on it); Back keeps the form as it was.
	const opening = takeImport('states');
	let importing = $state(!!opening);
	const importer = new MoveImporter();
	if (opening?.files) void importer.read(opening.files);
	$effect(() => () => {
		importer.gone = true;
	});
	function page(inner: boolean) {
		if (inner) leaveSheetForm();
		importing = inner;
		void showSheetPage(inner);
	}
</script>

<Sheet
	title={importing ? t('moveImport.importStates') : t('moves.addState')}
	className={['state-capture-sheet', editing && !importing && 'split', importing && 'importing']
		.filter(Boolean)
		.join(' ')}
	wide={editing && !importing}
	locked={!!busy || (importing && importer.busy && !!importer.review)}
	onclose={() => (ui.sheet = null)}
	dirty={!importing && (named || !!description.trim() || !!reference)}
	backDiscards
	back={importing
		? () => page(false)
		: ui.returnTo === 'clip'
			? () => (ui.sheet = 'clip')
			: undefined}
	backTo={importing
		? t('moves.addState')
		: displayMove(ui.clip, store.project?.manifest.rig.animations ?? [])}
	opener={importing || isDemo()
		? undefined
		: {
				label: t('moveImport.importStates'),
				icon: Import,
				iconOnly: true,
				onclick: () => page(true)
			}}
	footer={importing ? (importer.ready ? importFoot : undefined) : footer}
>
	{#if importing}<ImportMovesPane {importer} onqueued={() => (ui.sheet = 'move')} />{/if}
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
				<div class="bu-notice source-changed" data-size="compact" data-tone="warning" role="status">
					<p>{t('stateCapture.concurrentEdit')}</p>
					<button
						class="bu-btn"
						data-variant="outline"
						type="button"
						data-trail="stateCapture.reload"
						onclick={reloadSource}>{t('stateCapture.reload')}</button
					>
				</div>
			{:else if !views}
				<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
					{t('stateCapture.unavailable')}
				</p>
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
				<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
					{t(nameIssue)}
				</p>
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
							onvalue={describe}
							spec={enhanceSpec}
							activity={{ scope: enhanceScope, label: 'Enhance State instructions' }}
							maxOutput={model === 'pixen' && !guided ? 500 : 2000}
							enhanceDisabled={!!busy}
							disabled={!!busy}
						/>
						<PromptSuggestions
							label={t('stateCapture.poseIdeas')}
							value={description}
							suggestions={promptSuggestions('state.pose')}
							active={ridingIdea ? RIDING_STATE : undefined}
							onpick={pickIdea}
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
				{#if !guided}
					{#if !modelEdited && savedModel !== undefined && initialModel !== savedModel}
						<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
							{t('creationSettings.fallback', {
								setting: t('create.form.model'),
								value: t('create.form.models.pro.label')
							})}
						</p>
					{/if}
					<details class="disclosure" bind:open={advancedOpen}>
						<summary><ChevronRight size={14} />{t('common.advanced')}</summary>
						<label class="field">
							<span class="label">{t('create.form.model')}</span>
							<ModelSelect
								value={model}
								options={[
									{ value: 'pro', label: t('create.form.models.pro.label') },
									{ value: 'pro-flash', label: t('create.form.models.proFlash.label') },
									{ value: 'pixen', label: 'V3 (Pixen)' }
								]}
								cost={modelCost}
								onopen={priceModels}
								onpick={(next) => {
									modelEdited = true;
									model = next;
								}}
								disabled={!!busy || referenceLoading}
							/>
						</label>
					</details>
				{/if}
				{#if quote}
					{@const managed = quote.plan.endpoint === '/create-character-state'}
					<div class="bu-notice" data-size="compact" data-tone="neutral" role="status">
						<div>
							{#if managed}
								<p>
									{t('stateGeneration.managed', { parent: quote.parentName || clipName(clip) })}
								</p>
							{:else}
								<p>{t('stateGeneration.localOnly')}</p>
								{#if guided}<p>{t('moveSheet.models.skeletonV3')}</p>{/if}
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
	<p class="faint small" role="status">{busy ? t(busy) : ''}</p>
	{#if failure}<p class="bu-notice" data-size="compact" data-tone="danger" role="alert">
			{displayNestedMessage(failure)}<ReportButton error={failure} />
		</p>{/if}
	{#if priceFailure && editing}<p
			class="bu-notice"
			data-size="compact"
			data-tone="danger"
			role="alert"
		>
			{displayNestedMessage(priceFailure)}<ReportButton
				error={priceCause ?? priceFailure}
				message={typeof priceFailure === 'object' ? priceFailure : undefined}
			/>
		</p>{/if}
</Sheet>
{#snippet importFoot()}
	<ImportFoot
		busy={importer.busy}
		disabled={!importer.chosen.length || !!importer.blocked}
		onimport={() => void importer.save()}
	/>
{/snippet}

{#snippet footer()}
	<div class="state-footer">
		<p class="muted small">
			{#if !editing}
				<span>{t('stateCapture.noCredits')}</span>
			{:else if quote}
				<strong>{stateCostText(quote.plan.cost)}</strong>
			{:else if pricing}
				<span>{t('stateGeneration.quoting')}</span>
			{:else}
				<span>{t('stateGeneration.costFirst')}</span>
			{/if}
			<span>{t('stateCapture.noEquipment')}</span>
		</p>
		{#if editing && connected}
			<!-- One meaning per button: it always generates, and waits for the price shown beside it. -->
			{#if priceFailure && !quote && !pricing}
				<button
					class="bu-btn"
					data-variant="outline"
					type="button"
					disabled={!!busy || !formReady}
					data-trail="stateCapture.retryPrice"
					onclick={() => priceRetry++}>{t('common.tryAgain')}</button
				>
			{:else}
				<button
					class="bu-btn"
					data-variant="primary"
					type="button"
					disabled={!!busy || !formReady || !quote}
					data-trail="stateCapture.generate"
					onclick={generate}>{t('stateGeneration.generate')}</button
				>
			{/if}
		{:else}
			<button
				class="bu-btn"
				data-variant="primary"
				type="submit"
				form={formId}
				data-trail="stateCapture.save"
				disabled={!!busy || !formReady}
				>{t(
					busy === 'stateCapture.saving'
						? 'stateCapture.saving'
						: !editing
							? 'stateCapture.title'
							: 'connectSheet.titleConnectPixelLab'
				)}</button
			>
		{/if}
	</div>
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
</style>
