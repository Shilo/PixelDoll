// Studio state: UI (size class, theme, tabs, sheets, playback), the open project + outfit with undo/redo and autosave,
// item generations (drafts) and the create-character run. Pixel data lives in $state.raw (deep proxies over the manifest
// made recolor/compose take seconds, B5); manifest edits bump doc.rev.
import type { Snippet } from 'svelte';
import { playAudioCue } from './audio.svelte.ts';
import {
	errorMessage,
	errorText,
	errorTranslation,
	message,
	LocalizedError,
	type Message
} from '../lib/message.ts';
import { SvelteSet } from 'svelte/reactivity';
import { displayMessage } from '../lib/i18n.ts';
import type { WhisperKey, WhisperVars } from 'svelte-whisper';
import { PaidStepError, type PaidStep } from '../lib/pixellab/paid-results.ts';
import {
	applyDress,
	dressOf,
	archiveFixtureDress,
	mergeSlotEdits,
	openSource,
	openFixture,
	reconcileItemSlots,
	saveDress,
	saveSplit,
	type DressState,
	type Outfit
} from '../lib/dress/project.ts';
import { splitBase } from '../lib/dress/regions.ts';
import { retainSlotDirections } from '../lib/items/slots.ts';
import { canRelocateItem, relocateItem, relocateWornItem } from '../lib/items/relocate.ts';
import { keepThumbnails } from './experience/thumbnails.svelte.ts';
import { experience, setPanelOpen } from './experience/state.svelte.ts';
import {
	deriveMaterials,
	randomOutfit,
	missingFrames,
	randomVariants,
	recolor,
	storeVariants
} from '../lib/dress/dress.ts';
import {
	drawList,
	equipped,
	handHides,
	handSide,
	hiddenSlots,
	hidesOf,
	oppositeHands,
	settleHands,
	twoHanded
} from '../lib/compose/compose.ts';
import {
	deleteItem,
	deleteItems,
	listProjects,
	loadProject,
	pngBlobs,
	readStoredImage,
	type BeforeWrite,
	type DressedRecord,
	type StoredProject
} from '../lib/store/project.ts';
import * as db from '../lib/store/db.ts';
import {
	deleteForever as discardDeleted,
	deletedEntry,
	keysToPrune,
	listEntries,
	pruneKeys,
	readDeleted,
	readEntry,
	restoreCharacter,
	restoreMoveEntry,
	restoreParts,
	draftCallIds,
	quotaError,
	type RecentlyDeleted
} from '../lib/store/recently-deleted.ts';
import { incompatibleKind } from '../lib/store/incompatible.ts';
import { artworkRefs } from '../lib/store/workspace.ts';
import { sameClipName } from './clipName.ts';
import {
	CURRENT_OUTFIT_ID,
	defaultCharacterExportId,
	editIdentity,
	editMoveIdentity,
	editOutfitIdentity
} from '../lib/store/identity.ts';
import type {
	CellKey,
	DirectionName,
	Item,
	Manifest,
	Preset,
	Project,
	Slot,
	ZOverride
} from '../lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../lib/store/manifest.ts';
import type { ItemPaletteRepairPlan, Draft, ItemResult, RepairReview } from '../lib/items/run.ts';
import { loadDrafts } from '../lib/items/drafts.ts';
import { insertSlotInLadder } from '../lib/items/slots.ts';
import { app } from '../lib/app.svelte.ts';
import { localizedPlanRestriction, requestTier, tierDecision } from '../lib/pixellab/plans.ts';
import type { NewItemInput } from './itemRoute.ts';
import { localizedAutomaticRepairError, type Method } from '../lib/items/items.ts';
import type { Key } from '../lib/image/chroma.ts';
import type {
	BodyPaletteRepairPlan,
	CreateSpec,
	KeepBodyPlan,
	MeasurementRecoveryPlan,
	MoveSpec,
	Progress
} from './create.ts';
import {
	characterFacts,
	displayMoveJob,
	missingMoves,
	wearClip,
	pixelSize,
	uniqueBy
} from './model.ts';
import { displayDirectionInSentence } from './displayDirection.ts';
import { displayMove } from './displayMove.ts';
import {
	addCustom,
	applySettings,
	BASE_KEY,
	busyReason,
	categories,
	changesAttachment,
	deleteCustom,
	type DraftRef,
	moveCategory,
	type NewSlot,
	setHidden,
	type SlotSettings,
	shownCategories,
	slotDef,
	slotLabel,
	slotLabelMessage,
	slotUse,
	slotUseMessages,
	type SlotUse
} from './slots.ts';
import { live, queue, type JobRec } from '../lib/pixellab/queue.ts';
import { itemJobs } from './itemJobs.ts';
import { mirroredMove, type ElsewhereMove } from './elsewhereMove.ts';
import { appearanceBatchScope, stateBatchScope } from '../lib/pixellab/activity.ts';
import { appearanceReviewHold } from './appearanceSource.ts';
import { stateAttempts } from './stateRecovery.ts';
import {
	activityStateMessage,
	isGenerationCancellation,
	GENERATION_PHASES,
	GENERATION_STOPPED,
	NO_USABLE_FRAMES
} from './generationStatus.ts';
import { copyPreferences, workspaceCopy, workspaceKeys as K } from '../lib/store/workspace-mode.ts';
import { deleteLocalWork } from '../lib/store/local-work.ts';
import type { SetupSpec } from './setup.ts';
import {
	forgetFits,
	listShared,
	type BundledSource,
	type SharedItem
} from '../lib/equipment/shared.ts';
import { acceptCopy, copyMoreFrames, freeFrames, itemKey } from '../lib/equipment/copy.ts';
import { demoItemsShown } from './wardrobeVisibility.svelte.ts';
import { lazy, LoadError } from '../lib/lazy.ts';
import { onceShown, type Problem } from '../lib/report/report.ts';
import type { FramesFile, PreparedFrames } from '../lib/frames/save.ts';
import { mountSeatOffset, validMountSeatOffset } from '../lib/rig/riderSeat.ts';
import type { Img } from '../lib/image/png.ts';
import { stableStringify } from '../lib/image/hash.ts';
import type { MoveImportPlan } from '../lib/rig/moveImport.ts';
import {
	DEFAULT_MOVE,
	DIRECTIONS,
	type MountSeatOffset,
	type MountSeatOffsets,
	type Sha256
} from '../lib/rig/rig.ts';
import {
	canvasLift,
	frameChangeText,
	frameFacts,
	makeRoom,
	reframeCharacter,
	type FrameChange
} from '../lib/rig/reframe.ts';
import { forgetRidingPose, syncRiderPose } from './experience/riderPose.ts';
import { forgetLiveChoices } from './experience/liveViews.ts';
import { clearDebugLog, recordDebug } from '../lib/debug/log.ts';

// Replacing this module must not leave old paid-flow closures driving beside newly resumed state.
// A full dev reload destroys those closures; the disconnected queue refuses further submissions.
let hmrReloading = import.meta.hot?.data.flowReloading === true;
// The paid pipelines load on first use, outside the startup bundle (lib/lazy.ts).
let createModule: Promise<typeof import('./create.ts')> | undefined;
const createFlow = () =>
	(createModule ??= lazy(() => import('./create.ts')).catch((error: unknown) => {
		createModule = undefined;
		throw error;
	}));
const itemFlow = async () => (await lazy(() => import('./itemRoute.ts'))).itemRoute;
const itemRun = () =>
	lazy(() =>
		import('../lib/items/run.ts').then(
			({
				acceptItemReview,
				applyRepairReview,
				evaluateItem,
				finishedPart,
				isClean,
				matchItemColors,
				repairAlreadyApplied,
				rerollFailed,
				restoreStandingViews
			}) => ({
				acceptItemReview,
				applyRepairReview,
				evaluateItem,
				finishedPart,
				isClean,
				matchItemColors,
				repairAlreadyApplied,
				rerollFailed,
				restoreStandingViews
			})
		)
	);
const setupFlow = () => lazy(() => import('./setup.ts'));
/** After startup: fetch the pipelines so a later action still works offline or after a deploy replaced their files.
 * A failure is logged by lazy() and shown again when the action runs. */
export const prefetchFlows = () =>
	Promise.allSettled([createFlow(), itemFlow(), itemRun(), setupFlow()]);
import.meta.hot?.dispose((data) => {
	hmrReloading = true;
	data.flowReloading = true;
	queue.disconnect();
	window.location.reload();
});

// ---------- small persistence helpers (every storage access can throw: private mode, blocked site data) ----------
const lsGet = (k: string) => {
	try {
		if (workspaceCopy) return copyPreferences.get(k) ?? null;
		return localStorage.getItem(k);
	} catch {
		return null;
	}
};
const lsSet = (k: string, v: string | null) => {
	try {
		if (workspaceCopy) {
			if (v == null) copyPreferences.delete(k);
			else copyPreferences.set(k, v);
			return true;
		}
		if (v == null) localStorage.removeItem(k);
		else localStorage.setItem(k, v);
		return true;
	} catch {
		return false;
	}
};
export const DEMO = 'fixture:s2';
const DEMO_NAME = 'Adventurer';

const pixelLabConnectOpened = 'pixeldoll.pixelLabConnectOpened';
let pixelLabConnectOpenedInTab = false;

export function claimPixelLabConnectOpen(): boolean {
	if (pixelLabConnectOpenedInTab) return false;
	pixelLabConnectOpenedInTab = true;
	if (lsGet(pixelLabConnectOpened) === '1') return false;
	lsSet(pixelLabConnectOpened, '1');
	return true;
}

// ---------- UI ----------
export type Size = 'expanded' | 'medium' | 'compact' | 'landscape';
export type SheetId =
	| null
	| 'inspect'
	| 'connect'
	| 'create'
	| 'newitem'
	| 'export'
	| 'activity'
	| 'item'
	| 'gen'
	| 'move'
	| 'moveReview'
	| 'itemGeneration'
	| 'stateCapture'
	| 'stateReview'
	| 'appearance'
	| 'rename'
	| 'directions'
	| 'importZip'
	| 'importPixelLab'
	| 'delete'
	| 'details'
	| 'setup'
	| 'settings'
	| 'workspaceReport'
	| 'slots'
	| 'frames'
	| 'adjustFrame'
	| 'cost';
const sizeNow = (): Size => {
	const w = innerWidth,
		h = innerHeight;
	if (h < 500 && w > h) return 'landscape';
	if (w < 600 || (w < 1024 && h > w)) return 'compact'; // B10: portrait tablets stack stage over wardrobe (T1 P1-3)
	if (w < 1024) return 'medium';
	return 'expanded';
};

let panel = $state<SheetId>(null);
export const createPresentation = $state({ id: '' });
/** A sheet opened over New character (from More, Connect, Activity...) steps Back to it; its X leaves both. The
 *  creator keeps its draft in formDrafts and the attempt it was presenting. */
let creatorReturn = $state<{ attempt: string } | null>(null);
export const canReturnToCreator = () => !!creatorReturn && panel !== 'create';
// Effect teardowns read state from before the change that removed them, so New character's own cleanup checks this
// plain copy instead.
let leftCreatorForSheet = false;
export const leavingCreatorForSheet = () => leftCreatorForSheet;
export function returnToCreator() {
	const attempt = creatorReturn?.attempt ?? '';
	ui.sheet = 'create';
	if (attempt && creates.some((run) => run.id === attempt)) createPresentation.id = attempt;
}
export const ui = $state({
	size: sizeNow(),
	dpr: devicePixelRatio || 1,
	theme: (lsGet(K.theme) === 'light' ? 'light' : 'dark') as 'light' | 'dark',
	welcome: !lsGet(K.welcomed),
	tab: 'wardrobe' as 'wardrobe' | 'colors' | 'outfits' | 'states' | 'moves', // phone
	colorsFocus: '', // item id whose Colors section the Colors tab scrolls to once (Recolor in item details)
	group: 'head', // a Wardrobe category: its slot key
	wardrobeOpenRevision: 0,
	selected: '', // item id, or "gen:<draft id>"
	moveReview: '',
	itemGeneration: '', // the saved move or State whose missing equipment the item picker offers
	stateCaptureMove: '',
	stateReview: '', // token of the State attempt the review sheet shows
	appearance: null as {
		target: import('./appearanceSource.ts').AppearanceTarget;
		choice: import('./appearanceSource.ts').AppearanceChoice;
		model: import('./stateGenerationPlan.ts').StateGenerationModel;
		prompt: string;
		reference?: import('../lib/image/reference.ts').PickedReference;
		back?: 'item' | 'setup';
	} | null,
	redrawMove: '',
	moveFormOpen: false,
	get sheet(): SheetId {
		return panel;
	},
	set sheet(next: SheetId) {
		if (
			(panel === 'create' || panel === 'moveReview' || panel === 'itemGeneration') &&
			next !== 'activity' &&
			afterTakeOver
		)
			cancelWaitingForTab();
		if (panel === 'move' && next !== 'move') ui.moveFormOpen = false;
		const id = createPresentation.id,
			remembered = !next ? creatorReturn?.attempt : '';
		if (panel === 'create' && next && next !== 'create') creatorReturn = { attempt: id };
		else if (!next || next === 'create') creatorReturn = null;
		leftCreatorForSheet = !!creatorReturn;
		createPresentation.id = '';
		// A finished attempt leaves with its screen, unless a sheet over New character can still step back to it.
		for (const gone of new Set([id, remembered]))
			if (gone && creatorReturn?.attempt !== gone) {
				const attempt = creates.find((run) => run.id === gone);
				if (attempt?.projectId) removeCreate(attempt);
			}
		panel = next;
	},
	renameTarget: null as ({ projectId: string } & RenameOf) | null,
	slotTarget: null as string | null,
	sheetBusy: false,
	deleting: '', // the character the Delete sheet is for
	directionProject: '',
	frameProject: '', // the character the Adjust frame sheet is for
	costProject: '', // the character the Cost estimate sheet opens on
	details: '', // the character the Details sheet is for
	settingsOverlay: false, // Settings opened over the current sheet without replacing it
	newItem: { group: 'head', slot: '', prompt: '', name: '' } as {
		reuseMethod?: boolean;
		group: string;
		slot: string;
		prompt: string;
		name: string;
		method?: Method;
	},
	anim: '',
	dir: 'south' as DirectionName,
	all: false,
	playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, // reduced motion: start paused, Play is one tap
	frame: 0,
	zoom: 0, // device px per sprite px; 0 = fit
	bg: 'checker' as 'checker' | 'solid',
	toast: '' as string | Message | Message[] | Snippet,
	toastTitle: '' as string | Message,
	toastPending: false,
	toastTone: 'info' as 'info' | 'success' | 'warning' | 'danger',
	toastSheet: null as SheetId,
	toastAction: null as (() => void | Promise<void>) | null,
	toastActionLabel: '' as string | Message,
	/** What the notice's Report action sends: set for danger and warning notices. */
	toastProblem: null as Problem | null,
	waitingForTab: false // a spending action waits for the other tab that runs the jobs
});
let afterConnect: { run: () => void; minimumTier: number } | null = null;
let afterTakeOver: (() => void) | null = null;
let waitingNotice: ReturnType<typeof setTimeout> | undefined;
/** How long a click waits for an idle tab to hand over the jobs before Activity explains the wait: a handoff takes well
 *  under a second, so most clicks simply continue. */
const HANDOFF_GRACE_MS = 1500;
let identityChannel: BroadcastChannel | undefined;

export function initUi() {
	const channel =
		!workspaceCopy && typeof BroadcastChannel !== 'undefined'
			? new BroadcastChannel('pixeldoll:identity')
			: undefined;
	identityChannel = channel;
	if (channel)
		channel.onmessage = ({ data }) => {
			if (data?.libraryRestored === true) {
				void refreshProjects();
				return;
			}
			// A deletion or restore here: re-read the lists another tab changed. The entry and the record were written together,
			// so this only has to show their new state.
			if (data?.libraryChanged === true) {
				void refreshProjects();
				void refreshRecentlyDeleted();
				// A restore or delete touched this character's record: re-read it quietly so a stale outfit or outfit list is
				// never saved over it. If it is gone, switch away instead of reporting that it could not be opened.
				if (typeof data.projectId === 'string' && data.projectId === doc.id)
					void db.get<StoredProject>('projects', data.projectId).then(
						async (record) => {
							if (record?.manifest) await openProject(data.projectId, { quiet: true });
							else if (doc.id === data.projectId) {
								await refreshProjects();
								await openProject(store.projects.find((p) => !p.demo && !p.dev)?.id ?? DEMO);
							}
						},
						(error: unknown) => {
							// An unreadable record is not a deleted one: stay on this character and say so.
							console.error('library change', error);
							toast(message('state.characterRereadFailed'), { tone: 'danger', error });
						}
					);
				return;
			}
			if (
				!data ||
				typeof data.projectId !== 'string' ||
				(data.itemId !== undefined && typeof data.itemId !== 'string') ||
				(data.moveId !== undefined && typeof data.moveId !== 'string')
			)
				return;
			const { projectId, itemId, moveId } = data;
			if (opening === projectId) openingIdentityRevision++;
			const request = openRequest;
			if (doc.id === projectId)
				void db
					.get<StoredProject>('projects', projectId)
					.then((record) => {
						if (record?.manifest)
							applySavedIdentity(projectId, { itemId, moveId }, request, record.manifest);
					})
					.catch((error: unknown) => console.error('refresh identity', error));
			void refreshProjects();
		};
	const on = () => {
		ui.size = sizeNow();
		ui.dpr = devicePixelRatio || 1;
	};
	// Backgrounded or closing: keep any unsaved outfit synchronously (an unload can abort IndexedDB), then flush the autosave
	// debounce. pagehide covers reload/close/navigation; hidden covers mobile, where pagehide may never fire. No beforeunload,
	// which would cost the back/forward cache.
	const hide = () => {
		if (document.visibilityState === 'hidden') {
			keepUnsaved();
			void flushSave();
		} else void refreshShared(); // characters may have changed in another tab meanwhile
	};
	const leave = () => {
		keepUnsaved();
		void flushSave();
	};
	// Actions started without awaiting them (Make item, Keep it, Reset, a review check) would otherwise drop a load failure.
	const unhandled = (e: PromiseRejectionEvent) => {
		if (e.reason instanceof LoadError) {
			e.preventDefault();
			toast(errorMessage(e.reason), { tone: 'danger', error: e.reason });
		} else unexpectedError(e.reason);
	};
	// Cross-origin scripts (extensions, embeds) and browser notices such as ResizeObserver loops carry no error object.
	const uncaught = (e: ErrorEvent) => {
		if (e.error && (!e.filename || new URL(e.filename, location.href).origin === location.origin))
			unexpectedError(e.error);
	};
	addEventListener('unhandledrejection', unhandled);
	addEventListener('error', uncaught);
	addEventListener('resize', on);
	addEventListener('pagehide', leave);
	document.addEventListener('visibilitychange', hide);
	applyTheme();
	return () => {
		channel?.close();
		if (identityChannel === channel) identityChannel = undefined;
		removeEventListener('unhandledrejection', unhandled);
		removeEventListener('error', uncaught);
		removeEventListener('resize', on);
		removeEventListener('pagehide', leave);
		document.removeEventListener('visibilitychange', hide);
	};
}
export function applyTheme() {
	document.documentElement.dataset.theme = ui.theme;
	document.documentElement.style.colorScheme = ui.theme;
}
export function setTheme(theme: typeof ui.theme) {
	ui.theme = theme;
	const saved = lsSet(K.theme, ui.theme);
	applyTheme();
	return saved;
}
export function toggleTheme() {
	setTheme(ui.theme === 'dark' ? 'light' : 'dark');
}
export function dismissWelcome() {
	ui.welcome = false;
	lsSet(K.welcomed, '1');
}
let toastT: ReturnType<typeof setTimeout> | undefined;
let toastRemaining = 0,
	toastStarted = 0;
let toastRevision = 0,
	toastActivating: number | null = null;
const toastPauses = new Set<'pointer' | 'focus' | 'hidden'>();
export interface ToastOptions {
	title?: string | Message;
	pending?: boolean;
	tone?: typeof ui.toastTone;
	duration?: number;
	action?: () => void | Promise<void>;
	/** Names the explicit button that runs `action`: without it, the whole notice stays the button. */
	actionLabel?: string | Message;
	/** The error behind a danger or warning notice: its report names the error and any PixelLab status and endpoint. */
	error?: unknown;
	/** Warnings get Report when they carry an error or explicitly opt in. Use false for expected guidance or if a
	 *  linked failure view already offers Report. 'uncaught' identifies errors that reached the global handlers. */
	report?: boolean | 'uncaught';
}
const firstMessage = (value: unknown): Message | undefined =>
	Array.isArray(value)
		? value.map(firstMessage).find(Boolean)
		: value && typeof value === 'object' && typeof (value as Message).key === 'string'
			? (value as Message)
			: undefined;
/** A toast's text for the debug log: the message key beside the shown, translated text. */
const toastText = (value: unknown): string =>
	value === undefined || value === ''
		? ''
		: typeof value === 'string'
			? value
			: Array.isArray(value)
				? value.map(toastText).join(' ')
				: firstMessage(value)
					? `[${(value as Message).key}] ${displayMessage(value as Message)}`
					: '[custom content]';
/** Something failed that no surface handled: a warning with a Report action, once per distinct error. It never
 *  replaces a notice the person may still act on (Undo, Try again, a pending step). */
export const unexpectedError = onceShown(
	(error) =>
		!(ui.toast && (ui.toastAction || ui.toastPending || typeof ui.toast === 'function')) &&
		toast(message('report.unexpected'), {
			tone: 'warning',
			duration: 10000,
			error,
			report: 'uncaught'
		})
);
function stopToastTimer() {
	clearTimeout(toastT);
	toastT = undefined;
}
export function dismissToast() {
	stopToastTimer();
	toastRevision++;
	toastRemaining = 0;
	toastPauses.clear();
	ui.toast = '';
	ui.toastTitle = '';
	ui.toastPending = false;
	ui.toastAction = null;
	ui.toastActionLabel = '';
	ui.toastProblem = null;
}
export async function activateToast() {
	if (!ui.toast || toastActivating === toastRevision) return;
	const revision = toastRevision;
	toastActivating = revision;
	stopToastTimer();
	try {
		await ui.toastAction?.();
	} finally {
		if (toastActivating === revision) toastActivating = null;
		// The action may have opened a different notification while it was running.
		if (toastRevision === revision) dismissToast();
	}
}
function armToast() {
	if (!toastRemaining || toastPauses.size || toastActivating === toastRevision) return;
	toastStarted = Date.now();
	toastT = setTimeout(dismissToast, toastRemaining);
}
export function pauseToast(reason: 'pointer' | 'focus' | 'hidden') {
	if (toastT) {
		stopToastTimer();
		toastRemaining = Math.max(1, toastRemaining - (Date.now() - toastStarted));
	}
	toastPauses.add(reason);
}
export function resumeToast(reason: 'pointer' | 'focus' | 'hidden') {
	toastPauses.delete(reason);
	if (!toastT) armToast();
}
/** A zero duration keeps the message until dismissed or replaced. Return false when an unresolved error takes priority. */
export function toast(
	s: string | Message | Message[] | Snippet,
	options: number | ToastOptions = 4000
) {
	const o: ToastOptions = typeof options === 'number' ? { duration: options } : options;
	if (o.tone === 'danger' || o.tone === 'warning')
		recordDebug(o.tone === 'danger' ? 'error' : 'warn', 'toast', [
			toastText(o.title),
			toastText(s),
			...(o.error === undefined ? [] : [o.error])
		]);
	if (ui.toast && ui.toastTone === 'danger' && o.tone !== 'danger') return false;
	stopToastTimer();
	toastRevision++;
	ui.toast = s;
	ui.toastTitle = o.title ?? '';
	ui.toastPending = o.pending ?? false;
	ui.toastTone = o.tone ?? 'info';
	ui.toastSheet = ui.sheet;
	ui.toastAction = o.action ?? null;
	ui.toastActionLabel = o.actionLabel ?? '';
	const reportable =
		o.tone === 'danger' ||
		(o.tone === 'warning' && (o.error != null || o.report === true || o.report === 'uncaught'));
	ui.toastProblem =
		reportable && o.report !== false
			? {
					message: firstMessage(s) ?? firstMessage(o.title),
					error: o.error,
					tone: o.tone === 'danger' ? 'error' : 'warning',
					uncaught: o.report === 'uncaught'
				}
			: null;
	toastRemaining = o.duration ?? (o.tone === 'danger' ? 0 : o.tone === 'warning' ? 8000 : 4000);
	armToast();
	return true;
}

/** Only the queue-leader tab drives generations. A spending action `waits` and runs once this tab takes over the jobs and
 *  has resumed the old leader's work: an idle leader tab hands them over at once, so the click just continues. Activity
 *  opens (above any open native modal) only when the other tab keeps them, to explain the wait; leaving it cancels. */
const follower = (waits?: () => void) => {
	if (queue.role !== 'follower') return false;
	clearTimeout(waitingNotice);
	afterTakeOver = waits ?? null;
	ui.waitingForTab = !!waits;
	queue.requestHandoff(!!waits);
	if (!waits) ui.sheet = 'activity';
	else
		waitingNotice = setTimeout(() => {
			if (afterTakeOver === waits) ui.sheet = 'activity';
		}, HANDOFF_GRACE_MS);
	return true;
};
/** Run the waiting click: only in the lead, after takeOver resumed the stored create, move and setup (so it queues behind
 *  them instead of overwriting them). */
function runWaiting() {
	if (!afterTakeOver || queue.role === 'follower' || !resumedHere) return;
	const run = afterTakeOver;
	cancelWaitingForTab();
	run();
}
export function cancelWaitingForTab() {
	clearTimeout(waitingNotice);
	afterTakeOver = null;
	ui.waitingForTab = false;
	queue.requestHandoff(false);
}

/** Run a spending action; without a key the Connect sheet opens first and the action runs once a key is set. In a tab
 *  that is not running the jobs, it waits for them (see follower). Wrap only the step that spends: a button that just
 *  opens a sheet which prices the work first never needs it, since that sheet's own action does. */
function allowsTier(minimumTier: number): boolean {
	const decision = tierDecision(app.balance, { required: minimumTier });
	if (decision.kind === 'required') {
		toast(message('activity.planWait.tier', { tier: decision.tier }), {
			tone: 'warning',
			report: false
		});
		return false;
	}
	return true;
}
export function withKey(fn: () => void, minimumTier = 0) {
	if (moveReviewPublishing) {
		toast(message('directionsSheet.waitForGeneration'), { tone: 'warning', report: false });
		return;
	}
	if (follower(() => withKey(fn, minimumTier))) return;
	if (app.key && !app.keyRejected && !allowsTier(minimumTier)) {
		afterConnect = null;
		return;
	}
	if (app.key && !app.keyRejected) return fn();
	afterConnect = { run: fn, minimumTier };
	ui.sheet = 'connect';
}
export function connected() {
	const f = afterConnect;
	afterConnect = null;
	// Connected from New character's More: back to it, as its Back would.
	if (canReturnToCreator()) returnToCreator();
	else ui.sheet = null;
	if (f && allowsTier(f.minimumTier)) f.run();
}
export const pendingConnectionMinimumTier = () => afterConnect?.minimumTier ?? null;
/** Closing Connect cancels its spending action, including when the balance request is still in flight. */
export function clearPendingConnection() {
	afterConnect = null;
}

// ---------- project + outfit ----------
export interface ProjectRef {
	id: string;
	name: string;
	exportId?: string;
	demo: boolean;
	dev: boolean;
	savedAt: string;
	/** Changes whenever the saved look does (body, items or outfit), so a character's thumbnail redraws only then. */
	look: string;
	/** Shape at a glance for saved characters; the demo's comes from its open manifest. */
	facts?: ReturnType<typeof characterFacts>;
}
class Store {
	project = $state.raw<Project | null>(null);
	moveReviews = $state.raw<NonNullable<StoredProject['moveReviews']>>({});
	stateAttempts = $state.raw<NonNullable<StoredProject['stateGenerations']>>({});
	exportRecord = $state.raw<StoredProject>();
	projects = $state.raw<ProjectRef[]>([]);
	results = $state.raw<Record<string, ItemResult | null>>({});
	/** Drafts whose paid frames could not be read for review: the review offers a free Try again (readGenReview). */
	resultsUnread = $state.raw<Record<string, true>>({});
}
export const store = new Store();
/** Entries in Recently deleted, newest first: one per deletion, each restorable after a reload. */
class DeletedList {
	entries = $state.raw<RecentlyDeleted[]>([]);
	/** Read once per session; deletes, restores and the Library panel refresh it after that. */
	ready = false;
	/** The last read failed: `entries` is the last list that loaded, which may be empty or out of date. */
	loadFailed = $state(false);
}
export const deleted = new DeletedList();
/** An undo or redo step: the dress state to go back to, and the slot definitions (JSON) right after the step, so applying
 *  it reverts only the step's own slot changes (mergeSlotEdits) and keeps slots changed since by other steps or tabs. */
