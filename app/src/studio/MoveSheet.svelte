<script lang="ts">
	// Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
	// re-rendered through raw skeleton-v3), plus one pose call per worn item x direction so the items follow the new clip.
	import Sheet from './Sheet.svelte';
	import Sprite from './Sprite.svelte';
	import { untrack } from 'svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { movePlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import * as db from '../lib/store/db.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import type { DirectionName } from '../lib/store/manifest.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { ITEM_MOVE_SAVE_CONFLICT, posable } from '../lib/items/run.ts';
	import { AUTHORED } from '../lib/rig/poses.ts';
	import {
		MOVE_STEPS,
		bodyMoveIssue,
		isAuthoredAction,
		isV13,
		reservedMove,
		reviewMoveRecovery,
		moveEstimate,
		moveMinimumTier,
		type MoveSpec,
		type BodyPaletteRepairPlan,
		type KeepBodyPlan,
		type MeasurementRecoveryPlan
	} from './create.ts';
	import {
		ui,
		doc,
		store,
		isDemo,
		moving,
		shared,
		settingUp,
		startMove,
		queueMoves,
		keepMoveBody,
		matchMoveBodyColors,
		retryMoveMeasurements,
		dismissMove,
		openProject,
		pendingMoves,
		withKey
	} from './state.svelte.ts';
	import { bodyQualityNote } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { directionLabel } from './experience/movement.ts';
	import { Check, ChevronRight, CircleAlert } from './icons.ts';
	import { app } from '../lib/app.svelte.ts';
	import { GENERATION_RECOMMENDATION, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import { errorText, message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { formatNumber, t } from 'svelte-whisper';

	const m = $derived(store.project?.manifest);
	let rec = $state.raw<StoredProject | null>(null);
	// Re-read after a failure: a move saves its body and finished item views before failing, and Try again is priced from them.
	$effect(() => {
		const id = doc.id;
		void moving.error;
		if (!isDemo()) void db.get<StoredProject>('projects', id).then((r) => (rec = r ?? null));
	});
	const ok = $derived(!!m && isV13(rec ? { ...rec, manifest: m } : null));
	const have = $derived(new Set(m?.rig.animations.map((a) => a.id) ?? []));
	// Default is the standing views themselves: nothing to generate or replace.
	const options = $derived(
		[
			...new Set(['idle', 'walk', ...AUTHORED, ...(m?.rig.animations.map((a) => a.id) ?? [])])
		].filter((a) => !reservedMove(a))
	);
	const draft = formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined;
	let action = $state(draft?.action ?? untrack(() => options.find((a) => !have.has(a))) ?? '');
	let text = $state(draft?.text ?? '');
	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 24);
	const describingReplacement = $derived(
		have.has(action) && action !== 'walk' && !isAuthoredAction(action)
	);
	// Ids allow only a-z, 0-9, - and _ (rig.ts): a description in another script gets the first free "move-N".
	const freeMoveId = () => {
		let n = 1;
		while (have.has(`move-${n}`) || pendingIds.includes(`move-${n}`)) n++;
		return `move-${n}`;
	};
	const id = $derived(
		!describingReplacement && text.trim()
			? slug(text.split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')) || freeMoveId()
			: action
	);
	const replacing = $derived(have.has(id) && !reservedMove(id));
	const availableDirs = $derived(
		m?.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id) ?? []
	);
	let selectedDirs = $state<DirectionName[]>(draft?.dirs ?? untrack(() => [...availableDirs]));
	const targetDirs = $derived(
		replacing ? availableDirs.filter((d) => selectedDirs.includes(d)) : availableDirs
	);
	const items = $derived(m && targetDirs.length ? posable(m, targetDirs) : []);
	const unavailable = $derived(
		(m?.items ?? []).filter(
			(item) => item.slot !== 'body' && !items.some((eligible) => eligible.id === item.id)
		)
	);
	const frames = $derived(m?.rig.animations.find((a) => a.id === id)?.cells ?? 8);
	const motion = $derived({
		id,
		action: text.trim() ? undefined : action,
		text: text.trim() || undefined,
		frames,
		replace: replacing
	});
	const motionIssue = $derived(m && id ? bodyMoveIssue(m, motion) : undefined);
	let included = $state<string[]>(draft?.items ?? []);
	const chosen = $derived(items.filter((i) => included.includes(i.id)).map((i) => i.id));
	const est = $derived(
		m && id && targetDirs.length && !motionIssue
			? moveEstimate(m, { ...motion, items: chosen, dirs: targetDirs })
			: null
	);
	const dirs = $derived(targetDirs.length);
	const specAccess = (spec: MoveSpec | undefined) => {
		try {
			return { tier: m && spec ? moveMinimumTier(m, spec) : 0, error: '' };
		} catch (error) {
			return { tier: 0, error: displayError(error) };
		}
	};
	const tierBlocked = (required: number) =>
		tierDecision(app.balance, { required }).kind === 'required';
	const addAccess = $derived(
		specAccess(
			m && id && targetDirs.length && !motionIssue
				? {
						...motion,
						items: chosen,
						poseStyle: 'visible-side-v1',
						seed: 0,
						...(replacing ? { dirs: [...targetDirs] } : {})
					}
				: undefined
		)
	);
	const addTier = $derived(addAccess.tier);
	const mine = $derived(!!moving.spec && moving.projectId === doc.id);
	// "Queue another move" shows the form over this character's running move; a new move then waits its turn
	let adding = $state(false);
	const progress = $derived(mine && !adding);
	const busy = $derived(!!moving.spec && !moving.done);
	// A save conflict leaves the paid frames in Activity: anchored and skeleton item moves can reattach them for free.
	const savedItemFrames = $derived(
		!!moving.spec &&
			moving.spec.itemMethod !== 'grid' &&
			!!moving.spec.itemsOnly &&
			!moving.spec.replace &&
			!moving.spec.itemReview &&
			errorText(moving.error).startsWith(ITEM_MOVE_SAVE_CONFLICT)
	);
	const retryPlan = $derived(
		moving.error && moving.spec
			? movePlan(rec, {
					...moving.spec,
					reuseItemFrames: undefined,
					measurementRecovery: undefined,
					bodyPaletteRepair: undefined,
					seed: undefined
				})
			: []
	);
	const retrySpec = $derived<MoveSpec | undefined>(
		moving.spec
			? {
					...moving.spec,
					reuseItemFrames: undefined,
					measurementRecovery: undefined,
					bodyPaletteRepair: undefined
				}
			: undefined
	);
	const retryAccess = $derived(specAccess(retrySpec));
	const retryTier = $derived(retryAccess.tier);
	const recoveryAccess = $derived(specAccess(moving.spec ?? undefined));
	const recoveryTier = $derived(recoveryAccess.tier);
	const retryGens = $derived(
		Math.ceil(retryPlan.reduce((sum, call) => sum + (call.generations ?? 0), 0))
	);
	const pendingIds = $derived(pendingMoves(doc.id).map((s) => s.id));
	const ownQueued = $derived(moving.queued.filter((q) => q.projectId === moving.projectId));
	// another character's failed move holds every new move; only its own sheet can try it again or start over
	const holder = $derived(
		!mine && moving.spec && moving.error
			? (store.projects.find((p) => p.id === moving.projectId)?.name ??
					t('moveSheet.thatCharacter'))
			: ''
	);
	const steps = $derived(
		MOVE_STEPS.filter((step) =>
			step.id === 'items' ? !!moving.spec?.items.length : !moving.spec?.itemsOnly
		)
	);
	const stepIx = $derived(steps.findIndex((step) => step.id === moving.progress?.step));
	const nice = (s: string) => displayMove(s, options);
	const decimal = (n: number) =>
		formatNumber(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const usd = (n: number) =>
		formatNumber(n, {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 3,
			maximumFractionDigits: 3
		});
	let recovery = $state<MeasurementRecoveryPlan | null>(null);
	let recoveryError = $state.raw<Message | string>('');
	let recoveryChecking = $state(false);
	let recoveryUnavailable = $state.raw<Message[]>([]);
	let colorRepair = $state<BodyPaletteRepairPlan | null>(null);
	// Frames are decoded images: keep them raw rather than deeply proxied.
	let keep = $state.raw<KeepBodyPlan | null>(null);
	const keepK = $derived(Math.max(1, Math.floor(ui.dpr * (ui.size === 'compact' ? 1 : 1.5))));
	const recoveryItemGens = $derived(
		recovery && m && moving.spec ? moveEstimate(m, moving.spec).items : 0
	);
	const ledgerStates = $derived($queue.jobs.map((r) => `${r.id}:${r.state}`).join('|'));
	$effect(() => {
		void ledgerStates; // Re-check finished siblings without decoding PNGs on every progress poll.
		const projectId = moving.projectId,
			spec = moving.spec && $state.snapshot(moving.spec),
			error = moving.error;
		let current = true;
		recovery = null;
		colorRepair = null;
		keep = null;
		recoveryError = '';
		recoveryUnavailable = [];
		recoveryChecking = false;
		if (mine && error && spec && !moving.done && spec.itemMethod !== 'grid') {
			recoveryChecking = true;
			void reviewMoveRecovery(projectId, spec)
				.then((review) => {
					if (!current) return;
					recovery = review.recovery ?? null;
					colorRepair = review.colorRepair ?? null;
					keep = review.keep ?? null;
					recoveryUnavailable = review.unavailableMessages ?? [];
				})
				.catch((error: unknown) => {
					if (current)
						recoveryError = message('moveSheet.recoveryCheckFailed', {
							error: errorMessage(error)
						});
				})
				.finally(() => {
					if (current) recoveryChecking = false;
				});
		}
		return () => {
			current = false;
		};
	});
	function retryChecks() {
		if (!moving.spec || !recovery) return;
		const projectId = moving.projectId,
			spec = $state.snapshot(moving.spec),
			reviewed = $state.snapshot(recovery);
		withKey(() => {
			ui.sheet = 'move';
			void retryMoveMeasurements(projectId, spec, reviewed).catch((e) => {
				recoveryError = errorMessage(e);
			});
		}, recoveryTier);
	}

	// Free and local: no key is needed because a kept body makes no PixelLab request.
	function keepBody() {
		if (!moving.spec || !keep) return;
		const projectId = moving.projectId,
			spec = $state.snapshot(moving.spec),
			reviewed = keep;
		ui.sheet = 'move';
		void keepMoveBody(projectId, spec, reviewed).catch((e) => {
			recoveryError = errorMessage(e);
		});
	}

	function matchColors() {
		if (!moving.spec || !colorRepair) return;
		const projectId = moving.projectId,
			spec = $state.snapshot(moving.spec),
			reviewed = $state.snapshot(colorRepair);
		withKey(() => {
			ui.sheet = 'move';
			void matchMoveBodyColors(projectId, spec, reviewed).catch((e) => {
				recoveryError = errorMessage(e);
			});
		}, recoveryTier);
	}

	function go() {
		const projectId = doc.id;
		if (motionIssue || addAccess.error) return;
		const spec = {
			...motion,
			items: chosen,
			poseStyle: 'visible-side-v1' as const,
			seed: 1 + Math.floor(Math.random() * 1_000_000),
			...(replacing ? { dirs: [...targetDirs] } : {})
		};
		formDrafts.move = {
			projectId,
			action,
			text,
			items: $state.snapshot(included),
			dirs: [...selectedDirs],
			poseStyle: 'visible-side-v1'
		};
		withKey(() => {
			formDrafts.move = undefined;
			adding = false;
			void queueMoves(projectId, [spec]);
			ui.sheet = 'move';
		}, addTier);
	}
	function chooseAction(next: string) {
		action = next;
		text = '';
		const clips = (rec?.rigQa as { clips?: Record<string, { fails?: unknown[] }> } | undefined)
			?.clips;
		const flagged = availableDirs.filter((d) => clips?.[`${next}/${d}`]?.fails?.length);
		selectedDirs = flagged.length ? flagged : [...availableDirs];
	}
</script>

{#snippet foot()}
	{#if progress && moving.done}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			onclick={() => {
				void dismissMove();
				ui.sheet = null;
			}}>{t('common.done')}</button
		>
	{:else if progress && moving.error}
		<button class="bu-action btn plain" data-variant="quiet" onclick={dismissMove}
			>{keep ? t('common.discard') : t('common.startOver')}</button
		>
		<span class="api-action"
			><ApiPeek scope="move-retry" label={t('moveSheet.retryLabel')} plan={retryPlan} /><button
				class="bu-action btn"
				data-variant="outline"
				disabled={!!retryAccess.error || tierBlocked(retryTier)}
				aria-describedby={tierBlocked(retryTier) ? 'move-retry-tier' : undefined}
				onclick={() =>
					moving.spec &&
					withKey(() => {
						void startMove(moving.projectId, {
							...$state.snapshot(moving.spec!),
							reuseItemFrames: undefined,
							measurementRecovery: undefined,
							bodyPaletteRepair: undefined,
							seed: 1 + Math.floor(Math.random() * 1_000_000)
						});
						ui.sheet = 'move';
					}, retryTier)}
				>{recovery || colorRepair || keep || savedItemFrames || moving.spec?.reuseItemFrames
					? t('moveSheet.newFrames')
					: t('common.tryAgain')}{#if retryGens}
					<span class="cost">{t('moves.estimate', { gens: formatNumber(retryGens) })}</span
					>{/if}</button
			></span
		>
		{#if savedItemFrames}<button
				class="bu-action btn primary"
				data-variant="primary"
				onclick={() =>
					moving.spec &&
					void startMove(moving.projectId, {
						...$state.snapshot(moving.spec),
						reuseItemFrames: true
					})}>{t('moveSheet.useSaved')}</button
			>{/if}
		{#if recovery}<button
				class="bu-action btn primary"
				data-variant="primary"
				disabled={!!recoveryAccess.error || tierBlocked(recoveryTier)}
				aria-describedby={tierBlocked(recoveryTier) ? 'move-retry-tier' : undefined}
				onclick={retryChecks}
				>{recovery.checks ? t('moveSheet.retryChecks') : t('moveSheet.reuseCached')}</button
			>{/if}
		{#if colorRepair}<button
				class="bu-action btn primary"
				data-variant="primary"
				disabled={!!recoveryAccess.error || tierBlocked(recoveryTier)}
				aria-describedby={tierBlocked(recoveryTier) ? 'move-retry-tier' : undefined}
				onclick={matchColors}>{t('moveSheet.matchColors')}</button
			>{/if}
		{#if keep}<button class="bu-action btn primary" data-variant="primary" onclick={keepBody}
				>{t('moveSheet.keepFrames')}</button
			>{/if}<!-- new seed re-rolls body + item poses (R6 P2-7) -->
	{:else if progress}
		<span class="foot-note">{t('moveSheet.keepWorking')}</span>
		<button class="bu-action btn" data-variant="outline" onclick={() => (adding = true)}
			>{t('moveSheet.queueAnother')}</button
		>
		<button class="bu-action btn" data-variant="outline" onclick={() => (ui.sheet = null)}
			>{t('common.hide')}</button
		>
	{:else if ok}
		<span class="foot-note"
			>{est
				? est.items
					? t('moveSheet.footEstimateItems', {
							minutes: formatNumber(est.minutes),
							body: formatNumber(Math.ceil(est.body)),
							items: formatNumber(est.items)
						})
					: t('moveSheet.footEstimate', {
							minutes: formatNumber(est.minutes),
							body: formatNumber(Math.ceil(est.body))
						})
				: ''}</span
		>
		<span class="api-action"
			><ApiPeek
				scope="move-add"
				label={t('moveSheet.addLabel')}
				plan={movePlan(rec, {
					...motion,
					items: chosen,
					poseStyle: 'visible-side-v1',
					...(replacing ? { dirs: [...targetDirs] } : {})
				})}
			/><button
				class="bu-action btn primary lg"
				data-variant="primary"
				disabled={!id ||
					!!reservedMove(id) ||
					!!motionIssue ||
					!!addAccess.error ||
					!targetDirs.length ||
					pendingIds.includes(id) ||
					(!!settingUp.spec && !settingUp.done) ||
					tierBlocked(addTier)}
				aria-describedby={tierBlocked(addTier) ? 'move-action-tier' : undefined}
				onclick={go}
				>{t(
					busy
						? replacing
							? 'moveSheet.submit.queueViews'
							: 'moveSheet.submit.queue'
						: replacing
							? 'moveSheet.submit.replaceViews'
							: 'moveSheet.submit.add',
					{ move: id ? nice(id) : t('moveSheet.submit.move') }
				)}
				<span class="cost">
					{t(est?.items ? 'moveSheet.estimateWithItems' : 'moves.estimate', {
						gens: est ? formatNumber(Math.ceil(est.gens)) : '–'
					})}
				</span></button
			></span
		>
	{/if}
{/snippet}

<Sheet
	title={progress && moving.spec?.itemMethod === 'grid'
		? t('moveSheet.titleRepair')
		: (progress ? moving.spec?.replace : replacing)
			? t('moveSheet.titleReplace')
			: t('moves.add')}
	cancel={progress && !moving.done ? 'Hide' : 'Cancel'}
	onclose={() => (ui.sheet = null)}
	footer={isDemo() || (!ok && !progress) ? undefined : foot}
>
	{#if holder}<p class="notice small">
			<CircleAlert size={14} /><span
				>{t('moveSheet.heldBy', { move: nice(moving.spec!.id), character: holder })}</span
			><button
				class="bu-action btn sm"
				data-variant="outline"
				onclick={() => void openProject(moving.projectId)}
				>{t('moveSheet.open', { character: holder })}</button
			>
		</p>{/if}
	{#if progress}
		<div class="form">
			<p style="font-weight:600">
				{nice(moving.spec!.id)}{moving.spec?.dirs
					? ` · ${moving.spec.dirs.map(directionLabel).join(', ')}`
					: ''}<ApiPeek
					scope="move-progress"
					label={t('moveSheet.progressLabel')}
					plan={moving.spec ? movePlan(rec, moving.spec) : []}
					activityScope={moving.spec?.activityScope}
				/>
			</p>
			{#if moving.spec?.itemMethod === 'grid'}<p class="muted small">
					{t('moveSheet.repairNote')}
				</p>{/if}
			<ol class="steps-list">
				{#each steps as s, i (s.id)}
					{@const done = moving.done || i < stepIx}
					<li class:done class:now={!moving.done && i === stepIx}>
						{#if done}<Check size={16} />{:else if i === stepIx && !moving.error}<span
								class="bu-ring ring spin"
								aria-hidden="true"
							></span>{:else}<span class="dot" aria-hidden="true"></span>{/if}
						{displayMessage(
							s.label
						)}{#if !moving.done && i === stepIx && moving.progress && moving.progress.total > 1}<span
								class="muted num small">&nbsp;{moving.progress.done}/{moving.progress.total}</span
							>{/if}
					</li>
				{/each}
			</ol>
			{#if moving.error}<p class="notice bad small">
					<CircleAlert size={14} />{displayError(moving.error)}
				</p>
				{#if retryAccess.error || recoveryAccess.error}<p class="notice warn small" role="status">
						{retryAccess.error || recoveryAccess.error}
					</p>{/if}
				{#if retryTier || recoveryTier}<TierNotice
						id="move-retry-tier"
						minimumTier={Math.max(retryTier, recoveryTier)}
						feature={t('moveSheet.retryFeature')}
					/>{/if}{/if}
			{#if savedItemFrames}<p class="muted small">
					{t('moveSheet.savedFramesNote')}
				</p>{/if}
			{#if recoveryChecking}<p class="muted small" role="status">
					{t('moveSheet.checkingCached')}
				</p>{/if}
			{#if recoveryUnavailable.length}<p class="notice small">
					{recoveryUnavailable.map(displayNestedMessage).join(' ')}
				</p>{/if}
			{#if ownQueued.length}<p class="muted small">
					{t(
						moving.error
							? keep
								? 'moveSheet.queuedNextKeep'
								: 'moveSheet.queuedNextRetry'
							: 'moveSheet.queuedNext',
						{ moves: ownQueued.map((q) => nice(q.spec.id)).join(', ') }
					)}
				</p>{/if}
			{#if keep && moving.spec}
				<section class="keep-review" aria-label={t('moveSheet.keepReview')}>
					<p class="small">
						{t('moveSheet.keepNote')}
					</p>
					{#if moving.spec.items.length}<p class="small">
							{t('moveSheet.keepItemsNote')}
						</p>{/if}
					{#if moving.spec.replace}<p class="small">
							{t('moveSheet.keepReplaceNote')}
						</p>{/if}
					{#each keep.directions as view (view.dir)}
						<div class="keep-view">
							<span class="small" style="font-weight:600">{directionLabel(view.dir)}</span>
							<div class="keep-frames">
								{#each view.frames as frame, i (i)}<Sprite
										img={frame}
										k={keepK}
										checker
										label={t('moveSheet.frameLabel', {
											move: nice(moving.spec.id),
											direction: directionLabel(view.dir),
											number: i + 1
										})}
									/>{/each}
							</div>
							{#each view.warnings as warning (warning)}<p class="notice warn small">
									<CircleAlert size={14} />{bodyQualityNote(warning, t)}
								</p>{/each}
						</div>
					{/each}
				</section>
			{/if}
			{#if recovery}
				<p class="notice warn small">
					{[
						t('moveSheet.recovery.reuse'),
						recovery.checks
							? t('moveSheet.recovery.checks', {
									count: recovery.checks,
									gens: decimal(recovery.gens),
									usd: usd(recovery.usd)
								})
							: t('moveSheet.recovery.noRequests'),
						recoveryItemGens
							? t('moveSheet.recovery.items', {
									gens: formatNumber(Math.ceil(recoveryItemGens))
								})
							: ''
					]
						.filter(Boolean)
						.join(' ')}
				</p>
			{/if}
			{#if colorRepair}
				<p class="notice warn small">
					{[
						t('moveSheet.color.match', {
							pixels: t('moveSheet.color.pixels', { count: colorRepair.changedPixels }),
							frames: t('moveSheet.color.frames', {
								count: colorRepair.changedFrames,
								directions: colorRepair.directions.map(directionLabel).join(', ')
							})
						}),
						t('moveSheet.color.recheck', {
							count: colorRepair.checks,
							gens: decimal(colorRepair.gens),
							usd: usd(colorRepair.usd)
						}),
						colorRepair.itemGens
							? t('moveSheet.color.items', {
									gens: formatNumber(Math.ceil(colorRepair.itemGens))
								})
							: '',
						t('moveSheet.color.billing')
					]
						.filter(Boolean)
						.join(' ')}
				</p>
			{/if}
			{#if recoveryError}<p class="notice bad small">
					<CircleAlert size={14} />{displayNestedMessage(recoveryError)}
				</p>{/if}
			{#each moving.warnings as warning (warning)}<p class="notice warn small">
					<CircleAlert size={14} />{bodyQualityNote(warning, t)}
				</p>{/each}
		</div>
	{:else if isDemo() || !ok}
		<p class="notice small">
			<CircleAlert size={14} />{isDemo() ? t('moveSheet.demo') : t('moveSheet.needsSetup')}
		</p>
		{#if !isDemo()}<button
				class="bu-action btn primary"
				data-variant="primary"
				onclick={() => (ui.sheet = 'setup')}>{t('setup.title')}</button
			>{/if}
	{:else}
		<div class="form">
			<div class="field">
				<span class="label" id="act">{t('common.move')}</span>
				<div class="chips" role="radiogroup" aria-labelledby="act">
					{#each options as a (a)}
						<button
							class="chip"
							role="radio"
							aria-checked={(!text.trim() || describingReplacement) && action === a}
							tabindex={(text.trim() && !describingReplacement ? options[0] === a : action === a)
								? 0
								: -1}
							onclick={() => chooseAction(a)}
							>{#if have.has(a)}<Check size={12} />{/if}{have.has(a)
								? t('moveSheet.added', { move: nice(a) })
								: nice(a)}</button
						>
					{/each}
				</div>
			</div>
			{#if replacing}
				<div class="field">
					<span class="label">{t('moveSheet.viewsToReplace')}</span>
					{#each availableDirs as dir (dir)}<label class="check"
							><input
								type="checkbox"
								checked={selectedDirs.includes(dir)}
								onchange={(e) =>
									(selectedDirs = e.currentTarget.checked
										? [...selectedDirs, dir]
										: selectedDirs.filter((d) => d !== dir))}
							/>{directionLabel(dir)}</label
						>{/each}
					<p class="notice warn small">
						{m?.rig.directions.some((d) => d.mirrorOf)
							? t('moveSheet.replaceNoteMirrored')
							: t('moveSheet.replaceNote')}
					</p>
				</div>
			{:else}<p class="faint small">{t('moveSheet.chooseToReplace')}</p>{/if}
			<label class="field">
				<span class="label"
					>{describingReplacement ? t('moveSheet.describeReplacement') : t('moveSheet.describe')}
					{#if !describingReplacement}<span class="faint">{t('common.optional')}</span>{/if}</span
				>
				<input
					class="bu-input input"
					bind:value={text}
					placeholder={t('moveSheet.describePlaceholder')}
					maxlength="120"
				/>
			</label>
			{#if text.trim()}<p class="faint small">
					{t('moveSheet.emptyHands')}
				</p>{/if}
			{#if reservedMove(id)}<p class="notice warn small">
					<CircleAlert size={14} />{displayError(reservedMove(id))}
				</p>{:else if motionIssue}<p class="notice warn small">
					<CircleAlert size={14} />{displayError(motionIssue)}
				</p>{:else if pendingIds.includes(id)}<p class="notice small">
					<CircleAlert size={14} />{t('moveSheet.alreadyQueued', { move: nice(id) })}
				</p>{:else if busy}<p class="faint small">
					{t('moveSheet.waitsForCurrent')}
				</p>{/if}
			{#if addAccess.error}<p class="notice warn small" role="status">{addAccess.error}</p>{/if}
			<TierNotice
				id="move-action-tier"
				minimumTier={addTier}
				recommendedTier={GENERATION_RECOMMENDATION.tier}
				feature={t('moveSheet.addFeature')}
				recommendation={GENERATION_RECOMMENDATION.reason}
			/>
			{#if items.length}
				<div class="field">
					<span class="label">{t('moveSheet.animateItems')}</span>
					{#each items as it (it.id)}
						<label class="check"
							><input
								type="checkbox"
								checked={included.includes(it.id)}
								onchange={(e) =>
									(included = e.currentTarget.checked
										? [...included, it.id]
										: included.filter((x) => x !== it.id))}
							/>{it.name}
							<span class="faint small">
								{t('generationDetails.gens', {
									value:
										m && est
											? formatNumber(
													moveEstimate(m, { ...motion, items: [it.id], dirs: targetDirs }).items
												)
											: '–'
								})}
							</span></label
						>
					{/each}
					<p class="faint small">
						{t('moveSheet.itemsNote')}
					</p>
				</div>
			{/if}
			{#if (unavailable.length || shared.items.length) && targetDirs.length}
				<p class="faint small">
					{t('moveSheet.listNote')}
				</p>
			{/if}
			<p class="faint small">
				{t('moveSheet.billing')}
			</p>
			<details class="disclosure">
				<summary><ChevronRight size={14} />{t('common.details')}</summary>
				<div>
					<p class="faint small">
						{[
							text.trim()
								? t('moveSheet.pipeline.described')
								: action === 'walk'
									? t('moveSheet.pipeline.walk')
									: t('moveSheet.pipeline.authored'),
							m?.rig.directions.some((d) => d.mirrorOf)
								? t('moveSheet.pipeline.gridMirrored', {
										frames: est?.frames ?? '',
										dirs,
										mirrored: m.rig.directions
											.filter((d) => d.mirrorOf)
											.map((d) => d.id.replaceAll('-', ' '))
											.join(', ')
									})
								: t('moveSheet.pipeline.grid', { frames: est?.frames ?? '', dirs }),
							t('moveSheet.pipeline.cost', {
								body: est ? decimal(est.body) : '',
								items: est?.items ?? ''
							})
						].join(' · ')}
					</p>
				</div>
			</details>
		</div>
	{/if}
</Sheet>

<style>
	.keep-review {
		display: grid;
		gap: 8px;
	}
	.keep-view {
		display: grid;
		gap: 4px;
	}
	.keep-frames {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
</style>
