<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { SegmentedControl } from '@shilo/bronze-ui/svelte';
	import { t } from 'svelte-whisper';
	import { app } from '../lib/app.svelte.ts';
	import { composeCell, layerFrame } from '../lib/compose/compose.ts';
	import { errorMessage, message, type Message } from '../lib/message.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { requestTier, tierDecision } from '../lib/pixellab/plans.ts';
	import { flipH } from '../lib/rig/mirror.ts';
	import { DEFAULT_MOVE, type DirectionName } from '../lib/rig/rig.ts';
	import { appearanceCopyViews, appearancePrompt, editedItem } from './appearanceSource.ts';
	import {
		discardAppearance,
		generateAppearance,
		loadAppearance,
		quoteAppearance,
		readAppearance,
		saveAppearance,
		type AppearanceAttempt,
		type AppearanceReview
	} from './appearanceEdit.ts';
	import { displayDirection } from './displayDirection.ts';
	import { displayDirectionList } from './displayDirectionProblem.ts';
	import { displayMove } from './displayMove.ts';
	import { customize } from './experience/state.svelte.ts';
	import { downloadPaidResults } from './download.svelte.ts';
	import { Download } from './icons.ts';
	import ProblemNotice from './ProblemNotice.svelte';
	import PromptField from './PromptField.svelte';
	import type { EnhanceSpec } from './promptEnhance.ts';
	import ReferenceField from './ReferenceField.svelte';
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import TierNotice from './TierNotice.svelte';
	import {
		doc,
		flushSave,
		openProject,
		refreshProjects,
		toast,
		ui,
		withKey
	} from './state.svelte.ts';
	import { stateCostText } from './stateCost.ts';

	const draft = untrack(() => ui.appearance!);
	const target = draft.target;
	const item = !!target.itemId;
	const form = $props.id();
	const referenceMax = { width: 512, height: 512 };
	const enhanceScope = `appearance-enhance:${target.projectId}:${crypto.randomUUID()}`;
	let loaded = $state.raw<Awaited<ReturnType<typeof loadAppearance>>>();
	let attempt = $state.raw<AppearanceAttempt>();
	let review = $state.raw<AppearanceReview>();
	let quote = $state.raw<Awaited<ReturnType<typeof quoteAppearance>>>(null);
	let failure = $state.raw<Message | string>('');
	let quoteFailure = $state.raw<Message | string>('');
	let quoting = $state(false);
	let generating = $state(false);
	let saving = $state(false);
	let confirmDiscard = $state(false);
	let enhancing = $state(false);
	let referenceLoading = $state(false);
	let facing = $state<DirectionName>();
	let worn = $state(false);
	let reviewTitle = $state<HTMLHeadingElement>();
	let reviewFocused = false;
	let candidate = $state.raw<Awaited<ReturnType<typeof editedItem>>>();
	const source = $derived(loaded?.source);
	const connected = $derived(!!app.key && !app.keyRejected);
	const minimumTier = $derived(
		quote ? requestTier({ method: 'POST', endpoint: quote.endpoint, params: null }) : 0
	);
	const tierBlocked = $derived(
		tierDecision(app.balance, { required: minimumTier }).kind === 'required'
	);
	const description = $derived(
		draft.choice === 'custom'
			? draft.prompt.trim()
			: draft.choice === 'underwear'
				? 'Plain white underwear'
				: 'Bare paper-doll base'
	);
	const prompt = $derived(appearancePrompt(draft.choice, draft.prompt, item));
	const reference = $derived(draft.choice === 'custom' ? draft.reference : undefined);
	const maxPrompt = $derived(
		(draft.model === 'pixen' ? 500 : 2000) - appearancePrompt('custom', 'x', item).length + 1
	);
	const tooLong = $derived(draft.choice === 'custom' && draft.prompt.trim().length > maxPrompt);
	const valid = $derived(!!prompt && !tooLong);
	const dirty = $derived(
		!attempt &&
			!generating &&
			(!!draft.prompt.trim() ||
				!!draft.reference ||
				draft.model !== 'pro' ||
				draft.choice !== (item ? 'custom' : 'underwear'))
	);
	const original = $derived(
		source?.version === (attempt?.sourceVersion ?? source?.version) ? source?.views : undefined
	);
	const directions = $derived(
		(attempt && !original
			? (review?.views.map(({ direction }) => ({ id: direction, mirrorOf: undefined })) ?? [])
			: (loaded?.project.manifest.rig.directions ?? [])
		).filter(({ id, mirrorOf }) =>
			(original ?? review?.views)?.some(
				({ direction }) => direction === id || direction === mirrorOf
			)
		)
	);
	const selected = $derived(
		directions.find(({ id }) => id === facing) ??
			directions.find(({ id }) => id === ui.dir) ??
			directions[0]
	);
	const recordStatus = $derived(
		attempt
			? $queue.jobs
					.filter(({ activityScope }) => activityScope?.startsWith(`appearance:${attempt!.id}:`))
					.map(
						({ id, state, jobs }) =>
							`${id}:${state}:${jobs.reduce((n, job) => n + job.results.length, 0)}`
					)
					.join('|')
			: ''
	);
	const blocked = $derived(!!attempt && source?.version !== attempt.sourceVersion);
	const running = $derived(generating || review?.running);
	const canSave = $derived(!!review?.views.length && !blocked && !running);
	const copyViews = $derived(
		source && review?.views.length && !blocked
			? appearanceCopyViews(source, review.views)
			: review?.views
	);
	const keptDirections = $derived(
		canSave && !review?.complete
			? directions
					.filter(({ id, mirrorOf }) =>
						review?.views.every(({ direction }) => direction !== id && direction !== mirrorOf)
					)
					.map(({ id }) => id)
			: []
	);
	const canDownload = $derived(
		!running && review?.records.some(({ jobs }) => jobs.some(({ results }) => results.length))
	);
	const resultFrame = $derived.by(() => {
		if (!worn || !candidate || !loaded || !source || !selected || !source.item) return null;
		const p = loaded.project;
		return composeCell(
			{
				manifest: { ...p.manifest, items: [...p.manifest.items, candidate.item] },
				images: new Map([...p.images, ...candidate.images])
			},
			{ [source.item.slot]: candidate.item.id },
			source.clip,
			selected.id,
			source.cell,
			layerFrame(p.manifest.rig, candidate.item.layers[0])
		);
	});
	const originalFrame = $derived.by(() => {
		if (worn && original && loaded && source?.item && selected)
			return composeCell(
				loaded.project,
				{ [source.item.slot]: source.item.id },
				source.clip,
				selected.id,
				source.cell,
				layerFrame(loaded.project.manifest.rig, source.item.layers[0])
			);
		return imageFor(original);
	});
	const enhanceSpec = $derived.by((): EnhanceSpec | null =>
		originalFrame ? { kind: 'pose', first: originalFrame, last: reference?.base64 } : null
	);

	function imageFor(views: typeof original) {
		const match = views?.find(({ direction }) => direction === selected?.id);
		if (match) return match.image;
		const mirror = views?.find(({ direction }) => direction === selected?.mirrorOf);
		return mirror ? flipH(mirror.image) : null;
	}

	$effect(() => {
		let active = true;
		void flushSave()
			.then(() => loadAppearance(target))
			.then((value) => {
				if (!active) return;
				loaded = value;
				attempt = value.attempt;
				if (value.attempt) {
					draft.choice = value.attempt.choice;
					draft.model = value.attempt.model;
					draft.prompt = value.attempt.choice === 'custom' ? value.attempt.description : '';
				}
			})
			.catch((error: unknown) => {
				if (active) failure = errorMessage(error);
			});
		return () => {
			active = false;
		};
	});
	$effect(() => {
		const current = source,
			model = draft.model,
			image = reference;
		const eligible = model !== 'pro-flash' || connected;
		let active = true;
		quote = null;
		quoteFailure = '';
		const shouldQuote = !!current && eligible && !attempt;
		quoting = shouldQuote;
		if (shouldQuote && current)
			void quoteAppearance(current, model, image)
				.then((price) => {
					if (active) quote = price;
				})
				.catch((error: unknown) => {
					if (active) quoteFailure = errorMessage(error);
				})
				.finally(() => {
					if (active) quoting = false;
				});
		return () => {
			active = false;
		};
	});
	$effect(() => {
		const current = attempt;
		void recordStatus;
		void generating;
		if (!current) return;
		let active = true;
		void readAppearance(current, source)
			.then((value) => {
				if (active) review = value;
			})
			.catch((error: unknown) => {
				if (active) failure = errorMessage(error);
			});
		return () => {
			active = false;
		};
	});
	$effect(() => {
		const views = copyViews,
			current = source,
			project = loaded?.project;
		let active = true;
		candidate = undefined;
		if (views?.length && current?.item && project && !blocked) {
			void editedItem(project, current, views, 'appearance-preview', current.name, '', [])
				.then((copy) => {
					if (active) candidate = copy;
				})
				.catch((error: unknown) => {
					if (active) failure = errorMessage(error);
				});
		}
		return () => {
			active = false;
		};
	});
	$effect(() => {
		if (reviewTitle && !reviewFocused) {
			reviewFocused = true;
			reviewTitle.focus();
		}
	});

	async function generate(event: SubmitEvent) {
		event.preventDefault();
		if (!source || attempt || generating || enhancing || referenceLoading || !valid) return;
		const approved = quote;
		if (!approved || !connected) return;
		const { model, choice } = draft;
		const instructions = prompt;
		const caption = description;
		const image = reference;
		generating = true;
		failure = '';
		try {
			await flushSave();
			await generateAppearance(
				target,
				source,
				approved,
				model,
				choice,
				instructions,
				caption,
				(value) => {
					attempt = value;
				},
				image
			);
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			generating = false;
		}
	}
	const connect = () => withKey(() => (ui.sheet = 'appearance'));

	async function save() {
		if (!attempt || !review || !canSave || saving) return;
		saving = true;
		failure = '';
		try {
			await flushSave();
			const id = await saveAppearance(attempt, review, t('appearance.editedSuffix'));
			await refreshProjects();
			toast(message('appearance.saved'));
			await openProject(id, item ? { quiet: true } : undefined);
			if (doc.error) {
				toast(doc.error, { tone: 'danger' });
				ui.sheet = null;
			} else if (item) {
				ui.selected = attempt.id;
				ui.sheet = 'item';
			} else {
				customize();
				ui.sheet = draft.back === 'setup' ? 'setup' : null;
			}
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			saving = false;
		}
	}

	async function discard() {
		if (!attempt) return;
		saving = true;
		try {
			await discardAppearance(attempt);
			attempt = undefined;
			review = undefined;
			reviewFocused = false;
			confirmDiscard = false;
			failure = '';
			await tick();
			document
				.getElementById(form)
				?.querySelector<HTMLElement>('textarea, input[type="radio"]:checked')
				?.focus();
		} catch (error) {
			failure = errorMessage(error);
		} finally {
			saving = false;
		}
	}
