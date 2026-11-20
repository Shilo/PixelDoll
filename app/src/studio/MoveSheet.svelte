<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	// Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
	// re-rendered through raw skeleton-v3), plus one pose call per worn item x direction so the items follow the new clip.
	import Sheet from './Sheet.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import Help from './Help.svelte';
	import Sprite from './Sprite.svelte';
	import {
		moveFrameCounts,
		type MoveAnimationModel,
		type MoveAnimationOptions
	} from './moveAnimationOptions.ts';
	import { untrack } from 'svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { movePlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import * as db from '../lib/store/db.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import type { DirectionName } from '../lib/store/manifest.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import {
		INVALID_ITEM_GRID,
		ITEM_MOVE_SAVE_CONFLICT,
		SAVED_FRAMES_UNAVAILABLE,
		posable
	} from '../lib/items/run.ts';
	import { AUTHORED } from '../lib/rig/poses.ts';
	import {
		MOVE_STEPS,
		bodyMoveIssue,
		moveFrames,
		partialMoveFrameIssue,
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
		resolveRepairReview,
		dismissMove,
		openProject,
		pendingMoves,
		withKey
	} from './state.svelte.ts';
	import { bodyQualityNote, plainReasonMessage } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { affectedMoveDirections } from './replaceMove.ts';
	import { displayDirection as directionLabel } from './displayDirection.ts';
	import { Check, ChevronRight, CircleAlert } from './icons.ts';
	import { app } from '../lib/app.svelte.ts';
	import { GENERATION_RECOMMENDATION, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import { errorText, message, type Message } from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { formatNumber, t, type WhisperKey } from 'svelte-whisper';
	import { sharedItemsHidden } from './wardrobeVisibility.svelte.ts';

	const m = $derived(store.project?.manifest);
	const hasSharedOffers = $derived(!sharedItemsHidden(doc.id) && shared.items.length > 0);
	let rec = $state.raw<StoredProject | null>(null);
	// Re-read after a failure: a move saves its body and finished item views before failing, and Try again is priced from them.
	$effect(() => {
		const id = doc.id;
		void moving.error;
		if (!isDemo()) void db.get<StoredProject>('projects', id).then((r) => (rec = r ?? null));
	});
	const ok = $derived(!!m && isV13(rec ? { ...rec, manifest: m } : null));
	const have = $derived(new Set(m?.rig.animations.map((a) => a.id) ?? []));
	const pendingIds = $derived(pendingMoves(doc.id).map((s) => s.id));
	// Default is the standing views themselves: nothing to generate or replace.
	const options = $derived(
		[
			...new Set(['idle', 'walk', ...AUTHORED, ...(m?.rig.animations.map((a) => a.id) ?? [])])
		].filter((a) => !reservedMove(a))
	);
	const draft = formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined;
	// The PixelLab models that can make a move's body frames; Skeleton v3 keeps the current flow.
	const MODELS: MoveAnimationModel[] = ['skeleton-v3', 'v3', 'pixminimax'];
	const MODEL_TEXT: Record<MoveAnimationModel, WhisperKey> = {
		'skeleton-v3': 'moveSheet.models.skeletonV3',
		v3: 'moveSheet.models.v3',
		pixminimax: 'moveSheet.models.pixminimax'
	};
	// Advanced starts open when a restored draft already changed something there, so no choice is hidden.
	let advancedOpen = $state(
		!!(
			draft?.animation &&
			(draft.animation.model !== 'skeleton-v3' || draft.animation.frameCount !== undefined)
		)
	);
	let modelChoice = $state<MoveAnimationModel | undefined>(draft?.animation?.model);
	let frameChoice = $state<number | undefined>(draft?.animation?.frameCount);
	let action = $state(draft?.action ?? untrack(() => options.find((a) => !have.has(a))) ?? '');
	let replaceSelected = $state(draft?.replace ?? false);
	let text = $state(draft?.text ?? '');
	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 24);
	const replacing = $derived(replaceSelected && have.has(action));
	const savedMove = $derived(m?.rig.animations.find((a) => a.id === action));
	// Ids allow only a-z, 0-9, - and _ (rig.ts): a description in another script gets the first free "move-N".
	const freeMoveId = () => {
		let n = 1;
		while (have.has(`move-${n}`) || pendingIds.includes(`move-${n}`)) n++;
		return `move-${n}`;
	};
	const id = $derived(
		action ||
			(text.trim() &&
				(slug(text.trim().split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')) || freeMoveId()))
	);
	const availableDirs = $derived(
		m?.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id) ?? []
	);
	let selectedDirs = $state<DirectionName[]>(draft?.dirs ?? untrack(() => [...availableDirs]));
	const targetDirs = $derived(
		replacing ? availableDirs.filter((d) => selectedDirs.includes(d)) : availableDirs
	);
	const affectedMirrors = $derived(
		m
			? affectedMoveDirections(m.rig, targetDirs)
					.filter((dir) => !targetDirs.includes(dir))
					.map(directionLabel)
					.join(', ')
			: ''
	);
	const describingReplacement = $derived(
		replacing &&
			((action !== 'walk' && !isAuthoredAction(action)) ||
				targetDirs.some((dir) => {
					// Only a Skeleton v3 clip posed from a PixMiniMax description needs that text again.
					const source = savedMove?.sources?.[dir];
					return source?.route === 'skeleton-v3' && !!source.motion?.startsWith('pixminimax:');
				}))
	);
	const describing = $derived(!action || describingReplacement);
	const items = $derived(m && targetDirs.length ? posable(m, targetDirs) : []);
	const unavailable = $derived(
		(m?.items ?? []).filter(
			(item) => item.slot !== 'body' && !items.some((eligible) => eligible.id === item.id)
		)
	);
	const canvas = $derived(m?.rig.cell.w ?? 0);
	// Ride is a static authored pose on Skeleton v3 (create.ts moveAnimationModel), so it has no model or frame choice.
	const riding = $derived(!describing && action === 'ride');
	// The frame count the core falls back to: a replaced clip's cells, otherwise PixelDoll's 8-frame preset.
	const baseFrames = $derived(replacing ? (savedMove?.cells ?? 8) : 8);
	// A partial replacement must keep the saved clip's cell count so redrawn views line up with the kept ones.
	const keptFrames = $derived(
		replacing && targetDirs.length !== availableDirs.length ? savedMove?.cells : undefined
	);
	const fitsKept = (option: MoveAnimationModel) =>
		keptFrames === undefined || moveFrameCounts(option, canvas).includes(keptFrames);
	const model = $derived.by(() => {
		if (modelChoice) return modelChoice;
		const preferred =
			keptFrames ??
			(m && moveFrames(m, { action: describing ? undefined : action, frames: baseFrames }));
		const fitsPreferred = (option: MoveAnimationModel) =>
			preferred !== undefined && moveFrameCounts(option, canvas).includes(preferred);
		if (replacing) {
			for (const dir of targetDirs) {
				const route = savedMove?.sources?.[dir]?.route;
				if (route && route !== 'import' && fitsPreferred(route)) return route;
			}
		}
		return MODELS.find(fitsPreferred) ?? 'skeleton-v3';
	});
	// Model-valid counts for this character's actual canvas; the same object prices and submits the move.
	const frameCounts = $derived(moveFrameCounts(model, canvas));
	const userFrameCount = $derived(
		keptFrames === undefined && frameChoice !== undefined && frameCounts.includes(frameChoice)
			? frameChoice
			: undefined
	);
	const chosenFrameCount = $derived(
		keptFrames !== undefined && frameCounts.includes(keptFrames) ? keptFrames : userFrameCount
	);
	const animationOptions = $derived<MoveAnimationOptions | undefined>(
		riding
			? undefined
			: { model, ...(chosenFrameCount === undefined ? {} : { frameCount: chosenFrameCount }) }
	);
	// What the core resolves with no explicit count, so the Default label matches the price and the request.
	const defaultFrames = $derived(
		m
			? moveFrames(m, {
					action: describing ? undefined : action,
					frames: baseFrames,
					animation: { model }
				})
			: baseFrames
	);
	const advancedNote = $derived(
		[
			model === 'skeleton-v3' ? '' : t(MODEL_TEXT[model]),
			userFrameCount === undefined ? '' : t('moveSheet.framesValue', { count: userFrameCount })
		]
			.filter(Boolean)
			.join(' · ')
	);
	const motion = $derived({
		id,
		action: describing ? undefined : action,
		text: describing ? text.trim() || undefined : undefined,
		frames: baseFrames,
		replace: replacing,
		animation: animationOptions
	});
	const motionIssue = $derived.by(() => {
		if (action && replaceSelected !== have.has(action)) return t('moveSheet.changedDuringEdit');
		if (!action && id && options.includes(id))
			return t('moveSheet.duplicateOption', { move: nice(id) });
		if (!m || !id) return '';
		return (
			bodyMoveIssue(m, motion) ||
			(replacing && targetDirs.length ? partialMoveFrameIssue(m, motion, targetDirs.length) : '')
		);
	});
	let included = $state<string[]>(draft?.items ?? []);
	const chosen = $derived(items.filter((i) => included.includes(i.id)).map((i) => i.id));
	const est = $derived(
		m && id && targetDirs.length && !reservedMove(id) && !motionIssue && !pendingIds.includes(id)
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
	const repairReview = $derived(progress ? moving.repairReview : null);
	const busy = $derived(!!moving.spec && !moving.done);
	const savedItemFrames = $derived(
		!!moving.spec &&
			!!moving.spec.itemsOnly &&
			!moving.spec.replace &&
			(moving.spec.itemMethod === 'grid'
				? !!moving.spec.itemReview &&
					!errorText(moving.error).startsWith(INVALID_ITEM_GRID) &&
					!errorText(moving.error).startsWith(SAVED_FRAMES_UNAVAILABLE) &&
					$queue.jobs.some(
						(job) =>
							job.activityScope === moving.spec?.activityScope &&
							job.endpoint === (moving.spec?.redrawItem ? '/edit-images-v2' : '/inpaint-v3') &&
							job.state === 'done'
					)
				: !moving.spec.itemReview && errorText(moving.error).startsWith(ITEM_MOVE_SAVE_CONFLICT))
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
	const retryPlan = $derived(
		moving.error && retrySpec && !retryAccess.error
			? movePlan(rec, { ...retrySpec, seed: undefined })
			: []
	);
	const retryTier = $derived(retryAccess.tier);
	const recoveryAccess = $derived(specAccess(moving.spec ?? undefined));
	const recoveryTier = $derived(recoveryAccess.tier);
	const retryGens = $derived(
		Math.ceil(retryPlan.reduce((sum, call) => sum + (call.generations ?? 0), 0))
	);
	const ownQueued = $derived(moving.queued.filter((q) => q.projectId === moving.projectId));
	// another character's failed move holds every new move; only its own sheet can try it again or start over
	const holder = $derived(
		!mine && moving.spec && (moving.error || moving.repairReview)
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
		if (!est || addAccess.error) return;
		const spec = {
			...motion,
			items: chosen,
			poseStyle: 'visible-side-v1' as const,
			seed: 1 + Math.floor(Math.random() * 1_000_000),
			...(replacing ? { dirs: [...targetDirs] } : { approvedDirs: [...targetDirs] })
		};
		formDrafts.move = {
			projectId,
			action,
			replace: replaceSelected,
			text,
			items: $state.snapshot(included),
			dirs: [...selectedDirs],
			poseStyle: 'visible-side-v1',
			animation:
				!riding && (modelChoice !== undefined || userFrameCount !== undefined)
					? { model, frameCount: userFrameCount }
					: undefined
		};
		withKey(() => {
			formDrafts.move = undefined;
			adding = false;
			void queueMoves(projectId, [spec]);
			ui.sheet = 'move';
		}, addTier);
	}
	function chooseAction(next: string) {
		const replace = have.has(next);
		if (action === next && replaceSelected === replace) return;
		action = next;
		replaceSelected = replace;
		text = '';
		frameChoice = undefined;
		const clips = (rec?.rigQa as { clips?: Record<string, { fails?: unknown[] }> } | undefined)
			?.clips;
		const flagged = availableDirs.filter((d) => clips?.[`${next}/${d}`]?.fails?.length);
		selectedDirs = flagged.length ? flagged : [...availableDirs];
	}
	function chooseModel(next: MoveAnimationModel) {
		modelChoice = next;
		if (frameChoice !== undefined && !moveFrameCounts(next, canvas).includes(frameChoice))
			frameChoice = undefined;
	}
	function describeMove(value: string) {
		chooseAction('');
		text = value;
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
	{:else if repairReview}
		{#if !moving.repairApplied}<button
				class="bu-action btn"
				data-variant="outline"
				disabled={moving.resolvingRepair || queue.role === 'follower'}
				onclick={() => void resolveRepairReview(false)}>{t('moveSheet.review.keepCurrent')}</button
			>{/if}
		<button
			class="bu-action btn primary"
			data-variant="primary"
			disabled={moving.resolvingRepair || queue.role === 'follower'}
			onclick={() => void resolveRepairReview(true)}
			>{moving.repairApplied
				? t('moveSheet.review.finish')
				: moving.spec?.redrawItem
					? t('moveSheet.review.useRedrawn')
					: t('moveSheet.review.useRepaired')}</button
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
		{#if savedItemFrames && !recoveryAccess.error}<button
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
		{#if est}
			<span class="foot-note move-cost-note">
				<span>
					{est.items
						? t('moveSheet.footEstimateItems', {
								minutes: formatNumber(est.minutes),
								body: formatNumber(Math.ceil(est.body)),
								items: formatNumber(est.items)
							})
						: t('moveSheet.footEstimate', {
								minutes: formatNumber(est.minutes),
								body: formatNumber(Math.ceil(est.body))
							})}
				</span>
				<span>{t('moveSheet.costNotice')}</span>
			</span>
		{/if}
		<span class="api-action move-action">
			{#if est}<ApiPeek
					scope="move-add"
					label={t('moveSheet.addLabel')}
					plan={movePlan(rec, {
						...motion,
						items: chosen,
						poseStyle: 'visible-side-v1',
						...(replacing ? { dirs: [...targetDirs] } : {})
					})}
				/>{/if}<button
				class="bu-action btn primary lg"
				data-variant="primary"
				disabled={!est ||
					!!addAccess.error ||
					(!!settingUp.spec && !settingUp.done) ||
					tierBlocked(addTier)}
				aria-describedby={tierBlocked(addTier) ? 'move-action-tier' : undefined}
				onclick={go}
				><span>
					{t(
						busy
							? replacing
								? 'moveSheet.submit.queueReplacement'
								: 'moveSheet.submit.queue'
							: replacing
								? 'moveSheet.submit.replaceViews'
								: 'moveSheet.submit.add',
						{ move: id ? nice(id) : t('moveSheet.submit.move') }
					)}
					{#if est}<span class="cost">
							{t(est.items ? 'moveSheet.estimateWithItems' : 'moves.estimate', {
								gens: formatNumber(Math.ceil(est.gens))
							})}
						</span>{/if}</span
				></button
			></span
		>
	{/if}
{/snippet}

<Sheet
	title={repairReview
		? moving.spec?.redrawItem
			? t('moveSheet.review.redrawTitle')
			: t('moveSheet.review.repairTitle')
		: progress && moving.spec?.itemMethod === 'grid'
			? moving.spec?.redrawItem
				? t('moveSheet.review.redrawProgress')
				: t('moveSheet.titleRepair')
			: (progress ? moving.spec?.replace : replacing)
				? t('moveSheet.titleReplace')
				: t('moves.add')}
	cancel={progress && !moving.done ? 'common.hide' : 'common.cancel'}
	onclose={() => (ui.sheet = null)}
	footer={isDemo() || (!ok && !progress) ? undefined : foot}
>
	{#if holder}<p class="notice small">
			<CircleAlert size={14} /><span
				>{moving.repairReview
					? t('moveSheet.review.heldBy', { character: holder })
					: t('moveSheet.heldBy', { move: nice(moving.spec!.id), character: holder })}</span
			><button
				class="bu-action btn sm"
				data-variant="outline"
				onclick={() => void openProject(moving.projectId)}
				>{t('moveSheet.open', { character: holder })}</button
			>
		</p>{/if}
	{#if mine && adding && moving.repairReview}
		<button class="bu-action btn" data-variant="outline" onclick={() => (adding = false)}
			>{moving.spec?.redrawItem
				? t('moveSheet.review.redrawTitle')
				: t('moveSheet.review.repairTitle')}</button
		>
	{/if}
	{#if repairReview && moving.spec}
		<section class="keep-review" aria-label={t('moveSheet.review.compare')}>
			<p>
				{repairReview.clip.out.name} · {nice(moving.spec.id)} · {moving.spec.dirs
					?.map(directionLabel)
					.join(', ') ?? ''}
			</p>
			{#if moving.repairApplied}<p class="small" role="status">
					{t('moveSheet.review.saved')}
				</p>{:else}<p class="small" role="status">
					{moving.spec.redrawItem
						? repairReview.findings.length
							? t('moveSheet.review.redrawIssues')
							: t('moveSheet.review.redrawReady')
						: t('moveSheet.review.repairIssues')}
					{t('moveSheet.review.noCost')}
				</p>{/if}
			<div class="repair-pairs">
				{#each repairReview.replacement as frame, index (index)}
					<div class="repair-pair">
						<span class="small"
							>{t('moveSheet.review.frame', { number: formatNumber(index + 1) })}</span
						>
						<div class="repair-pair-columns">
							{#each [{ img: repairReview.current[index], label: t('moveSheet.review.currentFrames'), frameLabel: t( 'moveSheet.review.currentFrame', { number: formatNumber(index + 1) } ) }, { img: frame, label: moving.spec.redrawItem ? t('moveSheet.review.redrawnFrames') : t('moveSheet.review.repairedFrames'), frameLabel: t( moving.spec.redrawItem ? 'moveSheet.review.redrawnFrame' : 'moveSheet.review.repairedFrame', { number: formatNumber(index + 1) } ) }] as version (version.label)}
								<div class="keep-view">
									<strong class="small">{version.label}</strong>
									<div class="repair-sprite" style:aspect-ratio={`${frame.w} / ${frame.h}`}>
										<Sprite
											img={version.img}
											k={keepK}
											checker
											fitToBox
											label={version.frameLabel}
										/>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			{#if repairReview.findings.length}<details>
					<summary>{t('moveSheet.review.findings')}</summary>
					<ul>
						{#each repairReview.findings as finding (finding)}<li class="small">
								{displayMessage(plainReasonMessage(finding))}
							</li>{/each}
					</ul>
				</details>{/if}
			{#if moving.error}<p class="notice bad small" role="alert">
					{displayError(moving.error)}
				</p>{/if}
			{#if queue.role === 'follower'}<p class="notice small">
					{moving.spec.redrawItem
						? t('moveSheet.review.redrawInManagingTab')
						: t('moveSheet.review.repairInManagingTab')}
				</p>{/if}
			{#if moving.queued.length}<p class="muted small">
					{t('moveSheet.review.resumesQueue')}
				</p>{/if}
		</section>
	{:else if progress}
		<div class="form">
			<p style="font-weight:600">
				{nice(moving.spec!.id)}{moving.spec?.dirs
					? ` · ${moving.spec.dirs.map(directionLabel).join(', ')}`
					: ''}<ApiPeek
					scope="move-progress"
					label={t('moveSheet.progressLabel')}
					plan={moving.spec && !recoveryAccess.error ? movePlan(rec, moving.spec) : []}
					activityScope={moving.spec?.activityScope}
				/>
			</p>
			{#if moving.spec?.itemMethod === 'grid'}<p class="muted small">
					{moving.spec.redrawItem
						? t('moveSheet.review.redrawNote')
						: t('moveSheet.review.repairNote')}
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
				onclick={() => (ui.sheet = 'setup')}
				>{openerLabel(t('setup.title'))}<SurfaceChevron /></button
			>{/if}
	{:else}
		<div class="form" class:redraw-form={replacing}>
			<div class="field">
				<label class="label" for="move-description"
					>{replacing ? t('moveSheet.describeNew') : t('moveSheet.describeMotion')}</label
				>
				<input
					id="move-description"
					class="bu-input input"
					value={action ? '' : text}
					oninput={(event) => describeMove(event.currentTarget.value)}
					placeholder={t('moveSheet.describePlaceholder')}
					aria-describedby="move-description-hint"
					maxlength="120"
				/>
				<p class="faint small" id="move-description-hint">
					{t('moveSheet.motionOnly')}
				</p>
			</div>
			<div class="field">
				<span class="label" id="act">{t('moveSheet.orChoose')}</span>
				<div class="chips" role="radiogroup" aria-labelledby="act">
					{#each options as a (a)}
						<button
							class="chip"
							role="radio"
							aria-checked={action === a}
							tabindex={(options.includes(action) ? action : options[0]) === a ? 0 : -1}
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
					<span class="label">{t('moveSheet.redrawDirections')}</span>
					<div class="redraw-directions">
						<DirectionCompass
							label={t('moveSheet.redrawDirections')}
							describedBy="move-redraw-warning"
							available={availableDirs}
							selected={targetDirs}
							compact
							ontoggle={(dir) =>
								(selectedDirs = selectedDirs.includes(dir)
									? selectedDirs.filter((selected) => selected !== dir)
									: [...selectedDirs, dir])}
						/>
						<p class="notice warn small" id="move-redraw-warning">
							{t('moveSheet.redrawHidesEquipment')}
							{#if affectedMirrors}{t('moveSheet.redrawMirrors', {
									directions: affectedMirrors
								})}{/if}
							{t('moveSheet.redrawOtherMoves')}
						</p>
					</div>
				</div>
			{/if}
			{#if describingReplacement}<label class="field">
					<span class="label">{t('moveSheet.describeReplacement')}</span>
					<input
						class="bu-input input"
						bind:value={text}
						placeholder={t('moveSheet.describePlaceholder')}
						aria-describedby="move-description-hint"
						maxlength="120"
					/>
				</label>{/if}
			{#if !riding}
				<details class="disclosure advanced" bind:open={advancedOpen}>
					<summary
						><ChevronRight size={14} />{t('common.advanced')}{#if advancedNote}<span
								class="faint advanced-note">{advancedNote}</span
							>{/if}</summary
					>
					<div>
						<div class="trait-row">
							<Help
								title={t('moveSheet.motionModel')}
								text={t('moveSheet.motionModelHelp')}
							/><select
								class="bu-input input"
								aria-label={t('moveSheet.motionModel')}
								value={model}
								onchange={(e) => chooseModel(e.currentTarget.value as MoveAnimationModel)}
								>{#each MODELS as option (option)}<option
										value={option}
										disabled={option !== model && !fitsKept(option)}>{t(MODEL_TEXT[option])}</option
									>{/each}</select
							>
						</div>
						<div class="trait-row">
							<Help
								title={t('moveSheet.frames')}
								text={t('moveSheet.framesHelp', { canvas: formatNumber(canvas) })}
							/>{#if keptFrames !== undefined}<select
									class="bu-input input"
									aria-label={t('moveSheet.frames')}
									disabled
									><option>{t('moveSheet.framesKept', { count: keptFrames })}</option></select
								>{:else}<select
									class="bu-input input"
									aria-label={t('moveSheet.frames')}
									value={userFrameCount === undefined ? '' : String(userFrameCount)}
									onchange={(e) =>
										(frameChoice =
											e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))}
									><option value="">{t('moveSheet.framesDefault', { count: defaultFrames })}</option
									>{#each frameCounts as count (count)}<option value={String(count)}
											>{t('moveSheet.framesValue', { count })}</option
										>{/each}</select
								>{/if}
						</div>
					</div>
				</details>
			{/if}
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
							{#if m && est}<span class="faint small"
									>{t('generationDetails.gens', {
										value: formatNumber(
											moveEstimate(m, { ...motion, items: [it.id], dirs: targetDirs }).items
										)
									})}</span
								>{/if}</label
						>
					{/each}
					<p class="faint small">
						{t('moveSheet.equipmentWaitsForBody')}
						{#if !replacing}{t('moveSheet.uncheckedItemsHidden')}{/if}
					</p>
				</div>
			{/if}
			{#if (unavailable.length || hasSharedOffers) && targetDirs.length}
				<p class="faint small">
					{t('moveSheet.fittedEquipmentOnly')}
					{#if hasSharedOffers}{t('moveSheet.sharedCopiesCoverage')}{/if}
				</p>
			{/if}
			{#if est}<details class="disclosure">
					<summary><ChevronRight size={14} />{t('common.details')}</summary>
					<div>
						<p class="faint small">
							{[
								motion.text
									? t('moveSheet.pipeline.described')
									: action === 'walk'
										? t('moveSheet.pipeline.walk')
										: t('moveSheet.pipeline.authored'),
								affectedMirrors
									? t('moveSheet.pipeline.gridMirrored', {
											frames: est.frames,
											dirs,
											mirrored: affectedMirrors
										})
									: t('moveSheet.pipeline.grid', { frames: est.frames, dirs }),
								t('moveSheet.pipeline.cost', { body: decimal(est.body), items: est.items })
							].join(' · ')}
						</p>
					</div>
				</details>{/if}
		</div>
	{/if}
</Sheet>

<style>
	.redraw-form {
		gap: 12px;
	}
	.redraw-directions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.redraw-directions .notice {
		flex: 1 1 125px;
	}
	.move-cost-note {
		display: grid;
		gap: 2px;
	}
	.move-action > .btn {
		white-space: normal;
		height: auto;
		min-height: var(--ctl-h);
	}
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
	.repair-pairs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
		gap: 12px;
	}
	.repair-pair,
	.repair-pair-columns {
		display: grid;
		gap: 6px;
	}
	.repair-pair-columns {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
	}
	.repair-sprite {
		width: 100%;
		max-width: 192px;
		min-width: 0;
	}
	.advanced {
		margin-top: 4px;
	}
	.advanced > summary {
		min-height: 36px;
	}
	.advanced-note {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 400;
		font-size: var(--fs-sm);
	}
	.advanced > div {
		padding-left: 0;
		gap: 10px;
	}
	.trait-row {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr);
		gap: 8px;
		align-items: center;
	}
	.trait-row :global(.help-title) {
		align-self: center;
	}
	@media (max-width: 599px), (max-height: 499px) {
		.trait-row {
			grid-template-columns: 90px minmax(0, 1fr);
		}
		.trait-row .input {
			min-height: 44px;
			font-size: 16px;
		}
	}
</style>