export interface UndoStep {
	label: Message;
	/** The dress state to go back to. A delete step has none: it names its recovery entry instead. */
	snap?: string;
	from?: string;
	/** A deleted entry Undo puts back exactly, instead of replaying a dress snapshot. */
	trash?: string;
	/** A change to the saved record (artwork, names, the move description, an item's category) that Undo and Redo write
	 *  again: `edit(false)` undoes it, `edit(true)` redoes it. Each checks the record first and throws why it refuses: a
	 *  refusal for good (STEP_GONE) drops the step, any other keeps it; false means refused and already reported (kept). */
	edit?: (redo: boolean) => Promise<boolean | void>;
}
/** The history of every character opened in this tab but not open now, so switching back continues it. */
const histories = new Map<string, { undo: UndoStep[]; redo: UndoStep[] }>();
/** A character's Undo and Redo stacks: the open character's live ones, or the ones kept for it. */
function historyOf(id: string): { undo: UndoStep[]; redo: UndoStep[] } {
	if (id === doc.id) return doc;
	let kept = histories.get(id);
	if (!kept) histories.set(id, (kept = { undo: [], redo: [] }));
	return kept;
}
export const doc = $state({
	id: '',
	loading: true,
	error: '' as Message | string,
	rev: 0,
	items: {} as Preset['items'],
	variants: {} as Preset['variants'],
	saved: 0,
	undo: [] as UndoStep[],
	redo: [] as UndoStep[],
	/** Worn drafts, slot -> draft id: shown over the outfit, never in doc.items, so autosave, undo, outfits and exports never
	 *  see a draft. Cleared when a saved item or None takes the slot, on discard and when another character opens. */
	drafts: {} as Record<string, string>,
	/** The color being dragged in the custom color picker: shown by the stage and tiles, never saved or undone until the picker
	 *  commits it (then it becomes one ordinary color change). */
	colorPreview: null as { id: string; value: string } | null
});
export const isDemo = () => doc.id.startsWith('fixture:');

export function openAppearance(projectId: string, itemId?: string, back?: 'item' | 'setup') {
	ui.appearance = {
		target: { projectId, itemId, clip: itemId ? ui.anim : undefined },
		choice: itemId ? 'custom' : 'underwear',
		model: 'pro',
		prompt: '',
		back
	};
	ui.sheet = 'appearance';
}

/** What the stage shows: the project with the selected color variants swapped in (exact ramp swap) and the worn drafts' current
 *  previews, the outfit with those drafts on, and the playing cell. */
class View {
	recolored = $derived.by(() => {
		void doc.rev;
		const p = store.project,
			preview = doc.colorPreview;
		if (!p) return null;
		const variants = $state.snapshot(doc.variants);
		return recolor(p, preview ? { ...variants, [preview.id]: preview.value } : variants);
	});
	project = $derived.by(() => this.recolored && withDrafts(this.recolored));
	// a worn draft is never invisible: a draft in the other hand shows instead of a two-handed item (display only)
	items = $derived.by(() => {
		const m = this.project?.manifest,
			on = { ...doc.items, ...doc.drafts };
		return m
			? settleHands(
					m,
					on,
					Object.keys(doc.drafts).find((s) => handSide(m, s))
				).items
			: on;
	});
	anim = $derived(store.project?.manifest.rig.animations.find((a) => a.id === ui.anim));
	cell = $derived(this.anim ? this.anim.frames[ui.frame % this.anim.frames.length].cell : 0);
}
export const view = new View();

/** Inspect playlist entries, including repeats, without letting playback advance under the reviewer. */
export function stepPreviewFrame(direction: -1 | 1): void {
	const count = view.anim?.frames.length ?? 0;
	if (!count) return;
	ui.playing = false;
	ui.frame = ((ui.frame % count) + count + direction) % count;
}

/** Pause the stage on one frame (a cell of a move, in one direction) for a closer look. */
export function showFrame(anim: string, dir: DirectionName, cell: number): void {
	const clip = store.project?.manifest.rig.animations.find((a) => a.id === anim);
	if (!clip) return;
	ui.anim = anim;
	ui.dir = dir;
	ui.all = false;
	ui.playing = false;
	ui.frame = Math.max(
		0,
		clip.frames.findIndex((f) => f.cell === cell)
	);
}

/** A saved character's listed identity and cached summary, for the first load and for a save that reloads it. */
function savedProjectRef(p: StoredProject): ProjectRef {
	return {
		id: p.id,
		name: p.manifest.name,
		exportId: p.manifest.exportId ?? defaultCharacterExportId(p.id),
		demo: false,
		dev: p.origin === 'dev',
		savedAt: p.savedAt,
		// A developer rig (never shown as a character) may lack the items and slots a dress state reads.
		look:
			p.origin === 'dev'
				? p.savedAt
				: `${p.savedAt} ${stableStringify(dressOf(p.manifest, (p as { dress?: { current?: Outfit } }).dress?.current))}`,
		// A developer rig frozen on the M2 pages need not carry a full rig; it has no card facts.
		facts: p.manifest.rig?.cell ? characterFacts(p.manifest) : undefined
	};
}
/** Keep one listed character in step with its saved record after a save reloaded it: its name, facts, saved time and
 *  thumbnail look, without reading the whole list again. */
function syncProjectRef(p: StoredProject) {
	if (!store.projects.some((entry) => entry.id === p.id)) return;
	const ref = savedProjectRef(p);
	store.projects = store.projects.map((entry) => (entry.id === p.id ? ref : entry));
}
/** A save finished for a character this tab may not be showing: read its record and keep its listed summary in step, since
 *  only opening it reloads the record. The summary is not work the save depends on, so a read failure is logged, never
 *  reported as a failed save. */
export async function syncStoredProject(id: string) {
	const record = await db.get<StoredProject>('projects', id).catch((error: unknown) => {
		console.error('saved character summary', error);
		return undefined;
	});
	if (record?.manifest) syncProjectRef(record);
}

/** False when the saved characters could not be read (already reported). */
export async function refreshProjects(): Promise<boolean> {
	const listed = await listProjects().catch((e: unknown) => {
			console.error('projects', e);
			toast(message('state.couldNotReadYourSavedCharactersReason', { reason: errorMessage(e) }), {
				error: e,
				tone: 'danger'
			});
			return null;
		}),
		own = (listed ?? []).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
	// An outfit save changes the dress state (outfit, palettes, hides, layer order), not savedAt, which orders the list; the
	// demo's dress state is its own record.
	const demoDress = await db.get('projects', `dress-${DEMO}`).catch(() => undefined);
	store.projects = [
		{
			id: DEMO,
			name: `${DEMO_NAME} (demo)`,
			demo: true,
			dev: false,
			savedAt: '',
			look: stableStringify(demoDress ?? null)
		},
		...own.map(savedProjectRef)
	];
	// Items of a character created, renamed or deleted here or in another tab.
	void refreshShared();
	// Drop unload snapshots and thumbnails of characters deleted here or in another tab (only when the listing is known to
	// be complete).
	if (listed) keepThumbnails(new Set(store.projects.map((p) => p.id)));
	// The history of a character deleted here or in another tab goes with it.
	if (listed)
		for (const id of histories.keys())
			if (!store.projects.some((p) => p.id === id)) histories.delete(id);
	if (listed && !workspaceCopy)
		try {
			for (const k of Object.keys(localStorage))
				if (k.startsWith(UNSAVED) && !store.projects.some((p) => k === UNSAVED + p.id))
					localStorage.removeItem(k);
		} catch {
			/* storage blocked */
		}
	return !!listed;
}

async function prepareCharacter(r: Awaited<ReturnType<typeof openSource>>) {
	const manifest = r.project.manifest;
	const base = manifest.items.find(({ id }) => id === manifest.rig.baseItem);
	const split = base?.regions === 'shirt-shorts' ? null : await splitBase(r.project);
	deriveMaterials(r.project); // items without materials (new items, fresh fixtures)
	return { r, split };
}

/** A saved character as the Studio shows it, read without opening it. */
async function readCharacter(id: string) {
	return prepareCharacter(await openSource(id));
}

export async function readCharacterForExport(id: string) {
	const r = await openSource(id, undefined, { allowMissingImages: true });
	return r.missingImages ? r : (await prepareCharacter(r)).r;
}

let openRequest = 0,
	openingIdentityRevision = 0,
	opening = $state(''); // opening: the character the newest open is loading ('' when it finished)
export const openingProjectId = () => opening;
/** keep.wear: equip that item (Keep it). keep.quiet: reload the open character in place (a draft saved itself): the view, the
 *  selection and undo stay, and the stage does not show loading. */
export async function openProject(id: string, keep?: { wear?: string; quiet?: boolean }) {
	const request = ++openRequest,
		quiet = !!keep?.quiet && id === doc.id,
		seen = edits,
		revision = doc.rev; // edits so far are saved before the read
	opening = id;
	await flushSave();
	if (request !== openRequest) return;
	if (!quiet) doc.loading = true;
	doc.error = '';
	try {
		const identityRevision = openingIdentityRevision;
		const { r, split } = await readCharacter(id);
		if (request !== openRequest) return;
		if (split?.dirty && !id.startsWith('fixture:')) await saveSplit(id, r.project.manifest, split);
		if (request !== openRequest) return;
		await flushSave(); // an edit made to the previous character while this one loaded lands before it is replaced
		if (request !== openRequest) return;
		// Outfit edits and explicit metadata changes made during a reload are newer than its read.
		if (openingIdentityRevision !== identityRevision) return openProject(id, keep);
		if (id === doc.id && (edits !== seen || doc.rev !== revision)) return openProject(id, keep);
		const m = r.project.manifest;
		const pr = r.current ?? m.presets[0] ?? { items: {}, variants: {} };
		const savedSlots = structuredClone(m.slots);
		const unsaved = takeUnsaved(id, m),
			current = unsaved ?? pr; // replace, never merge: a reset or removal deletes keys
		if (!quiet) {
			doc.items = { ...current.items };
			reconcileItemSlots(doc.items, new Map(m.items.map((it) => [it.id, it.slot])));
			doc.variants = { ...current.variants };
		} // in place: keep the live outfit
		if (id !== doc.id) doc.drafts = {};
		doc.colorPreview = null;
		// Items put on by this open (Keep it, an accepted worn draft) are replayed below as one undoable edit, which also says
		// what a two-handed item took off.
		const outfit = { ...doc.items },
			newlyWorn: Item[] = [];
		if (keep?.wear) {
			const it = m.items.find((i) => i.id === keep.wear);
			if (it) {
				doc.items[it.slot] = it.id;
				delete doc.drafts[it.slot];
				newlyWorn.push(it);
			}
		}
		// Reloading the open character keeps its history: snapshots only re-apply the dress state, which never revives a
		// removed item and keeps items added since. Switching keeps each character's own history for when it opens again
		// (a deleted one, no longer listed, keeps none).
		const switched = id !== doc.id;
		if (switched) {
			if (doc.id && store.projects.some((p) => p.id === doc.id))
				histories.set(doc.id, { undo: doc.undo, redo: doc.redo });
			const kept = histories.get(id);
			histories.delete(id);
			doc.undo = kept?.undo ?? [];
			doc.redo = kept?.redo ?? [];
		}
		// Another character starts on its standing move, whatever move the last one showed: it is the one every item is made
		// for, so what is worn shows. Walk hides each item without walk frames, which reads as lost items.
		if (switched || !m.rig.animations.some((a) => a.id === ui.anim))
			ui.anim = (
				m.rig.animations.find((a) => a.id === DEFAULT_MOVE) ??
				m.rig.animations.find((a) => a.id === 'walk') ??
				m.rig.animations[0]
			).id;
		doc.id = id;
		if (r.dressUnread && dressUnread !== id)
			toast(message('state.demoOutfitsUnread'), { tone: 'danger' });
		dressUnread = r.dressUnread ? id : '';
		slotBase = { id, slots: savedSlots };
		if (!m.rig.directions.some((d) => d.id === ui.dir)) ui.dir = m.rig.directions[0].id;
		if (!quiet) ui.frame = 0;
		store.project = r.project;
		// Mounted, a character opens on its saved Riding pose (Mount settings).
		if (switched) ui.anim = syncRiderPose(id, m, ui.anim);
		store.moveReviews = r.record?.moveReviews ?? {};
		store.stateAttempts = r.record?.stateGenerations ?? {};
		store.exportRecord = r.record;
		if (r.record) syncProjectRef(r.record);
		// Another acceptance can supersede its reload. Retire worn drafts only when their saved items are published.
		let acceptedWear = false;
		for (const g of [...gens]) {
			if (!g.draft.acceptedAt) continue;
			const item = g.draft.rigId === id ? m.items.find((i) => i.id === g.draft.spec.id) : undefined;
			if (g.draft.rigId === id && !item) continue;
			if (item && doc.drafts[item.slot] === item.id) {
				doc.items[item.slot] = item.id;
				delete doc.drafts[item.slot];
				acceptedWear = true;
				newlyWorn.push(item);
			}
			drop(g);
		}
		// Putting on what was just saved is its own step: otherwise undoing an older edit would take it off unannounced.
		const wearing = uniqueBy(newlyWorn, (it) => it.id).filter((it) => outfit[it.slot] !== it.id),
			wornSlot = wearing.at(-1)?.slot;
		if (wornSlot) {
			doc.items = outfit;
			commit(
				message('history.wear', { name: wearing.map((i) => i.name).join(', ') }),
				() => {
					for (const it of wearing) doc.items[it.slot] = it.id;
				},
				// Only Keep it is the person's own action: a draft saving itself in the background keeps their Redo.
				{ keepHand: wornSlot, keepRedo: !keep?.wear || !!keep.quiet }
			);
		} else doc.items = settleHands(m, doc.items).items; // an outfit read as saved keeps the Main hand
		if (!quiet) {
			ui.selected = keep?.wear ?? '';
			ui.group = ui.selected
				? m.items.find((i) => i.id === ui.selected)!.slot
				: (shownCategories(m, busySlots(m))[0]?.key ?? ui.group);
			ui.wardrobeOpenRevision++;
		}
		lsSet(K.last, id);
		void refreshShared();
		doc.rev++;
		savedEdits = edits; // nothing is pending (flushed above): what was just loaded is saved, so only later edits count
		// Keep it equips the accepted item while opening, or an outfit left unsaved by an unload; persist it now.
		if (keep?.wear || unsaved || acceptedWear) {
			save();
			await flushSave();
		}
	} catch (e) {
		if (request !== openRequest) return;
		doc.error = errorMessage(e);
		// The demo's own open clears doc.error: say why the requested character is not shown.
		if (id !== DEMO) {
			console.error('open', e);
			toast(message('state.couldNotOpenThatCharacterError', { error: errorMessage(e) }), {
				error: e,
				tone: 'danger'
			});
			return openProject(DEMO);
		}
	} finally {
		if (request === openRequest) {
			doc.loading = false;
			opening = '';
		}
	}
}
/** Split a saved body's shirt and shorts as its first open does (once per character), before a free edit of a character
 *  that may not have been opened yet (Directions, Adjust frame from the character list): the edit then starts from the
 *  record that open leaves, instead of that open re-saving the body later and so refusing the edit's Undo. */
export async function splitBeforeEdit(id: string) {
	const rec = await db.get<StoredProject>('projects', id);
	const base = rec?.manifest?.items.find((it) => it.id === rec.manifest.rig.baseItem);
	if (!base || base.regions === 'shirt-shorts') return;
	const { r, split } = await readCharacter(id);
	if (split?.dirty) await saveSplit(id, r.project.manifest, split);
}
export const lastProject = () => lsGet(K.last) ?? DEMO;
/** Work finishing in the background reloads only the character in view, never one the user is leaving: reopening it would
 *  cancel the open of the newly picked one. */
const viewing = (id: string) => doc.id === id && (!opening || opening === id);

export async function refreshCharacterDirections(id: string): Promise<boolean> {
	const reload = viewing(id);
	if (reload) await openProject(id, { quiet: true });
	const listed = await refreshProjects();
	return listed && (!reload || doc.id === id || !!opening);
}

// ---- undo/redo: snapshots of the dress state (outfit, colors, presets, layer order, hides) ----
const snap = () =>
	JSON.stringify(
		dressOf(store.project!.manifest, {
			items: $state.snapshot(doc.items),
			variants: $state.snapshot(doc.variants)
		})
	);
const slotsNow = () => JSON.stringify(store.project!.manifest.slots);
/** Apply an undo or redo step. A slot the step removes stays while it holds items or item attempts (an attempt's own
 *  definition must not disappear under it), and the person is told. */
function restore(e: UndoStep) {
	const d = JSON.parse(e.snap!) as DressState,
		m = store.project!.manifest;
	const keep = busySlots(m),
		from = e.from ? (JSON.parse(e.from) as Slot[]) : m.slots,
		removed = from.filter((s) => !d.slots.some((x) => x.id === s.id));
	d.slots = retainSlotDirections(mergeSlotEdits(from, d.slots, m.slots, keep), m.rig.directions);
	const kept = removed.filter((s) => keep.has(s.id) && d.slots.some((x) => x.id === s.id));
	applyDress(m, d);
	doc.items = { ...d.current!.items };
	// An item deleted for good since the snapshot (its Trash entry gone, or another tab) is not worn as a dangling id.
	reconcileItemSlots(doc.items, new Map(m.items.map((it) => [it.id, it.slot])));
	doc.variants = { ...d.current!.variants };
	bump();
	save();
	for (const s of kept)
		toast(message('state.valueStaysItHasItemsOrItems', { value: slotLabel(m, s.id) }));
}
/** Every user edit goes through here: undo entry, apply, re-render, autosave. A two-handed item and an item in the other hand
 *  are never kept together: `keepHand` names the hand the edit is about (a whole outfit or look passes the Main hand);
 *  without it, the one hand the edit put an item on stays. Returns the message about what came off, which is shown unless
 *  `quiet`. `keepRedo`: a change the person did not make (a draft saving itself) leaves their Redo as it is. */
export function commit(
	label: Message,
	fn: () => void,
	o: { keepHand?: string; quiet?: boolean; keepRedo?: boolean } = {}
): Message | undefined {
	if (!store.project) return;
	const step = { label, snap: snap() };
	if (!o.keepRedo) clearRedo(doc.id);
	const before = { ...doc.items };
	fn();
	doc.undo = [...doc.undo.slice(-99), { ...step, from: slotsNow() }];
	const changed = Object.keys(doc.items).filter(
		(s) =>
			handSide(store.project!.manifest, s) &&
			doc.items[s] &&
			(doc.items[s] ?? null) !== (before[s] ?? null)
	);
	const hands = settleHands(
		store.project.manifest,
		doc.items,
		o.keepHand ?? (changed.length === 1 ? changed[0] : undefined)
	);
	let note: Message | undefined;
	if (hands.removed) {
		doc.items = hands.items;
		const removed = hands.removedItems ?? [hands.removed],
			names = removed.map((it) => it.name).join(', ');
		note =
			removed.length === 1 && twoHanded(store.project.manifest, hands.removed)
				? message('state.tookOffTwoHanded', { names })
				: message('state.tookOffForTwoHanded', { names, name: hands.by!.name });
		if (!o.quiet) toast(note);
	}
	// a saved item put on or taken off a slot replaces the draft worn there
	for (const slot of Object.keys(doc.drafts))
		if ((doc.items[slot] ?? null) !== (before[slot] ?? null)) delete doc.drafts[slot];
	bump();
	save();
	return note;
}
/** Manifest edits are in place; a new top-level object lets every `$derived(store.project.manifest)` see the change. */
function bump() {
	const p = store.project!;
	store.project = { ...p, manifest: { ...p.manifest } };
	doc.rev++;
}
/** A delete is undone by its recovery entry, not by a dress snapshot: it is the last step, so every older step is only
 *  reachable after the thing is back. Redo is cleared rather than replaying a deletion. */
export async function undo() {
	const e = doc.undo.at(-1);
	if (!e || waitForStep()) return;
	if (e.trash) {
		const id = doc.id;
		// The step stays on its stack while the restore runs; a restore drops it (dropTrashSteps), a refusal keeps it.
		await whileStepping(async () => {
			if (await restoreDeleted(e.trash!)) historyOf(id).redo = [];
		});
		return;
	}
	if (e.edit) return applyEdit(e, false);
	const back = snap();
	doc.undo = doc.undo.slice(0, -1);
	restore(e);
	doc.redo = [...doc.redo, { label: e.label, snap: back, from: slotsNow() }];
}
export async function redo() {
	const e = doc.redo.at(-1);
	if (!e || waitForStep()) return;
	if (e.edit) return applyEdit(e, true);
	if (!e.snap) return;
	const back = snap();
	doc.redo = doc.redo.slice(0, -1);
	restore(e);
	doc.undo = [...doc.undo, { label: e.label, snap: back, from: slotsNow() }];
}
/** A step that writes the saved record is running: the next Undo or Redo waits for it instead of overtaking it. */
let stepping = false;
/** True, and says so, while a step is still being written: a write that never finishes must not leave Undo silently dead. */
function waitForStep() {
	if (stepping) toast(message('history.busy'), { tone: 'warning' });
	return stepping;
}
/** Refusals that never pass: the character, item or target the step names changed or is gone. Anything else (busy work,
 *  drafts, a storage error) may pass later. */
const STEP_GONE = new Set([
	'history.changed',
	'wardrobe.itemMoveChanged',
	'directionsSheet.characterUnavailable',
	'renameSheet.itemMissing',
	'renameSheet.moveMissing'
]);
/** Run a step's write. A step refused for good is dropped (`drop`), so the older steps behind it stay reachable, and the
 *  notice says it was removed; any other failure keeps it where it was. */
async function whileStepping(run: () => Promise<void>, drop?: () => void) {
	stepping = true;
	try {
		await run();
	} catch (error) {
		const gone = !!drop && error instanceof LocalizedError && STEP_GONE.has(error.translation.key);
		if (gone) drop();
		toast(gone ? message('history.changed') : (errorTranslation(error) ?? errorMessage(error)), {
			tone: 'danger',
			report: gone ? false : undefined,
			error
		});
	} finally {
		stepping = false;
	}
}
/** The history holds a state proxy of a step: its function is the same object, so it identifies the step. */
const sameStep = (a: UndoStep) => (b: UndoStep) => b.edit === a.edit;
const without = (id: string, stack: 'undo' | 'redo', e: UndoStep) => () => {
	const history = historyOf(id);
	history[stack] = history[stack].filter((s) => !sameStep(e)(s));
};
/** Redo stacks a new action of the person cleared, per character: counted, since other updates (a background wear, a Trash
 *  entry leaving) replace the arrays too without clearing anything. */
const redoClears = new Map<string, number>();
function clearRedo(id: string) {
	historyOf(id).redo = [];
	redoClears.set(id, (redoClears.get(id) ?? 0) + 1);
}
/** Undo (or redo) a saved-record step. It stays on its stack while its write runs and moves to the other stack only once
 *  the write lands, so a write that fails or never finishes never loses it. A finished Redo always rejoins Undo; a finished
 *  Undo joins Redo unless a new action cleared Redo meanwhile. The history is the character's own, also when another
 *  character was opened meanwhile. */
function applyEdit(e: UndoStep, redoing: boolean) {
	const id = doc.id,
		[from, to] = redoing ? (['redo', 'undo'] as const) : (['undo', 'redo'] as const),
		clears = redoClears.get(id) ?? 0;
	return whileStepping(
		async () => {
			if ((await e.edit!(redoing)) === false) return;
			without(id, from, e)();
			const history = historyOf(id);
			if (redoing || (redoClears.get(id) ?? 0) === clears) history[to] = [...history[to], e];
		},
		without(id, from, e)
	);
}
/** A notice's Undo: exactly the change it announced, even when newer steps followed it, since a saved-record step never
 *  depends on them (each checks the record itself). It leaves the history, as a delete restored from Trash does. */
export async function undoStep(projectId: string, step: UndoStep) {
	const undos = historyOf(projectId).undo,
		at = undos.findIndex(sameStep(step));
	if (at < 0) {
		toast(message('history.notInHistory'));
		return;
	}
	if (waitForStep()) return;
	if (projectId === doc.id && at === undos.length - 1) return undo();
	await whileStepping(
		async () => {
			if ((await step.edit!(false)) !== false) without(projectId, 'undo', step)();
		},
		without(projectId, 'undo', step)
	);
}
/** Add a step to a character's history (the open one's, or the one kept for another). */
function pushStep(projectId: string, step: UndoStep) {
	clearRedo(projectId);
	const history = historyOf(projectId);
	history.undo = [...history.undo.slice(-99), step];
}
/** Add a delete to the history: one step whose Undo restores exactly the entry the delete wrote. */
export function pushRecovery(label: Message, trash: string) {
	if (!store.project) return;
	pushStep(doc.id, { label, trash, from: slotsNow() });
}

// ---- artwork steps: a free edit of saved artwork (frame, directions, Fix frames, item colors) undone by writing back the
// record it replaced ----
/** Parts of a saved character that dressing, renames and the move description change without touching its artwork. An
 *  artwork step compares everything else, and keeps each of these as it is now unless it still matches the step's other
 *  side (then it changes with the step). */
type Part = { get: (r: StoredProject) => unknown; set: (r: StoredProject, value: unknown) => void };
const field = <K extends string>(
	of: (r: StoredProject) => Partial<Record<K, unknown>> | undefined,
	key: K
): Part => ({
	get: (r) => of(r)?.[key],
	set: (r, value) => {
		const target = of(r);
		if (!target) return;
		if (value === undefined) delete target[key];
		else target[key] = value;
	}
});
const manifestOf = (r: StoredProject) => r.manifest as unknown as Record<string, unknown>;
function liveParts(r: StoredProject): Part[] {
	const itemOf = (id: string) => (x: StoredProject) =>
			x.manifest.items.find((it) => it.id === id) as unknown as Record<string, unknown> | undefined,
		moveOf = (id: string) => (x: StoredProject) =>
			x.manifest.rig.animations.find((a) => a.id === id) as unknown as
				Record<string, unknown> | undefined;
	return [
		field((x) => x as unknown as Record<string, unknown>, 'dress'),
		field((x) => x as unknown as Record<string, unknown>, 'savedAt'),
		field((x) => x.character, 'looks'),
		field((x) => x.manifest.rig, 'mountSeatOffsets'),
		...(['name', 'exportId', 'presets', 'materials', 'slots'] as const).map((key) =>
			field(manifestOf, key)
		),
		...r.manifest.items.flatMap((it) =>
			(['name', 'exportId', 'hides', 'materials'] as const).map((key) => field(itemOf(it.id), key))
		),
		...r.manifest.rig.animations.flatMap((a) =>
			(['name', 'exportId'] as const).map((key) => field(moveOf(a.id), key))
		)
	];
}
/** The record without its live parts: what an artwork step must find unchanged before it writes. */
function artworkOf(r: StoredProject): string {
	const out = structuredClone(r);
	for (const part of liveParts(r)) part.set(out, undefined);
	return stableStringify(out);
}
/** `target` (one side of a step) with the live parts that changed since `expect` (its other side) taken from `current`. */
function withLiveParts(target: StoredProject, expect: StoredProject, current: StoredProject) {
	const out = structuredClone(target);
	for (const part of liveParts(current))
		if (stableStringify(part.get(current)) !== stableStringify(part.get(expect)))
			part.set(out, structuredClone(part.get(current)));
	// Slots edited since keep those edits, yet hold the per-direction layer order too: the overrides of directions this step
	// brings back (removing a direction dropped them) come back with it, and those of directions it removes go.
	if (stableStringify(current.manifest.slots) !== stableStringify(expect.manifest.slots)) {
		const had = new Set(expect.manifest.rig.directions.map((d) => d.id)),
			returning = (slot: Slot) =>
				(target.manifest.slots.find((x) => x.id === slot.id)?.zOverrides ?? []).filter(
					(o) => o.dir && !had.has(o.dir)
				);
		out.manifest.slots = retainSlotDirections(
			current.manifest.slots.map((slot) => {
				const back = returning(slot);
				return structuredClone(
					back.length ? { ...slot, zOverrides: [...(slot.zOverrides ?? []), ...back] } : slot
				);
			}),
			target.manifest.rig.directions
		);
	}
	out.savedAt = new Date().toISOString();
	return out;
}
/** A history step found the saved record changed in a way it cannot safely reverse: it is dropped (whileStepping). */
const historyChanged = () =>
	new LocalizedError(
		'This step was removed from the history: the character changed since, so it can no longer be undone or redone.',
		'history.changed'
	);
