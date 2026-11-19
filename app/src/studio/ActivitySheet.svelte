<script lang="ts">
	import Sheet from './Sheet.svelte';
	import PixelLabUsage from './PixelLabUsage.svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { balancePlan, cancelPlan, queuedPlan } from './apiPlans.ts';
	import { queue, type JobRec } from '../lib/pixellab/queue.ts';
	import { app, refreshBalance } from '../lib/app.svelte.ts';
	import { localizedPlanRestriction, requestTier } from '../lib/pixellab/plans.ts';
	import { displayError, displayMessage } from '../lib/i18n.ts';
	import { queueErrorMessage } from './generationStatus.ts';
	import { usdText } from './displayCost.ts';
	import { formatNumber, t } from 'svelte-whisper';
	import { displayMove } from './displayMove.ts';
	import {
		ui,
		doc,
		store,
		creating,
		moving,
		settingUp,
		gens,
		openProject,
		cleanUp,
		toast
	} from './state.svelte.ts';
	async function clear() {
		let n: Awaited<ReturnType<typeof cleanUp>>;
		try {
			n = await cleanUp();
		} catch (e) {
			console.error('clear finished', e);
			toast(t('activity.clearFailed', { error: displayError(e) }), { tone: 'danger' });
			return;
		}
		toast(
			n.blobs
				? t('activity.clearedWithImages', {
						jobs: t('activity.jobCount', { count: n.jobs }),
						images: t('activity.imageCount', { count: n.blobs })
					})
				: t('activity.cleared', { jobs: t('activity.jobCount', { count: n.jobs }) })
		);
	}
	import { ChevronRight, CircleAlert, CircleCheck, RefreshCw } from './icons.ts';

	let now = $state(Date.now());
	const balanceScope = crypto.randomUUID();
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const jobs = $derived([...$queue.jobs].reverse());
	const running = $derived(jobs.filter((r) => r.state === 'running' || r.state === 'submitting'));
	const queued = $derived(jobs.filter((r) => r.state === 'queued'));
	const done = $derived(
		jobs.filter((r) => !['running', 'submitting', 'queued'].includes(r.state)).slice(0, 12)
	);
	// Job labels are persisted English records; only the generated joint-check label is display text.
	const creatingPending = $derived(creating.spec && !creating.projectId ? creating.spec : null);
	const movingPending = $derived(moving.spec && !moving.done ? moving.spec : null);
	const setupPending = $derived(settingUp.spec && !settingUp.done ? settingUp.spec : null);
	const generatingItems = $derived(gens.filter((gen) => gen.phase === 'running'));
	const flowsPending = $derived(
		creatingPending ||
			movingPending ||
			setupPending ||
			generatingItems.length ||
			moving.queued.length
	);
	const characterName = (id: string) =>
		store.projects.find((project) => project.id === id)?.name ?? t('common.character');
	async function openWork(sheet: 'create' | 'move' | 'setup', projectId?: string) {
		if (projectId && doc.id !== projectId) await openProject(projectId);
		if (ui.sheet === 'activity' && (!projectId || doc.id === projectId)) ui.sheet = sheet;
	}
	const nice = (r: JobRec) =>
		/^skeleton sha256:.{8}/.test(r.label)
			? t('activity.findingJoints')
			: r.label.replace(/^M3 /, '');
	const STATES: Record<JobRec['state'], () => string> = {
		queued: () => t('activity.state.queued'),
		submitting: () => t('activity.state.submitting'),
		running: () => t('activity.state.running'),
		done: () => t('activity.state.done'),
		failed: () => t('activity.state.failed'),
		lost: () => t('activity.state.lost'),
		canceled: () => t('activity.state.canceled')
	};
	const stateText = (state: JobRec['state']) => STATES[state]?.() ?? state;
	const errorText = (r: JobRec) => displayMessage(queueErrorMessage(r, displayMessage) ?? '');
	const money = usdText;
	const gensText = (n: number) =>
		t('generationDetails.gens', { value: formatNumber(n, { maximumFractionDigits: 2 }) });
	// Persisted queue messages are English records. Translate the ones the app itself
	// generates; vendor text and saved errors are shown as received.
	const planWait = (raw: string) => {
		if (raw === 'Checking PixelLab plan before starting this workflow.')
			return t('activity.planWait.checking');
		if (raw === 'Waiting to verify your PixelLab plan. Retrying automatically.')
			return t('activity.planWait.verifying');
		const restriction = localizedPlanRestriction(raw);
		return restriction ? displayError(restriction) : raw;
	};
	const pct = (r: JobRec) => {
		const ps = r.jobs.map((s) => (s.done ? 1 : Math.min(1, s.progress ?? 0)));
		return ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) : 0;
	};
	const mins = (ms: number) => {
		const s = Math.round(ms / 1000);
		return `${formatNumber(Math.floor(s / 60))}:${formatNumber(s % 60, {
			minimumIntegerDigits: 2
		})}`;
	};
	const cost = (r: JobRec) => {
		const known = [r.gens ? gensText(r.gens) : '', r.usd ? money(r.usd) : '']
			.filter(Boolean)
			.join(' + ');
		return r.costUnknown
			? known
				? t('activity.costPlusUnknown', { cost: known })
				: t('activity.costUnknown')
			: known;
	};
	const sessionCost = $derived(
		[
			gensText($queue.sessionGens),
			$queue.sessionUsd ? money($queue.sessionUsd) : '',
			$queue.sessionUnknown
				? t('apiPeek.unknownCount', { count: formatNumber($queue.sessionUnknown) })
				: ''
		]
			.filter(Boolean)
			.join(' + ')
	);