</script>

<Sheet
	title={source ? t('appearance.titleOf', { name: source.name }) : t('appearance.title')}
	locked={saving}
	{dirty}
	backDiscards
	exitNote={running ? `${form}-running` : undefined}
	onclose={() => (ui.sheet = null)}
	back={draft.back ? () => (ui.sheet = draft.back!) : undefined}
	backTo={draft.back ? t(draft.back === 'setup' ? 'setup.title' : 'studio.titleItem') : undefined}
>
	{#snippet tools()}
		{#if canDownload}
			<button
				type="button"
				class="bu-action btn plain icon"
				data-variant="quiet"
				aria-label={t('paidReview.download')}
				data-trail="appearance.downloadResults"
				title={t('paidReview.download')}
				disabled={saving}
				onclick={() =>
					void downloadPaidResults(
						review!.records.map(({ id }) => id),
						t('appearance.title')
					)}><Download size={20} aria-hidden="true" /></button
			>
		{/if}
	{/snippet}
	{#if failure}<ProblemNotice error={failure} />{/if}
	{#if !loaded && !failure}<p role="status">{t('common.loading')}</p>{/if}
	{#if loaded && !source && !attempt}<p class="bu-notice" data-size="compact" data-tone="neutral">
			{t('appearance.unavailable')}
		</p>{/if}
	{#if source || attempt}
		{#if !attempt}<div class="appearance-context">
				{#if source}<strong>{source.name}</strong>{/if}
				{#if source && loaded && (item || source.clip !== DEFAULT_MOVE)}
					<span class="faint">
						{t(item ? 'appearance.itemScope' : 'appearance.characterSource', {
							move: displayMove(
								source.clip,
								loaded.project.manifest.rig.animations.map(({ id }) => id)
							)
						})}
					</span>
				{/if}
				{#if !item}<span class="faint">{t('appearance.characterScope')}</span>{/if}
			</div>{/if}
		{#if attempt}
			{#if review?.views.length}
				<div class="appearance-review-heading">
					<h3 class="section-title" tabindex="-1" bind:this={reviewTitle}>
						{t('appearance.review')}
					</h3>
					{#if directions.length > 1}
						<select
							aria-label={t('appearance.facing')}
							class="bu-select"
							value={selected?.id}
							onchange={(event) => (facing = event.currentTarget.value as DirectionName)}
						>
							{#each directions as { id } (id)}<option value={id}>{displayDirection(id)}</option
								>{/each}
						</select>
					{/if}
				</div>
				{#if candidate}
					<label class="bu-check appearance-worn">
						<span>{t('appearance.showWorn')}</span>
						<input class="bu-switch" type="checkbox" role="switch" bind:checked={worn} />
					</label>
				{/if}
				<div class="appearance-images">
					{@render sprite(originalFrame, t('appearance.original'))}
					{@render sprite(worn ? resultFrame : imageFor(copyViews), t('appearance.edited'))}
				</div>
			{/if}
			{#if running || !review}<p role="status">{t('appearance.running')}</p>
				<p id={`${form}-running`} class="faint">{t('common.keepsRunning')}</p>
			{:else if blocked}<p class="bu-notice" data-size="compact" data-tone="neutral">
					{t('appearance.changed')}
				</p>
			{:else if keptDirections.length}<p
					class="bu-notice"
					data-size="compact"
					data-tone="warning"
					role="status"
				>
					{t('appearance.keptDirections', { directions: displayDirectionList(keptDirections) })}
				</p>
			{:else if !review.complete}<p class="bu-notice" data-size="compact" data-tone="neutral">
					{t('appearance.incomplete')}
				</p>{/if}
			{#if !running && review && !review.complete}
				<button
					class="bu-action"
					data-variant="quiet"
					data-trail="appearance.activity"
					onclick={() => (ui.sheet = 'activity')}>{t('itemMenu.activity')}</button
				>
			{/if}
			{#if confirmDiscard}
				<p class="bu-notice" data-size="compact" data-tone="warning" role="status">
					{t('appearance.discardNotice')}
				</p>
			{/if}
		{:else if source}
			<form id={form} class="appearance-edit-form" onsubmit={generate}>
				<div class="appearance-form">
					{@render sprite(originalFrame, t('appearance.original'))}
					<div class="appearance-options compact-segments">
						{#if !item}
							<span class="label">{t('appearance.choose')}</span>
							<SegmentedControl
								label={t('appearance.choose')}
								options={[
									{ value: 'underwear', label: t('create.form.underwear') },
									{ value: 'bare', label: t('create.form.nothingWorn') },
									{ value: 'custom', label: t('appearance.custom') }
								]}
								value={draft.choice}
								onchange={(choice) => {
									draft.choice = choice as typeof draft.choice;
									if (choice === 'custom' && draft.reference) draft.model = 'pro';
								}}
							/>
						{/if}
						{#if draft.choice === 'custom'}
							<label class="label" for={`${form}-instructions`}>
								{t('appearance.instructions')}
							</label>
							<PromptField
								id={`${form}-instructions`}
								label={t('appearance.instructions')}
								value={draft.prompt}
								onvalue={(value) => (draft.prompt = value)}
								spec={enhanceSpec}
								activity={{ scope: enhanceScope, label: t('appearance.title') }}
								maxOutput={maxPrompt}
								maxlength={maxPrompt}
								bind:busy={enhancing}
								disabled={generating}
								enhanceDisabled={referenceLoading}
								onconnect={connect}
							/>
							{#if tooLong}<p class="bu-notice" data-size="compact" data-tone="neutral">
									{t('studioSlots.tooLong', { count: maxPrompt })}
								</p>{/if}
							<ReferenceField
								bind:value={draft.reference}
								bind:loading={referenceLoading}
								max={referenceMax}
								disabled={generating || enhancing || draft.model !== 'pro'}
								hint={t('appearance.reference')}
							/>
						{:else if draft.choice === 'underwear'}<p class="faint">
								{t('appearance.underwearHint')}
							</p>{/if}
						<details>
							<summary>{t('common.advanced')}</summary>
							<label class="label" for={`${form}-model`}>{t('create.form.model')}</label>
							<select id={`${form}-model`} class="bu-select" bind:value={draft.model}>
								<option value="pro">Pro</option>
								<option value="pro-flash" disabled={!!reference}>Pro Flash</option>
								<option value="pixen" disabled={!!reference}>Pixen</option>
							</select>
						</details>
					</div>
				</div>
			</form>
			<TierNotice {minimumTier} feature={t('appearance.title')} />
			{#if quote?.warnings.includes('sheet-quality-unverified')}<p class="faint">
					{t('stateGeneration.sheetWarning')}
				</p>{/if}
			{#if quoteFailure}<ProblemNotice error={quoteFailure} />
			{:else if !quote && !quoting && (connected || draft.model !== 'pro-flash')}<p
					class="bu-notice"
					data-size="compact"
					data-tone="neutral"
				>
					{t('appearance.unsupported')}
				</p>{/if}
		{/if}
	{/if}
	{#snippet footer()}
		{#if attempt}
			{#if review && !running}
				<div class="appearance-review-footer">
					{#if canSave}
						<span class="foot-note">{t('appearance.checkViews')}</span>
					{/if}
					<div class="appearance-review-actions">
						<button
							type="button"
							class="bu-action"
							data-variant="outline"
							disabled={saving}
							data-trail="appearance.discard"
							onclick={() => (confirmDiscard ? void discard() : (confirmDiscard = true))}
							>{t(confirmDiscard ? 'stateGeneration.confirmDiscard' : 'common.discard')}</button
						>
						{#if canSave}
							<button
								type="button"
								class="bu-action"
								data-variant="primary"
								disabled={saving}
								data-trail="appearance.save"
								onclick={() => void save()}
								>{t(item ? 'appearance.saveItem' : 'appearance.saveCharacter')}</button
							>
						{/if}
					</div>
				</div>
			{/if}
		{:else if source && !connected}
			{#if quote}<span class="foot-note">{stateCostText(quote.cost)}</span>{/if}
			<button
				class="bu-action appearance-primary"
				data-variant="primary"
				data-trail="appearance.connect"
				onclick={connect}>{t('toolbar.connectPixelLab2')}</button
			>
		{:else if source}
			<button
				class="bu-action appearance-primary"
				data-variant="primary"
				type="submit"
				data-trail="appearance.generate"
				{form}
				disabled={generating || enhancing || referenceLoading || !quote || !valid || tierBlocked}
			>
				{quoting
					? t('stateGeneration.quoting')
					: quote
						? t('appearance.editCost', {
								action: t(item ? 'appearance.editItem' : 'appearance.editCharacter'),
								cost: stateCostText(quote.cost)
							})
						: t(item ? 'appearance.editItem' : 'appearance.editCharacter')}
			</button>
		{/if}
	{/snippet}
</Sheet>

{#snippet sprite(image: import('../lib/image/png.ts').Img | null, label: string)}
	<figure>
		<Sprite img={image} k={3} limit={ui.size === 'compact' ? 88 : 120} checker {label} />
		<figcaption>{label}</figcaption>
	</figure>
{/snippet}

<style>
	.appearance-context,
	.appearance-options {
		display: grid;
		gap: 8px;
	}
	.appearance-edit-form {
		container: appearance-form / inline-size;
	}
	.appearance-form,
	.appearance-images {
		display: grid;
		grid-template-columns: minmax(0, 120px) minmax(0, 1fr);
		gap: 16px;
	}
	.appearance-images {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-block: 12px;
	}
	.appearance-review-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.appearance-review-heading select {
		width: auto;
		max-width: 100%;
	}
	.appearance-options {
		min-inline-size: 0;
		align-content: start;
	}
	.appearance-worn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-block-size: 44px;
	}
	select {
		width: 100%;
	}
	select {
		min-block-size: 40px;
	}
	.appearance-review-footer {
		display: grid;
		gap: 8px;
		inline-size: 100%;
	}
	.appearance-review-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
	.appearance-primary,
	.appearance-review-actions button {
		min-block-size: 44px;
	}
	figure {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 8px;
		margin: 0;
	}
	figcaption {
		font-size: 0.85em;
	}
	.appearance-options p {
		margin: 0;
	}
	summary {
		cursor: pointer;
		min-height: 32px;
		align-content: center;
	}
	@container appearance-form (max-width: 384px) {
		.appearance-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@container appearance-form (max-width: 320px) {
		.appearance-options :global(.bu-segmented) {
			grid-template-columns: minmax(0, 1.24fr) repeat(2, minmax(0, 1fr));
		}
		.appearance-options :global(.bu-segment-face) {
			column-gap: 1px;
			padding-inline: 1px;
		}
	}
	@media (orientation: landscape) and (max-height: 440px) {
		@container appearance-form (max-width: 384px) {
			.appearance-form > figure {
				order: 1;
			}
		}
	}
</style>
