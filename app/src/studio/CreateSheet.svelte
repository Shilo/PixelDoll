<script lang="ts">
	import Sheet from './Sheet.svelte';
	import WardrobeVisibility from './WardrobeVisibility.svelte';
	import PopoverArrow from './PopoverArrow.svelte';
	import { popoverFocus } from './experience/focus.ts';
	import TierNotice from './TierNotice.svelte';
	import { GENERATION_RECOMMENDATION } from '../lib/pixellab/plans.ts';
	import { customize } from './experience/state.svelte.ts';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { createPlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import Sprite from './Sprite.svelte';
	import { composeCell } from '../lib/compose/compose.ts';
	import { loadProject } from '../lib/store/project.ts';
	import type { Project } from '../lib/store/manifest.ts';
	import type { ClipQa } from '../lib/rig/clips.ts';
	import { estimate, type CreateSpec } from './create.ts';
	import CharacterForm from './CharacterForm.svelte';
	import {
		CREATE_STEPS,
		autoFrame,
		draftErrors,
		facingOf,
		freshSeed,
		newCharacterDraft,
		styleOf
	} from './characterConfig.ts';
	import { nameFrom, bodyQualityNote as plain } from './model.ts';
	import {
		ui,
		creating,
		startCreate,
		createBusy,
		cancelCreate,
		openProject,
		withKey
	} from './state.svelte.ts';
	import { Check, CircleAlert, Shirt, TriangleAlert } from './icons.ts';
	import { displayDirection, displayDirectionInSentence } from './displayDirection.ts';
	import { displayMove } from './displayMove.ts';
	import { displayError, displayMessage } from '../lib/i18n.ts';
	import { errorText } from '../lib/message.ts';
	import { formatNumber, getLocale, t } from 'svelte-whisper';
	const wardrobeMenuId = $props.id();
	const policyDecline = /\b5000\b|policy/i;
	let d = $state(formDrafts.character ?? newCharacterDraft());
	formDrafts.character = undefined;
	let enhancing = $state(false);
	let referenceLoading = $state(false);
	const frameSize = $derived(d.auto && Number.isFinite(d.body) ? autoFrame(d.body!) : d.frame);
	const errors = $derived(draftErrors(d));
	const formSpec = $derived<CreateSpec>({
		description: d.prompt,
		...(d.reference
			? {
					reference: {
						base64: d.reference.base64,
						width: d.reference.width,
						height: d.reference.height
					}
				}
			: {}),
		name:
			d.name.trim() ||
			(d.details ? nameFrom(d.details) : d.kind !== 'Not set' ? d.kind : 'My character'),
		seed: d.seed ? Number(d.seed) : 0,
		size: d.body || 0,
		frame: frameSize,
		view: d.view,
		directions: facingOf(d),
		exactPrompt: true,
		...styleOf(d)
	});
	const est = $derived(estimate(creating.spec ?? formSpec));
	const lo = $derived(Math.round(est.gens)),
		hi = $derived(Math.ceil(est.maxGens / 5) * 5);
	function connectEnhance(target: 'details' | 'prompt') {
		const draft = $state.snapshot(d);
		delete draft.enhanceOnConnect;
		formDrafts.character = draft;
		withKey(() => {
			formDrafts.character = { ...draft, enhanceOnConnect: target };
			ui.sheet = 'create';
		});
	}
	const running = $derived(!!creating.spec && !creating.projectId && !creating.error);
	const stepIx = $derived(CREATE_STEPS.findIndex((s) => s.id === creating.progress?.step));
	let result = $state.raw<Project | null>(null);
	let failedNotes = $state<string[]>([]);
	const qualityNotes = $derived([...new Set([...failedNotes, ...creating.warnings])]);
	$effect(() => {
		const id = creating.projectId;
		let active = true;
		result = null;
		failedNotes = [];
		if (id)
			void loadProject(id).then(({ rec, project }) => {
				if (!active) return;
				result = project;
				const qa = rec.rigQa as { clips?: Record<string, ClipQa> } | undefined;
				failedNotes = Object.entries(qa?.clips ?? {}).flatMap(([clip, qa]) =>
					[...qa.fails, ...(qa.warnings ?? [])].map((f) => `${clip}: ${f}`)
				);
			});
		return () => {
			active = false;
		};
	});
	let frame = $state(0);
	$effect(() => {
		const timer = setInterval(() => frame++, 110);
		return () => clearInterval(timer);
	});
	const k = $derived(Math.max(1, Math.floor(ui.dpr * (ui.size === 'compact' ? 1.25 : 2))));

	function go() {
		if (errors.length || enhancing || referenceLoading) return;
		formDrafts.character = $state.snapshot(d);
		const spec = { ...$state.snapshot(formSpec), seed: d.seed ? Number(d.seed) : freshSeed() };
		withKey(() => {
			if (!createBusy()) formDrafts.character = undefined;
			void startCreate(spec);
			ui.sheet = 'create';
		}); // refused (a resumed create runs): keep the form
	}
	const gensRange = $derived(
		t('create.sheet.gensRange', { lo: formatNumber(lo), hi: formatNumber(hi) })
	);
	async function open() {
		const id = creating.projectId;
		await cancelCreate();
		ui.sheet = null;
		ui.welcome = false;
		await openProject(id);
		customize();
	}
</script>

<Sheet
	title={t('create.sheet.title')}
	cancel={running ? 'common.hide' : creating.projectId ? 'common.close' : 'common.cancel'}
	onclose={() => (ui.sheet = null)}
	className="character-sheet"
	wide
>
	{#snippet heading()}{#if !creating.spec}<label class="character-name-field"
				><span>{t('common.name')}</span><input
					class="bu-input input character-name"
					aria-label={t('common.name')}
					title={t('create.sheet.nameTitle')}
					bind:value={d.name}
					placeholder={t('common.name')}
					maxlength="80"
				/></label
			>{/if}{/snippet}
	{#snippet trailing()}
		<button
			class="bu-action btn creation-wardrobe"
			data-variant="quiet"
			aria-label={t('toolbar.wardrobeSettings')}
			title={t('toolbar.wardrobeSettings')}
			popovertarget={wardrobeMenuId}><Shirt size={18} aria-hidden="true" /></button
		>
		{#if creating.projectId && !running}
			<button
				class="bu-action btn plain link done"
				data-variant="quiet"
				onclick={() => (ui.sheet = null)}>{t('common.close')}</button
			>
		{/if}
		<div
			id={wardrobeMenuId}
			class="menu options-menu bu-popover-anchor"
			data-placement="bottom-start"
			popover
			ontoggle={popoverFocus}
		>
			<PopoverArrow />
			<div class="menu-surface bu-popover-surface bu-floating"><WardrobeVisibility /></div>
		</div>
	{/snippet}
	{#if creating.projectId}
		<div class="create-review">
			<ApiPeek
				scope="character-create-result"
				label={t('create.sheet.resultLabel')}
				plan={creating.spec ? createPlan(creating.spec) : []}
				activityScope={creating.spec?.activityScope}
			/>
			<h3 style="font-size:var(--fs-title)">
				{t('create.sheet.ready', { name: creating.spec?.name ?? '' })}
			</h3>
			{#if result}
				{@const a =
					result.manifest.rig.animations.find((x) => x.id === 'walk') ??
					result.manifest.rig.animations[0]}
				<div class="review-grid">
					{#each result.manifest.rig.directions as d (d.id)}
						<figure>
							<Sprite
								img={composeCell(result, {}, a.id, d.id, a.frames[frame % a.frames.length].cell)}
								w={result.manifest.rig.cell.w}
								h={result.manifest.rig.cell.h}
								{k}
								checker
								label={t('create.sheet.resultFrame', {
									name: creating.spec?.name ?? '',
									move: getLocale() === 'en' ? a.id : displayMove(a.id),
									direction: displayDirectionInSentence(d.id)
								})}
							/>{displayDirection(d.id)}
						</figure>
					{/each}
				</div>
			{/if}
			{#if qualityNotes.length}
				<details class="quality-notes small" open={failedNotes.length > 0}>
					<summary>{t('create.sheet.qualityNotes', { count: qualityNotes.length })}</summary>
					<ul class="reasons">
						{#each qualityNotes as w (w)}<li><TriangleAlert size={12} />{plain(w, t)}</li>{/each}
					</ul>
				</details>
			{/if}
		</div>
	{:else if running || creating.error}
		<div class="form">
			<div class="api-action">
				<p style="font-weight:600">{creating.spec?.name}</p>
				<ApiPeek
					scope="character-create-progress"
					label={t('create.sheet.progressLabel')}
					plan={creating.spec ? createPlan(creating.spec) : []}
					activityScope={creating.spec?.activityScope}
				/>
			</div>
			<ol class="steps-list">
				{#each CREATE_STEPS as s, i (s.id)}
					<li class:done={i < stepIx} class:now={i === stepIx}>
						{#if i < stepIx}<Check size={16} />{:else if i === stepIx && !creating.error}<span
								class="bu-ring ring spin"
								aria-hidden="true"
							></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}
						{displayMessage(
							s.label
						)}{#if i === stepIx && creating.progress && creating.progress.total > 1}<span
								class="muted num small"
								>&nbsp;{creating.progress.done}/{creating.progress.total}</span
							>{/if}
					</li>
				{/each}
			</ol>
			{#if creating.views.length}
				<div class="review-grid">
					{#each creating.views as v (v.id)}<figure>
							<Sprite
								img={v.img}
								{k}
								checker
								label={t('create.sheet.standingFrame', {
									name: creating.spec?.name ?? '',
									direction: displayDirectionInSentence(v.id)
								})}
							/>{displayDirection(v.id)}
						</figure>{/each}
				</div>
			{/if}
			{#if creating.error}
				<p class="notice bad small">
					<CircleAlert size={14} />{policyDecline.test(errorText(creating.error))
						? t('create.sheet.declined')
						: displayError(creating.error)}
				</p>
			{:else}
				<p class="muted small">
					{t('create.sheet.time', { minutes: formatNumber(est.minutes) })}
				</p>
			{/if}
		</div>
	{:else}
		<TierNotice
			minimumTier={0}
			recommendedTier={GENERATION_RECOMMENDATION.tier}
			feature={t('create.sheet.feature')}
			recommendation={GENERATION_RECOMMENDATION.reason}
		/>
		<CharacterForm
			bind:draft={d}
			bind:busy={enhancing}
			bind:referenceLoading
			onconnect={connectEnhance}
		/>
	{/if}

	{#snippet footer()}
		{#if creating.projectId}
			<span class="foot-note">{t('create.sheet.saved')}</span>
			<button class="bu-action btn primary lg" data-variant="primary" onclick={open}
				>{t('create.sheet.startDressing')}</button
			>
		{:else if creating.error}
			<button class="bu-action btn plain" data-variant="quiet" onclick={cancelCreate}
				>{t('common.startOver')}</button
			>
			<span class="api-action"
				><ApiPeek
					scope="character-create-retry"
					label={t('create.sheet.retryLabel')}
					plan={creating.spec ? createPlan(creating.spec, true) : []}
				/><button
					class="bu-action btn primary"
					data-variant="primary"
					onclick={() =>
						creating.spec &&
						withKey(() => {
							void startCreate({
								...$state.snapshot(creating.spec!),
								projectId: undefined,
								seed: 1 + Math.floor(Math.random() * 1_000_000)
							});
							ui.sheet = 'create';
						})}>{t('common.tryAgain')} <span class="cost">{gensRange}</span></button
				></span
			><!-- new seed: the same one re-reads the cached (bad) results (R6 P2-7) -->
		{:else if running}
			<span class="foot-note">{t('create.sheet.estimated', { gens: gensRange })}</span>
			<button class="bu-action btn" data-variant="outline" onclick={() => (ui.sheet = null)}
				>{t('create.sheet.keepWorking')}</button
			>
		{:else}
			<span class="foot-note creator-cost" title={t('create.sheet.costTitle')}>~{gensRange}</span>
			<span class="api-action"
				><ApiPeek
					scope="character-create"
					label={t('create.sheet.create')}
					plan={createPlan(formSpec, !d.seed)}
				/><button
					class="bu-action btn primary lg"
					data-variant="primary"
					disabled={!!errors.length || enhancing || referenceLoading}
					onclick={go}>{t('create.sheet.create')}</button
				></span
			>
		{/if}
	{/snippet}
</Sheet>

<style>
	:global(.studio-app .character-sheet) .btn.creation-wardrobe {
		left: 40px;
		right: auto;
	}
	@media (max-width: 760px) and (min-height: 541px), (max-height: 540px) and (min-width: 600px) {
		:global(.studio-app .character-sheet) .btn.creation-wardrobe {
			left: 20px;
		}
	}
	.quality-notes {
		width: 100%;
		text-align: left;
		color: var(--text-2);
	}
	summary {
		cursor: pointer;
		padding-block: 8px;
	}
	.reasons {
		padding-top: 4px;
	}
</style>
