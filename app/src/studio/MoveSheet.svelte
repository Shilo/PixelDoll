<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	// Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
	// re-rendered through raw skeleton-v3), plus one pose call per worn item x direction so the items follow the new clip.
	import Sheet from './Sheet.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import Help from './Help.svelte';
	import Sprite from './Sprite.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import ReferenceField from './ReferenceField.svelte';
	import type { PickedReference } from '../lib/image/reference.ts';
	import { base64ToBytes, decodePng } from '../lib/image/png.ts';
	import {
		automaticMoveEnd,
		defaultMoveFrameCount,
		gaitTemplate,
		moveFrameCounts,
		templateLoops,
		type MoveAnimationModel,
		type MoveAnimationOptions,
		type MoveFrameReferences
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
	import { displayDirection as directionLabel, displayDirectionShort } from './displayDirection.ts';
	import { ANGLES } from './characterConfig.ts';
	import { ArrowUp, Check, ChevronRight, Circle, CircleAlert } from './icons.ts';
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
			...new Set([
				'idle',
				'walk',
				'run',
				...AUTHORED,
				...(m?.rig.animations.map((a) => a.id) ?? [])
			])
		].filter((a) => !reservedMove(a))
	);
	const draft = formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined;
	// The PixelLab models that can make a move's body frames; Skeleton v3 keeps the current flow.
	const MODELS: MoveAnimationModel[] = ['skeleton-v3', 'pixminimax', 'v3'];
	const advancedId = $props.id();
	const MODEL_TEXT: Record<MoveAnimationModel, WhisperKey> = {
		'skeleton-v3': 'moveSheet.models.skeletonV3',
		v3: 'moveSheet.models.v3',
		pixminimax: 'moveSheet.models.pixminimax'
	};
	// Advanced starts open when a restored draft already changed something there, so no choice is hidden.
	let advancedOpen = $state(
		!!(draft?.frameReferences && Object.keys(draft.frameReferences).length) ||
			(draft?.animation?.model !== undefined && draft.animation.model !== 'skeleton-v3')
	);
	let modelChoice = $state<MoveAnimationModel | undefined>(draft?.animation?.model);
	let frameChoice = $state<number | undefined>(draft?.animation?.frameCount);
	let action = $state(draft?.action ?? untrack(() => options.find((a) => !have.has(a))) ?? '');
	let replaceSelected = $state(draft?.replace ?? false);
	let text = $state(draft?.text ?? '');
	let loopChoice = $state<boolean | undefined>(draft?.loop);
	let frameReferences = $state<MoveFrameReferences<PickedReference>>(draft?.frameReferences ?? {});
	let referenceDirection = $state<DirectionName>();
	let frameTabWidths = $state<Partial<Record<DirectionName, number>>>({});
	let frameLabelWidths = $state<Partial<Record<DirectionName, number>>>({});
	let startLoading = $state(false);
	let endLoading = $state(false);
	let confirm = $state.raw<{ kind: 'start' | 'loop'; accept: () => void }>();
	let loopChange = 0;
	let customStartAcknowledged = false;
	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 24);
	const replacing = $derived(replaceSelected && have.has(action));
	const savedMove = $derived(m?.rig.animations.find((a) => a.id === action));
	const looping = $derived(
		loopChoice ??
			(replacing ? (savedMove?.moveLoop ?? savedMove?.loop) : undefined) ??
			templateLoops(action)
	);
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
	const showFullFrameDirections = $derived(
		targetDirs.every((dir) => (frameLabelWidths[dir] ?? Infinity) <= (frameTabWidths[dir] ?? 0))
	);
	const frameDirection = $derived(
		referenceDirection && targetDirs.includes(referenceDirection)
			? referenceDirection
			: targetDirs[0]
	);
	const frameReference = $derived(frameDirection ? frameReferences[frameDirection] : undefined);
	const standingImage = $derived.by(() => {
		const hash = frameDirection && m?.rig.rest?.[frameDirection]?.image;
		return hash ? (store.project?.images.get(hash) ?? null) : null;
	});
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
			((!gaitTemplate(action) && !isAuthoredAction(action)) ||
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
		if (modelChoice && fitsKept(modelChoice)) return modelChoice;
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
			: {
					model,
					loop: looping,
					...(chosenFrameCount === undefined ? {} : { frameCount: chosenFrameCount }),
					...(Object.keys(frameReferences).length
						? {
								references: Object.fromEntries(
									targetDirs.flatMap((direction) => {
										const value = frameReferences[direction];
										if (!value) return [];
										const compact = (reference: PickedReference) => ({
											width: reference.width,
											height: reference.height,
											base64: reference.base64
										});
										return [
											[
												direction,
												{
													...(value.start ? { start: compact(value.start) } : {}),
													...(model !== 'skeleton-v3' && value.end !== undefined
														? { end: value.end ? compact(value.end) : null }
														: {})
												}
											]
										];
									})
								)
							}
						: {})
				}
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
			model === 'skeleton-v3' ? '' : t(MODEL_TEXT[model]),
			targetDirs.some(
				(direction) =>
					frameReferences[direction]?.start ||
					(model !== 'skeleton-v3' && frameReferences[direction]?.end)
			)
				? t('moveSheet.customFrames')
				: ''
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
		if (
			model === 'skeleton-v3' &&
			!customStartAcknowledged &&
			targetDirs.some((direction) => frameReferences[direction]?.start)
		) {
			pickStart(go);
			return;
		}
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
			frameReferences: $state.snapshot(frameReferences),
			loop: loopChoice,
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
		loopChoice = undefined;
		frameReferences = {};
		customStartAcknowledged = false;
		referenceDirection = undefined;
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
	function changeFrame(
		direction: DirectionName,
		kind: 'start' | 'end',
		value?: PickedReference | null
	) {
		const next = { ...frameReferences[direction], [kind]: value };
		const references = { ...frameReferences };
		if (next.start || next.end !== undefined) references[direction] = next;
		else delete references[direction];
		frameReferences = references;
	}
	function navigateFrameTabs(event: KeyboardEvent, direction: DirectionName) {
		const index = targetDirs.indexOf(direction);
		const last = targetDirs.length - 1;
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? last
					: event.key === 'ArrowLeft'
						? (index + last) % targetDirs.length
						: event.key === 'ArrowRight'
							? (index + 1) % targetDirs.length
							: -1;
		if (next < 0) return;
		event.preventDefault();
		if (startLoading || endLoading) return;
		referenceDirection = targetDirs[next];
		document.getElementById(`${advancedId}-frame-${referenceDirection}`)?.focus();
	}
	async function changeLoop(enabled: boolean) {
		const change = ++loopChange;
		if (model === 'skeleton-v3' || riding) {
			loopChoice = enabled;
			return;
		}
		const draftFrames = frameReferences;
		const draftModel = model;
		const directions = targetDirs;
		const isCurrent = () =>
			change === loopChange &&
			draftFrames === frameReferences &&
			draftModel === model &&
			directions === targetDirs;
		const reset = () => {
			if (!isCurrent()) return;
			for (const direction of directions) changeFrame(direction, 'end');
			loopChoice = enabled;
		};
		const changed = await Promise.all(
			directions.map(async (direction) => {
				const frames = draftFrames[direction];
				if (!frames?.end || frames.end.base64 === frames.start?.base64) return false;
				try {
					const end = await decodePng(base64ToBytes(frames.end.base64));
					const hash = m?.rig.rest?.[direction]?.image;
					const start = frames.start
						? await decodePng(base64ToBytes(frames.start.base64))
						: hash && store.project?.images.get(hash);
					return (
						!start ||
						start.w !== end.w ||
						start.h !== end.h ||
						end.data.some(
							(byte, index) =>
								byte !== start.data[index] &&
								(index % 4 === 3 || end.data[index - (index % 4) + 3] !== 0)
						)
					);
				} catch {
					return true;
				}
			})
		);
		if (!isCurrent()) return;
		if (changed.some(Boolean)) confirm = { kind: 'loop', accept: reset };
		else reset();
	}
	function pickStart(accept: () => void) {
		if (model !== 'skeleton-v3' || customStartAcknowledged) {
			accept();
			return;
		}
		confirm = {
			kind: 'start',
			accept: () => {
				customStartAcknowledged = true;
				accept();
			}
		};
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
					startLoading ||
					endLoading ||
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
				<label class="bu-check loop-setting">
					<span class="loop-copy">
						<span>{t('moveSheet.loop')}</span>
						<span id={`${advancedId}-loop-hint`} class="faint small">{t('moveSheet.loopHint')}</span
						>
					</span>
					<input
						class="bu-switch"
						type="checkbox"
						role="switch"
						checked={looping}
						aria-label={t('moveSheet.loop')}
						aria-describedby={`${advancedId}-loop-hint`}
						onchange={(event) => {
							const enabled = event.currentTarget.checked;
							event.currentTarget.checked = looping;
							void changeLoop(enabled);
						}}
					/>
				</label>
				<div class="frame-settings">
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
								<span class="frame-value">{t('moveSheet.framesValue', { count: shownFrames })}</span
								>
							</div>
						{/if}
					</div>
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
									onchange={(event) => chooseModel(event.currentTarget.value as MoveAnimationModel)}
								>
									{#each MODELS as option (option)}<option
											value={option}
											disabled={option !== model && !fitsKept(option)}
											>{t(MODEL_TEXT[option])}</option
										>{/each}
								</select>
							</div>
							{#if frameDirection && m}
								{@const direction = frameDirection}
								{@const size = { width: m.rig.cell.w, height: m.rig.cell.h }}
								{@const autoEnd =
									frameReference?.end === undefined && automaticMoveEnd(action, looping)}
								<div class="reference-heading">
									<div class="advanced-label">
										<span id={`${advancedId}-reference-title`}
											>{t('moveSheet.referenceDirection')}</span
										>
										<Help
											iconOnly
											title={t('moveSheet.referenceDirection')}
											text={t('moveSheet.referenceHelp')}
										/>
									</div>
									{#if targetDirs.length === 1 || !showFullFrameDirections}
										<span class="faint" id={`${advancedId}-reference-direction`}
											>{directionLabel(direction)}</span
										>
									{/if}
								</div>
								{#if targetDirs.length > 1}
									<div
										class="frame-tabs"
										class:many-directions={targetDirs.length > 5}
										role="tablist"
										aria-labelledby={`${advancedId}-reference-title`}
									>
										{#snippet directionArrow(option: DirectionName)}
											<ArrowUp size={14} style="transform:rotate({ANGLES[option]}deg)" />
										{/snippet}
										{#each targetDirs as option (option)}
											{@const name = directionLabel(option)}
											{@const edited = !!(
												frameReferences[option]?.start || frameReferences[option]?.end
											)}
											<button
												type="button"
												id={`${advancedId}-frame-${option}`}
												class="bu-action"
												data-variant="tab"
												role="tab"
												aria-selected={direction === option}
												aria-controls={`${advancedId}-frame-panel`}
												aria-disabled={startLoading || endLoading}
												aria-label={edited
													? t('moveSheet.referenceEdited', { direction: name })
													: name}
												tabindex={direction === option ? 0 : -1}
												onclick={() => {
													if (!startLoading && !endLoading) referenceDirection = option;
												}}
												onkeydown={(event) => navigateFrameTabs(event, option)}
											>
												<span class="bu-separator frame-tab-rule" aria-hidden="true"></span>
												<span
													class="frame-tab-content"
													bind:clientWidth={frameTabWidths[option]}
													aria-hidden="true"
												>
													{@render directionArrow(option)}
													<span
														>{showFullFrameDirections ? name : displayDirectionShort(option)}</span
													>
												</span>
												<span class="frame-tab-measure" aria-hidden="true">
													<span
														class="frame-tab-content"
														bind:offsetWidth={frameLabelWidths[option]}
													>
														{@render directionArrow(option)}
														<span class="bu-tab-text" data-text={name}>{name}</span>
													</span>
												</span>
												{#if edited}<Circle
														class="bu-tile-check"
														size={6}
														fill="currentColor"
														strokeWidth={0}
														aria-hidden="true"
													/>{/if}
											</button>
										{/each}
									</div>
								{/if}
								<div
									id={`${advancedId}-frame-panel`}
									class="frame-panel"
									role={targetDirs.length > 1 ? 'tabpanel' : 'group'}
									aria-labelledby={targetDirs.length > 1
										? `${advancedId}-frame-${direction}`
										: `${advancedId}-reference-title ${advancedId}-reference-direction`}
								>
									{#key `${action}/${direction}/${model}`}
										<div class="frame-references">
											{#snippet standing()}<Sprite
													img={standingImage}
													k={1}
													limit={36}
													label={t('moveSheet.standingFrame')}
												/>{/snippet}
											{#snippet matching()}
												{#if frameReference?.start}<img
														class="matching-preview"
														src={`data:image/png;base64,${frameReference.start.base64}`}
														alt=""
													/>{:else}{@render standing()}{/if}
											{/snippet}
											<ReferenceField
												exactFrame
												sideBySide
												max={size}
												label={t('moveSheet.startFrame')}
												hint=""
												caption={t('moveSheet.standingFrame')}
												thumbnail={standing}
												beforePick={pickStart}
												bind:loading={startLoading}
												bind:value={
													() => frameReference?.start,
													(value) => changeFrame(direction, 'start', value)
												}
											/>
											<ReferenceField
												exactFrame
												sideBySide
												max={size}
												label={t('moveSheet.endFrame')}
												hint=""
												caption={t(
													model === 'skeleton-v3'
														? 'moveSheet.endUnavailable'
														: autoEnd
															? 'moveSheet.sameAsStart'
															: 'moveSheet.noEndFrame'
												)}
												thumbnail={model !== 'skeleton-v3' && autoEnd ? matching : undefined}
												disabled={model === 'skeleton-v3'}
												bind:loading={endLoading}
												removeLabel={t('moveSheet.removeEndFrame')}
												bind:value={
													() =>
														model === 'skeleton-v3'
															? undefined
															: (frameReference?.end ?? undefined),
													(value) => changeFrame(direction, 'end', value)
												}
												onremove={() => changeFrame(direction, 'end', null)}
											/>
										</div>
									{/key}
									<small class="faint">{t('moveSheet.referenceSize', size)}</small>
								</div>
							{/if}
						</div>
					</details>
				</div>
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

{#if confirm}
	<ConfirmDialog
		title={t(confirm.kind === 'start' ? 'moveSheet.customStartTitle' : 'moveSheet.changeLoopTitle')}
		action={t(
			confirm.kind === 'start' ? 'moveSheet.customStartContinue' : 'moveSheet.changeLoopAccept'
		)}
		cancel={t(confirm.kind === 'start' ? 'moveSheet.customStartKeep' : 'common.cancel')}
		oncancel={() => (confirm = undefined)}
		onconfirm={() => {
			const accept = confirm?.accept;
			confirm = undefined;
			accept?.();
		}}
	>
		<p>
			{t(confirm.kind === 'start' ? 'moveSheet.customStartWarning' : 'moveSheet.changeLoopWarning')}
		</p>
	</ConfirmDialog>
{/if}

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
	.loop-setting {
		justify-content: space-between;
	}
	.loop-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.frame-settings {
		display: grid;
		gap: 2px;
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
	.reference-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.frame-tabs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
		row-gap: 4px;
	}
	.frame-tabs button {
		position: relative;
		display: flex;
		align-items: center;
		min-height: 44px;
		min-width: 0;
		padding-inline: 4px;
		font-size: var(--fs-sm);
	}
	.frame-tab-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}
	.frame-tab-content :global(svg) {
		flex: none;
	}
	.frame-tab-rule {
		position: absolute;
		inset-inline: 0;
		inset-block-end: calc(-1px - var(--bu-tab-stroke, 1px));
	}
	.frame-tab-measure {
		position: absolute;
		visibility: hidden;
		inline-size: 0;
		overflow: hidden;
		white-space: nowrap;
	}
	.frame-tab-measure .frame-tab-content {
		width: max-content;
	}
	.frame-panel {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.frame-references {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.matching-preview {
		width: 36px;
		height: 36px;
		object-fit: contain;
		image-rendering: pixelated;
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
	@media (max-width: 459px) {
		.frame-tabs.many-directions {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 599px), (max-height: 499px) {
		.advanced-field .input {
			min-height: 44px;
			font-size: 16px;
		}
	}
</style>