type ArtworkAction = 'change the frame of' | 'change directions for' | 'replace body frames of';
/** Why the edit `action` names cannot be written again now: the same checks as the edit itself. */
const artworkBlocked = (action: ArtworkAction, id: string) =>
	action === 'change the frame of'
		? frameEditsBlocked(id)
		: action === 'change directions for'
			? directionEditsBlocked(id)
			: characterEditBlocked('fix frames of', id);
/** A free artwork edit as one step, made before the edit's save writes (both records are known then). `before` and `after`
 *  are the record around the edit. `action`: the edit replaces the whole character while it is idle, so its undo does too;
 *  without it only item `itemId` changes, and only it is written back. The artwork only one side uses is copied now, in
 *  parallel: the stored record still holds the before side, so no cleanup can have swept it, and `written` holds the new
 *  images the save stores. Undefined when some of it is not stored: the edit is then saved without a step
 *  (recordArtworkStep says so). */
export async function prepareArtworkStep(
	o: {
		projectId: string;
		label: Message;
		before: StoredProject;
		after: StoredProject;
		action?: ArtworkAction;
		itemId?: string;
	},
	written: Map<string, Blob>
): Promise<UndoStep | undefined> {
	const { projectId, before, after, action, itemId } = o;
	// The artwork itself, not every hash-like string (a body hash or rig version names no stored image).
	const refs = (r: StoredProject) =>
			new Set(
				[...artworkRefs(r.manifest)].flatMap(([hash]) =>
					typeof hash === 'string' && hash.startsWith('sha256:') ? [hash.slice(7)] : []
				)
			),
		a = refs(before),
		b = refs(after),
		keys = [...a, ...b].filter((key) => a.has(key) !== b.has(key));
	const found = await Promise.all(
		keys.map(
			async (key) =>
				written.get(key) ??
				(await db.getBlob(key).catch((error: unknown) => {
					console.error('undo step artwork', error);
					return undefined;
				}))
		)
	);
	if (found.some((blob) => !blob)) return;
	const blobs = new Map(keys.map((key, i) => [key, found[i]!]));
	return {
		label: o.label,
		edit: async (redo) => {
			const [expect, target] = redo ? [before, after] : [after, before];
			const blocked = action && artworkBlocked(action, projectId);
			if (blocked) throw blocked;
			await flushSave();
			if (action) {
				const current = db.asLoaded(await db.get<StoredProject>('projects', projectId));
				if (!current?.manifest || artworkOf(current) !== artworkOf(expect)) throw historyChanged();
				await db.saveIdleCharacter(current, withLiveParts(target, expect, current), blobs, action);
			} else
				await db.updateCharacter<StoredProject>(projectId, blobs, (stored) => {
					const current = db.asLoaded(stored);
					const now = current?.manifest.items.findIndex((it) => it.id === itemId) ?? -1;
					if (!current || now < 0) throw historyChanged();
					// Only this item is compared and written: everything else stays as it is now.
					const only = (r: StoredProject) => ({
						...current,
						manifest: {
							...current.manifest,
							items: r.manifest.items.filter((it) => it.id === itemId)
						}
					});
					if (artworkOf(only(current)) !== artworkOf(only(expect))) throw historyChanged();
					const next = withLiveParts(only(target), only(expect), only(current)).manifest.items[0];
					if (!next) throw historyChanged();
					current.manifest.items[now] = next;
					current.savedAt = new Date().toISOString();
					return current;
				});
			await refreshCharacterDirections(projectId);
		}
	};
}
/** Once an artwork edit's save landed, and before anything reloads, so Undo offers it at once: add its step, or say the
 *  change was saved without one. */
export function recordArtworkStep(projectId: string, step: UndoStep | undefined) {
	if (step) pushStep(projectId, step);
	else toast(message('history.notRecorded'), { tone: 'warning' });
}

let saveT: ReturnType<typeof setTimeout> | undefined;
let pendingSave: (() => Promise<void>) | null = null;
let saving: Promise<void> = Promise.resolve();
export async function flushSave() {
	clearTimeout(saveT);
	const pending = pendingSave;
	pendingSave = null;
	if (pending) saving = saving.then(pending);
	await saving;
}

export async function prepareWorkspaceExport() {
	await flushSave();
	if (edits !== savedEdits)
		throw new LocalizedError(
			'The latest changes could not be saved. Save them before exporting.',
			'state.theLatestChangesCouldNotBeSaved'
		);
}

export async function refreshRestoredLibrary() {
	identityChannel?.postMessage({ libraryRestored: true });
	await refreshProjects();
}
/** The slot definitions the open character's view continues from (its open or last save): a save writes only the slot
 *  changes made since, so a stale tab's routine save never undoes another tab's category changes. */
let slotBase: { id: string; slots: Slot[] } | null = null;
/** Save the dress state with the view's slot changes since slotBase, then continue from what was saved: other tabs' slot
 *  changes come into the view, and its own changes made meanwhile stay to be saved next. */
async function saveSlotsAndDress(id: string, m: Manifest, cur: Outfit) {
	// The view's slots now: a save that finished after this one was scheduled may have brought in others' changes.
	const here = doc.id === id && store.project ? store.project.manifest : m,
		mine = structuredClone(here.slots),
		base = slotBase?.id === id ? slotBase.slots : mine;
	const keep = new Set(gens.filter((g) => g.draft.rigId === id).map((g) => g.input.slot));
	if (base.some((s) => !mine.some((x) => x.id === s.id))) {
		// A removal (an undone or deleted empty category) also spares slots that attempts saved by other tabs use. Unreadable:
		// the category stays (and comes back into view) rather than risk leaving an attempt without its definition.
		try {
			for (const g of await readGens()) if (g.draft.rigId === id) keep.add(g.input.slot);
		} catch (e) {
			console.error('saved item attempts', e);
			for (const s of base) keep.add(s.id);
		}
	}
	const saved = await saveDress(id, { ...m, slots: mine }, cur, { base, keep });
	if (doc.id !== id || !store.project) return;
	const live = store.project.manifest,
		next = mergeSlotEdits(mine, live.slots, saved, busySlots(live));
	slotBase = { id, slots: saved };
	if (stableStringify(next) !== stableStringify(live.slots)) {
		live.slots = next;
		bump();
	}
}
let edits = 0,
	savedEdits = 0;
/** The open demo whose saved outfits could not be read: its edits stay in memory, never saved over the unread record. */
let dressUnread = '';
function save() {
	clearTimeout(saveT);
	const id = doc.id,
		m = store.project?.manifest;
	if (!m || dressUnread === id) return;
	const n = ++edits,
		cur = { items: $state.snapshot(doc.items), variants: $state.snapshot(doc.variants) };
	pendingSave = async () => {
		storeVariants(m, cur.variants);
		try {
			await saveSlotsAndDress(id, m, cur);
			doc.saved = Date.now();
			if (n === edits) {
				savedEdits = n;
				lsSet(unsavedKey(id), null);
			}
		} catch (e) {
			console.error('autosave', e);
			toast(message('state.couldNotSaveReason', { reason: errorMessage(e) }), {
				error: e,
				tone: 'danger'
			});
		}
	};
	saveT = setTimeout(() => void flushSave(), 400);
}

// IndexedDB writes started while a page unloads may never finish, so the unsaved dress state (the undo snapshot: outfit,
// colors, saved outfits, layer order, hides) also goes to localStorage (synchronous) until a save lands; openProject
// re-applies it with applyDress and saves it.
const UNSAVED = 'pixeldoll.unsaved.',
	unsavedKey = (id: string) => UNSAVED + id;
function keepUnsaved() {
	// While another character loads, doc and store.project still describe this one, so its snapshot stays consistent.
	if (edits === savedEdits || !doc.id || !store.project) return;
	try {
		const base = slotBase?.id === doc.id ? slotBase.slots : undefined;
		lsSet(unsavedKey(doc.id), JSON.stringify({ ...JSON.parse(snap()), slotBase: base }));
	} catch (e) {
		console.error('unsaved snapshot', e);
	}
}
function takeUnsaved(id: string, m: Manifest): Pick<Preset, 'items' | 'variants'> | null {
	try {
		const d = JSON.parse(lsGet(unsavedKey(id)) ?? 'null') as
			(DressState & { slotBase?: Slot[] }) | null;
		// Validate the whole shape first: applyDress changes the manifest in place, so a bad snapshot must not half-apply.
		const obj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
		const current = d?.current;
		if (
			d?.format !== CURRENT_FORMAT ||
			!current ||
			!obj(current) ||
			!obj(current.items) ||
			!obj(current.variants) ||
			!Array.isArray(d.itemIds) ||
			!Array.isArray(d.materials) ||
			!Array.isArray(d.presets) ||
			!Array.isArray(d.slots) ||
			(d.slotBase != null && !Array.isArray(d.slotBase)) ||
			(d.hides != null && !obj(d.hides))
		)
			return null;
		// Only the slot changes the unsaved view made are carried onto the saved ones (none without its starting point).
		const keep = new Set([
			...m.items.map((it) => it.slot),
			...gens.filter((g) => g.draft.rigId === id).map((g) => g.input.slot)
		]);
		const slots = d.slotBase ? mergeSlotEdits(d.slotBase, d.slots, m.slots, keep) : m.slots;
		applyDress(m, { ...d, slots }); // keeps items added since and never revives removed ones
		// An item deleted since (another tab) is dropped rather than worn as a dangling id.
		return {
			items: Object.fromEntries(
				Object.entries(current.items).filter(
					([, it]) => it == null || m.items.some((i) => i.id === it)
				)
			),
			variants: { ...current.variants }
		};
	} catch {
		return null;
	}
}

/** Blocks that unfinished generation work causes, which openPendingWork can show. */
const WORK_BLOCKS = new Set([
	'state.finishBeforeCharacterRemoval',
	'state.finishBeforeMoveRemoval',
	'state.finishBeforeDirectionRemoval',
	'directionsSheet.waitForGeneration',
	'directionsSheet.resolveDrafts',
	'moveRemoval.resolveDrafts',
	'state.finishBeforeFrameChange',
	'adjustFrame.errors.resolveDrafts',
	'state.finishBeforeMoveImport',
	'moveImport.errors.resolveDrafts'
]);
export const blockedByWork = (reason: LocalizedError | '') =>
	!!reason && WORK_BLOCKS.has(reason.translation.key);
const DELETE_GENERATION_BLOCK = new LocalizedError(
	'Finish or dismiss pending generation work before deleting a character.',
	'state.finishBeforeCharacterRemoval'
);

let characterJobsPending = $state(false),
	characterJobsInOtherTab = $state(false);

/** Running work can write to any character, so it holds them all. Stopped work waits for the user and holds only its own
 *  character: a failed move or setup must not lock every other character until it is found and dismissed. */
/** `stoppedMove`: Frame size chosen from this character's stopped move review, which waits for the resize and continues on
 *  it; any other held or queued work still holds. */
function workHolds(id: string, stoppedMove = false) {
	return (
		characterJobsPending ||
		moveReviewPublishing ||
		gens.some((g) => g.phase === 'running') ||
		settling.size > 0 ||
		creates.some(
			(run) => !run.projectId && (run.running || !run.error || run.spec.projectId === id)
		) ||
		(heldMove() &&
			(moveRunning ||
				moving.resolvingRepair ||
				(!moving.error && !moving.repairReview) ||
				(moving.projectId === id && !(stoppedMove && !moving.repairReview)))) ||
		moving.queued.some((queued) => queued.projectId === id) ||
		(moving.queued.length > 0 && !heldMove()) ||
		(heldSetup() && (!settingUp.error || settingUp.spec?.projectId === id))
	);
}
/** Deleting a project never cancels paid jobs or removes shared cell blobs. */
function characterEditBlocked(
	action:
		| 'delete'
		| 'delete move'
		| 'change directions for'
		| 'fix frames of'
		| 'change the frame of'
		| 'import moves into',
	id: string,
	stoppedMove = false
): LocalizedError | '' {
	if (doc.loading || opening)
		return new LocalizedError(
			'Wait for the character to finish loading.',
			'state.waitForCharacter'
		);
	if (characterJobsInOtherTab)
		return action === 'delete move'
			? new LocalizedError(
					'Manage moves in the other PixelDoll tab, or close it first.',
					'state.manageMovesInOtherTab'
				)
			: new LocalizedError(
					'Manage characters in the other PixelDoll tab, or close it first.',
					'state.manageCharactersInOtherTab'
				);
	if (workHolds(id, stoppedMove))
		return action === 'delete'
			? DELETE_GENERATION_BLOCK
			: action === 'delete move'
				? new LocalizedError(
						'Finish or dismiss pending generation work before deleting a move.',
						'state.finishBeforeMoveRemoval'
					)
				: action === 'fix frames of'
					? new LocalizedError(
							'Wait for the current generation work to finish before fixing frames.',
							'state.finishBeforeFixFrames'
						)
					: action === 'change the frame of'
						? new LocalizedError(
								'Finish or dismiss pending generation work before adjusting the frame.',
								'state.finishBeforeFrameChange'
							)
						: action === 'import moves into'
							? new LocalizedError(
									'Finish or dismiss pending generation work before importing moves.',
									'state.finishBeforeMoveImport'
								)
							: new LocalizedError(
									'Finish or dismiss pending generation work before changing directions.',
									'state.finishBeforeDirectionRemoval'
								);
	return '';
}

export function deletionBlocked(
	id = doc.id,
	kind: 'character' | 'move' = 'character'
): LocalizedError | '' {
	return id.startsWith('fixture:')
		? new LocalizedError('The bundled demo cannot be deleted.', 'deleteSheet.demo')
		: characterEditBlocked(kind === 'character' ? 'delete' : 'delete move', id);
}

export function directionEditsBlocked(id: string): LocalizedError | '' {
	if (!id.startsWith('rig-'))
		return new LocalizedError('Only saved characters can be edited.', 'directionsSheet.savedOnly');
	return (
		characterEditBlocked('change directions for', id) ||
		(!generationSettled()
			? new LocalizedError(
					'Wait for the current generation work to finish.',
					'directionsSheet.waitForGeneration'
				)
			: '') ||
		(gens.some((gen) => gen.draft.rigId === id && !gen.draft.acceptedAt)
			? new LocalizedError(
					'Keep or dismiss this character’s item drafts before changing directions.',
					'directionsSheet.resolveDrafts'
				)
			: '')
	);
}
/** Why Frame size cannot change this character now, or ''. A stopped move of this character may wait for it (`stoppedMove`). */
export function frameEditsBlocked(id: string, stoppedMove = false): LocalizedError | '' {
	if (!id.startsWith('rig-'))
		return new LocalizedError('Only saved characters can be edited.', 'directionsSheet.savedOnly');
	return (
		characterEditBlocked('change the frame of', id, stoppedMove) ||
		(!generationSettled()
			? new LocalizedError(
					'Wait for the current generation work to finish.',
					'directionsSheet.waitForGeneration'
				)
			: '') ||
		(gens.some((gen) => gen.draft.rigId === id && !gen.draft.acceptedAt)
			? new LocalizedError(
					'Keep or dismiss this character’s item drafts before adjusting the frame.',
					'adjustFrame.errors.resolveDrafts'
				)
			: '') ||
		(doc.id === id ? moveReviewHold(store.moveReviews) : '')
	);
}
/** A staged move review was drawn on the current frame: a resize or move would change every direction under it, so it is
 *  saved or discarded first instead of being left behind with frames that no longer fit. */
function moveReviewHold(reviews: StoredProject['moveReviews']): LocalizedError | '' {
	return Object.keys(reviews ?? {}).length
		? new LocalizedError(
				'Save or discard the move waiting for review before adjusting the frame.',
				'adjustFrame.errors.reviewOpen'
			)
		: '';
}
/** Adjust frame: move the whole character up or down and change its frame (free and lossless), as one history step that
 *  its notice's Undo also reverses. `stoppedMove`: chosen from this character's stopped move review, which continues on the
 *  result. */
export async function adjustCharacter(
	id: string,
	change: FrameChange,
	{
		stoppedMove = false,
		quiet = false,
		expect
	}: { stoppedMove?: boolean; quiet?: boolean; expect?: StoredProject } = {}
): Promise<void> {
	const blocked = () => {
		const reason = frameEditsBlocked(id, stoppedMove);
		if (reason) throw reason;
	};
	blocked();
	await flushSave();
	const { rec, project } = await loadProject(id);
	if (expect && stableStringify(expect) !== stableStringify(rec))
		throw new LocalizedError(
			'This character changed. Reopen Adjust frame to review the latest version.',
			'adjustFrame.errors.changed'
		);
	const reviewing = moveReviewHold(rec.moveReviews);
	if (reviewing) throw reviewing;
	if (Object.keys(rec.appearanceEdits ?? {}).length) throw appearanceReviewHold();
	if (stateAttempts(rec).length)
		throw new LocalizedError(
			'Save or discard the pending State before adjusting the frame.',
			'adjustFrame.errors.statePending'
		);
	const before = rec.manifest.rig.cell.w;
	const { record: next, newImages } = await reframeCharacter(
		rec,
		project.images,
		change,
		readStoredImage
	);
	const blobs = await pngBlobs(newImages);
	const step = await prepareArtworkStep(
		{
			projectId: id,
			label: message('adjustFrame.title'),
			before: rec,
			after: next,
			action: 'change the frame of'
		},
		blobs
	);
	blocked();
	await db.saveIdleCharacter(rec, next, blobs, 'change the frame of', stoppedMove);
	recordArtworkStep(id, step);
	await refreshCharacterDirections(id);
	// Without a step, its notice already said the change was saved but cannot be undone.
	if (quiet || !step) return;
	toast(
		[
			message('adjustFrame.saved', { change: frameChangeText(before, change) }),
			message('common.undo')
		],
		{ tone: 'success', duration: 10000, action: () => void undoStep(id, step) }
	);
}
/** Make room for moves (lib/rig/reframe.ts makeRoom) and save it like Adjust frame; says why when nothing can or need change. */
export async function makeRoomFor(id: string): Promise<void> {
	await flushSave();
	const { rec, project } = await loadProject(id);
	const plan = makeRoom(await frameFacts(rec, project.images, readStoredImage));
	if (plan.limit)
		throw new LocalizedError(
			`Even a ${plan.size} px frame cannot give this character room for moves.`,
			'adjustFrame.errors.limit',
			{ size: plan.size }
		);
	if (plan.size === rec.manifest.rig.cell.w && !plan.dy)
		throw new LocalizedError('This character already has room for moves.', 'adjustFrame.roomy');
	await adjustCharacter(id, plan);
}
/** Why moves cannot be imported into this character now, or ''. */
export function moveImportBlocked(id: string): LocalizedError | '' {
	if (!id.startsWith('rig-'))
		return new LocalizedError('Only saved characters can be edited.', 'directionsSheet.savedOnly');
	return (
		characterEditBlocked('import moves into', id) ||
		(!generationSettled()
			? new LocalizedError(
					'Wait for the current generation work to finish.',
					'directionsSheet.waitForGeneration'
				)
			: '') ||
		(gens.some((gen) => gen.draft.rigId === id && !gen.draft.acceptedAt)
			? new LocalizedError(
					'Keep or dismiss this character’s item drafts before importing moves.',
					'moveImport.errors.resolveDrafts'
				)
			: '')
	);
}
/** Import moves and States from a reviewed ZIP plan (lib/rig/moveImport.ts), free, onto the version the review showed. */
export async function importMoves(
	id: string,
	plan: MoveImportPlan,
	ids: readonly string[],
	expect: StoredProject
): Promise<{ id: string; kind: 'move' | 'state' }[]> {
	const blocked = () => {
		const reason = moveImportBlocked(id);
		if (reason) throw reason;
	};
	blocked();
	await flushSave();
	const { rec, project } = await loadProject(id);
	if (Object.keys(rec.appearanceEdits ?? {}).length) throw appearanceReviewHold();
	if (stableStringify(expect) !== stableStringify(rec))
		throw new LocalizedError(
			'This character changed. Choose the ZIP again to review the latest version.',
			'moveImport.errors.changed'
		);
	const { applyMoveImport } = await lazy(() => import('../lib/rig/moveImport.ts'));
	const { record, images, added } = await applyMoveImport(
		{ record: rec, images: project.images },
		plan,
		ids
	);
	const blobs = await pngBlobs(images);
	blocked();
	await db.saveIdleCharacter(
		rec,
		{ ...rec, ...record, savedAt: new Date().toISOString() },
		blobs,
		'import moves into'
	);
	notifyLibraryChanged(id);
	await refreshCharacterDirections(id);
	return added;
}
function generationSettled() {
	return !afterConnect && activeGenerationSettled();
}
function activeGenerationSettled() {
	return (
		!gens.some((g) => g.phase === 'running') &&
		!settling.size &&
		!createRestoring &&
		!creates.some((run) => run.running) &&
		!moveRunning &&
		!moveReviewPublishing &&
		!setupRunning &&
		!takeOverRunning &&
		!itemStarting &&
		!runningGens.size
	);
}
export function generationPending() {
	return characterJobsPending || !activeGenerationSettled();
}
const heldCreate = () => creates.some((run) => !run.projectId);
const heldMove = () => moving.spec && !moving.done;
const heldSetup = () => settingUp.spec && !settingUp.done;
/** Failed flows hold queue leadership so a waiting action in another tab cannot replace them. */
function workIdle() {
	return (
		queue.idle() &&
		generationSettled() &&
		!heldCreate() &&
		!heldMove() &&
		!moving.queued.length &&
		!setupRecovering &&
		!heldSetup()
	);
}
queue.canYield = workIdle;

/** Why an update cannot reload this tab now, with English for logs and a translation for display. An idle queue alone
 *  says nothing about unsaved forms or local writes. */
function updateBlocker(allowAbout?: () => boolean): LocalizedError | undefined {
	if (studioStartup === 'failed')
		return new LocalizedError(
			'PixelDoll could not finish loading your saved work.',
			'state.update.loadFailed'
		);
	if (studioStartup === 'loading' || doc.loading)
		return new LocalizedError(
			'Wait for your character and saved work to finish loading.',
			'state.update.loading'
		);
	// Standalone About has no editable form. Export and a suspended creator still own their work.
	if (
		ui.sheetBusy ||
		ui.settingsOverlay ||
		(ui.sheet && !(allowAbout?.() && ui.sheet === 'settings' && !canReturnToCreator()))
	)
		return new LocalizedError(
			'Finish and close the open panel before updating.',
			'state.update.openPanel'
		);
	if (document.querySelector('[data-update-draft]'))
		return new LocalizedError(
			'Save or cancel your outfit name before updating.',
			'state.update.outfitName'
		);
	if (!queue.idle() || ui.waitingForTab)
		return new LocalizedError(
			'Finish or dismiss pending generation work in Activity before updating.',
			'state.update.activity'
		);
	if (
		!generationSettled() ||
		creates.some((run) => !run.projectId && !run.error) ||
		(heldMove() && !moving.error && !moving.repairReview) ||
		moving.resolvingRepair ||
		(moving.queued.length && !heldMove()) ||
		(heldSetup() && !settingUp.error)
	)
		return new LocalizedError(
			'Wait for PixelDoll to finish processing your generation work, then try updating again.',
			'state.update.processing'
		);
}
export function updateBlocked(allowAbout?: () => boolean): Message | '' {
	return updateBlocker(allowAbout)?.translation ?? '';
}

/** A halted flow can survive a reload only if the current failure and any queued moves actually reached storage. */
async function verifyHaltedFlows() {
	const snapshots = () =>
		[
			...creates.map((run) => ({
				key: createDraftKey(run.id),
				held: !run.projectId,
				flow: run,
				fallback: STOPPED
			})),
			{ key: MOVE_KEY, held: heldMove(), flow: moving, fallback: STOPPED },
			{ key: SETUP_KEY, held: heldSetup(), flow: settingUp, fallback: SETUP_STOPPED }
		]
			.filter(({ held }) => held)
			.map(({ key, flow, fallback }) => ({
				key,
				fallback,
				value: stableStringify({
					spec: flow.spec,
					progress: flow.progress,
					error:
						key === MOVE_KEY && moving.repairReview
							? ''
							: flow.error
								? errorText(flow.error)
								: flow.error,
					...(key === MOVE_KEY
						? {
								projectId: moving.projectId,
								queued: moving.queued,
								repairReview: !!moving.repairReview
							}
						: {})
				})
			}));
	const before = snapshots();
	if (!before.length) return;
	const verified = await Promise.all(
		before.map(async ({ key, value, fallback }) => {
			const record = await db.get<
				FlowDraft<unknown> & {
					projectId?: string;
					queued?: QueuedMove[];
					repairReview?: RepairReview;
				}
			>('projects', key);
			return (
				record?.spec &&
				halted(record) &&
				value ===
					stableStringify({
						spec: record.spec,
						progress: record.progress ?? null,
						error: record.error || (record.status === 'review' ? '' : fallback),
						...(key === MOVE_KEY
							? {
									projectId: record.projectId,
									queued: record.queued ?? [],
									repairReview: !!record.repairReview
								}
							: {})
					})
			);
		})
	).catch(() => [false]);
	if (!verified.every(Boolean) || stableStringify(before) !== stableStringify(snapshots())) {
		throw new LocalizedError(
			'PixelDoll could not confirm that your interrupted generation work was saved. Review it in the character, Moves, or Setup panel before updating.',
			'state.pixelDollCouldNotConfirmThatYourInterrupted'
		);
	}
}
export async function prepareForUpdate(allowAbout?: () => boolean): Promise<void> {
	const blocker = updateBlocker(allowAbout);
	if (blocker) throw blocker;
	// Retry a previously failed outfit save, rather than trusting flushSave(), which reports errors in a toast.
	if (edits !== savedEdits && !pendingSave) save();
	await flushSave();
	if (edits !== savedEdits)
		throw new LocalizedError(
			'Your outfit could not be saved. Resolve the storage error before updating.',
			'state.yourOutfitCouldNotBeSavedResolve'
		);
	await verifyHaltedFlows();
	const changed = updateBlocker(allowAbout);
	if (changed) throw changed;
}

/** Why this tab cannot delete its local work now: generation work here could write deleted work back. Other tabs and
 *  saved jobs are checked when the deletion runs. */
export function localWorkDeletionBlocked(): LocalizedError | '' {
	if (studioStartup !== 'ready' || doc.loading)
		return new LocalizedError(
			'Wait for your character and saved work to finish loading.',
			'state.update.loading'
		);
	return !workIdle() || ui.waitingForTab || moving.resolvingRepair
		? new LocalizedError(
				'Finish or dismiss pending generation work before deleting local work. Nothing was deleted.',
				'librarySettings.deleteWork.generating'
			)
		: '';
}

/** Delete this device's local work (deleteLocalWork), then reload: nothing in this tab's memory may be saved back. */
export async function deleteLocalWorkAndReload(): Promise<void> {
	const blocked = () => {
		const reason = localWorkDeletionBlocked();
		if (reason) throw reason;
	};
	blocked();
	// A refused deletion keeps everything, including the outfit: save it now rather than drop it. A save that still fails
	// is kept in memory to retry, as before.
	if (edits !== savedEdits && !pendingSave) save();
	await flushSave();
	blocked();
	await deleteLocalWork();
	await clearDebugLog().catch((error: unknown) => console.warn('clear debug log', error));
	// Stop resumes and unload snapshots: the deleted work must not come back from this tab's memory.
	hmrReloading = true;
	clearTimeout(saveT);
	pendingSave = null;
	savedEdits = edits;
	try {
		for (const key of Object.keys(localStorage))
			if (key.startsWith(UNSAVED)) localStorage.removeItem(key);
		localStorage.removeItem(K.last);
	} catch {
		/* storage blocked: the next listing drops snapshots of deleted characters */
	}
	queue.disconnect();
	location.reload();
}

/** Other tabs hear about a deletion or restore here: a broadcast is only a hint to re-read, the write itself decides.
 *  `projectId` names a character whose record changed, so a tab showing it refreshes instead of saving a stale copy. */
function notifyLibraryChanged(projectId?: string) {
	identityChannel?.postMessage({ libraryChanged: true, projectId });
}

