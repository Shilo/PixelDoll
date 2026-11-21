<script module lang="ts">
	type Draft = {
		projectId: string;
		name: string;
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
	import { displayError } from '../lib/i18n.ts';
	import type { PickedReference } from '../lib/image/reference.ts';
	import { errorMessage, type Message } from '../lib/message.ts';
	import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { ChevronRight } from './icons.ts';
	import { moveLabel } from './model.ts';
	import { stateCaptureId, stateCaptureNameIssue } from './moveActions.svelte.ts';
	import ReferenceField from './ReferenceField.svelte';
	import Sprite from './Sprite.svelte';
	import { doc, store, ui, withKey } from './state.svelte.ts';
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
	import { stateGenerationSource } from './stateGenerationSource.ts';

	let { onclose, onbusy }: { onclose: () => void; onbusy: (busy: boolean) => void } = $props();
	const projectId = doc.id;
	const initial = connectionDraft?.projectId === projectId ? connectionDraft : undefined;
	connectionDraft = undefined;
	const referenceMax = { width: 512, height: 512 };
	let name = $state(initial?.name ?? '');
	let description = $state(initial?.description ?? '');
	let model = $state<StateGenerationModel>(initial?.model ?? 'pro');
	let advancedOpen = $state(!!initial && initial.model !== 'pro');
	let reference = $state.raw(initial?.reference);
	let referenceLoading = $state(false);
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
	let quoted = $state.raw<{ prepared: PreparedState; draft: Draft; version: string } | null>(null);
	const project = $derived(doc.id === projectId ? store.project : null);
	const source = $derived(project && stateGenerationSource(project, DEFAULT_MOVE));
	const id = $derived(stateCaptureId(name));
	const nameIssue = $derived(
		project &&
			(stateCaptureNameIssue(project.manifest, id) ??
				(Object.hasOwn(store.moveReviews, id) ? 'stateCapture.takenName' : undefined))
	);
	const connected = $derived(!!app.key && !app.keyRejected);
	const quote = $derived(
		quoted &&
			app.key &&
			!app.keyRejected &&
			quoted.prepared.keyRevision === getKeyRevision() &&
			quoted.version === source?.version &&
			quoted.draft.name === name &&
			quoted.draft.description === description &&
			quoted.draft.model === model &&
			quoted.draft.reference === reference
			? quoted.prepared
			: null
	);
	const view = $derived(review?.views[reviewIndex]);
	const sourceView = $derived(
		source && source.version === review?.sourceVersion
			? source.views.find(({ direction }) => direction === view?.direction)
			: undefined
	);
	const standing = $derived(displayMove(DEFAULT_MOVE));
	const flashReference = $derived(model === 'pro-flash' && !!reference);
	const ready = $derived(
		checkedPending &&
			source &&
			!nameIssue &&
			(description.trim() || (model !== 'pixen' && reference)) &&
			!referenceLoading
	);
	const discardable = $derived(
		!checkedPending &&
			(canContinue ||
				(typeof failure !== 'string' &&
					(failure.key === 'stateGeneration.unfinished' ||
						failure.key === 'stateGeneration.invalidResult')))
	);

	async function run(action: NonNullable<typeof busy>, work: () => Promise<void>) {
		if (busy) return;
		busy = action;
		onbusy(true);
		failure = '';
		try {
			await work();
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			busy = null;
			onbusy(false);
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

	function checkCost(event: SubmitEvent) {
		event.preventDefault();
		if (!ready || !source || busy || review) return;
		const draft = { projectId, name, description, model, reference };
		const version = source.version;
		quoted = null;
		if (!connected) {
			connectionDraft = draft;
			withKey(() => {
				if (doc.id !== projectId) return;
				ui.stateCaptureMove = '';
				ui.sheet = 'stateCapture';
			});
			return;
		}
		void run('stateGeneration.quoting', async () => {
			const prepared = await prepareState(
				projectId,
				id,
				draft.model === 'pro-flash' && draft.reference ? '' : draft.description.trim(),
				draft.model,
				draft.model === 'pixen' ? undefined : draft.reference
			);
			quoted = { prepared, draft, version };
		});
	}

	function generate() {
		if (!quote || !ready || busy || review) return;
		const prepared = quote;
		quoted = null;
		checkedPending = false;
		void run('stateGeneration.generating', async () => {
			try {
				review = await startState(prepared);
			} catch (cause) {
				canContinue = await hasStateContinuation(projectId).catch(() => false);
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
			onclose();
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
			<div class="state-views">
				{#if sourceView}
					<figure>
						<Sprite img={sourceView.image} k={3} limit={128} checker label={standing} />
						<figcaption>{standing}</figcaption>
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
		<p class="faint small">{t('stateCapture.noEquipment')}</p>
		{#if confirmDiscard}<p class="notice warn small" role="status">
				{t('stateGeneration.discardWarning')}
			</p>{/if}
		<div class="state-actions">
			<button
				type="button"
				class="bu-action btn"
				data-variant="outline"
				disabled={!!busy}
				onclick={discard}
				>{t(confirmDiscard ? 'stateGeneration.confirmDiscard' : 'common.discard')}</button
			>
			<button
				type="button"
				class="bu-action btn"
				data-variant="primary"
				disabled={!!busy}
				onclick={save}>{t('common.save')}</button
			>
		</div>
	</div>
{:else if checkedPending}
	<form class="state-panel" onsubmit={checkCost} aria-busy={!!busy}>
		<p class="faint small">{t('stateGeneration.source', { source: standing })}</p>
		{#if !source}<p class="notice warn small" role="status">{t('stateGeneration.noSource')}</p>{/if}
		<label class="field">
			<span class="label">{t('stateCapture.name')}</span>
			<input class="bu-input input" bind:value={name} disabled={!!busy} required />
		</label>
		{#if name.trim() && nameIssue}<p class="notice warn small" role="status">{t(nameIssue)}</p>{/if}
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
				<select class="bu-input input" bind:value={model} disabled={!!busy || referenceLoading}>
					<option value="pro">{t('stateGeneration.defaultModel')}</option>
					<option value="pro-flash">{t('create.form.models.proFlash.label')}</option>
					<option value="pixen">V3 (Pixen)</option>
				</select>
			</label>
		</details>
		{#if quote}
			<div class="notice small" role="status">
				<div>
					<strong>{@render costLabel(quote.plan.cost)}</strong>
					{#if quote.plan.endpoint === '/create-character-state'}
						<p>{t('stateGeneration.managed', { parent: quote.parentName || standing })}</p>
					{:else if model === 'pro' && reference}
						<p>{t('stateGeneration.referenceRoute')}</p>
					{/if}
					{#if model === 'pro' && quote.plan.endpoint !== '/create-character-state'}
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
		<div class="state-actions">
			{#if quote}
				<button
					type="button"
					class="bu-action btn"
					data-variant="primary"
					disabled={!!busy || !ready}
					onclick={generate}>{t('stateGeneration.generate')}</button
				>
			{:else}
				<button
					type="submit"
					class="bu-action btn"
					data-variant="primary"
					disabled={!!busy || !ready}
					>{t(
						connected ? 'stateGeneration.checkCost' : 'connectSheet.titleConnectPixelLab'
					)}</button
				>
			{/if}
		</div>
	</form>
{:else if !busy && (failure || canContinue)}
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
				<strong>{@render costLabel(cost)}</strong>
			</div>
		{/if}
	{/if}
	{#if confirmDiscard}<p class="notice warn small" role="status">
			{t('stateGeneration.discardWarning')}
		</p>{/if}
	<div class="state-actions">
		{#if discardable}
			<button type="button" class="bu-action btn" data-variant="outline" onclick={discard}
				>{t(confirmDiscard ? 'stateGeneration.confirmDiscard' : 'common.discard')}</button
			>
		{/if}
		{#if continuation}
			<button type="button" class="bu-action btn" data-variant="primary" onclick={generateRemaining}
				>{t('stateGeneration.generateRemaining')}</button
			>
		{:else if canContinue}
			<button
				type="button"
				class="bu-action btn"
				data-variant="primary"
				onclick={checkContinuationCost}>{t('stateGeneration.checkRemainingCost')}</button
			>
		{:else}
			<button type="button" class="bu-action btn" data-variant="outline" onclick={checkPending}
				>{t('common.tryAgain')}</button
			>
		{/if}
	</div>
{/if}

{#if busy}<p class="faint small" role="status">{t(busy)}</p>{/if}
{#if failure}<p class="notice bad small" role="alert">{displayError(failure)}</p>{/if}

<style>
	.state-panel {
		display: grid;
		gap: 0.75rem;
	}
	.state-panel p {
		margin: 0;
	}
	.state-views,
	.state-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.state-views {
		justify-content: center;
	}
	.state-views figure {
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		margin: 0;
	}
	.state-actions {
		justify-content: flex-end;
	}
</style>
