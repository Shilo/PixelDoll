<script lang="ts">
	// A generating item: progress from the ledger and its landed frames, then an optional review (round 10: a clean draft saves
	// itself; Keep it / Try again / Discard stay available for the rest). Wear shows the draft on the character meanwhile.
	import { bakedFrame, composeCell } from '../lib/compose/compose.ts';
	import { live, queue } from '../lib/pixellab/queue.ts';
	import {
		failsOf,
		gensOf,
		usdOf,
		unknownCostsOf,
		hasStructuralFailure,
		incompleteCoverage,
		isClean
	} from '../lib/items/run.ts';
	import { loadProject } from '../lib/store/project.ts';
	import { itemRoute } from './itemRoute.ts';
	import { app } from '../lib/app.svelte.ts';
	import { tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import Sprite from './Sprite.svelte';
	import { plainReasonMessage } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { slotLabelMessage } from './slots.ts';
	import { displayMessage } from '../lib/i18n.ts';
	import {
		generationCallOutcome,
		generationErrorMessage,
		generationLogMessage
	} from './generationStatus.ts';
	import {
		ui,
		doc,
		store,
		acceptGen,
		discardGen,
		retryGen,
		wearDraft,
		type Gen
	} from './state.svelte.ts';
	import { CircleAlert, CircleCheck, ChevronRight, LoaderCircle, TriangleAlert } from './icons.ts';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { draftPlan, draftQueueIds, itemPlan, type PeekCall } from './apiPlans.ts';
	import { displayDirection, displayDirectionInSentence } from './displayDirection.ts';
	import { usdText } from './displayCost.ts';
	import { displayKey } from './displayKey.ts';
	import { formatNumber, t } from 'svelte-whisper';

	let { g }: { g: Gen } = $props();
	const outcomeFormatters = { render: displayMessage, formatNumber };
	const spent = $derived(gensOf(g.draft, $queue.jobs));
	const spentUsd = $derived(usdOf(g.draft, $queue.jobs));
	const spentUnknown = $derived(unknownCostsOf(g.draft, $queue.jobs));
	const outcome = $derived(generationCallOutcome(g, $queue.jobs));
	const providerFailed = $derived(outcome?.record.jobs.some((job) => job.failedAtProvider));
	const policy = $derived(outcome?.record.jobs.some((job) => job.policy || job.errorCode === 5000));
	const error = $derived(
		displayMessage(generationErrorMessage(g, $queue.jobs, outcomeFormatters) ?? '')
	);
	const unsettledCost = $derived(
		draftQueueIds(g.draft).some((id) => !$queue.jobs.some((job) => job.id === id && !live(job)))
	);
	const res = $derived(store.results[g.draft.spec.id]);
	const prev = $derived(res?.preview);
	const anims = $derived(
		prev?.manifest.rig.animations.filter((a) => g.draft.spec.anims.includes(a.id)) ?? []
	);
	const moveIds = $derived(anims.map((a) => a.id));
	const anim = $derived(anims.find((a) => a.id === ui.anim) ?? anims[0]);
	const dirs = $derived(
		prev && anim
			? prev.manifest.rig.directions.filter((d) =>
					(g.draft.spec.clipDirs?.[anim.id] ?? g.draft.spec.dirs).includes(d.mirrorOf ?? d.id)
				)
			: []
	);
	const k = $derived(Math.max(1, Math.floor(ui.dpr)));
	const frame = $derived(prev ? bakedFrame(prev.manifest) : undefined); // a 96 px held item shows whole
	const reasons = $derived(
		res
			? [
					...new Set([
						...g.draft.calls
							.flatMap((_, i) => failsOf(res, i))
							.flatMap((s) => s.split(/;\s*/))
							.map((reason) => displayMessage(plainReasonMessage(reason))),
						...(res.retryKey ? [t('genCard.retryKey', { color: displayKey(res.retryKey) })] : [])
					])
				]
			: []
	);
	const warns = $derived(
		res?.qa?.warnings.map((reason) => displayMessage(plainReasonMessage(reason))) ?? []
	);
	const incomplete = $derived(!res || !prev || incompleteCoverage(g.draft, prev.manifest.rig, res));
	const clean = $derived(!!res && !incomplete && isClean(res));
	const worn = $derived(doc.drafts[g.draft.spec.slot] === g.draft.spec.id);
	// views whose frames are still generating (the preview item lists them as pending)
	const loadingDirs = $derived(
		g.phase === 'running' && anim
			? new Set(
					prev?.manifest.items
						.find((i) => i.id === g.draft.spec.id)
						?.pending?.filter((k) => k.startsWith(`${anim.id}/`))
						.map((k) => k.split('/')[1])
				)
			: new Set<string>()
	);
	let retryGens = $state<number | null>(null);
	let retryTier = $state(0);
	const tierNoticeId = $props.id();
	const retryBlocked = $derived(
		tierDecision(app.balance, { required: retryTier }).kind === 'required'
	);
	let retryPlan = $state.raw<PeekCall[]>([]);
	let retryEstimateError = $state(false);
	$effect(() => {
		const projectId = g.draft.rigId,
			input = { ...$state.snapshot(g.input), ...(res?.retryKey ? { key: res.retryKey } : {}) };
		void store.project?.manifest; // Re-price when the character's coverage changes.
		let current = true;
		retryGens = null;
		retryTier = 0;
		retryPlan = [];
		retryEstimateError = false;
		// Try again creates a fresh item plan; old fallback calls are not the next attempt's plan.
		void loadProject(projectId)
			.then((ctx) => {
				const plan = itemRoute.plan(ctx.rec.manifest.rig, ctx, input);
				if (current) {
					retryGens = plan.gens;
					retryTier = plan.minimumTier;
					retryPlan = itemPlan(ctx, input);
				}
			})
			.catch(() => {
				if (current) retryEstimateError = true;
			});
		return () => {
			current = false;
		};
	});
	let busy = $state(false);
	async function accept() {
		busy = true;
		try {
			await acceptGen(g);
		} finally {
			busy = false;
		}
	}
	// wear the draft in the review previews
	const outfit = $derived({ [g.draft.spec.slot]: g.draft.spec.id });
	const gens = (n: number) =>
		t('generationDetails.gens', { value: formatNumber(n, { maximumFractionDigits: 2 }) });
	const usd = usdText;
</script>

<div class="gen">
	<header class="insp-head">
		<div class="api-action">
			<h2 class="insp-title">{g.input.name}</h2>
			<ApiPeek
				scope={`item-generation-${g.draft.spec.id}`}
				label={t('genCard.generateLabel', { name: g.input.name })}
				plan={draftPlan(g.draft)}
				queueIds={draftQueueIds(g.draft)}
			/>
		</div>
		<p class="insp-sub">
			<span>{displayMessage(slotLabelMessage(store.project?.manifest, g.input.slot))}</span>
			{#if g.phase === 'review'}
				{#if clean}<span class="badge clean"
						><CircleCheck size={12} />{t('studioModel.health.clean')}</span
					>{:else}<span class="badge look"
						><TriangleAlert size={12} />{t('studioModel.health.look')}</span
					>{/if}
			{:else if g.phase === 'failed'}<span class="badge look"
					><CircleAlert size={12} />{g.canceled
						? t('generation.status.canceled')
						: t('generation.status.failed')}</span
				>
			{:else}<span class="badge accent">{t('activity.generating')}</span>{/if}
		</p>
	</header>

	{#if g.draft.rigId === doc.id && g.phase !== 'failed'}
		<button class="bu-action btn" data-variant="outline" onclick={() => wearDraft(g.draft.spec.id)}
			>{worn ? t('common.takeOff') : t('common.wear')}</button
		>
	{/if}

	{#if prev && anim}
		<label class="field"
			><span class="label small">{t('genCard.previewMove')}</span><select
				class="bu-input input"
				value={anim.id}
				onchange={(e) => {
					ui.anim = e.currentTarget.value;
					ui.frame = 0;
				}}
				>{#each anims as a (a.id)}<option value={a.id}>{displayMove(a.id, moveIds)}</option
					>{/each}</select
			></label
		>
		<div class="review-grid" aria-label={t('genCard.previewGrid')}>
			{#each dirs as d (d.id)}
				<figure>
					<Sprite
						img={composeCell(
							prev,
							outfit,
							anim.id,
							d.id,
							anim.frames[ui.frame % anim.frames.length].cell,
							frame
						)}
						{k}
						w={frame?.w}
						h={frame?.h}
						checker
						label={t('genCard.facing', {
							name: g.input.name,
							direction: displayDirectionInSentence(d.id)
						})}
					/>
					<span class="dir-caption"
						>{#if loadingDirs.has(d.mirrorOf ?? d.id)}<LoaderCircle
								size={12}
								class="spin"
								aria-label={t('genCard.loading')}
							/>{/if}{displayDirection(d.id)}</span
					>
				</figure>
			{/each}
		</div>
	{/if}

	{#if g.phase === 'review'}
		{#if !res?.qa}
			<p class="muted small">{t('genCard.checking')}</p>
		{:else if reasons.length || warns.length}
			<ul class="reasons small">
				{#each [...new Set([...reasons, ...warns])] as r (r)}<li>
						<TriangleAlert size={12} />{r}
					</li>{/each}
			</ul>
		{:else if clean}
			<p class="muted small">{t('generation.outcome.passed')}</p>
		{:else}
			<p class="muted small">{t('genCard.someChecks')}</p>
		{/if}
		{#if !clean}<p class="notice warn small">
				{t('genCard.noRetryStarted')}
			</p>{/if}
		<div class="actions">
			<button
				class="bu-action btn primary"
				data-variant="primary"
				onclick={accept}
				disabled={busy || !res?.qa || hasStructuralFailure(res) || incomplete}
				>{t('genCard.keep')}</button
			>
			<span class="api-action"
				><ApiPeek
					scope={`item-retry-${g.draft.spec.id}`}
					label={t('genCard.retryLabel', { name: g.input.name })}
					plan={retryPlan}
				/><button
					class="bu-action btn"
					data-variant="outline"
					onclick={() => retryGens !== null && retryGen(g, retryGens, res?.retryKey, retryTier)}
					disabled={busy || retryGens === null || retryBlocked}
					aria-describedby={retryBlocked ? tierNoticeId : undefined}
					>{t('common.tryAgain')}
					<span class="cost"
						>{t('moves.estimate', {
							gens: retryGens === null ? '–' : formatNumber(retryGens)
						})}</span
					></button
				></span
			>
			<button
				class="bu-action btn plain danger"
				data-variant="quiet"
				onclick={() => discardGen(g)}
				disabled={busy}>{t('common.discard')}</button
			>
		</div>
		{#if incomplete}<p class="notice warn small">
				{t('genCard.incomplete')}
			</p>{/if}
	{:else if g.phase === 'failed'}
		<p class="notice bad small">
			<CircleAlert size={14} />{g.canceled
				? t('genCard.canceledDetail')
				: policy
					? t('genCard.declined')
					: providerFailed
						? error
							? t('genCard.providerFailedError', { error })
							: t('genCard.providerFailed')
						: error
							? t('genCard.notMadeError', { error })
							: t('genCard.notMade')}
		</p>
		{#if providerFailed && !g.canceled}
			<p class="faint small">
				{spentUnknown || unsettledCost
					? t('genCard.costUnreported')
					: spent || spentUsd
						? t('genCard.costReported', {
								cost: [spent ? gens(spent) : '', spentUsd ? usd(spentUsd) : '']
									.filter(Boolean)
									.join(' + ')
							})
						: t('genCard.noCharge')}
				{t('genCard.newPaidAttempt')}
			</p>
		{/if}
		<div class="actions">
			<span class="api-action"
				><ApiPeek
					scope={`item-retry-${g.draft.spec.id}`}
					label={t('genCard.retryLabel', { name: g.input.name })}
					plan={retryPlan}
				/><button
					class="bu-action btn primary"
					data-variant="primary"
					onclick={() => retryGens !== null && retryGen(g, retryGens, res?.retryKey, retryTier)}
					disabled={busy || retryGens === null || retryBlocked}
					aria-describedby={retryBlocked ? tierNoticeId : undefined}
					>{t('common.tryAgain')}
					<span class="cost"
						>{t('moves.estimate', {
							gens: retryGens === null ? '–' : formatNumber(retryGens)
						})}</span
					></button
				></span
			>
			<button class="bu-action btn plain danger" data-variant="quiet" onclick={() => discardGen(g)}
				>{t('common.discard')}</button
			>
		</div>
	{/if}

	{#if g.phase !== 'running'}<TierNotice
			id={tierNoticeId}
			minimumTier={retryTier}
			feature={t('genCard.retryFeature')}
		/>{/if}
	{#if g.phase !== 'running' && retryEstimateError}<p class="notice bad small">
			<CircleAlert size={14} />{t('genCard.estimateFailed')}
		</p>{/if}
	{#if g.phase !== 'running'}<p class="faint small">
			{t('genCard.retryNote')}
		</p>{/if}
	<details class="disclosure">
		<summary><ChevronRight size={14} />{t('common.details')}</summary>
		<div>
			<dl class="kv">
				<dt>{t('common.prompt')}</dt>
				<dd>{g.draft.spec.prompt}</dd>
				<dt>{t('itemPane.slot')}</dt>
				<dd>
					{t('genCard.slotKey', { slot: g.draft.spec.slot, key: displayKey(g.draft.spec.key) })}
				</dd>
				<dt>{t('experience.tabMoves')}</dt>
				<dd>{g.draft.spec.anims.join(', ')} × {g.draft.spec.dirs.join(', ')}</dd>
				<dt>{t('genCard.calls')}</dt>
				<dd>
					{g.draft.calls
						.map((c, i) =>
							c.rerolls
								? t('genCard.callRerolls', {
										index: formatNumber(i + 1),
										cells: formatNumber(c.cells.length),
										rerolls: formatNumber(c.rerolls)
									})
								: t('genCard.call', {
										index: formatNumber(i + 1),
										cells: formatNumber(c.cells.length)
									})
						)
						.join(' · ')}
				</dd>
				<dt>{t('genCard.spent')}</dt>
				<dd>
					{[
						gens(spent),
						spentUsd ? usd(spentUsd) : '',
						spentUnknown ? t('apiPeek.unknownCount', { count: formatNumber(spentUnknown) }) : ''
					]
						.filter(Boolean)
						.join(' + ')}
				</dd>
				{#if res?.qa?.qa.rawKeyReviewFrames}<dt>{t('itemPane.rawBodyDifferences')}</dt>
					<dd>
						{t('genCard.rawDifferencesDetail', {
							count: formatNumber(res.qa.qa.rawKeyReviewFrames)
						})}
					</dd>{/if}
				{#if error}<dt>{t('genCard.error')}</dt>
					<dd>{error}</dd>{/if}
			</dl>
			{#if g.draft.log.length}<p class="faint small">
					{g.draft.log
						.map((line) =>
							displayMessage(generationLogMessage(g, $queue.jobs, line, outcomeFormatters))
						)
						.join(' · ')}
				</p>{/if}
		</div>
	</details>
</div>