/** Read Recently deleted again, oldest entries past the cap or the 30 days removed. */
export async function refreshRecentlyDeleted(): Promise<void> {
	try {
		const values = await db.all<unknown>('projects');
		const stale = pruneKeys(values, Date.now(), 0);
		// Pruning is permanent too: forget the pose of every entry that leaves.
		for (const value of values)
			if (stale.includes((value as { id?: string })?.id ?? '')) {
				const gone = readEntry(value);
				if (gone) forgetPose(gone);
			}
		dropTrashSteps(stale);
		await Promise.all(stale.map((key) => db.del('projects', key)));
		deleted.entries = listEntries(
			values.filter((value) => !stale.includes((value as { id?: string })?.id ?? '')),
			Date.now()
		);
		deleted.ready = true;
		deleted.loadFailed = false;
	} catch (error) {
		// Never show an empty list for a failed read: that reads as "nothing can be restored".
		console.error('recently deleted', error);
		deleted.loadFailed = true;
	}
}

/** Put back exactly what one entry removed. A character comes back under its own key, or as a copy when that key is taken.
 *  A reopened character is refreshed quietly, so the history behind this step stays usable. */
/** Drop recovery steps that name entries which no longer exist: a restore through the toast or Trash, or a permanent delete. */
function dropTrashSteps(keys: Iterable<string>) {
	const gone = new Set(keys);
	for (const history of [doc, ...histories.values()]) {
		history.undo = history.undo.filter((step) => !step.trash || !gone.has(step.trash));
		history.redo = history.redo.filter((step) => !step.trash || !gone.has(step.trash));
	}
}

async function restoreDeletedEntry(id: string): Promise<boolean> {
	try {
		const entry =
			deleted.entries.find((e) => e.id === id) ?? (await readDeleted()).find((e) => e.id === id);
		if (!entry)
			throw new LocalizedError(
				'That deleted item is no longer available.',
				'recentlyDeleted.errors.gone'
			);
		// The live outfit and slot edits are newer than the record: save them before the restore reads and writes it.
		await flushSave();
		if (entry.kind !== 'character') {
			// A child entry needs its character: say so by name when that character is waiting in the list.
			const live = await db.get<StoredProject>('projects', entry.projectId).catch(() => undefined);
			if (!live?.manifest) {
				const parent = (await readDeleted()).find(
					(e) => e.kind === 'character' && e.lineageId === entry.lineageId
				);
				throw parent
					? new LocalizedError(
							'That deleted item belongs to a character. Restore the character first.',
							'recentlyDeleted.errors.wrongKind'
						)
					: new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
			}
		}
		if (entry.kind === 'move') {
			// The same work that blocks deleting a move can overwrite it while a restore lands.
			const blocked = deletionBlocked(entry.projectId, 'move');
			if (blocked) throw blocked;
			if (gens.some((g) => g.draft.rigId === entry.projectId && !g.draft.acceptedAt))
				throw new LocalizedError(
					'Finish or discard this character’s item drafts before restoring a move.',
					'moveRemoval.resolveDrafts'
				);
			const out = await restoreMoveEntry(id);
			await refreshRecentlyDeleted();
			notifyLibraryChanged(out.projectId);
			if (doc.id === out.projectId) await openProject(out.projectId, { quiet: true });
			toast(message('recentlyDeleted.restored', { name: out.name }), { tone: 'success' });
			return true;
		}
		if (entry.kind !== 'character') {
			const out = await restoreParts(id);
			await refreshRecentlyDeleted();
			notifyLibraryChanged(out.projectId);
			if (doc.id === out.projectId) {
				await openProject(out.projectId, { quiet: true });
				// A quiet open keeps the live outfit: wear what the restore put back, where nothing newer holds the slot.
				let changed = false;
				for (const { slot, item } of out.worn)
					if (!doc.items[slot]) {
						doc.items[slot] = item;
						delete doc.drafts[slot];
						changed = true;
					}
				if (changed) {
					bump();
					save();
				}
			}
			toast(
				message(out.skipped ? 'recentlyDeleted.restoredPartly' : 'recentlyDeleted.restored', {
					name: out.name,
					count: out.skipped
				}),
				{ tone: 'success' }
			);
			return true;
		}
		const out = await restoreCharacter(id, {
			copyName: (name) => displayMessage(message('librarySettings.restoredName', { name }))
		});
		await refreshProjects();
		await refreshRecentlyDeleted();
		notifyLibraryChanged(out.id);
		// Restored drafts are in the record; the list this tab would save next must know about them, or the next draft
		// change writes the whole list back without them.
		if (out.drafts) {
			// Keep the live objects for drafts already here: a running attempt must not be replaced under its own run.
			const live = new Map(gens.map((g) => [g.draft.spec.id, g]));
			setGens((await readGens()).map((g) => live.get(g.draft.spec.id) ?? g));
		}
		toast(
			message(
				out.copied
					? 'recentlyDeleted.restoredAsCopy'
					: out.drafts
						? 'recentlyDeleted.restoredWithDrafts'
						: 'recentlyDeleted.restored',
				{ name: out.name, count: out.drafts }
			),
			{ tone: 'success' }
		);
		return true;
	} catch (error) {
		toast(errorTranslation(error) ?? errorMessage(error), { tone: 'danger', error });
		return false;
	}
}

/** Delete one entry for good. Its artwork goes with it when the queue is idle, which is when a sweep is safe. */
/** Keys a new entry pushes out, forgetting their riding poses first: these entries are removed by the delete's own transaction. */
export async function keysToPruneAndForget(): Promise<string[]> {
	const values = await db.all<unknown>('projects');
	const keys = pruneKeys(values);
	const gone = new Set(keys);
	for (const value of values) {
		if (!gone.has((value as { id?: string })?.id ?? '')) continue;
		const entry = readEntry(value);
		if (entry) forgetPose(entry);
	}
	return keys;
}

export async function restoreDeleted(id: string): Promise<boolean> {
	const restored = await restoreDeletedEntry(id);
	if (restored) dropTrashSteps([id]);
	return restored;
}

export async function deleteDeletedForever(id: string): Promise<void> {
	// Forgetting the riding pose belongs here, not on the recoverable delete: a restore keeps it, a permanent one does not.
	const entry = readEntry(await db.get<unknown>('projects', id).catch(() => undefined));
	if (entry) forgetPose(entry);
	await discardDeleted(id);
	dropTrashSteps([id]);
	await refreshRecentlyDeleted();
	notifyLibraryChanged(id);
	void cleanUp(0, true).catch((error) => console.error('cleanup after delete forever', error));
}

/** Drop the Riding pose and Live Views choices a permanently deleted thing held: a character's, or a clip's own. */
function forgetPose(entry: RecentlyDeleted) {
	if (entry.kind === 'character') {
		forgetRidingPose(entry.projectId);
		forgetLiveChoices(entry.projectId);
	} else if (entry.scope.moveId) {
		forgetRidingPose(entry.projectId, entry.scope.moveId);
		forgetLiveChoices(entry.projectId, entry.scope.moveId);
	}
}

export async function removeProject(id = doc.id): Promise<void> {
	const reason = deletionBlocked(id);
	if (reason) throw reason;
	const request = openRequest,
		name =
			(id === doc.id ? store.project?.manifest.name : undefined) ??
			store.projects.find((p) => p.id === id)?.name ??
			'Character';
	await flushSave();
	// Entries this deletion pushes past the cap go in its own transaction, so the list never outgrows it.
	const prune = await keysToPruneAndForget();
	let kept: RecentlyDeleted | undefined;
	try {
		kept = await db.deleteCharacter<RecentlyDeleted>(id, (record, drafts) => {
			if (Object.keys(record.appearanceEdits ?? {}).length) throw appearanceReviewHold();
			const entry = deletedEntry({
				kind: 'character',
				record,
				name: record.manifest.name || name,
				context: '',
				scope: {},
				drafts
			});
			return { key: entry.id, entry, prune };
		});
	} catch (error) {
		if ((error as DOMException)?.name === 'QuotaExceededError') throw quotaError();
		throw error;
	}
	const deletedDrafts = new Set(
		gens.filter((g) => g.draft.rigId === id).map((g) => g.draft.spec.id)
	);
	setGens(gens.filter((g) => g.draft.rigId !== id));
	store.results = Object.fromEntries(
		Object.entries(store.results).filter(([draftId]) => !deletedDrafts.has(draftId))
	);
	const attempt = creates.find((run) => run.projectId === id);
	if (attempt) removeCreate(attempt);
	if (moving.projectId === id) await dismissMove();
	await refreshProjects();
	await refreshRecentlyDeleted();
	if (doc.id === id && request === openRequest) {
		lsSet(K.last, null);
		await openProject(store.projects.find((p) => !p.demo && !p.dev)?.id ?? DEMO);
	}
	notifyLibraryChanged(id);
	if (!kept) toast(message('state.deletedNameFromThisDevice', { name }));
	else
		toast(message('state.deletedNameFromThisDevice', { name: kept.name }), {
			duration: 10000,
			actionLabel: message('common.undo'),
			action: () => void restoreDeleted(kept!.id)
		});
}

// ---- edits ----
const itemById = (id: string) => store.project?.manifest.items.find((i) => i.id === id);
/** Put an item on or take it off. Returns what came off with it (a two-handed item), shown unless `quiet`. */
/** Preview shows the standing move, where items are made first (a character without one keeps its move). */
export function showStanding() {
	if (!store.project?.manifest.rig.animations.some((move) => move.id === DEFAULT_MOVE)) return;
	ui.anim = DEFAULT_MOVE;
	ui.frame = 0;
}
export function wear(id: string, quiet = false): Message | undefined {
	const it = itemById(id);
	if (!it) return;
	const on = doc.items[it.slot] === id && !doc.drafts[it.slot];
	const hadDraft = !!doc.drafts[it.slot];
	delete doc.drafts[it.slot]; // a saved item put on or taken off replaces the draft worn in its slot
	ui.selected = id;
	// Put on while Preview shows a move it has no frames for: it would be worn and invisible, so Preview shows one that has
	// them (the Wear row of the tile's menu names it).
	const m = store.project?.manifest,
		shown = !on && m && experience.mode === 'preview' ? wearClip(m, it, ui.anim) : undefined;
	if (shown) {
		ui.anim = shown;
		ui.frame = 0;
		// It may be drawn in only some views there: face one that shows it.
		if (missingFrames(m!, it, shown, ui.dir).length) {
			const facing = m!.rig.directions.find((d) => !missingFrames(m!, it, shown, d.id).length);
			if (facing) ui.dir = facing.id;
		}
	}
	const changed = doc.items[it.slot] !== (on ? null : id);
	const note = changed
		? commit(
				message(on ? 'history.takeOffItem' : 'history.wear', { name: it.name }),
				() => {
					doc.items[it.slot] = on ? null : id;
				},
				{ quiet }
			)
		: undefined;
	if (!quiet && (changed || hadDraft)) playAudioCue(on ? 'unequip' : 'equip');
	return note;
}
export function clearSlots(slots: string[]) {
	const hadDraft = slots.some((s) => doc.drafts[s]);
	for (const s of slots) delete doc.drafts[s];
	const hadItem = slots.some((s) => doc.items[s]);
	if (hadItem)
		commit(message('history.takeOff'), () => {
			for (const s of slots) doc.items[s] = null;
		});
	if (hadItem || hadDraft) playAudioCue('unequip');
}
export function setVariant(matId: string, name: string | null) {
	const changed = (doc.variants[matId] ?? null) !== name;
	commit(message('history.changeColor'), () => {
		if (name == null) delete doc.variants[matId];
		else doc.variants[matId] = name;
	});
	if (changed && store.project) playAudioCue('recolor');
}
const PREVIEW_MS = 33;
let previewTimer: ReturnType<typeof setTimeout> | undefined,
	pendingPreview: { id: string; value: string } | null = null;
/** Show a color from the picker while it is still being chosen: no undo entry and no save until the picker closes. Dragging
 *  emits far more events than a repaint needs, so at most one preview lands per PREVIEW_MS. */
export function previewVariant(matId: string, value: string) {
	pendingPreview = { id: matId, value };
	previewTimer ??= setTimeout(() => {
		previewTimer = undefined;
		doc.colorPreview = pendingPreview;
	}, PREVIEW_MS);
}
/** Drop the live color preview: the picker closed, was cancelled, or its palette is gone. */
export function clearVariantPreview() {
	clearTimeout(previewTimer);
	previewTimer = undefined;
	pendingPreview = null;
	doc.colorPreview = null;
}
export function resetColors(matIds?: string[], label = message('history.resetColors')) {
	const ids = matIds ?? Object.keys(doc.variants);
	const changed = ids.some((id) => Object.hasOwn(doc.variants, id));
	commit(label, () => {
		for (const k of ids) delete doc.variants[k];
	});
	if (changed && store.project) playAudioCue('recolor');
}
/** Items a category's Random can switch to: every item of the category except the one worn now. */
export function groupRandomChoices(groupId: string) {
	const m = store.project?.manifest;
	if (!m) return [];
	const items = m.items.filter((i) => i.slot === groupId),
		others = items.filter((i) => doc.items[i.slot] !== i.id);
	if (others.length) return others;
	// Nothing else to switch to: the worn item stays and only its colors re-roll (when it has any).
	return items.filter((i) => m.materials.some((x) => x.owner === i.id));
}
/** Category Random: a different item of that category, worn in its own slot, with new colors; when the worn item is the
 *  only one, just its colors re-roll. One undo step. */
export function randomizeGroup(groupId: string) {
	const m = store.project?.manifest,
		choices = groupRandomChoices(groupId);
	if (!m || !choices.length) return;
	const it = choices[Math.floor(Math.random() * choices.length)];
	const wearing = doc.items[it.slot] !== it.id;
	const variants = randomVariants(
		m,
		m.materials.filter((x) => x.owner === it.id),
		Math.random,
		1,
		doc.variants
	);
	const recolored = Object.entries(variants).some(([id, color]) => doc.variants[id] !== color);
	commit(message('history.randomItem', { name: slotLabel(m, groupId).toLowerCase() }), () => {
		doc.items[it.slot] = it.id;
		Object.assign(doc.variants, variants);
	});
	ui.selected = it.id;
	if (wearing || recolored) playAudioCue('recolor');
}
/** Colors-only Random for the given item ids (the character or one worn item). Never changes what is worn. */
export function randomizeColors(owners: string[], label: Message) {
	const m = store.project?.manifest;
	if (!m) return;
	const variants = randomVariants(
		m,
		m.materials.filter((x) => owners.includes(x.owner)),
		Math.random,
		1,
		doc.variants
	);
	const changed = Object.entries(variants).some(([id, color]) => doc.variants[id] !== color);
	commit(label, () => Object.assign(doc.variants, variants));
	if (changed) playAudioCue('recolor');
}
/** The open character's name as people see it (the demo without its "(demo)" suffix). */
export function characterName() {
	return (
		store.projects.find((p) => p.id === doc.id)?.name.replace(/ \(demo\)$/, '') ??
		store.project?.manifest.name ??
		'Character'
	);
}
export function randomize() {
	const manifest = store.project?.manifest;
	if (!manifest) return;
	const r = randomOutfit(manifest);
	commit(
		message('common.randomLook'),
		() => {
			doc.items = { ...r.items, body: manifest.rig.baseItem };
			doc.variants = r.variants;
		},
		{ keepHand: 'main_hand', quiet: true }
	);
	playAudioCue('recolor');
}
export function applyPreset(p: Preset) {
	commit(
		message('history.wear', { name: p.name }),
		() => {
			doc.items = { ...p.items };
			doc.variants = { ...p.variants };
		},
		{ keepHand: 'main_hand', quiet: true }
	);
	if (store.project?.manifest.rig.animations.some((move) => move.id === DEFAULT_MOVE)) {
		ui.anim = DEFAULT_MOVE;
		ui.frame = 0;
	}
}
export function savePreset(name: string) {
	const m = store.project!.manifest;
	// Never replaces a saved outfit (a repeated or non-Latin name, a default name after a deletion); 'current' is the export's live look.
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'outfit';
	let id = base;
	for (let n = 2; id === CURRENT_OUTFIT_ID || m.presets.some((p) => p.id === id); n++)
		id = `${base}-${n}`;
	commit(message('history.saveOutfit'), () => {
		const pr: Preset = {
			id,
			name,
			items: $state.snapshot(doc.items),
			variants: $state.snapshot(doc.variants)
		};
		m.presets = [...m.presets, pr];
	});
}
export function deletePreset(id: string) {
	const m = store.project!.manifest;
	commit(message('history.deleteOutfit'), () => {
		m.presets = m.presets.filter((p) => p.id !== id);
	});
}
export const sameOutfit = (p: Preset) => {
	// an outfit saved before one of its hand items became two-handed is worn with the Main hand kept
	const items = store.project ? settleHands(store.project.manifest, p.items).items : p.items;
	return (
		Object.keys({ ...items, ...doc.items }).every(
			(k) => (items[k] ?? null) === (doc.items[k] ?? null) || k === 'body'
		) &&
		JSON.stringify(Object.entries(p.variants).sort()) ===
			JSON.stringify(Object.entries($state.snapshot(doc.variants)).sort())
	);
};

export function toggleHide(itemId: string, slot: string) {
	const m = store.project!.manifest,
		it = itemById(itemId)!;
	const cur = hideTargets(m, it),
		shows = hidesOf(m, it).includes(slot);
	commit(
		message(shows ? 'history.show' : 'history.hide', { name: slotLabel(m, slot) }),
		() => {
			it.hides = shows ? withoutHide(m, it, slot) : [...cur, slot];
		},
		{ keepHand: it.slot }
	);
}

const hideTargets = (m: Manifest, it: Item) =>
	it.hides ?? m.slots.find((s) => s.id === it.slot)?.hides ?? [];

const withoutHide = (m: Manifest, it: Item, slot: string) =>
	hideTargets(m, it).filter((target) => !handHides(m, it.slot, [target]).includes(slot));

export function itemHiders(slot: string) {
	const m = store.project!.manifest;
	const worn = equipped(m, doc.items);
	if (!hiddenSlots(m, worn).has(slot)) return [];
	const candidates = worn.filter((it) => it.slot !== slot && hidesOf(m, it).includes(slot));
	if (candidates.length < 2) return candidates;
	// Test each rule in the same outfit with the other rules for this slot set aside.
	return candidates.filter((hider) =>
		hiddenSlots(
			m,
			worn.map((it) =>
				it !== hider && candidates.includes(it) ? { ...it, hides: withoutHide(m, it, slot) } : it
			)
		).has(slot)
	);
}

export function showHiddenItem(slot: string) {
	const m = store.project!.manifest;
	const hiders = itemHiders(slot);
	if (!hiders.length) return;
	commit(message('history.show', { name: slotLabel(m, slot) }), () => {
		for (const it of hiders) it.hides = withoutHide(m, it, slot);
	});
}
/** The other hand a held slot conflicts with, as the canonical target its hides name: custom held slots on that side follow
 *  it (runtime handHides). */
export const otherHandOf = (m: Manifest, slot: string) => {
	const side = handSide(m, slot);
	return side === 'left' ? 'main_hand' : side === 'right' ? 'off_hand' : undefined;
};
/** A two-handed item takes both hands: it hides the other hand while worn (the same rule as a hood hiding hair). Turning it
 *  off removes every other-hand target, so no custom held slot stays hidden. */
export function toggleTwoHanded(itemId: string) {
	const m = store.project!.manifest,
		it = itemById(itemId),
		target = it && otherHandOf(m, it.slot);
	if (!it || !target) return;
	const both = twoHanded(m, it),
		cur = it.hides ?? m.slots.find((s) => s.id === it.slot)?.hides ?? [],
		others = new Set([target, ...oppositeHands(m, it.slot)]);
	commit(
		message(both ? 'history.oneHanded' : 'itemMenu.twoHanded'),
		() => {
			it.hides = both
				? cur.filter((s) => !others.has(s))
				: [...cur.filter((s) => !others.has(s)), target];
		},
		{ keepHand: it.slot }
	);
}

/** The draw order of the current frame and the item's front layer in it. An item that is not worn is placed as if it
 *  were, so its order can be set before it is worn. An item hidden by another worn item is not drawn anywhere. */
function layerPlacement(itemId: string) {
	void doc.rev;
	const m = store.project!.manifest,
		it = itemById(itemId);
	if (!it) return null;
	const anim = m.rig.animations.find((x) => x.id === ui.anim);
	if (!anim?.frames.length) return null;
	const cell = anim.frames[ui.frame % anim.frames.length].cell;
	const order = drawList(m, { ...doc.items, [it.slot]: itemId }, ui.anim, ui.dir, cell);
	const i = order.findIndex((d) => d.item.slot === it.slot && d.layer.role === 'fg');
	return i < 0 ? null : { order, i };
}
/** The layers the item's front can cross in the current view. */
export function itemLayerNeighbors(itemId: string) {
	const place = layerPlacement(itemId);
	return {
		behind: place?.order[place.i - 1]?.item.name,
		ahead: place?.order[place.i + 1]?.item.name
	};
}
/** Move the item's front layer one step in the draw order of the current frame (all directions, or only the current one). */
export function moveLayer(itemId: string, step: 1 | -1, onlyDir: boolean) {
	const place = layerPlacement(itemId);
	if (!place) return;
	const { order, i } = place,
		j = i + step;
	if (j < 0 || j >= order.length) return;
	const { slot, layer, z } = order[i];
	// Move the front as a unit, including any finer overrides that take precedence over the base depth.
	const offset = order[j].z + step - z;
	const dir = onlyDir ? ui.dir : undefined;
	const overrides = slot.zOverrides ?? [];
	const isBase = (o: ZOverride) => o.layer === 'fg' && o.dir === dir && !o.anim && o.cell == null;
	const base =
		overrides.findLast(isBase)?.z ??
		overrides.findLast((o) => o.layer === 'fg' && !o.dir && !o.anim && o.cell == null)?.z ??
		layer.z;
	commit(message(step > 0 ? 'history.bringForward' : 'history.sendBackward'), () => {
		slot.zOverrides = [
			...overrides.flatMap((o, index) => {
				if (isBase(o)) return [];
				if (o.layer !== 'fg' || (dir && o.dir && o.dir !== dir)) return [o];
				const shifted = { ...o, z: o.z + offset };
				if (!dir || o.dir) return [shifted];
				const replaced = overrides.some(
					(next, i) =>
						i > index &&
						next.layer === o.layer &&
						next.dir === dir &&
						next.anim === o.anim &&
						next.cell === o.cell
				);
				return (!o.anim && o.cell == null) || replaced ? [o] : [o, { ...shifted, dir }];
			}),
			{ layer: 'fg', z: base + offset, ...(dir ? { dir } : {}) }
		];
	});
}
/** Restore the foreground ladder. Back layers have their own authored positions. */
export function resetLayer(itemId: string, ladder: ZOverride[]) {
	const m = store.project!.manifest,
		slot = m.slots.find((s) => s.id === itemById(itemId)!.slot)!;
	commit(message('history.resetLayerOrder'), () => {
		slot.zOverrides = [
			...(slot.zOverrides ?? []).filter((rule) => rule.layer !== 'fg'),
			...structuredClone(ladder)
		];
	});
}

let itemPaletteRefresh = 0;
/** Show what a free local edit just saved, keeping the open outfit and inspector selection. */
async function refreshSaved(projectId: string, request: number) {
	if (doc.id !== projectId || request !== openRequest) return;
	const refresh = ++itemPaletteRefresh;
	for (;;) {
		const revision = doc.rev,
			fresh = await loadProject(projectId);
		if (doc.id !== projectId || request !== openRequest || refresh !== itemPaletteRefresh) return;
		if (doc.rev !== revision) continue;
		store.project = fresh.project;
		store.exportRecord = fresh.rec;
		slotBase = { id: projectId, slots: structuredClone(fresh.project.manifest.slots) };
		doc.rev++;
		return;
	}
}

/** Save all changed facings together, leaving any untouched facings from other tabs alone. */
export async function saveMountSeatOffsets(
	id: string,
	changes: readonly { facing: DirectionName; before: MountSeatOffset; after: MountSeatOffset }[]
) {
	const request = openRequest;
	const changed = new LocalizedError(
		'The saved seat changed. Close the seat editor and try again.',
		'settings.seatChanged'
	);
	if (doc.id !== id || opening) throw changed;
	function updateOffsets(current: MountSeatOffsets | undefined) {
		if (doc.id !== id || request !== openRequest) throw changed;
		const offsets = { ...current };
		for (const { facing, before, after } of changes) {
			const saved = mountSeatOffset({ mountSeatOffsets: current }, facing);
			if (
				!DIRECTIONS.includes(facing) ||
				saved.x !== before.x ||
				saved.y !== before.y ||
				!validMountSeatOffset(after)
			)
				throw changed;
			if (after.x || after.y) offsets[facing] = after;
			else delete offsets[facing];
		}
		return Object.keys(offsets).length ? offsets : undefined;
	}
	if (id === DEMO) {
		if (!store.project || dressUnread === id) throw changed;
		const key = `dress-${id}`;
		const fallback = JSON.parse(snap()) as DressState;
		const showOffsets = (offsets: MountSeatOffsets | undefined) => {
			const project = store.project;
			if (!project || doc.id !== id || request !== openRequest) return;
			project.manifest.rig.mountSeatOffsets = offsets;
			store.project = { ...project };
			doc.rev++;
		};
		const saved = await db
			.update<DressState>(
				'projects',
				key,
				(record) => {
					const current = record?.format === CURRENT_FORMAT ? record : fallback;
					return {
						id: key,
						kind: 'dress',
						...current,
						mountSeatOffsets: updateOffsets(current.mountSeatOffsets)
					};
				},
				[],
				(previous) => archiveFixtureDress(key, previous)
			)
			.catch(async (error: unknown) => {
				if (error === changed) {
					const { project } = await openFixture(id);
					showOffsets(project.manifest.rig.mountSeatOffsets);
				}
				throw error;
			});
		showOffsets(saved.mountSeatOffsets);
		store.projects = store.projects.map((ref) =>
			ref.id === id ? { ...ref, look: stableStringify(saved) } : ref
		);
		return;
	}
	const record = await db
		.update<StoredProject>('projects', id, (record) => {
			if (doc.id !== id || request !== openRequest || record?.origin !== 'studio') throw changed;
			const { rig } = record.manifest;
			const offsets = updateOffsets(rig.mountSeatOffsets);
			if (offsets) rig.mountSeatOffsets = offsets;
			else delete rig.mountSeatOffsets;
			record.savedAt = new Date().toISOString();
			return record;
		})
		.catch(async (error: unknown) => {
			if (error === changed) await refreshSaved(id, request);
			throw error;
		});
	syncProjectRef(record);
	try {
		await refreshSaved(id, request);
	} catch (error) {
		toast(errorMessage(error), { tone: 'danger', error });
	}
}
/** Free, explicit correction of one saved item view; keep the open outfit and inspector selection. */
export async function matchItemPalette(
	projectId: string,
	itemId: string,
	anim: string,
	dir: DirectionName,
	reviewed: ItemPaletteRepairPlan
) {
	const request = openRequest;
	await flushSave();
	await withItemStep(projectId, itemId, message('itemPane.matchItemColors'), async (beforeWrite) =>
		(await itemRun()).matchItemColors(projectId, itemId, anim, dir, reviewed, beforeWrite)
	);
	await refreshSaved(projectId, request);
}

// ---------- Fix frames ----------
export const frames = $state({ item: '', anim: '' });
const framesModule = () => lazy(() => import('../lib/frames/save.ts'));
/** Open Fix frames for an item (the body when empty) and a move (the one playing when empty). */
export function openFrames(itemId = '', anim = '') {
	const m = store.project?.manifest;
	if (!m) return;
	frames.item = itemId || m.rig.baseItem;
	frames.anim =
		anim || (m.rig.animations.some((a) => a.id === ui.anim) ? ui.anim : m.rig.animations[0].id);
	ui.sheet = 'frames';
}
export function framesBlocked(): LocalizedError | '' {
	if (!doc.id.startsWith('rig-')) return '';
	return characterEditBlocked('fix frames of', doc.id);
}
export async function prepareFrames(
	projectId: string,
	itemId: string,
	anim: string,
	files: FramesFile[]
) {
	await flushSave();
	return (await framesModule()).prepareFrames(projectId, itemId, anim, files);
}
/** Save one item's artwork change (`save` passes `beforeWrite` on to the edit) as one step, recorded once the save lands:
 *  written back as the whole idle character for the body (whose frames items are fitted to), or as just that item. The
 *  edit gives exactly the records its save checks and writes, so a change another tab made meanwhile is never taken for
 *  part of it. */
async function withItemStep<T>(
	projectId: string,
	itemId: string,
	label: Message,
	save: (beforeWrite: BeforeWrite) => Promise<T>
): Promise<{ result: T; step?: UndoStep }> {
	const made: { step?: UndoStep } = {};
	const result = await save(async ({ before, after }, written) => {
		made.step = await prepareArtworkStep(
			{
				projectId,
				label,
				before,
				after,
				...(itemId === before.manifest.rig.baseItem
					? { action: 'replace body frames of' as const }
					: { itemId })
			},
			written
		);
	});
	recordArtworkStep(projectId, made.step);
	return { result, step: made.step };
}
/** Save a reviewed import as one history step, which the notice's Undo also reverses. `name` is how the sheet calls the
 *  target. */
