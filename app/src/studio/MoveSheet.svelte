<script lang="ts">
	import SurfaceChevron from './SurfaceChevron.svelte';
	import { openerLabel } from './openerLabel.ts';
	// Add a move: an authored action (raw skeleton-v3 keypoints from the rest pose, S3) or a described one (pixminimax motion,
	// re-rendered through raw skeleton-v3).
	import { MediaQuery } from 'svelte/reactivity';
	import PromptField from './PromptField.svelte';
	import PromptSuggestions from './PromptSuggestions.svelte';
	import { promptSuggestionDefaults } from './promptSuggestionDefaults.ts';
	import { promptSuggestions } from './promptSuggestions.svelte.ts';
	import type { PromptSuggestion } from './promptSuggestions.ts';
	import type { EnhanceSpec } from './promptEnhance.ts';
	import Sheet from './Sheet.svelte';
	import DirectionCompass from './DirectionCompass.svelte';
	import Help from './Help.svelte';
	import ModelSelect from './ModelSelect.svelte';
	import Sprite from './Sprite.svelte';
	import SourcePreview from './SourcePreview.svelte';
	import PlaybackPicker from './experience/PlaybackPicker.svelte';
	import { bodyClipThumbnail } from './moveThumbnails.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import ReferenceField from './ReferenceField.svelte';
	import type { PickedReference } from '../lib/image/reference.ts';
	import { base64ToBytes, decodePng } from '../lib/image/png.ts';
	import PaidReview from './PaidReview.svelte';
	import {
		automaticMoveEnd,
		defaultMoveFrameCount,
		moveTemplatePrompt,
		moveReferenceEnd,
		moveFrameCounts,
		templateLoops,
		type MoveAnimationModel,
		type MoveAnimationOptions,
		type MoveFrameReferences
	} from './moveAnimationOptions.ts';
	import { onDestroy, tick, untrack } from 'svelte';
	import { default as ApiPeek } from './ApiPeek.svelte';
	import { movePlan } from './apiPlans.ts';
	import { formDrafts } from './formDrafts.ts';
	import * as db from '../lib/store/db.ts';
	import { stableStringify } from '../lib/image/hash.ts';
	import type { StoredProject } from '../lib/store/project.ts';
	import type { DirectionName } from '../lib/store/manifest.ts';
	import { queue } from '../lib/pixellab/queue.ts';
	import { DEFAULT_MOVE, DIRECTIONS } from '../lib/rig/rig.ts';
	import { cellImg } from '../lib/compose/compose.ts';
	import { lastPlaybackCell, playbackClips } from '../lib/runtime/timeline.js';
	import { moveSourceMatches, resolveMoveSource, savedReplacementSource } from './moveSource.ts';
	import { clipNameId, sameClipName } from './clipName.ts';
	import { stateAttempts } from './stateRecovery.ts';
	import {
		isGeneratedState,
		measureStateJoints,
		quoteStateJointFit,
		saveStateJointFit,
		type StateJointFitQuote,
		type StateJointFitReview
	} from './stateJointFit.ts';
	import {
		MOVE_STEPS,
		b64,
		bodyMoveIssue,
		partialMoveFrameIssue,
		resolveMoveMotionSource,
		moveRigReady,
		reservedMove,
		reviewMoveRecovery,
		reviewMoveResults,
		movePreflightWarnings,
		skeletonMoveReview,
		moveMinimumTier,
		type MovePaidOption,
		type MovePaidReview,
		type MoveSpec,
		type BodyPaletteRepairPlan,
		type KeepBodyPlan,
		type MeasurementRecoveryPlan
	} from './create.ts';
	import { moveFrames, moveMotionFrames, isAuthoredAction, moveEstimate } from './movePricing.ts';
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
	import { bodyQualityNote, displayMoveJob, plainReasonMessage } from './model.ts';
	import { displayMove } from './displayMove.ts';
	import { affectedMoveDirections, moveCandidateInput } from './replaceMove.ts';
	import { displayDirection as directionLabel, displayDirectionShort } from './displayDirection.ts';
	import { ANGLES } from './characterConfig.ts';
	import { ArrowUp, Check, ChevronRight, Circle, CircleAlert } from './icons.ts';
	import type { Img } from '../lib/image/png.ts';
	import { opaqueBox } from '../lib/rig/normalize.ts';
	import { app } from '../lib/app.svelte.ts';
	import { GENERATION_RECOMMENDATION, tierDecision } from '../lib/pixellab/plans.ts';
	import TierNotice from './TierNotice.svelte';
	import { displayError, displayMessage, errorMessage } from '../lib/i18n.ts';
	import {
		errorKey,
		errorTranslation,
		LocalizedError,
		message,
		sameMessage,
		type Message
	} from '../lib/message.ts';
	import { displayNestedMessage } from './nestedMessage.ts';
	import { formatNumber, t, type WhisperKey } from 'svelte-whisper';
	import ReportButton from './ReportButton.svelte';
	import ProblemNotice from './ProblemNotice.svelte';
	import {
		creationDefaults,
		moveModels,
		openingCreationSettings,
		resolveMoveFramePreference
	} from './creationSettings.ts';

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
	const ok = $derived(!!m && moveRigReady(rec ? { ...rec, manifest: m } : null));
	const sourceClips = $derived(playbackClips(m?.rig.animations ?? []));
	const have = $derived(new Set(sourceClips.filter((a) => a.kind === 'move').map((a) => a.key)));
	const stateIds = $derived(
		new Set(sourceClips.filter((a) => a.kind === 'state').map((a) => a.key))
	);
	const pendingIds = $derived(pendingMoves(doc.id).map((s) => s.id));
	// Default is the standing views themselves: nothing to generate or replace.
	const options = $derived(
		promptSuggestionDefaults.move.flatMap(({ action }) =>
			action && !stateIds.has(action) && !have.has(action) && !reservedMove(action) ? [action] : []
		)
	);
	const suggestions = $derived(
		promptSuggestions('move').filter(({ action }) => !action || options.includes(action))
	);
	const redrawTarget = untrack(() => ui.redrawMove);
	const draft =
		!redrawTarget && formDrafts.move?.projectId === doc.id ? formDrafts.move : undefined;
	if (draft && !draft.regeneration) formDrafts.move = undefined;
	let sourceId = $state<string | undefined>(draft?.source?.clip);
	let sourceCell = $state<number | undefined>(draft?.source?.cell);
	const sourceClip = $derived(
		sourceClips.find(({ key }) => key === (sourceId ?? DEFAULT_MOVE))?.clip
	);
	// Standing stays offered even when an import has rest views but no Standing clip.
	const startClips = $derived(
		sourceClips.some(({ key }) => key === DEFAULT_MOVE)
			? sourceClips
			: [{ id: 'standing', key: DEFAULT_MOVE, kind: 'state' as const }, ...sourceClips]
	);
	const sourceFrames = $derived([...new Set(sourceClip?.frames.map(({ cell }) => cell) ?? [])]);
	const startCell = $derived(sourceCell ?? (sourceClip && lastPlaybackCell(sourceClip)));
	// Standing without a clip is the saved rest views themselves.
	const restArt = (direction: DirectionName) => {
		const hash = store.project?.manifest.rig.rest?.[direction]?.image;
		return (hash && store.project?.images.get(hash)) || null;
	};
	// Every facing the start frame has, mirrored ones included, for the shared turning preview.
	const startPreviews = $derived.by(() => {
		const project = store.project;
		const clip = sourceId ?? DEFAULT_MOVE;
		const rest = !sourceClip && clip === DEFAULT_MOVE;
		if (!project || (startCell === undefined && !rest)) return [];
		return project.manifest.rig.directions
			.map(({ id }) => ({
				direction: id,
				image: rest ? restArt(id) : sourceThumbnail(clip, startCell!, id)
			}))
			.filter(({ image }) => image && opaqueBox(image))
			.sort(
				(left, right) => DIRECTIONS.indexOf(left.direction) - DIRECTIONS.indexOf(right.direction)
			);
	});
	const sourceThumbnail = (clip: string, cell: number, direction: DirectionName = ui.dir) => {
		const project = store.project;
		const base = project?.manifest.items.find((item) => item.id === project.manifest.rig.baseItem);
		if (!project || !base?.layers[0]) return null;
		const facing =
			project.manifest.rig.directions.find(({ id }) => id === direction) ??
			project.manifest.rig.directions[0];
		return facing ? (cellImg(project, base.layers[0], clip, facing.id, cell) ?? null) : null;
	};
	const reopen = draft?.reopen;
	if (reopen) delete draft.reopen;
	const redrawFallbackModel: MoveAnimationModel = 'pixminimax';
	const preferences = !draft && !redrawTarget ? openingCreationSettings('moves') : undefined;
	const advancedId = $props.id();
	// Advanced is a second column on a centered sheet with room for two, and an accordion otherwise.
	const roomy = new MediaQuery('min-width: 840px');
	const sideBySide = $derived(roomy.current && (ui.size === 'expanded' || ui.size === 'medium'));
	const MODEL_TEXT: Record<MoveAnimationModel, WhisperKey> = {
		'skeleton-v3': 'moveSheet.models.skeletonV3',
		v3: 'moveSheet.models.v3',
		pixminimax: 'moveSheet.models.pixminimax'
	};
	// Advanced starts open when a restored draft already changed something there, so no choice is hidden.
	let advancedOpen = $state(
		draft?.advancedOpen ??
			(!!(draft?.frameReferences && Object.keys(draft.frameReferences).length) ||
				(draft?.animation?.model !== undefined && draft.animation.model !== redrawFallbackModel))
	);
	const showAdvanced = $derived(sideBySide && advancedOpen);
	// The column opens beside the top of the form, away from the toggle, so bring its first control into view.
	async function toggleAdvanced() {
		advancedOpen = !advancedOpen;
		if (!advancedOpen) return;
		await tick();
		const first = document
			.getElementById(`${advancedId}-advanced`)
			?.querySelector<HTMLElement>('select, input, button, [tabindex="0"]');
		first?.scrollIntoView({ block: 'nearest' });
		first?.focus();
	}
	let modelChoice = $state<MoveAnimationModel | undefined>(draft?.animation?.model);
	const savedCustomFrames =
		draft?.savedCustomFrames ??
		(typeof preferences?.frames === 'number' ? preferences.frames : undefined);
	let frameChoice = $state<number | null | undefined>(
		draft?.frameChoice === undefined ? draft?.animation?.frameCount : draft.frameChoice
	);
	let action = $state(
		draft?.action ?? untrack(() => suggestions.find((entry) => entry.action)?.action) ?? ''
	);
	let replaceSelected = $state(draft?.replace ?? false);
	let text = $state(draft?.text ?? untrack(() => templateText(action)));
	// Only text the user typed counts as unsaved: a chosen template or a loaded move prompt does not.
	let textTyped = $state(false);
	// A template opened on its customized prompt counts as picked, as if its pill had been pressed.
	let templatePicked = $state(
		!!draft?.action || untrack(() => !!action && text !== moveTemplatePrompt(action))
	);
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
	const replacing = $derived(replaceSelected && have.has(action));
	const savedMove = $derived(m?.rig.animations.find((a) => a.id === action));
	const looping = $derived(
		loopChoice ??
			(replacing ? (savedMove?.moveLoop ?? savedMove?.loop) : undefined) ??
			templateLoops(action)
	);
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
			stateIds.has(`move-${n}`) ||
			pendingIds.includes(`move-${n}`) ||
			Object.hasOwn(store.moveReviews, `move-${n}`)
		)
			n++;
		return `move-${n}`;
	};
	const id = $derived(
		((replaceSelected || templatePicked || text.trim() === moveTemplatePrompt(action, looping)) &&
			action) ||
			(text.trim() &&
				(clipNameId(text.trim().split(/[,.]/)[0].split(/\s+/).slice(0, 2).join(' ')).slice(0, 24) ||
					freeMoveId()))
	);
	const availableDirs = $derived(
		m?.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id) ?? []
	);
	let selectedDirs = $state<DirectionName[]>(draft?.dirs ?? untrack(() => [...availableDirs]));
	const targetDirs = $derived(
		replacing ? availableDirs.filter((d) => selectedDirs.includes(d)) : availableDirs
	);
	const sourceSelection = $derived(
		sourceId === undefined ? undefined : { clip: sourceId, cell: sourceCell }
	);
	const explicitFrame = $derived(sourceSelection && sourceId !== DEFAULT_MOVE);
	const startFrom = $derived(
		m && explicitFrame && sourceSelection
			? resolveMoveSource(m, sourceSelection, targetDirs)
			: m && !sourceSelection && replacing
				? savedReplacementSource(m, action, targetDirs)
				: undefined
	);
	let fitBusy = $state(false);
	let fitQuote = $state.raw<StateJointFitQuote | null>(null);
	let fitReview = $state.raw<StateJointFitReview | null>(null);
	let fitError = $state<Message | string | null>(null);
	const fitLifetime = new AbortController();
	onDestroy(() => fitLifetime.abort());
	const offersFit = $derived(!startFrom && isGeneratedState(sourceClip));

	function selectSource(clip: string) {
		sourceId = clip;
		sourceCell = undefined;
		fitQuote = null;
		fitReview = null;
		fitError = null;
	}

	async function fitAction(work: () => Promise<void>) {
		if (fitBusy) return;
		fitBusy = true;
		fitError = null;
		try {
			await work();
		} catch (error) {
			fitError = errorMessage(error);
		} finally {
			fitBusy = false;
		}
	}

	function checkFitCost() {
		const projectId = doc.id;
		const stateId = sourceId;
		if (!stateId || fitBusy) return;
		if (!app.key || app.keyRejected) {
			rememberMoveForm(projectId);
			withKey(() => {
				if (doc.id === projectId) ui.sheet = 'move';
			});
			return;
		}
		void fitAction(async () => {
			fitQuote = await quoteStateJointFit(projectId, stateId);
		});
	}

	function measureFit() {
		const quote = fitQuote;
		if (!quote || fitBusy) return;
		fitQuote = null;
		void fitAction(async () => {
			fitReview = await measureStateJoints(quote, fitLifetime.signal);
		});
	}

	function saveFit() {
		const review = fitReview;
		if (!review || review.blocked || fitBusy) return;
		fitReview = null;
		void fitAction(async () => {
			await saveStateJointFit(review);
		});
	}
	const showFullFrameDirections = $derived(
		targetDirs.every((dir) => (frameLabelWidths[dir] ?? Infinity) <= (frameTabWidths[dir] ?? 0))
	);
	const frameDirection = $derived(
		referenceDirection && targetDirs.includes(referenceDirection)
			? referenceDirection
			: targetDirs[0]
	);
	const frameReference = $derived(frameDirection ? frameReferences[frameDirection] : undefined);
	// What a move starts from when no Start frame is uploaded: the chosen saved frame, else standing.
	const sourceStart = (direction: DirectionName) =>
		(startFrom?.views[direction] ?? m?.rig.rest?.[direction])?.image;
	const standingImage = $derived.by(() => {
		const hash = frameDirection && sourceStart(frameDirection);
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
	const describing = $derived(!action || text.trim() !== moveTemplatePrompt(action, looping));
	const canvas = $derived(m?.rig.cell.w ?? 0);
	// The frame count the core falls back to: a replaced clip's cells, otherwise PixelDoll's 8-frame preset.
	const baseFrames = $derived(replacing ? (savedMove?.cells ?? 8) : 8);
	// A partial replacement must keep the saved clip's cell count so redrawn views line up with the kept ones.
	const keptFrames = $derived(
		replacing && targetDirs.length !== availableDirs.length ? savedMove?.cells : undefined
	);
	const fitsKept = (option: MoveAnimationModel) =>
		keptFrames === undefined || moveFrameCounts(option, canvas).includes(keptFrames);
	const fitsSource = (option: MoveAnimationModel) =>
		option !== 'skeleton-v3' || !startFrom || (!describing && isAuthoredAction(action));
	const model = $derived.by(() => {
		if (modelChoice && fitsKept(modelChoice)) return modelChoice;
		if (!replacing) return preferences?.model ?? creationDefaults.moves.model;
		const preferred =
			keptFrames ??
			(m && moveFrames(m, { action: describing ? undefined : action, frames: baseFrames }));
		const fitsPreferred = (option: MoveAnimationModel) =>
			preferred !== undefined && moveFrameCounts(option, canvas).includes(preferred);
		for (const dir of targetDirs) {
			const route = savedMove?.sources?.[dir]?.route;
			if (route && route !== 'import' && fitsSource(route) && fitsPreferred(route)) return route;
		}
		return fitsSource('skeleton-v3') && fitsPreferred('skeleton-v3')
			? 'skeleton-v3'
			: (moveModels.find((option) => fitsSource(option) && fitsPreferred(option)) ??
					redrawFallbackModel);
	});
	const usesSavedFrames = $derived(!replacing && describing && frameChoice === undefined);
	// Model-valid counts for this character's actual canvas; the same object prices and submits the move.
	function framesFor(option: MoveAnimationModel) {
		const counts = moveFrameCounts(option, canvas);
		const user =
			keptFrames === undefined
				? resolveMoveFramePreference(
						option,
						(usesSavedFrames ? savedCustomFrames : frameChoice) ?? 'auto',
						canvas
					)
				: undefined;
		return {
			counts,
			user,
			chosen: keptFrames !== undefined && counts.includes(keptFrames) ? keptFrames : user
		};
	}
	const modelFrames = $derived(framesFor(model));
	const frameCounts = $derived(modelFrames.counts);
	const userFrameCount = $derived(modelFrames.user);
	const frameFallback = $derived(
		usesSavedFrames && savedCustomFrames !== undefined && userFrameCount === undefined
	);
	const chosenFrameCount = $derived(modelFrames.chosen);
	const animationFor = (
		option: MoveAnimationModel,
		frameCount = framesFor(option).chosen
	): MoveAnimationOptions => ({
		model: option,
		loop: looping,
		...(frameCount === undefined ? {} : { frameCount }),
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
										...(option !== 'skeleton-v3' && value.end !== undefined
											? { end: value.end ? compact(value.end) : null }
											: {})
									}
								]
							];
						})
					)
				}
			: {})
	});
	const animationOptions = $derived(animationFor(model, chosenFrameCount));
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
	let managedMotion = $state<{
		id: string;
		key: string;
		source?: MoveSpec['motionSource'];
		error?: string;
	}>();
	let motionProbe = $state(0);
	const managedMotionId = $derived(
		(describing || !isAuthoredAction(action)) &&
			!startFrom &&
			!draft?.skeletonRetry &&
			!targetDirs.some((direction) => frameReferences[direction]?.start)
			? rec?.character?.id
			: undefined
	);
	const managedFor = (option: MoveAnimationModel) =>
		option === 'skeleton-v3' ? managedMotionId : undefined;
	const managedId = $derived(managedFor(model));
	// The open Model list prices Skeleton V3 too, which needs the same free motion check.
	let pricingModels = $state(false);
	$effect(() => {
		const id = managedId ?? (pricingModels ? managedFor('skeleton-v3') : undefined);
		const key = app.key;
		void motionProbe;
		if (!id || !key || app.keyRejected) return;
		const controller = new AbortController();
		managedMotion = undefined;
		void resolveMoveMotionSource(key, id, controller.signal).then(
			(source) => {
				if (!controller.signal.aborted) managedMotion = { id, key, source };
			},
			(error: unknown) => {
				if (!controller.signal.aborted) managedMotion = { id, key, error: displayError(error) };
			}
		);
		return () => controller.abort();
	});
	const accessFor = (managed: string | undefined) =>
		managedMotion?.id === managed && managedMotion?.key === app.key ? managedMotion : undefined;
	const motionAccess = $derived(accessFor(managedId));
	const advancedNote = $derived(
		[
			t(MODEL_TEXT[model]),
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
	const motionFor = (option: MoveAnimationModel, animation = animationFor(option)) => {
		const managed = managedFor(option);
		return {
			id,
			motionSource:
				managed && app.key && !app.keyRejected
					? accessFor(managed)?.source
					: ('standalone' as const),
			action: describing ? undefined : action,
			text: text.trim(),
			frames: baseFrames,
			replace: replacing,
			animation,
			startFrom
		};
	};
	const motion = $derived(motionFor(model, animationOptions));
	const regeneration = $derived(draftRegeneration?.id === id ? draftRegeneration : undefined);
	const skeletonRetry = draft?.skeletonRetry;
	function motionIssueFor(option: MoveAnimationModel, motion: ReturnType<typeof motionFor>) {
		if (action && replaceSelected !== have.has(action)) return t('moveSheet.changedDuringEdit');
		if (Object.hasOwn(store.moveReviews, id) && !regeneration)
			return t('moveSheet.checkpoint.ready', { move: nice(id) });
		if (
			describing &&
			!templatePicked &&
			!replacing &&
			id &&
			suggestions.some((entry) => entry.action === id)
		)
			return t('moveSheet.duplicateOption', { move: nice(id) });
		if (!m || !id) return '';
		if (
			(!replacing && have.has(id)) ||
			(!have.has(id) &&
				([...stateIds].some((stateId) => sameClipName(stateId, id)) ||
					stateAttempts(rec).some((attempt) => sameClipName(attempt.id, id))))
		)
			return t('moveSheet.duplicateOption', { move: nice(id) });
		if (explicitFrame && !startFrom) return t('moveSheet.startFrom.unavailable');
		if (
			skeletonRetry &&
			(!regeneration ||
				option !== 'skeleton-v3' ||
				motion.action !== skeletonRetry.review.action ||
				motion.text !==
					(skeletonRetry.review.text ??
						moveTemplatePrompt(
							skeletonRetry.review.action ?? '',
							!!skeletonRetry.review.animation?.loop
						)) ||
				stableStringify(targetDirs) !== stableStringify(skeletonRetry.review.approvedDirs) ||
				stableStringify(startFrom) !== stableStringify(skeletonRetry.review.startFrom))
		)
			return t('moveSheet.checkpoint.changed');
		return (
			bodyMoveIssue(m, motion) ||
			(replacing && targetDirs.length ? partialMoveFrameIssue(m, motion, targetDirs.length) : '')
		);
	}
	const motionIssue = $derived(motionIssueFor(model, motion));
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
	// Null while the form cannot price a move; undefined while the managed motion check is still running.
	function estimateFor(option: MoveAnimationModel, motion = motionFor(option)) {
		if (
			!m ||
			!id ||
			!targetDirs.length ||
			reservedMove(id, replacing) ||
			pendingIds.includes(id) ||
			motionIssueFor(option, motion)
		)
			return null;
		if (managedFor(option) && app.key && !app.keyRejected && !motion.motionSource) return undefined;
		return moveEstimate(m, { ...motion, items: [], dirs: targetDirs });
	}
	const formEstimate = $derived(estimateFor(model, motion) ?? null);
	function modelCost(option: MoveAnimationModel) {
		// Like Generate, a managed character's Skeleton V3 price waits for a connection to check its motion.
		if (managedFor(option) && (!app.key || app.keyRejected)) return '';
		const estimate = estimateFor(option);
		if (estimate === undefined)
			return t(
				accessFor(managedFor(option))?.error ? 'common.unavailable' : 'stateGeneration.quoting'
			);
		return estimate ? t('moves.estimate', { gens: formatNumber(Math.ceil(estimate.gens)) }) : '';
	}
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
					!(
						[
							'itemRoute.errors.invalidItemGridSheet',
							'itemRoute.errors.invalidItemGridLayout',
							'itemRoute.errors.savedFramesUnavailable'
						] as const
					).some((key) => key === errorKey(moving.error)) &&
					$queue.jobs.some(
						(job) =>
							job.activityScope === moving.spec?.activityScope &&
							job.endpoint === (moving.spec?.redrawItem ? '/edit-images-v2' : '/inpaint-v3') &&
							job.state === 'done'
					)
				: !moving.spec.itemReview &&
					(errorKey(moving.error) === 'itemRoute.errors.itemMoveSaveConflict' ||
						errorKey(moving.error) === 'itemRoute.errors.itemMoveSaveConflictAlso'))
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
	const nice = (s: string) =>
		displayMove(s, [...(m?.rig.animations ?? []), ...options, ...stateIds]);
	const jobName = (spec: MoveSpec) => displayMoveJob(nice(spec.id), spec, m?.items);
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
	// The same stop by its code and values, never by comparing displayed text.
	const errorInReview = $derived(
		!!moving.error &&
			!!paid?.views.some((view) =>
				view.notes.some((note) => sameMessage(note, errorTranslation(moving.error)))
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

	// A new seed while a reviewed request is still at PixelLab would buy that view again before its result is known.
	const paidRunning = $derived(!!paid?.views.some((view) => view.state === 'running'));
	/** A reviewed way on keeps the move's seed, so completed requests are reused; only a paid one needs the key. Make room
	 *  adjusts the frame first (free; this stopped move waits for it) and then continues the same move. */
	function choosePaid(option: MovePaidOption) {
		const projectId = moving.projectId,
			spec = $state.snapshot(option.spec),
			change = option.change && { ...option.change },
			reviewed = option.reviewed && $state.snapshot(option.reviewed);
		const go = () => {
			ui.sheet = 'move';
			void (async () => {
				if (change) {
					try {
						await adjustCharacter(projectId, change, {
							stoppedMove: true,
							quiet: true,
							expect: reviewed
						});
					} catch (error) {
						// Changed since this review (another tab): the planned change and its price no longer apply.
						recoveryError =
							error instanceof LocalizedError &&
							error.translation.key === 'adjustFrame.errors.changed'
								? message('moveSheet.checkpoint.changed')
								: errorMessage(error);
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
	let enlargeError = $state<unknown>();
	async function room() {
		enlarging = true;
		enlargeError = undefined;
		try {
			await makeRoomFor(doc.id);
		} catch (error) {
			enlargeError = error;
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

	function rememberMoveForm(projectId: string) {
		formDrafts.move = {
			projectId,
			advancedOpen,
			savedCustomFrames,
			frameChoice,
			regeneration,
			skeletonRetry,
			action,
			replace: replaceSelected,
			text,
			dirs: [...selectedDirs],
			poseStyle: 'visible-side-v1',
			source: sourceSelection,
			frameReferences: $state.snapshot(frameReferences),
			loop: loopChoice,
			animation: { model }
		};
	}

	function go() {
		if (fitBusy) return;
		const projectId = doc.id;
		if (skeletonReview && moving.spec) {
			const offer = skeletonReview;
			if (
				!customStartAcknowledged &&
				Object.keys(offer.review.animation?.references ?? {}).length
			) {
				pickStart(go, 'skeleton-v3');
				return;
			}
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
					void confirm().catch((error: unknown) =>
						toast(errorMessage(error), { tone: 'warning', error })
					),
				offer.tier
			);
			return;
		}
		if (!formEstimate || addAccess.error) return;
		if (
			model === 'skeleton-v3' &&
			!customStartAcknowledged &&
			targetDirs.some((direction) => frameReferences[direction]?.start)
		) {
			pickStart(go);
			return;
		}
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
		rememberMoveForm(projectId);
		const needsManagedQuote = !!managedId;
		if (needsManagedQuote && (!app.key || app.keyRejected)) {
			withKey(() => {
				if (doc.id !== projectId || formDrafts.move?.projectId !== projectId) return;
				formDrafts.move.reopen = true;
				ui.sheet = 'move';
			});
			return;
		}
		const estimate = formEstimate;
		const minimumTier = addTier;
		const approvedDirs = [...targetDirs];
		const quotedKey = app.key;
		const confirm = async () => {
			if (needsManagedQuote && (app.key !== quotedKey || !spec.motionSource)) {
				toast(message('genCard.estimateFailed'), { tone: 'warning' });
				return;
			}
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
					(spec.startFrom && !moveSourceMatches(latest.manifest, spec.startFrom, approvedDirs)) ||
					(skeletonRetry &&
						stableStringify(
							skeletonMoveReview(latest, candidate.spec, undefined, [], candidate)
						) !== stableStringify(skeletonRetry)) ||
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
				void confirm().catch((error: unknown) =>
					toast(errorMessage(error), { tone: 'warning', error })
				),
			minimumTier
		);
	}
	function chooseAction(next: string) {
		templatePicked = !!next;
		const replace = have.has(next);
		const nextText = replace
			? m?.rig.animations.find((clip) => clip.id === next)?.sources
			: undefined;
		const savedPrompt =
			nextText &&
			Object.values(nextText)
				.map((source) => source?.motion?.match(/^(?:v3|pixminimax):(.+)$/s)?.[1])
				.find((prompt) => prompt && prompt !== next);
		const clip = m?.rig.animations.find((entry) => entry.id === next);
		const prompt = savedPrompt || moveTemplatePrompt(next, clip?.moveLoop ?? clip?.loop);
		if (action === next && replaceSelected === replace) {
			// The same move keeps its Loop choice, so its text follows it.
			text = savedPrompt || moveTemplatePrompt(next, looping);
			return;
		}
		if (replace || replaceSelected) frameChoice = undefined;
		action = next;
		replaceSelected = replace;
		text = prompt;
		loopChoice = undefined;
		frameReferences = {};
		customStartAcknowledged = false;
		referenceDirection = undefined;
		selectedDirs = redrawDirs(next);
	}
	// A redraw starts on the views that failed their checks, or every view when none did.
	function redrawDirs(clip: string) {
		const clips = (rec?.rigQa as { clips?: Record<string, { fails?: unknown[] }> } | undefined)
			?.clips;
		const flagged = availableDirs.filter((d) => clips?.[`${clip}/${d}`]?.fails?.length);
		return flagged.length ? flagged : [...availableDirs];
	}
	// Redraw… on a saved move opens this sheet on that move.
	if (redrawTarget) {
		ui.redrawMove = '';
		ui.moveFormOpen = true;
		if (untrack(() => have.has(redrawTarget))) chooseAction(redrawTarget);
	}
	// The character's quality checks load after the sheet opens; pick the failed views once they arrive.
	let redrawChecks = !!redrawTarget;
	$effect(() => {
		if (!redrawChecks || !rec) return;
		redrawChecks = false;
		if (replacing) selectedDirs = untrack(() => redrawDirs(action));
	});
	// Picking the applied template again lets the text stand as a custom move, keeping what was typed. The template the
	// sheet opened on was never picked, so pressing it just picks it.
	function pickSuggestion(suggestion: PromptSuggestion) {
		const template = suggestion.action;
		if (!template || action !== template || !templatePicked) {
			chooseAction(template ?? '');
			// An unedited template keeps the text chooseAction gave it, which follows the move's loop choice.
			if (!template || suggestion.prompt !== moveTemplatePrompt(template)) text = suggestion.prompt;
			return;
		}
		const kept = text;
		chooseAction('');
		text = kept;
	}
	// The template's text as the user customized it in Settings.
	function templateText(template: string) {
		return (
			suggestions.find((entry) => entry.action === template)?.prompt ?? moveTemplatePrompt(template)
		);
	}
	function inputMotion(value: string) {
		if (!templatePicked && !replacing && action) chooseAction('');
		text = value;
		textTyped = true;
	}
	function chooseModel(next: MoveAnimationModel) {
		modelChoice = next;
		if (typeof frameChoice === 'number' && keptFrames === undefined)
			frameChoice = defaultMoveFrameCount(next, canvas, frameChoice);
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
	async function pickSavedFrame(
		direction: DirectionName,
		kind: 'start' | 'end',
		image: Img,
		name: string
	) {
		const project = store.project;
		const box = opaqueBox(image);
		if (!box) return;
		const write = async () => {
			const base64 = await b64(image);
			if (store.project !== project || frameDirection !== direction) return;
			changeFrame(direction, kind, {
				base64,
				name,
				width: image.w,
				height: image.h,
				previewBox: `${box.x0} ${box.y0} ${box.x1 - box.x0 + 1} ${box.y1 - box.y0 + 1}`
			});
		};
		const accept = () =>
			void write().catch((error: unknown) =>
				toast(errorMessage(error), { tone: 'warning', error })
			);
		if (kind === 'start') pickStart(accept);
		else accept();
	}
	function copyFrame(direction: DirectionName, kind: 'start' | 'end') {
		const other = kind === 'start' ? frameReference?.end : frameReference?.start;
		if (other) {
			const accept = () => changeFrame(direction, kind, other);
			if (kind === 'start') pickStart(accept);
			else accept();
		} else if (kind === 'end' && standingImage) {
			void pickSavedFrame(direction, kind, standingImage, t('moveSheet.sameAsStart'));
		}
	}
	// Enhance reads the frames this move would start (and, when the model takes one, end) on.
	const enhanceSpec = $derived.by((): EnhanceSpec | null => {
		const first = frameReference?.start?.base64 ?? standingImage;
		if (!frameDirection || !first) return null;
		return {
			kind: 'motion',
			first,
			last:
				model === 'skeleton-v3'
					? undefined
					: moveReferenceEnd(
							frameReference?.end === undefined
								? undefined
								: { end: frameReference.end?.base64 ?? null },
							looping,
							first
						),
			engine: model === 'skeleton-v3' ? 'pixminimax' : model,
			frameCount: model === 'skeleton-v3' && m ? moveMotionFrames(m, motion) : shownFrames
		};
	});
	const enhanceScope = `move-enhance:${doc.id}:${crypto.randomUUID()}`;
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
		const applyLoop = () => {
			if (text === moveTemplatePrompt(action, looping)) text = moveTemplatePrompt(action, enabled);
			loopChoice = enabled;
		};
		if (model === 'skeleton-v3') {
			applyLoop();
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
			applyLoop();
		};
		const changed = await Promise.all(
			directions.map(async (direction) => {
				const frames = draftFrames[direction];
				if (!frames?.end || frames.end.base64 === frames.start?.base64) return false;
				try {
					const end = await decodePng(base64ToBytes(frames.end.base64));
					const hash = sourceStart(direction);
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
	function pickStart(accept: () => void, forModel = model) {
		if (forModel !== 'skeleton-v3' || customStartAcknowledged) {
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
	function leaveFailedMove(close: boolean) {
		void dismissMove().catch((error) =>
			toast(message('state.couldNotSaveReason', { reason: errorMessage(error) }), {
				error,
				tone: 'danger'
			})
		);
		if (close && !moving.spec) ui.sheet = null;
	}
</script>

{#snippet framePicker(
	direction: DirectionName,
	kind: 'start' | 'end',
	device: () => void,
	close: () => void
)}
	<label class="label">
		{t('moveSheet.fromCharacter')}
		<select
			class="bu-input input"
			value=""
			onchange={(event) => {
				const [clip, cell] = event.currentTarget.value.split('/');
				if (!clip) return;
				const image = sourceThumbnail(clip, Number(cell), direction);
				if (!image) return;
				close();
				void pickSavedFrame(direction, kind, image, nice(clip));
			}}
		>
			<option value="">{t('moveSheet.fromCharacter')}</option>
			{#each sourceClips as { key, clip } (key)}
				<optgroup label={nice(key)}>
					{#each [...new Set(clip.frames.map((frame) => frame.cell))] as cell (cell)}
						<option value={`${key}/${cell}`}>{nice(key)} · #{cell + 1}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</label>
	<button class="bu-action" data-variant="quiet" type="button" onclick={device}
		>{t('moveSheet.fromDevice')}</button
	>
	{#if kind === 'end' ? frameReference?.start || standingImage : model !== 'skeleton-v3' && frameReference?.end}
		<button
			class="bu-action"
			data-variant="quiet"
			type="button"
			onclick={() => {
				close();
				copyFrame(direction, kind);
			}}
		>
			{t(kind === 'end' ? 'moveSheet.sameAsStart' : 'moveSheet.sameAsEnd')}
		</button>
	{/if}
{/snippet}

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
				: repairReview.kept
					? moving.spec?.redrawItem
						? t('moveSheet.review.useFinishedRedraws')
						: t('moveSheet.review.useFinishedRepairs')
					: moving.spec?.redrawItem
						? t('moveSheet.review.useRedrawn')
						: t('moveSheet.review.useRepaired')}</button
		>
	{:else if progress && moving.error}
		<div class="recovery-actions">
			<button class="bu-action btn plain" data-variant="quiet" onclick={() => leaveFailedMove(true)}
				>{t('common.discard')}</button
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
					><button
						class="bu-action btn"
						class:primary={!hasFrameRecovery}
						data-variant={hasFrameRecovery ? 'outline' : 'primary'}
						disabled={!!retryAccess.error || tierBlocked(retryTier) || paidRunning}
						aria-describedby={tierBlocked(retryTier) ? 'move-retry-tier' : undefined}
						onclick={() =>
							moving.spec &&
							withKey(() => {
								void startMove(moving.projectId, {
									...$state.snapshot(moving.spec!),
									reuseItemFrames: undefined,
									measurementRecovery: undefined,
									bodyPaletteRepair: undefined,
									attempt: undefined,
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
		<span class="foot-note" id="sheet-exit-note">{t('common.keepsRunning')}</span>
		<button class="bu-action btn" data-variant="outline" onclick={() => (ui.moveFormOpen = true)}
			>{t('moveSheet.queueAnother')}</button
		>
	{:else if ok}
		{@const review = skeletonReview?.review}
		{@const requiredTier = skeletonReview?.tier ?? addTier}
		{@const replace = review ? review.replace : replacing}
		{@const move = review?.id ?? id}
		{@const needsConnection = !review && managedId && (!app.key || app.keyRejected)}
		{#if est && !needsConnection}
			<span class="foot-note move-cost-note">
				<span>
					{t('moveSheet.checkpoint.initialEstimate', { minutes: formatNumber(est.minutes) })}
				</span>
				<span>{t('moveSheet.costNotice')}</span>
			</span>
		{/if}
		<span class="api-action move-action">
			<button
				class="bu-action btn primary lg"
				data-variant="primary"
				disabled={fitBusy ||
					!est ||
					startLoading ||
					endLoading ||
					(!review && !!addAccess.error) ||
					(!!settingUp.spec && !settingUp.done) ||
					(!needsConnection && tierBlocked(requiredTier))}
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
						// Names the move once one is chosen or under review; a custom prompt is just "move".
						{ move: review || replace || action ? nice(move) : t('moveSheet.submit.move') }
					)}
					{#if needsConnection}<span class="cost">{t('toolbar.connectPixelLab2')}</span>
					{:else if est}<span class="cost">
							{t('moves.estimate', {
								gens: formatNumber(Math.ceil(est.gens))
							})}
						</span>{/if}</span
				></button
			></span
		>
	{/if}
{/snippet}

{#snippet advancedFields()}
	<div class="advanced-field">
		<div class="advanced-label">
			<label for={`${advancedId}-model`}>{t('moveSheet.motionModel')}</label>
			<Help iconOnly title={t('moveSheet.motionModel')} text={t('moveSheet.motionModelHelp')} />
		</div>
		<ModelSelect
			id={`${advancedId}-model`}
			value={model}
			options={moveModels.map((option) => ({
				value: option,
				label: t(MODEL_TEXT[option]),
				disabled: option !== model && !fitsKept(option)
			}))}
			cost={modelCost}
			onopen={() => (pricingModels = true)}
			onpick={chooseModel}
		/>
	</div>
	{#if frameDirection && m}
		{@const direction = frameDirection}
		{@const size = { width: m.rig.cell.w, height: m.rig.cell.h }}
		{@const startName = startFrom
			? startFrom.replacement
				? t('moveSheet.startFrom.savedSource')
				: nice(startFrom.clip)
			: t('moveSheet.standingFrame')}
		{@const autoEnd = frameReference?.end === undefined && automaticMoveEnd(looping)}
		<div class="reference-heading">
			<div class="advanced-label">
				<span id={`${advancedId}-reference-title`}>{t('moveSheet.referenceDirection')}</span>
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
					{@const edited = !!(frameReferences[option]?.start || frameReferences[option]?.end)}
					<button
						type="button"
						id={`${advancedId}-frame-${option}`}
						class="bu-action"
						data-variant="tab"
						role="tab"
						aria-selected={direction === option}
						aria-controls={`${advancedId}-frame-panel`}
						aria-disabled={startLoading || endLoading}
						aria-label={edited ? t('moveSheet.referenceEdited', { direction: name }) : name}
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
							<span>{showFullFrameDirections ? name : displayDirectionShort(option)}</span>
						</span>
						<span class="frame-tab-measure" aria-hidden="true">
							<span class="frame-tab-content" bind:offsetWidth={frameLabelWidths[option]}>
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
							label={startName}
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
						caption={startName}
						thumbnail={standing}
						beforePick={pickStart}
						picker={startPicker}
						bind:loading={startLoading}
						bind:value={
							() => frameReference?.start, (value) => changeFrame(direction, 'start', value)
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
						picker={endPicker}
						disabled={model === 'skeleton-v3'}
						bind:loading={endLoading}
						removeLabel={t('moveSheet.removeEndFrame')}
						bind:value={
							() => (model === 'skeleton-v3' ? undefined : (frameReference?.end ?? undefined)),
							(value) => changeFrame(direction, 'end', value)
						}
						onremove={() => changeFrame(direction, 'end', null)}
					/>
					{#snippet startPicker(device: () => void, close: () => void)}
						{@render framePicker(direction, 'start', device, close)}
					{/snippet}
					{#snippet endPicker(device: () => void, close: () => void)}
						{@render framePicker(direction, 'end', device, close)}
					{/snippet}
				</div>
			{/key}
			<small class="faint">{t('moveSheet.referenceSize', size)}</small>
		</div>
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
					? t('moveSheet.redraw', { move: nice(progress ? (moving.spec?.id ?? action) : action) })
					: t('moves.add')}
	back={skeletonReview
		? () => (reviewingSkeletonFor = null)
		: mine && ui.moveFormOpen
			? () => (ui.moveFormOpen = false)
			: undefined}
	onclose={() => (ui.sheet = null)}
	exitNote={progress && !moving.done && !moving.error && !repairReview
		? 'sheet-exit-note'
		: undefined}
	dirty={ok && !progress && !skeletonReview && !repairReview && textTyped && !!text.trim()}
	footer={isDemo() || (!ok && !progress) ? undefined : foot}
>
	{#snippet developer()}
		{@const review = skeletonReview?.review}
		<ApiPeek
			targets={isDemo()
				? []
				: progress
					? [
							{
								scope: 'move-progress',
								label: t('moveSheet.progressLabel'),
								plan: moving.spec && !recoveryAccess.error ? movePlan(rec, moving.spec) : [],
								activityScope: moving.spec?.activityScope
							},
							...(moving.error && !moving.done
								? [{ scope: 'move-retry', label: t('moveSheet.retryLabel'), plan: retryPlan }]
								: [])
						]
					: ok && est
						? [
								{
									scope: 'move-add',
									label: t('moveSheet.addLabel'),
									plan: movePlan(
										rec,
										review
											? { ...review, seed: undefined }
											: {
													...motion,
													items: [],
													poseStyle: 'visible-side-v1',
													...(replacing ? { dirs: [...targetDirs] } : {})
												}
									)
								}
							]
						: []}
		/>
	{/snippet}

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
			{#if repairReview.kept && !moving.repairApplied}<p class="notice warn small">
					{displayNestedMessage(
						message('moveSheet.review.stopped', {
							frames: repairReview.kept.map((index) => formatNumber(index + 1))
						})
					)}
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
			{#if moving.error}<ProblemNotice error={moving.error} />{/if}
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
			{#if review.approvedDirs?.some((dir) => moving.spec?.animation?.references?.[dir]?.end)}
				<p class="small">{t('moveSheet.endFrame')}: {t('moveSheet.endUnavailable')}</p>
			{/if}
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
				{jobName(moving.spec!)}{moving.spec?.dirs
					? ` · ${moving.spec.dirs.map(directionLabel).join(', ')}`
					: ''}
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
			{#if moving.error && !errorInReview}<ProblemNotice error={moving.error} />{/if}
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
						moves: ownQueued.map((q) => jobName(q.spec)).join(', ')
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
			{#if recoveryError}<ProblemNotice error={recoveryError} />{/if}
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
		<div class="form move-form" class:redraw-form={replacing} class:split={showAdvanced}>
			<div class="move-main">
				{#if frameFallback}
					<p class="notice warn small" role="status">
						{t('creationSettings.fallback', {
							setting: t('moveSheet.frames'),
							value: t('creationSettings.autoFrames', { count: defaultFrames })
						})}
					</p>
				{/if}
				<div class="move-start">
					<PlaybackPicker
						clips={startClips}
						moveRefs={m?.rig.animations ?? []}
						selected={startFrom?.replacement ? '' : (sourceId ?? DEFAULT_MOVE)}
						field={t('moveSheet.startFrom.label')}
						valueLabel={startFrom?.replacement ? t('moveSheet.startFrom.savedSource') : undefined}
						disabled={fitBusy}
						thumbnail={(key) =>
							store.project &&
							(bodyClipThumbnail(store.project, key, ui.dir) ??
								(key === DEFAULT_MOVE ? restArt(ui.dir) : null))}
						onselect={selectSource}
					/>
					{#if !startFrom?.replacement}
						<SourcePreview
							previews={startPreviews}
							source={nice(sourceId ?? DEFAULT_MOVE)}
							frame={Math.max(0, sourceFrames.indexOf(startCell ?? -1))}
							frames={sourceFrames.length}
							disabled={fitBusy}
							onstep={(delta) => {
								const at = Math.max(0, sourceFrames.indexOf(startCell ?? -1));
								sourceCell =
									sourceFrames[Math.max(0, Math.min(sourceFrames.length - 1, at + delta))];
							}}
						/>
					{/if}
					{#if offersFit}
						<div class="fit-panel" aria-busy={fitBusy}>
							{#if fitReview}
								<p class="small" role="status">{t('stateJointFit.review')}</p>
								<div class="fit-views">
									{#each fitReview.views as view (view.direction)}
										{@const label = directionLabel(view.direction)}
										<div>
											<div class="fit-overlay">
												<Sprite
													img={store.project?.images.get(view.hash) ?? null}
													k={2}
													limit={112}
													{label}
												/>
												<svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
													{#each view.keypoints as point (point.label)}
														<circle
															cx={point.x * 100}
															cy={point.y * 100}
															r="1.7"
															fill="currentColor"
														/>
													{/each}
												</svg>
											</div>
											<div class="small">{label}</div>
											{#each [...view.qa.fails, ...(view.qa.warnings ?? [])] as finding, index (index)}
												<p class="small">{displayMessage(plainReasonMessage(finding))}</p>
											{/each}
										</div>
									{/each}
								</div>
								<button
									class="bu-action"
									data-variant="primary"
									disabled={fitBusy || fitReview.blocked}
									onclick={saveFit}
								>
									{t('stateJointFit.save')}
								</button>
								<button class="bu-action" data-variant="outline" onclick={() => (fitReview = null)}>
									{t('moveSheet.skeleton.back')}
								</button>
							{:else if fitQuote}
								<button class="bu-action" data-variant="primary" onclick={measureFit}>
									{t('stateJointFit.measure')}
									<span class="cost"
										>{fitQuote.generations
											? t('moves.estimate', { gens: formatNumber(fitQuote.generations) })
											: t('stateCapture.noCredits')}</span
									>
								</button>
							{:else}
								<button
									class="bu-action"
									data-variant="outline"
									disabled={fitBusy}
									onclick={checkFitCost}
								>
									{t(
										fitBusy
											? 'activity.waitingForPixelLab'
											: app.key && !app.keyRejected
												? 'stateJointFit.quote'
												: 'connectSheet.titleConnectPixelLab'
									)}
								</button>
							{/if}
							{#if fitError}<p class="notice small" role="alert">
									{displayNestedMessage(fitError)}
								</p>{/if}
						</div>
					{/if}
				</div>
				<div class="move-edit">
					<div class="field">
						<label class="label" for="move-description"
							>{replacing
								? t('moveSheet.describeReplacement')
								: t('moveSheet.describeMotion')}</label
						>
						<PromptField
							id="move-description"
							value={text}
							onvalue={inputMotion}
							onreplace={(motion) => {
								// Enhancing the template the sheet opened on keeps it, like picking it would.
								if (action) templatePicked = true;
								text = motion;
							}}
							spec={enhanceSpec}
							activity={{ scope: enhanceScope, label: 'Enhance animation prompt' }}
							maxOutput={900}
							placeholder={t('moveSheet.describePlaceholder')}
							describedby="move-description-hint"
							maxlength={900}
						/>
						<!-- A redraw keeps its saved move, so it offers no templates. -->
						{#if !replacing}
							<PromptSuggestions
								label={t('moveSheet.templates')}
								value={text}
								active={action}
								{suggestions}
								onpick={pickSuggestion}
							/>
						{/if}
						<p class="faint small" id="move-description-hint">
							{t('moveSheet.motionOnly')}
						</p>
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
					<label class="bu-check loop-setting">
						<span class="loop-copy">
							<span>{t('moveSheet.loop')}</span>
							<span id={`${advancedId}-loop-hint`} class="faint small"
								>{t('moveSheet.loopHint')}</span
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
										onclick={() => (frameChoice = null)}
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
						{#if sideBySide}
							<button
								type="button"
								class="bu-action advanced-toggle"
								data-variant="quiet"
								aria-expanded={advancedOpen}
								aria-controls="{advancedId}-advanced"
								onclick={() => void toggleAdvanced()}
								><ChevronRight size={14} />{t('common.advanced')}{#if advancedNote}<span
										class="faint advanced-note">{advancedNote}</span
									>{/if}</button
							>
						{:else}
							<details class="disclosure advanced" bind:open={advancedOpen}>
								<summary
									><ChevronRight size={14} />{t('common.advanced')}{#if advancedNote}<span
											class="faint advanced-note">{advancedNote}</span
										>{/if}</summary
								>
								<div>{@render advancedFields()}</div>
							</details>
						{/if}
					</div>
					{#if motionAccess?.error}
						<p class="notice warn small"><CircleAlert size={14} />{motionAccess.error}</p>
						<button
							class="bu-action"
							type="button"
							data-variant="quiet"
							onclick={() => motionProbe++}>{t('common.tryAgain')}</button
						>
					{/if}
					{#if reservedMove(id, replacing)}<p class="notice warn small">
							<CircleAlert size={14} />{displayError(reservedMove(id, replacing))}
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
								{#if enlargeError}<p class="notice bad small" role="alert">
										{displayError(enlargeError)}<ReportButton error={enlargeError} />
									</p>{/if}
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
			</div>
			{#if sideBySide}
				<!-- Closing only hides the column, so a frame still decoding there is not lost. -->
				<div class="move-advanced" id="{advancedId}-advanced" hidden={!showAdvanced}>
					{@render advancedFields()}
				</div>
			{/if}
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
	.move-main,
	.move-start,
	.move-edit,
	.move-advanced {
		display: grid;
		gap: 12px;
		align-content: start;
		min-inline-size: 0;
	}
	/* Open Advanced widens the sheet into a second column beside the move. */
	:global(dialog.sheet.center:has(.move-form.split)) {
		width: min(800px, calc(100vw - 32px));
	}
	.move-form.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		column-gap: 24px;
	}
	.move-advanced[hidden] {
		display: none;
	}
	.move-advanced {
		padding-inline-start: 24px;
		border-inline-start: 1px solid var(--bu-line);
	}
	.advanced-toggle {
		justify-self: start;
		min-block-size: 36px;
		gap: 6px;
	}
	.advanced-toggle[aria-expanded='true'] :global(svg) {
		rotate: 180deg;
	}
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
	.fit-panel {
		display: grid;
		gap: 8px;
	}
	.fit-views {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(112px, 100%), 1fr));
		gap: 12px;
	}
	.fit-overlay {
		display: inline-grid;
		position: relative;
	}
	.fit-overlay svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
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
