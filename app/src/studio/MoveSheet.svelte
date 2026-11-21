<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	// Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
	// re-rendered through raw skeleton-v3).
	import Sheet from './Sheet.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import Help from './Help.svelte';
	import Sprite from './Sprite.svelte';
	import PaidReview from './PaidReview.svelte';
	import {
		defaultMoveFrameCount,
		moveFrameCounts,
		type MoveAnimationModel,
		type MoveAnimationOptions
	} from './moveAnimationOptions.ts';
	import { untrack } from 'svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { movePlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import * as db from '../lib/store/db.ts';
	import { stableStringify } from '../lib/image/hash.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import type { DirectionName } from '../lib/store/manifest.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import {
		INVALID_ITEM_GRID,
		ITEM_MOVE_SAVE_CONFLICT,
		SAVED_FRAMES_UNAVAILABLE
	} from '../lib/items/run.ts';
	import { AUTHORED } from '../lib/rig/poses.ts';
	import { REPAIR_BATCH_MISALIGNED } from '../lib/items/items.ts';
	import {
		PaidStepError,
		type PaidReview as PaidReviewData
	} from '../lib/pixellab/paid-results.ts';
	import {
		MOVE_STEPS,
		bodyMoveIssue,
		moveFrames,
		partialMoveFrameIssue,
		isAuthoredAction,
		isV13,
		reservedMove,
		reviewMoveRecovery,
		reviewMoveResults,
		movePreflightWarnings,
		skeletonMoveReview,
		moveEstimate,
		moveMinimumTier,
		type MovePaidOption,
		type MovePaidReview,
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
		settingUp,
		startMove,
		queueMoves,
		keepMoveBody,
		matchMoveBodyColors,
		retryMoveMeasurements,
		resolveRepairReview,
		dismissMove,
		frameEditsBlocked,
		adjustCharacter,
		makeRoomFor,
		toast,
		openProject,
		pendingMoves,
		withKey
	} from './state.svelte.ts';
	import { bodyQualityNote, plainReasonMessage } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { moveCandidateInput } from './replaceMove.ts';
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

	const m = $derived(store.project?.manifest);
	let rec = $state.raw<StoredProject | null>(null);
	// Re-read after a failure (a move saves its body and finished item views before failing, and Try again is priced from
	// them) and after Frame size replaced the character.
	$effect(() => {
		const id = doc.id;
		void moving.error;
		void store.project;
		void moving.done;
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
	const reopen = draft?.reopen;
	if (reopen) delete draft.reopen;
	const DEFAULT_MODEL: MoveAnimationModel = 'pixminimax';
	const MODELS: MoveAnimationModel[] = [DEFAULT_MODEL, 'skeleton-v3', 'v3'];
	const advancedId = $props.id();
	const MODEL_TEXT: Record<MoveAnimationModel, WhisperKey> = {
		'skeleton-v3': 'moveSheet.models.skeletonV3',
		v3: 'moveSheet.models.v3',
		pixminimax: 'moveSheet.models.pixminimax'
	};
	// Advanced starts open when a restored draft already changed something there, so no choice is hidden.
	let advancedOpen = $state(
		!!(
			draft?.animation &&
			(draft.animation.model !== DEFAULT_MODEL || draft.animation.frameCount !== undefined)
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
	const draftRegeneration = $derived.by(() => {
		const reference = draft?.regeneration;
		if (!reference || !Object.hasOwn(store.moveReviews, reference.id)) return;
		const { spec } = store.moveReviews[reference.id];
		if (spec.seed === reference.seed && spec.activityScope === reference.activityScope)
			return reference;
	});
	// Ids allow only a-z, 0-9, - and _ (rig.ts): a description in another script gets the first free "move-N".
	const freeMoveId = () => {
		if (draftRegeneration && text.trim() === draft?.text?.trim()) return draftRegeneration.id;
		let n = 1;
		while (
			have.has(`move-${n}`) ||
			pendingIds.includes(`move-${n}`) ||
			Object.hasOwn(store.moveReviews, `move-${n}`)
		)
			n++;
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
					const source = savedMove?.sources?.[dir];
					if (source?.route === 'skeleton-v3') return !!source.motion?.startsWith('pixminimax:');
					if (source?.route !== 'v3' && source?.route !== 'pixminimax') return false;
					const prefix = `${source.route}:`;
					return (
						!!source.motion?.startsWith(prefix) && source.motion.slice(prefix.length) !== action
					);
				}))
	);
	const describing = $derived(!action || describingReplacement);
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
		if (riding) return 'skeleton-v3';
		if (modelChoice && fitsKept(modelChoice)) return modelChoice;
		if (!replacing) return DEFAULT_MODEL;
		const preferred =
			keptFrames ??
			(m && moveFrames(m, { action: describing ? undefined : action, frames: baseFrames }));
		const fitsPreferred = (option: MoveAnimationModel) =>
			preferred !== undefined && moveFrameCounts(option, canvas).includes(preferred);
		for (const dir of targetDirs) {
			const route = savedMove?.sources?.[dir]?.route;
			if (route && route !== 'import' && fitsPreferred(route)) return route;
		}
		return fitsPreferred('skeleton-v3')
			? 'skeleton-v3'
			: (MODELS.find(fitsPreferred) ?? 'skeleton-v3');
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
	const shownFrames = $derived(userFrameCount ?? defaultFrames);
	const advancedNote = $derived(
		[
			model === DEFAULT_MODEL ? '' : t(MODEL_TEXT[model]),
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
	const regeneration = $derived(draftRegeneration?.id === id ? draftRegeneration : undefined);
	const motionIssue = $derived.by(() => {
		if (action && replaceSelected !== have.has(action)) return t('moveSheet.changedDuringEdit');
		if (Object.hasOwn(store.moveReviews, id) && !regeneration)
			return t('moveSheet.checkpoint.ready', { move: nice(id) });
		if (!action && id && options.includes(id))
			return t('moveSheet.duplicateOption', { move: nice(id) });
		if (!m || !id) return '';
		return (
			bodyMoveIssue(m, motion) ||
			(replacing && targetDirs.length ? partialMoveFrameIssue(m, motion, targetDirs.length) : '')
		);
	});
	// App-side warnings never block a request PixelLab would take: Generate move anyway records them as accepted with the move.
	const preflight = $derived(
		m && store.project && id && !motionIssue
			? movePreflightWarnings(store.project, {
					...motion,
					items: [],
					seed: 0,
					...(replacing ? { dirs: [...targetDirs] } : {})
				})
			: []
	);
	const formEstimate = $derived(
		m && id && targetDirs.length && !reservedMove(id) && !motionIssue && !pendingIds.includes(id)
			? moveEstimate(m, { ...motion, items: [], dirs: targetDirs })
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
						items: [],
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
	ui.moveFormOpen = !!reopen;
	let reviewingSkeletonFor = $state.raw<MoveSpec | null>(null);
	const skeletonOffer = $derived.by(() => {
		if (!mine || !moving.spec || !m || !rec || !ok || moving.repairReview) return;
		if (
			moving.queued.some((entry) => entry.projectId === doc.id && entry.spec.id === moving.spec?.id)
		)
			return;
		return skeletonMoveReview(
			{ ...rec, manifest: m },
			moving.spec,
			moving.error,
			moving.done ? moving.qualityDirs : []
		);
	});
	const skeletonReview = $derived(
		reviewingSkeletonFor && reviewingSkeletonFor === moving.spec ? skeletonOffer : undefined
	);
	const est = $derived(skeletonReview?.estimate ?? formEstimate);
	const progress = $derived(mine && !ui.moveFormOpen && !skeletonReview);
	const repairReview = $derived(progress ? moving.repairReview : null);
	const busy = $derived(!!moving.spec && !moving.done);
	const savedItemFrames = $derived(
		!!moving.spec &&
			!!moving.spec.itemsOnly &&
			!moving.spec.replace &&
			(moving.spec.itemMethod === 'grid'
				? !!moving.spec.itemReview &&
					!errorText(moving.error).startsWith(INVALID_ITEM_GRID) &&
					// A misaligned batch replays as misaligned: only a re-roll of that batch can change it.
					!errorText(moving.error).startsWith(REPAIR_BATCH_MISALIGNED) &&
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
	// Another character's failed move holds every new move until its attempt is resolved.
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
	let paid = $state.raw<MovePaidReview | null>(null);
	const errorInReview = $derived(
		!!moving.error &&
			!!paid?.views.some((view) =>
				view.notes.some((note) => displayNestedMessage(note) === displayError(moving.error))
			)
	);
	const hasFrameRecovery = $derived(
		!!(savedItemFrames && !recoveryAccess.error) || !!(recovery || colorRepair || keep)
	);
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
		paid = null;
		recoveryError = '';
		recoveryUnavailable = [];
		recoveryChecking = false;
		if (mine && error && spec && !moving.done && spec.itemMethod !== 'grid') {
			recoveryChecking = true;
			void Promise.all([reviewMoveRecovery(projectId, spec), reviewMoveResults(projectId, spec)])
				.then(([review, results]) => {
					if (!current) return;
					recovery = review.recovery ?? null;
					colorRepair = review.colorRepair ?? null;
					keep = review.keep ?? null;
					recoveryUnavailable = review.unavailableMessages ?? [];
					paid = results ?? null;
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

	// An item repair stopped by a misaligned batch: its earlier batches are kept; only that batch is re-rolled.
	const batchReview = $derived.by((): (PaidReviewData & { start: string }) | null => {
		const error = moving.error,
			spec = moving.spec;
		if (!mine || !spec || !(error instanceof PaidStepError)) return null;
		const step = error.paid.step;
		if (!step.startsWith('grid-batch:')) return null;
		const records = $queue.jobs.filter(
			(job) => job.activityScope === spec.activityScope && job.state === 'done'
		);
		return {
			start: step.slice('grid-batch:'.length),
			views: [],
			spent: +records.reduce((sum, job) => sum + job.gens, 0).toFixed(2),
			recordIds: records.map((job) => job.id),
			options: [
				{
					id: 'reroll-batch',
					label: message('moveSheet.rerollBatch'),
					detail: message('moveSheet.rerollBatchDetail'),
					gens: error.paid.gens ?? 0,
					paid: true,
					primary: true
				}
			]
		};
	});
	function rerollBatch() {
		if (!moving.spec || !batchReview) return;
		const projectId = moving.projectId,
			spec = $state.snapshot(moving.spec),
			start = batchReview.start;
		withKey(() => {
			void startMove(projectId, {
				...spec,
				reuseItemFrames: undefined,
				gridReroll: {
					...spec.gridReroll,
					[start]: (spec.gridReroll?.[start] ?? 0) + 1 + Math.floor(Math.random() * 1_000_000)
				}
			});
			ui.sheet = 'move';
		}, recoveryTier);
	}
	/** A reviewed way on keeps the move's seed, so completed requests are reused; only a paid one needs the key. Make room
	 *  adjusts the frame first (free; this stopped move waits for it) and then continues the same move. */
	function choosePaid(option: MovePaidOption) {
		const projectId = moving.projectId,
			spec = $state.snapshot(option.spec),
			change = option.change && { ...option.change };
		const go = () => {
			ui.sheet = 'move';
			void (async () => {
				if (change) {
					try {
						await adjustCharacter(projectId, change, { stoppedMove: true, quiet: true });
					} catch (error) {
						recoveryError = errorMessage(error);
						return;
					}
				}
				await startMove(projectId, spec);
			})();
		};
		if (option.paid) withKey(go, retryTier);
		else go();
	}
	// Make room from the room warning: free; the form keeps every choice and its warnings are checked again.
	let enlarging = $state(false);
	let enlargeError = $state('');
	async function room() {
		enlarging = true;
		enlargeError = '';
		try {
			await makeRoomFor(doc.id);
		} catch (error) {
			enlargeError = displayError(error);
		} finally {
			enlarging = false;
		}
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
		if (skeletonReview && moving.spec) {
			const offer = skeletonReview;
			const prior = moving.spec;
			const replaceFailed = !!moving.error;
			const confirm = async () => {
				const current = () => doc.id === projectId && moving.spec === prior;
				if (!current()) return;
				const latest = await db.get<StoredProject>('projects', projectId);
				if (!current()) return;
				const fresh =
					latest &&
					!moving.queued.some(
						(entry) => entry.projectId === projectId && entry.spec.id === prior.id
					)
						? skeletonMoveReview(latest, prior, moving.error, moving.done ? moving.qualityDirs : [])
						: undefined;
				if (
					!fresh ||
					stableStringify(fresh) !== stableStringify(offer) ||
					tierBlocked(fresh.tier)
				) {
					toast(message('genCard.estimateFailed'), { tone: 'warning' });
					return;
				}
				const spec = { ...fresh.review, seed: 1 + Math.floor(Math.random() * 1_000_000) };
				reviewingSkeletonFor = null;
				ui.moveFormOpen = false;
				if (replaceFailed) void startMove(projectId, spec);
				else void queueMoves(projectId, [spec]);
				ui.sheet = 'move';
			};
			withKey(
				() =>
					void confirm().catch((error: unknown) => toast(errorMessage(error), { tone: 'warning' })),
				offer.tier
			);
			return;
		}
		if (!formEstimate || addAccess.error) return;
		const spec: MoveSpec = {
			...motion,
			items: [],
			reviewBeforePublish: true,
			reviewRegeneration: regeneration,
			poseStyle: 'visible-side-v1' as const,
			seed: 1 + Math.floor(Math.random() * 1_000_000),
			...(replacing ? { dirs: [...targetDirs] } : { approvedDirs: [...targetDirs] }),
			...(preflight.length ? { acceptedWarnings: preflight.map((warning) => warning.id) } : {})
		};
		formDrafts.move = {
			projectId,
			regeneration,
			action,
			replace: replaceSelected,
			text,
			dirs: [...selectedDirs],
			poseStyle: 'visible-side-v1',
			animation:
				!riding && (modelChoice !== undefined || userFrameCount !== undefined)
					? { model, frameCount: userFrameCount }
					: undefined
		};
		const estimate = formEstimate;
		const minimumTier = addTier;
		const confirm = async () => {
			if (spec.reviewRegeneration) {
				const latest = await db.get<StoredProject>('projects', projectId);
				const candidate = latest?.moveReviews?.[spec.id];
				const nextEstimate = latest && moveEstimate(latest.manifest, spec);
				if (
					!latest ||
					!candidate ||
					doc.id !== projectId ||
					candidate.spec.seed !== spec.reviewRegeneration.seed ||
					candidate.spec.activityScope !== spec.reviewRegeneration.activityScope ||
					moveCandidateInput(latest, spec.id) !== candidate.input ||
					pendingMoves(projectId).some((entry) => entry.id === spec.id) ||
					stableStringify(nextEstimate) !== stableStringify(estimate) ||
					moveMinimumTier(latest.manifest, spec) !== minimumTier ||
					tierBlocked(minimumTier)
				) {
					toast(message('genCard.estimateFailed'), { tone: 'warning' });
					return;
				}
			}
			formDrafts.move = undefined;
			ui.moveFormOpen = false;
			void queueMoves(projectId, [spec]);
			ui.sheet = 'move';
		};
		withKey(
			() =>
				void confirm().catch((error: unknown) => toast(errorMessage(error), { tone: 'warning' })),
			minimumTier
		);
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
		if (frameChoice !== undefined && keptFrames === undefined)
			frameChoice = defaultMoveFrameCount(next, canvas, frameChoice);
	}
	function describeMove(value: string) {
		chooseAction('');
		text = value;
	}
	function leaveFailedMove(close: boolean) {
		void dismissMove().catch((error) =>
			toast(message('state.couldNotSaveReason', { reason: errorMessage(error) }), {
				tone: 'danger'
			})
		);
		if (close && !moving.spec) ui.sheet = null;
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
		<div class="recovery-actions">
			<button class="bu-action btn plain" data-variant="quiet" onclick={() => leaveFailedMove(true)}
				>{t('common.cancel')}</button
			>
			<div class="recovery-options">
				{#if !moving.spec?.itemsOnly && ok}
					<button
						class="bu-action btn"
						data-variant="outline"
						onclick={() => leaveFailedMove(false)}>{t('moveSheet.newSetup')}</button
					>
				{/if}
				<span class="api-action"
					><ApiPeek scope="move-retry" label={t('moveSheet.retryLabel')} plan={retryPlan} /><button
						class="bu-action btn"
						class:primary={!hasFrameRecovery}
						data-variant={hasFrameRecovery ? 'outline' : 'primary'}
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
						>{t('common.generateAgain')}{#if retryGens}
							<span class="cost">{t('moves.estimate', { gens: formatNumber(retryGens) })}</span
							>{/if}</button
					></span
				>
			</div>
		</div>
		<!-- new seed re-rolls body + item poses (R6 P2-7) -->
	{:else if progress}
		<span class="foot-note">{t('moveSheet.keepWorking')}</span>
		<button class="bu-action btn" data-variant="outline" onclick={() => (ui.moveFormOpen = true)}
			>{t('moveSheet.queueAnother')}</button
		>
		<button class="bu-action btn" data-variant="outline" onclick={() => (ui.sheet = null)}
			>{t('common.hide')}</button
		>
	{:else if ok}
		{@const review = skeletonReview?.review}
		{@const requiredTier = skeletonReview?.tier ?? addTier}
		{@const replace = review ? review.replace : replacing}
		{@const move = review?.id ?? id}
		{#if review}<button
				class="bu-action btn plain"
				data-variant="quiet"
				onclick={() => (reviewingSkeletonFor = null)}>{t('moveSheet.skeleton.back')}</button
			>{/if}
		{#if est}
			<span class="foot-note move-cost-note">
				<span>
					{t('moveSheet.checkpoint.initialEstimate', { minutes: formatNumber(est.minutes) })}
				</span>
				<span>{t('moveSheet.costNotice')}</span>
			</span>
		{/if}
		<span class="api-action move-action">
			{#if est}<ApiPeek
					scope="move-add"
					label={t('moveSheet.addLabel')}
					plan={movePlan(
						rec,
						review
							? { ...review, seed: undefined }
							: {
									...motion,
									items: [],
									poseStyle: 'visible-side-v1',
									...(replacing ? { dirs: [...targetDirs] } : {})
								}
					)}
				/>{/if}<button
				class="bu-action btn primary lg"
				data-variant="primary"
				disabled={!est ||
					(!review && !!addAccess.error) ||
					(!!settingUp.spec && !settingUp.done) ||
					tierBlocked(requiredTier)}
				aria-describedby={tierBlocked(requiredTier) ? 'move-action-tier' : undefined}
				onclick={go}
				><span>
					{t(
						busy && !review
							? replace
								? 'moveSheet.submit.queueReplacement'
								: 'moveSheet.submit.queue'
							: replace
								? 'moveSheet.submit.replaceViews'
								: !review && preflight.length
									? 'moveSheet.checkpoint.generateAnyway'
									: 'moveSheet.checkpoint.generate',
						{ move: move ? nice(move) : t('moveSheet.submit.move') }
					)}
					{#if est}<span class="cost">
							{t('moves.estimate', {
								gens: formatNumber(Math.ceil(est.gens))
							})}
						</span>{/if}</span
				></button
			></span
		>
	{/if}
{/snippet}

<Sheet
	title={skeletonReview
		? t('moveSheet.skeleton.title')
		: repairReview
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
	{#if mine && ui.moveFormOpen && moving.repairReview}
		<button class="bu-action btn" data-variant="outline" onclick={() => (ui.moveFormOpen = false)}
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
	{:else if skeletonReview}
		{@const review = skeletonReview.review}
		<div class="form">
			<p>
				{nice(review.id)} · {t(MODEL_TEXT['skeleton-v3'])} · {t('moveSheet.framesValue', {
					count: skeletonReview.estimate.frames
				})}
			</p>
			<p class="small">
				{t('common.directions')}: {skeletonReview.affected.map(directionLabel).join(', ')}
			</p>
			{#if review.text}<p class="small">{review.text}</p>{/if}
			{#if review.replace}<p class="notice small">
					{t('moveSheet.redrawHidesEquipment')}
					{t('moveSheet.redrawOtherMoves')}
				</p>{/if}
			{#if tierBlocked(skeletonReview.tier)}<TierNotice
					id="move-action-tier"
					minimumTier={skeletonReview.tier}
					feature={t('moveSheet.retryFeature')}
				/>{/if}
		</div>
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
			<!-- The paid review names each stopped view's reason under its frames; the summary shows only a reason it does not. -->
			{#if moving.error && !errorInReview}<p class="notice bad small">
					<CircleAlert size={14} />{displayError(moving.error)}
				</p>{/if}
			{#if moving.error}
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
				</p>
				{#if moving.error && !moving.done && !recoveryAccess.error}<button
						class="bu-action btn primary frame-recovery-action"
						data-variant="primary"
						onclick={() =>
							moving.spec &&
							void startMove(moving.projectId, {
								...$state.snapshot(moving.spec),
								reuseItemFrames: true
							})}>{t('moveSheet.useSaved')}</button
					>{/if}{/if}
			{#if recoveryChecking}<p class="muted small" role="status">
					{t('moveSheet.checkingCached')}
				</p>{/if}
			{#if batchReview && moving.spec}<PaidReview
					review={batchReview}
					name={nice(moving.spec.id)}
					blocked={!!recoveryAccess.error || tierBlocked(recoveryTier)}
					onchoose={rerollBatch}
				/>{/if}
			{#if paid && moving.spec && (paid.options.length || paid.views.some((view) => view.state !== 'ready'))}<PaidReview
					review={paid}
					name={nice(moving.spec.id)}
					blocked={!!retryAccess.error || tierBlocked(retryTier)}
					onchoose={choosePaid}
				/>{/if}
			{#if recoveryUnavailable.length}<p class="notice small">
					{recoveryUnavailable.map(displayNestedMessage).join(' ')}
				</p>{/if}
			{#if ownQueued.length}<p class="muted small">
					{t(moving.error ? 'moveSheet.queuedNextRetry' : 'moveSheet.queuedNext', {
						moves: ownQueued.map((q) => nice(q.spec.id)).join(', ')
					})}
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
					{#if moving.error && !moving.done}<button
							class="bu-action btn primary frame-recovery-action"
							data-variant="primary"
							onclick={keepBody}>{t('moveSheet.keepFrames')}</button
						>{/if}
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
				{#if moving.error && !moving.done}<button
						class="bu-action btn primary frame-recovery-action"
						data-variant="primary"
						disabled={!!recoveryAccess.error || tierBlocked(recoveryTier)}
						aria-describedby={tierBlocked(recoveryTier) ? 'move-retry-tier' : undefined}
						onclick={retryChecks}
						>{recovery.checks ? t('moveSheet.retryChecks') : t('moveSheet.reuseCached')}</button
					>{/if}
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
				{#if moving.error && !moving.done}<button
						class="bu-action btn primary frame-recovery-action"
						data-variant="primary"
						disabled={!!recoveryAccess.error || tierBlocked(recoveryTier)}
						aria-describedby={tierBlocked(recoveryTier) ? 'move-retry-tier' : undefined}
						onclick={matchColors}>{t('moveSheet.matchColors')}</button
					>{/if}
			{/if}
			{#if recoveryError}<p class="notice bad small">
					<CircleAlert size={14} />{displayNestedMessage(recoveryError)}
				</p>{/if}
			{#each moving.warnings as warning (warning)}<p class="notice warn small">
					<CircleAlert size={14} />{bodyQualityNote(warning, t)}
				</p>{/each}
			{#if skeletonOffer && !tierBlocked(skeletonOffer.tier)}
				<p class="notice small">
					<span>{t('moveSheet.skeleton.hint')}</span>
					<button
						class="bu-action btn sm"
						data-variant="outline"
						onclick={() => (reviewingSkeletonFor = moving.spec)}
					>
						{t('moveSheet.skeleton.title')}
						<span class="cost">
							{t('moves.estimate', { gens: formatNumber(Math.ceil(skeletonOffer.estimate.gens)) })}
						</span>
						<SurfaceChevron />
					</button>
				</p>
			{/if}
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
						<div class="advanced-field">
							<div class="advanced-label">
								<label for={`${advancedId}-model`}>{t('moveSheet.motionModel')}</label>
								<Help
									iconOnly
									title={t('moveSheet.motionModel')}
									text={t('moveSheet.motionModelHelp')}
								/>
							</div>
							<select
								id={`${advancedId}-model`}
								class="bu-input input"
								value={model}
								onchange={(e) => chooseModel(e.currentTarget.value as MoveAnimationModel)}
								>{#each MODELS as option (option)}<option
										value={option}
										disabled={option !== model && !fitsKept(option)}>{t(MODEL_TEXT[option])}</option
									>{/each}</select
							>
						</div>
						<div class="advanced-field frames-field">
							<div class="advanced-label">
								{#if keptFrames === undefined && frameCounts.length}
									<label for={`${advancedId}-frames`}>{t('moveSheet.frames')}</label>
								{:else}
									<span>{t('moveSheet.frames')}</span>
								{/if}
								<Help
									iconOnly
									title={t('moveSheet.frames')}
									text={t('moveSheet.framesHelp', { canvas: formatNumber(canvas) })}
								/>
								{#if keptFrames === undefined && frameCounts.length}
									<button
										type="button"
										class="bu-action btn plain frame-default"
										data-variant="quiet"
										aria-disabled={userFrameCount === undefined}
										onclick={() => (frameChoice = undefined)}
										>{t('moveSheet.framesDefault', { count: defaultFrames })}</button
									>
								{/if}
							</div>
							{#if keptFrames !== undefined}
								<span class="faint">{t('moveSheet.framesKept', { count: keptFrames })}</span>
							{:else if frameCounts.length}
								<div class="frame-controls">
									<input
										id={`${advancedId}-frames`}
										type="range"
										aria-valuetext={t('moveSheet.framesValue', { count: shownFrames })}
										min={0}
										max={frameCounts.length - 1}
										value={frameCounts.indexOf(shownFrames)}
										oninput={(e) => (frameChoice = frameCounts[e.currentTarget.valueAsNumber])}
									/>
									<span class="frame-value"
										>{t('moveSheet.framesValue', { count: shownFrames })}</span
									>
								</div>
							{/if}
						</div>
					</div>
				</details>
			{/if}
			{#if reservedMove(id)}<p class="notice warn small">
					<CircleAlert size={14} />{displayError(reservedMove(id))}
				</p>{:else if motionIssue}<p class="notice warn small">
					<CircleAlert size={14} />{displayError(motionIssue)}
				</p>{:else if preflight.length}{#each preflight as warning (warning.id)}<p
						class="notice warn small"
					>
						<CircleAlert size={14} />{displayError(warning)}
					</p>
					{#if warning.id === 'frame-room-move'}
						<button
							class="bu-action btn"
							data-variant="outline"
							disabled={enlarging || !!frameEditsBlocked(doc.id)}
							onclick={() => void room()}>{t('moveSheet.makeRoom')}</button
						>
						{#if enlargeError}<p class="notice bad small" role="alert">{enlargeError}</p>{/if}
					{/if}{/each}{:else if pendingIds.includes(id)}<p class="notice small">
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
								t('moves.estimate', { gens: decimal(est.body) })
							].join(' · ')}
						</p>
					</div>
				</details>{/if}
		</div>
	{/if}
</Sheet>

<style>
	.frame-recovery-action {
		align-self: flex-start;
		justify-self: start;
	}
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
	.advanced-field {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.advanced-label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
	.frames-field {
		row-gap: 0;
	}
	.frame-controls {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
	}
	.frame-controls input {
		min-width: 0;
		width: 100%;
	}
	.frame-controls input[type='range'] {
		margin: 0;
		min-height: 44px;
	}
	.frame-default {
		margin-inline-start: auto;
	}
	.frame-value {
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 599px), (max-height: 499px) {
		.advanced-field .input {
			min-height: 44px;
			font-size: 16px;
		}
	}
</style>