export async function replaceFrames(prepared: PreparedFrames, name: string) {
	const request = openRequest,
		{ projectId, plan } = prepared;
	const { step } = await withItemStep(
		projectId,
		plan.itemId,
		message('fixFrames.title'),
		async (beforeWrite) => (await framesModule()).saveFrames(prepared, beforeWrite)
	);
	await refreshSaved(projectId, request);
	if (step)
		toast(message('fixFrames.replaced', { count: plan.changed.length, name }), {
			tone: 'success',
			duration: 10000,
			action: () => undoStep(projectId, step),
			actionLabel: message('fixFrames.undo')
		});
}
/** Put a State saved before States were matched to the body's colors onto those colors: free and local, one history step
 *  that the notice's Undo (or Restore originals in Fix frames) reverses. `name` is how the Studio shows the State. */
export async function matchStateColors(anim: string, name: string) {
	const projectId = doc.id,
		request = openRequest;
	try {
		await flushSave();
		const prepared = await (await framesModule()).prepareStateColorMatch(projectId, anim);
		if (!prepared) {
			toast(message('stateColors.alreadyMatched', { name }));
			return;
		}
		const { step } = await withItemStep(
			projectId,
			prepared.plan.itemId,
			message('stateColors.match'),
			async (beforeWrite) => (await framesModule()).saveFrames(prepared, beforeWrite)
		);
		await refreshSaved(projectId, request);
		if (step)
			toast(message('stateColors.matched', { name }), {
				tone: 'success',
				duration: 10000,
				action: () => undoStep(projectId, step),
				actionLabel: message('fixFrames.undo')
			});
	} catch (error) {
		console.error('match state colors', error);
		toast(errorTranslation(error) ?? message('fixFrames.errors.saveFailed'), {
			tone: 'danger',
			error
		});
	}
}
/** Restore every edited frame of an item, as one history step. */
export async function restoreFrames(projectId: string, itemId: string) {
	const request = openRequest;
	try {
		await flushSave();
		const { result: count, step } = await withItemStep(
			projectId,
			itemId,
			message('history.restoreOriginals'),
			async (beforeWrite) => (await framesModule()).restoreFrames(projectId, itemId, beforeWrite)
		);
		await refreshSaved(projectId, request);
		if (step) toast(message('fixFrames.restored', { count }), { tone: 'success' });
	} catch (error) {
		console.error('fix frames', error);
		toast(errorTranslation(error) ?? message('fixFrames.errors.saveFailed'), {
			tone: 'danger',
			error
		});
	}
}

export async function removeItem(itemId: string) {
	const it = itemById(itemId);
	if (!it || isDemo()) return;
	const projectId = doc.id,
		request = openRequest;
	await flushSave();
	const prune = await keysToPruneAndForget();
	let kept: RecentlyDeleted | undefined;
	try {
		kept = await deleteItem<RecentlyDeleted>(
			projectId,
			itemId,
			(rec) => {
				if (rec.appearanceEdits?.[itemId]) throw appearanceReviewHold();
				// Another tab may have deleted it already: nothing was removed, so nothing needs an entry.
				if (!rec.manifest.items.some((item) => item.id === itemId)) return undefined;
				const entry = deletedEntry({
					kind: 'items',
					record: rec,
					name: it.name,
					context: rec.manifest.name,
					scope: { itemIds: [itemId] }
				});
				return { key: entry.id, entry, prune };
			},
			prune
		);
	} catch (error) {
		if ((error as DOMException)?.name === 'QuotaExceededError') throw quotaError();
		throw error;
	}
	await refreshRecentlyDeleted();
	notifyLibraryChanged(projectId);
	// The deleted item cannot be inspected any more: close its pane first, so the notice that offers Undo is on screen.
	if (ui.sheet === 'item' && ui.selected === itemId) ui.sheet = null;
	if (!kept) toast(message('state.removedName', { name: it.name }));
	else
		toast(message('state.removedName', { name: it.name }), {
			duration: 10000,
			actionLabel: message('common.undo'),
			action: () => void restoreDeleted(kept!.id)
		});
	if (doc.id === projectId && request === openRequest) {
		// Quietly: the delete stays undoable, and only the slot it held is cleared from the live outfit.
		await openProject(projectId, { quiet: true });
		delete doc.drafts[it.slot];
		if (doc.items[it.slot] === itemId) doc.items[it.slot] = null;
		bump();
		save();
		if (kept) pushRecovery(message('history.deleteItem', { name: it.name }), kept.id);
	}
}

let relocating = $state(false);

export function itemSlotTargets(manifest: Manifest, item: Item) {
	if (isDemo() || relocating || !canRelocateItem(manifest, item)) return [];
	return categories(manifest).filter((category) => {
		const target = slotDef(manifest, category.key);
		return target && canRelocateItem(manifest, item, target);
	});
}

/** Move a saved item to another category, as one history step unless Undo or Redo is the one moving it back
 *  (`history: false`): then every refusal throws why instead of returning false, for the step to report it. */
export async function moveItemToSlot(
	itemId: string,
	targetId: string,
	{ showDestination = false, history = true } = {}
): Promise<boolean> {
	const item = itemById(itemId),
		projectId = doc.id,
		request = openRequest;
	const refuse = (why: () => LocalizedError) => {
		if (history) return false;
		throw why();
	};
	if (!item || isDemo()) return refuse(historyChanged);
	if (relocating)
		return refuse(
			() =>
				new LocalizedError(
					'Another item is still moving. Try again when it finishes.',
					'wardrobe.itemMoving'
				)
		);
	relocating = true;
	if (edits !== savedEdits && !pendingSave) save();
	const startingEdits = edits;
	const previous = flushSave();
	const work = previous.then(async () => {
		if (openRequest !== request)
			return refuse(
				() =>
					new LocalizedError(
						'The character changed meanwhile. Try again.',
						'state.theCharacterChangedMeanwhileTryAgain'
					)
			);
		// The autosave failure was already reported; the move waits for it, as the record it would write is behind.
		if (savedEdits < startingEdits)
			return refuse(
				() =>
					new LocalizedError(
						'Your latest changes could not be saved. Resolve the storage error, then try again.',
						'history.saveFailed'
					)
			);
		const record = await db.update<DressedRecord>(
			'projects',
			projectId,
			(rec, related) => {
				const savedGens = related<{ gens: Gen[] }>(GENS_KEY)?.gens ?? [],
					savedMove = related<QueuedMove & { queued?: QueuedMove[] }>(MOVE_KEY);
				// Only a move that poses this item holds it (another tab's moves are read from storage), as pendingMoves does here.
				const poses = (move?: QueuedMove) =>
					move?.projectId === projectId && !!move.spec?.items?.includes(itemId);
				if (
					itemStarting ||
					[...gens, ...savedGens].some(
						(gen) =>
							gen.draft.rigId === projectId &&
							!gen.draft.acceptedAt &&
							(gen.input.slot === item.slot || gen.input.slot === targetId)
					) ||
					pendingMoves(projectId, itemId).length ||
					poses(savedMove) ||
					savedMove?.queued?.some(poses)
				)
					throw new LocalizedError(
						'Finish or discard the related generation before moving this item.',
						'wardrobe.itemMoveBusy'
					);
				const manifest = rec?.manifest,
					live = manifest?.items.find((entry) => entry.id === itemId),
					target = manifest && slotDef(manifest, targetId),
					current =
						rec?.dress?.current ?? (manifest?.presets[0] && structuredClone(manifest.presets[0]));
				// Being made or waiting for review is temporary: the move (or its Undo) can run once the item is saved.
				if (live && (live.status !== 'accepted' || live.pending?.length))
					throw new LocalizedError(
						'This item is still being made or reviewed. Try again once it is saved.',
						'wardrobe.itemNotReady'
					);
				if (
					!rec ||
					!manifest ||
					!live ||
					live.slot !== item.slot ||
					!target ||
					!relocateItem(manifest, live, target)
				)
					throw new LocalizedError(
						'The item or slot changed. Try again.',
						'wardrobe.itemMoveChanged'
					);
				if (
					current &&
					relocateWornItem(current.items, itemId, item.slot, targetId, { replace: true })
				)
					rec.dress = { current: { items: current.items, variants: current.variants } };
				rec.savedAt = new Date().toISOString();
				return rec;
			},
			[GENS_KEY, MOVE_KEY]
		);
		if (doc.id === projectId && openRequest === request && store.project) {
			const manifest = store.project.manifest,
				moved = record.manifest.items.find((entry) => entry.id === itemId)!,
				target = record.manifest.slots.find((slot) => slot.id === targetId)!;
			manifest.items = manifest.items.map((entry) => (entry.id === itemId ? moved : entry));
			if (!manifest.slots.some((slot) => slot.id === targetId))
				insertSlotInLadder(manifest.slots, target, record.manifest.slots);
			for (const outfit of manifest.presets)
				relocateWornItem(outfit.items, itemId, item.slot, targetId);
			if (relocateWornItem(doc.items, itemId, item.slot, targetId, { replace: true }))
				delete doc.drafts[targetId];
			for (const step of [...doc.undo, ...doc.redo]) {
				// A delete step holds a recovery entry, not a dress snapshot: relocating an item cannot touch it.
				if (!step.snap) continue;
				const dress = JSON.parse(step.snap) as DressState;
				for (const outfit of [...dress.presets, ...(dress.current ? [dress.current] : [])])
					relocateWornItem(outfit.items, itemId, item.slot, targetId);
				step.snap = JSON.stringify(dress);
			}
			store.exportRecord = record;
			if (showDestination) ui.group = targetId;
			bump();
			if (edits !== startingEdits) save();
			// Moving it back runs the same checks, so a busy or changed category refuses the step and says why.
			if (history)
				pushStep(projectId, {
					label: message('history.moveItem', { name: item.name }),
					edit: (redo) => moveItemToSlot(itemId, redo ? targetId : item.slot, { history: false })
				});
		}
		toast(
			message('wardrobe.itemMoved', {
				name: item.name,
				label: slotLabelMessage(record.manifest, targetId)
			})
		);
		return true;
	});
	const handled = work.catch((error: unknown) => {
		if (!history) throw error;
		const reason = errorMessage(error);
		if (typeof reason !== 'string' && reason.key === 'wardrobe.itemMoveBusy')
			toast(reason, {
				tone: 'warning',
				report: false,
				// The notice's action is how the person resolves the block, so it never expires on its own.
				duration: 0,
				action: () => openPendingWork({ projectId, slots: [item.slot, targetId] })
			});
		else toast(message('state.couldNotSaveReason', { reason }), { tone: 'danger', error });
		return false;
	});
	// Never a rejected chain: every later save would wait on it and fail.
	saving = handled.then(
		() => undefined,
		() => undefined
	);
	try {
		return await handled;
	} finally {
		relocating = false;
	}
}

// ---------- items from other characters ----------
class Shared {
	items = $state.raw<SharedItem[]>([]);
	adding = $state('');
	/** A failed read shows in the wardrobe where the items would be, without displacing startup notices. */
	error = $state<Message | ''>('');
	framesError = $state<Message | ''>('');
	/** Items left out because their images could not be read (each logged). */
	skipped = $state(0);
	/** Frames each exact copy of the open character can take from its source for free, by item id. */
	free = $state.raw<Record<string, number>>({});
}
export const shared = new Shared();
export const sharedKey = (entry: SharedItem) => `shared:${entry.sourceId}/${entry.item.id}`;
let sharedRequest = 0;
let sharedTarget = '';
let savedOffers: Awaited<ReturnType<typeof listShared>> | undefined;
/** Re-read items offered to the open character, including the bundled demo only when opted in. */
export async function refreshShared() {
	const request = ++sharedRequest,
		project = store.project,
		id = doc.id;
	if (!project || sharedTarget !== id) {
		sharedTarget = id;
		savedOffers = undefined;
		shared.items = [];
		shared.error = '';
		shared.framesError = '';
		shared.skipped = 0;
		shared.free = {};
	}
	if (!project) return;
	const includeDemo = !id.startsWith('fixture:') && demoItemsShown();
	if (!includeDemo && savedOffers) {
		shared.items = savedOffers.items;
		shared.skipped = savedOffers.skipped;
	}
	try {
		const unchecked: string[] = [];
		let why: Message | string | undefined;
		const [saved] = await Promise.all([
			listShared(id, project.manifest, project.images),
			freeFrames(project.manifest, (item, error) => {
				console.error('copy frames', item.id, error);
				unchecked.push(item.name);
				why ??= errorMessage(error);
			}).then(
				(free) => {
					if (request !== sharedRequest) return;
					shared.free = free;
					shared.framesError =
						unchecked.length === 1
							? message('state.couldNotCheckNamedFrames', { names: unchecked, reason: why })
							: unchecked.length
								? message('state.couldNotCheckSeveralFrames', { names: unchecked })
								: '';
				},
				(error: unknown) => {
					console.error('copy frames', error);
					if (request !== sharedRequest) return;
					shared.free = {};
					shared.framesError = message('state.couldNotCheckCopiedFrames', {
						reason: errorMessage(error)
					});
				}
			)
		]);
		if (request !== sharedRequest) return saved.items;
		savedOffers = saved;
		if (!includeDemo || !shared.items.some((item) => item.sourceId === DEMO)) {
			shared.items = saved.items;
			shared.skipped = saved.skipped;
		}
		shared.error = '';
		if (!includeDemo) return saved.items;
		const demo = await demoSource().catch((error) => {
			console.warn('demo items unavailable', error);
			return undefined;
		});
		if (request !== sharedRequest) return saved.items;
		const listed = demo
			? await listShared(id, project.manifest, project.images, [demo])
			: { items: saved.items, skipped: saved.skipped + 1 };
		if (request === sharedRequest) {
			shared.items = listed.items;
			shared.skipped = listed.skipped;
		}
		return listed.items;
	} catch (e) {
		console.error('shared', e);
		if (request === sharedRequest)
			shared.error = message('state.couldNotReadSharedItems', { reason: errorMessage(e) });
	}
}
/** The bundled demo, offered as a source to the saved characters with its current colors (its images are not stored). */
async function demoSource(): Promise<BundledSource> {
	const { project, current } = await openFixture(DEMO);
	return {
		id: DEMO,
		manifest: project.manifest,
		variants: current?.variants ?? project.manifest.presets[0]?.variants ?? {},
		images: project.images
	};
}
let sharedSoon: ReturnType<typeof setTimeout> | undefined;
/** Re-read once activity settles (another tab's drafts change on every job update). */
function refreshSharedSoon() {
	clearTimeout(sharedSoon);
	sharedSoon = setTimeout(() => void refreshShared(), 1500);
}
/** Free: wear a copy when the bodies match, a re-fitted copy of a held item to check, or else a copy as drawn for the other
 *  body. An item to make new (or one that turns out not to fit after all) is selected instead, so the wardrobe offers to make
 *  it for this character; so is any item on the demo, which offers to copy itself first. The tile stays busy until the list
 *  no longer offers what was added. */
export async function addShared(entry: SharedItem) {
	if (shared.adding) return;
	const key = sharedKey(entry);
	if (entry.fit === 'remake') {
		ui.selected = key;
		return;
	}
	if (isDemo()) return copyDemoAndAdd(entry);
	shared.adding = key;
	try {
		await addEntry(entry);
	} finally {
		shared.adding = '';
	}
}
/** addShared's work, run while the caller holds `shared.adding`. `lead` opens its toast (what happened first). */
async function addEntry(entry: SharedItem, openedDemoCopy = false) {
	const key = sharedKey(entry),
		projectId = doc.id,
		request = openRequest;
	try {
		await flushSave();
		const item = await acceptCopy(
			entry.sourceId,
			entry.item.id,
			projectId,
			entry.images && {
				id: entry.sourceId,
				manifest: entry.source,
				variants: entry.variants,
				images: entry.images
			}
		);
		if (doc.id !== projectId || request !== openRequest) return;
		if (!item) {
			// The listed outcome was out of date: show what the list says now before offering anything.
			forgetFits();
			const latest = await refreshShared();
			if (doc.id !== projectId || request !== openRequest) return;
			const now = latest?.find((x) => sharedKey(x) === key);
			if (now?.fit === 'remake') ui.selected = key;
			else toast(message('state.nameChangedMeanwhileCheckItsTileAnd', { name: entry.item.name }));
			return;
		}
		await openProject(projectId, { quiet: true });
		const note = doc.id === projectId ? wear(item.id, true) : undefined,
			shown = doc.id === projectId ? revealSlot(item.slot) : undefined;
		const sourceFrame = entry.source.rig.cell;
		const targetFrame = store.project?.manifest.rig.cell;
		const status = message(
			item.unfitted
				? sourceFrame.w === targetFrame?.w && sourceFrame.h === targetFrame.h
					? 'state.wearingUnfitted'
					: 'state.wearingUnfittedAtSize'
				: item.refit
					? 'state.fittedItem'
					: 'state.copiedSharedItem',
			{ name: item.name, sourceName: entry.sourceName, size: pixelSize(sourceFrame) }
		);
		const notices = openedDemoCopy ? [message('state.openedDemoCopy'), status] : [status];
		if (doc.id === projectId && store.project) {
			const manifest = store.project.manifest;
			const gaps = missingMoves(manifest, item);
			if (gaps.length) {
				const ids = manifest.rig.animations;
				notices.push(
					gaps.length === 1
						? message('state.copyMissingOneMove', { move: displayMove(gaps[0], ids) })
						: message('state.copyMissingFrames', { moves: gaps.map((id) => displayMove(id, ids)) })
				);
			}
		}
		if (note) notices.push(note);
		if (shown) notices.push(shown);
		toast(notices, item.unfitted ? { tone: 'warning' } : undefined);
		await refreshShared();
	} catch (e) {
		toast(
			message('state.couldNotAddNameReason', {
				name: entry.item.name,
				reason: errorMessage(e)
			}),
			{ tone: 'danger' }
		);
	}
}

/** Free: copy the chosen items of an imported ZIP (`source`, not stored) into `projectId` one by one, exactly as tapping a
 *  shared tile would (exact copy, re-fit or worn as drawn); a name in use keeps both as "Name 2". One item that fails or no
 *  longer fits leaves the others to finish. Wears what was added; `notes` are what wearing took off and the categories it
 *  showed, as a shared tile's toast says them. */
export async function importItems(
	projectId: string,
	source: BundledSource,
	entries: readonly SharedItem[]
): Promise<{
	added: Item[];
	skipped: SharedItem[];
	failed: { entry: SharedItem; error: unknown }[];
	notes: Message[];
}> {
	if (shared.adding) throw new LocalizedError('Wait for the item being added.', 'itemImport.busy');
	shared.adding = 'import';
	const added: Item[] = [],
		skipped: SharedItem[] = [],
		failed: { entry: SharedItem; error: unknown }[] = [],
		notes: Message[] = [];
	try {
		await flushSave();
		for (const entry of entries)
			try {
				const item = await acceptCopy(source.id, entry.item.id, projectId, source, {
					numberName: true
				});
				if (item) added.push(item);
				else skipped.push(entry);
			} catch (error) {
				failed.push({ entry, error });
			}
	} finally {
		shared.adding = '';
		if (added.length) {
			forgetFits();
			await openProject(projectId, { quiet: true });
			if (doc.id === projectId) {
				for (const item of added) {
					const note = wear(item.id, true);
					if (note) notes.push(note);
				}
				for (const slot of new Set(added.map((item) => item.slot))) {
					const shown = revealSlot(slot);
					if (shown) notes.push(shown);
				}
			}
			void refreshShared();
		}
	}
	return { added, skipped, failed, notes };
}

/** Where an import starts: the New item, New move or New State sheet opens on its Import page, reading a dropped ZIP. */
export type ImportKind = 'items' | 'moves' | 'states';
let importOpening: { kind: ImportKind; projectId: string; files?: File[] } | undefined;
export function openImport(kind: ImportKind, files?: File[]) {
	importOpening = { kind, projectId: doc.id, files };
	if (kind === 'items') openNewItem(ui.group);
	else if (kind === 'moves') {
		ui.redrawMove = '';
		ui.sheet = 'move';
	} else {
		ui.stateCaptureMove = '';
		ui.sheet = 'stateCapture';
	}
}
/** The import a sheet of `kind` was opened for, or undefined. Every New item, New move and New State sheet takes it as it
 *  opens, so a request is used once and never resurfaces later, for another sheet or character. */
export function takeImport(kind: ImportKind): { files?: File[] } | undefined {
	const opening = importOpening;
	importOpening = undefined;
	return opening?.kind === kind && opening.projectId === doc.id && !isDemo() ? opening : undefined;
}

/** Free: an exact copy takes the frames its source item gained since (moves added there), into the same item. */
export async function copyFromSource(itemId: string) {
	const it = itemById(itemId);
	if (isDemo() || !it?.copiedFrom || shared.adding) return;
	const projectId = doc.id,
		request = openRequest,
		from = it.copiedFrom.name;
	shared.adding = itemId;
	try {
		await flushSave();
		const n = await copyMoreFrames(projectId, itemId);
		if (doc.id !== projectId || request !== openRequest) return;
		if (n) {
			await openProject(projectId, { quiet: true });
			toast(message('state.copiedMoreFrames', { count: n, name: it.name, from }));
		} else toast(message('state.fromHasNoMoreFramesOfName', { from, name: it.name }));
		await refreshShared();
	} catch (e) {
		toast(
			message('state.couldNotCopyFramesOfNameReason', {
				name: it.name,
				reason: errorMessage(e)
			}),
			{ tone: 'danger' }
		);
	} finally {
		shared.adding = '';
	}
}

/** Free: an item takes the standing frames it lacks from its own saved designs. Nothing is generated. */
export async function restoreFromDesign(itemId: string) {
	const it = itemById(itemId);
	if (isDemo() || !it || shared.adding) return;
	const projectId = doc.id,
		request = openRequest;
	shared.adding = itemId;
	try {
		await flushSave();
		let views: string[] = [],
			failed = false;
		try {
			views = await (await itemRun()).restoreStandingViews(projectId, itemId);
		} catch (e) {
			failed = true;
			toast(message('state.restoreFailed', { name: it.name, reason: errorMessage(e) }), {
				error: e,
				tone: 'danger'
			});
		}
		if (doc.id !== projectId || request !== openRequest) return;
		// After a failure too: one of several standing moves may have been saved before it.
		if (views.length || failed) await openProject(projectId, { quiet: true });
		if (doc.id !== projectId) return; // another character was opened meanwhile: nothing here is about it
		if (views.length) {
			// Show what came back: the standing move, facing the first restored view.
			[ui.anim, ui.dir] = views[0].split('/') as [string, DirectionName];
			// The frame is checked like any other: a design that fails a check says so instead of passing as restored.
			const checks = itemById(itemId)?.qa?.clips,
				flagged = views.some((key) => {
					const status = checks?.[key.split('/').slice(0, 2).join('/')]?.status;
					return status === 'warn' || status === 'fail';
				});
			const restored = message('state.restoredStanding', {
				name: it.name,
				directions: views.map((key) =>
					displayDirectionInSentence(key.split('/')[1] as DirectionName)
				)
			});
			toast(
				flagged ? [restored, message('state.restoredQualityNotes')] : restored,
				flagged ? { tone: 'warning' } : undefined
			);
		} else if (!failed) toast(message('state.noStandingToRestore', { name: it.name }));
		await refreshShared();
	} catch (e) {
		toast(message('state.restoreFinishFailed', { name: it.name, reason: errorMessage(e) }), {
			error: e,
			tone: 'danger'
		});
	} finally {
		shared.adding = '';
	}
}

/** Free: the demo never changes, so copy it (or open the copy made before) and add the item there, fitted to the copy afresh
 *  (the copy gains a standing move). An item the copy already has is worn instead. The tiles stay busy throughout, and
 *  nothing more happens once the player opens another character. */
async function copyDemoAndAdd(entry: SharedItem) {
	if (!isDemo() || shared.adding) return;
	shared.adding = sharedKey(entry);
	try {
		let id: string;
		try {
			id = await copyDemo();
		} catch (e) {
			toast(message('state.couldNotCopyTheDemoReason', { reason: errorMessage(e) }), {
				error: e,
				tone: 'danger'
			});
			return;
		}
		const request = openRequest;
		if (doc.id !== id) return;
		const latest = await refreshShared();
		if (doc.id !== id || request !== openRequest) return;
		const now = latest?.find((x) => x.sourceId === entry.sourceId && x.item.id === entry.item.id);
		// The copy may have been made before (the demo has one editable copy per body).
		if (now?.fit === 'remake') {
			ui.selected = sharedKey(now);
			toast(message('state.savedNameCanTBeWornOn', { name: entry.item.name }));
		} else if (now) await addEntry(now, true);
		else {
			const held = store.project?.manifest.items.find(
				(it) => it.status === 'accepted' && itemKey(it, id) === itemKey(entry.item, entry.sourceId)
			);
			if (!held)
				toast(
					message('state.nameIsNoLongerAvailableOnSourceName', {
						name: entry.item.name,
						sourceName: entry.sourceName
					}),
					{
						tone: 'warning'
					}
				);
			else {
				if (doc.items[held.slot] === held.id) ui.selected = held.id;
				else wear(held.id, true);
				toast(message('state.savedWearingItsNameNoGenerationsUsed', { name: held.name }));
			}
		}
	} finally {
		shared.adding = '';
	}
}

/** The demo is a bundled fixture; items are generated into an editable copy in IndexedDB. Opens the copy unless the player
 *  opened another character meanwhile. */
export async function copyDemo(): Promise<string> {
	const project = store.project!, // the open character when asked, not after the pipeline loads
		request = openRequest;
	const id = await (await createFlow()).saveCopy(project, 'Adventurer copy', 'walk');
	await refreshProjects();
	if (request === openRequest) await openProject(id);
	return id;
}

/** What a Rename sheet names: the character itself, or one of its items, outfits or moves. */
export type RenameOf = { itemId?: string; outfitId?: string; moveId?: string };

/** Saved characters only, except outfits: a demo's outfits are part of its saved dress-up state. */
export function openRename(projectId: string, of: RenameOf = {}) {
	if (projectId.startsWith('fixture:') && !of.outfitId) return;
	ui.renameTarget = { projectId, ...of };
	ui.sheet = 'rename';
}

export async function renameProject(name: string) {
	if (!isDemo()) await saveIdentity(doc.id, {}, name);
}

type Identity = { name?: string; exportId?: string };
const identityTarget = (
	m: Manifest,
	of: Pick<RenameOf, 'itemId' | 'moveId'>
): Identity | undefined =>
	of.moveId
		? m.rig.animations.find((move) => move.id === of.moveId)
		: of.itemId
			? m.items.find((item) => item.id === of.itemId)
			: m;
function identityOf(m: Manifest, of: Pick<RenameOf, 'itemId' | 'moveId'>): Identity | undefined {
	const target = identityTarget(m, of);
	return target && { name: target.name, exportId: target.exportId };
}
/** Put back a name and export ID exactly, checked like any rename (another item may have taken that export ID since). */
function putIdentity(
	m: Manifest,
	projectId: string,
	of: Pick<RenameOf, 'itemId' | 'moveId'>,
	value: Identity
) {
	if (of.moveId) editMoveIdentity(m, of.moveId, value.name, value.exportId ?? of.moveId);
	else editIdentity(m, projectId, of.itemId, value.name, value.exportId);
	const target = identityTarget(m, of)!;
	for (const key of ['name', 'exportId'] as const)
		if (value[key] === undefined) delete target[key];
		else target[key] = value[key];
}
/** Write a name change to the saved record and show it here and in other tabs. */
async function writeIdentity(
	projectId: string,
	of: Pick<RenameOf, 'itemId' | 'moveId'>,
	edit: (m: Manifest) => void
) {
	const request = openRequest;
	const updated = await db.update<{ manifest?: Manifest }>('projects', projectId, (rec) => {
		if (!rec?.manifest)
			throw new LocalizedError(
				'This saved character is no longer available.',
				'directionsSheet.characterUnavailable'
			);
		edit(rec.manifest);
		return rec;
	});
	if (opening === projectId) openingIdentityRevision++;
	applySavedIdentity(projectId, of, request, updated.manifest!);
	identityChannel?.postMessage({ projectId, ...of });
	await refreshProjects();
}
/** Rename a character, item or move, or change its export ID, as one history step. Its Undo and Redo write the saved record
 *  only while it still holds the other side, so a newer rename (here or in another tab) is never overwritten. */