</script>

<Sheet
	title={t('activity.title')}
	cancel={ui.waitingForTab ? 'activity.cancelRequest' : 'common.done'}
	onclose={() => (ui.sheet = null)}
>
	<div class="act-list">
		{#if flowsPending}
			<section class="act-group" aria-label={t('activity.pendingWork')}>
				<span class="sec-title">{t('activity.pendingWork')}</span>
				<ul>
					{#if creatingPending}
						{@render workRow(
							`${t('newCharacterButton.newCharacter')} · ${creatingPending.name}`,
							creating.error ? t('generation.status.needsAttention') : t('activity.inProgress'),
							() => void openWork('create')
						)}
					{/if}
					{#if movingPending}
						{@const task = movingPending.redrawItem
							? t('activity.redrawFrames')
							: movingPending.itemsOnly
								? t('activity.repairFrames')
								: displayMove(movingPending.id)}
						{@render workRow(
							`${task} · ${characterName(moving.projectId)}`,
							moving.repairReview
								? t('activity.readyToReview')
								: moving.error
									? t('generation.status.needsAttention')
									: t('activity.inProgress'),
							() => void openWork('move', moving.projectId)
						)}
					{/if}
					{#if setupPending}
						{@render workRow(
							`${t('activity.characterSetup')} · ${characterName(setupPending.projectId)}`,
							settingUp.error ? t('generation.status.needsAttention') : t('activity.inProgress'),
							() => void openWork('setup', setupPending.projectId)
						)}
					{/if}
					{#each moving.queued as work (work)}
						{@render workRow(
							`${displayMove(work.spec.id)} · ${characterName(work.projectId)}`,
							t('activity.waiting')
						)}
					{/each}
					{#each generatingItems as gen (gen.draft.spec.id)}
						{@render workRow(
							`${gen.input.name} · ${characterName(gen.draft.rigId)}`,
							t('activity.inProgress')
						)}
					{/each}
				</ul>
			</section>
		{/if}
		{#if ui.waitingForTab}
			<div class="notice warn" role="status">
				<CircleAlert size={18} />
				<div class="waiting-copy">
					<h3>{t('activity.waitingTitle')}</h3>
					<p>{t('activity.waitingBody')}</p>
				</div>
			</div>
		{/if}
		<PixelLabUsage>
			{#snippet actions()}
				{#if app.key}<span class="api-action"
						><ApiPeek
							scope="balance-refresh"
							label={t('activity.refreshBalance')}
							plan={balancePlan()}
							activityScope={balanceScope}
						/><button
							class="bu-action btn icon plain"
							data-variant="quiet"
							aria-label={t('activity.refreshBalance')}
							onclick={() =>
								refreshBalance({
									activityScope: balanceScope,
									// Persisted activity records keep their English label; it is copied verbatim.
									label: 'Refresh balance',
									background: false
								})}><RefreshCw size={14} /></button
						></span
					>{:else if !ui.waitingForTab}<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => (ui.sheet = 'connect')}>{t('connectSheet.connect')}</button
					>{/if}
			{/snippet}
		</PixelLabUsage>
		<p class="faint small" data-testid="queue-capacity">
			{t('activity.capacity', { count: $queue.concurrency })}
		</p>
		{#if $queue.capacityRetryAt > now}
			<p class="notice small" role="status">
				{t('activity.busy', {
					seconds: formatNumber(Math.ceil(($queue.capacityRetryAt - now) / 1000))
				})}
			</p>
		{/if}
		{#if $queue.role === 'follower' && !ui.waitingForTab}
			<p class="notice small">
				<CircleAlert size={14} />{t('activity.follower')}
			</p>
		{/if}
		{#if $queue.paused}
			<p class="notice warn small">
				<CircleAlert size={14} />{$queue.paused === 'auth'
					? t('activity.pausedAuth')
					: $queue.paused === 'offline'
						? t('activity.pausedOffline')
						: t('activity.pausedCredits')}
				{#if $queue.paused !== 'offline'}<span class="api-action"
						>{#if $queue.paused !== 'auth'}<ApiPeek
								scope="queue-resume"
								label={t('activity.resumeWaiting')}
								plan={queuedPlan(jobs)}
							/>{/if}<button
							class="bu-action btn sm"
							data-variant="outline"
							onclick={() => ($queue.paused === 'auth' ? (ui.sheet = 'connect') : queue.resume())}
							>{$queue.paused === 'auth' ? t('connectSheet.connect') : t('activity.resume')}</button
						></span
					>{/if}
			</p>
		{/if}
		{#if !ui.waitingForTab && !running.length && !queued.length && !flowsPending}<p class="muted">
				{t('activity.nothing')}
			</p>{/if}
		{#if running.length}
			<section class="act-group">
				<span class="sec-title">{t('activity.generating')}</span>
				{#if running.some((r) => r.state === 'submitting')}<p
						class="faint small"
						id="activity-submitting-stop"
					>
						{t('activity.stopUnavailable')}
					</p>{/if}
				<ul>
					{#each running as r (r.id)}
						{@const waiting = !r.jobs.some((s) => !!s.id)}
						<li>
							<span class="bu-ring ring" class:spin={waiting} style:--p={pct(r)} aria-hidden="true"
							></span><span class="act-main"
								><span class="api-action"
									><b>{nice(r)}</b><ApiPeek
										scope={`job-running-${r.id}`}
										label={nice(r)}
										plan={[]}
										queueIds={[r.id]}
									/></span
								><span class="muted small"
									>{[
										waiting
											? t('activity.waitingForPixelLab')
											: formatNumber(pct(r) / 100, { style: 'percent' }),
										r.jobs[0]?.queuePosition
											? t('activity.inLine', {
													position: formatNumber(r.jobs[0].queuePosition)
												})
											: ''
									]
										.filter(Boolean)
										.join(' · ')}</span
								></span
							>
							<span class="act-meta num"
								>{r.submittedAt ? mins(now - r.submittedAt) : ''}<br /><span class="api-action"
									><ApiPeek
										scope={`job-stop-${r.id}`}
										label={t('activity.stopLabel', { job: nice(r) })}
										plan={cancelPlan(r)}
									/><button
										class="bu-action btn link small"
										data-variant="quiet"
										disabled={r.state === 'submitting'}
										aria-describedby={r.state === 'submitting'
											? 'activity-submitting-stop'
											: undefined}
										onclick={() => queue.cancel(r.id)}>{t('activity.stop')}</button
									></span
								></span
							>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if queued.length}
			<section class="act-group">
				<span class="sec-title">{t('activity.waiting')}</span>
				<ul>
					{#each queued as r (r.id)}
						<li>
							<span class="bu-ring ring"></span><span class="act-main"
								><b>{nice(r)}</b><span class="muted small"
									>{r.waitingForPlan
										? planWait(r.waitingForPlan)
										: Math.max(r.nextAt, $queue.capacityRetryAt) > now
											? t('activity.retryIn', {
													seconds: formatNumber(
														Math.ceil((Math.max(r.nextAt, $queue.capacityRetryAt) - now) / 1000)
													)
												})
											: !app.key
												? t('activity.needsKey')
												: t('activity.state.queued')}</span
								></span
							>
							<span class="act-meta"
								><button
									class="bu-action btn link small"
									data-variant="quiet"
									onclick={() => queue.cancel(r.id)}>{t('common.cancel')}</button
								></span
							>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if done.length}
			<section class="act-group">
				<span class="sec-title">{t('activity.recent')}</span>
				<ul>
					{#each done as r (r.id)}
						<li>
							{#if r.state === 'done'}<CircleCheck
									size={16}
									style="color:var(--ok)"
								/>{:else}<CircleAlert size={16} style="color:var(--bad)" />{/if}
							<span class="act-main"
								><b>{nice(r)}</b><span class="muted small"
									>{r.state === 'done'
										? r.finishedAt && r.submittedAt
											? mins(r.finishedAt - r.submittedAt)
											: t('activity.state.done')
										: r.state === 'lost'
											? t('activity.lostDetail')
											: stateText(r.state)}</span
								>
								{#if r.state === 'failed' || r.state === 'lost'}
									{#if r.error}<span class="small">{errorText(r)}</span>{/if}
									{#if requestTier(r) > 0}<span class="muted small">
											{t('activity.tierHint', { tier: formatNumber(requestTier(r)) })}
										</span>{/if}
								{/if}
							</span>
							<span class="act-meta num muted"
								>{cost(r)}<ApiPeek
									scope={`job-result-${r.id}`}
									label={nice(r)}
									plan={[]}
									queueIds={[r.id]}
								/></span
							>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		<p class="faint small">
			{t('activity.session', { cost: sessionCost })}
		</p>
		<details class="disclosure">
			<summary><ChevronRight size={14} />{t('common.details')}</summary>
			<div>
				<div class="field-row small">
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={clear}
						disabled={$queue.role === 'follower'}
						title={$queue.role === 'follower' ? t('activity.clearFollower') : undefined}
						>{t('activity.clear')}</button
					>
				</div>
				<div style="overflow:auto;max-height:240px">
					<table class="ledger">
						<thead
							><tr
								><th>{t('activity.ledger.job')}</th><th>{t('activity.ledger.endpoint')}</th><th
									>{t('activity.ledger.state')}</th
								><th>{t('common.cost')}</th></tr
							></thead
						>
						<tbody
							>{#each jobs.slice(0, 50) as r (r.id)}
								{@const error = errorText(r)}
								<tr
									><td>{r.label}</td><td class="mono">{r.endpoint}</td><td
										title={error || undefined}
										>{stateText(r.state)}{r.attempts > 1
											? ` ${t('activity.attempt', { attempt: formatNumber(r.attempts) })}`
											: ''}{error ? ` · ${error.slice(0, 80)}` : ''}</td
									><td class="num">{cost(r)}</td></tr
								>{/each}</tbody
						>
					</table>
				</div>
			</div>
		</details>
	</div>
</Sheet>

{#snippet workRow(label: string, status: string, open?: () => void)}
	<li>
		<span class="act-main"><span>{label}</span><span class="muted small">{status}</span></span>
		{#if open}<button
				class="bu-action btn sm"
				data-variant="outline"
				aria-label={t('activity.openWorkNamed', { label })}
				disabled={doc.loading || $queue.role === 'follower'}
				onclick={open}>{t('activity.openWork')}</button
			>{/if}
	</li>
{/snippet}

<style>
	.act-main {
		overflow-wrap: anywhere;
	}
	.waiting-copy {
		display: grid;
		gap: 4px;
	}
	.waiting-copy h3 {
		font-size: var(--fs-md);
	}
</style>