export async function saveIdentity(
	projectId: string,
	of: Pick<RenameOf, 'itemId' | 'moveId'>,
	name: string | undefined,
	exportId?: string
) {
	if (projectId.startsWith('fixture:')) return;
	const sides: { from?: Identity; to?: Identity } = {};
	await writeIdentity(projectId, of, (m) => {
		sides.from = identityOf(m, of);
		if (of.moveId) editMoveIdentity(m, of.moveId, name, exportId);
		else editIdentity(m, projectId, of.itemId, name, exportId);
		sides.to = identityOf(m, of);
	});
	const { from, to } = sides;
	if (!from || !to || stableStringify(from) === stableStringify(to)) return;
	pushStep(projectId, {
		label: message(
			of.moveId
				? 'renameSheet.titleRenameMove'
				: of.itemId
					? 'renameSheet.titleRenameItem'
					: 'renameSheet.titleRenameCharacter'
		),
		edit: (redo) =>
			writeIdentity(projectId, of, (m) => {
				const [expect, target] = redo ? [from, to] : [to, from];
				if (stableStringify(identityOf(m, of)) !== stableStringify(expect)) throw historyChanged();
				putIdentity(m, projectId, of, target);
			})
	});
}

/** Save the description new moves use, as one history step that writes back only over the text it replaced. */
export async function saveDescription(projectId: string, looks: string) {
	const { saveLooks } = await setupFlow(),
		from = (await saveLooks(projectId, looks)).trim(),
		to = looks.trim();
	if (from === to) return;
	pushStep(projectId, {
		label: message('history.changeDescription'),
		edit: async (redo) => {
			await saveLooks(projectId, redo ? to : from, (saved) => {
				if (saved !== (redo ? from : to)) throw historyChanged();
			});
		}
	});
}

/** Outfits are dress-up state: renaming one is a step Undo reverses, like saving or deleting it. */
export function renameOutfit(outfitId: string, name: string | undefined, exportId?: string) {
	const m = store.project!.manifest;
	const presets = $state.snapshot(m.presets);
	editOutfitIdentity(presets, outfitId, name, exportId);
	commit(message('history.renameOutfit'), () => {
		m.presets = presets;
	});
}

function applySavedIdentity(
	projectId: string,
	{ itemId, moveId }: Pick<RenameOf, 'itemId' | 'moveId'>,
	request: number,
	manifest: Manifest
) {
	if (doc.id === projectId && openRequest === request && store.project) {
		const current = store.project.manifest;
		if (moveId) {
			const from = manifest.rig.animations.find((move) => move.id === moveId);
			if (from && current.rig.animations.some((move) => move.id === moveId)) {
				// New objects: lists keyed by move only redraw a move that is not the same object.
				current.rig = {
					...current.rig,
					// The saved move itself: paid-request consent compares the rig's JSON, key order included.
					animations: current.rig.animations.map((move) =>
						move.id === moveId ? structuredClone(from) : move
					)
				};
				bump();
			}
			return;
		}
		const from = itemId ? manifest.items.find((item) => item.id === itemId) : manifest;
		const to = itemId ? current.items.find((item) => item.id === itemId) : current;
		if (from && to) {
			to.name = from.name;
			if (from.exportId === undefined) delete to.exportId;
			else to.exportId = from.exportId;
			bump();
		}
	}
}

/** Wear an item if it is off and select it; a worn item stays on. Wardrobe tiles toggle with `wear` instead. */
export function pick(id: string) {
	const it = itemById(id);
	if (it && (doc.items[it.slot] !== id || doc.drafts[it.slot])) wear(id);
	else ui.selected = id;
}

// ---------- item generations ----------
export const REQUEST_TEXT = db.REQUEST_TEXT;
const STOPPED = GENERATION_STOPPED;
const SETUP_STOPPED = 'Setup stopped. Review Activity before trying again.';
const REPAIR_REVIEW_RECOVERY =
	'The review could not be saved. Use saved frames to recover it without another charge.';
const halted = (r: { status?: string; requestText?: number }) =>
	r.status === 'failed' || r.status === 'review' || r.requestText !== REQUEST_TEXT;
export interface Gen {
	draft: Draft;
	input: NewItemInput;
	phase: 'running' | 'review' | 'failed';
	status: string;
	error?: string | Message;
	canceled?: boolean;
	cancelSaveFailed?: boolean;
	requestText?: number;
}
export const gens = $state<Gen[]>([]);
const GENS_KEY = 'studio-drafts'; // projects store, no `manifest` -> ignored by project listings
// A saved draft stays visible until the accepted project is published, but must not resume after a reload.
const saveGens = () =>
	db.put('projects', GENS_KEY, {
		id: GENS_KEY,
		gens: $state.snapshot(gens).filter((g) => !g.draft.acceptedAt)
	});

// One runner per draft: a second runItem on the same draft (e.g. the Studio remounting and loading the drafts again)
// re-rolls calls twice and pays twice (seen live). Drafts load once per page.
// Only the queue leader runs drafts, creates and moves (R6 P1-1: two tabs re-rolled the same draft and overwrote each
// other's studio-drafts). A follower tab shows the leader's drafts, re-read when the ledger changes, and takes over when
// the leader's tab closes.
const runningGens = new SvelteSet<string>();
const generationControllers = new Map<string, AbortController>();
const generationRuns = new Map<string, Promise<void>>();
const cancellationRequested = new Set<string>();
let loading: Promise<void> | null = null,
	gensReady = false,
	driving = false,
	takingOver = false,
	takeOverRunning = false,
	resumedHere = false,
	mirrored = '',
	mirrorAt = 0;
let itemStarting = $state(0);
let studioStartup = $state<'loading' | 'ready' | 'failed'>('loading');
// A failed read rejects: an empty list would let the next save overwrite the stored drafts and cleanUp prune their records.
const readGens = async () =>
	uniqueBy(
		(await db.get<{ gens: Gen[] }>('projects', GENS_KEY))?.gens ?? [],
		(g) => g.draft.spec.id
	);
/** The ONLY way the list is replaced: one entry per draft id (already-persisted duplicates heal on the next save). Synchronous,
 * so no caller can splice with a length read before an await (the B13 regression that doubled every draft). */
function setGens(list: Gen[]) {
	const uniq = uniqueBy(list, (g) => g.draft.spec.id);
	mirrored = JSON.stringify(uniq);
	gens.splice(0, gens.length, ...uniq);
	takeOffGone();
}
/** A worn draft that failed or is gone (saved or discarded in another tab) comes off, so the item under it shows again. */
function takeOffGone() {
	for (const [slot, id] of Object.entries(doc.drafts))
		if (!gens.some((g) => g.draft.spec.id === id && g.phase !== 'failed')) delete doc.drafts[slot];
}
/** Once per page (a second call, e.g. a Studio remount, returns the same promise). */
export function loadGens(): Promise<void> {
	if (hmrReloading) return Promise.resolve();
	return (loading ??= (async () => {
		setGens(await readGens());
		gensReady = true;
		if (queue.role !== 'follower') drive();
		else {
			for (const g of gens) if (g.phase === 'review') void readGenReview(g);
			void mirrorElsewhereMove();
		}
	})());
}
function drive() {
	if (driving) return;
	driving = true;
	const outdated = gens.filter((g) => g.phase === 'running' && g.requestText !== REQUEST_TEXT);
	for (const g of outdated) Object.assign(g, { phase: 'failed', status: '', error: STOPPED });
	takeOffGone();
	if (outdated.length) void saveGens();
	for (const g of gens)
		if (g.phase === 'running') void runGen(g);
		else if (g.phase === 'review') void readGenReview(g);
	void cleanUp(WEEK, false).catch((e) => console.error('cleanup', e)); // R6 P2-14: prune week-old records nothing needs (blobs: Clear finished only)
	if (!deleted.ready) void refreshRecentlyDeleted(); // once: expired deletions never look restorable
}
// ---------- a follower mirrors the move another tab runs ----------
/** The move another tab is running, read-only here: its Moves list shows it and the moves queued behind it. */
export const elsewhereMove = $state<{ current: ElsewhereMove | null }>({ current: null });
let elsewhereRead = 0;
/** Whether this tab only mirrors the queue: the work runs in another tab. */
export const workRunsInAnotherTab = () => characterJobsInOtherTab;
function clearElsewhereMove() {
	elsewhereRead++; // a read still in flight must not put it back
	elsewhereMove.current = null;
}
/** A follower reads the stored move record the leading tab updates; it never starts, stops or queues anything here. */
export async function mirrorElsewhereMove() {
	if (queue.role !== 'follower') {
		clearElsewhereMove();
		return;
	}
	const read = ++elsewhereRead;
	let raw: unknown;
	try {
		raw = await db.get('projects', MOVE_KEY);
	} catch (error) {
		console.error('move mirror', error); // keep the last mirror; a later read tries again
		return;
	}
	if (read === elsewhereRead) elsewhereMove.current = mirroredMove(raw);
}
queue.subscribe((s) => {
	characterJobsPending = !queue.idle();
	characterJobsInOtherTab = s.role === 'follower';
	// This tab handed the jobs to another (only ever while idle): mirror its drafts again, and resume again when it leads.
	if (s.role === 'follower' && driving)
		driving = takingOver = resumedHere = createResumed = moveResumed = setupResumed = false;
	runWaiting();
	if (!gensReady || driving) return;
	if (s.role !== 'follower') {
		clearElsewhereMove();
		void takeOver();
		return;
	}
	if (Date.now() - mirrorAt < 2000) return;
	mirrorAt = Date.now();
	void mirrorElsewhereMove();
	void readGens().then(
		(list) => {
			if (driving || JSON.stringify(list) === mirrored) return;
			setGens(list);
			refreshSharedSoon(); // the leader tab may have saved an item to another character
			for (const g of gens)
				if (g.phase === 'review' && !store.results[g.draft.spec.id]) void readGenReview(g);
		},
		(e) => console.error('drafts', e)
	);
});
/** This follower tab just became the leader: continue the old leader's drafts, create and move. */
async function takeOver() {
	if (driving || takingOver) return;
	takingOver = takeOverRunning = true;
	clearElsewhereMove(); // this tab now runs the stored move itself (resumeMove below)
	try {
		const list = await readGens();
		if (driving) return; // startup drove first; its own resumes follow and call startupResumed
		setGens(list);
		drive();
		await resumeCreate();
		await resumeMove();
		await resumeSetup();
		resumedHere = true;
	} catch (e) {
		cancelWaitingForTab(); // never run a click on top of work this tab could not resume
		toast(message('state.thisTabCouldNotTakeOverThe', { reason: errorMessage(e) }), {
			error: e,
			tone: 'danger'
		});
	} finally {
		takeOverRunning = false;
	}
	runWaiting();
}
/** Studio's startup resumes are done; as the leader, a click waiting from before can now run. */
export function startupResumed() {
	studioStartup = 'ready';
	if (queue.role !== 'follower') {
		resumedHere = true;
		announceStoppedWork();
	}
	runWaiting();
}
/** Stopped item drafts, moves, setups and new characters: each waits for the user and blocks related edits. */
/** A failed move or item job that holds the queue (it counts as stopped work once). */
export const stoppedMove = () => !!heldMove() && !!moving.error && !moveRunning;
export const stoppedWork = () =>
	gens.filter((g) => g.phase === 'failed').length +
	(stoppedMove() ? 1 : 0) +
	(heldSetup() && settingUp.error ? 1 : 0) +
	creates.filter((run) => !run.projectId && run.error && !run.running).length;
/** Work that stopped before this page loaded waits silently in its panel, so say so once. */
function announceStoppedWork() {
	const count = stoppedWork();
	// A warning: an error already shown stays visible, and the panel it opens is not covered.
	if (count)
		toast(message('state.stoppedWork', { count }), {
			tone: 'warning',
			report: false,
			duration: 10000,
			action: () => openPendingWork()
		});
}

/** `reported`: the failure already showed its own notice. */
export function startupFailed(error: unknown, reported = false) {
	studioStartup = 'failed';
	console.error('studio startup', error);
	if (!reported)
		toast(message('state.pixelDollCouldNotFinishLoadingYourSaved'), { tone: 'danger', error });
}

interface ItemAttemptConsent {
	projectId: string;
	gens: number;
	rig?: string;
	replaces?: { id: string; reviewed: string };
}
export async function startItem(input: NewItemInput, consent?: ItemAttemptConsent) {
	if (hmrReloading) return;
	if (relocating) {
		const request = openRequest;
		await saving;
		if (request !== openRequest) {
			toast(message('state.thisCharacterOrItemChangedReopenIt'), {
				tone: 'warning',
				report: false
			});
			return;
		}
	}
	itemStarting++; // counted from the click, before the draft exists, so this tab keeps the jobs meanwhile
	try {
		await startItemDraft(input, consent);
	} finally {
		itemStarting--;
	}
}
async function startItemDraft(input: NewItemInput, consent?: ItemAttemptConsent) {
	const projectId = consent?.projectId ?? doc.id;
	// Startup may still be reading the stored drafts: saving before they load would overwrite them.
	try {
		await loadGens();
	} catch (e) {
		toast(message('state.savedItemDraftsCouldNotBeRead', { reason: errorMessage(e) }), {
			error: e,
			tone: 'danger'
		});
		return;
	}
	// A hidden category is shown before its first attempt, and a new custom category is saved before generation reads it.
	if (doc.id === projectId) {
		const shown = revealSlot(input.slot);
		if (shown) toast(shown);
	}
	await flushSave();
	const ctx = await loadProject(projectId),
		route = await itemFlow();
	// Taking over another tab rehydrates drafts. Match reviewed content, not the old in-memory object.
	const replaced = consent?.replaces && gens.find((g) => g.draft.spec.id === consent.replaces!.id);
	if (
		doc.id !== projectId ||
		(consent?.rig && JSON.stringify(ctx.rec.manifest.rig) !== consent.rig) ||
		(consent?.replaces &&
			(!replaced ||
				replaced.phase === 'running' ||
				stableStringify({ draft: replaced.draft, input: replaced.input, phase: replaced.phase }) !==
					consent.replaces.reviewed ||
				stableStringify({ ...replaced.input, ...(input.key ? { key: input.key } : {}) }) !==
					stableStringify(input)))
	) {
		// Try again may carry a measured key
		toast(message('state.thisCharacterOrItemChangedReopenIt'), {
			tone: 'warning',
			report: false
		});
		return;
	}
	const plan = route.plan(ctx.rec.manifest.rig, ctx, input);
	if (consent && (!Number.isFinite(consent.gens) || plan.gens !== consent.gens)) {
		toast(message('state.theAttemptPriceChangedReviewTheCurrent'), {
			tone: 'warning',
			report: false
		});
		return;
	}
	if (!allowsTier(plan.minimumTier)) return;
	const taken = gens.map((g) => g.draft.spec.id); // read and claimed with no await between: concurrent starts get distinct ids
	// The runner and the list must share a proxy so mutations persist and identity checks recognize this draft.
	const g = $state<Gen>({
		draft: route.draft(ctx, input, taken),
		input,
		phase: 'running',
		status: GENERATION_PHASES.starting,
		requestText: REQUEST_TEXT
	});
	const index = replaced ? gens.indexOf(replaced) : -1;
	if (replaced) gens.splice(index, 1, g);
	else gens.push(g);
	const selected = ui.selected;
	ui.selected = `gen:${g.draft.spec.id}`;
	ui.group = input.slot;
	try {
		await saveGens();
	} catch (error) {
		const nextIndex = gens.indexOf(g);
		if (nextIndex >= 0) {
			if (replaced) gens.splice(nextIndex, 1, replaced);
			else gens.splice(nextIndex, 1);
		}
		ui.selected = selected;
		throw error;
	}
	if (g.draft.spec.standing && viewing(projectId) && ui.selected === `gen:${g.draft.spec.id}`) {
		ui.anim = g.draft.spec.standing;
		ui.frame = 0;
	}
	if (replaced && doc.drafts[replaced.draft.spec.slot] === replaced.draft.spec.id)
		delete doc.drafts[replaced.draft.spec.slot];
	void runGen(g, ctx, true);
}
async function runGen(g: Gen, ctx?: Awaited<ReturnType<typeof loadProject>>, announce = false) {
	const id = g.draft.spec.id;
	if (
		runningGens.has(id) ||
		cancellationRequested.has(id) ||
		g.canceled ||
		g.phase !== 'running' ||
		!gens.includes(g)
	)
		return;
	runningGens.add(id);
	const controller = new AbortController();
	generationControllers.set(id, controller);
	try {
		const pending = runGenOnce(g, ctx, controller.signal, announce);
		generationRuns.set(id, pending);
		await pending;
	} finally {
		runningGens.delete(id);
		generationControllers.delete(id);
		generationRuns.delete(id);
	}
}
async function runGenOnce(
	g: Gen,
	ctx: Awaited<ReturnType<typeof loadProject>> | undefined,
	signal: AbortSignal,
	announce: boolean
) {
	g.phase = 'running';
	g.error = undefined;
	// a draft saved or discarded meanwhile keeps no result: a late preview must not bring it back
	const result = (r: ItemResult | null) => {
		if (gens.includes(g)) store.results = { ...store.results, [g.draft.spec.id]: r };
	};
	try {
		ctx ??= await loadProject(g.draft.rigId);
		const res = await (
			await itemFlow()
		).run(g.draft, ctx, {
			signal,
			status: (s) =>
				(g.status =
					s === 'design call' ? GENERATION_PHASES.designing : GENERATION_PHASES.addingMoves),
			persist: saveGens,
			result
		});
		if (!gens.includes(g) || signal?.aborted) return;
		result(res);
		g.phase = res?.qa && res.cells.length ? 'review' : 'failed';
		if (g.phase === 'failed') g.error = g.draft.log.at(-1) ?? NO_USABLE_FRAMES;
		g.status = '';
	} catch (e) {
		if (signal?.aborted) return;
		// The pipeline did not load, so this attempt submitted nothing: keep the draft running for a reload to resume.
		if (e instanceof LoadError) {
			g.status = '';
			toast(errorMessage(e), { tone: 'danger', error: e });
			return;
		}
		g.phase = 'failed';
		g.error = errorMessage(e);
	}
	takeOffGone();
	await saveGens();
	if (announce && !signal.aborted && gens.includes(g)) {
		if (g.phase === 'review') playAudioCue('item');
		else if (!isGenerationCancellation(g.error)) playAudioCue('failure');
	}
	if (g.phase === 'failed')
		toast(message('state.nameCouldNotFinishNoPaidRetry', { name: g.input.name }), {
			tone: 'danger',
			report: false,
			duration: 8000,
			action: () => openGenerationReview(g.draft.spec.id)
		});
	if (g.phase !== 'review') return;
	// Review is optional (round 10, changes D7): a clean draft saves itself; warned or failed ones wait with their badge.
	const res = store.results[g.draft.spec.id];
	if (res && (await itemRun()).isClean(res) && (await autoSave(g))) return;
	toast(message('state.nameHasIssuesToReviewNoPaid', { name: g.input.name }), {
		tone: 'warning',
		report: false,
		action: () => openGenerationReview(g.draft.spec.id)
	});
}
/** Notification dismissal only hides the notification; accepting artwork is a separate explicit action. */
export async function openGenerationReview(id: string) {
	const g = gens.find((g) => g.draft.spec.id === id);
	if (!g || g.phase === 'running') return;
	await openProject(g.draft.rigId);
	if (!gens.includes(g) || doc.id !== g.draft.rigId) return;
	ui.sheet = 'gen';
	ui.tab = 'wardrobe';
	ui.group = g.input.slot;
	ui.selected = `gen:${id}`;
}
/** Shows an item draft: its review when it stopped or waits for one, else its tile, which shows the progress. */
export async function openDraft(g: Gen) {
	if (g.phase !== 'running') return openGenerationReview(g.draft.spec.id);
	await openProject(g.draft.rigId);
	if (!gens.includes(g) || doc.id !== g.draft.rigId) return;
	ui.sheet = null;
	ui.tab = 'wardrobe';
	setPanelOpen(true);
	ui.group = g.input.slot;
	ui.selected = `gen:${g.draft.spec.id}`;
}
/** Opens a character's move or setup panel, which shows its progress or failure and how to retry or dismiss it. */
async function openFlow(sheet: 'move' | 'setup', projectId: string) {
	if (projectId && doc.id !== projectId) await openProject(projectId);
	if (!projectId || doc.id === projectId) ui.sheet = sheet;
}
/** Opens the work a busy or failure notice is about, so the user can finish or discard it, stopped work first: the item
 *  draft, move, setup or new character this tab holds. `flows`: the block comes from moves, setups, creations and running
 *  work only (deletes, direction changes, item repairs), so stopped item drafts are skipped and running work is found on
 *  any character, as it holds them all. Anything else (another tab's work, jobs alone) opens Activity. */
export async function openPendingWork(
	scope: { projectId?: string; slots?: readonly string[]; flows?: boolean } = {}
) {
	const { projectId, slots, flows } = scope;
	const ours = (id: string) => !projectId || id === projectId;
	const drafts = gens.filter(
		(g) => !g.draft.acceptedAt && (!slots || slots.includes(g.input.slot))
	);
	const stoppedDraft = flows
		? undefined
		: (drafts.find((g) => g.phase === 'failed' && ours(g.draft.rigId)) ??
			drafts.find((g) => g.phase === 'review' && ours(g.draft.rigId)));
	const runningDraft = drafts.find((g) => g.phase === 'running' && (flows || ours(g.draft.rigId)));
	const move = moving.spec && !moving.done ? moving.projectId : undefined;
	const setup = settingUp.spec && !settingUp.done ? settingUp.spec.projectId : undefined;
	const create = creates.find((run) => !run.projectId && run.error && !run.running);
	if (stoppedDraft) return openDraft(stoppedDraft);
	if (move !== undefined && moving.error && ours(move)) return openFlow('move', move);
	if (setup !== undefined && settingUp.error && ours(setup)) return openFlow('setup', setup);
	if (create && !projectId) return reviewFailedCreate(create.id);
	if (runningDraft) return openDraft(runningDraft);
	if (move !== undefined && !moving.error && (flows || ours(move))) return openFlow('move', move);
	if (setup !== undefined && !settingUp.error && (flows || ours(setup)))
		return openFlow('setup', setup);
	ui.sheet = 'activity';
}
export async function acceptItemIssues(
	projectId: string,
	itemId: string,
	reviewed: Item,
	keepWithout?: string[]
) {
	if (follower()) return;
	await (await itemRun()).acceptItemReview(projectId, itemId, reviewed, keepWithout);
	if (viewing(projectId)) await openProject(projectId, { quiet: true });
	else await syncStoredProject(projectId);
	const moves = store.project?.manifest.rig.animations ?? [];
	toast(
		keepWithout?.length
			? message('state.nameKeptWithout', {
					name: reviewed.name,
					moves: keepWithout.map((id) => displayMove(id, moves)).join(', ')
				})
			: message('state.nameAcceptedAsIs', { name: reviewed.name })
	);
}
async function openItemReview(projectId: string, itemId: string, anim?: string) {
	await openProject(projectId);
	const item = store.project?.manifest.items.find((item) => item.id === itemId);
	if (doc.id !== projectId || !item) return;
	ui.selected = item.id;
	ui.group = item.slot;
	ui.tab = 'wardrobe';
	if (anim) {
		ui.anim = anim;
		ui.frame = 0;
	}
	ui.sheet = 'item';
}
async function autoSave(g: Gen): Promise<boolean> {
	try {
		return await acceptGen(g, true);
	} catch (e) {
		g.draft.log.push({
			...message('generation.outcome.notSavedAutomatically', { reason: errorMessage(e) }),
			text: `not saved automatically: ${errorText(e)}`
		});
		await saveGens();
		return false;
	}
}
/** Read a review draft's paid frames again. A failed read is recorded, never left as "Checking the frames" forever. */
export async function readGenReview(g: Gen) {
	const id = g.draft.spec.id;
	const { [id]: _, ...unread } = store.resultsUnread;
	store.resultsUnread = unread;
	try {
		const ctx = await loadProject(g.draft.rigId);
		// Spread after the await: concurrent evaluations (every review draft after a reload) otherwise overwrite each other's
		// results, leaving a card on "Checking the frames" forever (2026-11-07 live test).
		const result = await (await itemRun()).evaluateItem(g.draft, ctx);
		store.results = { ...store.results, [id]: result };
	} catch (error) {
		console.error('item review frames', error);
		store.resultsUnread = { ...store.resultsUnread, [id]: true };
	}
}
export const genOf = (sel: string) => gens.find((g) => `gen:${g.draft.spec.id}` === sel);

/** Wear or take off a draft of the open character while it generates or waits for review (display only: doc.drafts). */
export function wearDraft(id: string) {
	const g = gens.find((x) => x.draft.spec.id === id);
	if (!g || g.draft.rigId !== doc.id) return;
	const slot = g.draft.spec.slot;
	const on = doc.drafts[slot] === id;
	if (on) delete doc.drafts[slot];
	else doc.drafts[slot] = id;
	ui.selected = `gen:${id}`;
	playAudioCue(on ? 'unequip' : 'equip');
}
/** The project plus each worn draft's current preview item; the saved manifest is never changed. A running draft without a
 *  preview yet is a layerless stand-in whose target cells are all pending, so the stage says it is loading. */
function withDrafts(p: Project): Project {
	const ids = Object.values(doc.drafts);
	if (!ids.length) return p;
	const m = p.manifest,
		items: Item[] = [],
		images = new Map(p.images),
		slots = [...m.slots];
	for (const id of ids) {
		const g = gens.find((x) => x.draft.spec.id === id),
			prev = store.results[id]?.preview,
			it = prev?.manifest.items.find((i) => i.id === id);
		if (!g || g.draft.rigId !== doc.id) continue;
		const running = g.phase === 'running';
		if (prev && it) {
			items.push(running ? it : { ...it, pending: undefined }); // only a running draft is still loading; other gaps are missing
			for (const [h, im] of prev.images) if (!images.has(h)) images.set(h, im);
			const slot = prev.manifest.slots.find((x) => x.id === it.slot);
			if (slot && !slots.some((x) => x.id === slot.id)) insertSlotInLadder(slots, slot);
		} else if (running) {
			const { spec } = g.draft;
			items.push({
				id,
				name: g.input.name,
				slot: spec.slot,
				status: 'draft',
				mirror: 'generate',
				materials: [],
				prompt: spec.prompt,
				layers: [],
				baseHash: m.rig.baseHash,
				provenance: [],
				pending: spec.anims.flatMap((a) =>
					(spec.clipDirs?.[a] ?? spec.dirs).flatMap((d) =>
						Array.from(
							{ length: m.rig.animations.find((x) => x.id === a)?.cells ?? 0 },
							(_, i) => `${a}/${d}/${i}` as CellKey
						)
					)
				)
			});
		}
	}
	return items.length
		? { ...p, manifest: { ...m, items: [...m.items, ...items], slots }, images }
		: p;
}

// Keep it / Discard in flight for a draft: the other click is ignored (R6 P1-6: Discard during Keep it, then
// splice(indexOf(g) = -1) removed an unrelated, still-running draft).
const settling = new SvelteSet<string>();
const drop = (g: Gen) => {
	const i = gens.findIndex((x) => x.draft.spec.id === g.draft.spec.id);
	if (i >= 0) gens.splice(i, 1);
};
/** Keep it (or `auto`: a clean draft saving itself). Keep it wears the item; a saved draft keeps the slot it was worn in (same id)
 *  and reloads the open character in place. True when saved. */
export async function acceptGen(
	g: Gen,
	auto = false,
	keep?: 'finished' | 'available'
): Promise<boolean> {
	const id = g.draft.spec.id;
	// A background auto-save never pops Activity open in a follower tab; the draft stays ready to review there.
	if ((auto ? queue.role === 'follower' : follower()) || settling.has(id)) return false;
	settling.add(id);
	try {
		const ctx = await loadProject(g.draft.rigId);
		// `finished`: keep only the moves that completed (re-evaluated from their records); `available`: keep every verified
		// frame. The rest stay missing coverage.
		const part =
			keep === 'finished' && store.results[id]
				? (await itemRun()).finishedPart(
						$state.snapshot(g.draft) as Draft,
						ctx.rec.manifest.rig,
						store.results[id]!
					)
				: undefined;
		if (keep === 'finished' && !part)
			throw new LocalizedError(
				'The finished frames changed. Review the item again. Nothing was saved.',
				'state.finishedFramesChanged'
			);
		const item = await (
			await itemFlow()
		).accept(
			part ?? g.draft,
			ctx,
			part ? undefined : (store.results[id] ?? undefined),
			keep === 'available'
		);
		if (part) g.draft.acceptedAt = part.acceptedAt;
		const worn = doc.drafts[item.slot] === id;
		await saveGens();
		// a draft saving itself never cancels the open of another character the user just started
		if (auto ? viewing(g.draft.rigId) : doc.id === g.draft.rigId) {
			if (ui.selected === `gen:${id}`) ui.selected = item.id;
			await openProject(
				doc.id,
				auto ? { quiet: true, ...(worn ? { wear: item.id } : {}) } : { wear: item.id }
			);
		} else if (!viewing(g.draft.rigId)) void syncStoredProject(g.draft.rigId);
		if (doc.id !== g.draft.rigId) {
			drop(g);
			void refreshShared(); // the new item is offered to the character in view
		}
		toast(
			auto
				? message('state.nameSaved', { name: item.name })
				: message('state.nameAdded', { name: item.name })
		);
		return true;
	} finally {
		settling.delete(id);
	}
}
export async function cancelGen(g: Gen): Promise<boolean> {
	const id = g.draft.spec.id;
	if (queue.role === 'follower')
		throw new LocalizedError(
			'Cancel this item in the tab that is generating it. This tab has not stopped the generation.',
			'state.cancelThisItemInTheTabThat'
		);
	if (settling.has(id) || (g.phase !== 'running' && !g.canceled)) return false;
	settling.add(id);
	cancellationRequested.add(id);
	try {
		const controller = generationControllers.get(id) ?? new AbortController();
		for (const call of g.draft.calls)
			if (call.recId) queue.observeScope(call.recId, controller.signal);
		controller.abort();
		await generationRuns.get(id);
		await Promise.all(
			g.draft.calls.flatMap((call) => (call.recId ? [queue.cancelAbortedScope(call.recId)] : []))
		);
		g.canceled = true;
		g.cancelSaveFailed = false;
		g.phase = 'failed';
		g.status = '';
		g.error =
			'Canceled. Generations already used are not refunded. Requests already sent may still finish and charge. Review Activity for their outcomes.';
		takeOffGone();
		await saveGens();
		cancellationRequested.delete(id);
		return true;
	} catch (error) {
		g.cancelSaveFailed = true;
		throw error;
	} finally {
		settling.delete(id);
	}
}
export async function discardGen(g: Gen): Promise<boolean> {
	const id = g.draft.spec.id;
	if (follower() || settling.has(id)) return false;
	settling.add(id);
	try {
		drop(g);
		ui.selected = '';
		if (doc.drafts[g.draft.spec.slot] === id) delete doc.drafts[g.draft.spec.slot];
		await saveGens();
		return true;
	} finally {
		settling.delete(id);
	}
}
/** `key`: a background color measured from this attempt's colors (ItemResult.retryKey), so a collision is not repeated. */
export function retryGen(
	g: Gen,
	reviewedGens: number,
	key?: Key,
	minimumTier = requestTier({ method: 'POST', endpoint: '/edit-animation-v2', params: null })
) {
	const input = { ...structuredClone($state.snapshot(g.input)), ...(key ? { key } : {}) };
	const consent = {
		projectId: g.draft.rigId,
		gens: reviewedGens,
		...(doc.id === g.draft.rigId && store.project
			? { rig: JSON.stringify(store.project.manifest.rig) }
			: {}),
		replaces: {
			id: g.draft.spec.id,
			reviewed: stableStringify($state.snapshot({ draft: g.draft, input: g.input, phase: g.phase }))
		}
	};
	withKey(
		() =>
			void startItem(input, consent).catch((error) =>
				toast(
					error instanceof Error || (typeof error === 'string' && error)
						? errorMessage(error)
						: message('state.thisRetryCouldNotStartExistingArtwork'),
					{ tone: 'danger' }
				)
			),
		minimumTier
	); // closing Connect keeps the draft
}

/** Re-roll only the failed calls of a stopped draft at the reviewed price; every other completed call is reused. */
export function rerollGen(g: Gen, calls: number[], reviewedGens: number, minimumTier: number) {
	withKey(() => {
		const id = g.draft.spec.id;
		if (
			follower() ||
			settling.has(id) ||
			runningGens.has(id) ||
			g.phase === 'running' ||
			!gens.includes(g)
		)
			return;
		// Claimed before the first await: a second click finds it taken instead of buying the failed calls again with new seeds.
		settling.add(id);
		void (async () => {
			try {
				const { rec } = await loadProject(g.draft.rigId);
				const next = (await itemRun()).rerollFailed(
					$state.snapshot(g.draft) as Draft,
					calls,
					rec.manifest.rig
				);
				if (next.gens !== reviewedGens) {
					toast(message('state.rerollPriceChanged'), { tone: 'warning', report: false });
					return;
				}
				const before = {
					draft: g.draft,
					phase: g.phase,
					status: g.status,
					error: g.error,
					canceled: g.canceled
				};
				Object.assign(g, { draft: next.draft, phase: 'running', status: '', error: undefined });
				g.canceled = false;
				try {
					await saveGens();
				} catch (error) {
					Object.assign(g, before); // nothing was bought: the draft stays stopped, ready to re-roll again
					throw error;
				}
				// An explicit re-roll replaces an earlier cancel whose save failed; that cancel no longer holds the draft.
				cancellationRequested.delete(id);
			} finally {
				settling.delete(id);
			}
			if (g.phase === 'running') void runGen(g, undefined, true);
		})().catch((error: unknown) => toast(errorMessage(error), { tone: 'danger', error }));
	}, minimumTier);
}
/** Saving, canceling or re-rolling this draft has started and not finished: its paid choices wait. */
export const settlingGen = (id: string) => settling.has(id);

const WEEK = 7 * 86_400_000;
const FLOW_TAGS = ['studio-base', 'studio-rig', 'studio-move', 'studio-setup', 'm2-skel']; // flows re-attached by request hash
/**
 * Activity "Clear finished" (maxAge 0, sweeps blobs) and the leader's start-up prune (a week, records only). Deletes finished ledger records that no draft
 * references and no pending create/move may re-attach to (R6 P1-2), then, only while nothing is generating or being saved
 * in this tab, the blobs nothing references any more (R6 P2-15).
 * Demo copying publishes its record and blobs atomically, including when a follower copies during a leader's sweep.
 */
export async function cleanUp(maxAge = 0, sweep = true): Promise<{ jobs: number; blobs: number }> {
	if (queue.role === 'follower') return { jobs: 0, blobs: 0 };
	await loadGens(); // before the drafts load, `gens` is empty and their records would look unreferenced
	const drafts = [...gens.map((g) => g.draft), ...(await loadDrafts())];
	const refs = new Set(drafts.flatMap((d) => d.calls.flatMap((c) => [c.recId, ...c.old])));
	const projects = await db.all<unknown>('projects');
	// A deleted character keeps its drafts in its entry: those paid results must survive until the entry goes.
	for (const entry of listEntries(projects)) for (const id of draftCallIds(entry)) refs.add(id);
	const flow = !!(
		heldCreate() ||
		moving.spec ||
		settingUp.spec ||
		(await readCreateDrafts()).length ||
		(await db.get('projects', MOVE_KEY)) ||
		(await db.get('projects', SETUP_KEY))
	);
	const cutoff = Date.now() - maxAge;
	const stateScopes = new Set(
		projects.flatMap((value) =>
			stateAttempts(value as StoredProject).flatMap((attempt) =>
				attempt.plan.batches.map((_, index) => stateBatchScope(attempt.token, index))
			)
		)
	);
	const appearanceScopes = new Set(
		projects.flatMap((value) =>
			Object.values((value as Partial<StoredProject> | undefined)?.appearanceEdits ?? {}).flatMap(
				(attempt) => attempt.plan.batches.map((_, index) => appearanceBatchScope(attempt.id, index))
			)
		)
	);
	const jobs = await queue.clearFinished(
		(r) =>
			refs.has(r.id) ||
			(r.tag === 'studio-state' && !!r.activityScope && stateScopes.has(r.activityScope)) ||
			(r.tag === 'studio-appearance' &&
				!!r.activityScope &&
				appearanceScopes.has(r.activityScope)) ||
			((flow || heldCreate()) && FLOW_TAGS.includes(r.tag ?? '')) ||
			(r.finishedAt ?? r.createdAt) > cutoff
	);
	const idle =
		sweep && !flow && !heldCreate() && queue.idle() && !runningGens.size && !settling.size;
	return { jobs, blobs: idle ? await db.gcBlobs() : 0 };
}

export function openNewItem(
	group: string,
	prefill?: { slot?: string; prompt?: string; name?: string; route?: Item['route'] }
) {
	ui.newItem = {
		group,
		slot: prefill?.slot ?? group,
		prompt: prefill?.prompt ?? '',
		name: prefill?.name ?? '',
		reuseMethod: prefill?.route !== undefined,
		// Trying an item again keeps the animation method it was made with.
		...(prefill?.route === 'ea2-anchor'
			? { method: 'anchor' as const }
			: prefill?.route === 'skeleton-pose'
				? { method: 'skel' as const }
				: {})
	};
	ui.sheet = 'newitem';
}

// ---------- Wardrobe categories (organization and custom slots: free, never generation) ----------
/** Categories holding items or attempts on the open character: Wardrobe shows them even when Not shown. */
export function busySlots(m = store.project?.manifest): Set<string> {
	const out = new Set<string>();
	if (!m) return out;
	for (const it of m.items) out.add(it.slot);
	for (const g of gens) if (g.draft.rigId === doc.id) out.add(g.input.slot);
	return out;
}
const draftRefs = (list: readonly Gen[]): DraftRef[] =>
	list.map((g) => ({ rigId: g.draft.rigId, slot: g.input.slot, phase: g.phase }));
/** What a category holds by this tab's view (instant, for labels and disabled states). */
export const slotUseHere = (key: string): SlotUse =>
	store.project
		? slotUse(store.project.manifest, doc.id, key, draftRefs(gens))
		: { items: 0, making: 0, stopped: 0 };
/** What a category holds, including attempts saved by any tab (read fresh, since another tab may run them). Rejects when
 *  the saved attempts cannot be read: a destructive change then waits rather than guessing. */
async function slotUseNow(key: string): Promise<SlotUse> {
	const projectId = doc.id;
	const saved = await readGens().catch((e: unknown) => {
		throw new LocalizedError(
			`Saved item attempts could not be read: ${errorText(e)}`,
			'state.savedItemAttemptsCouldNotBeRead',
			{ reason: errorMessage(e) }
		);
	});
	if (doc.id !== projectId || !store.project)
		throw new LocalizedError(
			'The character changed meanwhile. Try again.',
			'state.theCharacterChangedMeanwhileTryAgain'
		);
	return slotUse(
		store.project.manifest,
		projectId,
		key,
		draftRefs(uniqueBy([...gens, ...saved], (g) => g.draft.spec.id))
	);
}
type SlotEdit = Pick<Manifest, 'slots' | 'rig' | 'items' | 'presets'>;
const trialOf = (m: Manifest): SlotEdit => ({
	slots: structuredClone(m.slots),
	presets: structuredClone(m.presets),
	items: m.items,
	rig: m.rig
});
/** One undoable organization step: the edit runs on copies first, so a refused edit changes nothing. No generation. */
function organize(label: Message, edit: (m: SlotEdit) => void) {
	const m = store.project?.manifest;
	if (!m) throw new LocalizedError('No character is open.', 'state.noCharacterIsOpen');
	const trial = trialOf(m);
	edit(trial);
	const gone = m.slots.filter((x) => !trial.slots.some((y) => y.id === x.id)).map((x) => x.id);
	commit(label, () => {
		m.slots = trial.slots;
		m.presets = trial.presets;
		for (const key of gone) {
			delete doc.items[key];
			delete doc.drafts[key];
		}
	});
}
/** Show a Not shown category again, at the end of the Wardrobe. Returns what to announce, or '' when already shown. No undo
 *  step: generation and fitting call it as a side effect of putting work there. */
function revealSlot(key: string): Message | undefined {
	const m = store.project?.manifest;
	if (!m || key === BASE_KEY) return;
	const c = categories(m).find((x) => x.key === key);
	if (!c?.hidden) return;
	setHidden(m, key, false, busySlots(m));
	bump();
	save();
	return message('state.categoryNowShown', { name: c.label });
}
export function showSlot(key: string) {
	const m = store.project!.manifest;
	organize(message('history.show', { name: slotLabel(m, key) }), (x) =>
		setHidden(x, key, false, busySlots(m))
	);
}
export function showSlotAt(key: string, to: number) {
	const m = store.project!.manifest;
	organize(message('history.show', { name: slotLabel(m, key) }), (x) => {
		setHidden(x, key, false, busySlots(m));
		moveCategory(x, key, to, busySlots(m));
	});
}
/** Hide an empty category from Wardrobe. Returns why it cannot be hidden, or '' once hidden. */
export async function hideSlot(key: string): Promise<string> {
	const m = store.project!.manifest,
		label = slotLabel(m, key);
	const reason = busyReason(label, await slotUseNow(key), 'be hidden');
	if (reason) return reason;
	organize(message('history.hide', { name: label }), (x) => setHidden(x, key, true, busySlots(m)));
	return '';
}
/** Move a shown category to position `to` in Wardrobe. Drawing order never changes. */
export function moveSlot(key: string, to: number) {
	const m = store.project!.manifest;
	organize(message('history.moveCategory', { name: slotLabel(m, key) }), (x) =>
		moveCategory(x, key, to, busySlots(m))
	);
}
/** Add a custom category (a blank name becomes the next Accessory). Returns its permanent key. */
export function addSlot(o: NewSlot): string {
	const m = store.project!.manifest;
	let key = '';
	organize(message('history.addCategory'), (x) => (key = addCustom(x, o, busySlots(m))));
	return key;
}
/** Save a custom category's settings form: every part is checked on a copy first, attempts are read fresh once when the
 *  attachment changes (another tab may be making an item there), and it lands as one undo step or not at all. Returns why
 *  it was refused, or ''. */
export async function saveSlotSettings(key: string, o: SlotSettings): Promise<string> {
	const projectId = doc.id,
		m = store.project!.manifest,
		label = slotLabel(m, key),
		definition = JSON.stringify(m.slots.find((s) => s.id === key));
	applySettings(trialOf(m), key, o); // throws why a name, hint or order is refused, before anything changes
	if (changesAttachment(m, key, o)) {
		const reason = busyReason(label, await slotUseNow(key), 'change how it attaches');
		if (reason) return reason;
		const now = store.project?.manifest;
		if (
			doc.id !== projectId ||
			!now ||
			JSON.stringify(now.slots.find((s) => s.id === key)) !== definition
		)
			return `${label} changed meanwhile. Nothing was saved; review it again.`;
	}
	organize(message('history.changeCategory', { name: label }), (x) => applySettings(x, key, o));
	return '';
}
/** Delete a custom category. An empty one is an undoable organization step. One with saved items (exactly `items`, the count
 *  the person confirmed) goes with them in one atomic write, rechecked against the saved record: the category, its items, their
 *  colors and outfit entries are all deleted or nothing is. That cannot be undone. Attempts being made or stopped and new moves
 *  for its items must finish or be dismissed first. Returns why it cannot be deleted, or ''. */
export async function deleteSlot(key: string, items = 0): Promise<Message | string> {
	const projectId = doc.id,
		request = openRequest,
		label = slotLabel(store.project!.manifest, key);
	await flushSave(); // the saved record now matches this view, and the checks below are the last before the write
	if (doc.id !== projectId || request !== openRequest)
		return message('state.characterChangedNothingDeleted');
	const use = await slotUseNow(key);
	if (use.making || use.stopped)
		// Nested messages: SlotsSheet formats them (studio/nestedMessage.ts).
		return message('studioSlots.busy.delete', {
			label,
			items: slotUseMessages(use),
			stopped: use.stopped ? message('studioSlots.busy.dismissStopped') : ''
		});
	const m = store.project!.manifest,
		owned = m.items.filter((it) => it.slot === key).map((it) => it.id);
	if (owned.length !== items)
		return owned.length
			? message('state.categoryNowHasItems', { label, count: owned.length })
			: message('state.categoryNowHasNoItems', { label });
	if (owned.some((id) => pendingMoves(projectId, id).length))
		return message('state.categoryItemsGettingMoves', { label });
	if (isDemo()) return message('slotsSheet.demoDeleteLocked');
	const definition = JSON.stringify(m.slots.find((s) => s.id === key));
	const prune = await keysToPruneAndForget();
	let kept: RecentlyDeleted | undefined;
	try {
		kept = await deleteItems<RecentlyDeleted>(
			projectId,
			owned,
			(rec) => {
				if (JSON.stringify(rec.manifest.slots.find((s) => s.id === key)) !== definition)
					throw new LocalizedError(
						`${label} changed meanwhile. Review it again before deleting.`,
						'state.labelChangedMeanwhileReviewItAgainBefore',
						{ label }
					);
				if (rec.manifest.items.some((it) => it.slot === key))
					throw new LocalizedError(
						`${label} has new items. Review it again before deleting.`,
						'state.labelHasNewItemsReviewItAgain',
						{ label }
					);
				deleteCustom(rec.manifest, key);
				if (rec.dress?.current) delete rec.dress.current.items[key];
			},
			(rec) => {
				const entry = deletedEntry({
					kind: 'category',
					record: rec,
					name: label,
					context: rec.manifest.name,
					scope: { itemIds: owned, slot: key }
				});
				return { key: entry.id, entry, prune };
			},
			prune
		);
	} catch (e) {
		if ((e as DOMException)?.name === 'QuotaExceededError')
			return message('recentlyDeleted.errors.full');
		return message('state.reasonNothingDeleted', { reason: errorMessage(e) });
	}
	await refreshRecentlyDeleted();
	notifyLibraryChanged(projectId);
	const notice =
		owned.length === 0
			? message('state.removedName', { name: label })
			: message('state.categoryAndItemsDeleted', { label, count: owned.length });
	if (kept)
		toast(notice, {
			duration: 10000,
			actionLabel: message('common.undo'),
			action: () => void restoreDeleted(kept!.id)
		});
	else toast(notice);
	if (doc.id === projectId && request === openRequest) {
		// Quietly, so the delete stays undoable: the category's worn items leave the live outfit.
		await openProject(projectId, { quiet: true });
		if (ui.group === key)
			ui.group = shownCategories(store.project!.manifest, busySlots())[0]?.key ?? 'head';
		for (const id of owned) {
			const item = m.items.find((it) => it.id === id);
			if (!item) continue;
			delete doc.drafts[item.slot];
			if (doc.items[item.slot] === id) doc.items[item.slot] = null;
		}
		bump();
		save();
		if (kept) pushRecovery(message('history.deleteCategory', { name: label }), kept.id);
	}
	return '';
}

/** Progress of an item generation from the job ledger: share of calls done (+ the running calls' own progress). */
export function genProgress(g: Gen, jobs: JobRec[]): { pct: number } {
	if (g.phase === 'review') return { pct: 100 };
	if (g.phase === 'failed') return { pct: 0 };
	const recs = g.draft.calls.map((c) => jobs.find((j) => j.id === c.recId));
	const part = recs.reduce(
		(s, r) =>
			s +
			(r?.state === 'done'
				? 1
				: r?.state === 'running'
					? Math.min(0.95, r.jobs[0]?.progress ?? 0.1)
					: 0),
		0
	);
	const pct = Math.round((part / Math.max(1, recs.length)) * 100);
	return { pct };
}

// A caught failure must stay terminal across reload; only an explicit start clears it. A load failure is not one: the
// pipeline never ran, so the saved run stays running for a reload to resume.
interface FlowDraft<S> {
	spec: S;
	status?: 'running' | 'failed' | 'review';
	error?: string;
	/** The failure was a PaidStepError: its review (such as a single repair batch re-roll) survives a reload. */
	paid?: { key: WhisperKey; vars?: WhisperVars; step: PaidStep };
	/** Any other translated failure: its code and translation survive a reload, so recovery never reads the English. */
	message?: Message;
	progress?: Progress | null;
	requestText?: number;
}
function restoredFlowError(record: FlowDraft<{ activityScope?: string }>, fallback: string) {
	const raw = record.error || fallback;
	if (record.paid && record.error)
		return new PaidStepError(raw, record.paid.key, record.paid.vars, record.paid.step);
	if (record.message && record.error)
		return new LocalizedError(raw, record.message.key, record.message.vars);
	if (raw === STOPPED) return new LocalizedError(raw, 'generation.outcome.stopped');
	if (raw === SETUP_STOPPED) return new LocalizedError(raw, 'generation.outcome.setupStopped');
	if (raw === REPAIR_REVIEW_RECOVERY) return new LocalizedError(raw, 'repairReview.recover');
	const restriction = localizedPlanRestriction(raw) ?? localizedAutomaticRepairError(raw);
	if (restriction) return restriction;
	const resume =
		'. Generation stopped without resending. Review this request in Activity before starting again.';
	for (const job of queue.snapshot().jobs) {
		if (job.state !== 'failed' && job.state !== 'lost' && job.state !== 'canceled') continue;
		if (
			!record.progress?.recIds?.includes(job.id) &&
			(!record.spec.activityScope || record.spec.activityScope !== job.activityScope)
		)
			continue;
		const error = job.error ? ` (${job.error.slice(0, 160)})` : '';
		const caption = `${job.label}: ${job.state}${error}`;
		if (raw === caption || raw === `${caption}${resume}`)
			return new LocalizedError(
				raw,
				raw === caption ? 'create.errors.requestStopped' : 'create.errors.requestStoppedResume',
				{ state: activityStateMessage(job.state), error }
			);
	}
	return raw;
}
async function persistFlowFailure(
	key: string,
	record: object,
	error: unknown,
	write = (r: object): Promise<unknown> => db.put('projects', key, r)
): Promise<string | LocalizedError> {
	const text = errorText(error);
	const shown = error instanceof LocalizedError ? error : text;
	if (error instanceof LoadError) return shown;
	try {
		await write({
			id: key,
			...record,
			status: 'failed',
			error: text,
			...(error instanceof PaidStepError
				? {
						paid: {
							key: error.translation.key,
							vars: error.translation.vars,
							step: error.paid
						}
					}
				: error instanceof LocalizedError
					? { message: error.translation }
					: {})
		});
	} catch {
		return new LocalizedError(
			`${text} Could not save this failure on this device. Dismiss this operation before reloading.`,
			'state.couldNotSaveFlowFailure',
			{ error: errorMessage(error) }
		);
	}
	return shown;
}

// ---------- create character ----------
// Persist the inspector identity with the resumable spec. A new seed starts a distinct run.
function withActivityScope<T extends { seed: number; activityScope?: string }>(
	spec: T,
	kind: string
): T {
	const prefix = `${kind}:${spec.seed}:`;
	return {
		...spec,
		activityScope: spec.activityScope?.startsWith(prefix)
			? spec.activityScope
			: `${prefix}${crypto.randomUUID()}`
	};
}
/** `views`: the standing views, shown while the rest of creation finishes (not persisted: a resume re-reads the cached draw). */
interface CreateAttempt {
	id: string;
	spec: CreateSpec;
	running: boolean;
	projectId: string;
	progress: Progress | null;
	error: string | LocalizedError;
	views: { id: DirectionName; img: Img }[];
}
export const creates = $state<CreateAttempt[]>([]);
const createDraftKey = (id: string) => `${db.CREATE_DRAFT_PREFIX}${id}`;
async function readCreateDrafts() {
	return (await db.all<FlowDraft<CreateSpec> & { id: string }>('projects')).filter(
		(record) =>
			!!record?.spec?.projectId &&
			record.id?.startsWith(db.CREATE_DRAFT_PREFIX) &&
			!incompatibleKind(record) // saved before direction plans: kept as stored, never resumed
	);
}
function removeCreate(run: CreateAttempt) {
	const index = creates.indexOf(run);
	if (index >= 0) creates.splice(index, 1);
	if (createPresentation.id === run.id) createPresentation.id = '';
}
function addCreate(id: string, spec: CreateSpec) {
	creates.push({
		id,
		spec,
		running: false,
		projectId: '',
		progress: null,
		error: '',
		views: []
	});
	return creates[creates.length - 1];
}
export function reviewFailedCreate(id: string) {
	if (!creates.some((run) => run.id === id && run.error && !run.running)) return;
	ui.sheet = 'create';
	createPresentation.id = id;
}
const canDriveCreate = () => !hmrReloading && queue.role !== 'follower';
export async function startCreate(input: CreateSpec, present = false, attemptId?: string) {
	if (!canDriveCreate()) return;
	// A new creation fixes its placement now (absent when 0, like other defaults); a resumed one keeps the lift its
	// registration was sent with.
	const lift = input.projectId || !input.frame ? input.lift : canvasLift(input.size, input.frame);
	const spec = withActivityScope(
		{
			...input,
			lift: lift || undefined,
			projectId: input.projectId ?? `rig-${crypto.randomUUID()}`
		},
		'create'
	);
	const id = attemptId ?? spec.projectId;
	const run = creates.find((attempt) => attempt.id === id) ?? addCreate(id, spec);
	if (run.running || run.projectId) return;
	if (present) {
		ui.sheet = 'create';
		createPresentation.id = run.id;
	}
	run.running = true;
	const key = createDraftKey(run.id);
	let active = true;
	const current = () => canDriveCreate() && active;
	let callbacksDone = false;
	Object.assign(run, { spec, error: '', progress: null, views: [] });
	try {
		await db.put('projects', key, {
			id: key,
			spec,
			status: 'running',
			requestText: REQUEST_TEXT
		});
		const flow = await createFlow();
		if (!current()) return;
		const id = await flow.createCharacter(
			spec,
			(progress) => {
				if (current() && !callbacksDone) run.progress = progress;
			},
			(views) => {
				if (current() && !callbacksDone) run.views = views;
			}
		);
		if (!current()) return;
		callbacksDone = true;
		const acknowledgments = await Promise.allSettled([
			db.del('projects', key),
			refreshAfterCreate()
		]);
		if (!current()) return;
		for (const acknowledgment of acknowledgments)
			if (acknowledgment.status === 'rejected')
				toast(
					message('state.couldNotSaveReason', { reason: errorMessage(acknowledgment.reason) }),
					{
						tone: 'danger'
					}
				);
		// A result also waits behind a sheet opened over New character, which steps back to it.
		if (createPresentation.id === run.id || creatorReturn?.attempt === run.id) run.projectId = id;
		else removeCreate(run);
		if (present) playAudioCue('success');
	} catch (e) {
		if (current()) {
			callbacksDone = true;
			run.error = e instanceof LocalizedError ? e : errorText(e);
			const error = await persistFlowFailure(
				key,
				{ spec, progress: $state.snapshot(run.progress) },
				e
			);
			if (current()) {
				run.error = error;
				if (present && !(e instanceof LoadError) && !isGenerationCancellation(e))
					playAudioCue('failure');
			}
			if (current() && (ui.sheet !== 'create' || createPresentation.id !== run.id))
				toast(message('state.createFailedOpen', { name: spec.name }), {
					tone: 'danger',
					report: false,
					duration: 8000,
					action: () => reviewFailedCreate(run.id)
				});
		}
	} finally {
		active = false;
		run.running = false;
	}
}
let createRefresh = Promise.resolve(true);
function refreshAfterCreate() {
	const refresh = createRefresh.then(refreshProjects);
	createRefresh = refresh.catch(() => false);
	return refresh;
}
let createResumed = false,
	createRestoring = false;
export async function resumeCreate() {
	if (!canDriveCreate() || createResumed || createRestoring) return;
	createRestoring = true;
	try {
		const records = await readCreateDrafts();
		if (!canDriveCreate()) return;
		createResumed = true;
		for (const record of records) {
			const id = record.id.slice(db.CREATE_DRAFT_PREFIX.length);
			if (creates.some((run) => run.id === id)) continue;
			if (!halted(record)) void startCreate(record.spec, false, id);
			else {
				const run = addCreate(id, record.spec);
				run.progress = record.progress ?? null;
				run.error = restoredFlowError(record, STOPPED);
			}
		}
	} finally {
		createRestoring = false;
	}
}
export async function discardCreate(id: string) {
	const run = creates.find((attempt) => attempt.id === id);
	if (!canDriveCreate() || !run || !run.error || run.running) return false;
	run.running = true;
	try {
		await db.del('projects', createDraftKey(id));
		removeCreate(run);
		return true;
	} catch (error) {
		toast(message('state.couldNotSaveReason', { reason: errorMessage(error) }), {
			error,
			tone: 'danger'
		});
		return false;
	} finally {
		run.running = false;
	}
}

// ---------- add a move (one at a time, FIFO; resumable like create) ----------
type QueuedMove = { projectId: string; spec: MoveSpec };
// Track intent only for this page, since a recovered queue can replay results that were already seen.
const localQueuedMoves = new WeakSet<QueuedMove>();
/** `queued`: moves waiting for the current one. Persisted with it, so closing the sheet or reloading keeps the order. */
export const moving = $state({
	spec: null as MoveSpec | null,
	projectId: '',
	progress: null as Progress | null,
	error: '' as string | LocalizedError,
	done: false,
	warnings: [] as string[],
	qualityDirs: [] as NonNullable<MoveSpec['approvedDirs']>,
	queued: [] as QueuedMove[],
	repairReview: null as RepairReview | null,
	repairApplied: false,
	resolvingRepair: false
});
const MOVE_KEY = 'studio-move';
let moveRunning = $state(false),
	moveReviewPublishing = $state(false),
	moveRevision = 0;
/** The stored move record without its queue (null: the current move is finished or dismissed). */
let moveRecord: object | null = null,
	moveWrites: Promise<unknown> = Promise.resolve();
/** The only writer of the stored move: writes run in order and each reads the live queue when it runs, so a move queued at any
 *  time is kept and an older record never comes back. Between moves the first waiting one is stored as running (a reload
 *  starts it). */
function storeMove(record = moveRecord) {
	moveRecord = record;
	const write = moveWrites.then(() => {
		const queued = $state.snapshot(moving.queued),
			[next, ...rest] = queued;
		if (moveRecord) return db.put('projects', MOVE_KEY, { ...moveRecord, queued });
		return next
			? db.put('projects', MOVE_KEY, {
					id: MOVE_KEY,
					spec: next.spec,
					projectId: next.projectId,
					status: 'running',
					requestText: REQUEST_TEXT,
					queued: rest
				})
			: db.del('projects', MOVE_KEY);
	});
	moveWrites = write.catch(() => {}); // ordering only: each caller handles its own write's error
	return write;
}
/** Queue moves behind the current one; start the first now when nothing is pending. A failed move holds the queue until it
 * is retried (the queue continues) or dismissed (the queue is dropped). */
export async function queueMoves(projectId: string, specs: MoveSpec[]) {
	if (hmrReloading || !specs.length) return;
	const added = specs.map((spec) => {
		const entry = $state<QueuedMove>({ projectId, spec });
		localQueuedMoves.add(entry);
		return entry;
	});
	moving.queued = [...moving.queued, ...added];
	if (moveRunning || (moving.spec && !moving.done)) {
		await storeMove();
		return;
	}
	await startQueuedMove();
}

async function startQueuedMove() {
	const [next, ...rest] = moving.queued;
	moving.queued = rest;
	await startMove(next.projectId, next.spec, localQueuedMoves.has(next));
}

export async function refreshMoveReviews(projectId: string) {
	const record = await db.get<StoredProject>('projects', projectId);
	if (viewing(projectId)) store.moveReviews = record?.moveReviews ?? {};
}

export function openMoveReview(id: string) {
	ui.moveReview = id;
	ui.sheet = 'moveReview';
}

export function moveReviewBlocked(projectId: string) {
	if (characterJobsInOtherTab) return 'state.manageMovesInOtherTab';
	if (workHolds(projectId)) return 'directionsSheet.waitForGeneration';
	return '';
}

export async function saveReviewedMove(
	projectId: string,
	candidate: NonNullable<StoredProject['moveReviews']>[string],
	accept: boolean
) {
	const blocked = moveReviewBlocked(projectId);
	if (blocked) throw new LocalizedError('Move review is blocked by other work.', blocked);
	moveReviewPublishing = true;
	try {
		const input = await (await createFlow()).resolveMoveCandidate(projectId, candidate, accept);
		// Accepting a reviewed move saves the character even when another one is open here.
		if (accept && !viewing(projectId)) await syncStoredProject(projectId);
		return input;
	} finally {
		moveReviewPublishing = false;
	}
}
/** A character's moves running, publishing or queued; with `itemId`, only those that pose that item. */
export const pendingMoves = (projectId: string, itemId?: string): MoveSpec[] =>
	[
		...(moving.spec && (!moving.done || moveRunning) && moving.projectId === projectId
			? [moving.spec]
			: []),
		...moving.queued.filter((q) => q.projectId === projectId).map((q) => q.spec)
	].filter((s) => !itemId || s.items.includes(itemId));
/** A character's items being drawn on its saved moves and States (itemJobs.ts), for the clip rows and Wardrobe tiles. */
export function characterItemJobs(projectId: string, jobs: readonly JobRec[]) {
	const local =
		moving.spec && (!moving.done || moveRunning) && moving.projectId === projectId
			? { spec: moving.spec, progress: moving.progress }
			: null;
	// A follower shows the items another tab is drawing from the mirrored record, read-only.
	const elsewhere =
		!local && characterJobsInOtherTab && elsewhereMove.current?.projectId === projectId
			? elsewhereMove.current
			: null;
	const spec = local?.spec ?? elsewhere?.spec ?? null;
	const list = itemJobs(
		spec && {
			spec,
			progress: local?.progress ?? elsewhere?.progress ?? null,
			attention: !!local && (!!moving.error || !!moving.repairReview)
		},
		[
			...moving.queued.filter((q) => q.projectId === projectId).map((q) => q.spec),
			...(elsewhere?.queued.filter((q) => q.projectId === projectId).map((q) => q.spec) ?? [])
		],
		jobs
	);
	// A request leaves the queue before its view is saved and counted: the share shown never goes back meanwhile.
	for (const job of list)
		if (job.status === 'drawing' && spec) {
			const key = `${projectId}/${spec.activityScope ?? spec.seed}/${spec.attempt ?? ''}/${job.clip}/${job.item}`;
			job.percent = Math.max(job.percent, shownItemPercent.get(key) ?? 0);
			shownItemPercent.set(key, job.percent);
		}
	return list;
}
const shownItemPercent = new Map<string, number>();

export async function pendingBodyMoveName(projectId: string, id: string) {
	const matches = (spec: MoveSpec) => !spec.itemsOnly && sameClipName(spec.id, id);
	if (pendingMoves(projectId).some(matches)) return true;
	const saved = await db.get<QueuedMove & { queued?: QueuedMove[] }>('projects', MOVE_KEY);
	return [saved, ...(saved?.queued ?? [])].some(
		(move) => move?.projectId === projectId && !!move.spec && matches(move.spec)
	);
}

export async function startMove(projectId: string, spec: MoveSpec, announce = true) {
	if (hmrReloading) return;
	if (relocating) await saving;
	if (moving.repairReview) {
		toast(message('repairReview.finishFirst'), {
			tone: 'warning',
			report: false,
			action: () => openFlow('move', moving.projectId)
		});
		return;
	}
	if (spec.reuseItemFrames && queue.role === 'follower') {
		toast(message('state.useSavedFramesInTheTabThat'), { tone: 'warning', report: false });
		return;
	}
	if (moveRunning || moveReviewPublishing) {
		toast(message('state.anotherMoveIsStillBeingAddedSo'), {
			tone: 'warning',
			report: false,
			action: () => openFlow('move', moving.projectId)
		});
		return;
	}
	// A fresh attempt (a new seed) of the move on screen would buy its views again while one of its earlier requests is still
	// at PixelLab, in this tab or another, before its outcome is known. Read from the shared ledger at click time.
	const prior = moving.projectId === projectId ? moving.spec : null;
	if (
		prior?.activityScope &&
		prior.id === spec.id &&
		prior.seed !== spec.seed &&
		queue.snapshot().jobs.some((r) => r.activityScope === prior.activityScope && live(r))
	) {
		toast(message('state.moveStillAtPixelLab'), {
			tone: 'warning',
			report: false,
			action: () => openFlow('move', projectId)
		});
		return;
	}
	spec = withActivityScope($state.snapshot(spec), 'move'); // queued specs are reactive proxies, which storage cannot clone
	moveRunning = true;
	const revision = ++moveRevision,
		current = () =>
			revision === moveRevision &&
			moveRunning &&
			(!spec.reuseItemFrames || queue.role !== 'follower');
	const moveName = spec.id[0].toUpperCase() + spec.id.slice(1).replace(/-/g, ' ');
	let failed = false;
	Object.assign(moving, {
		spec,
		projectId,
		progress: null,
		error: '',
		done: false,
		warnings: []
	});
	try {
		if (spec.itemReview || spec.reviewedMoveItems) {
			const { rec } = await loadProject(projectId);
			if (!(await createFlow()).itemMoveReviewMatches(rec.manifest, spec)) {
				throw new LocalizedError(
					'This character, item or price changed. Reopen the item and review its current estimate before generating. No paid request was made.',
					'create.errors.characterItemPriceChanged'
				);
			}
		}
		await storeMove({
			id: MOVE_KEY,
			spec,
			projectId,
			status: 'running',
			requestText: REQUEST_TEXT
		});
		const flow = await createFlow(),
			progress = (p: Progress) => {
				if (current() && !failed) moving.progress = p;
			},
			reviewedItems = spec.itemReview;
		const result = reviewedItems
			? await flow.addMove(projectId, spec, progress, async () => {
					// The pipeline mutates its raw spec. Clear the reactive copy too, including any cached property read by the sheet.
					if (current() && moving.spec) delete moving.spec.itemReview;
					try {
						await storeMove({
							id: MOVE_KEY,
							spec,
							projectId,
							status: 'running',
							requestText: REQUEST_TEXT
						});
					} catch (error) {
						if (current() && moving.spec) moving.spec.itemReview = reviewedItems;
						throw error;
					}
				})
			: await flow.addMove(projectId, spec, progress);
		if (!current()) return;
		if (result.repairReview) {
			const progress = $state.snapshot(moving.progress);
			try {
				await storeMove({
					id: MOVE_KEY,
					spec,
					projectId,
					status: 'review',
					requestText: REQUEST_TEXT,
					progress,
					repairReview: result.repairReview
				});
			} catch {
				const unsaved =
					'The repair is available in this tab, but its review could not be saved. Decide before closing or reloading.';
				const fallback = await persistFlowFailure(
					MOVE_KEY,
					{ spec, projectId, progress },
					new LocalizedError(REPAIR_REVIEW_RECOVERY, 'repairReview.recover'),
					storeMove
				);
				if (current())
					moving.error =
						fallback instanceof LocalizedError &&
						fallback.translation.key === 'state.couldNotSaveFlowFailure'
							? new LocalizedError(
									`${unsaved} Recovery after reload is not guaranteed.`,
									'repairReview.unsavedMayNotRecover',
									{ notice: message('repairReview.unsaved') }
								)
							: new LocalizedError(unsaved, 'repairReview.unsaved');
			}
			if (!current()) return;
			moving.repairReview = result.repairReview;
			if (ui.sheet !== 'move')
				toast(message('repairReview.ready'), {
					tone: 'warning',
					report: false,
					action: () => openFlow('move', projectId)
				});
			if (announce) playAudioCue('item');
			return;
		}
		moving.warnings = result.warnings;
		moving.qualityDirs = result.qualityDirs ?? [];
		moving.done = true;
		await storeMove(null); // the next waiting move replaces this record in one write, so a reload between moves keeps the queue
		if (!current()) return;
		if (result.moveReview) {
			const id = result.moveReview;
			await refreshMoveReviews(projectId);
			if (!current()) return;
			moving.spec = null;
			if (viewing(projectId) && ui.sheet === 'move' && !ui.moveFormOpen) openMoveReview(id);
			else
				toast(message('moveSheet.checkpoint.ready', { move: moveName }), {
					action: async () => {
						if (!viewing(projectId)) await openProject(projectId);
						if (viewing(projectId) && Object.hasOwn(store.moveReviews, id)) openMoveReview(id);
					}
				});
		} else if (spec.itemsOnly) {
			// items posed onto a move the body already had: the move and the undo history stay as they are
			if (viewing(projectId)) {
				await openProject(projectId, { quiet: true });
				if (!current()) return;
			} else await syncStoredProject(projectId);
			const names = spec.items
				.map((id) => store.project?.manifest.items.find((i) => i.id === id)?.name)
				.filter(Boolean)
				.join(', ');
			const grid = spec.itemMethod === 'grid';
			toast(
				names
					? message(grid ? 'state.itemsRedrawnForMove' : 'state.itemsPosedForMove', {
							names,
							moveName
						})
					: message(grid ? 'state.equipmentRedrawnForMove' : 'state.equipmentPosedForMove', {
							moveName
						})
			);
		} else {
			if (viewing(projectId)) {
				await openProject(projectId);
				if (!current()) return;
				if (viewing(projectId)) {
					ui.anim = spec.id;
					ui.frame = 0;
					ui.playing = true;
				}
			} else await syncStoredProject(projectId);
			toast(message('state.moveNameAdded', { moveName }));
		}
		const reviewItem = result.reviewItems?.[0];
		if (reviewItem)
			toast(
				message('state.moveNameHasItemIssuesToReviewNo', {
					moveName: displayMoveJob(
						moveName,
						{ items: [reviewItem], itemsOnly: true },
						store.project?.manifest.items
					)
				}),
				{
					tone: 'warning',
					action: () => openItemReview(projectId, reviewItem, spec.id)
				}
			);
		if (announce && current()) playAudioCue(spec.itemsOnly ? 'item' : 'success');
	} catch (e) {
		if (current()) {
			failed = true;
			moving.error = e instanceof LocalizedError ? e : errorText(e);
			const error = await persistFlowFailure(
				MOVE_KEY,
				{ spec, projectId, progress: $state.snapshot(moving.progress) },
				e,
				storeMove
			);
			if (current()) {
				moving.error = error;
				if (announce && !(e instanceof LoadError) && !isGenerationCancellation(e))
					playAudioCue('failure');
			}
			// queued moves now run unattended: a failure that holds them says so wherever the user is
			if (current() && ui.sheet !== 'move')
				toast(message('state.moveFailedOpen', { moveName }), {
					tone: 'danger',
					report: false,
					duration: 8000,
					action: () => openFlow('move', projectId)
				}); // timed: the Moves panel keeps the failure, and a persistent error would hide later successes
		}
	} finally {
		if (revision === moveRevision) moveRunning = false;
	}
	// the live queue after the finish steps: a move queued while this one finished is never left behind
	if (revision === moveRevision && moving.done && moving.queued.length) {
		await startQueuedMove();
	}
}
/** Explicit consent to reuse cached body frames or retry only the reviewed checks, keeping the original body identity. */
export async function retryMoveMeasurements(
	projectId: string,
	spec: MoveSpec,
	reviewed: MeasurementRecoveryPlan
) {
	const pending = JSON.stringify($state.snapshot(spec));
	const unchanged = () =>
		!hmrReloading &&
		!moveRunning &&
		moving.projectId === projectId &&
		!!moving.error &&
		!moving.done &&
		JSON.stringify($state.snapshot(moving.spec)) === pending;
	if (!unchanged())
		throw new LocalizedError(
			'This operation changed. Review the joint checks again.',
			'state.thisOperationChangedReviewTheJointChecks'
		);
	const current = (await (await createFlow()).reviewMoveRecovery(projectId, spec)).recovery;
	const review = (plan: MeasurementRecoveryPlan) =>
		JSON.stringify({
			...plan,
			recordIds: [...plan.recordIds].sort(),
			checkHashes: [...plan.checkHashes].sort(),
			rawHashes: [...plan.rawHashes].sort(),
			palette: plan.palette && { ...plan.palette, directions: [...plan.palette.directions].sort() }
		});
	const eligible =
		current &&
		(current.checks > 0
			? current.recordIds.length > 0
			: current.checks === 0 &&
				!current.recordIds.length &&
				!!(spec.measurementRecovery || spec.bodyPaletteRepair));
	if (
		!unchanged() ||
		!current ||
		!eligible ||
		review(current) !== review(reviewed) ||
		(spec.bodyPaletteRepair && !current.palette)
	) {
		throw new LocalizedError(
			'The pending joint checks changed. Review their cost again.',
			'state.thePendingJointChecksChangedReviewTheir'
		);
	}
	const next = {
		...$state.snapshot(spec),
		measurementRecovery: {
			id: crypto.randomUUID(),
			recordIds: [...current.recordIds],
			checkHashes: [...current.checkHashes],
			rigVersion: current.rigVersion
		}
	};
	if (next.bodyPaletteRepair)
		next.bodyPaletteRepair = {
			...next.bodyPaletteRepair,
			checkHashes: [...current.checkHashes],
			rigVersion: current.rigVersion
		};
	await startMove(projectId, next);
}
/** Explicit consent to save the reviewed cached body frames with their warnings. Body only and cache-only: no PixelLab
 * request, no equipment poses; those stay separate priced choices afterward. */
export async function keepMoveBody(projectId: string, spec: MoveSpec, reviewed: KeepBodyPlan) {
	const pending = JSON.stringify($state.snapshot(spec));
	const unchanged = () =>
		!hmrReloading &&
		!moveRunning &&
		moving.projectId === projectId &&
		!!moving.error &&
		!moving.done &&
		!spec.bodyPaletteRepair &&
		JSON.stringify($state.snapshot(moving.spec)) === pending;
	if (!unchanged())
		throw new LocalizedError(
			'This operation changed. Review the body frames again.',
			'state.thisOperationChangedReviewTheBodyFrames'
		);
	const current = (await (await createFlow()).reviewMoveRecovery(projectId, spec)).keep;
	if (
		!unchanged() ||
		!current ||
		current.qaHash !== reviewed.qaHash ||
		current.rigVersion !== reviewed.rigVersion
	)
		throw new LocalizedError(
			'These body frames or their quality checks changed. Review them again. Nothing was saved.',
			'state.theseBodyFramesOrTheirQualityChecks'
		);
	await startMove(projectId, {
		...$state.snapshot(spec),
		items: [],
		reviewBeforePublish: undefined,
		reuseItemFrames: undefined,
		itemReview: undefined,
		measurementRecovery: {
			id: crypto.randomUUID(),
			recordIds: [],
			checkHashes: [],
			rigVersion: current.rigVersion,
			keep: { qaHash: current.qaHash }
		}
	});
}
/** Explicit bounded color cleanup on the reviewed cached body; all paid measurements still use the changed PNGs. */
export async function matchMoveBodyColors(
	projectId: string,
	spec: MoveSpec,
	reviewed: BodyPaletteRepairPlan
) {
	const pending = JSON.stringify($state.snapshot(spec));
	const unchanged = () =>
		!hmrReloading &&
		!moveRunning &&
		moving.projectId === projectId &&
		!!moving.error &&
		!moving.done &&
		!spec.bodyPaletteRepair &&
		JSON.stringify($state.snapshot(moving.spec)) === pending;
	if (!unchanged())
		throw new LocalizedError(
			'This operation changed. Review the body colors again.',
			'state.thisOperationChangedReviewTheBodyColors'
		);
	const current = await (
		await createFlow()
	).bodyPaletteRepairPlan(projectId, { ...spec, measurementRecovery: undefined });
	const review = (plan: typeof current) =>
		JSON.stringify({
			...plan,
			directions: [...plan.directions].sort(),
			rawHashes: [...plan.rawHashes].sort(),
			checkHashes: [...plan.checkHashes].sort(),
			recordIds: [...plan.recordIds].sort()
		});
	if (
		!unchanged() ||
		current.changedPixels <= 0 ||
		current.changedFrames <= 0 ||
		!current.directions.length ||
		review(current) !== review(reviewed)
	) {
		throw new LocalizedError(
			'The body color corrections changed. Review their cost again.',
			'state.theBodyColorCorrectionsChangedReviewTheir'
		);
	}
	await startMove(projectId, {
		...$state.snapshot(spec),
		measurementRecovery: undefined,
		bodyPaletteRepair: {
			id: crypto.randomUUID(),
			version: 'near-rest-v1',
			checkHashes: [...current.checkHashes],
			rigVersion: current.rigVersion
		}
	});
}
let moveResumed = false;
export async function resumeMove() {
	if (hmrReloading || moveResumed || queue.role === 'follower') return;
	moveResumed = true;
	// An unreadable record is not an empty one: fail startup or takeover visibly instead of resuming as if no move were saved,
	// and stay unresumed so a later resume reads it again.
	const r = await db
		.get<
			FlowDraft<MoveSpec> & {
				projectId: string;
				queued?: QueuedMove[];
				repairReview?: RepairReview;
			}
		>('projects', MOVE_KEY)
		.catch((error: unknown) => {
			moveResumed = false;
			throw error;
		});
	if (!r?.spec || (moving.spec && !moving.done)) return;
	// A move whose character is gone can never be opened to retry or dismiss. Moves queued behind it wait for a decision.
	if (
		r.projectId?.startsWith('rig-') &&
		!r.queued?.length &&
		!(await db.get('projects', r.projectId).catch(() => true))
	) {
		try {
			await db.del('projects', MOVE_KEY);
			console.warn('Removed saved move with no character to resume.');
			return;
		} catch (error) {
			console.error('Could not remove a saved move with no character', error); // kept and shown as stopped
		}
	}
	const { queued, ...record } = r;
	moving.queued = queued ?? [];
	moveRecord = record; // a halted move keeps its stored record while moves are queued behind it
	let applied = false,
		repairError: string | LocalizedError = '';
	if (r.repairReview) {
		try {
			applied = await (await itemRun()).repairAlreadyApplied(r.projectId, r.repairReview);
		} catch (error) {
			repairError = error instanceof LocalizedError ? error : errorText(error);
		}
	}
	if (halted(r))
		Object.assign(moving, {
			spec: r.spec,
			projectId: r.projectId,
			progress: r.progress ?? null,
			error: r.repairReview && !r.error ? repairError : restoredFlowError(r, STOPPED),
			repairReview: r.repairReview ?? null,
			repairApplied: applied,
			done: false,
			warnings: []
		});
	else void startMove(r.projectId, r.spec, false);
}

/** `keepFailed`: an item sheet's review also keeps the views that failed a check (unselected by default). */
export async function resolveRepairReview(useRepair: boolean, keepFailed = false) {
	if (moveRunning || !moving.repairReview || queue.role === 'follower') return;
	const projectId = moving.projectId,
		review = $state.snapshot(moving.repairReview),
		record = moveRecord;
	moveRunning = moving.resolvingRepair = true;
	moving.error = '';
	try {
		const run = await itemRun();
		if (useRepair) {
			if (!moving.repairApplied) await run.applyRepairReview(projectId, review, keepFailed);
			moving.repairApplied = true;
		} else if (await run.repairAlreadyApplied(projectId, review)) {
			moving.repairApplied = true;
			throw new LocalizedError(
				'The repair is already saved. Finish the review to continue.',
				'repairReview.alreadySaved'
			);
		}
		try {
			await storeMove(null);
		} catch (error) {
			moveRecord = record;
			throw error;
		}
		moving.repairReview = null;
		moving.repairApplied = false;
		moving.done = true;
		if (useRepair && viewing(projectId)) await openProject(projectId, { quiet: true });
		else if (useRepair) await syncStoredProject(projectId);
		toast(useRepair ? message('repairReview.saved') : message('repairReview.kept'));
	} catch (error) {
		moving.error = error instanceof LocalizedError ? error : errorText(error);
		toast(errorMessage(error), { tone: 'danger', error });
	} finally {
		moveRunning = moving.resolvingRepair = false;
	}
	if (moving.done && moving.queued.length) {
		await startQueuedMove();
	}
}
/** Drops the failed or finished move and the moves queued for the same character; other characters' queued moves go on. */
export async function dismissMove() {
	if (moveRunning) return;
	moveRevision++;
	const others = moving.queued.filter((q) => q.projectId !== moving.projectId);
	Object.assign(moving, {
		spec: null,
		projectId: '',
		progress: null,
		error: '',
		done: false,
		warnings: [],
		repairReview: null,
		repairApplied: false,
		queued: others
	});
	await storeMove(null);
	// others stay queued until one starts: a move started meanwhile (e.g. an item repair) takes them up when it finishes
	if (moveRunning || moving.spec || !moving.queued.length) return;
	await startQueuedMove();
}

// ---------- imported character setup ----------
export const settingUp = $state({
	spec: null as SetupSpec | null,
	progress: null as Progress | null,
	error: '' as string | LocalizedError,
	done: false,
	warnings: [] as string[]
});
const SETUP_KEY = 'studio-setup';
let setupRunning = $state(false),
	setupResumed = false,
	setupRecovering = false,
	setupRevision = 0;
/** A setup (perhaps one resumed from a closed tab) runs here, so another cannot start yet. */
export const setupBusy = () => setupRunning;
export async function startSetup(spec: SetupSpec, announce = true) {
	if (hmrReloading) return;
	if (setupRunning) {
		toast(message('state.anotherRigSetupIsStillRunningSo'), {
			tone: 'warning',
			report: false,
			action: () => openFlow('setup', settingUp.spec?.projectId ?? '')
		});
		return;
	}
	spec = withActivityScope(spec, 'setup');
	setupRunning = true;
	const revision = ++setupRevision,
		current = () => revision === setupRevision && setupRunning;
	let failed = false;
	Object.assign(settingUp, { spec, progress: null, error: '', done: false, warnings: [] });
	try {
		await flushSave();
		await db.put('projects', SETUP_KEY, {
			id: SETUP_KEY,
			spec,
			status: 'running',
			requestText: REQUEST_TEXT
		});
		await (
			await setupFlow()
		).setupCharacter(spec, (p) => {
			if (current() && !failed) settingUp.progress = p;
		});
		if (!current()) return;
		settingUp.done = true;
		const rec = await db.get<{ rigQa?: { warnings?: string[] } }>('projects', spec.projectId);
		if (!current()) return;
		settingUp.warnings = rec?.rigQa?.warnings ?? [];
		await db.del('projects', SETUP_KEY);
		if (!current()) return;
		if (viewing(spec.projectId)) await openProject(spec.projectId);
		else await syncStoredProject(spec.projectId);
		toast(message('state.characterReadyForSkeletonPosedItemsAnd'));
		if (announce && current()) playAudioCue('success');
	} catch (e) {
		if (current()) {
			failed = true;
			settingUp.error = e instanceof LocalizedError ? e : errorText(e);
			const error = await persistFlowFailure(
				SETUP_KEY,
				{ spec, progress: $state.snapshot(settingUp.progress) },
				e
			);
			if (current()) {
				settingUp.error = error;
				if (announce && !(e instanceof LoadError) && !isGenerationCancellation(e))
					playAudioCue('failure');
			}
			if (current() && ui.sheet !== 'setup')
				toast(message('state.setupFailedOpen'), {
					tone: 'danger',
					report: false,
					duration: 8000,
					action: () => openFlow('setup', spec.projectId)
				});
		}
	} finally {
		if (revision === setupRevision) setupRunning = false;
	}
}
export async function resumeSetup() {
	if (hmrReloading || setupResumed || queue.role === 'follower') return;
	setupResumed = true;
	const revision = setupRevision;
	const current = () => revision === setupRevision && queue.role !== 'follower';
	setupRecovering = true;
	try {
		// As in resumeMove: a failed read fails startup or takeover instead of reading as no saved setup.
		const rec = await db
			.get<FlowDraft<SetupSpec>>('projects', SETUP_KEY)
			.catch((error: unknown) => {
				setupResumed = false;
				throw error;
			});
		if (!rec?.spec || !current() || (settingUp.spec && !settingUp.done)) return;
		const { projectId } = rec.spec;
		let needsReview = halted(rec);
		try {
			const missing =
				typeof projectId !== 'string' ||
				!projectId ||
				(projectId.startsWith('rig-') && !(await db.get<StoredProject>('projects', projectId)));
			if (!current()) return;
			if (missing) {
				await db.del('projects', SETUP_KEY);
				console.warn('Removed saved setup with no character to resume.');
				return;
			}
		} catch (error) {
			console.error('Could not check or remove stale character setup', error);
			needsReview = true;
		}
		if (!current()) return;
		if (needsReview)
			Object.assign(settingUp, {
				spec: rec.spec,
				progress: rec.progress ?? null,
				error: restoredFlowError(rec, SETUP_STOPPED),
				done: false,
				warnings: []
			});
		else void startSetup(rec.spec, false);
	} finally {
		setupRecovering = false;
	}
}
export async function dismissSetup() {
	if (setupRunning || (!settingUp.done && queue.role === 'follower')) return false;
	setupRevision++;
	setupRunning = true;
	try {
		if (queue.role !== 'follower') await db.del('projects', SETUP_KEY);
		Object.assign(settingUp, { spec: null, progress: null, error: '', done: false, warnings: [] });
		return true;
	} catch (error) {
		toast(message('state.couldNotSaveReason', { reason: errorMessage(error) }), {
			error,
			tone: 'danger'
		});
		return false;
	} finally {
		setupRunning = false;
	}
}
